import { appendFile, readFile } from 'node:fs/promises';

const { version } = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const expected = `cli/v${version}`;
if (process.argv[2] !== expected) {
  throw new Error(
    `The CLI version requires tag ${expected}; received ${process.argv[2] ?? '(none)'}.`,
  );
}

if (process.env.GITHUB_OUTPUT) {
  await appendFile(
    process.env.GITHUB_OUTPUT,
    `version=${version}\ndist_tag=${version.includes('-') ? 'next' : 'latest'}\n`,
  );
}

console.log(`Verified ${expected}`);
