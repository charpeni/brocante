import { execFile } from 'node:child_process';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { resolveGitHubToken } from './github-auth';

vi.mock('node:child_process', () => ({ execFile: vi.fn() }));

beforeEach(() => {
  vi.stubEnv('GH_TOKEN', '');
  vi.stubEnv('GITHUB_TOKEN', '');
  vi.mocked(execFile).mockReset();
});

afterEach(() => vi.unstubAllEnvs());

function ghResult(token: string, error: NodeJS.ErrnoException | null = null) {
  return ((
    _file: string,
    _args: string[],
    _options: object,
    callback: (error: NodeJS.ErrnoException | null, stdout: string, stderr: string) => void,
  ) => {
    callback(error, token, '');
    return {} as ReturnType<typeof execFile>;
  }) as typeof execFile;
}

it('prefers an explicit override, then GH_TOKEN, then GITHUB_TOKEN without spawning gh', async () => {
  vi.stubEnv('GH_TOKEN', ' gh-secret ');
  vi.stubEnv('GITHUB_TOKEN', ' github-secret ');
  expect(await resolveGitHubToken(' override-secret ')).toBe('override-secret');
  expect(await resolveGitHubToken()).toBe('gh-secret');
  vi.stubEnv('GH_TOKEN', '');
  expect(await resolveGitHubToken(' ')).toBe('github-secret');
  expect(execFile).not.toHaveBeenCalled();
});

it('reuses the server gh login with a bounded subprocess and fixed hostname', async () => {
  vi.mocked(execFile).mockImplementation(ghResult(' existing-secret\n'));
  expect(await resolveGitHubToken()).toBe('existing-secret');
  expect(execFile).toHaveBeenCalledExactlyOnceWith(
    'gh',
    ['auth', 'token', '--hostname', 'github.com'],
    { timeout: 5000, maxBuffer: 16_384 },
    expect.any(Function),
  );
});

it('tries standard macOS locations when gh is missing from PATH', async () => {
  vi.mocked(execFile)
    .mockImplementationOnce(ghResult('', Object.assign(new Error('not found'), { code: 'ENOENT' })))
    .mockImplementationOnce(ghResult('mac-secret\n'));
  expect(await resolveGitHubToken()).toBe('mac-secret');
  expect(vi.mocked(execFile).mock.calls.map(([file]) => file)).toEqual([
    'gh',
    '/opt/homebrew/bin/gh',
  ]);
});

it('discards subprocess output and errors when authentication fails or times out', async () => {
  vi.mocked(execFile).mockImplementation(ghResult('secret', new Error('sensitive error')));
  expect(await resolveGitHubToken()).toBe('');
  expect(execFile).toHaveBeenCalledTimes(1);
});

it('returns no credential if gh is not installed', async () => {
  vi.mocked(execFile).mockImplementation(
    ghResult('', Object.assign(new Error('not found'), { code: 'ENOENT' })),
  );
  expect(await resolveGitHubToken()).toBe('');
  expect(execFile).toHaveBeenCalledTimes(3);
});
