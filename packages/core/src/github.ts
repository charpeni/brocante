import { retryAfterMs } from './retry';
import type { MarketData, PullRequest, ReviewDecision } from './market';
import { githubSearchQuery } from './market-search';

export class GitHubError extends Error {
  constructor(
    message: string,
    public status: number,
    public retryAfter?: number,
  ) {
    super(message);
  }
}

function rateLimited(response: Response) {
  const reset = Number(response.headers.get('x-ratelimit-reset')) * 1000 - Date.now();
  const delay = Math.max(
    retryAfterMs(response.headers.get('retry-after')),
    response.headers.get('x-ratelimit-remaining') === '0' && Number.isFinite(reset) ? reset : 0,
    60_000,
  );
  return new GitHubError(
    'GitHub’s request limit has been reached. Please wait before trying again.',
    429,
    Math.ceil(delay / 1000),
  );
}

export async function github(token: string, path: string, init: RequestInit = {}, fetcher = fetch) {
  let response: Response;

  try {
    response = await fetcher(`https://api.github.com${path}`, {
      ...init,
      headers: {
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'brocante',
        ...init.headers,
      },
      signal: AbortSignal.timeout(20_000),
    });
  } catch (error) {
    if (error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name))
      throw new GitHubError('The GitHub request timed out. Please try again.', 504);
    if (error instanceof TypeError)
      throw new GitHubError('Unable to reach GitHub. Check your network and try again.', 503);
    throw error;
  }

  if (!response.ok) {
    if (response.status === 401)
      throw new GitHubError('Your GitHub session expired. Please sign in again.', 401);
    if (
      response.status === 429 ||
      response.headers.get('x-ratelimit-remaining') === '0' ||
      (response.status === 403 &&
        (response.headers.has('retry-after') ||
          /secondary rate limit|API rate limit exceeded/i.test(await response.clone().text())))
    )
      throw rateLimited(response);
    if (response.status === 403 || response.status === 404)
      throw new GitHubError(
        'This repository is unavailable. Check its name and your GitHub credentials and permissions.',
        403,
      );
    throw new GitHubError(
      'GitHub is temporarily unavailable. Please try again.',
      502,
      Math.ceil(Math.max(60_000, retryAfterMs(response.headers.get('retry-after'))) / 1000),
    );
  }
  return response;
}

const pullRequestFields = `
  number title url body createdAt updatedAt isDraft state reviewDecision
  additions deletions changedFiles
  author { login }
  labels(first: 10) { nodes { name } }
  reviewRequests(first: 10) { totalCount nodes { requestedReviewer { ... on User { login } __typename ... on Mannequin { login } } } }
`;

const activityVariables =
  '$opened: String!, $merged: String!, $previousOpened: String!, $previousMerged: String!';

const activityFields = `
  activityOpened: search(query: $opened, type: ISSUE_ADVANCED, first: 1) { issueCount }
  activityMerged: search(query: $merged, type: ISSUE_ADVANCED, first: 1) { issueCount }
  activityPreviousOpened: search(query: $previousOpened, type: ISSUE_ADVANCED, first: 1) { issueCount }
  activityPreviousMerged: search(query: $previousMerged, type: ISSUE_ADVANCED, first: 1) { issueCount }
`;

const activityRoots = [
  'activityOpened',
  'activityMerged',
  'activityPreviousOpened',
  'activityPreviousMerged',
];

export const marketQuery = `query Market($owner: String!, $repo: String!, $cursor: String, ${activityVariables}) {
  repository(owner: $owner, name: $repo) {
    nameWithOwner url isPrivate visibility
    pullRequests(first: 60, after: $cursor, states: OPEN, orderBy: {field: CREATED_AT, direction: ASC}) {
      totalCount pageInfo { hasNextPage endCursor }
      nodes {
        ${pullRequestFields}
      }
    }
  }
  ${activityFields}
}`;

export const marketSearchQuery = `query MarketSearch($owner: String!, $repo: String!, $cursor: String, $search: String!, ${activityVariables}) {
  repository(owner: $owner, name: $repo) { nameWithOwner url isPrivate visibility }
  search(query: $search, type: ISSUE_ADVANCED, first: 60, after: $cursor) {
    issueCount pageInfo { hasNextPage endCursor }
    nodes { __typename ... on PullRequest {
      ${pullRequestFields}
      repository { nameWithOwner }
    } }
  }
  ${activityFields}
}`;

interface Node {
  __typename?: string;
  repository?: { nameWithOwner: string };
  number: number;
  title: string;
  url: string;
  body: string;
  additions?: number | null;
  deletions?: number | null;
  changedFiles?: number | null;
  createdAt: string;
  updatedAt: string;
  isDraft: boolean;
  state: PullRequest['state'];
  reviewDecision: ReviewDecision;
  author: { login: string } | null;
  labels: { nodes: { name: string }[] };
  reviewRequests: {
    totalCount: number;
    nodes: { requestedReviewer: { login?: string; __typename?: string } | null }[];
  };
}

interface Connection {
  pageInfo: { hasNextPage: boolean; endCursor: string | null };
  nodes: (Node | null)[];
}

interface GraphResponse {
  errors?: { type?: string; message?: string; path?: (string | number)[] }[];
  data?: {
    repository: {
      nameWithOwner: string;
      url: string;
      isPrivate: boolean;
      visibility?: MarketData['visibility'];
      pullRequests?: Connection & { totalCount: number };
    } | null;
    activityOpened?: { issueCount: number } | null;
    activityMerged?: { issueCount: number } | null;
    activityPreviousOpened?: { issueCount: number } | null;
    activityPreviousMerged?: { issueCount: number } | null;
    search?: Connection & { issueCount: number };
  };
}

export async function loadMarket(
  token: string,
  owner: string,
  repo: string,
  cursor: string | null,
  fetcher = fetch,
  search = '',
): Promise<MarketData> {
  const timestamp = (time: number) => new Date(time).toISOString().replace('.000Z', 'Z');
  const asOf = timestamp(Math.floor(Date.now() / 1000) * 1000);
  const since = timestamp(Date.parse(asOf) - 30 * 86_400_000);
  const previousSince = timestamp(Date.parse(asOf) - 60 * 86_400_000);
  const recentEnd = timestamp(Date.parse(asOf) - 1000);
  const previousEnd = timestamp(Date.parse(since) - 1000);
  const scope = `repo:${owner}/${repo} is:pr`;
  const activity = {
    opened: `${scope} created:${since}..${recentEnd}`,
    merged: `${scope} is:merged merged:${since}..${recentEnd}`,
    previousOpened: `${scope} created:${previousSince}..${previousEnd}`,
    previousMerged: `${scope} is:merged merged:${previousSince}..${previousEnd}`,
  };
  let query: string | undefined;
  if (search.trim()) {
    try {
      query = githubSearchQuery(`${owner}/${repo}`, search);
    } catch (error) {
      throw new GitHubError((error as Error).message, 400);
    }
  }
  const response = await github(
    token,
    '/graphql',
    {
      method: 'POST',
      body: JSON.stringify({
        query: query ? marketSearchQuery : marketQuery,
        variables: { owner, repo, cursor, ...activity, ...(query ? { search: query } : {}) },
      }),
    },
    fetcher,
  );
  const result: GraphResponse = await response.json().catch(() => {
    throw new GitHubError('GitHub returned an unreadable response. Please try again.', 502);
  });
  if (!result || typeof result !== 'object' || Array.isArray(result))
    throw new GitHubError('GitHub returned an unreadable response. Please try again.', 502);

  if (result.errors?.some((error) => error.type === 'RATE_LIMITED')) throw rateLimited(response);
  const connection = query ? result.data?.search : result.data?.repository?.pullRequests;

  // Reviewer identities are optional. Permission errors at this exact leaf must
  // not hide otherwise readable PRs; the full outstanding count is still authoritative.
  const errors = result.errors?.filter((error) => {
    const originalPath = error.path;
    // Historical counts are optional; an isolated failure must not hide the PR list.
    if (originalPath && activityRoots.includes(String(originalPath[0]))) return false;
    const validRoot = query
      ? originalPath?.[0] === 'search'
      : originalPath?.[0] === 'repository' && originalPath[1] === 'pullRequests';
    const path = originalPath?.slice(query ? 1 : 2);
    return !(
      error.type === 'FORBIDDEN' &&
      path &&
      validRoot &&
      (path.length === 6 ||
        (path.length === 7 && ['login', '__typename'].includes(String(path[6])))) &&
      path[0] === 'nodes' &&
      Number.isInteger(path[1]) &&
      Number(path[1]) >= 0 &&
      path[2] === 'reviewRequests' &&
      path[3] === 'nodes' &&
      Number.isInteger(path[4]) &&
      Number(path[4]) >= 0 &&
      path[5] === 'requestedReviewer' &&
      !!connection?.nodes?.[Number(path[1])]?.reviewRequests?.nodes?.[Number(path[4])]
    );
  });

  if (errors?.length) {
    if (
      query &&
      errors.some(
        (error) =>
          ['INVALID', 'UNPROCESSABLE', 'UNPROCESSABLE_ENTITY'].includes(error.type ?? '') ||
          (error.path?.[0] === 'search' &&
            /invalid.*query|parse|syntax/i.test(error.message ?? '')),
      )
    )
      throw new GitHubError(
        'GitHub could not understand this search. Check the qualifiers and try again.',
        400,
      );
    const accessFailure = errors.every(
      (error) =>
        ['FORBIDDEN', 'NOT_FOUND'].includes(error.type ?? '') &&
        error.path?.length === 1 &&
        error.path[0] === 'repository',
    );
    throw new GitHubError(
      accessFailure
        ? 'Unable to read this repository. Check its name and your GitHub credentials and permissions.'
        : 'GitHub could not return complete pull-request data. Please try again.',
      accessFailure ? 403 : 502,
      accessFailure ? undefined : 60,
    );
  }

  if (!result.data?.repository)
    throw new GitHubError(
      'Unable to read this repository. Check its name and your GitHub credentials and permissions.',
      403,
    );

  const source = result.data.repository;
  if (!connection)
    throw new GitHubError(
      'GitHub could not return complete pull-request data. Please try again.',
      502,
      60,
    );

  if (
    query &&
    connection.nodes.some(
      (pr) =>
        pr &&
        (pr.__typename !== 'PullRequest' ||
          pr.repository?.nameWithOwner.toLowerCase() !== source.nameWithOwner.toLowerCase()),
    )
  )
    throw new GitHubError(
      'Search only open pull requests in this repository. Remove conflicting repository or state qualifiers.',
      400,
    );

  return {
    repository: source.nameWithOwner,
    url: source.url,
    isPrivate: source.isPrivate,
    visibility: source.visibility,
    repositoryStats:
      !result.errors?.some((error) => activityRoots.includes(String(error.path?.[0]))) &&
      result.data.activityOpened &&
      result.data.activityMerged &&
      result.data.activityPreviousOpened &&
      result.data.activityPreviousMerged
        ? {
            opened: result.data.activityOpened.issueCount,
            merged: result.data.activityMerged.issueCount,
            previousOpened: result.data.activityPreviousOpened.issueCount,
            previousMerged: result.data.activityPreviousMerged.issueCount,
            since,
            previousSince,
            asOf,
          }
        : undefined,
    total: query ? result.data.search!.issueCount : source.pullRequests!.totalCount,
    searchLimited: query ? result.data.search!.issueCount > 1000 : false,
    nextCursor: connection.pageInfo.hasNextPage ? connection.pageInfo.endCursor : null,
    fetchedAt: new Date().toISOString(),
    pullRequests: connection.nodes
      .filter((pr): pr is Node => !!pr && pr.state === 'OPEN')
      .map((pr) => ({
        number: pr.number,
        title: pr.title,
        url: pr.url,
        body: pr.body.slice(0, 6000),
        bodyTruncated: pr.body.length > 6000,
        additions: pr.additions ?? null,
        deletions: pr.deletions ?? null,
        changedFiles: pr.changedFiles ?? null,
        author: pr.author?.login ?? 'deleted-user',
        createdAt: pr.createdAt,
        updatedAt: pr.updatedAt,
        isDraft: pr.isDraft,
        state: pr.state,
        reviewDecision: pr.reviewDecision,
        requestedCount: pr.reviewRequests.totalCount,
        requestedReviewers: pr.reviewRequests.nodes.map(
          ({ requestedReviewer: r }) =>
            r?.login ?? (r?.__typename === 'Team' ? 'A team' : 'A reviewer'),
        ),
        labels: pr.labels.nodes.map((label) => label.name),
      })),
  };
}
