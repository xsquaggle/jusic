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

${SHAPE_GLSL}
${NOISE}

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

// The cover tile in its own frame.
float tileSdf(vec2 p, vec2 centre) { return sdRBox(turn(p - centre, -COVER_ROT), vec2(COVER_HALF), COVER_R); }

/* --------------------------------------------------------------- details --- */

vec3 sdgStadium(vec2 p, vec2 b, float r) {
  vec2 w = abs(p) - (b - r);
  vec2 s = vec2(p.x < 0. ? -1. : 1., p.y < 0. ? -1. : 1.);
  float g = max(w.x, w.y);
  vec2 q = max(w, 0.);
  float l = max(length(q), 1e-4);
  return vec3(g > 0. ? l - r : g - r, s * (g > 0. ? q / l : (w.x > w.y ? vec2(1, 0) : vec2(0, 1))));
}

// How strongly the fold exists at a point on the basin's rim: full along the
// top and round the right end, gone along the bottom.
float foldWeight(vec2 grad) {
  return smoothstep(-.42, .38, dot(grad, normalize(vec2(.42, -1.))));
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

  // Rolled edge: vertical at the silhouette, easing into the crown with no kink.
  float t = clamp(-d / EDGE_R, 0., 1.);
  float h = EDGE_H * sqrt(max(1. - pow(1. - t, 2.5), 0.));
  // The crown: the body keeps curving well past the edge, like a full drop of
  // liquid rather than a slab with rounded corners.
  float t2 = clamp(-d / 78., 0., 1.);
  h += 17. * (1. - (1. - t2) * (1. - t2));
  // Keep falling away outside, so the very edge still faces sideways.
  h -= max(d, 0.) * 3.;

  // Broad swells, drifting slowly.
  vec2 a = p - vec2(186., 196.), b = p - vec2(646., 196.), c = p - vec2(420., 240.);
  h += 7. * exp(-dot(a, a) / 21000.) + 6. * exp(-dot(b, b) / 24000.) + 4. * exp(-dot(c, c) / 9000.);
  h += 1.1 * sin(p.x * .017 + uTime * .36 + .8 * sin(p.y * .015 - uTime * .17));
  h += .7 * sin(p.x * .009 - p.y * .022 - uTime * .26 + 2.);

  // The tail: the right end twists as it draws out, one flank lifting.
  vec2 tq = p - vec2(752., 226.);
  h += 5.5 * exp(-dot(tq, tq) / 2600.) * (tq.y * .04 - tq.x * .02);

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

  // Button basin, the lip that stands over it, and the fold between them.
  vec3 bs = sdgStadium(p - BASIN_C, BASIN_B, BASIN_R);
  float fw = foldWeight(bs.yz);
  float right = smoothstep(486., 566., p.x);
  h -= 7.5 * smoothstep(10., -20., bs.x);
  h += 4.2 * smoothstep(-6., 30., bs.x) * right;
  h += 3. * fw * exp(-pow((bs.x - 7.) / 7., 2.));
  float gapW = 3.1 + 2.6 * uGap;
  h -= (1.6 + 3. * uGap) * fw * exp(-pow((bs.x + 1.) / gapW, 2.));
  // The lip leans toward the cursor; the basin and its buttons do not.
  h += dot(p - vec2(660., 120.), uLean * vec2(-.045, -.07)) * smoothstep(-2., 18., bs.x) * right * smoothstep(196., 150., p.y);

  // The twist: where the strap that carries the timeline sweeps up into the lip.
  float fy = mix(242., 166., smoothstep(470., 550., p.x));
  float strap = smoothstep(474., 508., p.x) * smoothstep(556., 520., p.x);
  h += 4.6 * smoothstep(-9., 9., p.y - fy) * strap;
  h += 1.5 * exp(-pow((p.y - fy + 3.) / 5., 2.)) * strap;

  // Buttons: a ring rim around a dish. Pressing deepens the dish and spreads the rim.
  for (int i = 0; i < 3; i++) {
    vec4 bt = uBtn[i];
    float press = bt.w;
    float r = bt.z * (1. + .06 * press);
    float rho = length(p - bt.xy);
    h += (3.8 - 1.6 * press) * exp(-pow((rho - r) / 3.5, 2.));
    float inside = smoothstep(r + 1., r - 6., rho);
    h -= (5.5 + 8. * press) * inside * (1. - .5 * (rho * rho) / (r * r));
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
// It is dim and has no hard lines in it: light gathers smoothly toward the top
// of the screen and the album's colour toward the bottom, so the body shades
// as one form. On top of that sit three broad lights and two thin strips that
// draw the single bright line along the upper and lower edges.
vec3 env(vec3 r) {
  vec3 warm = vec3(1., .955, .91), cool = vec3(.86, .93, 1.);
  vec3 hot = mix(uPalA, vec3(1.), .16);
  float tilt = r.y * (1. - .3 * max(r.z, 0.));

  vec3 c = vec3(.010, .011, .014);
  c += cool * .55 * smoothstep(.42, 1., tilt);
  c += hot * 1.05 * smoothstep(-.22, -1., tilt);

  c += warm * 1.25 * softbox(r, normalize(vec3(-.38, .6, .7)), vec3(1, 0, 0), vec2(.6, .32), .17);
  c += cool * .85 * softbox(r, normalize(vec3(.34, .62, .7)), vec3(1, 0, 0), vec2(.44, .22), .2);
  c += cool * 4.2 * softbox(r, normalize(vec3(0., .96, .28)), vec3(1, 0, 0), vec2(1.8, .03), .02);
  c += mix(hot, vec3(1.), .25) * 3. * softbox(r, normalize(vec3(.05, -.95, .3)), vec3(1, 0, 0), vec2(1.6, .03), .022);
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

  /* ---- outside it: a soft coloured shadow, kept close ---- */
  vec2 border = min(p, STAGE - p);
  float window = smoothstep(0., 40., min(border.x, border.y));
  float below = outline(pw - uWall - vec2(0., 12.));
  float shadow = .26 * smoothstep(34., -26., below) * window * uForm;
  vec3 halo = hotA * (.02 * exp(-max(min(d, dU), 0.) / 9.) + .1 * exp(-max(below, 0.) / 15.) * smoothstep(-30., 20., d))
            * (life + .9 * uAudio.w) * window * loud;
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
  vec3 rimCol = vec3(1.);

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

    // In a pool the standing form is all but level; ripples and presses still cross it.
    vec3 pl = pools(pw) * born;
    float still = max(pl.x, max(.72 * pl.y, .78 * pl.z));
    slopeB *= 1. - .93 * still;
    slopeD *= 1. - .45 * still;
    vec2 slope = slopeB + slopeD;

    vec3 N = normalize(vec3(-slope.x, slope.y, 1.));         // y flipped: up is up
    float ndv = max(dot(N, V), 0.);
    vec3 R = reflect(-V, N);
    R = rotY(uLean.x * .26 + .02 * uAudio.x * sin(uTime * 5.3)) * rotX(uLean.y * -.2 + .016 * uAudio.y * sin(uTime * 7.1)) * R;

    vec3 bs = sdgStadium(pw - BASIN_C, BASIN_B, BASIN_R);
    float fw = foldWeight(bs.yz);

    // Where things under the surface appear to be: bent by the slope above them.
    vec2 bend = clamp(slopeD, -1.2, 1.2) + clamp(slopeB, -1., 1.) * .16;
    vec2 q = pw + bend * 7. - uLean * 1.4;
    // Words may only shift by a hair, so they stay crisp and exactly where they are clicked.
    vec2 wordBend = bend * 7.;
    wordBend /= max(1., length(wordBend) / 1.5);
    vec2 qWord = pw + wordBend - uLean * 1.1;

    /* ---- pigment: light suspended in the liquid ---- */
    vec2 duv = (pw + clamp(slope, -1.4, 1.4) * 14.) / STAGE;
    vec3 dye = texture(uDye, duv).rgb;
    float dyeAmt = clamp(max(dye.r, max(dye.g, dye.b)), 0., 1.);
    vec2 hz = 9. / STAGE;
    vec3 haze = (texture(uDye, duv + vec2(hz.x, 0.)).rgb + texture(uDye, duv - vec2(hz.x, 0.)).rgb
               + texture(uDye, duv + vec2(0., hz.y)).rgb + texture(uDye, duv - vec2(0., hz.y)).rgb) * .25;
    // Thin pigment stays clear; where it gathers it glows in its own colour, brighter than white at the core.
    vec3 hue = dye / max(dyeAmt, 1e-3);
    hue = mix(hue, hue * hue * 1.15, .4);
    vec3 lumen = hue * (1.3 * smoothstep(.14, .9, dyeAmt) + 1.6 * dyeAmt * dyeAmt * dyeAmt) + haze * haze * .5;

    /* ---- the liquid: clear glass that mirrors like chrome ---- */
    float F = mix(.5, 1., pow(1. - ndv, 3.));
    vec3 tint = mix(vec3(.95, .96, 1.), mix(vec3(1.), normalize(dye + 1e-3) * 1.5, .5), dyeAmt * .32);
    float calm = max(ink(qWord, 10.) * 1.6, .9 * still);
    vec3 refl = env(R) * tint * (1. + .16 * uAudio.w + .1 * uAudio.z) * (1. - .8 * clamp(calm, 0., 1.));
    float depth = smoothstep(0., 60., -d);
    float smoke = fbm2(p * .011 + vec2(uTime * .02, 0.) + flow * .0006);
    float lensMask = uTip.z * smoothstep(1.5, -1.5, sdRBox(pw - uTip.xy, TIP_HALF, TIP_HALF.y));
    float under = ink(qWord + vec2(1.5, 3.5), 5.) * (1. - lensMask) * born;
    vec3 inner = (uPalC * (.05 + .06 * depth) * (.6 + .8 * smoke) + lumen * (.7 + .4 * depth)) * (1. - .5 * under) * (1. - .75 * clamp(calm, 0., 1.));

    col = inner * (1. - .5 * F) + refl * F;

    // The rim: one continuous bright edge, white where it faces up and the
    // album's colour where it faces down, brightest toward the key light and
    // along the underside. A lit edge, not an outline drawn round the shape.
    rimCol = mix(mix(hotA, vec3(1.), .25), vec3(.93, .96, 1.), smoothstep(-.35, .45, N.y));
    vec2 nxy = normalize(N.xy + 1e-4);
    float lit = .28 + .72 * pow(max(dot(nxy, normalize(vec2(-.45, .9))), 0.), 1.5) + .75 * smoothstep(.15, .9, -nxy.y);
    col += rimCol * (2.3 * pow(1. - ndv, 16.) * lit + .12 * pow(1. - ndv, 3.));

    // Occlusion: under the lip, inside the dishes.
    float ao = 1.;
    ao *= 1. - .55 * fw * exp(-pow((bs.x + 5.) / 8., 2.));
    ao *= 1. - .22 * smoothstep(8., -20., bs.x);
    float dish = 0.;
    for (int i = 0; i < 3; i++) {
      float rho = length(pw - uBtn[i].xy);
      float r = uBtn[i].z;
      dish = max(dish, smoothstep(r + 2., r - 4., rho));
      ao *= 1. - (.5 + .2 * uBtn[i].w) * smoothstep(r - 1., r - 10., rho);
      // Pigment glowing up through the bottom of each dish.
      col += hotA * (.04 + .1 * uAudio.w + .25 * uBtn[i].w) * smoothstep(r, r * .2, rho) * smoothstep(r + 1., r - 3., rho)
             * (.6 + .4 * dot(normalize(pw - uBtn[i].xy + 1e-3), vec2(-.6, .8)));
    }
    for (int i = 0; i < 2; i++) {
      vec3 u = i == 0 ? UTIL0 : UTIL1;
      ao *= 1. - .45 * uUtil.x * smoothstep(u.z, u.z - 6., length(pw - u.xy));
    }
    col *= ao;

    // The tile floats above the liquid: its shadow, and the picture's own light spilling round it.
    float tshadow = .5 * smoothstep(18., -12., tileSdf(pw - vec2(5., 13.), uTile.xy)) * born;
    col *= 1. - tshadow;
    vec2 castUv = clamp(turn(pw - uTile.xy, -COVER_ROT) / (2. * COVER_HALF) + .5, .1, .9);
    vec3 spill = pow(mix(textureLod(uCoverA, castUv, 4.5).rgb, textureLod(uCoverB, castUv, 4.5).rgb, smoothstep(.3, .8, uTrans)), vec3(2.2));
    col += spill * 1.1 * exp(-max(dT, 0.) / 17.) * smoothstep(-8., 4., dT) * born;

    /* ---- the spectral surface glowing through the fold ---- */
    float along = clamp((pw.x - (BASIN_C.x - BASIN_B.x)) / (2. * BASIN_B.x), 0., 1.);
    float sp = spectrumAt(along * .85);
    float seamW = 3.2 + 2.6 * uGap + 4.5 * sp;
    vec3 specCol = mix(mix(uPalA, vec3(1.), .25), mix(uPalB, vec3(1.), .15), along);
    vec3 emis = specCol * fw * exp(-pow((bs.x + 1.5) / seamW, 2.)) * (.45 + 3.6 * sp + 1.3 * uAudio.w) * (.35 + .65 * uPlaying);
    col += specCol * fw * exp(-pow((bs.x + 9.) / 13., 2.)) * (.04 + .45 * sp) * (.35 + .65 * uPlaying);

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
      col += (word * 1.4 + mix(hotA, vec3(1.), .55) * glow * .34) * gain * born * (1. - .35 * F);
    }

    /* ---- timeline ---- */
    vec3 warmWhite = vec3(1., .95, .9);
    float sx = mix(SEEK_X.x, SEEK_X.y, uSeek.x);
    float xc = clamp(q.x, SEEK_X.x, SEEK_X.y);
    float dl = length(vec2(q.x - xc, q.y - seekLine(xc)));
    float played = smoothstep(sx + 1., sx - 1., q.x);
    float core = smoothstep(2.5 + .6 * uSeek.w, 1.1, dl);
    emis += mix(vec3(.8, .8, .84) * .7, warmWhite * 1.6, played) * core;
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
    emis += mix(vec3(.82, .82, .86) * 1.05, warmWhite * 2.1, vplayed) * vcore;
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
       Clear glass by default: a light smoky tint, more where the liquid is deep
       or turns away, where ink has gathered, in the control pod, and just
       behind the words so they read on any desktop. */
    glass = .44 + .2 * depth
          + .4 * pl.x + .3 * pl.y + .42 * pl.z
          + .34 * smoothstep(10., -14., bs.x) + .2 * dish
          + .5 * pow(1. - ndv, 2.)
          + .42 * dyeAmt + .5 * tshadow + .8 * lensMask;
    glass = clamp(glass, 0., .96);
  }

  /* ================================ the underside ================================ */
  if (covTop < 1. && covBody > 0.) {
    // How far down the wall this point is: 0 just under the top face's edge, 1 at the bottom.
    float wt = clamp(d / max(length(uWall), 1.), 0., 1.);
    vec3 dyeW = texture(uDye, (pw - uWall * .5) / STAGE).rgb;
    // Dark under the overhang, then the album's colour gathering toward the lower edge,
    // where the light that came down through the body leaves it.
    vec3 wall = uPalC * .1 + hotA * (.1 + .85 * pow(wt, 1.6)) + dyeW * .8;
    wall *= .55 + .45 * smoothstep(0., .25, wt);
    wall += mix(hotA, vec3(1.), .45) * 1.5 * exp(-pow((dU + 1.6) / 1.4, 2.));       // the lower edge catches the light
    float wallGlass = .62 + .26 * wt;
    col = mix(wall, col, covTop);
    glass = mix(wallGlass, glass, covTop);
  }

  /* ================================ the cover tile ================================ */
  if (covTile > 0.) {
    vec2 tq = turn(pw - uTile.xy, -COVER_ROT);
    vec2 cuv = tq / (2. * COVER_HALF) + .5;
    // Its side: the picture's edge drawn out through thick glass, with a bright lower corner.
    vec3 side = pow(coverColor(clamp(cuv, .02, .98), pw, flow), vec3(2.2)) * .9 + vec3(.1, .1, .11);
    side += vec3(1.) * .9 * exp(-pow((dTw + 1.4) / 1.3, 2.));
    vec3 tile = side;
    if (covFace > 0.) {
      // A bevel round the edge so the glass catches light like a cut tile.
      float e2 = .7;
      vec2 gT = vec2(sdRBox(tq + vec2(e2, 0.), vec2(COVER_HALF), COVER_R) - sdRBox(tq - vec2(e2, 0.), vec2(COVER_HALF), COVER_R),
                     sdRBox(tq + vec2(0., e2), vec2(COVER_HALF), COVER_R) - sdRBox(tq - vec2(0., e2), vec2(COVER_HALF), COVER_R)) / (2. * e2);
      gT = turn(gT, COVER_ROT);
      float bevel = smoothstep(-6., -.5, dT);
      vec3 Nt = normalize(vec3(-gT.x * bevel * 1.1 + uLean.x * .05, gT.y * bevel * 1.1 - uLean.y * .05, 1.));
      float ndt = max(dot(Nt, V), 0.);
      vec3 Rt = rotY(uLean.x * .3) * rotX(uLean.y * -.24) * reflect(-V, Nt);
      gSoft = .03;
      float Ft = mix(.05, 1., pow(1. - ndt, 3.));
      vec3 art = pow(coverColor(cuv, pw, flow), vec3(2.2)) * 1.55;
      vec3 face = art * (1. - Ft) + env(Rt) * Ft;
      // One soft sheen lying across the glass; it slides as the cursor moves.
      float sweep = (tq.x - tq.y) / (2. * COVER_HALF) - uLean.x * .35 + uLean.y * .2;
      face += vec3(1.) * .07 * smoothstep(.35, .0, abs(sweep + .25));
      face += vec3(1., .99, .97) * 1.1 * exp(-pow((dT + 1.3) / 1.2, 2.)) * (.5 + .5 * smoothstep(-.6, .6, -gT.x + gT.y * -1.));
      tile = mix(side, face, covFace);
    }
    col = mix(col, tile, covTile);
    glass = mix(glass, mix(.82, .97, covFace), covTile);
  }

  float cov = max(covBody, covTile);
  oBody = vec4(col, cov);
  oGlass = vec4(glass, 0., 0., 1.);
}`;

/* =================================================================== sim === */

const SIM_HEAD = HEAD + /* glsl */`
out vec4 o;
uniform vec2 uTexel;
${SHAPE_GLSL}
${NOISE}
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
  float loop = .9 * smoothstep(0., -58., bodySdf(p, 0.));
  return wall * (gyres + 2.4 * n + .9 * n2) + loop;
}

// Solid things the liquid has to go round: the three button dishes.
float solid(vec2 p) {
  float s = smoothstep(4., -4., length(p - vec2(566., 201.)) - 21.);
  s = max(s, smoothstep(4., -4., length(p - vec2(642., 198.)) - 33.));
  s = max(s, smoothstep(4., -4., length(p - vec2(718., 201.)) - 21.));
  return s;
}

void main() {
  vec2 p = vUv * STAGE;
  vec2 v = texture(uVel, vUv).xy;
  v = texture(uVel, vUv - uDt * v / STAGE).xy;
  float e = 3.;
  vec2 cur = vec2(psi(p + vec2(0., e)) - psi(p - vec2(0., e)), psi(p - vec2(e, 0.)) - psi(p + vec2(e, 0.))) / (2. * e) * uFlow;
  // A steady stream along the lower body, just under the timeline: pigment
  // caught in it is drawn out into long threads.
  float xs = clamp(p.x, SEEK_X.x - 10., SEEK_X.y + 60.);
  float band = exp(-pow((p.y - seekY(xs) - 17.) / 12., 2.)) * smoothstep(176., 236., p.x) * smoothstep(760., 680., p.x);
  cur += vec2(1., (seekY(xs + 4.) - seekY(xs - 4.)) / 8.) * uFlow * .036 * band;
  v += (cur - v) * (1. - exp(-uDt * (.45 + 1.2 * band)));
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

vec3 pigment(vec3 art) {
  art = pow(art, vec3(2.2));
  float lum = max(art.r, max(art.g, art.b));
  return art / max(lum, .08) * smoothstep(.015, .3, lum);     // keeps the hue, drops the darkness
}

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
  vec3 art = pow(texture(uCover, cuv).rgb, vec3(2.2));
  float lum = max(art.r, max(art.g, art.b));
  art = art / max(lum, .08) * smoothstep(.02, .35, lum);
  // Between drops the rim still weeps, in threads.
  float thread = pow(smoothstep(.4, .82, fbm2(p * .09 + vec2(0., uTime * .12))), 2.);
  dye += art * smoothstep(16., 2., abs(dc - 6.)) * (.1 + 2.2 * thread) * uSeep * uDt;
  dye = mix(dye, art * 1.15, uBurst * smoothstep(3., -6., dc) * .5);
  // The head of the stream: colour let go just below the tile, where the current picks it up.
  vec2 hq = p - vec2(250., seekY(250.) + 19.);
  vec3 mean = pow(textureLod(uCover, vec2(.6, .8), 5.).rgb, vec3(2.2));
  float ml = max(mean.r, max(mean.g, mean.b));
  dye += mean / max(ml, .08) * smoothstep(.02, .3, ml) * exp(-dot(hq, hq) / 150.) * (.35 + .65 * thread) * uSeep * 13. * uDt;

  dye *= smoothstep(10., -6., bodySdf(p, 0.));
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
  vec4 acc = vec4(0.);
  for (int i = 0; i < 4; i++) {
    vec2 uv = vUv + vec2(i % 2 == 0 ? -.25 : .25, i < 2 ? -.25 : .25) * uCanvasTexel;
    vec4 body = texture(uBody, uv);
    vec4 aura = texture(uAura, uv);
    // Encode each side of the outline on its own, then blend by coverage.
    // Blending first would brighten or darken every edge pixel into a fringe.
    acc.rgb += encode(body.rgb + bloom) * body.a + encode(aura.rgb + bloom) * (1. - body.a);
    // The liquid's light is added to the desktop; only its smoky tint holds the desktop back.
    acc.a += body.a * texture(uGlass, uv).r + aura.a * (1. - body.a);
  }
  acc *= .25;
  // Dither: eight bits would band in the soft gradients.
  float n = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  acc.rgb += (n - .5) / 255.;
  // Premultiplied. Where alpha is low the glow adds onto whatever is behind.
  o = vec4(max(acc.rgb, 0.), acc.a);
}`;
