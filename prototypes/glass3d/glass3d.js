/**
 * Mercury as live 3D glass: the phase 2 spike (the owner, 17 November 2026).
 *
 * The same model as the Cycles proof (tools/blender/mercury_glass.py, exported with export=<folder>), drawn live in
 * WebGL2 and lit by the same studio, as a pair of light maps: the studio seen from the drop's middle, sharp (what the
 * glass mirrors and bends) and soft (what it scatters). Per frame:
 *   1. the background plate (the studio behind the drop, from the same camera);
 *   2. the glass's back faces: their normals and depth, for how thick the glass is and where a ray leaves it;
 *   3. the cover, a glossy picture in its pocket;
 *   4. the glass's front faces: the studio mirrored (Fresnel), and bent through two surfaces (into the front, out of
 *      the back face found in pass 2, or reflected back inside past the critical angle), tinted by the thickness it
 *      crossed; where the bent ray meets the art's plane inside the ring, the art seen through the glass;
 *   5. the same tone curve as Cycles (AgX, punchy look);
 * then the words, glyphs, timeline and volume on top (a 2D layer), as the live widget draws them.
 *
 *   /prototypes/glass3d/?assets=/design/captures/raw/blender/live/   (defaults to that)
 *   &light=0|1   the light pass toward the reference (1, the default) or the plain studio (0)
 *   &fps=60      draw at most 60 frames a second (the display's rate), for measuring
 * window.__glass: { ready, frames, cpuMs, setLight(k, v) } for the spike tool.
 */

const Q = new URLSearchParams(location.search);
const ASSETS = Q.get('assets') || '/design/captures/raw/blender/live/';
const INK = Q.get('ink') || '/design/captures/raw/blender/ink.png';
const LAYOUT = Q.get('layout') || '/design/captures/raw/blender/layout.json';

// The light pass toward the reference (the owner: broader, warmer, more luminous rims and lobes, fewer thin white
// lines, darker middles). 0 is the studio exactly as Cycles has it.
// soft: how much of what the glass mirrors comes from the soft map (fewer thin lines); band: a broad warm band of light
// along each rim, where the glass turns away; lobe: warm light held inside the glass, more where it is thick and low
// down; spill: the cover's colour carried into the glass round it; middle: how much of the studio the straight-through
// middles show (darker below 1).
const LIGHT = Q.get('light') === '0'
  ? { exposure: 1, soft: 0, band: 0, lobe: 0, spill: 0, middle: 1, absorb: 0.35 }
  : { exposure: 1.2, soft: 0.6, band: 1.0, lobe: 0.2, spill: 0.25, middle: 0.55, absorb: 0.6 };
for (const k of Object.keys(LIGHT)) if (Q.has(k)) LIGHT[k] = Number(Q.get(k));

const canvas = document.getElementById('gl');
const inkCanvas = document.getElementById('ink');
const gl = canvas.getContext('webgl2', { antialias: true, alpha: true, premultipliedAlpha: true });
if (!gl) throw new Error('WebGL2 is not available');
gl.getExtension('EXT_color_buffer_float');
gl.getExtension('EXT_color_buffer_half_float');

const fetchBin = (url) => fetch(url).then((r) => { if (!r.ok) throw new Error(url + ' ' + r.status); return r.arrayBuffer(); });
const fetchImg = (url) => new Promise((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => bad(new Error(url)); i.src = url; });

/* ------------------------------------------------------------------- shaders --- */
const HEAD = `#version 300 es
precision highp float;
precision highp sampler2D;
#define PI 3.14159265
`;
const ENV = `
uniform sampler2D uEnv;
uniform sampler2D uEnvSoft;
// The studio map: u = atan2(x, y) / 2pi + .5, v = asin(z) / pi + .5, in Blender's coordinates (x right, y in, z up).
vec2 envUV(vec3 d) { d = normalize(d); return vec2(atan(d.x, d.y) / (2. * PI) + .5, asin(clamp(d.z, -1., 1.)) / PI + .5); }
vec3 envSharp(vec3 d) { return textureLod(uEnv, envUV(d), 0.).rgb; }
vec3 envSoft(vec3 d) { return textureLod(uEnvSoft, envUV(d), 0.).rgb; }
`;
const VS_MESH = HEAD + `
in vec3 aPos;
in vec3 aNor;
uniform mat4 uVP;
out vec3 vPos;
out vec3 vNor;
void main() { vPos = aPos; vNor = aNor; gl_Position = uVP * vec4(aPos, 1.); }`;
const FS_BACK = HEAD + `
in vec3 vPos;
in vec3 vNor;
uniform vec3 uCamPos;
uniform vec3 uCamFwd;
out vec4 o;
void main() { o = vec4(normalize(vNor), dot(vPos - uCamPos, uCamFwd)); }`;
const VS_QUAD = HEAD + `
out vec2 vUv;
void main() { vec2 p = vec2((gl_VertexID & 1) * 2 - 1, (gl_VertexID >> 1) * 2 - 1); vUv = p * .5 + .5; gl_Position = vec4(p, 0., 1.); }`;
const FS_PLATE = HEAD + `
in vec2 vUv;
uniform sampler2D uPlate;
out vec4 o;
void main() { o = vec4(texture(uPlate, vUv).rgb, 1.); }`;
const VS_COVER = HEAD + `
in vec3 aPos;
in vec2 aUv;
uniform mat4 uVP;
out vec3 vPos;
out vec2 vUv;
void main() { vPos = aPos; vUv = aUv; gl_Position = uVP * vec4(aPos, 1.); }`;
const FS_COVER = HEAD + ENV + `
in vec3 vPos;
in vec2 vUv;
uniform sampler2D uArt;
uniform vec3 uCamPos;
uniform float uArtGain;
out vec4 o;
void main() {
  vec3 art = pow(texture(uArt, vUv).rgb, vec3(2.2));
  vec3 V = normalize(uCamPos - vPos), N = vec3(0., -1., 0.);
  float F = .04 + .96 * pow(1. - max(dot(N, V), 0.), 5.);
  o = vec4(art * uArtGain + envSharp(reflect(-V, N)) * F * .15, 1.);
}`;
const FS_GLASS = HEAD + ENV + `
in vec3 vPos;
in vec3 vNor;
uniform sampler2D uBack;
uniform sampler2D uArt;
uniform vec2 uRes;
uniform vec3 uCamPos;
uniform vec3 uCamFwd;
uniform mat4 uVP;
uniform float uS;
uniform vec4 uCov;      // the cover in stage units: centre x, y, half, corner radius
uniform vec3 uCov2;     // its turn, its squash, the art plane's y in Blender units
uniform float uArtGain;
uniform vec3 uTint;     // the glass's colour inside (what each unit of glass lets through)
uniform float uAbsorb;
uniform vec4 uLight;    // the light pass: soft, band, lobe, spill (see LIGHT)
uniform float uMiddle;  // how much of the studio the straight-through middles show
uniform vec3 uArtMean;  // the cover's colour
uniform vec3 uWarm;     // the album's warm colour
out vec4 o;

float rrect(vec2 q, vec2 b, float r) { vec2 d = abs(q) - b + r; return length(max(d, 0.)) + min(max(d.x, d.y), 0.) - r; }
// The art seen at a point of its plane (Blender coordinates), or nothing.
vec4 artAt(vec3 P) {
  vec2 st = vec2(P.x / uS + 430., 200. - P.z / uS) - uCov.xy;
  float c = cos(uCov2.x), s = sin(uCov2.x);
  vec2 q = vec2(st.x * c + st.y * s, -st.x * s + st.y * c);
  float d = rrect(q, vec2(uCov.z, uCov.z * uCov2.y), uCov.w);
  if (d > 0.) return vec4(0.);
  vec2 uv = vec2((q.x / uCov.z + 1.) * .5, 1. - (q.y / (uCov.z * uCov2.y) + 1.) * .5);
  return vec4(pow(texture(uArt, uv).rgb, vec3(2.2)) * uArtGain, 1.);
}
void main() {
  vec3 N = normalize(vNor);
  vec3 V = normalize(uCamPos - vPos);
  if (dot(N, V) < 0.) N = -N;
  float ndv = max(dot(N, V), 0.);
  float F = .04 + .96 * pow(1. - ndv, 5.);
  // What the front mirrors. (Light pass: part of it from the soft map, so fewer thin lines.)
  vec3 R = reflect(-V, N);
  float rim = smoothstep(.6, .1, ndv);
  vec3 refl = mix(envSharp(R), envSoft(R) * 1.6, uLight.x * (.5 + .5 * rim));
  // Into the glass, across it, out of the back face (or back inside past the critical angle).
  vec3 T1 = refract(-V, N, 1. / 1.5);
  vec4 b0 = texture(uBack, gl_FragCoord.xy / uRes);
  float dF = dot(vPos - uCamPos, uCamFwd);
  float thick = clamp(b0.w - dF, 0., 1.6);
  float tx = thick / max(dot(T1, uCamFwd), .3);
  vec3 P1 = vPos + T1 * tx;
  vec4 c1 = uVP * vec4(P1, 1.);
  vec4 b1 = texture(uBack, c1.xy / c1.w * .5 + .5);
  vec3 Nb = normalize(b1.xyz);
  vec3 T2 = refract(T1, -Nb, 1.5);
  vec3 trans;
  if (dot(T2, T2) < 1e-4) {
    // Past the critical angle: reflected back inside; it leaves later, softened by the bounce.
    trans = envSoft(reflect(T1, -Nb)) * .9;
  } else {
    trans = mix(envSharp(T2), envSoft(T2), .25);
  }
  // The art, where the ray inside meets its plane before it leaves (the ring of glass round the cover).
  float ta = (uCov2.z - vPos.y) / (abs(T1.y) > 1e-4 ? T1.y : 1e-4);
  if (ta > 0. && ta < tx) { vec4 a = artAt(vPos + T1 * ta); trans = mix(trans, a.rgb, a.a); tx = ta; }
  trans *= exp(-uAbsorb * (vec3(1.) - uTint) * tx);
  // (Light pass.) The straight-through middles darker.
  trans *= mix(uMiddle, 1., rim);
  // Warm light held inside the glass: more where it is thick (the lobes), more low down, where the floor's glow comes up.
  float low = .45 + .55 * smoothstep(.2, -.7, N.z);
  // (Peach, with only a little of the album in it: the reference's lobes are silver-peach, coral only as an accent.)
  vec3 peach = mix(vec3(1., .86, .8), uWarm, .3);
  vec3 lobe = peach * uLight.z * (1. - exp(-thick * 2.2)) * low;
  // The cover's colour carried into the glass round it, fading over some 50 units.
  vec2 st = vec2(vPos.x / uS + 430., 200. - vPos.z / uS) - uCov.xy;
  float cc = cos(uCov2.x), sc = sin(uCov2.x);
  float dCov = rrect(vec2(st.x * cc + st.y * sc, -st.x * sc + st.y * cc), vec2(uCov.z, uCov.z * uCov2.y), uCov.w);
  vec3 spill = mix(vec3(dot(uArtMean, vec3(.2126, .7152, .0722))), uArtMean, .6) * uLight.w * exp(-max(dCov, 0.) / 50.) * (1. - exp(-thick * 3.));
  // One broad warm band along each rim, where the glass turns away.
  vec3 band = mix(vec3(1., .9, .85), uWarm, .3) * uLight.y * pow(rim, 1.6) * (.6 + .4 * smoothstep(.0, .8, -N.z + .3));
  o = vec4(refl * F + (trans + lobe + spill) * (1. - F) + band, 1.);
}`;
const FS_TONE = HEAD + `
in vec2 vUv;
uniform sampler2D uHdr;
uniform float uExposure;
out vec4 o;
// AgX, as Blender's (minimal approximation), with the punchy look.
vec3 contrast(vec3 x) { vec3 x2 = x * x, x4 = x2 * x2;
  return 15.5 * x4 * x2 - 40.14 * x4 * x + 31.96 * x4 - 6.868 * x2 * x + .4298 * x2 + .1191 * x - .00232; }
vec3 agx(vec3 v) {
  const mat3 m = mat3(.842479062253094, .0423282422610123, .0423756549057051, .0784335999999992, .878468636469772, .0784336,
                      .0792237451477643, .0791661274605434, .879142973793104);
  const float lo = -12.47393, hi = 4.026069;
  v = clamp(log2(max(m * v, vec3(1e-10))), lo, hi);
  return contrast((v - lo) / (hi - lo));
}
vec3 agxOut(vec3 v) {
  const mat3 mi = mat3(1.19687900512017, -.0528968517574562, -.0529716355144438, -.0980208811401368, 1.15190312990417,
                       -.0980434501171241, -.0990297440797205, -.0989611768448433, 1.15107367264116);
  return mi * v;
}
vec3 punchy(vec3 v) { float l = dot(v, vec3(.2126, .7152, .0722)); v = pow(max(v, 0.), vec3(1.35)); return l + 1.4 * (v - l); }
void main() {
  vec4 h = texture(uHdr, vUv);
  vec3 c = agxOut(punchy(agx(h.rgb * uExposure)));
  o = vec4(clamp(c, 0., 1.), 1.);
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
  for (let i = 0; i < n; i++) { const a = gl.getActiveUniform(p, i); u[a.name] = gl.getUniformLocation(p, a.name); }
  return { p, u };
}

function halfTexture(w, h, data, filter = gl.LINEAR, wrapS = gl.CLAMP_TO_EDGE) {
  const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, data);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrapS); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return t;
}
function target(w, h) {
  const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
  for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
  const depth = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, depth);
  gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w, h);
  const fbo = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depth);
  return { fbo, tex, w, h };
}

/* -------------------------------------------------------------------- camera --- */
// Blender's camera: world matrix, lens, sensor width (horizontal fit), lens shift (in units of the frame's width).
function cameraMatrices(cam, W, H) {
  const m = cam.matrix;                     // rows
  const pos = [m[0][3], m[1][3], m[2][3]];
  const fwd = [-m[0][2], -m[1][2], -m[2][2]];
  const R = [[m[0][0], m[0][1], m[0][2]], [m[1][0], m[1][1], m[1][2]], [m[2][0], m[2][1], m[2][2]]];
  // View: the inverse of the camera's world matrix (a rotation and a translation), column-major.
  const t = [0, 1, 2].map((r) => -(R[0][r] * pos[0] + R[1][r] * pos[1] + R[2][r] * pos[2]));
  const view = [R[0][0], R[0][1], R[0][2], 0, R[1][0], R[1][1], R[1][2], 0, R[2][0], R[2][1], R[2][2], 0, t[0], t[1], t[2], 1];
  // view[col*4+row]: row r of the view's rotation is column r of R.
  const V = new Float32Array(16);
  for (let r = 0; r < 3; r++) { for (let c = 0; c < 3; c++) V[c * 4 + r] = R[c][r]; V[12 + r] = t[r]; }
  V[15] = 1;
  const aspect = W / H, tx = (cam.sensor / 2) / cam.lens, ty = tx / aspect;
  const n = cam.clip[0], f = cam.clip[1];
  const P = new Float32Array([1 / tx, 0, 0, 0, 0, 1 / ty, 0, 0, 2 * cam.shift[0], 2 * cam.shift[1] * aspect, -(f + n) / (f - n), -1, 0, 0, -2 * f * n / (f - n), 0]);
  const VP = new Float32Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += P[k * 4 + r] * V[c * 4 + k]; VP[c * 4 + r] = s; }
  return { VP, pos, fwd };
}
const project = (VP, p, W, H) => {
  const x = VP[0] * p[0] + VP[4] * p[1] + VP[8] * p[2] + VP[12], y = VP[1] * p[0] + VP[5] * p[1] + VP[9] * p[2] + VP[13], w = VP[3] * p[0] + VP[7] * p[1] + VP[11] * p[2] + VP[15];
  return [(x / w * 0.5 + 0.5) * W, (1 - (y / w * 0.5 + 0.5)) * H];
};

/* ---------------------------------------------------------------------- main --- */
const state = { ready: false, frames: 0, cpuMs: 0, error: null };
window.__glass = state;

async function main() {
  const meta = await fetch(ASSETS + 'meta.json').then((r) => r.json());
  const lay = await fetch(LAYOUT).then((r) => r.json());
  const [glassBuf, plateBuf, envBuf, softBuf, ink] = await Promise.all([
    fetchBin(ASSETS + 'glass.bin'), fetchBin(ASSETS + 'plate.bin'), fetchBin(ASSETS + 'env.bin'), fetchBin(ASSETS + 'env-soft.bin'), fetchImg(INK)]);
  const artUrl = Q.get('art') || '/prototypes/mercury/covers/silver-current.jpg';
  const art = await fetchImg(artUrl);

  const W = meta.res[0], H = meta.res[1];
  const scale = Number(Q.get('scale')) || 1;
  const CW = Math.round(W * scale), CH = Math.round(H * scale);
  canvas.width = CW; canvas.height = CH; canvas.style.width = CW / devicePixelRatio + 'px'; canvas.style.height = CH / devicePixelRatio + 'px';
  inkCanvas.width = CW; inkCanvas.height = CH; inkCanvas.style.width = canvas.style.width; inkCanvas.style.height = canvas.style.height;

  // The glass mesh.
  const nv = meta.glass.verts, nt = meta.glass.tris;
  const pos = new Float32Array(glassBuf, 0, nv * 3), nor = new Float32Array(glassBuf, nv * 12, nv * 3), idx = new Uint32Array(glassBuf, nv * 24, nt * 3);
  const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
  const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, pos, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
  const nb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, nb); gl.bufferData(gl.ARRAY_BUFFER, nor, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
  const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);

  // The cover's face: a fan round its middle.
  const cp = meta.cover.pts, cu = meta.cover.uv;
  const mid = cp.reduce((a, p) => a.map((v, i) => v + p[i] / cp.length), [0, 0, 0]);
  const cdata = []; const push = (p, uv) => cdata.push(p[0], p[1], p[2], uv[0], uv[1]);
  for (let i = 0; i < cp.length; i++) { const j = (i + 1) % cp.length; push(mid, [0.5, 0.5]); push(cp[i], cu[i]); push(cp[j], cu[j]); }
  const cvao = gl.createVertexArray(); gl.bindVertexArray(cvao);
  const cb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, cb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(cdata), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 20, 0);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 20, 12);
  gl.bindVertexArray(null);

  const plateTex = halfTexture(meta.plate[0], meta.plate[1], new Uint16Array(plateBuf));
  const envTex = halfTexture(meta.env[0], meta.env[1], new Uint16Array(envBuf), gl.LINEAR, gl.REPEAT);
  const softTex = halfTexture(meta.envSoft[0], meta.envSoft[1], new Uint16Array(softBuf), gl.LINEAR, gl.REPEAT);
  const artTex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, artTex);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, art);
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);

  const P = {
    back: compile(VS_MESH, FS_BACK), plate: compile(VS_QUAD, FS_PLATE), cover: compile(VS_COVER, FS_COVER),
    glass: compile(VS_MESH, FS_GLASS), tone: compile(VS_QUAD, FS_TONE),
  };
  const back = target(CW, CH), hdr = target(CW, CH);
  const cam = cameraMatrices(meta.camera, W, H);
  const cov = lay.L.cover, S = meta.S;
  const artY = meta.cover.pts[0][1];
  const pal = lay.pal.a; const warm = pal.map((c, i) => 0.6 * c + 0.4 * [1, 0.62, 0.5][i]);
  const ART_GAIN = Number(Q.get('artgain')) || 1.6;
  const artMean = pal.map((c) => Math.pow(Math.max(c, 0), 2.2) * 1.4);   // (palette A is the cover's own leading colour)

  let unit = 0;
  const use = (prog) => { gl.useProgram(prog.p); unit = 0; return prog.u; };
  const tex = (loc, t) => { if (loc == null) return; gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t); gl.uniform1i(loc, unit++); };
  const bind = (t) => { gl.bindFramebuffer(gl.FRAMEBUFFER, t ? t.fbo : null); gl.viewport(0, 0, CW, CH); };

  function draw() {
    // 2. The back faces.
    bind(back); gl.clearColor(0, 0, 0, 1e4); gl.clearDepth(1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LESS); gl.enable(gl.CULL_FACE); gl.cullFace(gl.FRONT);
    let u = use(P.back); gl.uniformMatrix4fv(u.uVP, false, cam.VP); gl.uniform3fv(u.uCamPos, cam.pos); gl.uniform3fv(u.uCamFwd, cam.fwd);
    gl.bindVertexArray(vao); gl.drawElements(gl.TRIANGLES, nt * 3, gl.UNSIGNED_INT, 0);
    // 1. The plate.
    bind(hdr); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE);
    u = use(P.plate); tex(u.uPlate, plateTex); gl.bindVertexArray(null); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    // 3. The cover.
    gl.enable(gl.DEPTH_TEST);
    u = use(P.cover); gl.uniformMatrix4fv(u.uVP, false, cam.VP); gl.uniform3fv(u.uCamPos, cam.pos); gl.uniform1f(u.uArtGain, ART_GAIN);
    tex(u.uArt, artTex); tex(u.uEnv, envTex); tex(u.uEnvSoft, softTex);
    gl.bindVertexArray(cvao); gl.drawArrays(gl.TRIANGLES, 0, cdata.length / 5);
    // 4. The glass's front faces.
    gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK);
    u = use(P.glass);
    gl.uniformMatrix4fv(u.uVP, false, cam.VP); gl.uniform3fv(u.uCamPos, cam.pos); gl.uniform3fv(u.uCamFwd, cam.fwd);
    gl.uniform2f(u.uRes, CW, CH); gl.uniform1f(u.uS, S);
    gl.uniform4f(u.uCov, cov.c[0], cov.c[1], cov.half, cov.r); gl.uniform3f(u.uCov2, cov.rot, cov.squash, artY);
    gl.uniform1f(u.uArtGain, ART_GAIN); gl.uniform3f(u.uTint, 1.0, 0.86, 0.82); gl.uniform1f(u.uAbsorb, LIGHT.absorb);
    gl.uniform4f(u.uLight, LIGHT.soft, LIGHT.band, LIGHT.lobe, LIGHT.spill); gl.uniform1f(u.uMiddle, LIGHT.middle);
    gl.uniform3fv(u.uArtMean, artMean);
    gl.uniform3fv(u.uWarm, warm);
    tex(u.uBack, back.tex); tex(u.uArt, artTex); tex(u.uEnv, envTex); tex(u.uEnvSoft, softTex);
    gl.bindVertexArray(vao); gl.drawElements(gl.TRIANGLES, nt * 3, gl.UNSIGNED_INT, 0);
    // 5. The tone curve, to the canvas.
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE);
    bind(null); u = use(P.tone); tex(u.uHdr, hdr.tex); gl.uniform1f(u.uExposure, LIGHT.exposure);
    gl.bindVertexArray(null); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  // The 2D layer on top: the words and glyphs (the prototype's own label sheet), the timeline and volume, their beads.
  (function drawInk() {
    const c = inkCanvas.getContext('2d');
    const f = CW / 1586, k = 2.0619 * f;
    const sx = (x) => (40 + (x - 58) * 2.0619) * f, sy = (y) => (477 + (y - 196) * 2.0619) * f;
    // The label sheet as a white mask, without the beads' glyphs (the beads are in).
    const m = document.createElement('canvas'); m.width = ink.width; m.height = ink.height;
    const mc = m.getContext('2d'); mc.drawImage(ink, 0, 0);
    const id = mc.getImageData(0, 0, m.width, m.height);
    for (let i = 0; i < id.data.length; i += 4) {
      const x = ((i / 4) % m.width) / (m.width / 860);
      const a = x > 790 ? 0 : id.data[i];
      id.data[i] = 255; id.data[i + 1] = 249; id.data[i + 2] = 246; id.data[i + 3] = a;
    }
    mc.putImageData(id, 0, 0);
    const dx = sx(0), dy = sy(0), dw = 860 * k, dh = 400 * k;
    // The glass behind the words calm and a little darker: a soft shade round the letters.
    c.save(); c.filter = `blur(${7 * f}px)`; c.globalAlpha = 0.45;
    const sh = document.createElement('canvas'); sh.width = m.width; sh.height = m.height;
    const shc = sh.getContext('2d'); shc.drawImage(m, 0, 0); shc.globalCompositeOperation = 'source-in'; shc.fillStyle = '#000'; shc.fillRect(0, 0, sh.width, sh.height);
    for (let i = 0; i < 3; i++) c.drawImage(sh, dx, dy, dw, dh);
    c.restore();
    c.drawImage(m, dx, dy, dw, dh);
    // The lines, projected from the model.
    const L = meta.lines;
    const line = (o, width, color, glow) => {
      if (!o) return;
      const pts = o.pts.map((p) => project(cam.VP, p, CW, CH));
      c.save(); c.lineCap = 'round'; c.lineJoin = 'round'; c.strokeStyle = color; c.lineWidth = width; c.shadowColor = glow || 'transparent'; c.shadowBlur = glow ? 10 * f : 0;
      c.beginPath(); pts.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); c.stroke(); c.restore();
    };
    const hot = `rgb(${warm.map((v) => Math.round(255 * Math.min(1, 0.45 + 0.55 * v))).join(',')})`;
    const glow = `rgba(${warm.map((v) => Math.round(255 * v)).join(',')},0.9)`;
    line(L.MercurySeekRest, 2.0 * f, 'rgba(200,192,192,0.55)');
    line(L.MercuryVolRest, 2.0 * f, 'rgba(200,192,192,0.55)');
    line(L.MercurySeekPlayed, 3.4 * f, hot, glow);
    line(L.MercuryVolPlayed, 3.4 * f, hot, glow);
    for (const b of [L.MercurySeekBead, L.MercuryVolBead]) {
      if (!b) continue;
      const p = project(cam.VP, b.at, CW, CH), r = Math.max(4, b.radius / S * k * 0.75);
      c.save(); c.fillStyle = '#fffaf7'; c.shadowColor = 'rgba(255,240,235,0.9)'; c.shadowBlur = 12 * f;
      c.beginPath(); c.arc(p[0], p[1], r, 0, Math.PI * 2); c.fill(); c.restore();
    }
  })();

  state.setLight = (k, v) => { LIGHT[k] = v; };
  state.ready = true;
  let last = performance.now();
  // &fps=N caps the drawing at N a second (the live widget draws no faster than the display); without it, every frame.
  const CAP = Number(Q.get('fps')) || 0;
  let lastDraw = -1e9;
  const frame = () => {
    const t0 = performance.now();
    if (CAP && t0 - lastDraw < 1000 / CAP - 1.5) { requestAnimationFrame(frame); return; }
    lastDraw = t0;
    draw();
    state.cpuMs = state.cpuMs * 0.95 + (performance.now() - t0) * 0.05;
    state.frames++;
    last = t0;
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

main().catch((e) => { state.error = String(e && e.stack || e); console.error(e); });
