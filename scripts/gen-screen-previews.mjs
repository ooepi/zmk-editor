// Makes the Screens tab's preview images in public/screens/ from each
// screen's own images (see `previews` in src/core/catalog/screens.ts).
// Some originals are 10–20 MB GIFs, so each becomes a small (animated) WebP.
//
//   node --experimental-strip-types scripts/gen-screen-previews.mjs [--force]
//
// Needs ffmpeg with libwebp on PATH. All the repos are MIT licensed; each
// card in the app keeps the copyright notice, as the license asks.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SCREENS } from '../src/core/catalog/screens.ts';

/**
 * A repo without pictures still has its art as an LVGL 1-bit C array; this
 * draws it (black on white, as on the screen) turned upright and 3× larger,
 * as a PGM image.
 */
function lvglBitmapToPgm(source) {
  const w = Number(/\.header\.w\s*=\s*(\d+)/.exec(source)?.[1]);
  const h = Number(/\.header\.h\s*=\s*(\d+)/.exec(source)?.[1]);
  // The pixels follow the palette's #endif; any bytes before them are palette.
  const bytes = [...source.slice(source.lastIndexOf('#endif')).split('};')[0].matchAll(/0x([0-9a-f]{2})/gi)].map((m) => parseInt(m[1], 16));
  const stride = Math.ceil(w / 8);
  const skip = bytes.length - h * stride;
  const on = (x, y) => (bytes[skip + y * stride + (x >> 3)] >> (7 - (x & 7))) & 1;
  const scale = 3;
  // Rotated a quarter turn counterclockwise: the screen is mounted sideways.
  const [outW, outH] = [h * scale, w * scale];
  const pixels = Buffer.alloc(outW * outH);
  for (let y = 0; y < outH; y++) {
    for (let x = 0; x < outW; x++) pixels[y * outW + x] = on(w - 1 - Math.floor(y / scale), Math.floor(x / scale)) ? 0 : 255;
  }
  return Buffer.concat([Buffer.from(`P5 ${outW} ${outH} 255\n`), pixels]);
}

const force = process.argv.includes('--force');
const out = join(import.meta.dirname, '../public/screens');
const work = mkdtempSync(join(tmpdir(), 'screen-previews-'));
mkdirSync(out, { recursive: true });

try {
  for (const preview of SCREENS.flatMap((s) => s.previews)) {
    const target = join(out, preview.file);
    if (existsSync(target) && !force) continue;
    const response = await fetch(preview.source);
    if (!response.ok) throw new Error(`${preview.source}: ${response.status}`);
    const bitmap = preview.source.endsWith('.c');
    const input = join(work, preview.file.replace(/\.webp$/, bitmap ? '.pgm' : ''));
    if (bitmap) writeFileSync(input, lvglBitmapToPgm(await response.text()));
    else writeFileSync(input, Buffer.from(await response.arrayBuffer()));
    // At most 320 px wide (never enlarged). Animations: 10 fps, 6 seconds.
    const scale = "scale='min(320,iw)':-2:flags=lanczos";
    const animated = /\.gif$/i.test(preview.source);
    execFileSync('ffmpeg', [
      '-v', 'error', '-y', '-i', input,
      ...(animated ? ['-t', '6', '-vf', `fps=10,${scale}`, '-loop', '0'] : ['-vf', scale, '-frames:v', '1']),
      '-c:v', 'libwebp', ...(bitmap ? ['-lossless', '1'] : ['-q:v', animated ? '50' : '75']), '-compression_level', '6', '-an',
      target,
    ]);
    console.log(`${preview.file} ← ${preview.source}`);
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}
