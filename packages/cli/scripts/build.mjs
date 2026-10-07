import { build } from 'esbuild';
import { chmod } from 'node:fs/promises';
import '../../snapshot/scripts/build.mjs';

await build({
  entryPoints: ['src/cli.ts'],
  outfile: 'dist/cli.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  banner: { js: '#!/usr/bin/env node' },
});

await chmod('dist/cli.js', 0o755);
