import { parseArgs } from 'node:util';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { stat, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  generateReport,
  renderReport,
  reportFromSnapshot,
  GitHubError,
  parseRepository,
  type ReportFormat,
} from '@brocante/core';
import { demoMarket } from '@brocante/core/demo';

const help = `Brocante 1.0.0 — local pull-request reports

Usage: brocante [report] <owner/repo> [options]
       brocante --demo [options]

  --format <html|markdown|json>  Report format (default: html)
  --output <path|->             File path, or - for stdout
  --search <query>              GitHub search within this repository's open PRs
  --max-pages <1-100>           Page limit, 60 PRs per page (default: 10)
  --force                      Replace an existing output file
  --demo                       Generate a fictional report without credentials
  --help                       Show help
  --version                    Show version

Authentication: GH_TOKEN, then GITHUB_TOKEN, then gh auth token.
HTML defaults to brocante-owner-repo.html; Markdown and JSON default to stdout.
Reports are snapshots. A rate limit stops the run and reports the retry delay.
`;

interface CliIO {
  env: NodeJS.ProcessEnv;
  cwd: string;
  stdout: (text: string) => void;
  stderr: (text: string) => void;
  fetcher?: typeof fetch;
  ghToken: () => Promise<string>;
}
async function ghToken() {
  try {
    const { stdout } = await promisify(execFile)(
      'gh',
      ['auth', 'token', '--hostname', 'github.com'],
      { timeout: 5000, maxBuffer: 16_384 },
    );
    return stdout.trim();
  } catch {
    return '';
  }
}
export async function runCli(argv: string[], overrides: Partial<CliIO> = {}): Promise<number> {
  const io: CliIO = {
    env: process.env,
    cwd: process.cwd(),
    stdout: (text) => {
      process.stdout.write(text);
    },
    stderr: (text) => {
      process.stderr.write(text);
    },
    ghToken,
    ...overrides,
  };
  try {
    const { values, positionals } = parseArgs({
      args: argv,
      allowPositionals: true,
      strict: true,
      options: {
        format: { type: 'string', default: 'html' },
        output: { type: 'string' },
        search: { type: 'string' },
        'max-pages': { type: 'string', default: '10' },
        force: { type: 'boolean' },
        demo: { type: 'boolean' },
        help: { type: 'boolean', short: 'h' },
        version: { type: 'boolean', short: 'v' },
      },
    });
    if (values.help) {
      io.stdout(help);
      return 0;
    }
    if (values.version) {
      io.stdout('1.0.0\n');
      return 0;
    }
    if (positionals[0] === 'report') positionals.shift();
    if (positionals.length > 1 || (values.demo && positionals.length > 0))
      throw new Error('Choose one repository, or --demo without a repository.');
    const repository = values.demo ? 'brocante/weekend-bazaar' : positionals[0];
    if (!repository || !parseRepository(repository))
      throw new Error('Use brocante owner/repo, or brocante --demo.');
    if (!['html', 'markdown', 'json'].includes(values.format!))
      throw new Error('Choose --format html, markdown, or json.');
    const maxPages = Number(values['max-pages']);
    if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 100)
      throw new Error('--max-pages must be an integer from 1 to 100.');
    if (values.demo && values.search) throw new Error('--search requires a live repository.');
    const token = values.demo
      ? ''
      : io.env.GH_TOKEN?.trim() || io.env.GITHUB_TOKEN?.trim() || (await io.ghToken());
    if (!values.demo && !token)
      throw new Error('Sign in with gh auth login, or set GH_TOKEN / GITHUB_TOKEN.');
    const report = values.demo
      ? reportFromSnapshot(demoMarket())
      : await generateReport({
          repository,
          token,
          search: values.search,
          maxPages,
          fetcher: io.fetcher,
        });
    const format = values.format as ReportFormat;
    const content = renderReport(report, format);
    const output =
      values.output ??
      (format === 'html' ? `brocante-${report.repository.replace('/', '-')}.html` : '-');
    if (output === '-') io.stdout(content);
    else {
      const path = resolve(io.cwd, output);
      // Reports can contain private repository data; don't overwrite by default.
      try {
        await writeFile(path, content, { flag: values.force ? 'w' : 'wx', mode: 0o600 });
      } catch (error) {
        const code = error instanceof Error && 'code' in error ? String(error.code) : '';
        // Exclusive creation can report EEXIST for directories, including symlinks
        // to them. --force cannot make either into a report file.
        if (
          code === 'EISDIR' ||
          (code === 'EEXIST' && (await stat(path).catch(() => null))?.isDirectory())
        ) {
          throw new Error(
            'The output path is a directory. Choose a file path such as --output report.html, or use --output - to print.',
          );
        }
        throw error;
      }
      io.stderr(`Wrote ${path}\n`);
    }
    if (!report.complete)
      io.stderr('Partial report: increase --max-pages or narrow --search for more results.\n');
    return 0;
  } catch (error) {
    const code = error instanceof Error && 'code' in error ? String(error.code) : '';
    if (code.startsWith('ERR_PARSE_ARGS')) {
      io.stderr(`${(error as Error).message}\nRun brocante --help for usage.\n`);
      return 2;
    }
    if (code === 'EEXIST') {
      io.stderr(
        'The output file already exists. Use --force to replace it, choose another --output path, or use --output - to print.\n',
      );
      return 1;
    }
    if (error instanceof GitHubError) {
      const message =
        error.status === 401
          ? 'GitHub rejected the token. Sign in with gh auth login or update GH_TOKEN.'
          : error.message;
      io.stderr(
        `${message}${error.retryAfter ? ` Retry after ${error.retryAfter} seconds.` : ''}\n`,
      );
      return error.status === 429 ? 3 : 1;
    }
    if (error instanceof TypeError)
      io.stderr('Unable to reach GitHub. Check your network and try again.\n');
    else io.stderr(`${error instanceof Error ? error.message : 'Report generation failed.'}\n`);
    return 1;
  }
}
