import { build } from 'esbuild';
import { readFile, rename, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const result = await build({
  absWorkingDir: root,
  entryPoints: ['src/app.tsx'],
  outfile: 'snapshot.js',
  bundle: true,
  write: false,
  platform: 'browser',
  format: 'iife',
  target: 'es2022',
  jsx: 'automatic',
  minify: true,
  legalComments: 'eof',
  loader: { '.woff': 'dataurl', '.woff2': 'dataurl', '.svg': 'dataurl' },
  define: { 'process.env.NODE_ENV': '"production"', 'import.meta.env.PUBLIC_BUILD_SHA': '""' },
});
// Embedded font files must travel with their copyright and license notices.
const fontLicenses = await Promise.all(
  ['dm-sans', 'dm-serif-display'].map((font) =>
    readFile(
      new URL(`../../web/node_modules/@fontsource/${font}/LICENSE`, import.meta.url),
      'utf8',
    ),
  ),
);
const script =
  result.outputFiles.find((file) => file.path.endsWith('.js')).text +
  `\n/* Embedded font licenses:\n${fontLicenses.join('\n\n')}\n*/\n`;
const styles = result.outputFiles.find((file) => file.path.endsWith('.css')).text;
const temporary = new URL(`../src/generated-template-${process.pid}.js`, import.meta.url);
await writeFile(
  temporary,
  `export const script = ${JSON.stringify(script)};\nexport const styles = ${JSON.stringify(styles)};\n`,
);
await rename(temporary, new URL('../src/generated-template.js', import.meta.url));
