import { afterEach, expect, it, vi } from 'vitest';
import { loadMarket, github, marketQuery, marketSearchQuery } from './github';

function repository() {
  return {
    nameWithOwner: 'team/private',
    url: 'https://github.com/team/private',
    isPrivate: true,
    pullRequests: {
      totalCount: 121,
      pageInfo: { hasNextPage: true, endCursor: 'next-page' },
      nodes: [
        {
          number: 1,
          title: 'Private change',
          url: 'https://github.com/team/private/pull/1',
          body: '## Summary\n\nA **formatted** description.',
          author: { login: 'mina' },
          createdAt: '2026-01-01',
          updatedAt: '2026-01-02',
          state: 'OPEN',
          isDraft: false,
          reviewDecision: 'APPROVED',
          labels: { nodes: [] },
          reviewRequests: { totalCount: 14, nodes: [{ requestedReviewer: null }] },
        },
      ],
    },
  };
}
function response(body: unknown, init?: ResponseInit) {
  return vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(body), init));
}
afterEach(() => vi.useRealTimers());
it('loads repository-wide historical counts independently of PR searches', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-05T12:00:00Z'));
  const counts = {
    activityOpened: { issueCount: 42 },
    activityMerged: { issueCount: 36 },
    activityPreviousOpened: { issueCount: 35 },
    activityPreviousMerged: { issueCount: 40 },
  };
  for (const search of ['', 'label:bug']) {
    const data = search ? searchResult().data : { repository: repository() };
    const fetcher = response({ data: { ...data, ...counts } });
    const result = await loadMarket('token', 'team', 'private', null, fetcher, search);
    expect(result.repositoryStats).toEqual({
      opened: 42,
      merged: 36,
      previousOpened: 35,
      previousMerged: 40,
      since: '2026-09-05T12:00:00Z',
      previousSince: '2026-08-06T12:00:00Z',
      asOf: '2026-10-05T12:00:00Z',
    });
    const variables = JSON.parse(fetcher.mock.calls[0][1]?.body as string).variables;
    expect(variables.opened).toBe(
      'repo:team/private is:pr created:2026-09-05T12:00:00Z..2026-10-05T11:59:59Z',
    );
    expect(variables.previousMerged).toBe(
      'repo:team/private is:pr is:merged merged:2026-08-06T12:00:00Z..2026-09-05T11:59:59Z',
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
  }
});
it('keeps PRs available when an optional historical search fails', async () => {
  const result = await loadMarket(
    'token',
    'team',
    'private',
    null,
    response({
      data: { repository: repository(), activityOpened: null },
      errors: [{ type: 'FORBIDDEN', path: ['activityOpened'] }],
    }),
  );
  expect(result.pullRequests).toHaveLength(1);
  expect(result.repositoryStats).toBeUndefined();
});

it('drops stale closed and null search nodes while preserving the repository boundary', async () => {
  const result = searchResult();
  const open = result.data.search.nodes[0];
  const stale = { ...open, number: 2, state: 'MERGED' };
  const fetcher = response({
    data: { ...result.data, search: { ...result.data.search, nodes: [open, stale, null] } },
  });
  const market = await loadMarket('token', 'team', 'private', null, fetcher, 'bug');
  expect(market.pullRequests.map((pr) => pr.number)).toEqual([1]);
  const escaped = { ...stale, repository: { nameWithOwner: 'other/repo' } };
  await expect(
    loadMarket(
      'token',
      'team',
      'private',
      null,
      response({ data: { ...result.data, search: { ...result.data.search, nodes: [escaped] } } }),
      'bug',
    ),
  ).rejects.toMatchObject({ status: 400 });
});

function searchResult() {
  const repo = repository();
  return {
    data: {
      repository: { nameWithOwner: repo.nameWithOwner, url: repo.url, isPrivate: repo.isPrivate },
      search: {
        issueCount: 1200,
        pageInfo: { hasNextPage: true, endCursor: 'search-page' },
        nodes: repo.pullRequests.nodes.map((node) => ({
          ...node,
          __typename: 'PullRequest',
          repository: { nameWithOwner: repo.nameWithOwner },
        })),
      },
    },
  };
}
it('uses GitHub advanced search and preserves PR review data, totals and pagination', async () => {
  const fetcher = response(searchResult());
  const result = await loadMarket(
    'token',
    'team',
    'private',
    'old-cursor',
    fetcher,
    'label:"help wanted" OR author:@me',
  );
  const request = JSON.parse(fetcher.mock.calls[0][1]?.body as string);
  expect(request.query).toBe(marketSearchQuery);
  expect(request.variables).toMatchObject({
    owner: 'team',
    repo: 'private',
    cursor: 'old-cursor',
    search: '(repo:team/private is:pr is:open) AND (label:"help wanted" OR author:@me)',
  });
  expect(result.total).toBe(1200);
  expect(result.searchLimited).toBe(true);
  expect(result.nextCursor).toBe('search-page');
  expect(result.pullRequests[0].requestedCount).toBe(14);
  expect(result.pullRequests[0].body).toContain('**formatted**');
});
it('does not expose results outside the current repository even if upstream search escapes scope', async () => {
  const result = searchResult();
  result.data.search.nodes[0].repository.nameWithOwner = 'other/repo';
  await expect(
    loadMarket('token', 'team', 'private', null, response(result), 'bug'),
  ).rejects.toMatchObject({ status: 400 });
});
it('tolerates only optional reviewer-identity errors at the search path', async () => {
  const data = searchResult();
  const errors = [
    {
      type: 'FORBIDDEN',
      path: ['search', 'nodes', 0, 'reviewRequests', 'nodes', 0, 'requestedReviewer'],
    },
  ];
  const result = await loadMarket(
    'token',
    'team',
    'private',
    null,
    response({ ...data, errors }),
    'bug',
  );
  expect(result.pullRequests[0].requestedCount).toBe(14);
  await expect(
    loadMarket(
      'token',
      'team',
      'private',
      null,
      response({ ...data, errors: [{ type: 'FORBIDDEN', path: ['search', 'nodes', 0, 'title'] }] }),
      'bug',
    ),
  ).rejects.toMatchObject({ status: 502 });
});
it('reports invalid queries separately from access failures', async () => {
  await expect(
    loadMarket(
      'token',
      'team',
      'private',
      null,
      response({
        errors: [{ type: 'INVALID', path: ['search'], message: 'private upstream detail' }],
      }),
      'bug',
    ),
  ).rejects.toMatchObject({
    status: 400,
    message: 'GitHub could not understand this search. Check the qualifiers and try again.',
  });
  const fetcher = response({});
  await expect(
    loadMarket('token', 'team', 'private', null, fetcher, ') OR repo:other/repo'),
  ).rejects.toMatchObject({ status: 400 });
  expect(fetcher).not.toHaveBeenCalled();
});

it('preserves full outstanding-request count and readable PRs without optional reviewer names', async () => {
  const fetcher = response({
    data: { repository: repository() },
    errors: [
      {
        type: 'FORBIDDEN',
        path: [
          'repository',
          'pullRequests',
          'nodes',
          0,
          'reviewRequests',
          'nodes',
          0,
          'requestedReviewer',
        ],
      },
    ],
  });
  const result = await loadMarket('user-token', 'team', 'private', 'first-cursor', fetcher);
  expect(result.pullRequests[0].requestedCount).toBe(14);
  expect(result.pullRequests[0].requestedReviewers).toEqual(['A reviewer']);
  expect(result.nextCursor).toBe('next-page');
  expect(result.isPrivate).toBe(true);
  expect(result.pullRequests[0].body).toBe('## Summary\n\nA **formatted** description.');
  expect(marketQuery).not.toContain('bodyText');
  expect(fetcher.mock.calls[0][1]?.headers).toMatchObject({ Authorization: 'Bearer user-token' });
  expect(JSON.parse(fetcher.mock.calls[0][1]?.body as string).variables.cursor).toBe(
    'first-cursor',
  );
  expect(marketQuery).not.toContain('... on Team');
});
it.each([
  { type: 'FORBIDDEN', path: ['repository', 'pullRequests', 'nodes', 0, 'reviewRequests'] },
  { type: 'FORBIDDEN', path: ['repository', 'pullRequests', 'nodes', 0, 'title'] },
  {
    type: 'FORBIDDEN',
    path: ['repository', 'pullRequests', 'nodes', 0, 'reviewRequests', 'nodes', 0],
  },
  { type: 'RESOURCE_LIMITS' },
  { message: 'Private internal details' },
])('fails closed on incomplete or unknown GraphQL errors: %j', async (error) => {
  await expect(
    loadMarket(
      'token',
      'o',
      'r',
      null,
      response({ errors: [error], data: { repository: repository() } }),
    ),
  ).rejects.toMatchObject({ status: 502 });
});
it.each(['FORBIDDEN', 'NOT_FOUND'])('recognizes %s at the repository boundary', async (type) => {
  await expect(
    loadMarket('token', 'o', 'r', null, response({ errors: [{ type, path: ['repository'] }] })),
  ).rejects.toMatchObject({ status: 403 });
});
it('returns retry timing for HTTP-200 GraphQL exhaustion', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-04T12:00:00Z'));
  const fetcher = response(
    { errors: [{ type: 'RATE_LIMITED' }] },
    {
      headers: {
        'x-ratelimit-remaining': '0',
        'x-ratelimit-reset': String(Date.now() / 1000 + 180),
      },
    },
  );
  await expect(loadMarket('token', 'o', 'r', null, fetcher)).rejects.toMatchObject({
    status: 429,
    retryAfter: 180,
  });
});
it.each([
  {
    body: {},
    headers: new Headers({ 'retry-after': '120', 'x-ratelimit-remaining': '4990' }),
    delay: 120,
  },
  {
    body: { message: 'You have exceeded a secondary rate limit.' },
    headers: new Headers(),
    delay: 60,
  },
])('recognizes secondary limits without quota exhaustion', async ({ body, headers, delay }) => {
  await expect(
    github('token', '/user', {}, response(body, { status: 403, headers })),
  ).rejects.toMatchObject({ status: 429, retryAfter: delay });
});
it.each([401, 403, 404, 429, 500])('sanitizes GitHub HTTP %s errors', async (status) => {
  const fetcher = response({ message: 'private upstream details' }, { status });
  await expect(github('token', '/user', {}, fetcher)).rejects.not.toThrow(
    'private upstream details',
  );
});

it('loads size metadata in both queries and preserves missing values as unknown', async () => {
  for (const query of [marketQuery, marketSearchQuery]) {
    expect(query).toContain('additions deletions changedFiles');
    expect(query).not.toContain('changedFilesIfAvailable');
  }
  const source = repository();
  Object.assign(source.pullRequests.nodes[0], { additions: 18, deletions: 7, changedFiles: 2 });
  const known = await loadMarket(
    'token',
    'team',
    'private',
    null,
    response({ data: { repository: source } }),
  );
  expect(known.pullRequests[0]).toMatchObject({ additions: 18, deletions: 7, changedFiles: 2 });
  const unknown = await loadMarket(
    'token',
    'team',
    'private',
    null,
    response({ data: { repository: repository() } }),
  );
  expect(unknown.pullRequests[0]).toMatchObject({
    additions: null,
    deletions: null,
    changedFiles: null,
  });
});
