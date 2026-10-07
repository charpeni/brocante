import { readFile } from 'node:fs/promises';

const { version } = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const expected = `bb-plugin/v${version}`;
if (process.argv[2] !== expected) {
  throw new Error(
    `The plugin version requires tag ${expected}; received ${process.argv[2] ?? '(none)'}.`,
  );
}

console.log(`Verified ${expected}`);
