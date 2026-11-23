/**
 * The kiln: bakes frosted Mercury glass.
 *
 * Glass light doesn't change from frame to frame, so it is worked out once. A surface is a short
 * list of soft-joined rounded boxes; one fragment shader turns their exact distance field into a
 * rolled edge and lights it, and the result goes to the page as a finished bitmap. Nothing here
 * runs again until a size or the album's colours change. One WebGL2 context, drawn on demand.
 */

const VERT = `#version 300 es
void main() { gl_Position = vec4(vec2(gl_VertexID & 1, gl_VertexID >> 1) * 4. - 1., 0., 1.); }`;

const FRAG = `#version 300 es
precision highp float;
uniform vec2 uSize;            // bitmap size, device pixels
uniform float uPx;             // device pixels per CSS pixel
uniform int uMode, uCount;     // 0 glass, 1 the room, 2 a bowl
uniform vec4 uBox[16];         // centre x, y, half width, half height
uniform vec4 uOpt[16];         // corner radius, kind (0 glass, 1 hole, 2 recess), blend width
uniform vec3 uA, uB, uC;       // the cover's primary, secondary and deep colours
uniform vec3 uA2, uB2, uC2;    // the next cover's, while its colour pours in
uniform vec3 uPour;            // where the dye starts (x, y) and how far it has reached (0: no pour)
uniform vec4 uLook;            // rim radius, body opacity, heat (bowls) or drift (room), seed
uniform vec2 uMelt;            // a surface that melts away downward: where it starts and ends, px from the bottom
out vec4 o;

float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) { float v = 0., a = .5; for (int i = 0; i < 4; i++) { v += a * noise(p); p = p * 2.03 + 17.; a *= .5; } return v; }
float sq(float x) { return x * x; }
float box(vec2 p, vec4 b, float r) { vec2 q = abs(p - b.xy) - b.zw + r; return length(max(q, 0.)) + min(max(q.x, q.y), 0.) - r; }
// A smooth minimum: where two forms meet they flow together, which is what makes glass look poured.
float smin(float a, float b, float k) { float h = max(k - abs(a - b), 0.) / max(k, 1e-4); return min(a, b) - h * h * k * .25; }

// Distances to the glass (holes cut out), to the nearest hole, and to the nearest recess.
vec3 scene(vec2 p) {
  float body = 1e5, hole = 1e5, dent = 1e5;
  for (int i = 0; i < uCount; i++) {
    float d = box(p, uBox[i], uOpt[i].x);
    if (uOpt[i].y < .5) body = smin(body, d, uOpt[i].z);
    else if (uOpt[i].y < 1.5) hole = min(hole, d);
    else dent = min(dent, d);
  }
  return vec3(max(body, -hole), hole, dent);
}

// The palette at a point: the old cover's, or the new one's where the dye has reached. The front
// runs ahead along thick rims and wavers a little, and glows where it is passing.
void palette(vec2 p, float rim, out vec3 A, out vec3 B, out vec3 C, out float lead) {
  A = uA; B = uB; C = uC; lead = 0.;
  if (uPour.z <= 0.) return;
  float reach = length(p - uPour.xy) - rim * 110. * uPx + (fbm(p * .012 / uPx + uLook.w) - .5) * 90. * uPx;
  float k = 1. - smoothstep(uPour.z - 90. * uPx, uPour.z, reach);
  A = mix(uA, uA2, k); B = mix(uB, uB2, k); C = mix(uC, uC2, k);
  lead = exp(-sq((reach - uPour.z + 30. * uPx) / (34. * uPx)));
}

vec4 glass(vec2 p) {
  vec3 s = scene(p);
  float d = s.x, R = uLook.x, inside = -d;
  vec2 g = normalize(vec2(scene(p + vec2(1, 0)).x - scene(p - vec2(1, 0)).x, scene(p + vec2(0, 1)).x - scene(p - vec2(0, 1)).x) + 1e-5);
  float up = smoothstep(-.15, .85, -g.y), down = smoothstep(-.15, .85, g.y);   // which way the nearest edge faces
  float t = clamp(inside / R, 0., 1.);
  float z = sqrt(1. - (1. - t) * (1. - t));                                     // a quarter-round roll at the edge
  vec3 N = normalize(vec3(g * (1. - t) * 1.2, z + .12));
  vec3 A, B, C; float lead;
  palette(p, 1. - t, A, B, C, lead);

  float low = smoothstep(-R * 3.2, 0., scene(p + vec2(0., R * 1.5)).x);         // nearing a lower edge
  float fine = clamp(R / (18. * uPx), .45, 1.3);                                // thicker glass, stronger edge light
  float thick = smoothstep(20., 34., R / uPx);                                  // the ribbon: glass you could hold
  float uneven = .5 + fbm(vec2(p.x * .006, p.y * .009) / uPx + uLook.w * 2.);   // light along an edge is never even
  float high = smoothstep(-R * 5., 0., scene(p - vec2(0., R * 2.5)).x);         // under an upper shoulder
  float veins = pow(fbm(vec2(p.x * .0035, p.y * .011) / uPx + uLook.w), 2.);    // light caught inside the glass
  vec3 tint = mix(A, B, clamp(.5 + .45 * sin(p.x * .0016 / uPx + uLook.w * 6.) + (veins - .25) * .6, 0., 1.));

  // 1 light carried inside, rising toward lower edges   2 one broad satin sheen on upper shoulders
  // 3 a crisp hot line on top edges, darker glass inside it   4 a brighter, warmer roll along the bottom
  float sheen = pow(max(dot(N, normalize(vec3(-.42, -.78, .46))), 0.), 4.) * (1. - t * .4);
  float hot = up * exp(-sq((inside - 1.3 * uPx) / (mix(.9, 1.5, thick) * uPx)));
  float dark = up * smoothstep(1.5 * uPx, 4. * uPx, inside) * (1. - smoothstep(4. * uPx, R, inside));
  float roll = down * (1. - smoothstep(0., R * .8, inside));
  float core = down * exp(-sq((inside - mix(2.2, 4.2, thick) * uPx) / (mix(1.6, 2.5, thick) * uPx)));
  float inner = exp(-sq((inside - R) / (1.6 * uPx)));                           // where the roll meets the flat: the glass's thickness
  float f = fbm(vec2(p.x * .0016, p.y * .0065) / uPx + uLook.w * 3.);
  float caustic = pow(1. - abs(2. * f - 1.), 5.) * low * smoothstep(20., 30., R / uPx);   // a few soft threads of light low in thick glass
  vec3 c = (C * .46 + vec3(.082, .066, .07)) * (.6 + .26 * z) * mix(1., .78, thick * (1. - low))   // lifted rose-grey, never black
    + tint * (low * .33 + veins * .15 * (.35 + low)) * (1. + uLook.z) + tint * uLook.z * .2   // uLook.z: a lit pill's extra glow
    + tint * roll * (.8 + .2 * thick) * fine + vec3(1., .94, .9) * core * .8 * fine * fine * uneven
    + vec3(1., .9, .84) * hot * .72 * fine * (1. + .5 * thick) * uneven
    + vec3(1.) * sheen * (.08 + .2 * high) * fine * (1. + thick)
    + mix(tint, vec3(1.), .2) * caustic * .13
    + (vec3(1., .93, .9) * up * .09 + tint * down * .3) * inner * fine
    + mix(tint, vec3(1.), .5) * lead * .5
    - dark * .2;
  float a = mix(uLook.y, .97, max((1. - smoothstep(0., R * .6, inside)) * .7, roll));

  if (s.z < 0.) {                                                               // a recess: thinner, darker glass
    float deep = smoothstep(0., 2. * uPx, -s.z);
    float above = scene(p - vec2(0., 5. * uPx)).z, below = scene(p + vec2(0., 5. * uPx)).z;
    c = mix(c, c * .42 + C * .06, deep * .85);
    c -= .12 * deep * smoothstep(-5. * uPx, 0., above);                         // its upper wall in shadow
    c += tint * .5 * deep * smoothstep(-5. * uPx, 0., below) + vec3(1., .93, .88) * .5 * exp(-sq((-s.z - 1.2 * uPx) / uPx)) * smoothstep(-6. * uPx, 0., below);
    a = mix(a, max(a, .9), deep);
  }

  // Outside: a bloom under the lower roll and a soft shadow on the room. In a hole: the pocket's
  // shadow and contact line over whatever sits in it (the cover, which stays crisp underneath).
  vec4 outside;
  if (s.y < 0.) {
    float w = -s.y;
    outside = vec4(0., 0., 0., .5 * exp(-w / (7. * uPx)) + .65 * exp(-sq(w / (1.1 * uPx))));
  } else {
    float od = max(d, 0.);
    float bloom = (down * exp(-od / (9. * uPx)) * .5 + exp(-od / (22. * uPx)) * .08) * (1. + thick);
    float shadow = .3 * exp(-max(scene(p - vec2(0., 7. * uPx)).x, 0.) / (12. * uPx));
    outside = vec4(tint * bloom, clamp(bloom * .7 + shadow, 0., 1.));
  }
  return mix(outside, vec4(c * a, a), clamp(.5 - d, 0., 1.));
}

// A bowl: a deep round dish. Dark inside, a coral crescent on the rim (strongest low), a silver
// highlight upper left, a warm glow low inside. Heat (hover, press) makes rim and glow hotter.
vec4 bowl(vec2 p) {
  float r = uBox[0].z, heat = uLook.z, rimW = .17;
  vec2 q = (p - uBox[0].xy) / r;
  float l = length(q), d = (l - 1.) * r;
  vec2 g = q / max(l, 1e-4);
  float down = smoothstep(-.3, 1., g.y), up = smoothstep(-.2, 1., -g.y);
  vec3 A, B, C; float lead;
  palette(p, 0., A, B, C, lead);
  vec3 tint = mix(A, B, .5 + .5 * g.x * .6);
  float tt = clamp((1. - l) / rimW, 0., 1.), ring = sin(tt * 3.14159);          // the rim's roll
  float inner = l / (1. - rimW);                                                // 0 centre .. 1 foot of the rim
  float well = 1. - smoothstep(.9, 1.02, inner);
  vec3 c = (C * .3 + vec3(.06, .05, .055)) * (.5 + .5 * ring)                   // the rim
    + tint * ring * (.17 + .9 * down * down) * (1. + heat * .8)
    + vec3(1.) * ring * pow(max(dot(g, normalize(vec2(-.62, -.78))), 0.), 6.) * .5
    + vec3(1., .92, .86) * up * exp(-sq((-d - 1.2 * uPx) / (.9 * uPx))) * .3
    + vec3(1., .94, .9) * down * down * exp(-sq((-d - 2. * uPx) / (1.4 * uPx))) * (.4 + .5 * heat);
  vec3 dish = (C * .16 + vec3(.022, .016, .018)) * mix(.5, 1., smoothstep(-.9, .3, q.y))   // the rim shades the top of the dish
    + tint * smoothstep(-.1, 1., q.y) * smoothstep(.35, 1., inner) * (.32 + .55 * heat)
    + tint * heat * .1;
  c = mix(c, dish, well);
  float bloom = down * exp(-max(d, 0.) / (8. * uPx)) * (.4 + .5 * heat) + exp(-max(d, 0.) / (20. * uPx)) * .06 * (1. + heat);
  float shadow = .34 * exp(-max((length(q - vec2(0., .1)) - 1.) * r, 0.) / (9. * uPx));
  return mix(vec4(tint * bloom, clamp(bloom * .7 + shadow, 0., 1.)), vec4(c * .96, .96), clamp(.5 - d, 0., 1.));
}

// The room behind everything: a dark, warm ground with slow wisps of the cover's colour, and the
// window's own rim of light hugging its edge.
vec4 room(vec2 p) {
  vec3 A, B, C; float lead;
  palette(p, 0., A, B, C, lead);
  vec2 u = p / uSize.y;
  float tm = uLook.z, seed = uLook.w;
  vec2 warp = vec2(fbm(u * 1.2 + vec2(tm * .020, 0.) + seed), fbm(u * 1.2 + vec2(5.2, tm * .016) + seed));
  float w1 = smoothstep(.3, .8, fbm(u * vec2(.9, 2.) + warp * 1.9));                 // broad veils
  float f = fbm(u * vec2(1.6, .9) + warp.yx * 2.6 + 9.);
  float w2 = pow(1. - abs(2. * f - 1.), 3.5) * smoothstep(.2, .7, w1 + .25);         // soft currents of light riding them
  vec3 c = C * .2 + vec3(.022, .014, .016) + A * w1 * .13 + mix(A, B, .5) * w2 * .26 + mix(A, vec3(1.), .4) * lead * .12;
  c *= mix(1.1, .6, smoothstep(.1, 1.15, length((p - uSize * vec2(.5, .66)) / uSize.y)));
  // The window's rim: a hot line on the edge and light gathering inside it, most along the bottom.
  vec4 edge = vec4(p.x, uSize.x - p.x, p.y, uSize.y - p.y) / uPx;                    // left, right, top, bottom
  float along = fbm(vec2(u.x * 3., seed * 3.)), up = fbm(vec2(u.y * 3., seed * 5.));  // the rim is never even
  vec3 tint = mix(A, B, .5 + .5 * sin(u.x * 2.2 + seed));
  c += tint * (exp(-edge.w / 34.) * .5 * (.5 + along) + exp(-edge.z / 24.) * .24 * (.5 + along) + (exp(-edge.x / 24.) + exp(-edge.y / 24.)) * .26 * (.5 + up));
  float inside = -box(p, vec4(uSize * .5, uSize * .5), 8. * uPx);
  c += vec3(1., .9, .85) * exp(-sq((inside - uPx) / (.8 * uPx))) * mix(.42, .72, smoothstep(.3, 1., p.y / uSize.y)) * (.6 + .8 * along);
  return vec4(c, 1.);
}

void main() {
  vec2 p = vec2(gl_FragCoord.x, uSize.y - gl_FragCoord.y);
  o = uMode == 1 ? room(p) : uMode == 2 ? bowl(p) : glass(p);
  o.rgb += (hash(p + uLook.w) - .5) / 255.;                                     // dither: dark gradients never band
  if (uMelt.x > 0.) o *= 1. - smoothstep(uSize.y - uMelt.x, uSize.y - uMelt.y, p.y);
}`;

let gl = null;
let uniforms = null;

function start() {
  const canvas = new OffscreenCanvas(2, 2);
  gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false });
  if (!gl) throw new Error('WebGL2 is not available');
  const program = gl.createProgram();
  for (const [type, source] of [[gl.VERTEX_SHADER, VERT], [gl.FRAGMENT_SHADER, FRAG]]) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
    gl.attachShader(program, shader);
  }
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
  gl.useProgram(program);
  uniforms = {};
  for (const name of ['uSize', 'uPx', 'uMode', 'uCount', 'uBox', 'uOpt', 'uA', 'uB', 'uC', 'uA2', 'uB2', 'uC2', 'uPour', 'uLook', 'uMelt']) {
    uniforms[name] = gl.getUniformLocation(program, name);
  }
}

const unit = (rgb) => rgb.map((v) => v / 255);
export const MODE = { glass: 0, room: 1, bowl: 2 };

/**
 * Bakes one surface and returns it as an ImageBitmap (hand it to a 'bitmaprenderer' canvas).
 *
 * @param {object} spec
 * @param {number} spec.w, spec.h   size in CSS pixels, bleed included
 * @param {number} spec.px          device pixels per CSS pixel
 * @param {number[][]} spec.shapes  [cx, cy, halfW, halfH, radius, kind, blend] in CSS pixels
 * @param {{a:number[], b:number[], c:number[]}} spec.palette  sRGB 0..255
 * @param {?object} spec.next       the palette pouring in, with spec.pour = [x, y, reach]
 * @param {?number[]} spec.melt     [from, to] CSS pixels above the bottom: the surface fades out between them
 */
export function bake({ w, h, px = 1, mode = MODE.glass, shapes = [], palette, next = null, pour = null, rim = 16, body = 0.62, heat = 0, seed = 0, melt = null }) {
  if (!gl) start();
  const width = Math.max(1, Math.round(w * px));
  const height = Math.max(1, Math.round(h * px));
  if (gl.canvas.width !== width || gl.canvas.height !== height) { gl.canvas.width = width; gl.canvas.height = height; }
  gl.viewport(0, 0, width, height);
  const boxes = new Float32Array(64);
  const opts = new Float32Array(64);
  shapes.slice(0, 16).forEach((s, i) => {
    boxes.set([s[0] * px, s[1] * px, s[2] * px, s[3] * px], i * 4);
    opts.set([Math.min(s[4], s[2], s[3]) * px, s[5] || 0, (s[6] || 0) * px, 0], i * 4);
  });
  gl.uniform2f(uniforms.uSize, width, height);
  gl.uniform1f(uniforms.uPx, px);
  gl.uniform1i(uniforms.uMode, mode);
  gl.uniform1i(uniforms.uCount, Math.min(16, shapes.length));
  gl.uniform4fv(uniforms.uBox, boxes);
  gl.uniform4fv(uniforms.uOpt, opts);
  const to = next || palette;
  gl.uniform3fv(uniforms.uA, unit(palette.a)); gl.uniform3fv(uniforms.uB, unit(palette.b)); gl.uniform3fv(uniforms.uC, unit(palette.c));
  gl.uniform3fv(uniforms.uA2, unit(to.a)); gl.uniform3fv(uniforms.uB2, unit(to.b)); gl.uniform3fv(uniforms.uC2, unit(to.c));
  gl.uniform3f(uniforms.uPour, pour ? pour[0] * px : 0, pour ? pour[1] * px : 0, pour ? pour[2] * px : 0);
  gl.uniform4f(uniforms.uLook, rim * px, body, heat, seed);
  gl.uniform2f(uniforms.uMelt, melt ? melt[0] * px : 0, melt ? melt[1] * px : 0);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  return gl.canvas.transferToImageBitmap();
}
