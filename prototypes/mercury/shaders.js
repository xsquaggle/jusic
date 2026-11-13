/**
 * Mercury's shaders.
 *
 * The ribbon is a heightfield, not a 3D model: a 2D outline is rolled into a
 * rounded body, details are pressed into it (cover pocket, buttons, the fold,
 * dishes, the cursor's dimple, ripples), and the slope of that height is the
 * normal the liquid reflects with. Words, glyphs and the timeline live *under*
 * that surface and are looked at through it. Everything stays in stage
 * coordinates, so the picture and the hit-test agree by construction.
 */

import { SHAPE_GLSL } from './shape.js';

export const RIPPLES = 10;

export const VERT = /* glsl */`#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * .5 + .5;
  gl_Position = vec4(aPos, 0., 1.);
}`;

const HEAD = /* glsl */`#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 vUv;
`;

const NOISE = /* glsl */`
float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * f * (f * (f * 6. - 15.) + 10.);
  return mix(mix(hash21(i), hash21(i + vec2(1, 0)), f.x),
             mix(hash21(i + vec2(0, 1)), hash21(i + vec2(1, 1)), f.x), f.y);
}
float fbm2(vec2 p) { return vnoise(p) * .65 + vnoise(p * 2.13 + 17.) * .35; }
`;

/* ================================================================ surface === */

export const SURFACE = HEAD + /* glsl */`
// Three targets, so the outline can be anti-aliased correctly after tone
// mapping and the body can be truly see-through:
//   oBody   the liquid's own light, with how much of the pixel it covers
//   oAura   the glow and shadow that fall outside it
//   oGlass  how much of what is behind the window the liquid holds back
layout(location = 0) out vec4 oBody;
layout(location = 1) out vec4 oAura;
layout(location = 2) out vec4 oGlass;

uniform vec2 uRes;
uniform float uScale;        // render px per stage unit
uniform float uTime;
uniform vec4 uAudio;         // bass, mid, high, pulse (all 0..1, smoothed)
uniform float uBands[16];    // spectrum, low to high
uniform vec4 uCursor;        // xy stage position, z presence, w pressed
uniform vec2 uLean;          // where the cursor is relative to the ribbon, -1..1
uniform vec4 uBtn[3];        // xy centre, z radius, w press
uniform vec4 uRip[${RIPPLES}];   // xy centre, z start time, w strength
uniform vec4 uSeek;          // progress, bead growth, glow, hover
uniform vec4 uVol;           // value, bead growth, hover, muted
uniform vec3 uUtil;          // utility dishes: how far in, press on each
uniform vec4 uTip;           // time-preview lens: xy centre, z growth
uniform vec4 uSquash;        // xy centre, z amount
uniform vec2 uShear;         // the body leaning against a drag
uniform float uSwell;        // lobes breathing with the bass
uniform float uThump;        // the whole drop jumping on a kick
uniform float uGap;          // how far the fold is open
uniform float uPlaying;      // 0..1, eased
uniform float uTrans;        // cover change, 0..1
uniform vec3 uPalA;          // album primary (linear)
uniform vec3 uPalB;          // album secondary
uniform vec3 uPalC;          // album deep tone
uniform sampler2D uDye;
uniform sampler2D uVel;
uniform sampler2D uCoverA;
uniform sampler2D uCoverB;
uniform sampler2D uInk;      // the label sheet
uniform float uInkScale;     // its px per stage unit
uniform float uForm;         // 0 nothing, 1 fully formed: the drop coalescing or letting go
uniform vec3 uSeekPull;      // bead stretch along the line, how far the line is pulled, volume level
uniform vec2 uWall;          // where the underside shows: the body's thickness, leaning with the cursor
uniform vec4 uTile;          // cover tile: xy centre (it floats), zw the offset of its own thickness
uniform sampler2D uBack;     // experiment: what is really behind the window, from a capture of its monitor
uniform vec4 uBackMap;       // stage position -> uv in uBack: xy offset, zw scale
uniform vec2 uBackPx;        // x capture pixels per stage unit, y how much the refraction is in (0 = off)
uniform float uGlassFloor;   // experiment: the least the body holds back away from its edges (0 = today's clear glass)

${SHAPE_GLSL}
${NOISE}

/* ------------------------------------------------------------ refraction --- */

// What is behind the window at a stage position, softened by 'blur' stage units. Linear light.
// Nine taps on two rings, each read from the mip level that matches its spacing.
vec3 behind(vec2 q, float blur) {
  vec2 uv = uBackMap.xy + q * uBackMap.zw;
  vec2 s = blur * uBackMap.zw;
  float lod = max(log2(max(blur * uBackPx.x, 1e-3) * .55), 0.);
  vec3 c = textureLod(uBack, uv, lod).rgb * 2.;
  c += (textureLod(uBack, uv + s * vec2(.38, .38), lod).rgb + textureLod(uBack, uv + s * vec2(-.38, .38), lod).rgb
      + textureLod(uBack, uv + s * vec2(.38, -.38), lod).rgb + textureLod(uBack, uv + s * vec2(-.38, -.38), lod).rgb) * 1.5;
  c += textureLod(uBack, uv + s * vec2(.95, 0.), lod).rgb + textureLod(uBack, uv - s * vec2(.95, 0.), lod).rgb
     + textureLod(uBack, uv + s * vec2(0., .95), lod).rgb + textureLod(uBack, uv - s * vec2(0., .95), lod).rgb;
  return pow(c / 12., vec3(2.2));
}

/* ---------------------------------------------------------- deformation --- */

// The whole body squashes around a press, shears against a drag, and jumps a
// hair outward on a kick.
vec2 warp(vec2 p) {
  vec2 q = p - uSquash.xy;
  float fall = exp(-dot(q, q) / (2. * 150. * 150.));
  p += q * uSquash.z * fall * vec2(-.5, 1.);
  p.x += uShear.x * (p.y - 200.) * .01;
  p.y += uShear.y * (p.x - 430.) * .004;
  return vec2(430., 200.) + (p - vec2(430., 200.)) / (1. + .011 * uThump);
}

// The drop forms from its thickest parts outward: two beads swell where the
// lobes will be, then meet through the neck. Letting go runs the same way back.
float outline(vec2 p) { return bodySdf(p, uSwell) + (1. - uForm) * 132.; }

vec2 turn(vec2 v, float a) { float c = cos(a), s = sin(a); return vec2(c * v.x - s * v.y, s * v.x + c * v.y); }

// The cover tile. A stage point in the tile's own plane: turned into its frame, then the lean
// taken out (the tile leans back, so its far edge is drawn narrower and is widened back here).
vec2 tilePlane(vec2 p, vec2 centre) {
  vec2 q = turn(p - centre, -COVER_ROT);
  float ty = q.y / (COVER_SQUASH + COVER_LEAN * q.y);
  return vec2(q.x * (1. - COVER_LEAN * ty), ty);
}
float tileSdf(vec2 p, vec2 centre) { return sdRBox(tilePlane(p, centre), vec2(COVER_HALF), COVER_R); }

/* --------------------------------------------------------------- details --- */

// How far inside the pod a point is (0 outside, 1 well in): under the arch and above the
// pod's own lower rim. For shading.
float podMask(vec2 p, float ar) {
  return smoothstep(.6, -.6, ar) * smoothstep(3., -7., length(p - RIM_C) - RIM_R);
}

// How far down into the pod a point lies (0 on the strip, 1 on the pod's floor). Under the
// arch the pod drops away at once, because the lip stands over it. Its own lower rim is a
// rolled shoulder: level where it leaves the strip and steep where it reaches the floor, so
// it shows a soft graded light with a dark line at its foot instead of one thin line.
float podDepth(vec2 p, float ar) {
  float t = clamp((5. - (length(p - RIM_C) - RIM_R)) / 12., 0., 1.);
  return smoothstep(.6, -.6, ar) * (1. - sqrt(1. - t * t));
}

float ripples(vec2 p) {
  float h = 0.;
  for (int i = 0; i < ${RIPPLES}; i++) {
    vec4 r = uRip[i];
    float age = uTime - r.z;
    if (r.w == 0. || age < 0. || age > 2.4) continue;
    float x = length(p - r.xy) - age * 185.;
    float env = exp(-x * x / 560.) * exp(-age * 1.75) * smoothstep(0., .05, age);
    h += r.w * env * cos(x * .34);
  }
  return h;
}

float spectrumAt(float t) {
  float f = clamp(t, 0., 1.) * 15.;
  int i = int(floor(f));
  float a = uBands[i], b = uBands[min(i + 1, 15)];
  float k = fract(f);
  return mix(a, b, k * k * (3. - 2. * k));
}

// The timeline is part of the liquid: it rides the wave the bass sends along
// the body, and gives a little under the bead.
float seekLine(float x) {
  float bx = mix(SEEK_X.x, SEEK_X.y, uSeek.x);
  float pull = uSeekPull.y * exp(-(x - bx) * (x - bx) / (2. * 40. * 40.));
  return seekY(x) + pull - (.25 + 3.4 * uAudio.x) * .55 * sin(x * .022 - uTime * 2.2);
}

/* ----------------------------------------------------------------- pools --- */

// Where something has to be read the liquid lies level and a little smoky:
// x under the words, y along the timeline, z along the volume strip. A level
// surface mirrors only the dark overhead, so highlights break around a pool
// instead of crossing it. Everywhere else the body stays clear glass.
vec3 pools(vec2 p) {
  float words = smoothstep(40., -26., sdRBox(p - vec2(386., 202.), vec2(96., 26.), 26.));
  float xs = clamp(p.x, SEEK_X.x - 42., SEEK_X.y + 48.);
  float track = smoothstep(30., 2., length(vec2(p.x - xs, p.y - seekY(xs))));
  float xv = clamp(p.x, VOL_X.x - 32., VOL_X.y + 8.);
  float strip = smoothstep(32., 2., length(vec2(p.x - xv, p.y - volY(xv) + 3.)));
  return vec3(words, track, strip);
}

/* ---------------------------------------------------------------- height --- */

// The form itself: the rolled edge, the crown of the body, slow liquid swells
// and the waves the music sends along it. Sampled with a wide step, so its
// reflections are soft and continuous.
float base(vec2 p0) {
  vec2 p = warp(p0);
  float d = outline(p);

  // The lip: a rounded tube all the way round. Its outer face is vertical at the silhouette
  // and rolls over to a crest; its inner face falls gently to the body, which lies lower.
  // Each face mirrors a different part of the room, which is what gives the edge its width.
  // On the two lobes the tube is half as wide again as through the waist, where the body is
  // thin: a wide roll turns slowly, so the light it mirrors lies across it as a broad band
  // instead of a line.
  float lobe = 1. - smoothstep(300., 380., p.x) * smoothstep(600., 520., p.x);
  float eR = mix(EDGE_R, EDGE_R_LOBE, lobe), eH = mix(EDGE_H, EDGE_H_LOBE, lobe), eIn = mix(EDGE_IN, EDGE_IN_LOBE, lobe);
  float x = max(-d, 0.);
  float t = clamp(x / eR, 0., 1.);
  float h = eH * sqrt(max(1. - pow(1. - t, 2.2), 0.));
  h -= EDGE_DIP * smoothstep(eR * .9, eIn, x);
  // The body itself is only slightly domed.
  float t2 = clamp(x / 110., 0., 1.);
  h += 5. * (1. - (1. - t2) * (1. - t2));
  // Keep falling away outside, so the very edge still faces sideways.
  h -= max(d, 0.) * 3.;

  // The upper lip, a second layer over the pod. Behind its rolled leading edge (which is in
  // detail(), where edges stay sharp) it falls slowly away toward the outline, so it reads
  // as a sheet curling up toward its edge.
  float ar = archSdf(p), on = archOn(p);
  h -= LIP_H * .62 * smoothstep(LIP_ROLL, 48., ar) * on;
  // Between its edge and the outline the lip is full, not hollow: a broad crown, so its upper
  // half takes the light from above and its lower half the colour off the floor.
  float sx = max(ar, 0.), ox = max(-d, 0.);
  float u = sx / max(sx + ox, 14.);
  h += LIP_DOME * 4. * u * (1. - u) * smoothstep(500., 560., p.x) * on;
  // Through the waist the lip narrows to a rolled band: a ridge just behind its edge, falling
  // away toward the words on its other side.
  h += BAND_H * exp(-pow((ar - 10.) / 10., 2.)) * smoothstep(560., 528., p.x) * on;

  // Broad swells, drifting slowly.
  vec2 a = p - vec2(186., 196.), b = p - vec2(646., 196.), c = p - vec2(420., 240.);
  // The cover presses into the liquid. The surface sinks toward the tile all the way round
  // it, and what it pushes aside stands up as a low swell a little way out. The side of the
  // hollow toward the lamps is in shade, the far side takes their light: that is what shows
  // the tile is resting in the liquid and not painted on it.
  float dTile = tileSdf(p, uTile.xy);
  float pressed = smoothstep(.72, 1., uForm);
  h -= PRESS.x * smoothstep(PRESS.y, -5., dTile) * pressed;
  h += PRESS.z * exp(-pow((dTile - PRESS.y - 5.) / 9., 2.)) * pressed;

  // The bulb is crowned: full in the middle and falling away to its rim all round, so the
  // part of it toward the lamps carries a sheen and the part toward the floor its colour.
  h += BULB_CROWN * pow(max(1. - dot(a, a) / (BULB.z * BULB.z), 0.), 1.5);
  h += 6. * exp(-dot(b, b) / 24000.) + 4. * exp(-dot(c, c) / 9000.);
  h += 1.1 * sin(p.x * .017 + uTime * .36 + .8 * sin(p.y * .015 - uTime * .17));
  h += .7 * sin(p.x * .009 - p.y * .022 - uTime * .26 + 2.);

  // Waves from the music, running along the lower body; a fine shiver from the highs.
  float lower = smoothstep(226., 300., p.y);
  h += (.15 + 2.8 * uAudio.x) * sin(p.x * .022 - uTime * 2.2 + .6 * sin(p.y * .03)) * lower;
  h += 1.1 * uAudio.y * sin(p.x * .052 + p.y * .02 - uTime * 3.4) * lower;
  h += .35 * uAudio.z * sin(p.x * .21 + uTime * 9.) * sin(p.y * .19 - uTime * 7.);
  return h;
}

// Everything pressed into the form or standing on it. Sampled finely, so rims
// and grooves stay sharp.
float detail(vec2 p0) {
  vec2 p = warp(p0);
  float h = 0.;

  // The pod the buttons sit in, and the upper lip lying over it as a second layer. The lip
  // ends in a rolled edge: a quarter round, upright where it meets the pod and level at its
  // crest, so along its length it mirrors first what is behind and below, then the room
  // above. The pod drops away under it at once; its own lower rim is a gentle slope.
  float ar = archSdf(p);
  float fade = archOn(p);
  float pod = podMask(p, ar);
  h -= POD_D * podDepth(p, ar);
  float t = 1. - clamp(ar / LIP_ROLL, 0., 1.);
  h += LIP_H * sqrt(max(1. - t * t, 0.)) * fade;
  // The gap under the edge, which the bass opens.
  float gapW = 2.2 + 2.2 * uGap;
  h -= (.8 + 3. * uGap) * exp(-pow((ar + 1.6) / gapW, 2.)) * pod;
  // The lip leans toward the cursor; the pod and its buttons do not.
  h += dot(p - vec2(660., 120.), uLean * vec2(-.045, -.07)) * smoothstep(0., 16., ar) * smoothstep(520., 580., p.x) * smoothstep(200., 150., p.y);

  // Buttons: each is one smooth bowl pressed into the surface, with one rounded shoulder and
  // no rim standing round it (a rim and a dish gave every lamp four faces to draw a ring
  // on). Pressing deepens the bowl and spreads it a little.
  for (int i = 0; i < 3; i++) {
    vec4 bt = uBtn[i];
    float press = bt.w;
    float r = bt.z * (1. + .06 * press);
    float rho = length(p - bt.xy);
    float wall = smoothstep(r + 2., r - 8., rho);
    h -= (5. + 7. * press) * wall + (2.2 + 2. * press) * wall * (1. - rho * rho / (r * r));
  }

  // Utility dishes: flush with the lip until the pointer arrives, then they press in.
  for (int i = 0; i < 2; i++) {
    vec3 u = i == 0 ? UTIL0 : UTIL1;
    float press = i == 0 ? uUtil.y : uUtil.z;
    float rho = length(p - u.xy);
    h += uUtil.x * (1.8 - press) * exp(-pow((rho - u.z) / 2.4, 2.));
    h -= uUtil.x * (3. + 4.5 * press) * smoothstep(u.z + 1., u.z - 5., rho) * (1. - .5 * (rho * rho) / (u.z * u.z));
  }

  // The time preview: a small lens of liquid standing proud above the bead.
  float dt = sdRBox(p - uTip.xy, TIP_HALF, TIP_HALF.y);
  h += 6. * uTip.z * smoothstep(1., -8., dt);

  // The cursor's dimple and the small rings around it.
  float rc = length(p - uCursor.xy);
  h -= uCursor.z * (5. + 7. * uCursor.w) * exp(-rc * rc / (2. * 13. * 13.));
  h += uCursor.z * 1.05 * cos(rc * .5) * exp(-rc / 20.) * smoothstep(7., 24., rc);

  return h + ripples(p);
}

/* ----------------------------------------------------------- environment --- */

// How much of the lamps' light the glass rim carries through to its inner side.
const float THROUGH = .27;

// How blurred the room looks from this point: reflections soften where they
// turn faster than a pixel can show, and on tightly curved rims.
float gSoft;

// A rectangular studio light seen in a reflection.
float softbox(vec3 r, vec3 dir, vec3 right, vec2 size, float soft) {
  float z = dot(r, dir);
  if (z <= 0.02) return 0.;
  vec3 up = cross(dir, right);
  vec2 q = vec2(dot(r, right), dot(r, up)) / z;
  vec2 dd = abs(q) - size;
  float e = length(max(dd, 0.)) + min(max(dd.x, dd.y), 0.);
  float w = max(soft, gSoft * 1.4);
  return smoothstep(w, -w, e) * smoothstep(.02, .3, z);
}

// The room the liquid mirrors. r: x right, y up, z toward the viewer.
// A dark studio with a few large lamps in it and the album's colour lying on the
// floor. Nothing in it is the same all the way round: as an edge turns, the lamp it
// was mirroring slides out of view and the edge goes dark until it finds the next.
// That is what makes a highlight swell, thin and vanish along a lip, where a room
// that is evenly bright above and evenly coloured below draws a line of even width.
vec3 env(vec3 r) {
  vec3 warm = vec3(1., .955, .91), cool = vec3(.86, .93, 1.);
  vec3 hot = mix(uPalA, vec3(1.), .16);
  vec3 c = vec3(.010, .011, .014);

  // Toward the viewer the room holds nothing with an edge, only a slow wash of light from
  // the upper left. Gently sloping liquid (the body, the inside of the lip, the swells and
  // the waves the music sends) mirrors this part, and a lamp's edge there would be torn
  // into blotches by every ripple. The wash gives those parts a sheen that slides instead.
  c += cool * .3 * pow(max(dot(r, normalize(vec3(-.36, .46, .81))), 0.), 4.);
  // ...and, as soft and as edgeless, the album's colour coming up off the floor in front:
  // liquid that leans toward the viewer's feet carries it as a glow, not a line.
  c += hot * .22 * pow(max(dot(r, normalize(vec3(.06, -.62, .78))), 0.), 7.);

  // The lamps stand well off to the sides, so only steep liquid shows them: the outer
  // face of the lip, the rims of the buttons, the walls of the dishes.
  // Overhead: one long bank, brighter at its left end. The line along edges that face up the screen.
  // Overhead: a glow that fills the upper half of the room, brightest at the upper left and
  // dying away to the right and toward the viewer. It has no edge, so the whole outer face
  // of an upper lip takes a broad graded light from it, and the inner face of a lower lip a
  // faint one. Inside it, a short bright bank over the left half only: the crisp line.
  float left = smoothstep(1.1, -.9, r.x);
  c += cool * (.1 + .5 * left) * smoothstep(.22, .95, r.y) * smoothstep(-.75, .1, r.z);
  c += cool * (.2 + 1.6 * left) * softbox(r, normalize(vec3(-.3, .9, .31)), vec3(1, 0, 0), vec2(.85, .05), .03);
  // Key: a panel up and to the left. The broad light on the upper-left edges.
  c += warm * 1.5 * softbox(r, normalize(vec3(-.62, .56, .55)), normalize(vec3(.66, 0., .75)), vec2(.42, .3), .09);
  // A narrow panel to the right, a little behind: the crisp light on the right end only.
  c += cool * 1.5 * softbox(r, normalize(vec3(.86, .2, -.46)), normalize(vec3(.47, 0., .88)), vec2(.13, .42), .05);
  // A weaker one behind on the left.
  c += cool * 1.1 * softbox(r, normalize(vec3(-.8, .42, -.42)), normalize(vec3(.46, 0., -.89)), vec2(.16, .36), .06);

  // The floor: the album's colour, brightest straight below and a little behind, falling
  // away toward the horizon in front, toward the back and to either side. A lower lip
  // turning through it shows a glow that rises and dies, not a band.
  // Its hot core lies behind the drop as well as below it: the last of the lip above the
  // lower silhouette and the first of the underside beneath it both look that way, so the
  // two light up together as one rounded edge instead of two bands with a seam between.
  vec3 fc = normalize(vec3(.1, -.62, -.78));
  float fd = length((r - fc) * vec3(.7, 1., 1.));
  c += hot * (.05 * smoothstep(.1, -.5, r.y) + .16 * exp(-fd * fd / .9) + 1.5 * exp(-fd * fd / .11));
  return c;
}

mat3 rotX(float a) { float c = cos(a), s = sin(a); return mat3(1, 0, 0, 0, c, s, 0, -s, c); }
mat3 rotY(float a) { float c = cos(a), s = sin(a); return mat3(c, 0, -s, 0, 1, 0, s, 0, c); }

/* ----------------------------------------------------------------- cover --- */

// The picture at a point of the tile (cuv 0..1), mid-change if a song is changing.
vec3 coverColor(vec2 cuv, vec2 p, vec2 flow) {
  float n = fbm2(cuv * 3.2 + 3.);
  float n2 = fbm2(cuv * 3.2 + 11.);

  float liquefy = smoothstep(0., .42, uTrans);
  vec2 da = (flow * .0035 + (vec2(n, n2) - .5) * .5) * liquefy;
  vec3 a = texture(uCoverA, clamp(cuv - da, 0., 1.)).rgb;
  // Mid-change the tile holds the pigment itself.
  vec3 pig = texture(uDye, (p + (vec2(n, n2) - .5) * 8.) / STAGE).rgb * 1.25;
  a = mix(a, pig, liquefy * .92);

  float settle = smoothstep(.46, 1., uTrans);
  vec2 dbv = (flow * .004 + (vec2(n2, n) - .5) * .55) * (1. - settle) * (1. - settle);
  vec3 b = texture(uCoverB, clamp(cuv + dbv, 0., 1.)).rgb;
  float front = smoothstep(-.14, .14, uTrans * 1.75 - .86 - (n - .5) * .7 + (.5 - cuv.x) * .3);
  return mix(a, b, front);
}

/* ------------------------------------------------------------------- ink --- */

// Coverage of the label sheet at a stage position, softened by 'blur' stage units.
float ink(vec2 q, float blur) {
  return textureLod(uInk, q / STAGE, log2(max(blur * uInkScale, 1.))).r;
}

/* ------------------------------------------------------------------ main --- */

void main() {
  vec2 p = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y) / uScale;
  float px = 1. / uScale;
  vec2 pw = warp(p);

  vec3 hotA = mix(uPalA, vec3(1.), .12);
  float life = .55 + .45 * uPlaying;
  float born = smoothstep(.72, 1., uForm);          // contents surface once the drop has formed
  float loud = mix(.5, 1.2, uSeekPull.z) * uForm;   // the glow answers the volume

  /* ---- the three things that make up the drop ---- */
  float d = outline(pw);                            // top face
  float dU = outline(pw - uWall);                   // the same outline, lower: its underside
  float dT = tileSdf(pw, uTile.xy);                 // cover tile, floating above
  float dTw = tileSdf(pw - uTile.zw, uTile.xy);     // ...and the tile's own thickness
  float covTop = smoothstep(.75 * px, -.75 * px, d);
  float covBody = smoothstep(.75 * px, -.75 * px, min(d, dU));
  float covFace = smoothstep(.75 * px, -.75 * px, dT) * born;
  float covTile = smoothstep(.75 * px, -.75 * px, min(dT, dTw)) * born;

  /* ---- outside it: the album's colour on the ground beneath, and a soft shadow ---- */
  vec2 border = min(p, STAGE - p);
  float window = smoothstep(0., 36., min(border.x, border.y));
  // The floor lies a little way under the drop and is seen from above and in front, so the
  // pool of light on it is the drop's own outline flattened, showing below the lower edge
  // and standing clear of it. Nothing hugs the outline: light drawn all the way round the
  // shape reads as a plate behind it.
  // How much of the drop hangs over this stretch of floor: all of it under the lobes, less
  // under the lifted waist, fading out past either end.
  vec2 f1 = (pw - vec2(200., 359.)) / vec2(128., 16.), f2 = (pw - vec2(652., 350.)) / vec2(104., 15.);
  float pool = (exp(-dot(f1, f1)) + .8 * exp(-dot(f2, f2))) * smoothstep(0., 16., dU);
  vec3 halo = hotA * .3 * pool * (life + .9 * uAudio.w) * window * loud;
  // The shadow falls straight down, so it shows only beneath the drop. On a light desktop
  // it is what lifts the drop off the page.
  float shadow = (.3 * smoothstep(34., -22., outline(pw - vec2(0., 30.))) + .16 * smoothstep(9., -3., dU)) * window * uForm;
  oAura = vec4(halo, shadow);

  if (covBody <= 0. && covTile <= 0.) {
    oBody = vec4(0.);
    oGlass = vec4(0.);
    return;
  }

  vec3 V = normalize(vec3((p.x - STAGE.x * .5) / -1500., (p.y - STAGE.y * .5) / 1500., 1.));
  vec3 col = vec3(0.);
  float glass = 0.;
  vec2 flow = texture(uVel, p / STAGE).xy;

  /* ================================ the top face ================================ */
  if (covTop > 0.) {
    /* ---- normal from the height's slope, and how fast it turns ---- */
    float eb = max(2.6, 2. * px), ed = max(.8, .9 * px);
    float b0 = base(p), bxp = base(p + vec2(eb, 0.)), bxm = base(p - vec2(eb, 0.)), byp = base(p + vec2(0., eb)), bym = base(p - vec2(0., eb));
    float t0 = detail(p), txp = detail(p + vec2(ed, 0.)), txm = detail(p - vec2(ed, 0.)), typ = detail(p + vec2(0., ed)), tym = detail(p - vec2(0., ed));
    vec2 slopeB = vec2(bxp - bxm, byp - bym) / (2. * eb);     // the form
    vec2 slopeD = vec2(txp - txm, typ - tym) / (2. * ed);     // what is pressed into it, and what ripples across it
    float curv = (abs(bxp + bxm - 2. * b0) + abs(byp + bym - 2. * b0)) / (eb * eb)
               + (abs(txp + txm - 2. * t0) + abs(typ + tym - 2. * t0)) / (ed * ed);
    gSoft = clamp(max(curv * px * 1.2, curv * .3), .004, .3);
    // Inside a button's bowl nothing is mirrored sharply: one soft light on its wall, not rings.
    float bowl = 0.;
    for (int i = 0; i < 3; i++) bowl = max(bowl, smoothstep(uBtn[i].z + 2., uBtn[i].z - 6., length(pw - uBtn[i].xy)));
    gSoft = max(gSoft, .06 * bowl);

    // In a pool the standing form is all but level; ripples and presses still cross it.
    vec3 pl = pools(pw) * born;
    float still = max(pl.x, max(.72 * pl.y, .78 * pl.z));
    slopeB *= 1. - .93 * still * smoothstep(4., 20., -d);      // ...but the outer face of the lip keeps its roll
    slopeD *= 1. - .45 * still;
    vec2 slope = slopeB + slopeD;

    vec3 N = normalize(vec3(-slope.x, slope.y, 1.));         // y flipped: up is up
    float ndv = max(dot(N, V), 0.);
    vec3 R = reflect(-V, N);
    R = rotY(uLean.x * .26 + .02 * uAudio.x * sin(uTime * 5.3)) * rotX(uLean.y * -.2 + .016 * uAudio.y * sin(uTime * 7.1)) * R;

    float ar = archSdf(pw);                                  // the lip's leading edge: negative under it
    float lipF = archOn(pw);
    float podIn = podMask(pw, ar);
    float fw = smoothstep(536., 572., pw.x) * smoothstep(772., 740., pw.x) * lipF;   // along the top of the arch

    // Where things under the surface appear to be: bent by the slope above them.
    vec2 bend = clamp(slopeD, -1.2, 1.2) + clamp(slopeB, -1., 1.) * .16;
    vec2 q = pw + bend * 7. - uLean * 1.4;
    // Words may only shift by a hair, so they stay crisp and exactly where they are clicked.
    vec2 wordBend = bend * 7.;
    wordBend /= max(1., length(wordBend) / 1.5);
    vec2 qWord = pw + wordBend - uLean * 1.1;

    /* ---- pigment: light suspended in the liquid ---- */
    // Seen through the surface, so shifted a little by its slope: only a little, or the steep
    // outer face of the lip looks clean over the threads that run inside it.
    vec2 duv = (pw + clamp(slope, -1., 1.) * 4.5) / STAGE;
    vec3 dye = texture(uDye, duv).rgb;
    float dyeAmt = clamp(max(dye.r, max(dye.g, dye.b)), 0., 1.);
    vec2 hz = 9. / STAGE;
    vec3 haze = (texture(uDye, duv + vec2(hz.x, 0.)).rgb + texture(uDye, duv - vec2(hz.x, 0.)).rgb
               + texture(uDye, duv + vec2(0., hz.y)).rgb + texture(uDye, duv - vec2(0., hz.y)).rgb) * .25;
    // Thin pigment stays clear; where it gathers it glows in its own colour, brighter than white at the core.
    vec3 hue = dye / max(dyeAmt, 1e-3);
    hue = mix(hue, hue * hue * 1.15, .4);
    // (A thread thins as it travels. It is let show until it is very thin indeed; the old
    // floor of .14 cut every thread off a third of the way along the lip.)
    vec3 lumen = hue * (1.3 * smoothstep(.04, .8, dyeAmt) + 1.6 * dyeAmt * dyeAmt * dyeAmt) + haze * haze * .5;

    /* ---- the liquid: clear glass that mirrors like chrome ---- */
    float F = mix(.5, 1., pow(1. - ndv, 3.));
    vec3 tint = mix(vec3(.95, .96, 1.), mix(vec3(1.), normalize(dye + 1e-3) * 1.5, .5), dyeAmt * .32);
    float calm = max(ink(qWord, 10.) * 1.6, .9 * still);
    vec3 refl = env(R) * tint * (1. + .16 * uAudio.w + .1 * uAudio.z) * (1. - .8 * clamp(calm, 0., 1.));
    float depth = smoothstep(0., 60., -d);
    float smoke = fbm2(p * .011 + vec2(uTime * .02, 0.) + flow * .0006);
    float lensMask = uTip.z * smoothstep(1.5, -1.5, sdRBox(pw - uTip.xy, TIP_HALF, TIP_HALF.y));
    float under = ink(qWord + vec2(1.5, 3.5), 5.) * (1. - lensMask) * born;
    // The glass itself: smoked, with the album's deep tone in it. It no longer borrows its
    // colour from the desktop, so it has to have one.
    // Pigment gives way wherever something has to be read.
    lumen *= 1. - .93 * clamp(max(calm, pl.x), 0., 1.);
    vec3 inner = (uPalC * (.3 + .25 * depth) * (.6 + .8 * smoke) + lumen * (.7 + .4 * depth)) * (1. - .5 * under) * (1. - .75 * clamp(calm, 0., 1.));

    col = inner * (1. - .5 * F) + refl * F;

    // Light that came in through the edge: thick glass shows it again as a broad soft band
    // just inside the roll, on the side toward the lamps (upper left), brightest where the
    // outline faces them and gone where it faces away. The outer face of the roll carries the
    // lamps' own reflection; this band inside it is what makes the edge read as a thick tube
    // of glass and not as a line. It gives way wherever something has to be read.
    {
      vec2 gO = vec2(outline(pw + vec2(1.5, 0.)) - d, outline(pw + vec2(0., 1.5)) - d) / 1.5;
      float toward = max(dot(gO / max(length(gO), 1e-3), vec2(-.74, -.67)), 0.);
      float lobe = 1. - smoothstep(300., 380., pw.x) * smoothstep(600., 520., pw.x);
      float eR = mix(EDGE_R, EDGE_R_LOBE, lobe);
      float band = exp(-pow((-d - eR * 1.55) / (eR * .46), 2.));
      col += mix(vec3(1., .97, .94), hotA, .2) * THROUGH * band * toward * toward
           * (1. - clamp(calm, 0., 1.)) * (1. - .7 * podIn) * born;
    }

    // Refraction (experiment): the body holds back everything behind the window, and shows
    // instead what a capture says is there, bent the way the surface above it slopes (a drop
    // magnifies), blurred, and dimmed to smoked glass. Calm and dimmest where words sit.
    if (uBackPx.y > 0.) {
      vec2 lens = clamp(slopeB, -1.6, 1.6) * 28. + clamp(slopeD, -1.5, 1.5) * 10.;
      float rimward = smoothstep(.2, 1., length(slopeB));
      float soft = mix(mix(5., 1.5, rimward), 11., still);
      float clear = clamp(.5 - .1 * depth - .26 * pl.x - .12 * pl.y - .2 * pl.z
                          - .16 * podIn - .25 * dyeAmt, .07, .6) * (1. - .8 * lensMask);
      col += behind(pw + lens, soft) * vec3(.9, .94, 1.) * (1. - F) * clear * uBackPx.y;
    }

    // No rim is drawn. The edge is lit only by what its roll mirrors, so it is bright where
    // it faces a lamp and dark where it does not, as a real edge is.

    // Occlusion: the lip's shadow on what lies under its leading edge, and the bowls.
    // The shadow is dark and tight against the edge and reaches further where the pod lies
    // deep under the lip; along the waist it fades out with the lip itself.
    float ao = 1.;
    float below = smoothstep(.8, -.8, ar) * lipF;
    ao *= 1. - below * (.5 * smoothstep(-mix(7., 15., podIn), 0., ar) + .22 * exp(min(ar, 0.) / 2.5));
    ao *= 1. - .2 * podIn;
    float dish = 0.;
    for (int i = 0; i < 3; i++) {
      float rho = length(pw - uBtn[i].xy);
      float r = uBtn[i].z;
      dish = max(dish, smoothstep(r + 2., r - 4., rho));
      // A hollow of darker glass: darkest under its upper shoulder, where the light from
      // above cannot reach.
      float upper = dot(normalize(pw - uBtn[i].xy + 1e-3), vec2(0., -1.));
      ao *= 1. - (.4 + .2 * uBtn[i].w) * smoothstep(r + 1., r - 9., rho) * (.72 + .28 * upper);
      // A breath of the album's colour in the bottom of the bowl, more when pressed or on a beat.
      col += hotA * (.012 + .05 * uAudio.w + .2 * uBtn[i].w) * smoothstep(r - 2., r * .3, rho);
    }
    for (int i = 0; i < 2; i++) {
      vec3 u = i == 0 ? UTIL0 : UTIL1;
      ao *= 1. - .45 * uUtil.x * smoothstep(u.z, u.z - 6., length(pw - u.xy));
    }
    col *= ao;

    // The tile floats above the liquid: its shadow, and the picture's own light spilling round it.
    // (It lies in the hollow it has pressed, so its shadow is close in all round, where the
    // liquid meets it, and only a little longer on the side away from the lamps.)
    float tshadow = (.4 * smoothstep(12., -2., dT)
                   + .22 * smoothstep(20., -10., tileSdf(pw - vec2(4., 9.), uTile.xy))) * born;
    col *= 1. - tshadow;
    vec2 castUv = clamp(tilePlane(pw, uTile.xy) / (2. * COVER_HALF) + .5, .2, .8);
    vec3 spill = pow(mix(textureLod(uCoverA, castUv, 6.2).rgb, textureLod(uCoverB, castUv, 6.2).rgb, smoothstep(.3, .8, uTrans)), vec3(2.2));
    // (Kept low and close: at full strength a white cover fogged the whole lobe round it.)
    col += spill * .3 * exp(-max(dT, 0.) / 9.) * smoothstep(-8., 4., dT) * born;

    /* ---- the spectral surface glowing through the fold ---- */
    float along = clamp((pw.x - 536.) / 236., 0., 1.);
    float sp = spectrumAt(along * .85);
    float seamW = 2.2 + 1.6 * uGap + 2.2 * sp;
    vec3 specCol = mix(mix(uPalA, vec3(1.), .12), mix(uPalB, vec3(1.), .08), along);
    vec3 emis = specCol * fw * exp(-pow((ar + 1.5) / seamW, 2.)) * (.16 + 1.25 * sp + .5 * uAudio.w) * (.35 + .65 * uPlaying);
    col += specCol * fw * exp(-pow((ar + 9.) / 13., 2.)) * (.02 + .16 * sp) * (.35 + .65 * uPlaying);

    /* ---- the time-preview lens darkens what is under it ---- */
    col = mix(col, col * .3 + uPalC * .03, lensMask * .85);

    /* ---- words and glyphs, suspended in the liquid ---- */
    {
      vec2 qi = qWord;
      float gain = 1.;
      for (int i = 0; i < 3; i++) {                                 // glyphs squash with their button
        vec2 dq = qi - uBtn[i].xy;
        if (dot(dq, dq) < uBtn[i].z * uBtn[i].z) {
          qi = uBtn[i].xy + dq / (1. - .15 * uBtn[i].w) - vec2(0., 1.4 * uBtn[i].w);
          gain = 1. - .2 * clamp(uBtn[i].w, 0., 1.);
        }
      }
      for (int i = 0; i < 2; i++) {                                 // dish glyphs only exist while hovered
        vec3 u = i == 0 ? UTIL0 : UTIL1;
        vec2 dq = qi - u.xy;
        if (dot(dq, dq) < (u.z + 3.) * (u.z + 3.)) {
          qi = u.xy + dq / (1. - .16 * (i == 0 ? uUtil.y : uUtil.z));
          gain = smoothstep(.35, 1., uUtil.x);
        }
      }
      if (lensMask > 0.) { qi = TIP_SLOT + (pw - uTip.xy); gain = lensMask; }

      // A little colour separation where the surface is steep: glass, not paper.
      vec2 fringe = wordBend * .3;
      vec3 word = vec3(ink(qi - fringe, 0.), ink(qi, 0.), ink(qi + fringe, 0.));
      float glow = ink(qi, 3.4);
      col += (word * 1.02 + mix(hotA, vec3(1.), .55) * glow * .1) * gain * born * (1. - .35 * F);
    }

    /* ---- timeline ---- */
    vec3 warmWhite = vec3(1., .95, .9);
    float sx = mix(SEEK_X.x, SEEK_X.y, uSeek.x);
    float xc = clamp(q.x, SEEK_X.x, SEEK_X.y);
    float dl = length(vec2(q.x - xc, q.y - seekLine(xc)));
    float played = smoothstep(sx + 1., sx - 1., q.x);
    float core = smoothstep(2.5 + .6 * uSeek.w, 1.1, dl);
    emis += mix(vec3(.8, .8, .84) * .62, warmWhite * 1.3, played) * core;
    emis += hotA * played * (.8 * exp(-dl * dl / 30.) + .16 * exp(-dl * dl / 380.)) * (.7 + .5 * uAudio.w + .25 * uSeek.z);
    // The bead stretches the way it is being pulled and thins as it does.
    float st = clamp(uSeekPull.x, -1., 1.);
    vec2 bq = q - vec2(sx - 5. * st, seekLine(sx));
    float db = length(bq * vec2(1. / (1. + .75 * abs(st)), 1. + .22 * abs(st)));
    float br = 6.4 * (1. + .55 * uSeek.y);
    emis += warmWhite * 2. * smoothstep(br + .8, br - .8, db);
    emis += hotA * (.7 + .7 * uSeek.z + .5 * uAudio.w) * exp(-db * db / (2. * br * br * 4.5));

    /* ---- volume, along the lip ---- */
    float vx = mix(VOL_X.x, VOL_X.y, uVol.x);
    float vxc = clamp(q.x, VOL_X.x, VOL_X.y);
    float dv = length(vec2(q.x - vxc, q.y - volY(vxc)));
    float vplayed = smoothstep(vx + 1., vx - 1., q.x) * (1. - uVol.w);
    float vcore = smoothstep(3. + .5 * uVol.z, 1.5, dv);
    emis += mix(vec3(.82, .82, .86) * .8, warmWhite * 1.35, vplayed) * vcore;
    emis += hotA * vplayed * .6 * exp(-dv * dv / 24.);
    float dvb = length(q - vec2(vx, volY(vx)));
    float vr = 5.6 * (1. + .5 * uVol.y);
    emis += warmWhite * 1.9 * smoothstep(vr + .8, vr - .8, dvb) * (1. - .6 * uVol.w);
    emis += hotA * (.5 + 1.4 * uVol.y) * exp(-dvb * dvb / (2. * vr * vr * 4.)) * (1. - uVol.w);

    col += emis * (1. - .3 * F) * born * mix(.7, 1.12, uSeekPull.z);

    // A light carried by the cursor: the reflection that travels with it.
    vec3 Lc = normalize(vec3(uCursor.x - p.x, -(uCursor.y - p.y), 70.));
    vec3 Hc = normalize(Lc + V);
    float glint = pow(max(dot(N, Hc), 0.), 200.) * 3.2 + pow(max(dot(N, Hc), 0.), 26.) * .2;
    float near = exp(-dot(p - uCursor.xy, p - uCursor.xy) / (2. * 150. * 150.));
    col += vec3(1., .98, .96) * glint * uCursor.z * near;

    /* ---- how much it holds back of what is behind the window ----
       Nearly everything. The drop is dark glass with a colour of its own, so it looks the
       same over a white page, a photograph or a game. Seen straight through, whatever was
       behind it collided with the words on it and washed it out on a light desktop (88%
       was tried and still let sharp words through). Only the outermost of the rolled
       edge, where the liquid is thin, lets a little more by. */
    glass = .945 + .02 * depth + .03 * max(pl.x, max(pl.y, pl.z)) + .03 * tshadow + .03 * lensMask;
    glass = mix(.86, glass, smoothstep(0., 6., -d));
    glass = clamp(max(glass, uGlassFloor), 0., .975);
  }

  /* ================================ the underside ================================ */
  if (covTop < 1. && covBody > 0.) {
    // The lip carrying on round and under, seen from a little above. Across it (wt: 0 under
    // the top face's edge, 1 at its own lower edge) the surface turns from facing outward to
    // facing down and toward the viewer, so what it mirrors is the floor: dark right under
    // the overhang, the album's colour gathering lower down, and never the same for long
    // along the outline, because the room is not.
    float wt = clamp(d / max(d - dU, 1e-3), 0., 1.);
    vec2 gO = vec2(outline(pw + vec2(1.5, 0.)) - d, outline(pw + vec2(0., 1.5)) - d) / 1.5;
    vec2 nO = gO / max(length(gO), 1e-3);
    vec3 Nw = normalize(vec3(nO.x, -nO.y, .06 + 1.5 * wt));
    gSoft = .09;
    vec3 Rw = rotY(uLean.x * .26) * rotX(uLean.y * -.2) * reflect(-V, Nw);
    float Fw = mix(.34, .9, pow(1. - max(dot(Nw, V), 0.), 2.5));
    vec3 dyeW = texture(uDye, (pw - uWall * .6) / STAGE).rgb;
    vec3 wall = env(Rw) * Fw + (uPalC * .06 + dyeW * .4) * (1. - Fw);
    wall *= 1. - .35 * wt;                                                           // falling into shadow lower down
    float wallGlass = .9 + .07 * wt;
    // Refraction (experiment): through the side of the drop, what is behind is drawn far up under the top face.
    if (uBackPx.y > 0.) wall += behind(pw - normalize(uWall) * 22. * (1. - .5 * wt), 4.5) * vec3(.9, .94, 1.) * (1. - wallGlass) * .8 * uBackPx.y;
    col = mix(wall, col, covTop);
    glass = mix(wallGlass, glass, covTop);
  }

  /* ================================ the cover tile ================================ */
  if (covTile > 0.) {
    vec2 tq = tilePlane(pw, uTile.xy);
    vec2 cuv = tq / (2. * COVER_HALF) + .5;
    // Which way the tile's edge faces here.
    float e2 = .7;
    vec2 gT = vec2(sdRBox(tq + vec2(e2, 0.), vec2(COVER_HALF), COVER_R) - sdRBox(tq - vec2(e2, 0.), vec2(COVER_HALF), COVER_R),
                   sdRBox(tq + vec2(0., e2), vec2(COVER_HALF), COVER_R) - sdRBox(tq - vec2(0., e2), vec2(COVER_HALF), COVER_R)) / (2. * e2);
    gT = turn(gT, COVER_ROT);
    // Its side: thick glass seen edge-on, mirroring the room below over the picture's own
    // colour drawn out through it. No line is drawn on it.
    gSoft = .06;
    vec3 side = pow(coverColor(clamp(cuv, .02, .98), pw, flow), vec3(2.2)) * .5 + vec3(.03, .03, .035)
              + env(reflect(-V, normalize(vec3(gT.x, -gT.y, .55)))) * .5;
    vec3 tile = side;
    if (covFace > 0.) {
      // A bevel round the edge. Cut glass shows light only where a facet faces a lamp: the
      // upper and left edges catch the lamps, the lower edge the colour off the floor.
      float bevel = smoothstep(-6.5, -.4, dT);
      vec3 Nt = normalize(vec3(gT.x * bevel * 1.25 + uLean.x * .05, -gT.y * bevel * 1.25 - uLean.y * .05, 1.));
      float ndt = max(dot(Nt, V), 0.);
      vec3 Rt = rotY(uLean.x * .3) * rotX(uLean.y * -.24) * reflect(-V, Nt);
      gSoft = .03;
      float Ft = mix(mix(.05, .55, bevel), 1., pow(1. - ndt, 3.));
      vec3 art = pow(coverColor(cuv, pw, flow), vec3(2.2)) * 1.05;
      vec3 face = art * (1. - Ft) + env(Rt) * Ft;
      // One soft sheen lying across the glass; it slides as the cursor moves.
      float sweep = (tq.x - tq.y) / (2. * COVER_HALF) - uLean.x * .35 + uLean.y * .2;
      face += vec3(1.) * .07 * smoothstep(.35, .0, abs(sweep + .25));
      tile = mix(side, face, covFace);
    }
    col = mix(col, tile, covTile);
    glass = mix(glass, mix(.82, .97, covFace), covTile);
  }

  float cov = max(covBody, covTile);
  oBody = vec4(col, cov);
  // With refraction in, nothing shows through the window itself: what is behind is drawn above, bent.
  oGlass = vec4(mix(glass, 1., uBackPx.y), 0., 0., 1.);
}`;

/* =================================================================== sim === */

const SIM_HEAD = HEAD + /* glsl */`
out vec4 o;
uniform vec2 uTexel;
${SHAPE_GLSL}
${NOISE}
`;

/**
 * Pigment from a cover colour: its hue at full strength, and nothing from its darkness. A
 * cover with no colour to give (white, grey) gives the album's primary colour instead:
 * white pigment is fog.
 */
const PIGMENT = /* glsl */`
uniform vec3 uPal;
vec3 pigment(vec3 art) {
  art = pow(art, vec3(2.2));
  float hi = max(art.r, max(art.g, art.b)), lo = min(art.r, min(art.g, art.b));
  float coloured = smoothstep(.12, .4, (hi - lo) / max(hi, 1e-3));
  vec3 own = uPal / max(max(uPal.r, max(uPal.g, uPal.b)), .08);
  return mix(own, art / max(hi, .08), coloured) * smoothstep(.015, .3, hi);
}
`;

/**
 * Velocity: carried along itself, then eased toward a slow circulation.
 * The circulation is the curl of a stream function that is zero at the walls,
 * so it swirls and never runs out through the outline.
 */
export const SIM_FORCE = SIM_HEAD + /* glsl */`
uniform sampler2D uVel;
uniform float uDt;
uniform float uTime;
uniform float uFlow;

float psi(vec2 p) {
  float wall = smoothstep(0., -36., bodySdf(p, 0.));
  vec2 a = p - vec2(186., 200.), b = p - vec2(650., 196.);
  float gyres = exp(-dot(a, a) / 9000.) - exp(-dot(b, b) / 12000.);
  float n = fbm2(p * .008 + vec2(uTime * .021, -uTime * .013)) - .5;
  float n2 = fbm2(p * .019 - vec2(uTime * .03, uTime * .017)) - .5;
  // A slow current that follows the walls all the way round: it has to squeeze
  // through the neck, so it runs faster there and idles in the wide lobes.
  // (It runs left to right along the lower edge, the same way as the stream in the lip.
  // Running the other way, it tore the stream's threads apart at the waist.)
  float loop = -.9 * smoothstep(0., -58., bodySdf(p, 0.));
  return wall * (gyres + 1.1 * n + .4 * n2) + loop;
}

// Solid things the liquid has to go round: the three button dishes.
float solid(vec2 p) {
  float s = smoothstep(4., -4., length(p - BTN0.xy) - BTN0.z + 3.);
  s = max(s, smoothstep(4., -4., length(p - BTN1.xy) - BTN1.z + 4.));
  s = max(s, smoothstep(4., -4., length(p - BTN2.xy) - BTN2.z + 3.));
  return s;
}

void main() {
  vec2 p = vUv * STAGE;
  vec2 v = texture(uVel, vUv).xy;
  v = texture(uVel, vUv - uDt * v / STAGE).xy;
  float e = 3.;
  vec2 cur = vec2(psi(p + vec2(0., e)) - psi(p - vec2(0., e)), psi(p - vec2(e, 0.)) - psi(p + vec2(e, 0.))) / (2. * e) * uFlow;
  // A steady stream inside the lower lip, between the timeline and the edge, following the
  // outline round. Pigment let go into it is drawn out into long threads. Inside the
  // stream the slow circulation gives way to it, so the threads stay clean.
  float sd = bodySdf(p, 0.);
  vec2 g = vec2(bodySdf(p + vec2(2., 0.), 0.) - sd, bodySdf(p + vec2(0., 2.), 0.) - sd);
  float lower = smoothstep(-2., 10., p.y - seekY(clamp(p.x, SEEK_X.x, SEEK_X.y)));
  float band = exp(-pow((-sd - 11.) / 9., 2.)) * lower * smoothstep(150., 215., p.x) * smoothstep(786., 700., p.x);
  cur = mix(cur, normalize(vec2(g.y, -g.x) + 1e-5) * uFlow * .1, band);
  // The stream is held firmly to its course: left to itself a jet in still liquid rolls up
  // into curls within a few lengths, which is smoke again.
  v += (cur - v) * (1. - exp(-uDt * (.45 + 16. * band)));
  v *= exp(-uDt * .16);
  v *= smoothstep(6., -10., bodySdf(p, 0.)) * (1. - .96 * solid(p));
  o = vec4(clamp(v, -1200., 1200.), 0., 1.);
}`;

export const SIM_CURL = SIM_HEAD + /* glsl */`
uniform sampler2D uVel;
void main() {
  float l = texture(uVel, vUv - vec2(uTexel.x, 0.)).y;
  float r = texture(uVel, vUv + vec2(uTexel.x, 0.)).y;
  float t = texture(uVel, vUv - vec2(0., uTexel.y)).x;
  float b = texture(uVel, vUv + vec2(0., uTexel.y)).x;
  o = vec4(.5 * (r - l - b + t), 0., 0., 1.);
}`;

/** Vorticity confinement: puts back the small curls that advection smears away. */
export const SIM_VORTICITY = SIM_HEAD + /* glsl */`
uniform sampler2D uVel;
uniform sampler2D uCurl;
uniform float uDt;
uniform float uStrength;
void main() {
  float l = texture(uCurl, vUv - vec2(uTexel.x, 0.)).x;
  float r = texture(uCurl, vUv + vec2(uTexel.x, 0.)).x;
  float t = texture(uCurl, vUv - vec2(0., uTexel.y)).x;
  float b = texture(uCurl, vUv + vec2(0., uTexel.y)).x;
  float c = texture(uCurl, vUv).x;
  vec2 f = .5 * vec2(abs(b) - abs(t), abs(r) - abs(l));
  f = f / (length(f) + 1e-4) * uStrength * c;
  vec2 v = texture(uVel, vUv).xy + vec2(f.x, -f.y) * uDt;
  o = vec4(clamp(v, -1200., 1200.), 0., 1.);
}`;

export const SIM_DIVERGENCE = SIM_HEAD + /* glsl */`
uniform sampler2D uVel;
void main() {
  float l = texture(uVel, vUv - vec2(uTexel.x, 0.)).x;
  float r = texture(uVel, vUv + vec2(uTexel.x, 0.)).x;
  float t = texture(uVel, vUv - vec2(0., uTexel.y)).y;
  float b = texture(uVel, vUv + vec2(0., uTexel.y)).y;
  o = vec4(.5 * (r - l + b - t), 0., 0., 1.);
}`;

export const SIM_PRESSURE = SIM_HEAD + /* glsl */`
uniform sampler2D uPressure;
uniform sampler2D uDiv;
void main() {
  float l = texture(uPressure, vUv - vec2(uTexel.x, 0.)).x;
  float r = texture(uPressure, vUv + vec2(uTexel.x, 0.)).x;
  float t = texture(uPressure, vUv - vec2(0., uTexel.y)).x;
  float b = texture(uPressure, vUv + vec2(0., uTexel.y)).x;
  float div = texture(uDiv, vUv).x;
  o = vec4((l + r + t + b - div) * .25, 0., 0., 1.);
}`;

export const SIM_PROJECT = SIM_HEAD + /* glsl */`
uniform sampler2D uPressure;
uniform sampler2D uVel;
void main() {
  float l = texture(uPressure, vUv - vec2(uTexel.x, 0.)).x;
  float r = texture(uPressure, vUv + vec2(uTexel.x, 0.)).x;
  float t = texture(uPressure, vUv - vec2(0., uTexel.y)).x;
  float b = texture(uPressure, vUv + vec2(0., uTexel.y)).x;
  vec2 v = texture(uVel, vUv).xy - .5 * vec2(r - l, b - t);
  o = vec4(v, 0., 1.);
}`;

/**
 * One push on the liquid, in any mix of three shapes: a straight shove (a jet,
 * a dragging pointer), a spin (a vortex), and a burst outward (a splash).
 */
export const SIM_IMPULSE = SIM_HEAD + /* glsl */`
uniform sampler2D uVel;
uniform vec2 uPoint;      // stage position
uniform vec2 uPush;       // stage px / s
uniform float uSpin;
uniform float uBurst;
uniform float uRadius;
void main() {
  vec2 q = vUv * STAGE - uPoint;
  float g = exp(-dot(q, q) / (uRadius * uRadius));
  vec2 v = texture(uVel, vUv).xy;
  v += uPush * g;
  v += uSpin * vec2(-q.y, q.x) / uRadius * g;
  v += uBurst * q / uRadius * g;
  o = vec4(v, 0., 1.);
}`;

/** A drop of pigment: the cover's own colour where it fell from, or a given one. */
export const SIM_DROP = SIM_HEAD + /* glsl */`
uniform sampler2D uDye;
uniform sampler2D uCover;
uniform vec2 uPoint;
uniform float uRadius;
uniform float uAmount;
uniform vec3 uColor;
uniform vec3 uCoverUv;    // xy where on the cover, z 1 to use it
${PIGMENT}

void main() {
  vec2 q = vUv * STAGE - uPoint;
  float g = exp(-dot(q, q) / (uRadius * uRadius));
  vec3 c = mix(uColor, pigment(textureLod(uCover, uCoverUv.xy, 2.5).rgb), uCoverUv.z);
  vec3 dye = texture(uDye, vUv).rgb;
  o = vec4(dye + c * g * uAmount * (1. - .45 * clamp(max(dye.r, max(dye.g, dye.b)), 0., 1.)), 1.);
}`;

/** Plain semi-Lagrangian step, forward or backward in time. */
export const SIM_ADVECT = SIM_HEAD + /* glsl */`
uniform sampler2D uSrc;
uniform sampler2D uVel;
uniform float uDt;        // negative runs time backward
void main() {
  vec2 v = texture(uVel, vUv).xy;
  o = vec4(texture(uSrc, vUv - uDt * v / STAGE).rgb, 1.);
}`;

/**
 * Pigment: carried with a corrected (MacCormack) step so plumes keep their
 * fine curling edges instead of smearing into a wash, then faded, fed by the
 * cover's slow seep, and kept inside the outline.
 */
export const SIM_DYE = SIM_HEAD + /* glsl */`
uniform sampler2D uDye;       // before this step
uniform sampler2D uFwd;       // carried forward
uniform sampler2D uBwd;       // carried forward, then back
uniform sampler2D uVel;
uniform sampler2D uCover;
uniform float uDt;
uniform float uFade;          // seconds for pigment to die away
uniform float uSeep;          // how fast the cover leaks between drops
uniform float uBurst;         // song change: the whole cover becomes pigment
uniform float uTime;
${PIGMENT}

void main() {
  vec2 p = vUv * STAGE;
  vec2 v = texture(uVel, vUv).xy;
  vec2 back = vUv - uDt * v / STAGE;

  vec3 dye = texture(uFwd, vUv).rgb + .5 * (texture(uDye, vUv).rgb - texture(uBwd, vUv).rgb);
  // The correction may not invent values the neighbourhood did not have.
  vec2 b0 = (floor(back / uTexel - .5) + .5) * uTexel;
  vec3 c00 = texture(uDye, b0).rgb, c10 = texture(uDye, b0 + vec2(uTexel.x, 0.)).rgb;
  vec3 c01 = texture(uDye, b0 + vec2(0., uTexel.y)).rgb, c11 = texture(uDye, b0 + uTexel).rgb;
  dye = clamp(dye, min(min(c00, c10), min(c01, c11)), max(max(c00, c10), max(c01, c11)));
  dye *= exp(-uDt / uFade);

  float dc = sdRBox(p - COVER_C, vec2(COVER_HALF), COVER_R);
  vec2 cuv = clamp((p - COVER_C) / (2. * COVER_HALF) + .5, .04, .96);
  vec3 art = pigment(texture(uCover, cuv).rgb);
  // Between drops the tile weeps a little from its lower edge only, in threads, a short
  // way into the lobe below it. Nothing leaves its other edges: that is where the words are.
  float thread = pow(smoothstep(.4, .82, fbm2(vec2(p.x * .16, uTime * .11))), 2.);
  float lowerEdge = smoothstep(9., 2., abs(dc - 5.)) * smoothstep(COVER_C.y + COVER_HALF - 12., COVER_C.y + COVER_HALF + 2., p.y);
  dye += art * lowerEdge * (.03 + 1.5 * thread) * uSeep * uDt;
  dye = mix(dye, art * 1.15, uBurst * smoothstep(3., -6., dc) * .5);
  // The stream: three fine threads let go into the current that runs inside the lower lip,
  // each fed from a different part of the cover, each coming and going on its own.
  float sd = bodySdf(p, 0.);
  float below = smoothstep(-2., 10., p.y - seekY(clamp(p.x, SEEK_X.x, SEEK_X.y)));
  float gate = exp(-pow((p.x - 226.) / 6., 2.)) * below;
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float across = exp(-pow((-sd - (6.5 + 4.5 * fi)) / 2.4, 2.));
    float flick = .45 + .55 * smoothstep(.3, .75, fbm2(vec2(uTime * (.23 + .07 * fi), 7. * fi + 3.)));
    dye += pigment(textureLod(uCover, vec2(.3 + .25 * fi, .78 - .12 * fi), 4.).rgb) * across * gate * flick * uSeep * 45. * uDt;
  }

  dye *= smoothstep(10., -6., sd);
  o = vec4(clamp(dye, 0., 1.7), 1.);
}`;

/* ================================================================= bloom === */

export const BLOOM_PREFILTER = HEAD + /* glsl */`
out vec4 o;
uniform sampler2D uBody;
uniform sampler2D uAura;
uniform vec2 uTexel;
vec3 scene(vec2 uv) {
  vec4 b = texture(uBody, uv);
  return b.rgb * b.a + texture(uAura, uv).rgb * (1. - b.a);
}
void main() {
  vec3 c = vec3(0.);
  c += scene(vUv + uTexel * vec2(-1, -1));
  c += scene(vUv + uTexel * vec2( 1, -1));
  c += scene(vUv + uTexel * vec2(-1,  1));
  c += scene(vUv + uTexel * vec2( 1,  1));
  c *= .25;
  float l = max(c.r, max(c.g, c.b));
  float k = max(l - 1., 0.) / max(l, 1e-4);
  o = vec4(min(c * k, vec3(12.)), 1.);
}`;

export const BLOOM_DOWN = HEAD + /* glsl */`
out vec4 o;
uniform sampler2D uSrc;
uniform vec2 uTexel;
void main() {
  vec3 c = texture(uSrc, vUv).rgb * 4.;
  c += texture(uSrc, vUv + uTexel * vec2(-1, -1)).rgb;
  c += texture(uSrc, vUv + uTexel * vec2( 1, -1)).rgb;
  c += texture(uSrc, vUv + uTexel * vec2(-1,  1)).rgb;
  c += texture(uSrc, vUv + uTexel * vec2( 1,  1)).rgb;
  o = vec4(c / 8., 1.);
}`;

export const BLOOM_UP = HEAD + /* glsl */`
out vec4 o;
uniform sampler2D uSrc;
uniform vec2 uTexel;
void main() {
  vec3 c = vec3(0.);
  c += texture(uSrc, vUv + uTexel * vec2(-2,  0)).rgb;
  c += texture(uSrc, vUv + uTexel * vec2( 2,  0)).rgb;
  c += texture(uSrc, vUv + uTexel * vec2( 0, -2)).rgb;
  c += texture(uSrc, vUv + uTexel * vec2( 0,  2)).rgb;
  c += texture(uSrc, vUv + uTexel * vec2(-1, -1)).rgb * 2.;
  c += texture(uSrc, vUv + uTexel * vec2( 1, -1)).rgb * 2.;
  c += texture(uSrc, vUv + uTexel * vec2(-1,  1)).rgb * 2.;
  c += texture(uSrc, vUv + uTexel * vec2( 1,  1)).rgb * 2.;
  o = vec4(c / 12., 1.);
}`;

/**
 * Resolve to the screen. The scene is rendered larger than the canvas; each
 * of the four samples under a pixel is tone-mapped on its own and only then
 * averaged, which is what keeps a white-hot rim from stair-stepping.
 */
export const COMPOSITE = HEAD + /* glsl */`
out vec4 o;
uniform sampler2D uBody;
uniform sampler2D uAura;
uniform sampler2D uGlass;
uniform sampler2D uBloom;
uniform float uBloomAmt;
uniform vec2 uCanvasTexel;

vec3 tonemap(vec3 x) {
  // ACES fit (Narkowicz): holds colour in the highlights instead of clipping to white.
  x *= .82;
  return clamp((x * (2.51 * x + .03)) / (x * (2.43 * x + .59) + .14), 0., 1.);
}
vec3 encode(vec3 lin) { return pow(tonemap(lin), vec3(1. / 2.2)); }

void main() {
  vec3 bloom = texture(uBloom, vUv).rgb * uBloomAmt;
  // Nothing may reach the canvas's own edge, or the widget would show its rectangle.
  vec2 margin = min(vUv, 1. - vUv);
  float inside = smoothstep(0., .03, min(margin.x * 2.15, margin.y));
  vec4 acc = vec4(0.);
  for (int i = 0; i < 4; i++) {
    vec2 uv = vUv + vec2(i % 2 == 0 ? -.25 : .25, i < 2 ? -.25 : .25) * uCanvasTexel;
    vec4 body = texture(uBody, uv);
    vec4 aura = texture(uAura, uv);
    // The glow outside the drop is light with nothing of its own behind it. Light with no
    // alpha at all is kept by one monitor's compositor and thrown away by another's, and
    // where it is kept it clips a light desktop to white. So it is given alpha: as much as
    // its weakest channel, which makes the white in it an ordinary premultiplied colour (a
    // screen blend, which cannot pass white) and leaves only its colour to be added; and
    // never none at all where there is any light, so every compositor treats it alike.
    vec3 glow = encode(aura.rgb + bloom) * inside;
    float gmax = max(glow.r, max(glow.g, glow.b));
    float ga = max(min(glow.r, min(glow.g, glow.b)), min(gmax, .012));
    // Encode each side of the outline on its own, then blend by coverage.
    // Blending first would brighten or darken every edge pixel into a fringe.
    acc.rgb += encode(body.rgb + bloom) * body.a + glow * (1. - body.a);
    // Inside the drop its light is added to the desktop and only its smoky tint holds the
    // desktop back; outside, the glow lies over the shadow.
    acc.a += body.a * texture(uGlass, uv).r + (ga + aura.a * inside * (1. - ga)) * (1. - body.a);
  }
  acc *= .25;
  // Dither: eight bits would band in the soft gradients. Not where there is nothing at all.
  float n = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  acc.rgb += (n - .5) / 255. * step(.002, acc.a);
  o = vec4(max(acc.rgb, 0.), acc.a);
}`;
