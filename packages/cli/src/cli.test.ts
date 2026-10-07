import { afterAll, beforeAll, expect, it } from 'vitest';
import { build } from 'esbuild';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

let directory: string;
let entry: string;
beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'brocante-cli-pipe-'));
  entry = join(directory, 'cli.mjs');
  await build({
    entryPoints: [fileURLToPath(new URL('./cli.ts', import.meta.url))],
    outfile: entry,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node22',
  });
});
afterAll(async () => {
  await rm(directory, { recursive: true, force: true });
});

it('exits quietly when the consumer closes stdout', async () => {
  const child = spawn(process.execPath, [entry, '--demo', '--format', 'json'], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });
  const closed = new Promise<number | null>((resolve, reject) => {
    child.once('error', reject);
    child.once('close', resolve);
  });
  child.stdout.destroy();
  expect(await closed).toBe(0);
  expect(stderr).toBe('');
});
