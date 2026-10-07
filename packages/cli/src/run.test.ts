import { afterEach, expect, it, vi } from 'vitest';
import { chmod, mkdtemp, mkdir, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCli } from './run';
import { version } from '../package.json';

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});
function io() {
  return { env: {}, stdout: vi.fn(), stderr: vi.fn(), ghToken: vi.fn(async () => '') };
}
it('supports help and version without accessing credentials', async () => {
  const output = io();
  expect(await runCli(['--help'], output)).toBe(0);
  expect(await runCli(['--version'], output)).toBe(0);
  expect(output.stdout).toHaveBeenLastCalledWith(`${version}\n`);
  expect(output.ghToken).not.toHaveBeenCalled();
});
it('generates offline HTML and refuses accidental overwrite', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'brocante-cli-'));
  directories.push(cwd);
  const output = { ...io(), cwd };
  expect(await runCli(['--demo', '--output', 'report.html'], output)).toBe(0);
  expect(await readFile(join(cwd, 'report.html'), 'utf8')).toContain('<!doctype html>');
  if (process.platform !== 'win32')
    expect((await stat(join(cwd, 'report.html'))).mode & 0o777).toBe(0o600);
  expect(await runCli(['--demo', '--output', 'report.html'], output)).toBe(1);
  expect(output.stderr).toHaveBeenLastCalledWith(expect.stringContaining('Use --force'));
  expect(await runCli(['--demo', '--output', 'report.html', '--force'], output)).toBe(0);
});
it('emits parseable JSON without status text in stdout', async () => {
  const output = io();
  expect(await runCli(['--demo', '--format', 'json'], output)).toBe(0);
  expect(JSON.parse(output.stdout.mock.calls[0][0])).toMatchObject({
    schemaVersion: 1,
    complete: true,
    demo: true,
    searchLimited: false,
    pullRequests: expect.arrayContaining([expect.objectContaining({ bodyTruncated: false })]),
  });
  expect(output.stderr).not.toHaveBeenCalled();
});
it('gives file-path advice for output directories with and without --force', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'brocante-cli-directory-'));
  directories.push(cwd);
  const directory = join(cwd, 'reports');
  await mkdir(directory);
  await writeFile(join(directory, 'keep.txt'), 'preserve me');
  const originalMode = (await stat(directory)).mode;
  const paths = ['reports'];
  if (process.platform !== 'win32') {
    await symlink(directory, join(cwd, 'linked-reports'));
    paths.push('linked-reports');
  }
  for (const path of paths) {
    for (const force of [false, true]) {
      const output = { ...io(), cwd, fetcher: vi.fn<typeof fetch>() };
      expect(
        await runCli(['--demo', '--output', path, ...(force ? ['--force'] : [])], output),
      ).toBe(1);
      expect(output.stderr).toHaveBeenCalledWith(expect.stringContaining('Choose a file path'));
      expect(JSON.stringify(output.stderr.mock.calls)).not.toMatch(/--force|EISDIR|EEXIST/);
      expect(output.ghToken).not.toHaveBeenCalled();
      expect(output.fetcher).not.toHaveBeenCalled();
    }
  }
  expect(await readFile(join(directory, 'keep.txt'), 'utf8')).toBe('preserve me');
  expect((await stat(directory)).mode).toBe(originalMode);
});
it('validates arguments before looking up credentials', async () => {
  const output = io();
  for (const args of [
    ['x/y', '--format', 'pdf'],
    ['x/y', '--max-pages', '0'],
    ['--demo', 'x/y'],
  ])
    expect(await runCli(args, output)).toBe(1);
  expect(output.ghToken).not.toHaveBeenCalled();
});
it.each([['--unknown'], ['--format'], ['x/y', '--output'], ['--max-pages'], ['-x']])(
  'reports parser mistakes as usage errors before accessing GitHub: %s',
  async (...args) => {
    const output = { ...io(), fetcher: vi.fn<typeof fetch>() };
    expect(await runCli(args, output)).toBe(2);
    expect(output.stderr).toHaveBeenCalledWith(expect.stringContaining('brocante --help'));
    expect(JSON.stringify(output.stderr.mock.calls)).not.toContain('Unable to reach GitHub');
    expect(output.ghToken).not.toHaveBeenCalled();
    expect(output.fetcher).not.toHaveBeenCalled();
  },
);
it('still identifies actual network failures', async () => {
  const output = {
    ...io(),
    env: { GH_TOKEN: 'test' },
    fetcher: vi.fn<typeof fetch>().mockRejectedValue(new TypeError('fetch failed')),
  };
  expect(await runCli(['team/repo'], output)).toBe(1);
  expect(output.stderr).toHaveBeenCalledWith(expect.stringContaining('Unable to reach GitHub'));
});

it('rejects existing files and missing directories before looking up credentials or fetching', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'brocante-cli-preflight-'));
  directories.push(cwd);
  await writeFile(join(cwd, 'brocante-team-repo.html'), 'preserve me');
  for (const args of [
    ['team/repo'],
    ['team/repo', '--output', 'brocante-team-repo.html'],
    ['team/repo', '--output', 'missing/report.html'],
  ]) {
    const output = { ...io(), cwd, fetcher: vi.fn<typeof fetch>() };
    expect(await runCli(args, output)).toBe(1);
    expect(output.ghToken).not.toHaveBeenCalled();
    expect(output.fetcher).not.toHaveBeenCalled();
    expect(JSON.stringify(output.stderr.mock.calls)).not.toMatch(/ENOENT|EEXIST/);
  }
  expect(await readFile(join(cwd, 'brocante-team-repo.html'), 'utf8')).toBe('preserve me');
});

it('keeps exclusive creation when a file appears after the preflight', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'brocante-cli-race-'));
  directories.push(cwd);
  const path = join(cwd, 'report.json');
  const output = {
    ...io(),
    cwd,
    ghToken: vi.fn(async () => {
      await writeFile(path, 'preserve me');
      return 'test';
    }),
    fetcher: vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            repository: {
              nameWithOwner: 'team/repo',
              url: 'https://github.com/team/repo',
              isPrivate: false,
              pullRequests: {
                totalCount: 0,
                pageInfo: { hasNextPage: false, endCursor: null },
                nodes: [],
              },
            },
          },
        }),
      ),
    ),
  };
  expect(await runCli(['team/repo', '--format', 'json', '--output', path], output)).toBe(1);
  expect(output.stderr).toHaveBeenLastCalledWith(expect.stringContaining('Use --force'));
  expect(await readFile(path, 'utf8')).toBe('preserve me');
});

it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)(
  'rejects a read-only output before fetching, even with --force',
  async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'brocante-cli-permissions-'));
    directories.push(cwd);
    const path = join(cwd, 'report.html');
    await writeFile(path, 'preserve me');
    await chmod(path, 0o400);
    const output = { ...io(), cwd, fetcher: vi.fn<typeof fetch>() };
    expect(await runCli(['team/repo', '--output', path, '--force'], output)).toBe(1);
    expect(output.stderr).toHaveBeenCalledWith(expect.stringContaining('not writable'));
    expect(output.fetcher).not.toHaveBeenCalled();
    expect(output.ghToken).not.toHaveBeenCalled();
    expect(await readFile(path, 'utf8')).toBe('preserve me');
  },
);

it.each(['test\nsecret', 'test\rsecret', 'test secret', 'test\x00secret'])(
  'rejects malformed tokens without making a request or exposing the token',
  async (token) => {
    const output = { ...io(), env: { GH_TOKEN: token }, fetcher: vi.fn<typeof fetch>() };
    expect(await runCli(['team/repo', '--format', 'json'], output)).toBe(1);
    expect(output.stderr).toHaveBeenCalledWith(expect.stringContaining('token contains'));
    expect(JSON.stringify(output.stderr.mock.calls)).not.toContain('secret');
    expect(output.fetcher).not.toHaveBeenCalled();
  },
);

it.each(['0x10', '1.5', '1e1', '', '101'])('requires a decimal page count: %s', async (value) => {
  const output = io();
  expect(await runCli(['--demo', '--max-pages', value], output)).toBe(1);
  expect(output.ghToken).not.toHaveBeenCalled();
});

it('does not label errors outside the request as network failures', async () => {
  const output = {
    ...io(),
    stdout: () => {
      throw new TypeError('Output failed.');
    },
  };
  expect(await runCli(['--demo', '--format', 'json'], output)).toBe(1);
  expect(output.stderr).toHaveBeenCalledWith('Output failed.\n');
});
it('uses environment authentication and preserves the rate-limit delay', async () => {
  const output = {
    ...io(),
    env: { GH_TOKEN: 'private-test-secret' },
    fetcher: vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('', { status: 429, headers: { 'retry-after': '120' } })),
  };
  expect(await runCli(['team/repo', '--format', 'json'], output)).toBe(3);
  expect(output.stderr).toHaveBeenCalledWith(expect.stringContaining('120 seconds'));
  expect(output.stdout).not.toHaveBeenCalled();
  expect(output.ghToken).not.toHaveBeenCalled();
  expect(JSON.stringify(output.stderr.mock.calls)).not.toContain('private-test-secret');
});
