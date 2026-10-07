import { GitHubError, loadMarket } from './github';
import { parseRepository, shopState, stateLabels, type MarketData } from './market';

export interface Report extends Omit<MarketData, 'nextCursor'> {
  schemaVersion: 1;
  search: string;
  pagesFetched: number;
  complete: boolean;
  demo?: true;
}
export type ReportFormat = 'html' | 'markdown' | 'json';
export interface ReportOptions {
  repository: string;
  token: string;
  search?: string;
  maxPages?: number;
  fetcher?: typeof fetch;
}

/** Fetch sequentially, stop on the first error, and never emit a partial success. */
export async function generateReport(options: ReportOptions): Promise<Report> {
  const repository = parseRepository(options.repository);
  if (!repository) throw new Error('Use a repository in owner/name format.');
  if (!options.token.trim()) throw new Error('A GitHub token is required.');
  const maxPages = options.maxPages ?? 10;
  if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 100)
    throw new Error('maxPages must be an integer from 1 to 100.');
  const search = options.search?.trim() ?? '';
  const requests = new Map<number, MarketData['pullRequests'][number]>();
  const cursors = new Set<string>();
  let cursor: string | null = null;
  let snapshot: MarketData | undefined;
  let pagesFetched = 0;
  do {
    const page = await loadMarket(
      options.token,
      repository.owner,
      repository.repo,
      cursor,
      options.fetcher,
      search,
    );
    // Never combine data from different repositories or visibility boundaries.
    if (
      snapshot &&
      (page.repository !== snapshot.repository || page.isPrivate !== snapshot.isPrivate)
    )
      throw new GitHubError('Repository access changed during the report. Please retry.', 403);
    snapshot ??= page;
    for (const pr of page.pullRequests) requests.set(pr.number, pr);
    pagesFetched++;
    cursor = page.nextCursor;
    if (cursor && cursors.has(cursor))
      throw new GitHubError('GitHub repeated a page cursor. Please retry.', 502, 60);
    if (cursor) cursors.add(cursor);
  } while (cursor && pagesFetched < maxPages);
  return reportFromSnapshot(
    { ...snapshot!, pullRequests: [...requests.values()], nextCursor: cursor },
    search,
    pagesFetched,
  );
}

export function reportFromSnapshot(data: MarketData, search = '', pagesFetched = 1): Report {
  const { nextCursor, ...snapshot } = data;
  return {
    ...snapshot,
    searchLimited: data.searchLimited ?? false,
    pullRequests: data.pullRequests.map((pr) => ({
      ...pr,
      bodyTruncated: pr.bodyTruncated ?? false,
    })),
    schemaVersion: 1,
    search,
    pagesFetched,
    complete: nextCursor === null && !data.searchLimited,
  };
}

const escapeHtml = (value: string | number) =>
  String(value).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
const escapeMarkdown = (value: string | number) =>
  String(value)
    .replace(/[\r\n\t]/g, ' ')
    .replace(/[\\`*_{}[\]()#+!|<>~]/g, '\\$&');
const status = (pr: MarketData['pullRequests'][number]) => stateLabels[shopState(pr) ?? 'ready'];
const githubUrl = (report: Report, number?: number) => {
  const repository = parseRepository(report.repository);
  if (!repository) throw new Error('Invalid report repository.');
  return `https://github.com/${repository.owner}/${repository.repo}${number === undefined ? '' : `/pull/${Number(number)}`}`;
};

export function renderReport(
  report: Report,
  format: ReportFormat,
  options: { partialHint?: string } = {},
): string {
  if (format === 'json') return JSON.stringify(report, null, 2) + '\n';
  const count = `${report.pullRequests.length} of ${report.total} matching open pull requests`;
  const coverage = report.complete
    ? 'All available pages fetched.'
    : `Partial report: more results may be available. ${options.partialHint ?? 'Increase --max-pages or narrow --search.'}`;
  const stats = report.repositoryStats;
  const history = stats
    ? `Last 30 days: ${stats.opened} opened, ${stats.merged} merged. Previous 30 days: ${stats.previousOpened} opened, ${stats.previousMerged} merged.`
    : 'Historical counts unavailable.';
  const footer = report.demo
    ? 'Fictional demo for exploring Brocante. No live GitHub data.'
    : 'Snapshot of GitHub data; counts can lag and requests can change during pagination.';
  if (format === 'markdown')
    return [
      `# Brocante — ${escapeMarkdown(report.repository)}`,
      '',
      ...(report.demo ? ['Fictional demo. No live GitHub data.', ''] : []),
      `${count}. ${coverage}`,
      '',
      `Fetched: ${escapeMarkdown(report.fetchedAt)}${report.isPrivate ? ' · Private repository' : ''}`,
      ...(report.search ? ['', `Search: ${escapeMarkdown(report.search)}`] : []),
      '',
      history,
      '',
      '| Pull request | Author | Review state | Changes |',
      '| --- | --- | --- | --- |',
      ...report.pullRequests.map(
        (pr) =>
          `| ${report.demo ? `#${pr.number} ${escapeMarkdown(pr.title)}` : `[#${pr.number} ${escapeMarkdown(pr.title)}](${githubUrl(report, pr.number)})`} | ${escapeMarkdown(pr.author)} | ${status(pr)} | ${pr.additions == null || pr.deletions == null ? 'Unknown' : `+${pr.additions} / −${pr.deletions}`} |`,
      ),
      '',
      footer,
      '',
    ].join('\n');
  if (format !== 'html') throw new Error('Choose html, markdown, or json.');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<title>Brocante — ${escapeHtml(report.repository)}</title>
<style>body{font:16px/1.6 system-ui,sans-serif;color:#264b3d;background:#f6f1e6;margin:auto;padding:32px;max-width:1100px}h1{font:2.2em Georgia,serif}a{color:inherit}header,p{max-width:75ch}.table{overflow:auto}table{width:100%;border-collapse:collapse;background:#fff9}th,td{text-align:left;vertical-align:top;padding:12px;border-bottom:1px solid #264b3d30}th{white-space:nowrap}.note{border-left:3px solid #b64e36;padding-left:12px}footer{margin-top:32px;font-size:.85em}@media(max-width:600px){body{padding:16px}}</style></head>
<body><header><p>Brocante · A marketplace for pull requests</p>${report.demo ? '<p class="note">Fictional demo. No live GitHub data.</p>' : ''}<h1>${escapeHtml(report.repository)}</h1>
<p>${escapeHtml(count)} · ${report.isPrivate ? 'Private repository' : 'Public repository'}</p>
<p>Fetched ${escapeHtml(report.fetchedAt)}</p>${report.search ? `<p>Search: ${escapeHtml(report.search)}</p>` : ''}
<p class="note">${escapeHtml(coverage)}</p><p>${escapeHtml(history)}</p></header>
<main class="table"><table><caption>Open pull requests</caption><thead><tr><th>Pull request</th><th>Author</th><th>Review state</th><th>Changes</th></tr></thead><tbody>
${report.pullRequests.map((pr) => `<tr><td>${report.demo ? `#${pr.number} ${escapeHtml(pr.title)}` : `<a href="${escapeHtml(githubUrl(report, pr.number))}" rel="noreferrer">#${pr.number} ${escapeHtml(pr.title)}</a>`}</td><td>${escapeHtml(pr.author)}</td><td>${escapeHtml(status(pr))}</td><td>${pr.additions == null || pr.deletions == null ? 'Unknown' : `+${pr.additions} / −${pr.deletions}`}</td></tr>`).join('\n')}
</tbody></table></main><footer>${escapeHtml(footer)}${report.demo ? '' : ` <a href="${escapeHtml(githubUrl(report))}" rel="noreferrer">View repository on GitHub</a>`}</footer></body></html>\n`;
}
