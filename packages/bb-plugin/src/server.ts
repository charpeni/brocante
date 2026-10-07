import { cliCommand, defineCli, PluginCliError, type BbPluginApi } from '@get-bb/plugin-sdk';
import { generateReport, renderReport, GitHubError } from '../../core/src/index';
import { demoMarket } from '../../core/src/demo';
import { reportFromSnapshot } from '../../core/src/report';
import { renderSnapshot } from '../../snapshot/src/index';
import { randomUUID } from 'node:crypto';

export default function plugin(bb: BbPluginApi) {
  const settings = bb.settings.define({
    githubToken: { type: 'string', label: 'GitHub read-only token', secret: true },
  });
  let retryAt = 0;
  const snapshots = () => {
    const db = bb.storage.database();
    bb.storage.migrate(db, [
      'CREATE TABLE snapshots (id TEXT PRIMARY KEY, repository TEXT NOT NULL, html TEXT NOT NULL, created_at INTEGER NOT NULL)',
    ]);
    return db;
  };
  bb.http.route(
    'GET',
    '/snapshot',
    (context) => {
      const id = context.req.query('id');
      if (!id || !/^[a-f0-9-]{36}$/.test(id))
        return new Response('Snapshot not found.', { status: 404 });
      const snapshot = snapshots()
        .prepare('SELECT repository, html FROM snapshots WHERE id = ?')
        .get(id) as { repository: string; html: string } | undefined;
      if (!snapshot) return new Response('Snapshot not found.', { status: 404 });
      return new Response(snapshot.html, {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Content-Disposition': `attachment; filename="brocante-${snapshot.repository.replace('/', '-')}.html"`,
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
          'Content-Security-Policy': 'sandbox allow-scripts allow-popups',
        },
      });
    },
    { auth: 'local' },
  );
  bb.cli.register(
    defineCli({
      name: 'brocante',
      summary: 'Save portable 3D pull-request markets',
      commands: {
        report: cliCommand({
          summary: 'Save a repository’s 3D market, or export Markdown / JSON',
          positionals: [{ name: 'repository', description: 'GitHub owner/repository' }],
          options: {
            format: {
              type: 'enum',
              values: ['html', 'markdown', 'json'],
              default: 'html',
              description: '3D snapshot or text export format',
            },
            search: {
              type: 'string',
              description: 'Search this repository’s open pull requests (max 256 characters)',
            },
            'max-pages': {
              type: 'string',
              default: '10',
              description: 'Page limit, 60 PRs per page (1-100)',
            },
            demo: { type: 'boolean', description: 'Save a fictional market without credentials' },
          },
          async run(input) {
            const { githubToken } = await settings.get();
            if (!githubToken && !input.options.demo)
              throw new PluginCliError(
                'Configure a GitHub token in the Brocante plugin settings.',
                { code: 'missing_token' },
              );
            if (!input.options.demo && Date.now() < retryAt)
              throw new PluginCliError(
                `GitHub is rate limited. Retry after ${Math.ceil((retryAt - Date.now()) / 1000)} seconds.`,
                { code: 'rate_limited' },
              );
            try {
              const maxPages = Number(input.options['max-pages']);
              if (!/^\d+$/.test(input.options['max-pages']) || maxPages < 1 || maxPages > 100)
                throw new Error('--max-pages must be an integer from 1 to 100.');
              if (input.options.demo && (input.positionals.repository || input.options.search))
                throw new Error('Use --demo without a repository or search.');
              const report = input.options.demo
                ? { ...reportFromSnapshot(demoMarket()), demo: true as const }
                : await generateReport({
                    repository: input.positionals.repository ?? '',
                    token: githubToken!,
                    search: input.options.search,
                    // Bound text output; HTML is stored separately and never sent through CLI stdout.
                    maxPages: input.options.format === 'html' ? maxPages : 1,
                  });
              if (input.options.format === 'html') {
                const id = randomUUID();
                const db = snapshots();
                db.prepare(
                  'INSERT INTO snapshots (id, repository, html, created_at) VALUES (?, ?, ?, ?)',
                ).run(id, report.repository, renderSnapshot(report), Date.now());
                db.prepare(
                  'DELETE FROM snapshots WHERE id NOT IN (SELECT id FROM snapshots ORDER BY created_at DESC, rowid DESC LIMIT 10)',
                ).run();
                const path = `/api/v1/plugins/${encodeURIComponent(bb.pluginId)}/http/snapshot?id=${id}`;
                const url = new URL(
                  path,
                  bb.server.experimental_appUrl ?? bb.server.loopbackBaseUrl,
                ).href;
                return {
                  exitCode: 0,
                  stdout: `Portable 3D market: ${url}\nDownload the HTML and open it in your browser.\n${report.complete ? '' : 'Partial snapshot: increase --max-pages or narrow --search for more results.\n'}`,
                };
              }
              report.pullRequests = report.pullRequests.map((pr) => ({
                ...pr,
                body: '',
                bodyTruncated: pr.bodyTruncated || pr.body.length > 0,
              }));
              return {
                exitCode: 0,
                stdout: renderReport(report, input.options.format, {
                  partialHint:
                    'Narrow --search, or use the standalone brocante CLI for more pages.',
                }),
              };
            } catch (error) {
              if (error instanceof GitHubError && error.status === 429)
                retryAt = Date.now() + (error.retryAfter ?? 60) * 1000;
              const message =
                error instanceof GitHubError
                  ? `${error.status === 401 ? 'GitHub rejected the configured token.' : error.message}${error.retryAfter ? ` Retry after ${error.retryAfter} seconds.` : ''}`
                  : error instanceof TypeError
                    ? 'Unable to reach GitHub. Please retry.'
                    : error instanceof Error
                      ? error.message
                      : 'Report generation failed.';
              throw new PluginCliError(message, {
                code:
                  error instanceof GitHubError && error.status === 429
                    ? 'rate_limited'
                    : 'report_failed',
              });
            }
          },
        }),
      },
    }),
  );
}
