import { cliCommand, defineCli, PluginCliError, type BbPluginApi } from '@get-bb/plugin-sdk';
import { generateReport, renderReport, GitHubError, type Report } from '../../core/src/index';
import { demoMarket } from '../../core/src/demo';
import { reportFromSnapshot } from '../../core/src/report';
import { renderSnapshot } from '../../snapshot/src/index';
import { randomUUID } from 'node:crypto';
import { rpcContract, type SavedMarket } from './contract';
import { resolveGitHubToken } from './github-auth';

export default function plugin(bb: BbPluginApi) {
  const settings = bb.settings.define({
    githubToken: {
      type: 'string',
      label: 'GitHub token override (optional)',
      description: 'Uses the bb server’s existing gh login when left empty.',
      secret: true,
    },
  });
  let retryAt = 0;
  const snapshots = () => {
    const db = bb.storage.database();
    bb.storage.migrate(db, [
      'CREATE TABLE snapshots (id TEXT PRIMARY KEY, repository TEXT NOT NULL, html TEXT NOT NULL, created_at INTEGER NOT NULL)',
    ]);
    return db;
  };
  function saveSnapshot(report: Report): SavedMarket {
    const market = { id: randomUUID(), repository: report.repository, createdAt: Date.now() };
    const db = snapshots();
    db.prepare('INSERT INTO snapshots (id, repository, html, created_at) VALUES (?, ?, ?, ?)').run(
      market.id,
      market.repository,
      renderSnapshot(report),
      market.createdAt,
    );
    db.prepare(
      'DELETE FROM snapshots WHERE id NOT IN (SELECT id FROM snapshots ORDER BY created_at DESC, rowid DESC LIMIT 10)',
    ).run();
    bb.realtime.publish('snapshots', { id: market.id });
    return market;
  }

  async function loadReport(input: {
    repository?: string;
    search?: string;
    maxPages: number;
    demo: boolean;
  }): Promise<Report> {
    const githubToken = input.demo
      ? ''
      : await resolveGitHubToken((await settings.get()).githubToken);
    if (!githubToken && !input.demo)
      throw new PluginCliError(
        'Run gh auth login on the bb server, or set Brocante’s optional GitHub token override.',
        {
          code: 'missing_token',
        },
      );
    if (!input.demo && Date.now() < retryAt)
      throw new PluginCliError(
        `GitHub is rate limited. Retry after ${Math.ceil((retryAt - Date.now()) / 1000)} seconds.`,
        { code: 'rate_limited' },
      );
    try {
      if (input.demo && (input.repository || input.search))
        throw new Error('Use --demo without a repository or search.');
      return input.demo
        ? { ...reportFromSnapshot(demoMarket()), demo: true as const }
        : await generateReport({
            repository: input.repository ?? '',
            token: githubToken!,
            search: input.search,
            maxPages: input.maxPages,
          });
    } catch (error) {
      if (error instanceof GitHubError && error.status === 429)
        retryAt = Date.now() + (error.retryAfter ?? 60) * 1000;
      const message =
        error instanceof GitHubError
          ? `${error.status === 401 ? 'GitHub rejected the credential. Sign in again with gh auth login or update the token override.' : error.message}${error.retryAfter ? ` Retry after ${error.retryAfter} seconds.` : ''}`
          : error instanceof TypeError
            ? 'Unable to reach GitHub. Please retry.'
            : error instanceof Error
              ? error.message
              : 'Report generation failed.';
      throw new PluginCliError(message, {
        code:
          error instanceof GitHubError && error.status === 429 ? 'rate_limited' : 'report_failed',
      });
    }
  }

  for (const path of ['/snapshot', '/preview']) {
    bb.http.route(
      'GET',
      path,
      (context) => {
        const id = context.req.query('id');
        if (!id || !/^[a-f0-9-]{36}$/.test(id))
          return new Response('Snapshot not found.', { status: 404 });
        const snapshot = snapshots()
          .prepare('SELECT repository, html FROM snapshots WHERE id = ?')
          .get(id) as { repository: string; html: string } | undefined;
        if (!snapshot) return new Response('Snapshot not found.', { status: 404 });
        const headers: Record<string, string> = {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
          'Content-Security-Policy':
            "sandbox allow-scripts allow-popups allow-popups-to-escape-sandbox; frame-ancestors 'self'",
        };
        if (path === '/snapshot')
          headers['Content-Disposition'] =
            `attachment; filename="brocante-${snapshot.repository.replace('/', '-')}.html"`;
        return new Response(snapshot.html, { headers });
      },
      { auth: 'local' },
    );
  }
  bb.rpc.register(rpcContract, {
    async listSnapshots() {
      const githubToken = await resolveGitHubToken((await settings.get()).githubToken);
      return {
        configured: !!githubToken,
        snapshots: snapshots()
          .prepare(
            'SELECT id, repository, created_at AS createdAt FROM snapshots ORDER BY created_at DESC, rowid DESC LIMIT 10',
          )
          .all() as SavedMarket[],
      };
    },
    async capture(input) {
      return saveSnapshot(await loadReport(input));
    },
  });
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
            try {
              const maxPages = Number(input.options['max-pages']);
              if (!/^\d+$/.test(input.options['max-pages']) || maxPages < 1 || maxPages > 100)
                throw new Error('--max-pages must be an integer from 1 to 100.');
              const report = await loadReport({
                repository: input.positionals.repository,
                search: input.options.search,
                maxPages: input.options.format === 'html' ? maxPages : 1,
                demo: !!input.options.demo,
              });
              if (input.options.format === 'html') {
                const { id } = saveSnapshot(report);
                const path = `/api/v1/plugins/${encodeURIComponent(bb.pluginId)}/http/snapshot?id=${id}`;
                const url = new URL(
                  path,
                  bb.server.experimental_appUrl ?? bb.server.loopbackBaseUrl,
                ).href;
                return {
                  exitCode: 0,
                  stdout: `Preview in bb: ${new URL(`/plugins/${encodeURIComponent(bb.pluginId)}/market/${id}`, url).href}\nPortable 3D market: ${url}\nDownload the HTML to keep an offline copy.\n${report.complete ? '' : 'Partial snapshot: increase --max-pages or narrow --search for more results.\n'}`,
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
              if (error instanceof PluginCliError) throw error;
              throw new PluginCliError(
                error instanceof Error ? error.message : 'Report generation failed.',
                {
                  code: 'report_failed',
                },
              );
            }
          },
        }),
      },
    }),
  );
}
