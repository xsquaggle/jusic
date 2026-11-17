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
uniform vec4 uDimple;      // centre (x, z), depth (+: pushed back), radius
uniform vec4 uPress;       // centre, depth, radius
uniform vec4 uRip[4];      // centre, age (s; < 0: none), strength
uniform vec3 uRipK;        // speed (units a second), wavelength (units), decay (s)
uniform vec4 uJig;         // the slow, wide wobble rolling out from a release: centre, age (s; < 0: none), strength
// the music: the lobes swell with the bass; on the beat a wave runs along the ribbon, from the cover to the tail
uniform float uFlex;       // the bass swell (units toward the camera)
uniform vec4 uBeat[2];     // beat waves: start x, age (s; < 0: none), strength, -
uniform vec3 uBeatK;       // their speed, wavelength, decay
uniform vec3 uJigK;        // its speed, wavelength, decay
// a ring of waves running out from r.xy (age r.z, strength r.w), its slope added to grad
float ring(vec2 p, vec4 r, vec3 K, inout vec2 grad) {
  vec2 d = p - r.xy; float rr = max(length(d), 1e-4);
  float q = rr - K.x * r.z, w = K.y * 1.3, k = 6.2831853 / K.y;
  float amp = r.w * exp(-r.z / K.z) * smoothstep(0., .08, r.z), env = exp(-q * q / (w * w));
  grad += amp * env * (k * cos(k * q) - 2. * q / (w * w) * sin(k * q)) * d / rr;
  return amp * env * sin(k * q);
}
uniform vec4 uWellC[3];    // the wells: centre, radius, how far the floor has sunk
float motionField(vec2 p, out vec2 grad) {
  float g = 0.; grad = vec2(0.);
  if (uDimple.z != 0.) {
    vec2 d = p - uDimple.xy; float R2 = uDimple.w * uDimple.w; float e = exp(-.5 * dot(d, d) / R2) * uDimple.z;
    g += e; grad -= e * d / R2;
  }
  if (uPress.z != 0.) {      // in under the pointer, a soft bulge round it (the glass keeps its volume)
    vec2 d = p - uPress.xy; float R2 = uPress.w * uPress.w; float s = dot(d, d) / R2; float e = exp(-.5 * s) * uPress.z;
    g += e * (1. - s); grad -= e * d / R2 * (3. - s);
  }
  for (int i = 0; i < 4; i++) if (uRip[i].z >= 0.) g += ring(p, uRip[i], uRipK, grad);
  if (uFlex != 0.) {         // the two lobes breathing with the bass (the bulb round the cover, the right lobe)
    vec2 c1 = vec2(-5.63, .26), c2 = vec2(5.07, .66);
    vec2 d1 = p - c1, d2 = p - c2;
    float e1 = exp(-.5 * dot(d1, d1) / 2.9), e2 = exp(-.5 * dot(d2, d2) / 2.6);
    g -= uFlex * (e1 + e2); grad += uFlex * (e1 * d1 / 2.9 + e2 * d2 / 2.6);
  }
  for (int i = 0; i < 2; i++) {
    vec4 b = uBeat[i];
    if (b.y < 0.) continue;
    float q = p.x - (b.x + uBeatK.x * b.y), w = uBeatK.y * 1.4, k = 6.2831853 / uBeatK.y;
    float amp = b.z * exp(-b.y / uBeatK.z) * smoothstep(0., .06, b.y), env = exp(-q * q / (w * w));
    g += amp * env * sin(k * q);
    grad.x += amp * env * (k * cos(k * q) - 2. * q / (w * w) * sin(k * q));
  }
  if (uJig.z >= 0.) g += ring(p, uJig, uJigK, grad);
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
  if (uMotionOn == 1) { vec2 gr; p.y += motionField(aPos.xz, gr) * motionFront(aNor); }
  vPos = p; vNor = aNor; vUv = aUv; gl_Position = uP * vec4(p, 1.);
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
  return mix(own, art / max(hi, .08), coloured) * smoothstep(.015, .3, hi);
}
`;
/**
 * The ink: pigment carried through the glass by slow currents, on a grid at half the canvas's pixels, kept inside the
 * silhouette. mode 2: the currents (the curl of a stream function: swirls, and a current running round the inside of
 * the outline, so along the lower band toward the tail); mode 0: carry something along them (forward or back);
 * mode 1: the corrected (MacCormack) step, then fading, the cover's lower edge weeping threads, a track change's old
 * cover letting go, and colour flooding back round the cover on play.
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
uniform vec4 uCov;           // the cover's box in reference px: u0, v0, u1, v1
uniform vec4 uK;             // fade (s), seep, burst (the old cover letting go), flood (colour back round the cover)
out vec4 o;
vec2 refAt(vec2 uv) { return vec2(uMap.x + uv.x * uMap.z, uMap.y + (1. - uv.y) * uMap.w); }
float inside(vec2 uv) { return texture(uEdge, uv).r; }
float psi(vec2 p, vec2 uv) {
  float e = inside(uv);
  float n = fbm2(p * .0055 + vec2(uTime * .025, -uTime * .017)) - .5;
  float n2 = fbm2(p * .014 - vec2(uTime * .035, uTime * .02)) - .5;
  // (px a second: swirls of some tens, and a current of about a hundred running round the inside of the outline,
  // left to right along the lower band, so pigment weeping from the cover is drawn out toward the tail)
  return 4200. * smoothstep(.55, .92, e) * (1.1 * n + .45 * n2) + 2600. * smoothstep(.5, .9, e);
}
void main() {
  if (uMode == 2) {
    vec2 p = refAt(vUv); float h = 3.;
    vec2 du = vec2(h / uMap.z, 0.), dv = vec2(0., h / uMap.w);
    vec2 v = vec2(psi(p + vec2(0., h), vUv - dv) - psi(p - vec2(0., h), vUv + dv),
                  -(psi(p + vec2(h, 0.), vUv + du) - psi(p - vec2(h, 0.), vUv - du))) / (2. * h);
    vec2 cc = .5 * (uCov.xy + uCov.zw), q = p - cc;
    v += uK.z * normalize(q + 1e-3) * 420. * exp(-dot(q, q) / (240. * 240.));
    v *= smoothstep(.45, .6, inside(vUv));
    o = vec4(v.x / uMap.z, -v.y / uMap.w, 0., 1.);          // canvas uv a second
    return;
  }
  vec2 vel = texture(uVel, vUv).xy;
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
  // between beats the cover weeps from its lower edge, in threads, into the lower band
  float inX = smoothstep(uCov.x + 4., uCov.x + 30., p.x) * smoothstep(uCov.z - 4., uCov.z - 30., p.x);
  float lowerEdge = inX * smoothstep(16., 0., abs(p.y - (uCov.w + 8.)));
  float thread = pow(smoothstep(.42, .8, fbm2(vec2(p.x * .05, uTime * .12))), 2.);
  dye += art * lowerEdge * (.06 + 3.2 * thread) * uK.y * uDt;
  // a track change: the old cover turns to pigment where it lay, and is pushed out (mode 2)
  float inCov = step(uCov.x, p.x) * step(p.x, uCov.z) * step(uCov.y, p.y) * step(p.y, uCov.w);
  dye = mix(dye, pigment(textureLod(uArtOld, cuv, 1.5).rgb) * 1.2, uK.z * inCov * .3);
  // play: colour floods back out of the cover, round its edges
  float rimD = abs(max(max(uCov.x - p.x, p.x - uCov.z), max(uCov.y - p.y, p.y - uCov.w)) - 6.);
  dye += art * smoothstep(30., 0., rimD) * uK.w * 3. * uDt;
  dye *= smoothstep(.45, .6, inside(vUv));
  o = vec4(clamp(dye, 0., 4.), 1.);
}`;
const VS_COVER = HEAD + `
layout(location = 0) in vec3 aPos;
layout(location = 2) in vec2 aUv;
uniform mat4 uP;
out vec3 vPos;
out vec2 vUv;
void main() { vPos = aPos; vUv = aUv; gl_Position = uP * vec4(aPos, 1.); }`;
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
uniform vec4 uTilt;                // the turn toward the cursor (x, z), and the upper sheet's extra lean (x, z)
uniform vec4 uMusic;               // the music: bass, highs, time (s), on (0..1: fades out on pause)
uniform float uBands[16];          // its spectrum, low to high
uniform vec2 uFold[8];             // the fold under the sheet's lip (root x, z), left to right
uniform vec4 uSpec;                // the spectrum in the fold: strength, strands' swing (units), their width, -
uniform sampler2D uInk;            // the ink: pigment carried through the glass (canvas uv)
uniform float uInkK;               // how strongly it glows
uniform vec4 uWords[4];            // behind the words and times: boxes in canvas fractions (x0, y0, x1, y1; y up)
uniform vec2 uWordsDim;            // how much of the desktop still comes through there, the feather (fractions of width)
uniform int uDbg;
out vec4 o;

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
    vec2 gr; motionField(vPos.xz, gr);
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
    float fieldW = 1. - .6 * wmM;
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
  vec3 col = refl * F + (trans + deskT + lobe + spill + marble + ringArt) * (1. - F) + band + wellLight;
  // the ink glowing in the glass, more where it is thick, little behind the words
  if (uInkK > 0.) col += texture(uInk, gl_FragCoord.xy / uRes).rgb * uInkK * (.35 + .65 * (1. - exp(-thick * 3.))) * (1. - F) * (1. - .8 * wm);
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
      col += (coral * vec3(1.15, .8, .7) * I + vec3(1., .92, .86) * pow(min(I, 1.), 3.) * .6) * e;   // coral, white where the strands are brightest
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
    bright: compile(VS_QUAD, FS_BRIGHT), blur: compile(VS_QUAD, FS_BLUR), ink: compile(VS_QUAD, FS_INK) };
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
    R.targets = { back: target(RW, RH, gl.NEAREST), f2: target(RW, RH, gl.NEAREST), b2: target(RW, RH, gl.NEAREST),
      hdr: target(RW, RH, gl.LINEAR), mask: target(CW, CH, gl.NEAREST, gl.RGBA8, gl.UNSIGNED_BYTE),
      glowA: target(QW, QH, gl.LINEAR), glowB: target(QW, QH, gl.LINEAR),
      inkA: target(Math.round(CW / 2), Math.round(CH / 2), gl.LINEAR), inkB: target(Math.round(CW / 2), Math.round(CH / 2), gl.LINEAR),
      inkF: target(Math.round(CW / 2), Math.round(CH / 2), gl.LINEAR), inkK: target(Math.round(CW / 2), Math.round(CH / 2), gl.LINEAR),
      inkV: target(Math.round(CW / 2), Math.round(CH / 2), gl.LINEAR) };
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
  R.stepInk = (dt, k) => {
    const T = R.targets, w = T.inkA.w, h = T.inkA.h, [rx, ry, rw, rh] = R.size.ref;
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE); gl.bindVertexArray(null);
    gl.viewport(0, 0, w, h);
    const pass = (mode, out, set) => {
      gl.bindFramebuffer(gl.FRAMEBUFFER, out.fbo);
      const u = use(prog.ink);
      gl.uniform1i(u.uMode, mode); gl.uniform1f(u.uDt, dt); gl.uniform1f(u.uTime, k.time);
      gl.uniform4f(u.uMap, rx, ry, rw, rh); gl.uniform4f(u.uCov, 144, 270, 446, 572);
      gl.uniform4f(u.uK, k.fade, k.seep, k.burst, k.flood); gl.uniform3fv(u.uPal, R.tint);
      // (the currents' own pass must not read the texture it writes: WebGL drops a draw with such a loop)
      tex(u.uEdge, edgeTex); tex(u.uArt, artTex); tex(u.uArtOld, artOldTex); tex(u.uVel, out === T.inkV ? T.inkF.tex : T.inkV.tex);
      set(u);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };
    pass(2, T.inkV, () => {});
    pass(0, T.inkF, (u) => tex(u.uSrc, R.inkCur.tex));
    pass(0, T.inkK, (u) => { tex(u.uSrc, T.inkF.tex); gl.uniform1f(u.uDt, -dt); });
    pass(1, R.inkNext, (u) => { tex(u.uDye, R.inkCur.tex); tex(u.uFwd, T.inkF.tex); tex(u.uBwd, T.inkK.tex); });
    [R.inkCur, R.inkNext] = [R.inkNext, R.inkCur];
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  };
  R.clearInk = () => {
    for (const t of [R.targets.inkA, R.targets.inkB]) { gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT); }
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
    if (prev) tex(u.uPrev, prev.tex);
    gl.bindVertexArray(vao); gl.drawElements(gl.TRIANGLES, nt * 3, gl.UNSIGNED_INT, 0);
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
    tex(u.uArtOld, artOldTex); gl.uniform2f(u.uDissolve, R.dissolve, R.dissolveNoise ? 1 : 0);
    const TINT = R.tintNow();
    gl.bindVertexArray(cvao); gl.drawArrays(gl.TRIANGLES, 0, meta.cover.count);
    // 4: the glass
    gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK);
    u = use(prog.glass); common(u);
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
    tex(u.uInk, R.inkCur.tex); gl.uniform1f(u.uInkK, R.inkOn ? L.ink : 0);
    gl.uniform4fv(u.uWells, new Float32Array(WELLS.flat())); gl.uniform1i(u.uDbg, R.dbg);
    // phase 3: the cursor and the presses (R.motion, set by the page each frame while anything moves)
    const M = R.motion;
    gl.uniform1i(u.uMotionOn, M ? 1 : 0);
    if (M) {
      gl.uniform4fv(u.uTilt, M.tilt); gl.uniform4fv(u.uDimple, M.dimple); gl.uniform4fv(u.uPress, M.press);
      gl.uniform4fv(u.uRip, new Float32Array(M.rips.flat())); gl.uniform3fv(u.uRipK, M.ripK);
      gl.uniform4fv(u.uJig, M.jig); gl.uniform3fv(u.uJigK, M.jigK);
      gl.uniform1f(u.uFlex, M.flex || 0); gl.uniform4fv(u.uBeat, new Float32Array((M.beats || [[0, -1, 0, 0], [0, -1, 0, 0]]).flat()));
      gl.uniform3fv(u.uBeatK, M.beatK || [6, 0.6, 0.7]);
      gl.uniform4fv(u.uMusic, M.music || [0, 0, 0, 0]); gl.uniform1fv(u.uBands, M.bands || new Float32Array(16));
      gl.uniform2fv(u.uFold, R.fold); gl.uniform4fv(u.uSpec, M.spec || [0, 0, 0, 0]);
      gl.uniform4fv(u.uWellC, new Float32Array(WELLS.map((w, i) => [w[0], w[1], w[2], M.sink[i]]).flat()));
    }
    // (the words' boxes, reference px -> canvas fractions, y up)
    const [rx, ry, rw, rh] = R.size.ref;
    const boxes = (R.words || []).slice(0, 4).map(([u0, v0, u1, v1]) => [(u0 - rx) / rw, 1 - (v1 - ry) / rh, (u1 - rx) / rw, 1 - (v0 - ry) / rh]);
    while (boxes.length < 4) boxes.push([2, 2, 2, 2]);
    gl.uniform4fv(u.uWords, new Float32Array(boxes.flat()));
    gl.uniform2f(u.uWordsDim, L.wordsDesk, 14 / rw);
    gl.bindVertexArray(vao); gl.drawElements(gl.TRIANGLES, nt * 3, gl.UNSIGNED_INT, 0);
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
