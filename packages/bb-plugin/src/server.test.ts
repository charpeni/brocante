import { afterEach, expect, it, vi } from 'vitest';
import type { BbPluginApi, PluginCliRegistration } from '@get-bb/plugin-sdk';
import plugin from './server';

afterEach(() => vi.unstubAllGlobals());

function registration(token?: string) {
  let cli: PluginCliRegistration | undefined;
  // This adapter-only fixture exercises the real SDK command parser. The plugin
  // uses no storage, events, background services, or filesystem facilities.
  plugin({
    settings: { define: () => ({ get: async () => ({ githubToken: token }) }) },
    cli: {
      register: (value: PluginCliRegistration) => {
        cli = value;
      },
    },
  } as unknown as BbPluginApi);
  return cli!;
}

it('offers help without a configured token and rejects missing credentials', async () => {
  const cli = registration();
  const context = { signal: new AbortController().signal };
  expect((await cli.run(['report', '--help'], context)).exitCode).toBe(0);
  const result = await cli.run(['report', 'team/repo'], context);
  expect(result.exitCode).not.toBe(0);
  expect(result.stderr).toContain('Configure a GitHub token');
});

it('enforces shared rate-limit cooldown without exposing the credential', async () => {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValue(new Response('', { status: 429, headers: { 'retry-after': '120' } }));
  vi.stubGlobal('fetch', fetcher);
  const cli = registration('private-test-secret');
  const context = { signal: new AbortController().signal };
  const first = await cli.run(['report', 'team/repo'], context);
  const second = await cli.run(['report', 'other/repo'], context);
  expect(first.exitCode).not.toBe(0);
  expect(second.stderr).toContain('Retry after');
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(JSON.stringify([first, second])).not.toContain('private-test-secret');
});

it.each(['json', 'markdown'])(
  'returns a bounded %s report with usable partial-report guidance',
  async (format) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            repository: {
              nameWithOwner: 'team/repo',
              url: 'https://github.com/team/repo',
              isPrivate: true,
              pullRequests: {
                totalCount: 61,
                pageInfo: { hasNextPage: true, endCursor: 'next' },
                nodes: [
                  {
                    number: 1,
                    title: 'Review me',
                    body: 'private body',
                    url: 'https://github.com/team/repo/pull/1',
                    createdAt: '2026-10-01',
                    updatedAt: '2026-10-01',
                    isDraft: false,
                    state: 'OPEN',
                    reviewDecision: null,
                    author: { login: 'mina' },
                    labels: { nodes: [] },
                    reviewRequests: { totalCount: 0, nodes: [] },
                  },
                ],
              },
            },
          },
        }),
      ),
    );
    vi.stubGlobal('fetch', fetcher);
    const result = await registration('test').run(['report', 'team/repo', '--format', format], {
      signal: new AbortController().signal,
    });
    expect(result.exitCode).toBe(0);
    if (format === 'json') {
      expect(JSON.parse(result.stdout!)).toMatchObject({
        complete: false,
        pullRequests: [{ body: '', bodyTruncated: true }],
      });
    } else {
      expect(result.stdout).toContain('Narrow --search, or use the standalone brocante CLI');
      expect(result.stdout).not.toContain('--max-pages');
    }
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(result.stdout).not.toContain('private body');
  },
);
