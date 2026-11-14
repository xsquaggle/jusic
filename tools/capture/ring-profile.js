/**
 * How the light lies across the ring of glass round the cover: the main reference against one
 * of our shots, as numbers. No window is opened.
 *
 *   npx electron tools/capture/ring-profile.js shot=design/captures/raw/roundNN/dark.png
 *
 * From the middle of the cover, rays go out to the left, up, down and along the diagonals. Along
 * each ray the brightness is read from the cover's edge to the silhouette and printed as a row
 * of digits (0 black to 9 white), with a second row for how warm the light is (red over blue, 0
 * neutral to 9 strongly coral). The reference is in perspective and ours is square on, so each
 * ray is stretched to run from the cover's edge (the ':') to the silhouette (the '|') in both,
 * 30 columns apart: compare the rows by shape, column for column. The width of the ring along
 * the ray is printed too, in stage units, because the two do not have the same widths.
 *
 * Use a shot of the dark desktop ('dark.png'): the reference stands on a dark ground too.
 */
const { app, nativeImage } = require('electron');
const path = require('path');

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.split('=')));
const REPO = path.resolve(__dirname, '..', '..');

// 'down' leans a little to the left, to pass the time label in both pictures.
const RAYS = [
  { name: 'up        ', a: 90 },
  { name: 'up-left   ', a: 135 },
  { name: 'left      ', a: 180 },
  { name: 'down-left ', a: 225 },
  { name: 'down      ', a: 258 },
];
const COLS = 30;        // samples between the cover's edge and the silhouette
const PAD = 4;          // ...and this many more before and after

// The reference, read off the picture (change these if it is ever replaced): the cover's middle,
// half-width and half-height in its pixels (140 to 447 across, 278 to 568 down), its corner radius, and how many of its pixels make a stage unit
// at the bulb (its bulb is 260 px in radius where ours is 128 units).
const REF = { file: 'design/references/widget-mercury.png', c: [293.5, 423], half: 153.5, halfV: 145, corner: 40, unit: 2.03,
  // roughly where the silhouette is along each ray, in px from the cover's middle; refined below
  out: { 90: 216, 135: 245, 180: 251, 225: 280, 258: 318 } };
// Ours comes from shape.js when the tool starts: the shot is 960 CSS px wide with the stage 50, 40 in.
let OURS = null;

function load(file) {
  const img = nativeImage.createFromPath(path.resolve(REPO, file));
  const { width, height } = img.getSize();
  if (!width) throw new Error('cannot read ' + file);
  return { width, height, data: img.toBitmap() };      // BGRA
}
function at(img, x, y) {
  let r = 0, g = 0, b = 0, n = 0;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const xx = Math.min(img.width - 1, Math.max(0, Math.round(x) + dx)), yy = Math.min(img.height - 1, Math.max(0, Math.round(y) + dy));
    const i = (yy * img.width + xx) * 4;
    b += img.data[i]; g += img.data[i + 1]; r += img.data[i + 2]; n++;
  }
  return [r / n / 255, g / n / 255, b / n / 255];
}
const lumOf = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const dir = (deg) => { const rad = deg * Math.PI / 180; return [Math.cos(rad), -Math.sin(rad)]; };

/** How far along a ray a square with round corners ends (half-width h, vertical half hv, corner radius r). */
function coverEdge(deg, h, hv, r) {
  const [ux, uy] = dir(deg);
  let lo = 0, hi = 3 * h;
  for (let i = 0; i < 40; i++) {
    const d = (lo + hi) / 2, x = Math.abs(ux * d), y = Math.abs(uy * d);
    const qx = Math.max(x - (h - r), 0), qy = Math.max(y - (hv - r), 0);
    const inside = x <= h && y <= hv && Math.hypot(qx, qy) <= r;
    if (inside) lo = d; else hi = d;
  }
  return lo;
}

/** The outermost point near 'guess' that still stands out from the dark beyond it. */
function silhouette(img, c, deg, guess) {
  const [ux, uy] = dir(deg);
  const l = (d) => lumOf(at(img, c[0] + ux * d, c[1] + uy * d));
  // (The ground is read close outside the guess: under the drop the floor has light on it not far below.)
  let ground = 1;
  for (let d = guess * 1.1; d <= guess * 1.16; d += 2) ground = Math.min(ground, l(d));
  for (let d = guess * 1.1; d >= guess * 0.85; d -= 1) if (l(d) > ground + 0.09) return d;
  return guess;
}

function profile(img, c, deg, from, to) {
  const [ux, uy] = dir(deg);
  let lum = '', warm = '';
  for (let i = -PAD; i <= COLS + PAD; i++) {
    const d = from + (to - from) * (i / COLS);
    const p = at(img, c[0] + ux * d, c[1] + uy * d);
    const mark = i === 0 ? ':' : i === COLS ? '|' : '';
    lum += mark + Math.min(9, Math.round(lumOf(p) * 9));
    warm += mark + Math.min(9, Math.max(0, Math.round((p[0] - p[2]) * 12)));
  }
  return { lum, warm };
}

app.whenReady().then(async () => {
  const { L, tileSdf } = await import(require('url').pathToFileURL(path.join(REPO, 'prototypes', 'mercury', 'shape.js')).href);
  OURS = { cover: L.cover.c, half: L.cover.half, corner: L.cover.r, squash: L.cover.squash, bulb: L.lobeL.c, r: L.lobeL.r };
  const shot = args.shot || 'design/captures/raw/round24/dark.png';
  const ref = load(REF.file), ours = load(shot);
  const k = ours.width / 960;
  const oc = [(OURS.cover[0] + 50) * k, (OURS.cover[1] + 40) * k];
  console.log(`reference ${ref.width}x${ref.height}; ours ${ours.width}x${ours.height} (${shot})`);
  console.log('per ray: the ring\'s width in stage units, brightness 0-9 from the cover\'s edge ":" to the silhouette "|", then warmth 0-9\n');
  for (const ray of RAYS) {
    // the reference
    const rFrom = coverEdge(ray.a, REF.half, REF.halfV, REF.corner);
    const rTo = silhouette(ref, REF.c, ray.a, REF.out[ray.a]);
    const a = profile(ref, REF.c, ray.a, rFrom, rTo);
    // ours: out of the cover, and out of the bulb's circle
    const [ux, uy] = dir(ray.a);
    let lo = 0, hi = 3 * OURS.half;
    for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (tileSdf(OURS.cover[0] + ux * m, OURS.cover[1] + uy * m) < 0) lo = m; else hi = m; }
    const oFrom = lo;
    const ox = OURS.cover[0] - OURS.bulb[0], oy = OURS.cover[1] - OURS.bulb[1];
    const bq = ox * ux + oy * uy;
    const oTo = -bq + Math.sqrt(Math.max(bq * bq - (ox * ox + oy * oy - OURS.r * OURS.r), 0));
    const b = profile(ours, oc, ray.a, oFrom * k, oTo * k);
    const w = (v) => String(Math.round(v)).padStart(3);
    console.log(`${ray.name} ref  ${w((rTo - rFrom) / REF.unit)}  ${a.lum}   warm ${a.warm}`);
    console.log(`${ray.name} ours ${w(oTo - oFrom)}  ${b.lum}   warm ${b.warm}\n`);
  }
  app.quit();
});
