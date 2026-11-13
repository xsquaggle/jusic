'use strict';
/**
 * Draws the geometry in prototypes/mercury/shape.js as plain lines, over a dimmed reference
 * image if one is asked for. For working on the outline: it takes about a second, needs no
 * window and no GPU, and shows exactly what the hit-test and the shaders are given.
 *
 *   npx electron tools/capture/outline.js out=design/captures/raw/outline.png [ref=mercury|flow|none] [px=2]
 *
 * Lines: white the silhouette, grey the crest of its rolled edge and the underside, yellow the
 * cover tile, magenta the pod and the upper lip's leading edge (when shape.js has them), green
 * the timeline and volume, blue the buttons and the room the words are given.
 *
 * The references are drawn in perspective and ours is seen square on, so nothing will line up
 * exactly. The overlay is for comparing the character of the curves, not for tracing.
 */
const { app, nativeImage } = require('electron');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const args = Object.fromEntries(process.argv.slice(2).filter((a) => a.includes('=')).map((a) => a.split(/=(.*)/s).slice(0, 2)));
const REPO = path.resolve(__dirname, '..', '..');
const OUT = path.resolve(args.out || 'design/captures/raw/outline.png');
const PX = Number(args.px) || 2;

// Where each reference's widget sits: image px per stage unit, and the image point that
// corresponds to a stage point (both picked on the left bulb).
const REFS = {
  mercury: { file: 'design/references/widget-mercury.png', k: 1 / 0.485, at: [40, 477], is: [58, 196] },
  flow: { file: 'design/references/widget-mercury-flow.png', k: 1 / 0.485, at: [45, 505], is: [58, 214] },
};

app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const S = await import(pathToFileURL(path.join(REPO, 'prototypes', 'mercury', 'shape.js')).href);
  const { STAGE, L } = S;
  const W = STAGE.w * PX, H = STAGE.h * PX;
  const buf = Buffer.alloc(W * H * 4);          // BGRA

  const ref = REFS[args.ref || 'none'];
  if (ref) {
    const img = nativeImage.createFromPath(path.join(REPO, ref.file));
    const { width, height } = img.getSize();
    const src = img.toBitmap();
    for (let j = 0; j < H; j++) {
      for (let i = 0; i < W; i++) {
        const x = Math.round(ref.at[0] + (i / PX - ref.is[0]) * ref.k);
        const y = Math.round(ref.at[1] + (j / PX - ref.is[1]) * ref.k);
        if (x < 0 || y < 0 || x >= width || y >= height) continue;
        const s = (y * width + x) * 4, o = (j * W + i) * 4;
        buf[o] = src[s] * 0.6; buf[o + 1] = src[s + 1] * 0.6; buf[o + 2] = src[s + 2] * 0.6;
      }
    }
  }
  for (let o = 3; o < buf.length; o += 4) buf[o] = 255;

  /** A contour of f at level 0, drawn 'half' units to either side, in colour [r, g, b] with strength a. */
  const line = (f, rgb, half = 0.45, a = 1) => {
    for (let j = 0; j < H; j++) {
      for (let i = 0; i < W; i++) {
        const d = f((i + 0.5) / PX, (j + 0.5) / PX);
        if (!(Math.abs(d) < half + 0.5)) continue;
        const k = a * Math.min(1, Math.max(0, (half + 0.5 - Math.abs(d)) * PX));
        const o = (j * W + i) * 4;
        buf[o] += (rgb[2] - buf[o]) * k; buf[o + 1] += (rgb[1] - buf[o + 1]) * k; buf[o + 2] += (rgb[0] - buf[o + 2]) * k;
      }
    }
  };
  const circle = (c, r) => (x, y) => Math.hypot(x - c[0], y - c[1]) - r;
  const curve = (fy, x0, x1) => (x, y) => (x < x0 || x > x1 ? 99 : Math.abs(y - fy(x)) - 0.2);
  const box = (x0, y0, x1, y1) => (x, y) => Math.max(Math.abs(x - (x0 + x1) / 2) - (x1 - x0) / 2, Math.abs(y - (y0 + y1) / 2) - (y1 - y0) / 2);

  const body = (x, y) => S.bodySdf(x, y);
  line((x, y) => body(x, y - 11), [120, 120, 130], 0.3, 0.7);            // the underside
  line((x, y) => body(x, y) + L.edgeR, [120, 120, 130], 0.3, 0.7);        // the crest of the rolled edge
  line((x, y) => body(x, y) + L.edgeIn, [70, 70, 80], 0.3, 0.7);          // where the lip has levelled out
  line(body, [255, 255, 255], 0.5);
  line((x, y) => S.tileSdf(x, y), [255, 220, 60], 0.4);
  if (S.podSdf) line((x, y) => S.podSdf(x, y), [255, 80, 220], 0.4);
  if (S.lipSdf) line((x, y) => S.lipSdf(x, y), [255, 120, 60], 0.5);
  for (const b of L.buttons) line(circle(b.c, b.r), [90, 150, 255], 0.35);
  for (const u of L.utils) line(circle(u.c, u.r), [90, 150, 255], 0.3, 0.6);
  line(curve(S.seekY, L.seek.x0, L.seek.x1), [80, 255, 120], 0.5);
  line(curve(S.volY, L.vol.x0, L.vol.x1), [80, 255, 120], 0.5);
  line(circle(L.vol.icon, 11), [80, 255, 120], 0.3, 0.6);
  line(box(L.title.x, L.title.y - L.title.size * 0.74, L.title.x + L.title.maxW, L.title.y + 4), [90, 150, 255], 0.3, 0.7);
  line(box(L.artist.x, L.artist.y - L.artist.size * 0.74, L.artist.x + L.title.maxW - 8, L.artist.y + 4), [90, 150, 255], 0.3, 0.5);
  // A grid every 100 units, faint, with a tick every 20 along the top and left.
  line((x, y) => Math.min(Math.abs(((x + 50) % 100) - 50), Math.abs(((y + 50) % 100) - 50)) - 0.05, [255, 255, 255], 0.1, 0.16);

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, nativeImage.createFromBitmap(buf, { width: W, height: H }).toPNG());

  // The outline in numbers: where the top and bottom edges are, and how tall the body is.
  const edge = (x, dir) => {
    let hit = null;
    for (let y = dir < 0 ? 0 : STAGE.h; dir < 0 ? y < STAGE.h : y > 0; y -= dir * 0.25) if (body(x, y) < 0) { hit = y; break; }
    return hit;
  };
  const rows = [];
  for (let x = 60; x <= 810; x += 30) {
    const t = edge(x, -1), b = edge(x, 1);
    rows.push(`${x}: ${t === null ? '-' : t.toFixed(0) + '..' + b.toFixed(0) + ' (' + (b - t).toFixed(0) + ')'}`);
  }
  console.log('top..bottom (height) at x:\n  ' + rows.join('\n  '));
  let x0 = null, x1 = null;
  for (let x = 0; x < STAGE.w; x += 0.5) for (let y = 0; y < STAGE.h; y += 2) if (body(x, y) < 0) { if (x0 === null) x0 = x; x1 = x; break; }
  console.log(`extent in x: ${x0}..${x1}; ${path.relative(REPO, OUT)}: ${W}x${H}`);
  app.quit();
});
