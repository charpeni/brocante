import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
// Astro's image pipeline already supplies Sharp; no additional dependency is needed.
const sharp = require(require.resolve('sharp', { paths: [require.resolve('astro/package.json')] }));
const root = new URL('../public/', import.meta.url);
const mark = await readFile(new URL('brand/brocante-mark.svg', root), 'utf8');
const body = mark
  .slice(mark.indexOf('>') + 1, mark.lastIndexOf('</svg>'))
  .replaceAll('currentColor', '#264B3D')
  .replaceAll('var(--canvas,#F6F1E6)', '#F6F1E6')
  .replaceAll('var(--accent,#B64E36)', '#B64E36');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80" role="img" aria-label="Brocante"><rect width="80" height="80" rx="16" fill="#F6F1E6"/>${body}</svg>\n`;
await writeFile(new URL('favicon.svg', root), svg);
const sizes = [16, 32];
const images = await Promise.all(
  sizes.map((size) => sharp(Buffer.from(svg)).resize(size, size).png().toBuffer()),
);
const directory = Buffer.alloc(6 + images.length * 16);
directory.writeUInt16LE(1, 2);
directory.writeUInt16LE(images.length, 4);
let offset = directory.length;
images.forEach((image, i) => {
  const entry = 6 + i * 16;
  directory[entry] = sizes[i];
  directory[entry + 1] = sizes[i];
  directory.writeUInt16LE(1, entry + 4);
  directory.writeUInt16LE(32, entry + 6);
  directory.writeUInt32LE(image.length, entry + 8);
  directory.writeUInt32LE(offset, entry + 12);
  offset += image.length;
});
await writeFile(new URL('favicon.ico', root), Buffer.concat([directory, ...images]));
await sharp(Buffer.from(svg))
  .resize(180, 180)
  .png()
  .toFile(new URL('apple-touch-icon.png', root).pathname);
