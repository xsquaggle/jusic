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
  lobeL: { c: [186, 197], r: 128 },          // the left lobe: a full round bulb
  // The body drawing out of the bulb toward the waist. Its lower edge is one long straight
  // rise, which the timeline rides; its upper edge is cut away by the pinch.
  bridge: { a: [236, 226], b: [545, 200], ra: 96, rb: 72, k: 36 },
  // The right lobe: a round shoulder and, beyond it, the end itself, a little smaller and lower.
  lobeR: { c: [645, 189], r: 101, k: 40 },
  crest: { c: [706, 198], r: 88, k: 50 },
  // The right lobe's upper shoulder (round 41). Traced off the reference, its top edge stays near y 87
  // to 89 out to x 700 and then falls steeply to the right end; ours fell from x 650 and lay 9 to 11
  // units lower from x 700 to 750. This circle fits theirs from x 700 to 780 and meets the right side
  // where ours already did. Below y 'below' it adds nothing (it would have bulged the lower edge), and
  // it is blended into the body over k.
  shoulder: { c: [680, 200], r: 112.5, below: 200, kb: 14, k: 6 },
  // What is cut away under the right end, so the outline comes over the top, down the end and
  // back along a rising lower edge: a soft crest instead of a tail.
  // (Near the tip, where the cut meets the end, it is turned sharply, as the reference's end
  // curls to a point: k there is kTip, eased in between the two x of 'tip'. Measured against the
  // reference, the rest of the right end's silhouette already lies within three units of theirs.)
  cut: { c: [838.7, 422.6], r: 200, k: 24, kTip: 8, tip: [745, 785] },
  // The top of the waist: one arc, struck from above, that both lobes run into without a corner.
  pinch: { c: [425, -41], r: 210, k: 30 },

  // The upper lip is a second layer lying over the pod the buttons sit in. Its leading edge is
  // an arch: a flat arc over the top of the pod that runs on as a long diagonal down to the right
  // silhouette (since round 38; before, a leg turned it down inside the end), and
  // at the waist a leg that sweeps down and away to the left under the words, so the whole
  // edge is an S. Under the arch lie the pod and, below the pod's own soft rim, the strip
  // that carries the timeline.
  arch: { c: [629, 420], r: 273, kl: 36, kr: 40 },   // the arc over the pod, and how softly it turns into each leg
  band: { c: [441, 150], r: 93 },                    // the waist leg is the edge of this circle
  end: { c: [700, 196], r: 68, leg: false },        // the right leg, the right half of this circle: off since round 38 (the arc runs on to the silhouette)
  rim: { c: [642, -33], r: 271 },                    // the pod's lower rim
  // Past the bottom of the band circle the waist leg runs on under the words, nearly level and
  // falling a little, to the cover's lower right corner, as the reference's does: it is one S from
  // the cover to the right end. (y at x, how much it falls per unit to the left, and the x over
  // which it takes over from the band circle.)
  run: { x: 441, y: 244, fall: 0.035, blend: [422, 442] },
  // (Round 49, at the owner's word: "It should be the same exact line ... that runs underneath the
  // artist name and title and up over the buttons. That line should run and should be what the album
  // cover sits on. The album cover should look a little bit heavy squishing into it." So the line runs
  // on left under the cover: between the x of 'blend' it turns from the run to follow the cover's
  // tilted lower edge (y 'at' at x 'at', falling 'slope' per unit), 'gap' units below it, so the
  // cover rests on the roll of the edge; and it sags by 'sag' under the cover's middle 'c' (over 'w')
  // where its weight presses. It fades in from the bulb's rim at lipFade. Until round 48 it melted
  // away beside the cover, between x 266 and 304, and the cover had no seat.)
  seat: { blend: [305, 255], at: [190, 253.5], slope: -0.096, gap: 3.5, sag: 2.5, c: 188, w: 48 },
  lipFade: [92, 128],
  lipH: 7,            // how high the lip's rolled leading edge stands
  lipRoll: 7,         // how wide that roll is
  lipDome: 5,         // how full the lip is between its leading edge and the outline
  bandH: 5.5,         // the ridge the lip narrows to where it sweeps through the waist
  podD: 6.5,          // how far the pod lies below the strip

  // The outer edge: a rounded tube running round the whole outline. It rises steeply from the
  // silhouette to a crest, then falls gently into the body, which lies a little lower.
  // (Through the waist, where the body is thin and the words and the timeline lie close to
  // the outline. On the two lobes the same tube is half as wide again: the 'Lobe' numbers.)
  edgeR: 17,          // from the silhouette to the crest
  edgeH: 14,          // how high the crest stands
  edgeDip: 5.5,       // how far the body lies below the crest
  edgeIn: 46,         // where the inner face of the lip has levelled out
  edgeRLobe: 25,
  edgeHLobe: 19,
  edgeInLobe: 58,
  bulbCrown: 15,      // how far the middle of the bulb stands above its rim's foot

  // The cover is a glass tile lying in the bulb, inside its rim all the way round. It presses
  // into the liquid, and it leans back: its far (upper) edge is drawn a little narrower and
  // the whole a little shorter, as a slab seen from in front and above.
  // (Its place in the bulb is the main reference's, measured: tools/capture/ring-profile.js.)
  // (Round 49, at the owner's word: it is also turned about its upright axis, its right side pushed
  // back by 'yaw' (12 degrees), seen in perspective from 'persp' units away, so its right edge is
  // drawn about 5% shorter than its left, as the flow reference's cover is.)
  cover: { c: [188, 175], half: 74, r: 19, rot: -0.07, lean: 0.0012, squash: 0.965, yaw: 0.21, persp: 600 },
  // The hollow it presses: how deep, how far out the liquid starts to sink toward it, and how
  // high what it pushes aside stands up beyond that.
  // (Round 49, the owner: the cover "a little bit heavy squishing into it". It presses deeper, 6 where it
  // was 4, and the glass it pushes aside stands up a little beyond.)
  press: { d: 6, w: 24, swell: 1.5 },
  // The pocket the cover lies in, as in the main reference: the glass ends at the cover in a
  // crisp rounded wall (d deep, over the last w units before the tile's edge), and stands a
  // little proud all round as a bank (rise high, dying away over 'out' units beyond the wall).
  pocket: { d: 16, w: 12, rise: 6, out: 14 },
  title: { x: 292, y: 197, maxW: 196, size: 24 },   // it stops short of the lip's waist leg; a long title is set smaller, down to three quarters
  artist: { x: 293, y: 222, size: 15.5, maxW: 180 },   // shorter than the title: the lip's waist leg passes its far end

  // (Round 40: 3.5 and 2.5 units larger, as the reference's are, about 28, 40 and 27 measured on
  // it, so that they nearly touch one another and the pod's rims. They were 24, 37 and 24.)
  buttons: [
    { c: [566, 193], r: 27.5 },   // previous
    { c: [642, 190], r: 39.5 },   // play / pause
    { c: [716, 195], r: 27.5 },   // next (2 left and 2 down, so its rim keeps clear of the lip's edge)
  ],

  // The timeline: level under the cover (y0, as far as x 'rise'), rising in one smooth S to its
  // crest under the waist, then easing a little down again to its right end (y1). Followed off both
  // references column by column (round 46, at the owner's word: "curve it gently downward beneath
  // the album-cover area, then sweep it smoothly upward"); it was one straight rise, 279 to 247.
  seek: { x0: 214, x1: 646, y0: 283, y1: 255, rise: 270, crest: [520, 248] },
  // (Round 41: 97 units long, from x 645 to 742, and 3.5 higher, as the reference's line is; it was
  // 86 long from 628 at y 127. The speaker keeps 23 units before it, level with it.)
  vol: { x0: 645, x1: 742, y: 123.5, icon: [622, 123.5] },

  // Two small beads of liquid glass beside the right end, each holding one control. They bud off
  // the end while the pointer is over its right side and rest just clear of it (the owner's word on
  // 16 November 2026: two separate small beads of liquid glass to the right, not inside the drop;
  // they were dishes pressed into the lip). c is where each rests; it grows out of the end from
  // 'from' units further left, joined to it by a neck (smoothed by k) until it pinches off.
  utils: [
    { c: [807, 184], r: 8.5 },    // open the full app
    { c: [807, 211], r: 8.5 },    // hide the widget
  ],
  // side: the pointer brings the beads out anywhere right of this x on the drop; reach: how far
  // beyond the end's edge the gap between it and the beads still counts as the widget's.
  beads: { from: 14, k: 6, side: 690, reach: 26 },

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
  const { lobeL, lobeR, crest, shoulder, bridge, pinch, cut } = L;

  let d = Math.hypot(x - lobeL.c[0], y - lobeL.c[1]) - (lobeL.r + swell);
  d = smin(d, sdCapsule(x, y, bridge.a[0], bridge.a[1], bridge.b[0], bridge.b[1], bridge.ra, bridge.rb), bridge.k);

  d = smin(d, Math.hypot(x - lobeR.c[0], y - lobeR.c[1]) - (lobeR.r + swell), lobeR.k);
  d = smin(d, Math.hypot(x - crest.c[0], y - crest.c[1]) - (crest.r + swell), crest.k);
  d = smin(d, smax(Math.hypot(x - shoulder.c[0], y - shoulder.c[1]) - (shoulder.r + swell), y - shoulder.below, shoulder.kb), shoulder.k);
  d = smax(d, -(Math.hypot(x - pinch.c[0], y - pinch.c[1]) - pinch.r), pinch.k);
  d = smax(d, -(Math.hypot(x - cut.c[0], y - cut.c[1]) - cut.r), mix(cut.k, cut.kTip, smoothstep(cut.tip[0], cut.tip[1], x)));
  return d;
}

/** Where the lip's leading edge runs under the words and on under the cover (round 49: its seat). */
function runY(x) {
  const { run, seat } = L;
  const along = run.y + run.fall * Math.max(run.x - x, 0);
  const under = seat.at[1] + seat.slope * (x - seat.at[0]) + seat.gap + seat.sag * Math.exp(-(((x - seat.c) / seat.w) ** 2));
  return mix(along, under, smoothstep(seat.blend[0], seat.blend[1], x));
}

/**
 * Signed distance to the upper lip's leading edge: negative under the arch (the pod and the
 * strip below it), positive on the lip.
 */
export function archSdf(x, y) {
  const { arch, band, end, run } = L;
  let d = smax(Math.hypot(x - arch.c[0], y - arch.c[1]) - arch.r, band.r - Math.hypot(x - band.c[0], y - band.c[1]), arch.kl);
  // Under the words the waist leg runs on as a nearly level line (positive above it, on the lip), and on
  // under the cover as its seat.
  d = mix(runY(x) - y, d, smoothstep(run.blend[0], run.blend[1], x));
  // On the right the arc runs on as a long diagonal down to the silhouette, meeting it at about
  // (790, 198), as the reference's edge does: the lower right below it is open body, where the
  // coral point lies. (Round 38. Before, the right leg, the edge of the 'end' circle, turned it
  // down inside the end and closed the pod off there, so the whole end lay under the lip and the
  // light along the edge came out 10 to 15 units lower than the reference's at x 750 to 765.)
  return L.end.leg ? (x < end.c[0] ? d : smax(d, Math.hypot(x - end.c[0], y - end.c[1]) - end.r, arch.kr)) : d;
}

/**
 * Where the arch exists as an edge at all: over and round the pod, down its diagonal to the right
 * silhouette, and along the waist leg, which melts away to the left.
 * Under the pod's rim, between the two legs, there is no edge: that is the strip.
 */
export function archOn(x, y) {
  const below = smoothstep(0, 14, Math.hypot(x - L.rim.c[0], y - L.rim.c[1]) - L.rim.r);
  const legs = Math.max(smoothstep(560, 530, x), smoothstep(735, 752, x));
  return Math.max(1 - below, legs) * smoothstep(L.lipFade[0], L.lipFade[1], x);
}

/** The pod: under the arch and above its own lower rim. Negative inside. */
export function podSdf(x, y) {
  return Math.max(archSdf(x, y), Math.hypot(x - L.rim.c[0], y - L.rim.c[1]) - L.rim.r);
}

/* ---------------------------------------------------------------- curves --- */

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

// The timeline is a shallow flowing curve, as both references' is: level under the cover, so the
// cover has room to sit in the glass above it; then one S rising to its crest under the waist,
// steeper in its first half (the references' rise, measured: a smoothstep begun a little early);
// then easing down by a few units under the buttons to its end. (Round 46. It was one straight
// rise, which ran up close under the cover's lower right corner.)
const seekPath = (x) => {
  const { y0, y1, rise, crest } = L.seek;
  if (x <= crest[0]) {
    const t = (x - rise) / (crest[0] - rise);
    const r = (smoothstep(0, 1, (t + 0.12) / 1.12) - smoothstep(0, 1, 0.12 / 1.12)) / (1 - smoothstep(0, 1, 0.12 / 1.12));
    return t <= 0 ? y0 : mix(y0, crest[1], r);
  }
  return mix(crest[1], y1, smoothstep(crest[0], L.seek.x1, x));
};
const SEEK_TAB = table(SEEK_N, L.seek.x0, L.seek.x1, seekPath, 1);

// Volume lies level across the flat of the upper lip, between the crest of the outer edge
// and the roll of the lip's leading edge.
const VOL_TAB = table(VOL_N, L.vol.x0, L.vol.x1, () => L.vol.y, 0);

export const seekY = (x) => sample(SEEK_TAB, (x - L.seek.x0) / (L.seek.x1 - L.seek.x0));
export const volY = (x) => sample(VOL_TAB, (x - L.vol.x0) / (L.vol.x1 - L.vol.x0));
export const seekX = (progress) => mix(L.seek.x0, L.seek.x1, clamp01(progress));
export const seekProgress = (x) => clamp01((x - L.seek.x0) / (L.seek.x1 - L.seek.x0));
export const volX = (v) => mix(L.vol.x0, L.vol.x1, clamp01(v));
export const volValue = (x) => clamp01((x - L.vol.x0) / (L.vol.x1 - L.vol.x0));

/**
 * A stage point in the tile's own plane: turned into its frame, then the lean taken out (the
 * far edge is drawn narrower, so it is widened back).
 */
export function tilePlane(x, y, cx = L.cover.c[0], cy = L.cover.c[1]) {
  const c = Math.cos(-L.cover.rot), s = Math.sin(-L.cover.rot);
  const dx = x - cx, dy = y - cy;
  let qx = c * dx - s * dy, qy = s * dx + c * dy;
  // The turn about its upright axis, taken out: its right side lies further away, so is drawn smaller.
  const sY = Math.sin(L.cover.yaw), cY = Math.cos(L.cover.yaw), f = L.cover.persp;
  qx = qx * f / (f * cY - qx * sY);
  qy = qy * (f + qx * sY) / f;
  const ty = qy / (L.cover.squash + L.cover.lean * qy);
  return [qx * (1 - L.cover.lean * ty), ty];
}

/** Signed distance to the cover tile, negative inside. (cx, cy) lets the caller pass its floating position. */
export function tileSdf(x, y, cx = L.cover.c[0], cy = L.cover.c[1]) {
  const [tx, ty] = tilePlane(x, y, cx, cy);
  return sdRBox(tx, ty, L.cover.half, L.cover.half, L.cover.r);
}

/** Where bead i is, and how big, when the beads have come out by s (0 hidden, 1 out). */
export function beadAt(i, s) {
  const u = L.utils[i], e = s * s * (3 - 2 * s);
  return { c: [u.c[0] - L.beads.from * (1 - e), u.c[1]], r: u.r * smoothstep(0, 0.55, s) };
}

/* --------------------------------------------------------------- hit test --- */

/**
 * What is under a point. The visible drop is three things: the top face, the
 * underside showing below it, and the cover tile floating over one end.
 * @param {{swell?:number, wall?:number[], tile?:number[], beads?:number}} f live state: lobe swell, where the underside sits, where the tile is, how far the beads are out
 * @returns {{inside:boolean, d:number, target:string|null, index?:number}}
 */
export function hit(x, y, f = {}) {
  const swell = f.swell || 0;
  const wall = f.wall || [0, 11];
  const tile = f.tile || L.cover.c;
  const dTop = bodySdf(x, y, swell);
  const dTile = tileSdf(x, y, tile[0], tile[1]);
  const d = Math.min(dTop, bodySdf(x - wall[0], y - wall[1], swell), dTile);
  // The beads, while they are out, and the narrow gap between them and the end ('gap': it does
  // nothing, but it keeps the pointer on the widget as it crosses from the drop to a bead).
  const shown = f.beads || 0;
  if (shown > 0.3) {
    for (let i = 0; i < L.utils.length; i++) {
      const b = beadAt(i, shown);
      const db = Math.hypot(x - b.c[0], y - b.c[1]) - b.r;
      if (db < 4) return { inside: true, d: Math.min(d, db), target: 'util', index: i };
    }
    const mid = (L.utils[0].c[1] + L.utils[1].c[1]) / 2;
    if (d >= 0 && x > L.beads.side + 80 && dTop < L.beads.reach && Math.abs(y - mid) < 30) return { inside: true, d: 0, target: 'gap' };
  }
  const out = { inside: d < 0, d, target: null };
  if (!out.inside) return out;
  if (dTile < 0) return { ...out, target: 'cover' };
  if (dTop >= 0) return { ...out, target: 'body' };          // the underside: grab it to drag

  for (let i = 0; i < L.buttons.length; i++) {
    const b = L.buttons[i];
    if (Math.hypot(x - b.c[0], y - b.c[1]) < b.r + 2) return { ...out, target: 'button', index: i };
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
const float EDGE_R_LOBE = ${f1(L.edgeRLobe)};
const float EDGE_H_LOBE = ${f1(L.edgeHLobe)};
const float EDGE_IN_LOBE = ${f1(L.edgeInLobe)};
const float BULB_CROWN = ${f1(L.bulbCrown)};
const vec3 BULB = vec3(${f1(L.lobeL.c[0])}, ${f1(L.lobeL.c[1])}, ${f1(L.lobeL.r)});
const vec2 COVER_C = ${v2(L.cover.c)};
const float COVER_HALF = ${f1(L.cover.half)};
const float COVER_R = ${f1(L.cover.r)};
const float COVER_ROT = ${f1(L.cover.rot)};
const float COVER_LEAN = ${f1(L.cover.lean * 10000) } * 1e-4;
const float COVER_SQUASH = ${f1(L.cover.squash)};
const float COVER_YAW = ${f1(L.cover.yaw)};
const float COVER_PERSP = ${f1(L.cover.persp)};
const vec3 PRESS = vec3(${f1(L.press.d)}, ${f1(L.press.w)}, ${f1(L.press.swell)});
const vec4 POCKET = vec4(${f1(L.pocket.d)}, ${f1(L.pocket.w)}, ${f1(L.pocket.rise)}, ${f1(L.pocket.out)});
const vec2 ARCH_C = ${v2(L.arch.c)};
const float ARCH_R = ${f1(L.arch.r)};
const vec2 BAND_C = ${v2(L.band.c)};
const float BAND_R = ${f1(L.band.r)};
const vec2 END_C = ${v2(L.end.c)};
const float END_R = ${f1(L.end.r)};
const vec2 RIM_C = ${v2(L.rim.c)};
const float RIM_R = ${f1(L.rim.r)};
const vec2 LIP_FADE = ${v2(L.lipFade)};
const float LIP_H = ${f1(L.lipH)};
const float LIP_ROLL = ${f1(L.lipRoll)};
const float LIP_DOME = ${f1(L.lipDome)};
const float BAND_H = ${f1(L.bandH)};
const float POD_D = ${f1(L.podD)};
const vec2 SEEK_X = vec2(${f1(L.seek.x0)}, ${f1(L.seek.x1)});
const vec2 VOL_X = vec2(${f1(L.vol.x0)}, ${f1(L.vol.x1)});
const float SEEK_TAB[${SEEK_N}] = ${arr(SEEK_TAB)};
const float VOL_TAB[${VOL_N}] = ${arr(VOL_TAB)};
const vec3 BTN0 = vec3(${f1(L.buttons[0].c[0])}, ${f1(L.buttons[0].c[1])}, ${f1(L.buttons[0].r)});
const vec3 BTN1 = vec3(${f1(L.buttons[1].c[0])}, ${f1(L.buttons[1].c[1])}, ${f1(L.buttons[1].r)});
const vec3 BTN2 = vec3(${f1(L.buttons[2].c[0])}, ${f1(L.buttons[2].c[1])}, ${f1(L.buttons[2].r)});
const vec3 UTIL0 = vec3(${f1(L.utils[0].c[0])}, ${f1(L.utils[0].c[1])}, ${f1(L.utils[0].r)});
const vec3 UTIL1 = vec3(${f1(L.utils[1].c[0])}, ${f1(L.utils[1].c[1])}, ${f1(L.utils[1].r)});
const vec2 BEAD = vec2(${f1(L.beads.from)}, ${f1(L.beads.k)});
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

// The upper lip's leading edge: negative under the arch, positive on the lip.
float archSdf(vec2 p) {
  float d = smax(length(p - ARCH_C) - ARCH_R, BAND_R - length(p - BAND_C), ${f1(L.arch.kl)});
  // Under the words the waist leg runs on as a nearly level line (positive above it, on the lip), and on
  // under the cover as its seat (round 49).
  float runY = mix(${f1(L.run.y)} + ${f1(L.run.fall)} * max(${f1(L.run.x)} - p.x, 0.),
    ${f1(L.seat.at[1])} + ${f1(L.seat.slope)} * (p.x - ${f1(L.seat.at[0])}) + ${f1(L.seat.gap)} + ${f1(L.seat.sag)} * exp(-pow((p.x - ${f1(L.seat.c)}) / ${f1(L.seat.w)}, 2.)),
    smoothstep(${f1(L.seat.blend[0])}, ${f1(L.seat.blend[1])}, p.x));
  d = mix(runY - p.y, d, smoothstep(${f1(L.run.blend[0])}, ${f1(L.run.blend[1])}, p.x));
  // On the right the arc runs on as a diagonal down to the silhouette (round 38: no right leg).
  return ${L.end.leg ? `p.x < END_C.x ? d : smax(d, length(p - END_C) - END_R, ${f1(L.arch.kr)})` : 'd'};
}

// Where the arch exists as an edge: over and round the pod, down its diagonal to the right silhouette,
// and along the waist leg, which melts away to the left. Under the pod's rim, between the
// two legs, there is no edge: that is the strip.
float archOn(vec2 p) {
  float below = smoothstep(0., 14., length(p - RIM_C) - RIM_R);
  float legs = max(smoothstep(560., 530., p.x), smoothstep(735., 752., p.x));
  return max(1. - below, legs) * smoothstep(LIP_FADE.x, LIP_FADE.y, p.x);
}

// swell: the lobes breathing out with the bass.
float bodySdf(vec2 p, float swell) {
  float d = length(p - ${v2(L.lobeL.c)}) - (${f1(L.lobeL.r)} + swell);
  d = smin(d, sdCapsule(p, ${v2(L.bridge.a)}, ${v2(L.bridge.b)}, ${f1(L.bridge.ra)}, ${f1(L.bridge.rb)}), ${f1(L.bridge.k)});
  d = smin(d, length(p - ${v2(L.lobeR.c)}) - (${f1(L.lobeR.r)} + swell), ${f1(L.lobeR.k)});
  d = smin(d, length(p - ${v2(L.crest.c)}) - (${f1(L.crest.r)} + swell), ${f1(L.crest.k)});
  d = smin(d, smax(length(p - ${v2(L.shoulder.c)}) - (${f1(L.shoulder.r)} + swell), p.y - ${f1(L.shoulder.below)}, ${f1(L.shoulder.kb)}), ${f1(L.shoulder.k)});
  d = smax(d, -(length(p - ${v2(L.pinch.c)}) - ${f1(L.pinch.r)}), ${f1(L.pinch.k)});
  d = smax(d, -(length(p - ${v2(L.cut.c)}) - ${f1(L.cut.r)}), mix(${f1(L.cut.k)}, ${f1(L.cut.kTip)}, smoothstep(${f1(L.cut.tip[0])}, ${f1(L.cut.tip[1])}, p.x)));
  return d;
}
`;
