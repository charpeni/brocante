import { afterEach, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCli } from './run';

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
  expect(output.stdout).toHaveBeenLastCalledWith('1.0.0\n');
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
