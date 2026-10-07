import { describe, expect, it, vi } from 'vitest';
import { generateReport, renderReport, reportFromSnapshot } from './report';
import { demoMarket } from './demo';

function page(numbers: number[], next: string | null) {
  return new Response(
    JSON.stringify({
      data: {
        repository: {
          nameWithOwner: 'team/repo',
          url: 'https://github.com/team/repo',
          isPrivate: false,
          visibility: 'PUBLIC',
          pullRequests: {
            totalCount: 3,
            pageInfo: { hasNextPage: next !== null, endCursor: next },
            nodes: numbers.map((number) => ({
              number,
              title: `PR ${number}`,
              url: `https://github.com/team/repo/pull/${number}`,
              body: '',
              createdAt: '2026-10-01',
              updatedAt: '2026-10-01',
              isDraft: false,
              state: 'OPEN',
              reviewDecision: null,
              author: { login: 'mina' },
              labels: { nodes: [] },
              reviewRequests: { totalCount: 0, nodes: [] },
            })),
          },
        },
      },
    }),
  );
}
describe('local reports', () => {
  it('walks cursors and deduplicates PRs moving between pages', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(page([1, 2], 'next'))
      .mockResolvedValueOnce(page([2, 3], null));
    const report = await generateReport({ repository: 'team/repo', token: 'test-secret', fetcher });
    expect(report.pullRequests.map((pr) => pr.number)).toEqual([1, 2, 3]);
    expect(report).toMatchObject({ complete: true, pagesFetched: 2, schemaVersion: 1 });
    expect(JSON.parse(fetcher.mock.calls[1][1]!.body as string).variables.cursor).toBe('next');
    expect(renderReport(report, 'json')).not.toContain('test-secret');
  });
  it('marks capped results as partial', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(page([1], 'next'));
    const report = await generateReport({
      repository: 'team/repo',
      token: 'test',
      maxPages: 1,
      fetcher,
    });
    expect(report.complete).toBe(false);
    expect(renderReport(report, 'html')).toContain('Partial report');
    expect(renderReport(report, 'markdown')).toContain('--max-pages');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('stops on rate limits instead of returning partial success or retrying', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(page([1], 'next'))
      .mockResolvedValueOnce(new Response('', { status: 429, headers: { 'retry-after': '120' } }));
    await expect(
      generateReport({ repository: 'team/repo', token: 'test', fetcher }),
    ).rejects.toMatchObject({ status: 429, retryAfter: 120 });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('rejects repeated cursors', async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => page([1], 'same'));
    await expect(
      generateReport({ repository: 'team/repo', token: 'test', fetcher }),
    ).rejects.toThrow('repeated a page cursor');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('escapes GitHub content and constructs trusted links without loading remote content', () => {
    const report = reportFromSnapshot(demoMarket());
    report.pullRequests[0].title =
      '<script>alert(1)</script> [escape](javascript:alert(1)) | forged';
    report.pullRequests[0].url = 'javascript:alert(1)';
    report.search = '"><img src=x onerror=alert(1)>';
    const html = renderReport(report, 'html');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('href="javascript:');
    expect(html).toContain('&lt;script&gt;');
    expect(renderReport(report, 'markdown')).toContain('\\| forged');
    expect(html).toContain("default-src 'none'");
  });
  it('labels fictional reports and omits live repository links', () => {
    const report = { ...reportFromSnapshot(demoMarket()), demo: true as const };
    const html = renderReport(report, 'html');
    const markdown = renderReport(report, 'markdown');
    expect(html).toContain('Fictional demo');
    expect(markdown).toContain('Fictional demo');
    expect(html).not.toContain('href=');
    expect(markdown).not.toContain('https://github.com/');
    expect(markdown).toContain(report.fetchedAt);
  });
});
