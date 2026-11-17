/**
 * Mercury as live 3D glass: phase 2's spike, on the model of tools/mercury3d/build.py (the one modelled over the
 * reference). The model, its studio pair and Cycles' light on it come from `build.py -- export=<folder>`; this page
 * draws them in WebGL2, still, and measures itself (window.__glass) for tools/widget-proto/main.js test=spike.
 *
 * Per frame, at `ss` times the canvas's own pixels (2 by default; every pass, the off-screen ones included):
 *   1. the glass's back faces: their normals and depth (how thick the glass is, where a ray leaves it);
 *   2. the cover: its art by its own light, a faint clear coat;
 *   3. the glass's front faces: the studio mirrored (Fresnel; the sharp map, prefiltered to the pixel's footprint
 *      so thin highlights never shimmer), and bent through two surfaces (into the front, out of the back face found
 *      in pass 1, or back inside past the critical angle), seeing the soft map as Cycles does once a ray has entered
 *      the glass; where the bent ray meets the cover's face inside the ring, the art; absorption by the thickness
 *      crossed; then (light=1) the light pass;
 *   4. down to the canvas through a tent filter, each tap through Blender's tone curve (AgX).
 * Then the words, times, timeline, volume and glyphs as a crisp 2D layer on top (as tools/mercury3d/overlay.js
 * draws them for the stills), and soft warm pools below the lobes underneath.
 *
 *   /prototypes/glass3d/?assets=/design/captures/raw/mercury3d/live/
 *     frame=ref     the reference's framing (1586 x 992 CSS px), for comparing with Cycles; default: the widget's
 *                   window (860 x 400 CSS px, the glass at the old stage's scale)
 *     ss=2          supersampling     light=0|1   the studio exactly as Cycles has it, or with the light pass
 *     fps=60        draw at most this often     idle=1   draw once and stop (what idle costs)
 *     art=<url>     the cover     pools=0   no warm pools     words=0   no live layer     bg=ref   a backdrop like the
 *                   reference's (pictures only; the widget itself is transparent)
 *     dbg=1|2|3|4|6 what the front mirrors, what comes through, the bands (as build.py's), the light pass's glow
 *                   terms, the zebra (as build.py's: the live mesh's own smoothness)
 */

const Q = new URLSearchParams(location.search);
const ASSETS = Q.get('assets') || '/design/captures/raw/mercury3d/live/';
const SS = Number(Q.get('ss')) || 2;
const MODE = Q.has('light') ? Number(Q.get('light')) : 1;

// The light pass toward the reference (the owner: broader, warmer, more luminous rims and lobes, fewer thin white
// lines, darker middles). With light=0 every term is off and the studio is exactly Cycles'.
//   soft    how much of what the glass mirrors comes from the soft map, more toward the rims (fewer thin lines)
//   band    one broad warm band along each rim where the glass turns away, following Cycles' light on the glass
//   lobe    warm light held inside the glass where it is thick, following Cycles' light on the glass
//   middle  how much of the studio the straight-through middles show (darker below 1)
//   spill   the cover's colour carried into the glass round it
//   well    the wells' rims lit warm
//   through how much of the studio shows through the glass (the reference's rolls are darker inside than one clean
//           crossing of this studio gives: its bright floor and panels seen through them turned them white)
//   mirror  how strongly the rolls' flanks mirror the (blurred) studio: its strips are very hot, and spread into
//           broad bands at full strength they turned the rolls white
//   hot     the radiance above which the studio stays sharp (its key strip): one narrow hot line per roll; hotk how
//           strongly
//   path    how much longer than one crossing the light's path inside is (Cycles bounces it round the thick glass
//           several times: longer paths take more of the album's colour away, so the glass reads pinker, less white)
const LIGHT = MODE === 0
  ? { exposure: 1, soft: 0, band: 0, lobe: 0, middle: 1, spill: 0, well: 0, warmth: 0, path: 1, through: 1, mirror: 1, hot: 0, hotk: 0 }
  : { exposure: 1, soft: 0.6, band: 1.3, lobe: 0.5, middle: 0.6, spill: 0.3, well: 0.6, warmth: 0.35, path: 2.2, through: 0.25, mirror: 0.35, hot: 150, hotk: 1 };
for (const k of Object.keys(LIGHT)) if (Q.has(k)) LIGHT[k] = Number(Q.get(k));

const under = document.getElementById('under');
const canvas = document.getElementById('gl');
const inkCanvas = document.getElementById('ink');
const gl = canvas.getContext('webgl2', { antialias: false, alpha: true, premultipliedAlpha: true });
if (!gl) throw new Error('WebGL2 is not available');
if (!gl.getExtension('EXT_color_buffer_float')) console.warn('no EXT_color_buffer_float');

const fetchBin = (url) => fetch(url).then((r) => { if (!r.ok) throw new Error(url + ' ' + r.status); return r.arrayBuffer(); });
const fetchImg = (url) => new Promise((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => bad(new Error(url)); i.src = url; });

/* ------------------------------------------------------------------- shaders --- */
const HEAD = `#version 300 es
precision highp float;
precision highp sampler2D;
#define PI 3.14159265
`;
const COMMON = `
uniform mat3 uToWorld;      // the root's frame -> the studio's (the tilt about X)
uniform sampler2D uEnv;
uniform sampler2D uEnvSoft;
uniform vec2 uEnvSize;       // the sharp map's width, the soft one's
uniform vec2 uGain;          // Cycles' studio gains: reflected, seen through
vec2 equi(vec3 d) { d = normalize(uToWorld * d); return vec2(.5 - atan(d.y, d.x) / (2. * PI), .5 + asin(clamp(d.z, -1., 1.)) / PI); }
// The map's level for a direction that turns by 'a' radians across one pixel (no thin strip shimmers or breaks up).
float lodFor(float a, float w) { return max(log2(max(a * w / (2. * PI), 1e-4)) + .5, 0.); }
vec3 envSharp(vec3 d, float a) { return textureLod(uEnv, equi(d), lodFor(a, uEnvSize.x)).rgb * uGain.x; }
vec3 envSoft(vec3 d, float a) { return textureLod(uEnvSoft, equi(d), lodFor(a, uEnvSize.y)).rgb * uGain.y; }
`;
const VS_MESH = HEAD + `
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec3 aNor;
layout(location = 2) in vec2 aUv;
uniform mat4 uP;
out vec3 vPos;
out vec3 vNor;
out vec2 vUv;
void main() { vPos = aPos; vNor = aNor; vUv = aUv; gl_Position = uP * vec4(aPos, 1.); }`;
const FS_BACK = HEAD + `
in vec3 vPos;
in vec3 vNor;
out vec4 o;
void main() { o = vec4(normalize(vNor), vPos.y); }`;
const VS_COVER = HEAD + `
layout(location = 0) in vec3 aPos;
layout(location = 2) in vec2 aUv;
uniform mat4 uP;
out vec3 vPos;
out vec2 vUv;
void main() { vPos = aPos; vUv = aUv; gl_Position = uP * vec4(aPos, 1.); }`;
const FS_COVER = HEAD + COMMON + `
in vec3 vPos;
in vec2 vUv;
uniform sampler2D uArt;
uniform float uCoat;
out vec4 o;
void main() {
  vec3 art = pow(texture(uArt, vUv).rgb, vec3(2.2));
  vec3 N = normalize(cross(dFdx(vPos), dFdy(vPos)));
  if (N.y > 0.) N = -N;
  vec3 V = vec3(0., -1., 0.);
  float F = .04 + .96 * pow(1. - max(dot(N, V), 0.), 5.);
  // a faint, broad sheen (the studio blurred by some degrees): never a band of the key strip laid across the art
  vec3 sheen = textureLod(uEnv, equi(reflect(-V, N)), 5.5).rgb * uGain.x;
  o = vec4(art + sheen * F * uCoat, 1.);
}`;
const FS_GLASS = HEAD + COMMON + `
in vec3 vPos;
in vec3 vNor;
in vec2 vUv;
uniform highp sampler2D uBack;
uniform sampler2D uArt;
uniform sampler2D uLightMap;   // Cycles' light on the glass (an image on the model's UVs)
uniform mat4 uP;
uniform vec2 uRes;
uniform mat4 uCovInv;          // root frame -> the cover's own (face y ~ 0, x across, z up)
uniform vec3 uCov;             // its half size, corner radius, side (Blender units)
uniform vec3 uAbsorb;          // what each unit of glass takes away, per channel
uniform float uLightRef;       // the level of the light map's brighter tenth
uniform vec4 uL1;              // the light pass: soft, band, lobe, middle
uniform vec4 uL2;              // spill, well, warmth, through
uniform float uMirror;
uniform vec2 uHot;             // the hot line: the radiance above which the studio stays sharp, and how strongly
uniform vec3 uTint;            // the album's colour
uniform vec3 uArtMean;         // the cover's mean colour (linear)
uniform vec4 uWells[3];        // the wells: centre (Blender X, Z), radius, -
uniform int uDbg;              // 1 what the front mirrors, 2 what comes through, 3 the bands (as build.py's 'bands')
out vec4 o;
vec3 bands(vec3 d) {
  float el = degrees(asin(clamp(normalize(uToWorld * d).z, -1., 1.)));
  if (el < -2.) return vec3(.02, .05, .25); if (el < 21.5) return vec3(0.); if (el < 24.5) return vec3(.9, .08, .05);
  if (el < 27.) return vec3(0.); if (el < 37.) return vec3(.1, .55, .1); if (el < 39.5) return vec3(0.);
  if (el < 42.5) return vec3(.9, .85, .1); if (el < 45.) return vec3(0.); if (el < 55.) return vec3(.1, .55, .1);
  if (el < 58.) return vec3(0.); return vec3(.9);
}

float rrect(vec2 q, float b, float r) { vec2 d = abs(q) - b + r; return length(max(d, 0.)) + min(max(d.x, d.y), 0.) - r; }
vec4 backAt(vec2 frag) { return texelFetch(uBack, ivec2(clamp(frag, vec2(0.), uRes - 1.)), 0); }
vec2 toFrag(vec3 p) { vec4 c = uP * vec4(p, 1.); return (c.xy / c.w * .5 + .5) * uRes; }

void main() {
  vec3 N = normalize(vNor);
  vec3 V = vec3(0., -1., 0.);
  if (dot(N, V) < 0.) N = -N;
  float ndv = max(dot(N, V), 0.);
  float F = .04 + .96 * pow(1. - ndv, 5.);
  // how fast the mirrored direction turns across this pixel (twice the normal's turn)
  float aR = 2. * max(length(dFdx(N)), length(dFdy(N)));
  vec3 R = reflect(-V, N);
  float rim = smoothstep(.55, .08, ndv);                 // 1 at the outline, where the glass turns right away
  float flank = smoothstep(.97, .45, ndv);               // 1 over the rolls' flanks, 0 where the glass faces the camera
  // (light pass) the same studio, blurred by a few degrees (more over the flanks): each roll's stack of thin strips
  // becomes one broad band (no lift in the dark band's middle, unlike mixing in the seen-through studio), mirrored
  // a little less strongly, and warmed
  float blur = uL1.x * (3. + 2. * flank);
  float lod0 = lodFor(aR, uEnvSize.x);
  vec3 refl = textureLod(uEnv, equi(R), lod0 + blur).rgb * uGain.x * uMirror;
  // ... and only the hottest strip kept sharp: one narrow, hot line along each roll
  if (uHot.x > 0.) refl += max(textureLod(uEnv, equi(R), lod0).rgb * uGain.x - uHot.x, 0.) * uHot.y;

  // into the glass, across it, out of its back (or back inside past the critical angle)
  vec3 T1 = refract(-V, N, 1. / 1.5);
  vec4 b0 = backAt(gl_FragCoord.xy);
  float thick = clamp(b0.w - vPos.y, 0., 3.);
  float tx = thick / max(T1.y, .25);
  vec4 b1 = backAt(toFrag(vPos + T1 * tx));
  if (b1.w < 100.) tx = clamp((b1.w - vPos.y) / max(T1.y, .25), 0., 4.);
  vec3 Nb = normalize(b1.w < 100. ? b1.xyz : b0.xyz);
  vec3 T2 = refract(T1, -Nb, 1.5);
  float aT = aR * .6 + .01;
  vec3 trans = dot(T2, T2) < 1e-4 ? envSoft(reflect(T1, -Nb), aT) : envSoft(T2, aT);
  // the art, where the ray inside meets the cover's face before it leaves (the ring of glass round the cover)
  vec3 q0 = (uCovInv * vec4(vPos, 1.)).xyz, dq = mat3(uCovInv) * T1;
  float ta = abs(dq.y) > 1e-4 ? -q0.y / dq.y : -1.;
  bool hitArt = false;
  if (ta > 0. && ta < tx) {
    vec3 q = q0 + dq * ta;
    if (rrect(q.xz, uCov.x, uCov.y) < 0.) {
      trans = pow(textureLod(uArt, (q.xz + uCov.x) / uCov.z, 1.5).rgb, vec3(2.2));
      tx = ta; hitArt = true;
    }
  }
  trans *= exp(-uAbsorb * tx);
  vec3 warm = mix(vec3(1., .80, .72), uTint, .35);               // peach, with a little of the album
  float low = smoothstep(.25, -.75, N.z);                         // faces turned down: where the floor's glow comes in
  refl *= mix(vec3(1.), warm / max(warm.r, max(warm.g, warm.b)), uL2.z);

  // ---- the light pass (all zero with light=0)
  vec3 Lc = texture(uLightMap, vUv).rgb / uLightRef;             // Cycles' light on this point of the glass
  float L = dot(Lc, vec3(.2126, .7152, .0722));
  vec3 lw = mix(Lc, L * warm, uL2.z);                             // the light, warmed
  // the straight-through middles darker (not where the art shows through)
  if (!hitArt) trans *= uL2.w * mix(1., uL1.w, (1. - flank));
  // what comes through the low faces warmed: the floor's glow, coral along the bottom and in the tail
  if (!hitArt) trans *= mix(vec3(1.), warm * 1.15, low * uL2.z * 1.6);
  // light gathered in the thick edges, glowing warm, most low down (the bottom, the tail), as the reference
  float edge = pow(rim, 2.2) * (1. - exp(-thick * 3.));
  vec3 band = warm * uL1.y * edge * (.3 + .7 * low) * (.5 + .5 * min(L, 1.5)) * .45;
  // warm light held inside the thick lobes, low down
  vec3 lobe = warm * uL1.z * low * (1. - exp(-thick * 1.5)) * (1. - rim) * .06;
  // the cover's colour carried into the glass round it
  vec3 qc = (uCovInv * vec4(vPos, 1.)).xyz;
  float dCov = rrect(qc.xz, uCov.x, uCov.y);
  vec3 spill = uArtMean * uL2.x * exp(-max(dCov, 0.) / .35) * (1. - exp(-thick * 3.)) * .5;
  // the wells' rims lit warm (most on the lower rim), their middles left dark
  vec3 wellLight = vec3(0.);
  for (int i = 0; i < 3; i++) {
    float r = length(vPos.xz - uWells[i].xy) / uWells[i].z;
    float ringW = exp(-pow((r - .94) / .09, 2.));
    float lowW = .3 + .7 * smoothstep(.2, -.8, (vPos.z - uWells[i].y) / uWells[i].z);
    wellLight += warm * ringW * lowW;
    if (r < .8) trans *= mix(1., .55, uL2.y);                    // the well's middle darker still
  }
  wellLight *= uL2.y * .35;
  vec3 col = refl * F + (trans + lobe + spill) * (1. - F) + band + wellLight;
  if (uDbg == 1) col = refl * F; else if (uDbg == 2) col = trans * (1. - F); else if (uDbg == 3) col = bands(R) * 4.;
  else if (uDbg == 4) col = band + wellLight + (lobe + spill) * (1. - F); else if (uDbg == 5) col = vec3(rim);
  else if (uDbg == 6) col = vec3(sin(normalize(uToWorld * R).z * 28.) > 0. ? .95 : .02) * 2.;   // as build.py's zebra
  o = vec4(col, 1.);
}`;
const VS_QUAD = HEAD + `
out vec2 vUv;
void main() { vec2 p = vec2((gl_VertexID & 1) * 2 - 1, (gl_VertexID >> 1) * 2 - 1); vUv = p * .5 + .5; gl_Position = vec4(p, 0., 1.); }`;
const FS_DOWN = HEAD + `precision highp sampler3D;
in vec2 vUv;
uniform sampler2D uHdr;
uniform vec2 uSrc;          // the supersampled buffer's size
uniform float uExposure;
uniform float uSS;
out vec4 o;
uniform highp sampler3D uTone;   // Blender's own view transform (AgX, the scene's look), baked by build.py's export
uniform vec3 uToneDom;           // its table size, the log2 range: lo, hi
vec3 view(vec3 v) {
  vec3 x = clamp((log2(max(v, vec3(1e-10))) - uToneDom.y) / (uToneDom.z - uToneDom.y), 0., 1.);
  return texture(uTone, (x * (uToneDom.x - 1.) + .5) / uToneDom.x).rgb;
}
vec4 tone(vec4 h) {
  if (h.a <= 0.) return vec4(0.);
  vec3 c = h.rgb / h.a;
  vec3 t = clamp(view(c * uExposure), 0., 1.);
  t = pow(t, vec3(2.2));                       // to linear for the averaging, back to the display's curve below
  return vec4(t * h.a, h.a);
}
void main() {
  // a tent two output pixels wide, nine bilinear taps over the supersampled buffer, each tap tone-mapped
  vec2 px = 1. / uSrc;
  vec4 acc = vec4(0.); float wsum = 0.;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    float w = (2. - abs(float(i))) * (2. - abs(float(j)));
    acc += tone(texture(uHdr, vUv + vec2(i, j) * px * uSS * .5)) * w; wsum += w;
  }
  acc /= wsum;
  vec3 c = acc.a > 0. ? pow(acc.rgb / acc.a, vec3(1. / 2.2)) : vec3(0.);
  o = vec4(c * acc.a, acc.a);
}`;

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
function target(w, h, filter) {
  const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
  for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, filter], [gl.TEXTURE_MAG_FILTER, filter], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
  const depth = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, depth);
  gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w, h);
  const fbo = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depth);
  const st = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  if (st !== gl.FRAMEBUFFER_COMPLETE) throw new Error('framebuffer incomplete ' + st);
  return { fbo, tex, w, h };
}

/* ---------------------------------------------------------------- the frame --- */
// Which part of the reference's frame (its pixels) the canvas shows, and at what size (CSS px).
function framing(meta) {
  if (Q.get('frame') === 'ref') return { css: [meta.W, meta.H], ref: [0, 0, meta.W, meta.H] };
  const K = 2.0619;                       // reference px per CSS px: the old stage's scale (the glass ~743 CSS px wide)
  const css = [Number(Q.get('w')) || 860, Number(Q.get('h')) || 400];
  const rw = css[0] * K, rh = css[1] * K;
  return { css, ref: [790 - rw / 2, 500 - rh / 2, rw, rh] };
}
// Orthographic, from the camera's side: root frame (X right, Y away, Z up) -> clip space, for the shown part.
function projection(meta, ref) {
  const [rx, ry, rw, rh] = ref, S = meta.S, near = -3, far = 4;
  const a = 2 / (S * rw), bx = 2 * (meta.CX - rx) / rw - 1;
  const c = 2 / (S * rh), by = 1 - 2 * (meta.CY - ry) / rh;
  const e = 2 / (far - near), bz = -2 * near / (far - near) - 1;
  return new Float32Array([a, 0, 0, 0, 0, 0, e, 0, 0, c, 0, 0, bx, by, bz, 1]);
}

/* ---------------------------------------------------------------------- main --- */
const state = { ready: false, frames: 0, cpuMs: 0, error: null, light: LIGHT };
window.__glass = state;

async function main() {
  const meta = await fetch(ASSETS + 'meta.json').then((r) => r.json());
  const lines = await fetch('/tools/mercury3d/lines.json').then((r) => r.json());
  const [glassBuf, coverBuf, envBuf, softBuf, lightBuf, toneBuf] = await Promise.all(['glass.bin', 'cover.bin', 'env.bin', 'env-soft.bin', 'light.bin', 'tone.bin']
    .map((f) => (f === 'light.bin' && !meta.light ? Promise.resolve(null) : fetchBin(ASSETS + f))));
  const art = await fetchImg(Q.get('art') || '/prototypes/mercury/covers/silver-current.jpg');

  const fr = framing(meta);
  const dpr = window.devicePixelRatio || 1;
  const CW = Math.round(fr.css[0] * dpr), CH = Math.round(fr.css[1] * dpr);
  const RW = CW * SS, RH = CH * SS;
  for (const c of [under, canvas, inkCanvas]) { c.width = CW; c.height = CH; c.style.width = fr.css[0] + 'px'; c.style.height = fr.css[1] + 'px'; }
  const P = projection(meta, fr.ref);

  // the glass
  const nv = meta.glass.verts, nt = meta.glass.tris;
  const pos = new Float32Array(glassBuf, 0, nv * 3), nor = new Float32Array(glassBuf, nv * 12, nv * 3);
  const uv = new Float32Array(glassBuf, nv * 24, nv * 2), idx = new Uint32Array(glassBuf, nv * 32, nt * 3);
  const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
  for (const [loc, data, n] of [[0, pos, 3], [1, nor, 3], [2, uv, 2]]) {
    const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, n, gl.FLOAT, false, 0, 0);
  }
  const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
  // the cover
  const cvao = gl.createVertexArray(); gl.bindVertexArray(cvao);
  const cb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, cb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(coverBuf), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 20, 0);
  gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 20, 12);
  gl.bindVertexArray(null);

  const envTex = halfTexture(meta.env[0], meta.env[1], new Uint16Array(envBuf), { mip: true, wrap: gl.REPEAT });
  const softTex = halfTexture(meta.envSoft[0], meta.envSoft[1], new Uint16Array(softBuf), { mip: true, wrap: gl.REPEAT });
  const lightTex = lightBuf ? halfTexture(meta.light[0], meta.light[1], new Uint16Array(lightBuf), { mip: true })
    : halfTexture(1, 1, new Uint16Array([15360, 15360, 15360, 15360]));
  // Blender's view transform, a 3D table
  const tn = meta.tone.n, toneTex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_3D, toneTex);
  gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA16F, tn, tn, tn, 0, gl.RGBA, gl.HALF_FLOAT, new Uint16Array(toneBuf));
  for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_3D, k, v);
  const artTex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, artTex);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, art);
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  // the cover's mean colour (linear), for its glow in the glass
  const sc = document.createElement('canvas'); sc.width = sc.height = 16;
  const sctx = sc.getContext('2d'); sctx.drawImage(art, 0, 0, 16, 16);
  const px = sctx.getImageData(0, 0, 16, 16).data; const artMean = [0, 0, 0];
  for (let i = 0; i < px.length; i += 4) for (let k = 0; k < 3; k++) artMean[k] += Math.pow(px[i + k] / 255, 2.2) / 256;

  const prog = { back: compile(VS_MESH, FS_BACK), cover: compile(VS_COVER, FS_COVER), glass: compile(VS_MESH, FS_GLASS), down: compile(VS_QUAD, FS_DOWN) };
  const back = target(RW, RH, gl.NEAREST), hdr = target(RW, RH, gl.LINEAR);
  const t = meta.tilt * Math.PI / 180, ct = Math.cos(t), st = Math.sin(t);
  const toWorld = new Float32Array([1, 0, 0, 0, ct, -st, 0, st, ct]);        // columns: Rx(-tilt)
  // Cycles' absorption: colour 1 - (1 - album) * .55, density .55, per Blender unit
  const absorb = meta.tint.map((c) => (1 - (1 - (1 - c) * 0.55)) * 0.55);
  // the wells (reference px: centre, radius) in the root's frame
  const WELLS = [[1077, 467, 58], [1237, 460, 82], [1392, 467, 58]].map(([u, v, r]) => [(u - meta.CX) * meta.S, (meta.CY - v) * meta.S, r * meta.S, 0]);

  const covInv = new Float32Array(16);                                       // (rows in the file; GL wants columns)
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) covInv[c * 4 + r] = meta.cover.inv[r][c];

  let unit = 0;
  const use = (pr) => { gl.useProgram(pr.p); unit = 0; return pr.u; };
  const tex = (loc, tx) => { if (loc == null) return; gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, tx); gl.uniform1i(loc, unit++); };
  const common = (u) => {
    gl.uniformMatrix3fv(u.uToWorld, false, toWorld); tex(u.uEnv, envTex); tex(u.uEnvSoft, softTex);
    gl.uniform2f(u.uEnvSize, meta.env[0], meta.envSoft[0]); gl.uniform2f(u.uGain, 2.0, 2.0);
  };

  function draw() {
    // 1. the back faces
    gl.bindFramebuffer(gl.FRAMEBUFFER, back.fbo); gl.viewport(0, 0, RW, RH);
    gl.clearColor(0, 0, 0, 1e4); gl.clearDepth(1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LESS); gl.enable(gl.CULL_FACE); gl.cullFace(gl.FRONT);
    let u = use(prog.back); gl.uniformMatrix4fv(u.uP, false, P);
    gl.bindVertexArray(vao); gl.drawElements(gl.TRIANGLES, nt * 3, gl.UNSIGNED_INT, 0);
    // 2. the cover
    gl.bindFramebuffer(gl.FRAMEBUFFER, hdr.fbo); gl.viewport(0, 0, RW, RH);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.disable(gl.CULL_FACE);
    u = use(prog.cover); common(u); gl.uniformMatrix4fv(u.uP, false, P); tex(u.uArt, artTex); gl.uniform1f(u.uCoat, Q.has('coat') ? Number(Q.get('coat')) : 0.006);   // (a faint, broad sheen)
    gl.bindVertexArray(cvao); gl.drawArrays(gl.TRIANGLES, 0, meta.cover.count);
    // 3. the glass's front faces
    gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK);
    u = use(prog.glass); common(u);
    gl.uniformMatrix4fv(u.uP, false, P); gl.uniform2f(u.uRes, RW, RH);
    tex(u.uBack, back.tex); tex(u.uArt, artTex); tex(u.uLightMap, lightTex);
    gl.uniformMatrix4fv(u.uCovInv, false, covInv);
    gl.uniform3f(u.uCov, meta.cover.half, meta.cover.corner, meta.cover.side);
    gl.uniform3fv(u.uAbsorb, absorb.map((a) => a * LIGHT.path)); gl.uniform1f(u.uLightRef, meta.lightRef || 1);
    gl.uniform4f(u.uL1, LIGHT.soft, LIGHT.band, LIGHT.lobe, LIGHT.middle);
    gl.uniform4f(u.uL2, LIGHT.spill, LIGHT.well, LIGHT.warmth, LIGHT.through); gl.uniform1f(u.uMirror, LIGHT.mirror); gl.uniform2f(u.uHot, LIGHT.hot, LIGHT.hotk);
    gl.uniform3fv(u.uTint, meta.tint); gl.uniform3fv(u.uArtMean, artMean);
    gl.uniform4fv(u.uWells, new Float32Array(WELLS.flat())); gl.uniform1i(u.uDbg, Number(Q.get('dbg')) || 0);
    gl.bindVertexArray(vao); gl.drawElements(gl.TRIANGLES, nt * 3, gl.UNSIGNED_INT, 0);
    // 4. down to the canvas, tone-mapped
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, CW, CH);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    u = use(prog.down); tex(u.uHdr, hdr.tex);
    gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_3D, toneTex); gl.uniform1i(u.uTone, unit++);
    gl.uniform3f(u.uToneDom, meta.tone.n, meta.tone.lo, meta.tone.hi); gl.uniform2f(u.uSrc, RW, RH); gl.uniform1f(u.uExposure, LIGHT.exposure); gl.uniform1f(u.uSS, SS);
    gl.bindVertexArray(null); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  await document.fonts.load('500 40px Montserrat');
  await document.fonts.load('300 40px Montserrat');
  await document.fonts.load('400 40px Montserrat');
  if (Q.get('pools') !== '0') drawPools(under.getContext('2d'), fr, CW / fr.ref[2], meta);
  if (Q.get('words') !== '0') drawWords(inkCanvas.getContext('2d'), fr, CW / fr.ref[2], lines, meta.tint);

  state.redraw = () => draw();
  state.setLight = (k, v) => { LIGHT[k] = v; draw(); };
  state.size = { css: fr.css, canvas: [CW, CH], render: [RW, RH], dpr, tris: nt };
  const CAP = Number(Q.get('fps')) || 0;
  const IDLE = Q.get('idle') === '1';
  let lastDraw = -1e9;
  const frame = () => {
    const t0 = performance.now();
    if (CAP && t0 - lastDraw < 1000 / CAP - 1.5) { requestAnimationFrame(frame); return; }
    lastDraw = t0;
    draw();
    state.cpuMs = state.cpuMs * 0.95 + (performance.now() - t0) * 0.05;
    state.frames++;
    if (!IDLE && !state.paused) requestAnimationFrame(frame);
  };
  // (the spike measures idle by pausing: nothing is drawn until resumed)
  state.resume = () => { if (state.paused) { state.paused = false; requestAnimationFrame(frame); } };
  draw(); gl.finish();
  state.ready = true;
  requestAnimationFrame(frame);
}

/* ------------------------------------------------------- the live 2D layers --- */
// The same words and controls as tools/mercury3d/overlay.js draws for the stills, at the reference's positions.
function drawWords(c, fr, k, L, tintIn) {
  const T = [1, 0.45, 0.4];
  const coral = (a) => `rgba(${Math.round(255 * T[0])},${Math.round(255 * (0.35 + 0.65 * T[1]))},${Math.round(255 * (0.3 + 0.7 * T[2]))},${a})`;
  c.setTransform(k, 0, 0, k, -fr.ref[0] * k, -fr.ref[1] * k);
  function fitText(txt, weight, x, baseline, width, colour, spacing) {
    let size = 40;
    for (let i = 0; i < 4; i++) {
      c.font = weight + ' ' + size + 'px Montserrat'; c.letterSpacing = (spacing || 0) * size + 'px';
      const m = c.measureText(txt); size *= width / (m.actualBoundingBoxRight + m.actualBoundingBoxLeft);
    }
    c.font = weight + ' ' + size + 'px Montserrat'; c.letterSpacing = (spacing || 0) * size + 'px';
    c.fillStyle = colour; c.fillText(txt, x, baseline); c.letterSpacing = '0px';
  }
  fitText('Silver Current', 500, 505, 468, 309, 'rgba(255,252,250,0.97)');
  fitText('Artist 02', 300, 507, 509, 127, 'rgba(236,226,224,0.66)');
  fitText('1:28', 400, 253, 638, 56, 'rgba(255,250,248,0.92)');
  fitText('−2:18', 400, 1288, 602, 69, 'rgba(255,250,248,0.92)');
  fitText('VOLUME', 500, 1248, 308, 70, 'rgba(245,238,236,0.8)', 0.12);
  const along = (pts, t) => { const n = pts.length - 1, i = Math.min(n - 1, Math.floor(t * n)), f = t * n - i; return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * f, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * f]; };
  function stroke(pts, t0, t1, width, style, blur, glow) {
    c.save(); c.lineCap = 'round'; c.lineJoin = 'round'; c.strokeStyle = style; c.lineWidth = width;
    if (blur) { c.shadowColor = glow; c.shadowBlur = blur * k; }
    c.beginPath();
    for (let i = 0; i <= 160; i++) { const p = along(pts, t0 + (t1 - t0) * i / 160); if (i) c.lineTo(p[0], p[1]); else c.moveTo(p[0], p[1]); }
    c.stroke(); c.restore();
  }
  function track(pts, t) {
    stroke(pts, t, 1, 3.0, 'rgba(205,198,198,0.5)');
    stroke(pts, 0, t, 13.0, 'rgba(40,14,16,0.35)', 10, 'rgba(20,6,8,0.6)');
    stroke(pts, 0, t, 9.0, coral(1), 18, coral(1));
    stroke(pts, 0, t, 4.0, 'rgba(255,250,246,1)');
  }
  function bead(p, r) {
    const g = c.createRadialGradient(p[0], p[1], r * 0.6, p[0], p[1], r * 3.2);
    g.addColorStop(0, coral(0.55)); g.addColorStop(1, coral(0));
    c.fillStyle = g; c.beginPath(); c.arc(p[0], p[1], r * 3.2, 0, 7); c.fill();
    c.fillStyle = 'rgba(255,250,246,1)'; c.beginPath(); c.arc(p[0], p[1], r, 0, 7); c.fill();
  }
  track(L.timeline, 0.4065); bead(along(L.timeline, 0.4065), 9);
  track(L.volume, 0.68); bead(along(L.volume, 0.68), 7.5);
  c.fillStyle = 'rgba(255,255,255,0.97)';
  const rr = (x, y, w, h, r) => { c.beginPath(); c.roundRect(x, y, w, h, r); c.fill(); };
  const tri = (ax, ay, bx, by, cx, cy) => { c.beginPath(); c.moveTo(ax, ay); c.lineTo(bx, by); c.lineTo(cx, cy); c.closePath(); c.fill(); };
  rr(1062, 452, 5, 32, 1.5); tri(1095, 452, 1095, 484, 1069, 468);
  rr(1215, 435, 13, 51, 2.5); rr(1241, 435, 13, 51, 2.5);
  rr(1403, 452, 5, 32, 1.5); tri(1375, 452, 1375, 484, 1401, 468);
  rr(1185, 312, 8, 14, 1); tri(1192, 312, 1204, 303, 1204, 335); tri(1192, 312, 1204, 335, 1192, 326);
  c.strokeStyle = 'rgba(255,255,255,0.95)'; c.lineWidth = 2.6; c.lineCap = 'round';
  for (const [r, a] of [[8, 0.75], [13, 0.8], [18, 0.85]]) { c.beginPath(); c.arc(1205, 319, r, -a, a); c.stroke(); }
}
// Soft warm pools where a floor would be, below the lobes (never a halo round the outline).
function drawPools(c, fr, k, meta) {
  c.setTransform(k, 0, 0, k, -fr.ref[0] * k, -fr.ref[1] * k);
  if (Q.get('bg') === 'ref') {
    // (for side-by-side pictures only) a dark warm backdrop like the reference's, as tools/mercury3d/compare.py lays
    c.save(); c.translate(793, 496); c.scale(0.7 * 1586, 0.8 * 992);
    const g = c.createRadialGradient(0, 0, 0, 0, 0, 1);
    g.addColorStop(0, 'rgb(27,15,17)'); g.addColorStop(1, 'rgb(15,8,10)');
    c.fillStyle = g; c.fillRect(-4, -4, 8, 8); c.restore();
  }
  const col = meta.tint.map((v, i) => Math.round(255 * (0.55 * v + 0.45 * [1, 0.62, 0.52][i])));
  for (const [u, v, rx, ry, a] of [[330, 790, 300, 46, 0.28], [1280, 712, 260, 40, 0.24], [820, 712, 200, 26, 0.10]]) {
    c.save(); c.translate(u, v); c.scale(1, ry / rx);
    const g = c.createRadialGradient(0, 0, 0, 0, 0, rx);
    g.addColorStop(0, `rgba(${col},${a})`); g.addColorStop(0.5, `rgba(${col},${a * 0.45})`); g.addColorStop(1, `rgba(${col},0)`);
    c.fillStyle = g; c.beginPath(); c.arc(0, 0, rx, 0, 7); c.fill(); c.restore();
  }
}

main().catch((e) => { state.error = String((e && e.stack) || e); console.error(e); });
