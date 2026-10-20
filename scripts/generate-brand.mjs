import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const apiRequire = createRequire(resolve(root, 'apps/api/package.json'));
const nextRequire = createRequire(apiRequire.resolve('next/package.json'));
// Next's existing locked dependency avoids an additional native build dependency.
const sharp = nextRequire('sharp');
if (sharp.versions.sharp !== '0.35.5')
  throw new Error(
    'Brand generation requires the lockfile sharp 0.35.5. Review raster output before changing this version.',
  );
const check = process.argv.includes('--check');
if (process.argv.slice(2).some((argument) => argument !== '--check'))
  throw new Error('Usage: node scripts/generate-brand.mjs [--check]');
const directory = resolve(root, 'apps/mobile/assets/brand');
const assets = [
  { name: 'icon', size: 1024, transparent: false },
  { name: 'adaptive-foreground', size: 1024, transparent: true, adaptive: true },
  { name: 'adaptive-monochrome', size: 1024, transparent: true, adaptive: true, monochrome: true },
  { name: 'splash-light', size: 1024, transparent: true },
  { name: 'splash-dark', size: 1024, transparent: true },
  { name: 'store-icon', source: 'icon', size: 512, transparent: false },
];

for (const asset of assets) {
  const svg = await readFile(resolve(directory, `${asset.source ?? asset.name}.svg`));
  // Keep embedded resources and executable content out before rasterization.
  if (/<image|<script|https?:\/\/(?!www\.w3\.org\/2000\/svg)/i.test(svg.toString()))
    throw new Error('Brand vectors must contain only local original geometry.');
  let pipeline = sharp(svg).resize(asset.size, asset.size);
  if (!asset.transparent) pipeline = pipeline.removeAlpha();
  const rendered = await pipeline
    .png({ compressionLevel: 9, adaptiveFiltering: false, palette: false })
    .toBuffer();
  const path = resolve(directory, `${asset.name}.png`);
  if (check) {
    if (!(await readFile(path)).equals(rendered))
      throw new Error(`${asset.name}.png is stale. Regenerate the branding assets.`);
  } else await writeFile(path, rendered);
  const metadata = await sharp(rendered).metadata();
  if (metadata.width !== asset.size || metadata.height !== asset.size || metadata.format !== 'png')
    throw new Error(`${asset.name}: wrong raster dimensions or format.`);
  if (metadata.hasAlpha !== asset.transparent)
    throw new Error(`${asset.name}: incorrect transparency.`);
  if (asset.adaptive) {
    const { data, info } = await sharp(rendered)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    // Android guarantees the central 66 dp circle on a 108 dp adaptive layer.
    const center = (asset.size - 1) / 2;
    const safeRadius = (asset.size * 33) / 108;
    let visible = 0;
    for (let y = 0; y < info.height; y++)
      for (let x = 0; x < info.width; x++) {
        const offset = (y * info.width + x) * info.channels;
        if (data[offset + 3] === 0) continue;
        visible++;
        if ((x - center) ** 2 + (y - center) ** 2 > safeRadius ** 2)
          throw new Error(`${asset.name}: artwork lies outside the adaptive icon safe circle.`);
        if (
          asset.monochrome &&
          (data[offset] !== 255 || data[offset + 1] !== 255 || data[offset + 2] !== 255)
        )
          throw new Error('The monochrome layer must be a single white alpha silhouette.');
      }
    if (!visible) throw new Error(`${asset.name}: the icon is empty.`);
  }
  process.stdout.write(
    `${check ? 'Verified' : 'Generated'} ${asset.name}.png ${asset.size}×${asset.size}\n`,
  );
}
