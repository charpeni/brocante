import { cliCommand, defineCli, PluginCliError, type BbPluginApi } from '@get-bb/plugin-sdk';
import { generateReport, renderReport, GitHubError } from '../../core/src/index';

export default function plugin(bb: BbPluginApi) {
  const settings = bb.settings.define({
    githubToken: { type: 'string', label: 'GitHub read-only token', secret: true },
  });
  let retryAt = 0;
  bb.cli.register(
    defineCli({
      name: 'brocante',
      summary: 'Read GitHub pull-request reports',
      commands: {
        report: cliCommand({
          summary: 'Report on a repository’s open pull requests',
          positionals: [
            { name: 'repository', description: 'GitHub owner/repository', required: true },
          ],
          options: {
            format: {
              type: 'enum',
              values: ['markdown', 'json'],
              default: 'markdown',
              description: 'Report output format',
            },
            search: {
              type: 'string',
              description: 'Search this repository’s open pull requests (max 256 characters)',
            },
          },
          async run(input) {
            const { githubToken } = await settings.get();
            if (!githubToken)
              throw new PluginCliError(
                'Configure a GitHub token in the Brocante plugin settings.',
                { code: 'missing_token' },
              );
            if (Date.now() < retryAt)
              throw new PluginCliError(
                `GitHub is rate limited. Retry after ${Math.ceil((retryAt - Date.now()) / 1000)} seconds.`,
                { code: 'rate_limited' },
              );
            try {
              // One page keeps the command comfortably within bb’s output ceiling.
              const report = await generateReport({
                repository: input.positionals.repository,
                token: githubToken,
                search: input.options.search,
                maxPages: 1,
              });
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
