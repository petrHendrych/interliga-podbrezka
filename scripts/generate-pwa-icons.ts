/* eslint-disable no-console */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const BRAND_MARK = path.join(process.cwd(), 'assets', 'brand-mark.svg');
const THEMED_ICON = path.join(process.cwd(), 'app', 'icon.svg');
const APP_DIR = path.join(process.cwd(), 'app');
const OUTPUT_DIR = path.join(process.cwd(), 'public', 'icons');

// Must stay equal to background_color in app/manifest.ts -- the splash screen and the icon
// have to be the same colour or the mark floats on a differently tinted square.
const BACKGROUND = '#020618';

// The mark already fills its own viewBox, so the `any` icons take only enough padding to keep
// it off the edge. The maskable variants must keep 20% -- that is Android's 80% safe circle,
// and anything outside it is cropped by a circular or squircle mask.
const OUTPUTS = [
  { file: 'icon-192.png', size: 192, padding: 0.04 },
  { file: 'icon-512.png', size: 512, padding: 0.04 },
  { file: 'icon-maskable-192.png', size: 192, padding: 0.2 },
  { file: 'icon-maskable-512.png', size: 512, padding: 0.2 },
];

const FAVICON_SIZES = [16, 32, 48];

async function onBackground(source: Buffer, size: number, padding: number) {
  const markSize = Math.round(size * (1 - 2 * padding));
  const offset = Math.round((size - markSize) / 2);
  const mark = await sharp(source).resize(markSize, markSize).png().toBuffer();

  return sharp({
    create: {
      width: size, height: size, channels: 4, background: BACKGROUND,
    },
  })
    .composite([{ input: mark, top: offset, left: offset }])
    .png()
    .toBuffer();
}

// app/icon.svg carries both palettes as CSS custom properties behind a prefers-color-scheme
// query, which the rasteriser does not evaluate. The favicon is transparent and sits on the
// browser's own chrome, so it is baked with the light palette -- the first :root block.
async function resolveLightPalette() {
  const svg = await readFile(THEMED_ICON, 'utf8');
  const rootBlock = svg.match(/:root\s*\{([^}]*)\}/)?.[1] ?? '';
  const palette = new Map(
    [...rootBlock.matchAll(/--([\w-]+):\s*([^;]+);/g)].map(([, name, value]) => [name, value.trim()]),
  );

  return Buffer.from(
    svg
      .replace(/<style>[\s\S]*?<\/style>/, '')
      .replace(/var\(--([\w-]+)\)/g, (match, name: string) => palette.get(name) ?? match),
  );
}

async function writeIco(target: string, pngs: { size: number; data: Buffer }[]) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);

  let offset = 6 + pngs.length * 16;
  const entries = pngs.map(({ size, data }) => {
    const entry = Buffer.alloc(16);
    entry[0] = size;
    entry[1] = size;
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += data.length;
    return entry;
  });

  await writeFile(target, Buffer.concat([header, ...entries, ...pngs.map((png) => png.data)]));
}

async function main() {
  const brandMark = await readFile(BRAND_MARK);
  await mkdir(OUTPUT_DIR, { recursive: true });

  await Promise.all(
    OUTPUTS.map(async ({ file, size, padding }) => {
      await writeFile(path.join(OUTPUT_DIR, file), await onBackground(brandMark, size, padding));
      console.log(`wrote public/icons/${file} (${size}x${size})`);
    }),
  );

  await writeFile(path.join(APP_DIR, 'apple-icon.png'), await onBackground(brandMark, 180, 0.06));
  console.log('wrote app/apple-icon.png (180x180)');

  const lightMark = await resolveLightPalette();
  const favicons = await Promise.all(
    FAVICON_SIZES.map(async (size) => ({
      size,
      data: await sharp(lightMark).resize(size, size).png().toBuffer(),
    })),
  );
  await writeIco(path.join(APP_DIR, 'favicon.ico'), favicons);
  console.log(`wrote app/favicon.ico (${FAVICON_SIZES.join(', ')})`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
