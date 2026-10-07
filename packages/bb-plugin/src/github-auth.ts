import { execFile } from 'node:child_process';

// Use the same server-side gh login as bb's GitHub integration.
export async function resolveGitHubToken(override?: string): Promise<string> {
  const token =
    override?.trim() || process.env.GH_TOKEN?.trim() || process.env.GITHUB_TOKEN?.trim();
  if (token) return token;

  for (const executable of ['gh', '/opt/homebrew/bin/gh', '/usr/local/bin/gh']) {
    const result = await new Promise<{ token: string; missing: boolean }>((resolve) => {
      execFile(
        executable,
        ['auth', 'token', '--hostname', 'github.com'],
        { timeout: 5000, maxBuffer: 16_384 },
        (error, stdout) => {
          // Subprocess errors can contain credentials; keep them out of user-facing errors.
          resolve({ token: error ? '' : stdout.trim(), missing: error?.code === 'ENOENT' });
        },
      );
    });
    if (!result.missing) return result.token;
  }
  return '';
}
