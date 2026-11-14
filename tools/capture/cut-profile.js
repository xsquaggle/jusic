/**
 * How the light lies across the drop from its upper edge to its lower edge, at five places along
 * it: the main reference against one of our shots, as numbers. No window is opened. It is the
 * companion of ring-profile.js, which does the same for the ring of glass round the cover.
 *
 *   npx electron tools/capture/cut-profile.js shot=design/captures/raw/roundNN/dark.png
 *
 * Each cut is a vertical line. Along it the brightness is read from the upper silhouette (the
 * first column) to the lower one (the last) and printed as a row of 40 digits (0 black to 9
 * white), then how warm the light is (red over blue, 0 neutral to 9 strongly coral), with the
 * drop's height there in stage units. The reference is in perspective and ours is square on,
 * so compare the rows by shape, column for column. Words, the timeline and the buttons show in
 * the rows as short bright runs: they are marked in neither picture.
 *
 * Use a shot of the dark desktop ('dark.png'): the reference stands on a dark ground too.
 */
const { app, nativeImage } = require('electron');
const path = require('path');

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.split('=')));
const REPO = path.resolve(__dirname, '..', '..');
const COLS = 40;

// The reference, read off the picture (1586 x 992): where each cut is, and roughly where the
// silhouette's upper and lower edges are there (refined from the picture). 2.03 of its pixels
// make a stage unit at the bulb.
const REF = { file: 'design/references/widget-mercury.png', unit: 2.03, cuts: {
  gap: { x: 476, top: 300, bottom: 742 },       // between the cover and the title
  title: { x: 650, top: 392, bottom: 728 },     // through the middle of the title
  waist: { x: 900, top: 405, bottom: 655 },     // between the title's end and the first button
  play: { x: 1237, top: 258, bottom: 662 },     // through the play button
  end: { x: 1470, top: 300, bottom: 600 },      // between the last button and the right end
} };

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

/** The outermost point within 40 px of 'guess' that stands out from the dark beyond it. dir: -1 looks for an upper edge, 1 for a lower. */
function edge(img, x, guess, dir) {
  const l = (y) => lumOf(at(img, x, y));
  let ground = 1;
  for (let y = guess + dir * 40; Math.abs(y - guess) <= 60; y += dir * 2) ground = Math.min(ground, l(y));
  for (let y = guess + dir * 40; (y - guess) * dir >= -40; y -= dir) if (l(y) > ground + 0.08) return y;
  return guess;
}

function row(img, x, top, bottom) {
  let lum = '', warm = '';
  for (let i = 0; i < COLS; i++) {
    const p = at(img, x, top + (bottom - top) * ((i + 0.5) / COLS));
    lum += Math.min(9, Math.round(lumOf(p) * 9));
    warm += Math.min(9, Math.max(0, Math.round((p[0] - p[2]) * 12)));
  }
  return { lum, warm };
}

app.whenReady().then(async () => {
  const { L, bodySdf } = await import(require('url').pathToFileURL(path.join(REPO, 'prototypes', 'mercury', 'shape.js')).href);
  const shot = args.shot || 'design/captures/raw/round26/dark.png';
  const ref = load(REF.file), ours = load(shot);
  const k = ours.width / 960;                    // the shot is 960 CSS px wide with the stage 50, 40 in
  // Our cuts, from shape.js: the same places by what lies there.
  const b = L.buttons, titleEnd = L.title.x + L.title.maxW;
  let xEnd = b[2].c[0];
  while (bodySdf(xEnd, b[2].c[1]) < 0) xEnd += 1;
  const X = {
    gap: (L.cover.c[0] + L.cover.half + L.title.x) / 2,
    title: L.title.x + L.title.maxW / 2,
    waist: (titleEnd + b[0].c[0] - b[0].r) / 2,
    play: b[1].c[0],
    end: b[2].c[0] + 0.48 * (xEnd - b[2].c[0]),
  };
  console.log(`reference ${ref.width}x${ref.height}; ours ${ours.width}x${ours.height} (${shot})`);
  console.log('per cut: the drop\'s height there in stage units, brightness 0-9 from its upper edge to its lower, then warmth 0-9\n');
  for (const name of Object.keys(REF.cuts)) {
    const c = REF.cuts[name];
    const rt = edge(ref, c.x, c.top, -1), rb = edge(ref, c.x, c.bottom, 1);
    const a = row(ref, c.x, rt, rb);
    let top = 0, bottom = 400;
    while (top < 400 && bodySdf(X[name], top) >= 0) top += 0.5;
    while (bottom > 0 && bodySdf(X[name], bottom) >= 0) bottom -= 0.5;
    const o = row(ours, (X[name] + 50) * k, (top + 40) * k, (bottom + 40) * k);
    const w = (v) => String(Math.round(v)).padStart(4);
    console.log(`${name.padEnd(6)} ref  ${w((rb - rt) / REF.unit)}  ${a.lum}   warm ${a.warm}`);
    console.log(`${name.padEnd(6)} ours ${w(bottom - top)}  ${o.lum}   warm ${o.warm}\n`);
  }
  app.quit();
});
