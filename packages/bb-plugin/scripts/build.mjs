import { build } from 'esbuild';
import { readFile, writeFile } from 'node:fs/promises';

// Bundle the private workspace core; installed plugins need no sibling packages.
const result = await build({
  entryPoints: ['src/server.ts'],
  outfile: 'server.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  external: ['@get-bb/plugin-sdk'],
  write: false,
});
const output = result.outputFiles[0].text;
if (process.argv.includes('--check')) {
  if ((await readFile('server.js', 'utf8')) !== output)
    throw new Error(
      'The Git release bundle is stale. Run pnpm build:plugin and commit packages/bb-plugin/server.js with its sources.',
    );
} else {
  await writeFile('server.js', output);
}
