/**
 * Glass surfaces: elements whose look is a bitmap from the kiln.
 *
 * A surface is baked when it first gets a size, again 150 ms after its size stops changing (the
 * old bitmap stretches with the box meanwhile), and when the album's colours change. Between
 * those moments nothing runs: the page is finished bitmaps and text.
 */
import { bake, MODE } from './kiln.js';

const SETTLE = 150;      // ms after the last size change before a re-bake
const FADE = 900;        // ms for a new palette to fade in over the old
const STEP = 33;         // ms between fade steps: timed, not a CSS animation, which would redraw at the display's 360 Hz
const surfaces = new Map();   // element -> surface
let palette = { a: [255, 112, 102], b: [255, 166, 140], c: [96, 40, 48] };   // rose, until a cover says otherwise

const px = () => window.devicePixelRatio || 1;

/**
 * Makes an element glass.
 *
 * @param {HTMLElement} el
 * @param {object} look
 * @param {?function(number, number): number[][]} look.shape  the kiln's shape list for a width and
 *   height, in the element's own CSS pixels; by default one rounded box filling the element
 * @param {number} look.glow   extra light inside (a lit pill, the playing row)
 * @param {?function(): number[]} look.melt  for a panel that runs down behind the ribbon: [from, to]
 *   CSS pixels above its bottom edge, between which it melts away so that edge never shows
 * @param {boolean} look.hot   also bake the heated state (bowls: shown on hover and press by CSS)
 * @param {boolean} look.pour  new colours seep through this surface instead of fading in
 */
export function glass(el, { mode = MODE.glass, shape = null, radius = 24, rim = 16, body = 0.62, glow = 0, bleed = 28, hot = false, pour = false, melt = null } = {}) {
  const s = { el, mode, shape, radius, rim, body, glow, bleed, hot, pour, melt, seed: Math.random() * 40, w: 0, h: 0, canvas: null, hotCanvas: null, timer: 0, token: 0 };
  el.classList.add('glass');
  el.style.setProperty('--bleed', bleed + 'px');
  surfaces.set(el, s);
  observer.observe(el);
  return s;
}

const observer = new ResizeObserver((entries) => {
  for (const entry of entries) {
    const s = surfaces.get(entry.target);
    const { inlineSize: w, blockSize: h } = entry.borderBoxSize[0];
    if (!s || (w === s.w && h === s.h)) continue;
    const first = !s.w;
    s.w = w; s.h = h;
    clearTimeout(s.timer);
    if (!w || !h) continue;
    if (first) draw(s); else s.timer = setTimeout(draw, SETTLE, s);
  }
});

function render(s, extra) {
  const b = s.bleed;
  const shapes = (s.shape ? s.shape(s.w, s.h) : [[s.w / 2, s.h / 2, s.w / 2, s.h / 2, s.radius]])
    .map((q) => [q[0] + b, q[1] + b, ...q.slice(2)]);
  return bake({ w: s.w + 2 * b, h: s.h + 2 * b, px: px(), mode: s.mode, shapes, palette, rim: s.rim, body: s.body, heat: s.glow, seed: s.seed, melt: s.melt && s.melt().map((v) => v + b), ...extra });
}

function canvasFor(bitmap, className) {
  const canvas = document.createElement('canvas');
  canvas.className = className;
  canvas.getContext('bitmaprenderer').transferFromImageBitmap(bitmap);
  return canvas;
}

/** Puts a bitmap on a surface: in place, or as a new layer fading in over the old one. */
function put(s, bitmap, fadeDelay = -1) {
  if (s.canvas && fadeDelay < 0) { s.canvas.getContext('bitmaprenderer').transferFromImageBitmap(bitmap); return; }
  const old = s.canvas;
  s.canvas = canvasFor(bitmap, 'glass-bake');
  if (!old) { s.el.prepend(s.canvas); return; }
  s.canvas.style.opacity = 0;
  old.after(s.canvas);
  fading.add({ canvas: s.canvas, old, from: performance.now() + fadeDelay });
  fadeTimer ||= setInterval(stepFades, STEP);
}

const fading = new Set();     // new layers on their way in
let fadeTimer = 0;
function stepFades() {
  const now = performance.now();
  for (const f of fading) {
    const t = (now - f.from) / FADE;
    if (t < 0) continue;
    if (t < 1) { f.canvas.style.opacity = (t * t * (3 - 2 * t)).toFixed(3); continue; }
    f.canvas.style.opacity = '';
    f.old.remove();
    fading.delete(f);
  }
  if (!fading.size) { clearInterval(fadeTimer); fadeTimer = 0; }
}

function draw(s, fadeDelay = -1) {
  s.token++;
  put(s, render(s), fadeDelay);
  if (!s.hot) return;
  const bitmap = render(s, { heat: 1 });
  if (s.hotCanvas) s.hotCanvas.getContext('bitmaprenderer').transferFromImageBitmap(bitmap);
  else s.el.append(s.hotCanvas = canvasFor(bitmap, 'glass-bake glass-hot'));
}

/**
 * The pour: the new colour seeps out from a point (the cover's pocket) and through the surface,
 * the kiln drawing the dye front about 25 times a second for a second. Then the surface is still.
 */
function pourInto(s, old, from) {
  const box = s.el.getBoundingClientRect();
  const origin = [from.x - box.left + s.bleed, from.y - box.top + s.bleed];
  const reach = Math.hypot(s.w, s.h) + 260;
  const token = ++s.token;
  const started = performance.now();
  (function step() {
    if (token !== s.token) return;                         // a newer bake took over
    const t = Math.min(1, (performance.now() - started) / 1150);
    if (t === 1) { draw(s); return; }
    put(s, render(s, { palette: old, next: palette, pour: [...origin, (1 - (1 - t) ** 2.2) * reach] }));
    setTimeout(step, 40);
  })();
}

/**
 * Retunes every surface to a cover's colours. With `from` (a point in the viewport, the cover's
 * centre) the colour travels: it pours through surfaces marked for it and reaches the others as
 * a wave, nearest first. Never a cut.
 */
export function setPalette(next, from = null) {
  const old = palette;
  palette = next;
  for (const s of surfaces.values()) {
    if (!s.w) continue;
    if (from && s.pour) { pourInto(s, old, from); continue; }
    let delay = 0;
    if (from) {
      const box = s.el.getBoundingClientRect();
      delay = Math.min(700, Math.hypot(box.left + box.width / 2 - from.x, box.top + box.height / 2 - from.y) * 0.6);
    }
    draw(s, delay);
  }
}

export const currentPalette = () => palette;
export { MODE };
