/**
 * Mercury's live 3D glass: the renderer (the model of tools/mercury3d/build.py, exported with `-- export=<folder>`).
 * prototypes/glass3d/widget.js drives it in the widget window; this file only draws.
 *
 * Per frame, at `ss` times the canvas's own pixels (every pass, the off-screen ones included):
 *   1. the glass's nearest back faces (normal, depth): how thick the glass is, where a ray leaves it;
 *   2. the front faces behind those, then the back faces behind them (depth peeling): glass seen through glass,
 *      where the sheet lies over the body below;
 *   3. the cover: its art by its own light, a faint broad sheen;
 *   4. the glass's front faces: the studio mirrored (Fresnel); a ray bent into the glass, across it, out of its
 *      back, into the glass below and out again where there is some, then onto the desktop behind the window
 *      (refraction: at most about 40% of a white page comes through) or, with refraction off, the studio as seen
 *      through glass; the art where the ray meets the cover's face inside the ring; the cover's colours glowing
 *      in the ring round it; absorption by all the glass crossed; then the light pass;
 *   5. down to the canvas through a tent filter, each tap through Blender's own tone curve (a 3D table).
 */

const HEAD = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
#define PI 3.14159265
`;
const COMMON = `
uniform mat3 uToWorld;      // the root's frame -> the studio's (the tilt about X)
uniform sampler2D uEnv;
uniform sampler2D uEnvSoft;
uniform vec2 uEnvSize;       // the sharp map's width, the soft one's
uniform vec2 uGain;          // the studio's gains: mirrored, seen through
vec2 equi(vec3 d) { d = normalize(uToWorld * d); return vec2(.5 - atan(d.y, d.x) / (2. * PI), .5 + asin(clamp(d.z, -1., 1.)) / PI); }
// The map's level for a direction that turns by 'a' radians across one pixel (no thin strip shimmers or breaks up).
float lodFor(float a, float w) { return max(log2(max(a * w / (2. * PI), 1e-4)) + .5, 0.); }
vec3 envSharp(vec3 d, float a) { return textureLod(uEnv, equi(d), lodFor(a, uEnvSize.x)).rgb * uGain.x; }
vec3 envSoft(vec3 d, float a) { return textureLod(uEnvSoft, equi(d), lodFor(a, uEnvSize.y)).rgb * uGain.y; }
`;
// Phase 3: the glass answering the cursor and the presses. One field over the picture's plane pushes the front of the
// glass back (away from the camera) and tilts its normals to match: the dimple under the cursor, the ripples from a
// click, the press (squashed in under the pointer, bulging round it), the wells' floors sinking under a button. Only
// depth moves, so the silhouette (and the click-through drawn from it) never changes. Root units (1 = 100 ref px).
const MOTION = `
uniform int uMotionOn;
uniform float uShapeK;     // how much the outline moves with the field (0: only depth)
uniform vec4 uDimple;      // centre (x, z), depth (+: pushed back), radius
uniform vec4 uPress;       // centre, depth, radius
uniform vec4 uRip[4];      // centre, age (s; < 0: none), strength
uniform vec3 uRipK;        // speed (units a second), wavelength (units), decay (s)
uniform vec4 uJig;         // the slow, wide wobble rolling out from a release: centre, age (s; < 0: none), strength
// the music: the lobes swell with the bass; on the beat a wave runs along the ribbon, from the cover to the tail
uniform vec3 uFlex;        // the glass bouncing with the music (units toward the camera): the bulb, the right lobe, the lower band
uniform vec4 uJigB[6];     // strong bass hits: a soft swell rolling out from the cover: centre, age (s; < 0: none), strength
uniform vec3 uSwellK;      // its speed (units a second), width (units), decay (s)
// a single soft swell running out from r.xy (no trough: the glass bulges a little as it passes, then is still); its
// slope goes to grad
float swellRing(vec2 p, vec4 r, vec3 K, inout vec2 grad) {
  vec2 d = p - r.xy; float rr = max(length(d), 1e-4);
  float q = rr - K.x * r.z, w = K.y;
  float amp = r.w * exp(-r.z / K.z) * smoothstep(0., .1, r.z), env = exp(-q * q / (w * w));
  grad += amp * env * (-2. * q / (w * w)) * d / rr;
  return amp * env;
}
uniform vec4 uBeat[6];     // beat waves: start x, age (s; < 0: none), strength, -
uniform vec3 uBeatK;       // their speed, wavelength, decay
uniform vec3 uJigK;        // its speed, wavelength, decay
uniform vec4 uBud[2];      // the beads budding off the right end: where (x, z), how far the end swells out there, how wide
// a ring of waves running out from r.xy (age r.z, strength r.w), its slope added to grad
float ring(vec2 p, vec4 r, vec3 K, inout vec2 grad) {
  vec2 d = p - r.xy; float rr = max(length(d), 1e-4);
  float q = rr - K.x * r.z, w = K.y * 1.3, k = 6.2831853 / K.y;
  float amp = r.w * exp(-r.z / K.z) * smoothstep(0., .08, r.z), env = exp(-q * q / (w * w));
  grad += amp * env * (k * cos(k * q) - 2. * q / (w * w) * sin(k * q)) * d / rr;
  return amp * env * sin(k * q);
}
uniform vec4 uWellC[3];    // the wells: centre, radius, how far the floor has sunk
// Dragging the window: the jelly lags behind where it is held, its far parts most (and swings past, and back, when
// the window stops). xy: the lag (root units, x right, z up), zw: where it is held.
uniform vec4 uSlosh;
vec2 sloshAt(vec2 p) {
  if (uSlosh.xy == vec2(0.)) return vec2(0.);
  vec2 d = p - uSlosh.zw;
  return uSlosh.xy * (1. - exp(-dot(d, d) / 13.));
}
// (the owner: the ripples must change the shape itself, not only ripple inside it: sh is how far the glass's surface
// moves out along its own normal's sideways part, so the outline swells and ripples with the music and the presses;
// the click-through keeps the resting outline, a few px off at most while it moves)
float motionField(vec2 p, out vec2 grad, out float sh) {
  float g = 0.; grad = vec2(0.); sh = 0.;
  if (uDimple.z != 0.) {
    vec2 d = p - uDimple.xy; float R2 = uDimple.w * uDimple.w; float e = exp(-.5 * dot(d, d) / R2) * uDimple.z;
    g += e; grad -= e * d / R2;
  }
  if (uPress.z != 0.) {      // in under the pointer, a soft bulge round it (the glass keeps its volume)
    vec2 d = p - uPress.xy; float R2 = uPress.w * uPress.w; float s = dot(d, d) / R2; float e = exp(-.5 * s) * uPress.z;
    g += e * (1. - s); grad -= e * d / R2 * (3. - s); sh -= e * (1. - s);
  }
  for (int i = 0; i < 4; i++) if (uRip[i].z >= 0.) { float r = ring(p, uRip[i], uRipK, grad); g += r; sh -= 2.2 * r; }
  if (uFlex != vec3(0.)) {   // the glass bouncing with the music: three soft bumps, each on its own spring
    vec2 c1 = vec2(-5.63, .26), c2 = vec2(5.07, .66), c3 = vec2(-.6, -2.05);
    vec2 d1 = p - c1, d2 = p - c2, d3 = (p - c3) * vec2(.5, 1.3);
    float e1 = exp(-.5 * dot(d1, d1) / 2.9) * uFlex.x, e2 = exp(-.5 * dot(d2, d2) / 2.6) * uFlex.y;
    float e3 = exp(-.5 * dot(d3, d3) / 1.2) * uFlex.z;
    g -= e1 + e2 + e3; grad += e1 * d1 / 2.9 + e2 * d2 / 2.6 + e3 * d3 * vec2(.5, 1.3) / 1.2; sh += .8 * (e1 + e2 + e3);
  }
  // (the owner: only strong bass hits, the glass bulging out ever so slightly, never moving all the time)
  for (int i = 0; i < 6; i++) if (uJigB[i].z >= 0.) {
    vec2 gs = vec2(0.); float s = swellRing(p, uJigB[i], uSwellK, gs);
    g -= s; grad -= gs; sh += 3.5 * s;                 // toward the camera, and the outline out
  }
  for (int i = 0; i < 6; i++) {
    vec4 b = uBeat[i];
    if (b.y < 0.) continue;
    float q = p.x - (b.x + uBeatK.x * b.y), w = uBeatK.y * 1.4, k = 6.2831853 / uBeatK.y;
    float amp = b.z * exp(-b.y / uBeatK.z) * smoothstep(0., .06, b.y), env = exp(-q * q / (w * w));
    g += amp * env * sin(k * q); sh -= 2.2 * amp * env * sin(k * q);
    grad.x += amp * env * (k * cos(k * q) - 2. * q / (w * w) * sin(k * q));
  }
  if (uJig.z >= 0.) { float r = ring(p, uJig, uJigK, grad); g += r; sh -= 2.2 * r; }
  for (int i = 0; i < 2; i++) {   // the end swelling where a bead buds off it (and its stub springing back once it parts)
    vec4 b = uBud[i];
    if (b.z == 0.) continue;
    vec2 d = p - b.xy; sh += b.z * exp(-dot(d, d) / (b.w * b.w));
  }
  for (int i = 0; i < 3; i++) {
    vec4 wl = uWellC[i];
    if (wl.w == 0.) continue;
    vec2 d = p - wl.xy; float l = max(length(d), 1e-4), x = l / wl.z;
    float t = clamp((x - .7) / .35, 0., 1.);
    g += wl.w * (1. - t * t * (3. - 2. * t));
    grad -= wl.w * 6. * t * (1. - t) / .35 / wl.z * d / l;
  }
  return g;
}
float motionFront(vec3 n) { return smoothstep(.15, -.35, n.y); }     // the front of the glass (faces toward the camera)
// The drop forming when the widget appears (and melting away on close, backwards): two beads swell where the lobes will
// be, each the lobe itself scaled about its own middle, its side toward the other drawn to a short point; a neck
// reaches out from each point and they meet, and the neck thickens into the waist. The waist's points not yet reached
// sit at the front of the reach, pinched onto the waist's spine (the line through its middle, from the model).
uniform vec4 uForm;        // the bulb's scale, the right lobe's, how far the necks have reached (0..1), the waist's thickness (0..1)
uniform vec2 uMelt;        // melting: how much (0..1: the lobes slump as they shrink), -
uniform int uFormOn;
const float WA = -2.2, WB = 2.4;                       // the waist, along x (root units)
const vec3 CL = vec3(-4.9, .55, .3), CR = vec3(4.6, .04, .4);   // the lobes' middles
vec2 spineAt(float x) {                                // the waist's middle (y, z) at x, from the model (x -2.5 .. 2.5)
  float f = clamp((x + 2.5) / .5, 0., 9.999); int i = int(floor(f)); float t = fract(f);
  vec2 S[11] = vec2[11](vec2(.38, -.37), vec2(.33, -.50), vec2(.27, -.58), vec2(.22, -.59), vec2(.17, -.57), vec2(.11, -.52),
    vec2(.06, -.43), vec2(.02, -.29), vec2(0., -.11), vec2(0., .08), vec2(.02, .23));
  return mix(S[i], S[i + 1], t);
}
vec3 lobeT(vec3 p, vec3 c, float s, float melt) {
  vec3 q = (p - c) * s;
  float m = melt * (1. - s);                           // (melting: flatter and wider as it shrinks, sinking a little)
  q *= vec3(1. + .15 * m, 1. + .1 * m, 1. - .35 * m);
  return c + q + vec3(0., 0., -.5 * m);
}
vec3 formAt(vec3 p) {
  float w = clamp((p.x - WA) / (WB - WA), 0., 1.);
  const float NOSE = .2;
  float fr = mix(NOSE, .5, uForm.z);                   // how far each neck has reached, from its own side
  float th = 1.;
  if (w > 0. && w < 1.) {
    float side = w < .5 ? w : 1. - w;
    float we = min(side, fr);                          // (not yet reached: at the front)
    // the neck's thickness: full at the lobe, drawn to a point at the front (and at the middle until it has thickened)
    float taper = side >= fr ? 0. : pow(1. - side / fr, .55);
    th = mix(taper, 1., uForm.w);
    float x = WA + (w < .5 ? we : 1. - we) * (WB - WA);
    vec2 s0 = spineAt(p.x), s1 = spineAt(x);
    p = vec3(x, s1.x + (p.y - s0.x) * th, s1.y + (p.z - s0.y) * th);
    w = (x - WA) / (WB - WA);
  }
  vec3 pl = lobeT(p, CL, uForm.x, uMelt.x), pr = lobeT(p, CR, uForm.y, uMelt.x);
  return mix(pl, pr, smoothstep(.3, .7, w));
}
`;
const VS_MESH = HEAD + MOTION + `
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec3 aNor;
layout(location = 2) in vec2 aUv;
uniform mat4 uP;
out vec3 vPos;
out vec3 vNor;
out vec2 vUv;
void main() {
  vec3 p = aPos;
  if (uMotionOn == 1) {
    vec2 gr; float sh;
    p.y += motionField(aPos.xz, gr, sh) * motionFront(aNor);
    p.xz += aNor.xz * sh * uShapeK;            // the outline moves too: the jelly's shape itself
    p.xz += sloshAt(aPos.xz);                  // and lags behind a drag of the window
  }
  if (uFormOn == 1) p = formAt(p);
  vPos = p; vNor = aNor; vUv = aUv; gl_Position = uP * vec4(p, 1.);
}`;
// The two small beads beside the right end (open the full app; hide the widget): each a sphere of the same glass, drawn
// through the same passes as the model. While it buds off the end the side of it that faces the end is drawn out into a
// neck reaching back into the end (where the end swells to meet it: uBud), thinner as the bead moves away, until it
// pinches off and the bead pulls round, wobbling (squashed and stretched along that axis, its volume kept).
const VS_BEAD = HEAD + MOTION + `
layout(location = 0) in vec3 aPos;     // a unit sphere
uniform mat4 uP;
uniform vec4 uBeadC[2];   // centre (root units), radius
uniform vec4 uBeadA[2];   // where the neck reaches into the end (root units), how joined: 1 joined, 0 parted
uniform vec4 uBeadW[2];   // stretch along the neck's axis (1 round), the neck's waist and its foot (fractions of the radius)
uniform vec2 uBeadUv;     // where on the light map (the end's)
out vec3 vPos;
out vec3 vNor;
out vec2 vUv;
vec3 beadAt(vec3 d, vec4 C, vec4 A, vec4 W) {
  vec3 ax = A.xyz - C.xyz; float L = length(ax); vec3 a = ax / max(L, 1e-5);
  float r = C.w, sq = W.x, h = dot(d, a);
  vec3 dp = d - a * h; float lp = length(dp); vec3 across = lp > 1e-5 ? dp / lp : vec3(0.);
  float along = r * h * sq, rad = r * lp / sqrt(sq);
  // the cap facing the end becomes the neck: stations from the bead's side (t 0) to the foot in the end (t 1)
  const float H0 = .25;
  if (A.w > 0. && h > H0) {
    float t = (h - H0) / (1. - H0);
    float a0 = r * H0 * sq;
    float reach = mix(r * sq, L, A.w);                       // (parted: back to the sphere's own cap)
    float neck = r * (mix(sqrt(1. - H0 * H0) / sqrt(sq), W.y, smoothstep(0., .5, t)) + (W.z - W.y) * smoothstep(.5, 1., t));
    along = mix(along, mix(a0, reach, t), A.w);
    rad = mix(rad, neck * sqrt(max(1. - pow(max(t * 1.02 - .02, 0.), 8.), 0.)), A.w);   // (closed at the very foot)
  }
  return C.xyz + a * along + across * rad;
}
void main() {
  int i = gl_InstanceID;
  vec4 C = uBeadC[i], A = uBeadA[i], W = uBeadW[i];
  vec3 d = normalize(aPos);
  vec3 p = beadAt(d, C, A, W);
  // its normal from two nearby points (the neck is not a sphere)
  vec3 e1 = normalize(cross(d, abs(d.y) < .9 ? vec3(0., 1., 0.) : vec3(1., 0., 0.))), e2 = cross(d, e1);
  vec3 n = cross(beadAt(normalize(d + e1 * .01), C, A, W) - p, beadAt(normalize(d + e2 * .01), C, A, W) - p);
  n = dot(n, n) > 1e-14 ? normalize(n) : d;          // (outward: the map keeps the sphere's orientation)
  if (uMotionOn == 1) p.xz += sloshAt(p.xz);
  vPos = p; vNor = n; vUv = uBeadUv; gl_Position = uP * vec4(p, 1.);
}`;
const FS_LAYER = HEAD + `
in vec3 vPos;
in vec3 vNor;
uniform highp sampler2D uPrev;   // the layer in front (empty: w 1e4); only surfaces behind it are kept
uniform int uFirst;
out vec4 o;
void main() {
  if (uFirst == 0) {
    vec4 p = texelFetch(uPrev, ivec2(gl_FragCoord.xy), 0);
    if (p.w > 100. || vPos.y <= p.w + .004) discard;
  }
  o = vec4(normalize(vNor), vPos.y);
}`;
const FS_MASK = HEAD + `
out vec4 o;
void main() { o = vec4(1.); }`;
// value noise and a little fbm (the ink's currents, the cover's dissolve)
const NOISE_GLSL = `
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p), u = f * f * (3. - 2. * f);
  return mix(mix(hash12(i), hash12(i + vec2(1., 0.)), u.x), mix(hash12(i + vec2(0., 1.)), hash12(i + vec2(1., 1.)), u.x), u.y);
}
float fbm2(vec2 p) { float a = .5, s = 0.; for (int i = 0; i < 4; i++) { s += a * vnoise(p); p = p * 2.03 + 17.1; a *= .5; } return s; }
`;
// Pigment from a cover's colour (the 2D widget's rule): its hue at full strength, nothing from its darkness; a cover
// with no colour to give (white, grey) gives the album's colour instead (white pigment is fog).
const PIGMENT_GLSL = `
uniform vec3 uPal;
vec3 pigment(vec3 art) {
  art = pow(art, vec3(2.2));
  float hi = max(art.r, max(art.g, art.b)), lo = min(art.r, min(art.g, art.b));
  float coloured = smoothstep(.12, .4, (hi - lo) / max(hi, 1e-3));
  vec3 own = uPal / max(max(uPal.r, max(uPal.g, uPal.b)), .08);
  vec3 c = mix(own, art / max(hi, .08), coloured) * smoothstep(.015, .3, hi);
  float l = dot(c, vec3(.2126, .7152, .0722));
  return max(mix(vec3(l), c, 1.45), 0.);           // (richer: a little more chroma than the art's own)
}
`;
/**
 * Where the cover leaks (the owner, 19 November: the old widget's ink was "like ink suspended in oil": it leaked out of
 * the cover and stayed suspended, dispersing in the direction it had left the cover in; no drops jetting out at an
 * interval). The rim: how far a point lies outside the cover's rounded box (reference px), the way out there, and how
 * much the rim leaks there now: a few places at a time round its lower part and its sides (never its top, nor the right
 * side's upper half, by the words), each leaking for some tens of seconds, then another. Needs uCov, uTime, fbm2.
 */
const LEAK_GLSL = `
float coverRim(vec2 p, out vec2 n) {
  vec2 c = (uCov.xy + uCov.zw) * .5, h = (uCov.zw - uCov.xy) * .5;
  vec2 q = abs(p - c) - (h - 26.);
  vec2 s = sign(p - c + 1e-4);
  n = q.x > 0. && q.y > 0. ? normalize(q) * s : q.x > q.y ? vec2(s.x, 0.) : vec2(0., s.y);
  return length(max(q, 0.)) + min(max(q.x, q.y), 0.) - 26.;
}
float leakAt(vec2 p) {
  // (where round the rim: the angle about the cover's middle, y down: 0 right, pi/2 down, pi left; each leak some
  // 10 to 20 px wide, drifting slowly along the rim as it comes and goes)
  vec2 c = (uCov.xy + uCov.zw) * .5, h = (uCov.zw - uCov.xy) * .5;
  float a = atan((p.y - c.y) / h.y, (p.x - c.x) / h.x);
  float where = smoothstep(.2, .45, a) + smoothstep(-2.5, -2.75, a) * step(a, 0.);
  float gate = fbm2(vec2(a * 9. + uTime * .02, uTime * .05 + 5.3));
  return clamp(where, 0., 1.) * smoothstep(.56, .76, gate);
}
`;
/**
 * The ink: pigment carried through the glass by slow currents, on a grid at half the canvas's pixels, kept inside the
 * silhouette. mode 2: the currents (the curl of a stream function: swirls, and a current running round the inside of
 * the outline, so along the lower band toward the tail); mode 0: carry something along them (forward or back);
 * mode 1: the corrected (MacCormack) step, then fading, the cover leaking (LEAK_GLSL: a few places round its rim at a
 * time, the pigment drifting out the way it left and hanging there, as ink in oil), a track change's old cover letting
 * go, and colour flooding back round the cover on play.
 */
const FS_INK = HEAD + NOISE_GLSL + PIGMENT_GLSL + `
in vec2 vUv;
uniform sampler2D uSrc;
uniform sampler2D uDye;
uniform sampler2D uFwd;
uniform sampler2D uBwd;
uniform sampler2D uVel;
uniform sampler2D uEdge;
uniform sampler2D uArt;
uniform sampler2D uArtOld;
uniform int uMode;
uniform float uDt;
uniform float uTime;
uniform vec4 uMap;           // canvas uv -> reference px: left, top, width, height
uniform vec2 uVelK;          // (the solver's velocity is in reference px a second, y down)
uniform vec4 uCov;           // the cover's box in reference px: u0, v0, u1, v1
uniform vec4 uK;             // fade (s), seep, burst (the old cover letting go), flood (colour back round the cover)
uniform vec3 uLeakK;         // the leak: how much, how fast pigment drifts out from the rim (ref px a second), how far
out vec4 o;
vec2 refAt(vec2 uv) { return vec2(uMap.x + uv.x * uMap.z, uMap.y + (1. - uv.y) * uMap.w); }
float inside(vec2 uv) { return texture(uEdge, uv).r; }
` + LEAK_GLSL + `
float psi(vec2 p, vec2 uv) {
  float e = inside(uv);
  float n = fbm2(p * .0055 + vec2(uTime * .025, -uTime * .017)) - .5;
  float n2 = fbm2(p * .014 - vec2(uTime * .035, uTime * .02)) - .5;
  // (px a second: swirls of some tens, and a current of about a hundred running round the inside of the outline,
  // left to right along the lower band, so pigment weeping from the cover is drawn out toward the tail)
  return 4200. * smoothstep(.55, .92, e) * (1.1 * n + .45 * n2) + 2600. * smoothstep(.5, .9, e);
}
// (what leaks out drifts on out the way it left the cover, slowing as it goes, then hangs there, suspended: the drift
// spreads it as it slows, so it thins and disperses outward; the liquid's own slow currents and the pointer's stirring
// carry it on from there)
vec2 drift(vec2 p, vec2 uv) {
  vec2 n; float d = coverRim(p, n);
  return n * uLeakK.y * leakAt(p) * exp(-max(d, 0.) / uLeakK.z) * smoothstep(-4., 4., d) * smoothstep(.55, .75, inside(uv));
}
void main() {
  vec2 p0 = refAt(vUv);
  vec2 vel = (texture(uVel, vUv).xy + drift(p0, vUv)) * vec2(1. / uMap.z, -1. / uMap.w);     // uv a second
  if (uMode == 0) { o = vec4(texture(uSrc, vUv - uDt * vel).rgb, 1.); return; }
  vec2 back = vUv - uDt * vel;
  vec3 dye = texture(uFwd, vUv).rgb + .5 * (texture(uDye, vUv).rgb - texture(uBwd, vUv).rgb);
  vec2 tx = 1. / vec2(textureSize(uDye, 0));
  vec2 b0 = (floor(back / tx - .5) + .5) * tx;
  vec3 c00 = texture(uDye, b0).rgb, c10 = texture(uDye, b0 + vec2(tx.x, 0.)).rgb;
  vec3 c01 = texture(uDye, b0 + vec2(0., tx.y)).rgb, c11 = texture(uDye, b0 + tx).rgb;
  dye = clamp(dye, min(min(c00, c10), min(c01, c11)), max(max(c00, c10), max(c01, c11)));
  dye *= exp(-uDt / uK.x);
  vec2 p = refAt(vUv);
  vec2 cuv = clamp((p - uCov.xy) / (uCov.zw - uCov.xy), .03, .97); cuv.y = 1. - cuv.y;
  vec3 art = pigment(textureLod(uArt, cuv, 2.).rgb);
  // (the owner, 19 November: no drops jetting out at an interval; the pigment slowly, constantly seeping out of the
  // cover while the music plays, as the old player did, more of it, and suspended, as ink in oil.) All the time it
  // plays the cover leaks at a few places round its rim (leakAt): a thin skin of its own colour just outside the
  // rim there (the colour of the art at that edge), which the drift and the liquid carry outward
  vec2 rn; float rd = coverRim(p, rn);
  float skin = exp(-pow((rd - 5.) / 4.5, 2.));
  float lk = leakAt(p);
  vec3 artEdge = pigment(textureLod(uArt, clamp(cuv - vec2(rn.x, -rn.y) * .02, .02, .98), 3.).rgb);
  dye += artEdge * skin * (.01 + 2.2 * lk) * uLeakK.x * uK.y * uDt;
  // a track change: the old cover turns to pigment where it lay, and is pushed out (mode 2)
  float inCov = step(uCov.x, p.x) * step(p.x, uCov.z) * step(uCov.y, p.y) * step(p.y, uCov.w);
  dye = mix(dye, pigment(textureLod(uArtOld, cuv, 1.5).rgb), uK.z * inCov * .08);
  // play: colour floods back out of the cover, round its edges
  float rimD = abs(max(max(uCov.x - p.x, p.x - uCov.z), max(uCov.y - p.y, p.y - uCov.w)) - 6.);
  dye += art * smoothstep(30., 0., rimD) * uK.w * 3. * uDt;
  dye *= smoothstep(.45, .6, inside(vUv));
  o = vec4(clamp(dye, 0., 4.), 1.);
}`;
/**
 * The liquid the ink lives in (the owner, 17 November: "like ink dropped into oil, shot out from the side into a
 * mushroom cloud"; the 2D widget's solver, ported): a real velocity field on a grid a third of the canvas's size,
 * in reference px a second (y down), kept inside the silhouette: carried along itself and eased toward a slow
 * circulation, pushed by jets, spins and splashes, its small curls kept alive (vorticity confinement), then made
 * incompressible (pressure). A jet into still liquid rolls up into a mushroom: that is the curl of ink.
 */
const FL_HEAD = HEAD + NOISE_GLSL + `
in vec2 vUv;
out vec4 o;
uniform vec2 uTexel;       // one cell of the grid, in uv
uniform vec4 uMap;         // canvas uv -> reference px: left, top, width, height
uniform sampler2D uEdge;   // the silhouette, blurred
vec2 refAt(vec2 uv) { return vec2(uMap.x + uv.x * uMap.z, uMap.y + (1. - uv.y) * uMap.w); }
vec2 perPx() { return vec2(1. / uMap.z, -1. / uMap.w); }      // reference px (y down) -> uv
float inside(vec2 uv) { return texture(uEdge, uv).r; }
// neighbours in the reference frame: east, west, south (down the screen), north
#define EAST(t) texture(t, vUv + vec2(uTexel.x, 0.))
#define WEST(t) texture(t, vUv - vec2(uTexel.x, 0.))
#define SOUTH(t) texture(t, vUv - vec2(0., uTexel.y))
#define NORTH(t) texture(t, vUv + vec2(0., uTexel.y))
`;
const FS_FL_FORCE = FL_HEAD + `
uniform sampler2D uVel;
uniform float uDt;
uniform float uTime;
uniform float uFlow;       // the slow circulation's strength (more with the music)
uniform vec4 uCov;         // the cover's box in reference px: u0, v0, u1, v1
uniform vec2 uLeakV;       // where the cover leaks, the liquid is let out slowly that way: speed (ref px a second), its reach
` + LEAK_GLSL + `
float psi(vec2 p, vec2 uv) {
  float e = inside(uv);
  float n = fbm2(p * .0045 + vec2(uTime * .021, -uTime * .013)) - .5;
  float n2 = fbm2(p * .0095 - vec2(uTime * .03, uTime * .017)) - .5;
  // swirls inside, and a current round the inside of the outline (left to right along the lower band)
  return smoothstep(.55, .92, e) * (1.1 * n + .4 * n2) + .55 * smoothstep(.5, .9, e);
}
void main() {
  vec2 v = texture(uVel, vUv).xy;
  v = texture(uVel, vUv - uDt * v * perPx()).xy;
  vec2 p = refAt(vUv); float h = 4.;
  vec2 du = vec2(h / uMap.z, 0.), dv = vec2(0., h / uMap.w);
  vec2 cur = vec2(psi(p + vec2(0., h), vUv - dv) - psi(p - vec2(0., h), vUv + dv),
                  -(psi(p + vec2(h, 0.), vUv + du) - psi(p - vec2(h, 0.), vUv - du))) / (2. * h) * uFlow;
  // where the cover leaks, the liquid there is let out slowly, the way it leaves the rim: a slow jet a few tens of px
  // long. Into still liquid a jet rolls up at its head (the curl of ink let into oil) and stops: what it carries is
  // left suspended there
  vec2 rn; float rd = coverRim(p, rn);
  float jet = leakAt(p) * smoothstep(-6., 4., rd) * exp(-max(rd, 0.) / uLeakV.y);
  v += (rn * uLeakV.x - v) * (1. - exp(-uDt * 3. * jet));
  v += (cur - v) * (1. - exp(-uDt * .45));
  // (the oil: thicker than water, it lets go of its motion sooner)
  v *= exp(-uDt * .3);
  v *= smoothstep(.45, .62, inside(vUv));
  o = vec4(clamp(v, -2500., 2500.), 0., 1.);
}`;
const FS_FL_IMPULSE = FL_HEAD + `
uniform sampler2D uVel;
uniform vec2 uPoint;       // reference px
uniform vec2 uPush;        // reference px a second
uniform float uSpin;
uniform float uBurst;
uniform float uRadius;
void main() {
  vec2 q = refAt(vUv) - uPoint;
  float g = exp(-dot(q, q) / (uRadius * uRadius));
  vec2 v = texture(uVel, vUv).xy + uPush * g + uSpin * vec2(-q.y, q.x) / uRadius * g + uBurst * q / uRadius * g;
  o = vec4(v * smoothstep(.45, .62, inside(vUv)), 0., 1.);
}`;
const FS_FL_CURL = FL_HEAD + `
uniform sampler2D uVel;
void main() { o = vec4(.5 * (EAST(uVel).y - WEST(uVel).y) - .5 * (SOUTH(uVel).x - NORTH(uVel).x), 0., 0., 1.); }`;
const FS_FL_VORT = FL_HEAD + `
uniform sampler2D uVel;
uniform sampler2D uCurl;
uniform float uDt;
uniform float uStrength;
void main() {
  float w = texture(uCurl, vUv).x;
  vec2 n = .5 * vec2(abs(EAST(uCurl).x) - abs(WEST(uCurl).x), abs(SOUTH(uCurl).x) - abs(NORTH(uCurl).x));
  n /= length(n) + 1e-4;
  vec2 v = texture(uVel, vUv).xy + uStrength * w * vec2(n.y, -n.x) * uDt;
  o = vec4(clamp(v, -2500., 2500.), 0., 1.);
}`;
const FS_FL_DIV = FL_HEAD + `
uniform sampler2D uVel;
void main() { o = vec4(.5 * (EAST(uVel).x - WEST(uVel).x + SOUTH(uVel).y - NORTH(uVel).y), 0., 0., 1.); }`;
const FS_FL_PRESSURE = FL_HEAD + `
uniform sampler2D uPressure;
uniform sampler2D uDiv;
void main() {
  o = vec4((EAST(uPressure).x + WEST(uPressure).x + SOUTH(uPressure).x + NORTH(uPressure).x - texture(uDiv, vUv).x) * .25, 0., 0., 1.);
}`;
const FS_FL_PROJECT = FL_HEAD + `
uniform sampler2D uPressure;
uniform sampler2D uVel;
void main() {
  vec2 v = texture(uVel, vUv).xy - .5 * vec2(EAST(uPressure).x - WEST(uPressure).x, SOUTH(uPressure).x - NORTH(uPressure).x);
  o = vec4(v * smoothstep(.45, .62, inside(vUv)), 0., 1.);
}`;
/** A drop of pigment: the cover's own colour where it left from (or the old cover's), or a given colour. */
const FS_FL_DROP = FL_HEAD + PIGMENT_GLSL + `
uniform sampler2D uDye;
uniform sampler2D uArt;
uniform sampler2D uArtOld;
uniform vec2 uPoint;
uniform float uRadius;
uniform float uAmount;
uniform vec3 uColor;
uniform vec4 uCoverUv;     // where on the cover, 1 to use it, 1 for the old cover
void main() {
  vec2 q = refAt(vUv) - uPoint;
  float g = exp(-dot(q, q) / (uRadius * uRadius));
  vec3 art = uCoverUv.w > .5 ? textureLod(uArtOld, uCoverUv.xy, 2.5).rgb : textureLod(uArt, uCoverUv.xy, 2.5).rgb;
  vec3 c = mix(uColor, pigment(art), uCoverUv.z);
  vec3 dye = texture(uDye, vUv).rgb;
  o = vec4(dye + c * g * uAmount * (1. - .45 * clamp(max(dye.r, max(dye.g, dye.b)), 0., 1.)), 1.);
}`;
const VS_COVER = HEAD + MOTION + `
layout(location = 0) in vec3 aPos;
layout(location = 2) in vec2 aUv;
uniform mat4 uP;
out vec3 vPos;
out vec2 vUv;
void main() {
  vec3 p = aPos;
  if (uMotionOn == 1) p.xz += sloshAt(aPos.xz);    // (the cover goes with the glass round it)
  if (uFormOn == 1) p = lobeT(p, CL, uForm.x, uMelt.x);
  vPos = p; vUv = aUv; gl_Position = uP * vec4(p, 1.);
}`;
const FS_COVER = HEAD + COMMON + NOISE_GLSL + `
in vec3 vPos;
in vec2 vUv;
uniform sampler2D uArt;
uniform sampler2D uArtOld;
uniform vec2 uDissolve;      // how far the new cover has come in (0..1); 1: through noise (it dissolves), 0: a plain crossfade
uniform float uCoat;
out vec4 o;
void main() {
  vec3 art = pow(texture(uArt, vUv).rgb, vec3(2.2));
  if (uDissolve.x < 1.) {
    // a track change: the old cover dissolves into liquid as the new one resolves, a bright seam where it turns
    vec3 old = pow(texture(uArtOld, vUv).rgb, vec3(2.2));
    float n = fbm2(vUv * 6.) * .75 + vnoise(vUv * 31.) * .25;
    float m = uDissolve.y > .5 ? smoothstep(n - .05, n + .05, uDissolve.x * 1.3 - .15) : uDissolve.x;
    art = mix(old, art, m) + (old + art) * .7 * (1. - abs(2. * m - 1.)) * uDissolve.y;
  }
  vec3 N = normalize(cross(dFdx(vPos), dFdy(vPos)));
  if (N.y > 0.) N = -N;
  vec3 V = vec3(0., -1., 0.);
  float F = .04 + .96 * pow(1. - max(dot(N, V), 0.), 5.);
  // a faint, broad sheen (the studio blurred by some degrees): never a band of a strip laid across the art
  vec3 sheen = textureLod(uEnv, equi(reflect(-V, N)), 5.5).rgb * uGain.x;
  o = vec4(art + sheen * F * uCoat, 1.);
}`;
const FS_GLASS = HEAD + COMMON + MOTION + `
in vec3 vPos;
in vec3 vNor;
in vec2 vUv;
uniform highp sampler2D uBack;     // nearest back faces
uniform highp sampler2D uF2;       // the front faces behind them (the glass below)
uniform highp sampler2D uB2;       // and its back faces
uniform sampler2D uArt;
uniform sampler2D uLightMap;       // Cycles' light on the glass (an image on the model's UVs)
uniform sampler2D uDesk;           // what is on the screen behind the window (refraction)
uniform sampler2D uEdge;           // the silhouette, blurred: about .5 at the outline, 1 well inside (canvas pixels)
uniform vec4 uDeskMap;             // canvas fraction (y up) -> the capture's coordinates: offset, scale
uniform vec4 uDesk2;               // on (0..1), how much of it comes through, how far behind the glass, how much studio stays
uniform mat4 uP;
uniform vec2 uRes;
uniform mat4 uCovInv;              // root frame -> the cover's own (face y ~ 0, x across, z up)
uniform vec3 uCov;                 // its half size, corner radius, side (Blender units)
uniform vec3 uAbsorb;              // what each unit of glass takes away, per channel
uniform float uLightRef;           // the level of the light map's brighter tenth
uniform vec4 uL1;                  // the light pass: soft, band, lobe, middle
uniform vec4 uL2;                  // spill, well, warmth, through
uniform vec4 uL3;                  // mirror, hot level, hot strength, glass below (0 off)
uniform vec2 uL4;                  // marble (the cover's colours in the ring), its reach (Blender units)
uniform vec4 uL5;                  // the studio's light kept in the rolls over a desktop, broad sheen, edge core, ring mirror
uniform vec3 uTint;                // the album's colour
uniform vec3 uArtMean;             // the cover's mean colour (linear)
uniform vec4 uWells[3];            // the wells: centre (Blender X, Z), radius, -
uniform vec4 uTilt;                // the glass turned (x, z), and the upper sheet's extra lean (x, z): now only the slosh
uniform vec4 uCursor;              // the cursor's reflection: the pointer (CSS px of the page, y down), how strongly, its size
uniform vec4 uCursorM;             // the nearest point of the outline to the pointer (CSS px), the way out of the glass there
uniform vec2 uPage;                // the page's size in CSS px
uniform vec4 uMusic;               // the music: bass, highs, time (s), on (0..1: fades out on pause)
uniform float uBands[16];          // its spectrum, low to high
uniform vec2 uFold[8];             // the fold under the sheet's lip (root x, z), left to right
uniform vec4 uSpec;                // the spectrum in the fold: strength, strands' swing (units), their width, -
uniform sampler2D uInk;            // the ink: pigment carried through the glass (canvas uv)
uniform vec2 uInkK;                // the ink: how strongly it dyes the glass, how much it glows
uniform vec4 uWords[4];            // behind the words and times: boxes in canvas fractions (x0, y0, x1, y1; y up)
uniform vec2 uWordsDim;            // how much of the desktop still comes through there, the feather (fractions of width)
uniform int uDbg;
uniform float uBeadMode;           // 1: drawing the beads beside the right end
out vec4 o;

// the pointer's arrow (Windows' own, in CSS px from its tip, y down): its distance, negative inside
float arrowSd(vec2 p) {
  vec2 v[7] = vec2[7](vec2(0., 0.), vec2(0., 16.), vec2(4., 12.5), vec2(7., 19.), vec2(9.5, 18.), vec2(6.6, 11.6), vec2(11.5, 11.6));
  float d = dot(p - v[0], p - v[0]), sg = 1.;
  for (int i = 0; i < 7; i++) {
    int j = (i + 6) % 7;
    vec2 e = v[j] - v[i], w = p - v[i];
    vec2 b = w - e * clamp(dot(w, e) / dot(e, e), 0., 1.);
    d = min(d, dot(b, b));
    bvec3 c = bvec3(p.y >= v[i].y, p.y < v[j].y, e.x * w.y > e.y * w.x);
    if (all(c) || all(not(c))) sg = -sg;
  }
  return sg * sqrt(d);
}
float rrect(vec2 q, float b, float r) { vec2 d = abs(q) - b + r; return length(max(d, 0.)) + min(max(d.x, d.y), 0.) - r; }
vec4 layerAt(highp sampler2D t, vec2 frag) { return texelFetch(t, ivec2(clamp(frag, vec2(0.), uRes - 1.)), 0); }
vec2 toFrag(vec3 p) { vec4 c = uP * vec4(p, 1.); return (c.xy / c.w * .5 + .5) * uRes; }
float fres(float c) { return .04 + .96 * pow(1. - clamp(c, 0., 1.), 5.); }
float maxc(vec3 c) { return max(c.r, max(c.g, c.b)); }
vec3 bands(vec3 d) {
  float el = degrees(asin(clamp(normalize(uToWorld * d).z, -1., 1.)));
  if (el < -2.) return vec3(.02, .05, .25); if (el < 21.5) return vec3(0.); if (el < 24.5) return vec3(.9, .08, .05);
  if (el < 27.) return vec3(0.); if (el < 37.) return vec3(.1, .55, .1); if (el < 39.5) return vec3(0.);
  if (el < 42.5) return vec3(.9, .85, .1); if (el < 45.) return vec3(0.); if (el < 55.) return vec3(.1, .55, .1);
  if (el < 58.) return vec3(0.); return vec3(.9);
}

void main() {
  vec3 N = normalize(vNor);
  vec3 V = vec3(0., -1., 0.);
  if (dot(N, V) < 0.) N = -N;
  if (uMotionOn == 1) {
    // the field's slope tilts the front's normals (a dent's walls face into it); and the whole glass turns a little
    // toward the cursor, the upper sheet more, the glass round the controls hardly at all
    vec2 gr; float shF; motionField(vPos.xz, gr, shF);
    float upper = smoothstep(.3, 1.4, vPos.z) * mix(.6, 1., smoothstep(1., 3., vPos.x));
    float steady = 1.;
    for (int i = 0; i < 3; i++) steady = min(steady, mix(.25, 1., smoothstep(.9, 1.4, length(vPos.xz - uWellC[i].xy) / uWellC[i].z)));
    // and behind the words: their calm glass mirrors the dark band a few degrees below the hot strip; turned more than
    // that, the strip lit up behind the title (the words must stay readable however the glass moves)
    vec2 fcM = gl_FragCoord.xy / uRes;
    float wmM = 0.;
    for (int i = 0; i < 4; i++) {
      vec4 b = uWords[i];
      vec2 d = max(b.xy - fcM, fcM - b.zw) / vec2(uWordsDim.y, uWordsDim.y * uRes.x / uRes.y);
      wmM = max(wmM, 1. - smoothstep(0., 1.5, max(d.x, d.y)));
    }
    steady = min(steady, 1. - .85 * wmM);
    float fieldW = (1. - .6 * wmM) * mix(.45, 1., steady);     // (the field's light softer behind the words and round the buttons' glyphs)
    N = normalize(N + (vec3(gr.x, 0., gr.y) * fieldW + vec3(uTilt.x + upper * uTilt.z, 0., uTilt.y + upper * uTilt.w) * steady) * motionFront(normalize(vNor)));
  }
  float ndv = max(dot(N, V), 0.);
  float F = fres(ndv);
  float aR = 2. * max(length(dFdx(N)), length(dFdy(N)));      // how fast the mirrored direction turns per pixel
  vec3 R = reflect(-V, N);
  float rim = smoothstep(.55, .08, ndv);                       // 1 at the outline
  float flank = smoothstep(.97, .45, ndv);                     // 1 over the rolls' flanks
  vec3 warm = mix(vec3(1., .80, .72), uTint, .35);             // peach, with a little of the album
  float low = smoothstep(.25, -.75, N.z);                      // faces turned down: where the floor's glow comes in

  // ---- what the front mirrors: the studio, a little softened, warmed; its hottest strip kept sharp
  float lod0 = lodFor(aR, uEnvSize.x);
  vec3 refl = textureLod(uEnv, equi(R), lod0 + uL1.x * (1. + 2. * flank)).rgb * uGain.x * uL3.x;
  if (uL3.y > 0.) refl += max(textureLod(uEnv, equi(R), lod0).rgb * uGain.x - uL3.y, 0.) * uL3.z;
  // a broad, soft sheen: the studio blurred by tens of degrees, so each roll shades from its lit side to its dark one
  // (kept low: a strong one is satin)
  refl += textureLod(uEnv, equi(R), lod0 + 6.).rgb * uGain.x * uL5.y;
  refl *= mix(vec3(1.), warm / maxc(warm), uL2.z);

  // ---- into the glass, across it, out of its back (or back inside past the critical angle)
  vec3 T1 = refract(-V, N, 1. / 1.5);
  vec4 b0 = layerAt(uBack, gl_FragCoord.xy);
  float thick = clamp(b0.w - vPos.y, 0., 3.);
  float tx = thick / max(T1.y, .25);
  vec4 b1 = layerAt(uBack, toFrag(vPos + T1 * tx));
  if (b1.w < 100.) tx = clamp((b1.w - vPos.y) / max(T1.y, .25), 0., 4.);
  vec3 Nb = normalize(b1.w < 100. ? b1.xyz : b0.xyz);
  float aT = aR * .6 + .01;
  float path = tx;
  vec3 trans;
  vec3 deskT = vec3(0.);                                       // the desktop seen through the glass
  bool hitArt = false;
  // the art, where the ray inside meets the cover's face before it leaves (the ring of glass round the cover)
  vec3 q0 = (uCovInv * vec4(vPos, 1.)).xyz, dq = mat3(uCovInv) * T1;
  float ta = abs(dq.y) > 1e-4 ? -q0.y / dq.y : -1.;
  if (ta > 0. && ta < tx) {
    vec3 q = q0 + dq * ta;
    if (rrect(q.xz, uCov.x, uCov.y) < 0.) { trans = pow(textureLod(uArt, (q.xz + uCov.x) / uCov.z, 1.5).rgb, vec3(2.2)); path = ta; hitArt = true; }
  }
  if (!hitArt) {
    vec3 T2 = refract(T1, -Nb, 1.5);
    if (dot(T2, T2) < 1e-4) {
      trans = envSoft(reflect(T1, -Nb), aT);                    // kept inside: the studio's glow, softened
    } else {
      vec3 P = vPos + T1 * tx, D = T2;
      vec3 below = vec3(0.);
      float pass = 1.;
      // the glass below: where the sheet lies over the body, the ray enters it and crosses it too
      vec4 f2 = layerAt(uF2, toFrag(P));
      if (uL3.w > 0. && f2.w < 100. && f2.w > P.y + .005) {
        vec3 P2 = P + T2 * ((f2.w - P.y) / max(T2.y, .2));
        vec3 N2 = normalize(f2.xyz); if (dot(N2, T2) > 0.) N2 = -N2;
        float F2 = fres(abs(dot(N2, T2)));
        below = envSharp(reflect(T2, N2), aT) * F2 * uL3.x;       // the lower glass's own mirror, seen through the upper
        pass = 1. - F2;
        vec3 T3 = refract(T2, N2, 1. / 1.5);
        vec4 bb = layerAt(uB2, toFrag(P2));
        float tx2 = bb.w < 100. ? clamp((bb.w - P2.y) / max(T3.y, .25), 0., 4.) : .3;
        vec3 Nb2 = normalize(bb.w < 100. ? bb.xyz : vec3(0., 1., 0.));
        vec3 T4 = refract(T3, -Nb2, 1.5);
        D = dot(T4, T4) < 1e-4 ? reflect(T3, -Nb2) : T4;
        P = P2 + T3 * tx2;
        path += tx2 * uL3.w;
      }
      // what lies behind: the desktop, bent (refraction), and the studio as seen through glass (less of it as the
      // desktop comes in). The desktop is kept apart: the light pass darkens the studio's light, never the desktop.
      vec3 behind = envSoft(D, aT);
      if (uDesk2.x > 0.) {
        vec3 Pd = P + D * (uDesk2.z / max(D.y, .2));
        vec2 duv = uDeskMap.xy + toFrag(Pd) / uRes * uDeskMap.zw;
        vec3 desk = pow(textureLod(uDesk, duv, 0.).rgb, vec3(2.2));
        deskT = desk * uDesk2.y * uDesk2.x * pass;
        // the studio's light is replaced by the desktop where the glass is a window (the middles), and kept, as the
        // glass's own light, in the rolls (luminous over a dark desktop, as the reference's body glows)
        // (and less of it where the desktop behind is bright: there the desktop is what the glass shows; a light
        // wallpaper must not turn the glass milky)
        float dl = dot(desk, vec3(.2126, .7152, .0722));
        float keepR = mix(uL5.x, uDesk2.w, smoothstep(.012, .12, dl));
        behind *= mix(1., mix(uDesk2.w, keepR, flank), uDesk2.x);
      }
      trans = behind * pass + below;
    }
  }
  trans *= exp(-uAbsorb * path);
  deskT *= exp(-uAbsorb * path * .5);
  // the glass behind the words calm and a little darker: less of the desktop through it (on a white page its own
  // words showed behind the artist's)
  vec2 fc = gl_FragCoord.xy / uRes;
  float wm = 0.;
  for (int i = 0; i < 4; i++) {
    vec4 b = uWords[i];
    vec2 d = max(b.xy - fc, fc - b.zw) / vec2(uWordsDim.y, uWordsDim.y * uRes.x / uRes.y);
    wm = max(wm, 1. - smoothstep(0., 1., max(d.x, d.y)));
  }
  deskT *= mix(1., uWordsDim.x, wm);                          // (a white page through the glass stays near white)

  // ---- the light pass (all zero with light=0)
  vec3 Lc = texture(uLightMap, vUv).rgb / uLightRef;          // Cycles' light on this point of the glass
  float L = dot(Lc, vec3(.2126, .7152, .0722));
  if (!hitArt) trans *= uL2.w * mix(1., uL1.w, (1. - flank));  // the straight-through middles darker
  if (!hitArt) trans *= mix(vec3(1.), warm * 1.15, low * uL2.z * 1.6);   // coral through the low faces
  // light gathered in the thick edges: a band some tens of pixels wide just inside the outline (measured on the
  // silhouette itself, so never a halo outside it), coral low down (the bottom, the tail), peach higher up
  float eM = texture(uEdge, gl_FragCoord.xy / uRes).r;
  if (uBeadMode > .5) eM = .5 + .5 * ndv;                       // (a bead: its own outline, not the model's)
  else if (uFormOn == 1) eM = mix(.5 + .5 * ndv, eM, smoothstep(.85, 1., min(uForm.x, uForm.y) * uForm.w));   // (forming: likewise)
  // the broad band, or toward a narrower core hugging the outline (edge core), so the bottom reads as a lit edge
  // of glass rather than a painted rim
  float edge = mix(pow(smoothstep(.995, .5, eM), 1.3), pow(smoothstep(.85, .5, eM), 1.6), uL5.z);
  // (never an even outline: strongest where the edge faces down, the bottom and the tail; faint along the top)
  float lowE = smoothstep(.3, -.6, N.z);
  vec3 coral = mix(warm, uTint * vec3(1., .5, .45), .85);        // (saturated: the tone curve pales bright colours)
  vec3 band = mix(warm, coral, lowE) * uL1.y * edge * mix(.1, 1., lowE) * (.6 + .4 * min(L, 1.5)) * .45;
  vec3 lobe = warm * uL1.z * low * (1. - exp(-thick * 1.5)) * (1. - rim) * .06;          // and in the thick lobes, low
  // the cover's colours glowing in the ring round it, like a marble: the colour of the art's nearest edge,
  // carried into the glass and fading over some tens of pixels, more where the glass is thick
  vec3 qc = (uCovInv * vec4(vPos, 1.)).xyz;
  float dCov = rrect(qc.xz, uCov.x, uCov.y);
  vec3 edgeArt = pow(textureLod(uArt, (clamp(qc.xz, -uCov.x * .8, uCov.x * .8) + uCov.x) / uCov.z, 7.).rgb, vec3(2.2));
  vec3 marble = mix(edgeArt, uArtMean, .3) * uL4.x * exp(-max(dCov, 0.) / uL4.y) * (1. - exp(-thick * 3.));
  vec3 spill = uArtMean * uL2.x * exp(-max(dCov, 0.) / .35) * (1. - exp(-thick * 3.)) * .5;
  // the art mirrored in the ring: what lies just inside the cover's edge, reflected out across the pocket's wall
  // and stretched as it goes (the ring is a thick lens round the cover), fading over half the marble's reach
  vec3 ringArt = vec3(0.);
  if (uL5.w > 0. && dCov > 0. && dCov < uL4.y * 2.) {
    vec2 cq = clamp(qc.xz, -uCov.x + uCov.y, uCov.x - uCov.y);
    vec2 dd = qc.xz - cq;
    vec2 e = cq + dd / max(length(dd), 1e-5) * uCov.y;           // the nearest point of the cover's outline
    vec2 m = clamp(e - (qc.xz - e) * .7, -uCov.x * .97, uCov.x * .97);
    vec3 ma = pow(textureLod(uArt, (m + uCov.x) / uCov.z, 2.).rgb, vec3(2.2));
    ringArt = ma * uL5.w * exp(-dCov / (uL4.y * .5)) * (1. - exp(-thick * 3.));
  }
  // the wells: their middles darker, their rims lit warm, most on the lower rim
  vec3 wellLight = vec3(0.);
  for (int i = 0; i < 3; i++) {
    float r = length(vPos.xz - uWells[i].xy) / uWells[i].z;
    float ringW = exp(-pow((r - .94) / .09, 2.));
    float lowW = .3 + .7 * smoothstep(.2, -.8, (vPos.z - uWells[i].y) / uWells[i].z);
    wellLight += warm * ringW * lowW;
    if (r < .8) { trans *= mix(1., .55, uL2.y); deskT *= mix(1., .55, uL2.y); }
  }
  wellLight *= uL2.y * .35;
  vec3 inner = (trans + deskT + lobe + spill + marble + ringArt) * (1. - F);
  // the ink: a dye suspended in the clear glass, under its surface. (The owner, 19 November: more of it and a richer
  // colour, it looked watered down; but translucent, never opaque, the glass's highlights still over it.) So it acts on
  // what is seen through the glass only, never on what the surface mirrors: it filters what passes (taking up to about
  // two thirds of the other colours where it is dense, so the desktop still shows through it) and holds a little light
  // of its own colour (the room's light scattered in it), so it reads over a dark desktop too. Its hue is the cover's,
  // deepened (the pale and greyish parts of a cover gave a washed-out pink); little of it behind the words.
  if (uInkK.x > 0.) {
    vec3 ink = texture(uInk, gl_FragCoord.xy / uRes).rgb;
    float mx = maxc(ink);
    vec3 hue = ink / max(mx, 1e-3);
    float hl = dot(hue, vec3(.2126, .7152, .0722));
    hue = max(mix(vec3(hl), hue, 1.6), 0.); hue = pow(hue / max(maxc(hue), 1e-3), vec3(1.25));
    float dense = (1. - exp(-mx * 2.6)) * (.65 + .35 * (1. - exp(-thick * 3.))) * (1. - .85 * wm);
    inner *= mix(vec3(1.), hue, min(dense * uInkK.x, 1.) * .75);
    inner += hue * dense * uInkK.y * (1. - F);
  }
  vec3 col = refl * F + inner + band + wellLight;
  // the cursor's reflection (the owner, 19 November: nothing turns or changes its light for a pointer that is not on the
  // glass; "I should just be able to see the reflection of my cursor appear as my mouse draws closer"). The glass's
  // edge mirrors the pointer: as it nears the outline, its image comes toward it from inside the edge, as one's
  // reflection meets one at a mirror (the image of the arrow mirrored across the outline's tangent at the nearest point,
  // a little smaller, as a rounded mirror makes it), and meets it there; once the pointer is on the glass the image has
  // passed out of it. Light only: white, its outline taking a little light away; brighter in the lit rim, fainter
  // deeper in, never over the words. (Mirroring the pointer in the front faces themselves puts the image right behind
  // the cursor, or, on the deep glass behind the words, far off over the title.)
  if (uMotionOn == 1 && uCursor.z > .002) {
    vec2 fcC = gl_FragCoord.xy / uRes, X = vec2(fcC.x, 1. - fcC.y) * uPage;
    vec2 n = uCursorM.zw, xm = X - uCursorM.xy;
    xm -= 2. * dot(xm, n) * n;
    vec2 qc = uCursorM.xy + xm / uCursor.w - uCursor.xy;                    // CSS px from the arrow's tip, y down
    if (qc.x > -4. && qc.y > -4. && qc.x < 16. && qc.y < 23.) {
      float sd = arrowSd(qc), aa = clamp(fwidth(sd), .2, 3.);
      float fill = 1. - smoothstep(-aa, aa, sd);
      float rimC = (1. - smoothstep(-aa, aa, sd - 1.2)) - fill;
      float edgeC = smoothstep(.97, .55, texture(uEdge, fcC).r);
      float k = uCursor.z * mix(.6, 1., edgeC) * (1. - wm);
      col = col * (1. - .6 * rimC * k) + vec3(1.) * fill * k * 2.2;
    }
  }
  if (uMotionOn == 1 && uMusic.w > 0.) {
    // glints running along the hot highlights with the highs
    vec3 rF = refl * F;
    float hot = smoothstep(.6, 2.5, dot(rF, vec3(.2126, .7152, .0722)));
    float sp = pow(max(0., sin(vPos.x * 31. + uMusic.z * 5.3) * sin(vPos.x * 17. - uMusic.z * 3.1 + vPos.z * 9.)), 8.);
    col += rF * hot * sp * uMusic.y * uMusic.w * 2.2;
    // the spectrum glowing in the fold under the sheet: a few fine strands of light, each band lifting them where it
    // sits (low on the left, high on the right), coral with white cores
    float x = vPos.x;
    if (uSpec.x > 0. && x > uFold[0].x && x < uFold[7].x) {
      float zf = uFold[0].y;
      for (int i = 0; i < 7; i++) if (x >= uFold[i].x && x <= uFold[i + 1].x) zf = mix(uFold[i].y, uFold[i + 1].y, (x - uFold[i].x) / (uFold[i + 1].x - uFold[i].x));
      float sF = (x - uFold[0].x) / (uFold[7].x - uFold[0].x);
      float bi = sF * 15.; int i0 = int(floor(bi));
      float lv = mix(uBands[i0], uBands[min(i0 + 1, 15)], fract(bi));
      float ends = smoothstep(0., .1, sF) * smoothstep(1., .9, sF);
      float dz = vPos.z - zf, I = 0.;
      for (int kk = 0; kk < 3; kk++) {
        float fk = float(kk);
        float off = uSpec.y * (.2 + lv) * sin(x * (5. + 2.3 * fk) + uMusic.z * (2.1 + .9 * fk) + fk * 2.1);
        float w = uSpec.z * (1. + .7 * fk);
        I += exp(-pow((dz - off) / w, 2.)) * (1. - .25 * fk);
      }
      float e = (.2 + 1.4 * lv) * ends * uSpec.x * uMusic.w;
      vec3 sc = coral * vec3(1.25, .62, .5);
      col += (sc * I + sc * vec3(1., 1.25, 1.3) * pow(min(I, 1.), 3.) * .25) * e;   // coral strands, a little paler at their cores
    }
  }
  if (uDbg == 1) col = refl * F; else if (uDbg == 2) col = (trans + deskT) * (1. - F); else if (uDbg == 3) col = bands(R) * 4.;
  else if (uDbg == 8) col = deskT * (1. - F);
  else if (uDbg == 9) {          // the live studio's parts: red the hot strip, orange the low warm strip, white overhead, blue the floor
    float el = degrees(asin(clamp(normalize(uToWorld * R).z, -1., 1.)));
    col = el > 21.5 && el < 26.5 ? vec3(4., .2, .1) : el > -10. && el < -4. ? vec3(3., 1., .1) : el > 58. ? vec3(3.) : el < -2. ? vec3(.05, .1, .6) : vec3(0.);
  }
  else if (uDbg == 4) col = band + wellLight + (lobe + spill + marble + ringArt) * (1. - F); else if (uDbg == 5) col = vec3(rim);
  else if (uDbg == 6) col = vec3(sin(normalize(uToWorld * R).z * 28.) > 0. ? .95 : .02) * 2.;   // as build.py's zebra
  else if (uDbg == 7) col = layerAt(uF2, gl_FragCoord.xy).w < 100. ? vec3(1., .3, .1) : vec3(.05);   // where glass lies below
  else if (uDbg == 10) col = Lc * .5;                                   // Cycles' light on the glass (the image on the model)
  else if (uDbg == 11) col = texture(uInk, gl_FragCoord.xy / uRes).rgb * 3. + vec3(.03);   // the ink alone
  o = vec4(col, 1.);
}`;
const VS_QUAD = HEAD + `
out vec2 vUv;
void main() { vec2 p = vec2((gl_VertexID & 1) * 2 - 1, (gl_VertexID >> 1) * 2 - 1); vUv = p * .5 + .5; gl_Position = vec4(p, 0., 1.); }`;
// The glow round the hot lines (a photograph's bloom: highlights read as light in the glass, not lines drawn on it).
// The bright part of the picture, at a quarter of the render's size: four bilinear taps (a 4 x 4 box) a pixel.
const FS_BRIGHT = HEAD + `
in vec2 vUv;
uniform sampler2D uHdr;
uniform vec2 uPx;            // one render pixel, in uv
uniform float uThr;          // radiance above which light blooms
out vec4 o;
void main() {
  vec4 a = vec4(0.);
  for (int j = 0; j < 2; j++) for (int i = 0; i < 2; i++) a += texture(uHdr, vUv + (vec2(i, j) - .5) * 2. * uPx);
  a *= .25;
  vec3 c = a.rgb;
  float l = dot(c, vec3(.2126, .7152, .0722));
  o = vec4(c * max(l - uThr, 0.) / max(l, 1e-4), 1.);
}`;
// A Gaussian, one direction a pass (bilinear taps between texels: 9 texels wide each side with 5 taps).
const FS_BLUR = HEAD + `
in vec2 vUv;
uniform sampler2D uSrcTex;
uniform vec2 uDir;           // one texel along the blur, in uv
out vec4 o;
void main() {
  const float W0 = .2270270270, W1 = .3162162162, W2 = .0702702703;
  vec3 c = texture(uSrcTex, vUv).rgb * W0;
  c += (texture(uSrcTex, vUv + uDir * 1.3846153846).rgb + texture(uSrcTex, vUv - uDir * 1.3846153846).rgb) * W1;
  c += (texture(uSrcTex, vUv + uDir * 3.2307692308).rgb + texture(uSrcTex, vUv - uDir * 3.2307692308).rgb) * W2;
  o = vec4(c, 1.);
}`;
const FS_DOWN = HEAD + `precision highp sampler3D;
in vec2 vUv;
uniform sampler2D uHdr;
uniform sampler2D uBloom;    // the glow, a quarter of the render's size, with its mipmaps (wider and softer)
uniform vec3 uBloomK;        // near, wide, widest
uniform vec3 uBloomTint;     // the glow's colour (warm, from the album)
uniform vec2 uSrc;
uniform float uExposure;
uniform float uSS;
uniform highp sampler3D uTone;   // Blender's own view transform (AgX, the scene's look), baked by build.py's export
uniform vec3 uToneDom;           // its table size, the log2 range: lo, hi
out vec4 o;
vec3 view(vec3 v) {
  vec3 x = clamp((log2(max(v, vec3(1e-10))) - uToneDom.y) / (uToneDom.z - uToneDom.y), 0., 1.);
  return texture(uTone, (x * (uToneDom.x - 1.) + .5) / uToneDom.x).rgb;
}
vec4 tone(vec4 h, vec3 glow) {
  if (h.a <= 0.) return vec4(0.);
  // (the glow is added only where there is glass: never a halo outside the outline)
  vec3 t = clamp(view((h.rgb / h.a + glow) * uExposure), 0., 1.);
  return vec4(pow(t, vec3(2.2)) * h.a, h.a);       // linear for the averaging; back to the display's curve below
}
void main() {
  // the glow: the blurred bright part, near, and from its mipmaps wider and wider
  vec3 glow = texture(uBloom, vUv).rgb * uBloomK.x + textureLod(uBloom, vUv, 1.5).rgb * uBloomK.y
            + textureLod(uBloom, vUv, 3.).rgb * uBloomK.z;
  glow *= uBloomTint;
  // a tent two output pixels wide, nine bilinear taps over the supersampled buffer, each tap tone-mapped
  vec2 px = 1. / uSrc;
  vec4 acc = vec4(0.); float wsum = 0.;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    float w = (2. - abs(float(i))) * (2. - abs(float(j)));
    acc += tone(texture(uHdr, vUv + vec2(i, j) * px * uSS * .5), glow) * w; wsum += w;
  }
  acc /= wsum;
  vec3 c = acc.a > 0. ? pow(acc.rgb / acc.a, vec3(1. / 2.2)) : vec3(0.);
  o = vec4(c * acc.a, acc.a);
}`;

const fetchBin = (url) => fetch(url).then((r) => { if (!r.ok) throw new Error(url + ' ' + r.status); return r.arrayBuffer(); });

export async function createGlass(canvas, { assets, ss = 2, studio = 'live', light, dbg = 0 }) {
  // (preserveDrawingBuffer: the page's own recorder copies the canvas between frames)
  const gl = canvas.getContext('webgl2', { antialias: false, alpha: true, premultipliedAlpha: true, preserveDrawingBuffer: true });
  if (!gl) throw new Error('WebGL2 is not available');
  if (!gl.getExtension('EXT_color_buffer_float')) throw new Error('no EXT_color_buffer_float');

  const meta = await fetch(assets + 'meta.json').then((r) => r.json());
  const live = studio === 'live' && meta.envLive;
  const envName = live ? 'env-live' : 'env';
  const [glassBuf, coverBuf, envBuf, softBuf, lightBuf, toneBuf] = await Promise.all(
    ['glass.bin', 'cover.bin', envName + '.bin', envName + '-soft.bin', meta.light ? 'light.bin' : null, 'tone.bin']
      .map((f) => (f ? fetchBin(assets + f) : Promise.resolve(null))));
  const envSize = live ? meta.envLive : meta.env, softSize = live ? meta.envLiveSoft : meta.envSoft;

  function compile(vs, fs) {
    const p = gl.createProgram();
    for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
      const sh = gl.createShader(type); gl.shaderSource(sh, src); gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
      gl.attachShader(p, sh);
    }
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const u = {}; const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const a = gl.getActiveUniform(p, i); u[a.name.replace(/\[0\]$/, '')] = gl.getUniformLocation(p, a.name); }
    return { p, u };
  }
  function halfTexture(w, h, data, { mip = false, wrap = gl.CLAMP_TO_EDGE } = {}) {
    const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, data);
    if (mip) gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mip ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }
  function target(w, h, filter, internal = gl.RGBA16F, type = gl.HALF_FLOAT) {
    const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, gl.RGBA, type, null);
    for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, filter], [gl.TEXTURE_MAG_FILTER, filter], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
    const depth = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, depth);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w, h);
    const fbo = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depth);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('framebuffer incomplete');
    return { fbo, tex, depth, w, h };
  }
  const drop = (t) => { if (t) { gl.deleteTexture(t.tex); gl.deleteRenderbuffer(t.depth); gl.deleteFramebuffer(t.fbo); } };

  // the glass
  const nv = meta.glass.verts, nt = meta.glass.tris;
  const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
  for (const [loc, data, n] of [[0, new Float32Array(glassBuf, 0, nv * 3), 3], [1, new Float32Array(glassBuf, nv * 12, nv * 3), 3], [2, new Float32Array(glassBuf, nv * 24, nv * 2), 2]]) {
    const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, n, gl.FLOAT, false, 0, 0);
  }
  const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(glassBuf, nv * 32, nt * 3), gl.STATIC_DRAW);
  // the cover
  const cvao = gl.createVertexArray(); gl.bindVertexArray(cvao);
  const cb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, cb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(coverBuf), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 20, 0);
  gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 20, 12);
  gl.bindVertexArray(null);

  // the beads: a unit sphere (an icosahedron split three times: 642 points), drawn twice (instanced)
  const sphere = (() => {
    const t = (1 + Math.sqrt(5)) / 2;
    let v = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]]
      .map((p) => { const l = Math.hypot(...p); return p.map((c) => c / l); });
    let f = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
      [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
    for (let s = 0; s < 3; s++) {
      const mid = new Map(), nf = [];
      const m = (a, b) => {
        const k = a < b ? a + ',' + b : b + ',' + a;
        if (!mid.has(k)) { const p = v[a].map((c, i) => (c + v[b][i]) / 2), l = Math.hypot(...p); v.push(p.map((c) => c / l)); mid.set(k, v.length - 1); }
        return mid.get(k);
      };
      for (const [a, b, c] of f) { const ab = m(a, b), bc = m(b, c), ca = m(c, a); nf.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]); }
      f = nf;
    }
    return { pos: new Float32Array(v.flat()), idx: new Uint16Array(f.flat()) };
  })();
  const bvao = gl.createVertexArray(); gl.bindVertexArray(bvao);
  { const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, sphere.pos, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    const bi = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, bi); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, sphere.idx, gl.STATIC_DRAW); }
  gl.bindVertexArray(null);

  const envTex = halfTexture(envSize[0], envSize[1], new Uint16Array(envBuf), { mip: true, wrap: gl.REPEAT });
  const softTex = halfTexture(softSize[0], softSize[1], new Uint16Array(softBuf), { mip: true, wrap: gl.REPEAT });
  const lightTex = lightBuf ? halfTexture(meta.light[0], meta.light[1], new Uint16Array(lightBuf), { mip: true })
    : halfTexture(1, 1, new Uint16Array([15360, 15360, 15360, 15360]));
  const tn = meta.tone.n, toneTex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_3D, toneTex);
  gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA16F, tn, tn, tn, 0, gl.RGBA, gl.HALF_FLOAT, new Uint16Array(toneBuf));
  for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_3D, k, v);
  const artTex = gl.createTexture();
  const artOldTex = gl.createTexture();
  const edgeTex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, edgeTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));
  const deskTex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, deskTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
  for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);

  const prog = { layer: compile(VS_MESH, FS_LAYER), mask: compile(VS_MESH, FS_MASK), maskCover: compile(VS_COVER, FS_MASK),
    cover: compile(VS_COVER, FS_COVER), glass: compile(VS_MESH, FS_GLASS), down: compile(VS_QUAD, FS_DOWN),
    bright: compile(VS_QUAD, FS_BRIGHT), blur: compile(VS_QUAD, FS_BLUR), ink: compile(VS_QUAD, FS_INK),
    flForce: compile(VS_QUAD, FS_FL_FORCE), flImpulse: compile(VS_QUAD, FS_FL_IMPULSE), flCurl: compile(VS_QUAD, FS_FL_CURL),
    flVort: compile(VS_QUAD, FS_FL_VORT), flDiv: compile(VS_QUAD, FS_FL_DIV), flPressure: compile(VS_QUAD, FS_FL_PRESSURE),
    flProject: compile(VS_QUAD, FS_FL_PROJECT), flDrop: compile(VS_QUAD, FS_FL_DROP),
    layerBead: compile(VS_BEAD, FS_LAYER), glassBead: compile(VS_BEAD, FS_GLASS) };
  const t = meta.tilt * Math.PI / 180, ct = Math.cos(t), st = Math.sin(t);
  const toWorld = new Float32Array([1, 0, 0, 0, ct, -st, 0, st, ct]);        // columns: Rx(-tilt)
  const covInv = new Float32Array(16);
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) covInv[c * 4 + r] = meta.cover.inv[r][c];
  const WELLS = [[1077, 467, 58], [1237, 460, 82], [1392, 467, 58]].map(([u, v, r]) => [(u - meta.CX) * meta.S, (meta.CY - v) * meta.S, r * meta.S, 0]);

  // the fold under the sheet's lip, from the model's own ridge (reference px), in root units
  const FOLD = new Float32Array([[1040, 395], [1090, 384], [1150, 379], [1217, 380], [1290, 388], [1350, 399], [1409, 415], [1452, 428]]
    .map(([u, v]) => [(u - meta.CX) * meta.S, (meta.CY - v) * meta.S]).flat());
  const R = {
    meta, gl, light, dbg, wells: WELLS, motion: null, fold: FOLD,
    tint: meta.tint.slice(), artMean: [0.2, 0.1, 0.1], colour: 1, dissolve: 1, dissolveNoise: true, inkOn: false, coverImg: null,
    desk: { on: 0, map: [0, 0, 1, 1], has: false, uploads: 0, w: 0, h: 0 },
    size: null, targets: null, P: null,
  };

  /** The canvas: its CSS size, the display's ratio, and which part of the reference's frame (its pixels) it shows. */
  R.resize = (cssW, cssH, dpr, ref) => {
    const CW = Math.round(cssW * dpr), CH = Math.round(cssH * dpr), RW = CW * ss, RH = CH * ss;
    canvas.width = CW; canvas.height = CH; canvas.style.width = cssW + 'px'; canvas.style.height = cssH + 'px';
    if (R.targets) for (const k of Object.keys(R.targets)) drop(R.targets[k]);
    const QW = Math.max(1, Math.round(RW / 4)), QH = Math.max(1, Math.round(RH / 4));
    const DW = Math.round(CW * 0.75), DH = Math.round(CH * 0.75), VW = Math.round(CW / 3), VH = Math.round(CH / 3);
    R.targets = { back: target(RW, RH, gl.NEAREST), f2: target(RW, RH, gl.NEAREST), b2: target(RW, RH, gl.NEAREST),
      hdr: target(RW, RH, gl.LINEAR), mask: target(CW, CH, gl.NEAREST, gl.RGBA8, gl.UNSIGNED_BYTE),
      glowA: target(QW, QH, gl.LINEAR), glowB: target(QW, QH, gl.LINEAR),
      // the pigment at three quarters of the canvas's pixels (threads keep their edges), the liquid at a third
      inkA: target(DW, DH, gl.LINEAR), inkB: target(DW, DH, gl.LINEAR), inkF: target(DW, DH, gl.LINEAR), inkK: target(DW, DH, gl.LINEAR),
      velA: target(VW, VH, gl.LINEAR), velB: target(VW, VH, gl.LINEAR), curl: target(VW, VH, gl.NEAREST), div: target(VW, VH, gl.NEAREST),
      presA: target(VW, VH, gl.NEAREST), presB: target(VW, VH, gl.NEAREST) };
    R.vel = [R.targets.velA, R.targets.velB]; R.pres = [R.targets.presA, R.targets.presB];
    R.inkCur = R.targets.inkA; R.inkNext = R.targets.inkB;
    R.clearInk();
    // (the glow's mipmaps: sampled wider and softer when the picture goes down to the canvas)
    gl.bindTexture(gl.TEXTURE_2D, R.targets.glowA.tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    // orthographic, from the camera's side: root frame (X right, Y away, Z up) -> clip space, for the shown part
    const [rx, ry, rw, rh] = ref, S = meta.S, near = -3, far = 4;
    const a = 2 / (S * rw), bx = 2 * (meta.CX - rx) / rw - 1, c = 2 / (S * rh), by = 1 - 2 * (meta.CY - ry) / rh;
    const e = 2 / (far - near), bz = -2 * near / (far - near) - 1;
    R.P = new Float32Array([a, 0, 0, 0, 0, 0, e, 0, 0, c, 0, 0, bx, by, bz, 1]);
    R.size = { css: [cssW, cssH], canvas: [CW, CH], render: [RW, RH], dpr, ref, tris: nt };
  };

  /** The cover: an image (or canvas, or bitmap). Its mean colour feeds the glow in the ring. */
  const upload = (t, img) => {
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  };
  /** The cover. dissolve: the one before stays as the old art, for the page to dissolve it into the new (R.dissolve). */
  R.setCover = (img, dissolve = false) => {
    upload(dissolve && R.coverImg ? artOldTex : artOldTex, dissolve && R.coverImg ? R.coverImg : img);
    upload(artTex, img);
    R.coverImg = img;
    R.dissolve = dissolve ? 0 : 1;
    const c = document.createElement('canvas'); c.width = c.height = 16;
    const x = c.getContext('2d'); x.drawImage(img, 0, 0, 16, 16);
    const px = x.getImageData(0, 0, 16, 16).data; const m = [0, 0, 0];
    for (let i = 0; i < px.length; i += 4) for (let k = 0; k < 3; k++) m[k] += Math.pow(px[i + k] / 255, 2.2) / 256;
    R.artMean = m;
  };
  /** The album's colour (0..1; grey covers give silver): the glass's tint and its warmth. */
  R.setTint = (rgb, from = null) => { R.tint = rgb.slice(0, 3); R.tintPrev = (from || rgb).slice(0, 3); };
  /** The album's colour as shown: blending from the last album's while a new cover resolves (R.dissolve), and drained
   *  toward silver as R.colour goes to 0 (paused). */
  const SILVER = [0.86, 0.87, 0.92];
  R.tintBase = () => R.tint.map((c, i) => (R.tintPrev ? R.tintPrev[i] + (c - R.tintPrev[i]) * R.dissolve : c));
  R.tintNow = () => R.tintBase().map((c, i) => SILVER[i] + (c - SILVER[i]) * R.colour);
  /** The ink: one step of dt seconds. k: { fade, seep, burst, flood, time }. */
  /** Stir the liquid (reference px): a jet, a spin, a splash. Drops of pigment. Applied at the next step. */
  R.fluid = { impulses: [], drops: [] };
  R.push = (x, y, vx, vy, radius = 40) => R.fluid.impulses.push({ x, y, vx, vy, spin: 0, burst: 0, radius });
  R.swirl = (x, y, spin, radius = 80) => R.fluid.impulses.push({ x, y, vx: 0, vy: 0, spin, burst: 0, radius });
  R.splash = (x, y, burst, radius = 60) => R.fluid.impulses.push({ x, y, vx: 0, vy: 0, spin: 0, burst, radius });
  R.drop = (x, y, { radius = 22, amount = 0.9, color = null, coverUv = null, old = false } = {}) =>
    R.fluid.drops.push({ x, y, radius, amount, color: color || [0, 0, 0], coverUv, old });
  /** The liquid and its ink: one step of dt seconds. k: { fade, seep, burst, flood, time, flow, vort, iterations }. */
  R.stepInk = (dt, k) => {
    const T = R.targets, [rx, ry, rw, rh] = R.size.ref;
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE); gl.bindVertexArray(null);
    const vw = T.velA.w, vh = T.velA.h;
    const run = (pr, out, set) => {
      gl.bindFramebuffer(gl.FRAMEBUFFER, out.fbo); gl.viewport(0, 0, out.w, out.h);
      const u = use(pr);
      gl.uniform2f(u.uTexel, 1 / out.w, 1 / out.h); gl.uniform4f(u.uMap, rx, ry, rw, rh); tex(u.uEdge, edgeTex);
      set(u);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };
    const swapV = () => { R.vel = [R.vel[1], R.vel[0]]; };
    // the liquid
    run(prog.flForce, R.vel[1], (u) => {
      tex(u.uVel, R.vel[0].tex); gl.uniform1f(u.uDt, dt); gl.uniform1f(u.uTime, k.time); gl.uniform1f(u.uFlow, k.flow);
      gl.uniform4f(u.uCov, 144, 270, 446, 572); gl.uniform2fv(u.uLeakV, k.leakV || [0, 40]);
    });
    swapV();
    for (const im of R.fluid.impulses) {
      run(prog.flImpulse, R.vel[1], (u) => {
        tex(u.uVel, R.vel[0].tex); gl.uniform2f(u.uPoint, im.x, im.y); gl.uniform2f(u.uPush, im.vx, im.vy);
        gl.uniform1f(u.uSpin, im.spin); gl.uniform1f(u.uBurst, im.burst); gl.uniform1f(u.uRadius, im.radius);
      });
      swapV();
    }
    R.fluid.impulses.length = 0;
    run(prog.flCurl, T.curl, (u) => tex(u.uVel, R.vel[0].tex));
    run(prog.flVort, R.vel[1], (u) => { tex(u.uVel, R.vel[0].tex); tex(u.uCurl, T.curl.tex); gl.uniform1f(u.uDt, dt); gl.uniform1f(u.uStrength, k.vort); });
    swapV();
    run(prog.flDiv, T.div, (u) => tex(u.uVel, R.vel[0].tex));
    for (let i = 0; i < k.iterations; i++) {
      run(prog.flPressure, R.pres[1], (u) => { tex(u.uPressure, R.pres[0].tex); tex(u.uDiv, T.div.tex); });
      R.pres = [R.pres[1], R.pres[0]];
    }
    run(prog.flProject, R.vel[1], (u) => { tex(u.uPressure, R.pres[0].tex); tex(u.uVel, R.vel[0].tex); });
    swapV();
    // the pigment: new drops, then carried with a corrected step (and faded, the cover weeping, the flood)
    for (const d of R.fluid.drops) {
      run(prog.flDrop, R.inkNext, (u) => {
        tex(u.uDye, R.inkCur.tex); tex(u.uArt, artTex); tex(u.uArtOld, artOldTex);
        gl.uniform2f(u.uPoint, d.x, d.y); gl.uniform1f(u.uRadius, d.radius); gl.uniform1f(u.uAmount, d.amount);
        gl.uniform3fv(u.uColor, d.color); gl.uniform3fv(u.uPal, R.tint);
        gl.uniform4f(u.uCoverUv, d.coverUv ? d.coverUv[0] : 0, d.coverUv ? d.coverUv[1] : 0, d.coverUv ? 1 : 0, d.old ? 1 : 0);
      });
      [R.inkCur, R.inkNext] = [R.inkNext, R.inkCur];
    }
    R.fluid.drops.length = 0;
    const ink = (mode, out, set) => run(prog.ink, out, (u) => {
      gl.uniform1i(u.uMode, mode); gl.uniform1f(u.uDt, dt); gl.uniform1f(u.uTime, k.time);
      gl.uniform4f(u.uCov, 144, 270, 446, 572); gl.uniform4f(u.uK, k.fade, k.seep, k.burst, k.flood); gl.uniform3fv(u.uPal, R.tint);
      gl.uniform3fv(u.uLeakK, k.leakK || [0, 0, 40]);
      tex(u.uArt, artTex); tex(u.uArtOld, artOldTex); tex(u.uVel, R.vel[0].tex);
      set(u);
    });
    ink(0, T.inkF, (u) => tex(u.uSrc, R.inkCur.tex));
    ink(0, T.inkK, (u) => { tex(u.uSrc, T.inkF.tex); gl.uniform1f(u.uDt, -dt); });
    ink(1, R.inkNext, (u) => { tex(u.uDye, R.inkCur.tex); tex(u.uFwd, T.inkF.tex); tex(u.uBwd, T.inkK.tex); });
    [R.inkCur, R.inkNext] = [R.inkNext, R.inkCur];
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  };
  R.clearInk = () => {
    const T = R.targets;
    for (const t of [T.inkA, T.inkB, T.velA, T.velB, T.presA, T.presB]) { gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT); }
    if (R.fluid) { R.fluid.impulses.length = 0; R.fluid.drops.length = 0; }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  };
  /** A frame of the screen behind the window (a VideoFrame, image or canvas), or null. */
  R.setDesk = (frame) => {
    if (!frame) { R.desk.has = false; return; }
    gl.bindTexture(gl.TEXTURE_2D, deskTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, frame);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    R.desk.has = true; R.desk.uploads++;
    R.desk.w = frame.displayWidth || frame.width || 0; R.desk.h = frame.displayHeight || frame.height || 0;
  };

  let unit = 0;
  const use = (pr) => { gl.useProgram(pr.p); unit = 0; return pr.u; };
  const tex = (loc, tx, kind = gl.TEXTURE_2D) => { if (loc == null) return; gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(kind, tx); gl.uniform1i(loc, unit++); };
  const common = (u) => {
    gl.uniformMatrix3fv(u.uToWorld, false, toWorld); tex(u.uEnv, envTex); tex(u.uEnvSoft, softTex);
    gl.uniform2f(u.uEnvSize, envSize[0], softSize[0]); gl.uniform2f(u.uGain, 2.0, 2.0);
  };
  const layer = (out, prev, cull, first) => {
    gl.bindFramebuffer(gl.FRAMEBUFFER, out.fbo); gl.viewport(0, 0, out.w, out.h);
    gl.clearColor(0, 0, 0, 1e4); gl.clearDepth(1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LESS); gl.enable(gl.CULL_FACE); gl.cullFace(cull);
    const u = use(prog.layer); gl.uniformMatrix4fv(u.uP, false, R.P); gl.uniform1i(u.uFirst, first ? 1 : 0);
    setMotion(u);
    if (prev) tex(u.uPrev, prev.tex);
    gl.bindVertexArray(vao); gl.drawElements(gl.TRIANGLES, nt * 3, gl.UNSIGNED_INT, 0);
    if (beadsShown()) {
      const ub = use(prog.layerBead); gl.uniformMatrix4fv(ub.uP, false, R.P); gl.uniform1i(ub.uFirst, first ? 1 : 0);
      setMotion(ub); setBeads(ub);
      if (prev) tex(ub.uPrev, prev.tex);
      gl.bindVertexArray(bvao); gl.drawElementsInstanced(gl.TRIANGLES, sphere.idx.length, gl.UNSIGNED_SHORT, 0, 2);
    }
  };
  /** The beads beside the right end (set by the page): R.beads = { c: [[x, y, z, r] x2], a: [[x, y, z, joined] x2],
   *  w: [[stretch, waist, foot, -] x2] } in root units, or null. Drawn only while one has some size. */
  const beadsShown = () => Boolean(R.beads && (R.beads.c[0][3] > 1e-3 || R.beads.c[1][3] > 1e-3));
  const BEAD_UV = [(meta.CX + 7.3 / meta.S) / meta.W, 1 - (meta.CY - 0.25 / meta.S) / meta.H];   // (the end's light)
  const setBeads = (u) => {
    const B = R.beads;
    gl.uniform4fv(u.uBeadC, new Float32Array(B.c.flat())); gl.uniform4fv(u.uBeadA, new Float32Array(B.a.flat()));
    gl.uniform4fv(u.uBeadW, new Float32Array(B.w.flat())); gl.uniform2fv(u.uBeadUv, BEAD_UV);
  };

  const NONE6 = new Float32Array([0, 0, -1, 0, 0, 0, -1, 0, 0, 0, -1, 0, 0, 0, -1, 0, 0, 0, -1, 0, 0, 0, -1, 0]);
  const NOBEAT6 = new Float32Array([0, -1, 0, 0, 0, -1, 0, 0, 0, -1, 0, 0, 0, -1, 0, 0, 0, -1, 0, 0, 0, -1, 0, 0]);
  /** The motion's uniforms, for every program that draws the glass (the layers' vertex shader moves it the same way). */
  const setMotion = (u) => {
    // the drop forming or melting (R.form, set by the page while it does: { s: [bulb, right lobe], reach, thick, melt })
    const F = R.form;
    gl.uniform1i(u.uFormOn, F ? 1 : 0);
    if (F) { gl.uniform4f(u.uForm, F.s[0], F.s[1], F.reach, F.thick); gl.uniform2f(u.uMelt, F.melt || 0, 0); }
    const M = R.motion;
    gl.uniform1i(u.uMotionOn, M ? 1 : 0);
    if (!M) return;
    gl.uniform1f(u.uShapeK, M.shapeK ?? 1);
    gl.uniform4fv(u.uTilt, M.tilt); gl.uniform4fv(u.uDimple, M.dimple); gl.uniform4fv(u.uPress, M.press);
    gl.uniform4fv(u.uCursor, M.cursor || [0, 0, 0, 1]); gl.uniform4fv(u.uCursorM, M.cursorM || [0, 0, 0, 1]); gl.uniform2fv(u.uPage, M.page || [1, 1]);
    gl.uniform4fv(u.uRip, new Float32Array(M.rips.flat())); gl.uniform3fv(u.uRipK, M.ripK);
    gl.uniform4fv(u.uJig, M.jig); gl.uniform3fv(u.uJigK, M.jigK);
    gl.uniform3fv(u.uFlex, M.flex || [0, 0, 0]);
    gl.uniform4fv(u.uJigB, M.jigB ? new Float32Array(M.jigB.flat()) : NONE6);
    gl.uniform3fv(u.uSwellK, M.swellK || [4, 0.45, 0.55]);
    gl.uniform4fv(u.uBeat, M.beats ? new Float32Array(M.beats.flat()) : NOBEAT6);
    gl.uniform3fv(u.uBeatK, M.beatK || [6, 0.6, 0.7]);
    gl.uniform4fv(u.uMusic, M.music || [0, 0, 0, 0]); gl.uniform1fv(u.uBands, M.bands || new Float32Array(16));
    gl.uniform2fv(u.uFold, R.fold); gl.uniform4fv(u.uSpec, M.spec || [0, 0, 0, 0]);
    gl.uniform4fv(u.uWellC, new Float32Array(WELLS.map((w, i) => [w[0], w[1], w[2], M.sink[i]]).flat()));
    gl.uniform4fv(u.uSlosh, M.slosh || [0, 0, 0, 0]);
    gl.uniform4fv(u.uBud, new Float32Array((M.bud || [[0, 0, 0, 1], [0, 0, 0, 1]]).flat()));
  };
  R.draw = () => {
    const T = R.targets, L = R.light, [RW, RH] = R.size.render, [CW, CH] = R.size.canvas;
    // 1, 2: the layers
    layer(T.back, null, gl.FRONT, true);
    if (L.below > 0) { layer(T.f2, T.back, gl.BACK, false); layer(T.b2, T.f2, gl.FRONT, false); }
    // 3: the cover
    gl.bindFramebuffer(gl.FRAMEBUFFER, T.hdr.fbo); gl.viewport(0, 0, RW, RH);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.disable(gl.CULL_FACE);
    let u = use(prog.cover); common(u); gl.uniformMatrix4fv(u.uP, false, R.P); tex(u.uArt, artTex); gl.uniform1f(u.uCoat, L.coat);
    setMotion(u);
    tex(u.uArtOld, artOldTex); gl.uniform2f(u.uDissolve, R.dissolve, R.dissolveNoise ? 1 : 0);
    const TINT = R.tintNow();
    gl.bindVertexArray(cvao); gl.drawArrays(gl.TRIANGLES, 0, meta.cover.count);
    // 4: the glass (then the beads, the same glass)
    gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK);
    u = use(prog.glass); glassUniforms(u, TINT);
    gl.uniform1f(u.uBeadMode, 0);
    gl.bindVertexArray(vao); gl.drawElements(gl.TRIANGLES, nt * 3, gl.UNSIGNED_INT, 0);
    if (beadsShown()) {
      u = use(prog.glassBead); glassUniforms(u, TINT); setBeads(u);
      gl.uniform1f(u.uBeadMode, 1);
      gl.bindVertexArray(bvao); gl.drawElementsInstanced(gl.TRIANGLES, sphere.idx.length, gl.UNSIGNED_SHORT, 0, 2);
    }
    drawGlow(TINT);
  };
  /** Everything the glass's own program needs (the model's and the beads'). */
  function glassUniforms(u, TINT) {
    const T = R.targets, L = R.light, [RW, RH] = R.size.render;
    common(u);
    gl.uniformMatrix4fv(u.uP, false, R.P); gl.uniform2f(u.uRes, RW, RH);
    tex(u.uBack, T.back.tex); tex(u.uF2, T.f2.tex); tex(u.uB2, T.b2.tex); tex(u.uArt, artTex); tex(u.uLightMap, lightTex); tex(u.uDesk, deskTex);
    tex(u.uEdge, edgeTex);
    gl.uniform4fv(u.uDeskMap, R.desk.map);
    gl.uniform4f(u.uDesk2, R.desk.has ? R.desk.on : 0, L.desk, L.deskGap, L.deskKeep);
    gl.uniformMatrix4fv(u.uCovInv, false, covInv);
    gl.uniform3f(u.uCov, meta.cover.half, meta.cover.corner, meta.cover.side);
    gl.uniform3fv(u.uAbsorb, TINT.map((c) => (1 - c) * 0.55 * 0.55 * L.path));
    gl.uniform1f(u.uLightRef, meta.lightRef || 1);
    gl.uniform4f(u.uL1, L.soft, L.band, L.lobe, L.middle);
    gl.uniform4f(u.uL2, L.spill, L.well, L.warmth * (0.2 + 0.8 * R.colour), L.through);
    gl.uniform4f(u.uL3, L.mirror, L.hot, L.hotk, L.below);
    gl.uniform2f(u.uL4, L.marble, L.marbleReach);
    gl.uniform4f(u.uL5, L.keepRoll, L.sheen, L.edgeCore, L.ringMirror);
    gl.uniform3fv(u.uTint, TINT); gl.uniform3fv(u.uArtMean, R.artMean.map((c, i) => c * (0.25 + 0.75 * R.colour)));
    tex(u.uInk, R.inkCur.tex); gl.uniform2f(u.uInkK, R.inkOn ? L.ink : 0, R.inkOn ? L.inkGlow : 0);
    gl.uniform4fv(u.uWells, new Float32Array(WELLS.flat())); gl.uniform1i(u.uDbg, R.dbg);
    // phase 3: the cursor and the presses (R.motion, set by the page each frame while anything moves)
    const M = R.motion;
    setMotion(u);
    // (the words' boxes, reference px -> canvas fractions, y up)
    const [rx, ry, rw, rh] = R.size.ref;
    const boxes = (R.words || []).slice(0, 4).map(([u0, v0, u1, v1]) => [(u0 - rx) / rw, 1 - (v1 - ry) / rh, (u1 - rx) / rw, 1 - (v0 - ry) / rh]);
    while (boxes.length < 4) boxes.push([2, 2, 2, 2]);
    gl.uniform4fv(u.uWords, new Float32Array(boxes.flat()));
    gl.uniform2f(u.uWordsDim, L.wordsDesk, 14 / rw);
  }
  /** The glow, then down to the canvas. */
  function drawGlow(TINT) {
    const T = R.targets, L = R.light, [RW, RH] = R.size.render, [CW, CH] = R.size.canvas;
    let u;
    // the glow: the bright part at a quarter size, blurred across then down, then its mipmaps
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE); gl.bindVertexArray(null);
    const QW = T.glowA.w, QH = T.glowA.h;
    gl.bindFramebuffer(gl.FRAMEBUFFER, T.glowA.fbo); gl.viewport(0, 0, QW, QH);
    u = use(prog.bright); tex(u.uHdr, T.hdr.tex); gl.uniform2f(u.uPx, 1 / RW, 1 / RH); gl.uniform1f(u.uThr, L.bloomThr);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    for (const [src, dst, dx, dy] of [[T.glowA, T.glowB, 1, 0], [T.glowB, T.glowA, 0, 1]]) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fbo);
      u = use(prog.blur); tex(u.uSrcTex, src.tex); gl.uniform2f(u.uDir, dx * L.bloomR / QW, dy * L.bloomR / QH);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, T.glowA.tex); gl.generateMipmap(gl.TEXTURE_2D);
    // 5: down to the canvas
    gl.viewport(0, 0, CW, CH);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    u = use(prog.down); tex(u.uHdr, T.hdr.tex); tex(u.uTone, toneTex, gl.TEXTURE_3D);
    tex(u.uBloom, T.glowA.tex); { const b = R.dbg ? 0 : L.bloom; gl.uniform3f(u.uBloomK, b * 0.5, b * 0.35, b * 0.25); }   // (no glow on the debug views)
    {   // the glow's colour: white toward the album's warm (peach with a little of the album, as the light pass's warm)
      const w = [1, 0.8, 0.72].map((c, i) => c * 0.65 + TINT[i] * 0.35), m = Math.max(...w);
      gl.uniform3fv(u.uBloomTint, w.map((c) => 1 + (c / m - 1) * L.bloomWarm * (0.2 + 0.8 * R.colour)));
    }
    gl.uniform2f(u.uSrc, RW, RH); gl.uniform1f(u.uExposure, L.exposure); gl.uniform1f(u.uSS, ss);
    gl.uniform3f(u.uToneDom, tn, meta.tone.lo, meta.tone.hi);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  };

  /** The real silhouette (glass and cover) at the canvas's own pixels, rows from the top: for the click-through. */
  R.readMask = () => {
    const T = R.targets, [CW, CH] = R.size.canvas;
    gl.bindFramebuffer(gl.FRAMEBUFFER, T.mask.fbo); gl.viewport(0, 0, CW, CH);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE);
    let u = use(prog.mask); gl.uniformMatrix4fv(u.uP, false, R.P);
    gl.bindVertexArray(vao); gl.drawElements(gl.TRIANGLES, nt * 3, gl.UNSIGNED_INT, 0);
    u = use(prog.maskCover); gl.uniformMatrix4fv(u.uP, false, R.P);
    gl.bindVertexArray(cvao); gl.drawArrays(gl.TRIANGLES, 0, meta.cover.count);
    const px = new Uint8Array(CW * CH * 4);
    gl.readPixels(0, 0, CW, CH, gl.RGBA, gl.UNSIGNED_BYTE, px);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    const m = new Uint8Array(CW * CH);
    for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) m[y * CW + x] = px[((CH - 1 - y) * CW + x) * 4] > 127 ? 1 : 0;
    // the edge map: the silhouette blurred over about edgeReach reference px (three box passes each way), rows from the bottom
    const rad = Math.max(2, Math.round(R.light.edgeReach * CW / R.size.ref[2] / 1.7));
    let a = new Float32Array(CW * CH), b = new Float32Array(CW * CH);
    for (let i = 0; i < a.length; i++) a[i] = px[i * 4] > 127 ? 1 : 0;
    const box = (src, dst, w, h, stepX) => {
      for (let line = 0; line < (stepX ? h : w); line++) {
        let acc = 0; const n = stepX ? w : h, at = (k) => (stepX ? line * w + k : k * w + line);
        for (let k = -rad; k <= rad; k++) acc += src[at(Math.min(n - 1, Math.max(0, k)))];
        for (let k = 0; k < n; k++) {
          dst[at(k)] = acc / (2 * rad + 1);
          acc += src[at(Math.min(n - 1, k + rad + 1))] - src[at(Math.max(0, k - rad))];
        }
      }
    };
    for (let pass = 0; pass < 3; pass++) { box(a, b, CW, CH, true); box(b, a, CW, CH, false); }
    const e = new Uint8Array(CW * CH * 4);
    for (let i = 0; i < a.length; i++) { const v = Math.round(a[i] * 255); e[i * 4] = e[i * 4 + 1] = e[i * 4 + 2] = v; e[i * 4 + 3] = 255; }
    gl.bindTexture(gl.TEXTURE_2D, edgeTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, CW, CH, 0, gl.RGBA, gl.UNSIGNED_BYTE, e);
    for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
    return { data: m, w: CW, h: CH };
  };
  return R;
}
