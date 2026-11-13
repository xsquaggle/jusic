/**
 * The Mercury ribbon, described once.
 *
 * Everything is in design units: an 860 x 400 stage with the ribbon floating
 * in the middle and room around it for glow and shadow. The shader and the
 * JavaScript hit-test both read these numbers, so what you can click is
 * exactly what you can see.
 */

export const STAGE = { w: 860, h: 400 };

export const L = {
  // Silhouette primitives.
  lobeL: { c: [186, 196], b: [118, 124], r: 106 },
  lobeR: { c: [648, 190], b: [140, 102], r: 98, rot: -0.07 },
  spine: { a: [190, 228], b: [650, 226], ra: 78, rb: 62 },
  pinch: { c: [430, -150], r: 312 },        // presses the top of the waist flat
  lift: { c: [482, 508], r: 230 },          // lifts the lower edge at the waist
  tail: { a: [704, 214], b: [796, 242], ra: 48, rb: 9 },   // the right end draws out into a tapering tail
  blend: 64,

  // The lip: a rounded tube running round the whole outline. It rises steeply from the
  // silhouette to a crest, then falls gently into the body, which lies a little lower.
  edgeR: 17,          // from the silhouette to the crest
  edgeH: 14,          // how high the crest stands
  edgeDip: 5.5,       // how far the body lies below the crest
  edgeIn: 46,         // where the inner face of the lip has levelled out

  // The cover is a glass tile floating just above the body, overlapping its upper-left edge.
  cover: { c: [172, 152], half: 74, r: 19, rot: -0.07 },
  title: { x: 292, y: 197, maxW: 190, size: 24 },
  artist: { x: 293, y: 222, size: 15.5 },

  buttons: [
    { c: [566, 201], r: 24 },     // previous
    { c: [642, 198], r: 37 },     // play / pause
    { c: [718, 201], r: 24 },     // next
  ],
  basin: { c: [642, 198], b: [122, 46], r: 46 },

  seek: { x0: 214, x1: 646 },
  vol: { x0: 658, x1: 744, icon: [634, 0] },

  // Two small dishes set into the lip where it wraps round the right end.
  // They only press in while the pointer is over the widget.
  utils: [
    { c: [777, 186], r: 8.5 },    // open the full app
    { c: [774, 212], r: 8.5 },    // hide the widget
  ],

  // The time preview is drawn in a parked corner of the label sheet and shown
  // through a small lens that rides above the bead.
  tipSlot: [70, 378],
  tipHalf: [25, 11],
};

/* ------------------------------------------------------------ primitives --- */

const smin = (a, b, k) => {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * h * k * (1 / 6);
};
const smax = (a, b, k) => -smin(-a, -b, k);
const mix = (a, b, t) => a + (b - a) * t;
const clamp01 = (t) => Math.min(1, Math.max(0, t));
const smoothstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

function sdRBox(px, py, bx, by, r) {
  const qx = Math.abs(px) - bx + r;
  const qy = Math.abs(py) - by + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}

function sdCapsule(px, py, ax, ay, bx, by, ra, rb) {
  const dx = bx - ax, dy = by - ay;
  const h = Math.hypot(dx, dy);
  const ux = dx / h, uy = dy / h;
  const lx = Math.abs((px - ax) * uy - (py - ay) * ux);   // across
  const ly = (px - ax) * ux + (py - ay) * uy;             // along
  const b = (ra - rb) / h;
  const a = Math.sqrt(1 - b * b);
  const k = lx * -b + ly * a;
  if (k < 0) return Math.hypot(lx, ly) - ra;
  if (k > a * h) return Math.hypot(lx, ly - h) - rb;
  return lx * a + ly * b - ra;
}

/**
 * Signed distance to the ribbon's outline, negative inside.
 * @param {number} swell how far the lobes are breathing out with the bass
 */
export function bodySdf(x, y, swell = 0) {
  const { lobeL, lobeR, spine, pinch, lift, tail, blend } = L;

  let d = sdRBox(x - lobeL.c[0], y - lobeL.c[1], lobeL.b[0] + swell, lobeL.b[1] + swell, lobeL.r);
  d = smin(d, sdCapsule(x, y, spine.a[0], spine.a[1], spine.b[0], spine.b[1], spine.ra, spine.rb), blend);

  const cr = Math.cos(lobeR.rot), sr = Math.sin(lobeR.rot);
  const rx = x - lobeR.c[0], ry = y - lobeR.c[1];
  d = smin(d, sdRBox(cr * rx - sr * ry, sr * rx + cr * ry, lobeR.b[0] + swell, lobeR.b[1] + swell, lobeR.r), blend);

  d = smin(d, sdCapsule(x, y, tail.a[0], tail.a[1], tail.b[0], tail.b[1], tail.ra, tail.rb), 26);
  d = smax(d, -(Math.hypot(x - pinch.c[0], y - pinch.c[1]) - pinch.r), 54);
  d = smax(d, -(Math.hypot(x - lift.c[0], y - lift.c[1]) - lift.r), 44);
  return d;
}

/* ---------------------------------------------------------------- curves --- */

/** Where the outline is at a given x: dir -1 for the top edge, +1 for the bottom. */
function edgeY(x, dir) {
  let inside = 212, outside = dir < 0 ? 30 : 390;
  for (let i = 0; i < 36; i++) {
    const m = (inside + outside) / 2;
    if (bodySdf(x, m) < 0) inside = m; else outside = m;
  }
  return (inside + outside) / 2;
}

function table(n, x0, x1, fn, smooth = 3) {
  let t = Array.from({ length: n }, (_, i) => fn(mix(x0, x1, i / (n - 1)), i / (n - 1)));
  for (let pass = 0; pass < smooth; pass++) {
    t = t.map((v, i) => (i === 0 || i === n - 1 ? v : (t[i - 1] + 2 * v + t[i + 1]) / 4));
  }
  return t;
}

/** Catmull-Rom through an evenly spaced table. The shader runs the same sum. */
function sample(tab, t) {
  const n = tab.length;
  const f = clamp01(t) * (n - 1);
  const i = Math.min(n - 2, Math.floor(f));
  const u = f - i;
  const p0 = tab[Math.max(i - 1, 0)], p1 = tab[i], p2 = tab[i + 1], p3 = tab[Math.min(i + 2, n - 1)];
  return 0.5 * (2 * p1 + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u + (-p0 + 3 * p1 - 3 * p2 + p3) * u * u * u);
}

export const SEEK_N = 33;
export const VOL_N = 9;

// The timeline follows the ribbon's lower edge: wide of it under the cover,
// closing on it where the waist lifts (but staying clear of the lip), easing away again.
const SEEK_TAB = table(SEEK_N, L.seek.x0, L.seek.x1, (x, t) =>
  edgeY(x, 1) - (mix(46, 22, smoothstep(0, 0.62, t)) + 11 * smoothstep(0.62, 1, t)));

// Volume rides the middle of the lip, between the outline and the fold.
const foldY = (x) => {
  const { c, b, r } = L.basin;
  const dx = Math.max(0, Math.abs(x - c[0]) - (b[0] - r));
  return c[1] - Math.sqrt(Math.max(0, r * r - dx * dx));
};
const VOL_TAB = table(VOL_N, L.vol.x0, L.vol.x1, (x) => mix(edgeY(x, -1), foldY(x), 0.54), 2);

export const seekY = (x) => sample(SEEK_TAB, (x - L.seek.x0) / (L.seek.x1 - L.seek.x0));
export const volY = (x) => sample(VOL_TAB, (x - L.vol.x0) / (L.vol.x1 - L.vol.x0));
export const seekX = (progress) => mix(L.seek.x0, L.seek.x1, clamp01(progress));
export const seekProgress = (x) => clamp01((x - L.seek.x0) / (L.seek.x1 - L.seek.x0));
export const volX = (v) => mix(L.vol.x0, L.vol.x1, clamp01(v));
export const volValue = (x) => clamp01((x - L.vol.x0) / (L.vol.x1 - L.vol.x0));
L.vol.icon[1] = volY(L.vol.x0) - 0.5;

/** Signed distance to the cover tile, negative inside. (cx, cy) lets the caller pass its floating position. */
export function tileSdf(x, y, cx = L.cover.c[0], cy = L.cover.c[1]) {
  const c = Math.cos(-L.cover.rot), s = Math.sin(-L.cover.rot);
  const dx = x - cx, dy = y - cy;
  return sdRBox(c * dx - s * dy, s * dx + c * dy, L.cover.half, L.cover.half, L.cover.r);
}

/* --------------------------------------------------------------- hit test --- */

/**
 * What is under a point. The visible drop is three things: the top face, the
 * underside showing below it, and the cover tile floating over one end.
 * @param {{swell?:number, wall?:number[], tile?:number[]}} f live state: lobe swell, where the underside sits, where the tile is
 * @returns {{inside:boolean, d:number, target:string|null, index?:number}}
 */
export function hit(x, y, f = {}) {
  const swell = f.swell || 0;
  const wall = f.wall || [0, 11];
  const tile = f.tile || L.cover.c;
  const dTop = bodySdf(x, y, swell);
  const dTile = tileSdf(x, y, tile[0], tile[1]);
  const d = Math.min(dTop, bodySdf(x - wall[0], y - wall[1], swell), dTile);
  const out = { inside: d < 0, d, target: null };
  if (!out.inside) return out;
  if (dTile < 0) return { ...out, target: 'cover' };
  if (dTop >= 0) return { ...out, target: 'body' };          // the underside: grab it to drag

  for (let i = 0; i < L.buttons.length; i++) {
    const b = L.buttons[i];
    if (Math.hypot(x - b.c[0], y - b.c[1]) < b.r + 2) return { ...out, target: 'button', index: i };
  }
  for (let i = 0; i < L.utils.length; i++) {
    const u = L.utils[i];
    if (Math.hypot(x - u.c[0], y - u.c[1]) < u.r + 4) return { ...out, target: 'util', index: i };
  }
  if (x > L.seek.x0 - 14 && x < L.seek.x1 + 14 && Math.abs(y - seekY(x)) < 13) return { ...out, target: 'seek' };
  if (x > L.vol.x0 - 12 && x < L.vol.x1 + 12 && Math.abs(y - volY(x)) < 13) return { ...out, target: 'volume' };
  if (Math.hypot(x - L.vol.icon[0], y - L.vol.icon[1]) < 13) return { ...out, target: 'mute' };
  return { ...out, target: 'body' };
}

/* ------------------------------------------------------------------ GLSL --- */

const f1 = (n) => {
  const s = String(Math.round(n * 1000) / 1000);
  return s.includes('.') || s.includes('e') ? s : s + '.';
};
const v2 = (a) => `vec2(${f1(a[0])}, ${f1(a[1])})`;
const arr = (t) => `float[${t.length}](${t.map(f1).join(', ')})`;

/** The same outline and curves, for the shaders. Generated so the two can never drift apart. */
export const SHAPE_GLSL = /* glsl */`
const vec2 STAGE = vec2(${f1(STAGE.w)}, ${f1(STAGE.h)});
const float EDGE_R = ${f1(L.edgeR)};
const float EDGE_H = ${f1(L.edgeH)};
const float EDGE_DIP = ${f1(L.edgeDip)};
const float EDGE_IN = ${f1(L.edgeIn)};
const vec2 COVER_C = ${v2(L.cover.c)};
const float COVER_HALF = ${f1(L.cover.half)};
const float COVER_R = ${f1(L.cover.r)};
const float COVER_ROT = ${f1(L.cover.rot)};
const vec2 BASIN_C = ${v2(L.basin.c)};
const vec2 BASIN_B = ${v2(L.basin.b)};
const float BASIN_R = ${f1(L.basin.r)};
const vec2 SEEK_X = vec2(${f1(L.seek.x0)}, ${f1(L.seek.x1)});
const vec2 VOL_X = vec2(${f1(L.vol.x0)}, ${f1(L.vol.x1)});
const float SEEK_TAB[${SEEK_N}] = ${arr(SEEK_TAB)};
const float VOL_TAB[${VOL_N}] = ${arr(VOL_TAB)};
const vec3 UTIL0 = vec3(${f1(L.utils[0].c[0])}, ${f1(L.utils[0].c[1])}, ${f1(L.utils[0].r)});
const vec3 UTIL1 = vec3(${f1(L.utils[1].c[0])}, ${f1(L.utils[1].c[1])}, ${f1(L.utils[1].r)});
const vec2 TIP_SLOT = ${v2(L.tipSlot)};
const vec2 TIP_HALF = ${v2(L.tipHalf)};

float smin(float a, float b, float k) {
  float h = max(k - abs(a - b), 0.) / k;
  return min(a, b) - h * h * h * k * (1. / 6.);
}
float smax(float a, float b, float k) { return -smin(-a, -b, k); }

float sdRBox(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.)) + min(max(q.x, q.y), 0.) - r;
}

float sdCapsule(vec2 p, vec2 a, vec2 b, float ra, float rb) {
  vec2 d = b - a;
  float h = length(d);
  vec2 u = d / h;
  vec2 q = vec2(abs((p.x - a.x) * u.y - (p.y - a.y) * u.x), dot(p - a, u));
  float bb = (ra - rb) / h;
  float aa = sqrt(1. - bb * bb);
  float k = dot(q, vec2(-bb, aa));
  if (k < 0.) return length(q) - ra;
  if (k > aa * h) return length(q - vec2(0., h)) - rb;
  return dot(q, vec2(aa, bb)) - ra;
}

float catmull(float p0, float p1, float p2, float p3, float u) {
  return .5 * (2. * p1 + (-p0 + p2) * u + (2. * p0 - 5. * p1 + 4. * p2 - p3) * u * u + (-p0 + 3. * p1 - 3. * p2 + p3) * u * u * u);
}
float seekY(float x) {
  float f = clamp((x - SEEK_X.x) / (SEEK_X.y - SEEK_X.x), 0., 1.) * ${f1(SEEK_N - 1)};
  int i = min(${SEEK_N - 2}, int(floor(f)));
  return catmull(SEEK_TAB[max(i - 1, 0)], SEEK_TAB[i], SEEK_TAB[i + 1], SEEK_TAB[min(i + 2, ${SEEK_N - 1})], f - float(i));
}
float volY(float x) {
  float f = clamp((x - VOL_X.x) / (VOL_X.y - VOL_X.x), 0., 1.) * ${f1(VOL_N - 1)};
  int i = min(${VOL_N - 2}, int(floor(f)));
  return catmull(VOL_TAB[max(i - 1, 0)], VOL_TAB[i], VOL_TAB[i + 1], VOL_TAB[min(i + 2, ${VOL_N - 1})], f - float(i));
}

// swell: the lobes breathing out with the bass.
float bodySdf(vec2 p, float swell) {
  float d = sdRBox(p - ${v2(L.lobeL.c)}, ${v2(L.lobeL.b)} + swell, ${f1(L.lobeL.r)});
  d = smin(d, sdCapsule(p, ${v2(L.spine.a)}, ${v2(L.spine.b)}, ${f1(L.spine.ra)}, ${f1(L.spine.rb)}), ${f1(L.blend)});
  vec2 r = p - ${v2(L.lobeR.c)};
  float cr = ${f1(Math.cos(L.lobeR.rot))}, sr = ${f1(Math.sin(L.lobeR.rot))};
  d = smin(d, sdRBox(vec2(cr * r.x - sr * r.y, sr * r.x + cr * r.y), ${v2(L.lobeR.b)} + swell, ${f1(L.lobeR.r)}), ${f1(L.blend)});
  d = smin(d, sdCapsule(p, ${v2(L.tail.a)}, ${v2(L.tail.b)}, ${f1(L.tail.ra)}, ${f1(L.tail.rb)}), 26.);
  d = smax(d, -(length(p - ${v2(L.pinch.c)}) - ${f1(L.pinch.r)}), 54.);
  d = smax(d, -(length(p - ${v2(L.lift.c)}) - ${f1(L.lift.r)}), 44.);
  return d;
}
`;
