/**
 * Mercury: a drop of liquid metal and water.
 *
 * This module owns a WebGL2 canvas and nothing else. It knows how to draw the
 * ribbon and how it should feel; what the buttons do is the caller's business.
 * Feed it state (cover, palette, labels, progress, volume, spectrum), tell it
 * where the pointer is, and call frame(dt).
 */

import { Spring, Spring2 } from './springs.js';
import { STAGE, L, bodySdf, hit as hitShape, seekX, seekY, volX, volY } from './shape.js';
import { createInk } from './ink.js';
import * as S from './shaders.js';

const SIM_W = 384, SIM_H = 180;       // velocity and pressure
const DYE_W = 688, DYE_H = 320;       // pigment
const PRESSURE_ITERATIONS = 16;
const BLOOM_LEVELS = 4;

const srgbToLinear = (c) => c.map((v) => Math.pow(v / 255, 2.2));
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);

/** The most pixels the liquid is ever drawn at, however large the widget or dense the display. */
export const MAX_RENDER = [1920, 1080];

export function createMercury(canvas, { reducedMotion = false, family, maxRender = MAX_RENDER } = {}) {
  const gl = canvas.getContext('webgl2', {
    alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false,
    powerPreference: 'high-performance', preserveDrawingBuffer: false,
  });
  if (!gl) throw new Error('WebGL2 is not available');

  const floatTargets = Boolean(gl.getExtension('EXT_color_buffer_float'));
  gl.getExtension('OES_texture_float_linear');
  const HDR = floatTargets
    ? { internal: gl.RGBA16F, format: gl.RGBA, type: gl.HALF_FLOAT }
    : { internal: gl.RGBA8, format: gl.RGBA, type: gl.UNSIGNED_BYTE };

  /* --------------------------------------------------------- gl plumbing --- */

  function compile(type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(sh);
      const lines = src.split('\n').map((l, i) => `${String(i + 1).padStart(4)}  ${l}`).join('\n');
      throw new Error('shader compile failed:\n' + log + '\n' + lines);
    }
    return sh;
  }

  const vert = compile(gl.VERTEX_SHADER, S.VERT);
  function program(fragSrc) {
    const p = gl.createProgram();
    gl.attachShader(p, vert);
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fragSrc));
    gl.bindAttribLocation(p, 0, 'aPos');
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('link failed: ' + gl.getProgramInfoLog(p));
    const u = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) {
      const info = gl.getActiveUniform(p, i);
      u[info.name.replace(/\[0\]$/, '')] = gl.getUniformLocation(p, info.name);
    }
    return { p, u };
  }

  const P = {
    surface: program(S.SURFACE),
    force: program(S.SIM_FORCE),
    curl: program(S.SIM_CURL),
    vorticity: program(S.SIM_VORTICITY),
    divergence: program(S.SIM_DIVERGENCE),
    pressure: program(S.SIM_PRESSURE),
    project: program(S.SIM_PROJECT),
    impulse: program(S.SIM_IMPULSE),
    drop: program(S.SIM_DROP),
    advect: program(S.SIM_ADVECT),
    dye: program(S.SIM_DYE),
    prefilter: program(S.BLOOM_PREFILTER),
    down: program(S.BLOOM_DOWN),
    up: program(S.BLOOM_UP),
    composite: program(S.COMPOSITE),
  };

  const quad = gl.createVertexArray();
  gl.bindVertexArray(quad);
  const vbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  function texture(w, h, fmt = HDR, filter = gl.LINEAR) {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, fmt.internal, w, h, 0, fmt.format, fmt.type, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }

  function target(w, h, count = 1) {
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    const tex = [];
    for (let i = 0; i < count; i++) {
      tex.push(texture(w, h));
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.TEXTURE_2D, tex[i], 0);
    }
    gl.drawBuffers(tex.map((_, i) => gl.COLOR_ATTACHMENT0 + i));
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    return { fbo, tex, w, h, texel: [1 / w, 1 / h] };
  }

  function dispose(t) {
    if (!t) return;
    gl.deleteFramebuffer(t.fbo);
    t.tex.forEach((x) => gl.deleteTexture(x));
  }

  /** Two targets that swap, for anything that reads its own last frame. */
  function pair(w, h) {
    const o = { read: target(w, h), write: target(w, h), swap() { [o.read, o.write] = [o.write, o.read]; } };
    return o;
  }

  const sim = {
    vel: pair(SIM_W, SIM_H),
    pressure: pair(SIM_W, SIM_H),
    div: target(SIM_W, SIM_H),
    curl: target(SIM_W, SIM_H),
    dye: pair(DYE_W, DYE_H),
    fwd: target(DYE_W, DYE_H),
    bwd: target(DYE_W, DYE_H),
  };

  let scene = null;        // body + aura, rendered larger than the canvas
  let bloom = [];          // half, quarter, eighth, ...

  function bind(t) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, t ? t.fbo : null);
    gl.viewport(0, 0, t ? t.w : canvas.width, t ? t.h : canvas.height);
  }

  let unit = 0;
  function use(prog) { gl.useProgram(prog.p); unit = 0; return prog.u; }
  function sampler(loc, tex) {
    if (loc == null) return;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(loc, unit++);
  }
  const draw = () => gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

  /* ------------------------------------------------------ covers and ink --- */

  const RGBA8 = { internal: gl.RGBA8, format: gl.RGBA, type: gl.UNSIGNED_BYTE };
  function coverTexture() {
    const t = texture(1, 1, RGBA8);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([14, 14, 18, 255]));
    return t;
  }
  let coverA = coverTexture();   // outgoing
  let coverB = coverTexture();   // current

  const ink = createInk(gl, { family });

  /* ------------------------------------------- what is behind the window --- */

  // Experiment (tools/widget-proto, refract=live): frames from a capture of the monitor the
  // window is on, so the body can bend what is really behind it. Nothing here starts a
  // capture; the caller hands frames in and says where the stage sits inside them.
  const back = {
    tex: coverTexture(),     // a dark texel until the first frame arrives
    frame: null,             // the newest frame not yet uploaded (a VideoFrame, or anything texImage2D takes)
    w: 1, h: 1,
    has: false,              // a real frame has been uploaded
    frozen: false,           // keep showing the last upload (while the result is photographed)
    map: [0, 0, 0, 0],       // stage position -> uv in the frame: offset xy, scale zw
    uploads: 0,
    floor: 0,                // the opaque-body alternative: least opacity away from the edges
  };

  /** The newest frame of the capture. It is uploaded on the next draw; pass null to stop refracting. */
  function setBackdropFrame(frame) {
    if (back.frame && back.frame !== frame && back.frame.close) back.frame.close();
    back.frame = frame;
    if (!frame) back.has = false;
  }
  /** Where the stage sits in the capture: uv = (u0, v0) + stage position * (du, dv). */
  function setBackdropMap(u0, v0, du, dv) { back.map = [u0, v0, du, dv]; }

  function uploadBackdrop() {
    if (!back.frame || back.frozen) return;
    const f = back.frame;
    back.frame = null;
    const w = f.displayWidth || f.videoWidth || f.width, h = f.displayHeight || f.videoHeight || f.height;
    if (w && h) {
      gl.bindTexture(gl.TEXTURE_2D, back.tex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, f);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      back.w = w; back.h = h; back.has = true; back.uploads++;
    }
    if (f.close) f.close();
  }

  /* ---------------------------------------------------------------- state --- */

  const st = {
    time: 0,
    playing: false,
    progress: 0,
    volume: 0.85,
    muted: false,
    bands: new Float32Array(16),
    bass: 0, mid: 0, high: 0, pulse: 0, lastPulse: 0, lastKick: -10,
    pal: { a: [0.55, 0.4, 0.95], b: [0.25, 0.6, 0.95], c: [0.12, 0.1, 0.2] },
    palFrom: null, palTo: null, palT: 1,
    trans: 1, transActive: false,
    burst: 0,
    seekDrag: false, volDrag: false,
    pointerInside: false,
    ripples: Array.from({ length: S.RIPPLES }, () => [0, 0, -100, 0]),
    ripIndex: 0,
    lastWake: [0, 0],
    lastStir: -10,           // when the liquid was last disturbed
    nextDrop: 0,
    nextTrail: 0,
    tip: [0, 0],
    seekPullTarget: 0,
    pendingDrops: [],        // drops that fall a moment from now: { at, kick }
    reducedMotion,
  };

  const sp = {
    cursor: new Spring2('glide', STAGE.w / 2, STAGE.h / 2),
    presence: new Spring('glide', 0),
    pressed: new Spring('press', 0),
    lean: new Spring2('glide', 0, 0),
    btn: L.buttons.map(() => new Spring('press', 0)),
    util: new Spring({ k: 170, c: 17 }, 0),
    utilPress: L.utils.map(() => new Spring('press', 0)),
    tip: new Spring({ k: 320, c: 24 }, 0),
    squash: new Spring('jelly', 0),
    squashAt: [STAGE.w / 2, STAGE.h / 2],
    shear: new Spring2('lean', 0, 0),
    swell: new Spring({ k: 180, c: 14 }, 0),
    thump: new Spring({ k: 520, c: 20 }, 0),
    gap: new Spring({ k: 240, c: 16 }, 0),
    seekBead: new Spring('bead', 0),      // progress the bead is drawn at
    seekGrow: new Spring('pop', 0),
    seekGlow: new Spring('glide', 0),
    seekHover: new Spring('glide', 0),
    volBead: new Spring('bead', 0.85),
    volGrow: new Spring('pop', 0),
    volHover: new Spring('glide', 0),
    muted: new Spring('glide', 0),
    playing: new Spring({ k: 30, c: 11 }, 0),
    glyph: new Spring({ k: 300, c: 21 }, 0),       // play (0) melting into pause (1)
    form: new Spring({ k: 95, c: 12 }, 0),         // the drop coalescing: overshoots a little, then settles
    seekPull: new Spring('jelly', 0),              // the timeline bending under the bead
    level: new Spring('glide', 0.85),              // how loud: the glow follows it
    refract: new Spring('glide', 0),               // the refraction easing in once a capture is running
  };
  const allSprings = () => [sp.cursor, sp.presence, sp.pressed, sp.lean, ...sp.btn, sp.util, ...sp.utilPress, sp.tip,
    sp.squash, sp.shear, sp.swell, sp.thump, sp.gap, sp.seekBead, sp.seekGrow, sp.seekGlow, sp.seekHover, sp.volBead,
    sp.volGrow, sp.volHover, sp.muted, sp.playing, sp.glyph, sp.form, sp.seekPull, sp.level, sp.refract];

  /* ------------------------------------------------------------ resizing --- */

  let scale = 1;          // render px per stage unit
  /**
   * @param {number} ss supersampling per axis. The scene is drawn this much
   *   larger than the canvas and resolved down; 2 on a standard display.
   */
  function resize(cssW, cssH, dpr = window.devicePixelRatio || 1, ss = Math.max(1, Math.min(2, 2.5 / dpr))) {
    let w = Math.max(2, Math.round(cssW * dpr));
    let h = Math.max(2, Math.round(cssH * dpr));
    if (maxRender) {
      // The cap applies to the supersampled scene, which is where the cost is. Supersampling
      // gives way first; only a canvas larger than the cap itself is drawn smaller and stretched.
      const fit = Math.min(1, maxRender[0] / w, maxRender[1] / h);
      w = Math.max(2, Math.round(w * fit));
      h = Math.max(2, Math.round(h * fit));
      ss = Math.max(1, Math.min(ss, maxRender[0] / w, maxRender[1] / h));
    }
    const sw = Math.round(w * ss), sh = Math.round(h * ss);
    if (scene && w === canvas.width && h === canvas.height && scene.w === sw) return;
    canvas.width = w;
    canvas.height = h;
    scale = sw / STAGE.w;
    dispose(scene);
    bloom.forEach(dispose);
    scene = target(sw, sh, 3);
    bloom = [];
    let bw = w, bh = h;
    for (let i = 0; i < BLOOM_LEVELS; i++) {
      bw = Math.max(2, bw >> 1);
      bh = Math.max(2, bh >> 1);
      bloom.push(target(bw, bh));
    }
    ink.resize(scale);
  }

  /* ------------------------------------------------------------ inputs --- */

  function setCover(image, palette) {
    [coverA, coverB] = [coverB, coverA];
    gl.bindTexture(gl.TEXTURE_2D, coverB);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, image);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    if (palette) setPalette(palette);
    st.trans = st.reducedMotion ? 0.999 : 0;
    st.transActive = true;
    // The outgoing cover lets go all at once: a ring of drops jetting out of it.
    if (!st.reducedMotion) {
      for (let i = 0; i < 14; i++) rimDrop({ kick: 1.3, fromOutgoing: true, angle: (i / 14) * Math.PI * 2 + rand(-0.2, 0.2) });
      swirl(rand(300, 420), rand(210, 250), 700, 46);
      swirl(rand(520, 660), rand(190, 240), -700, 46);
      // ...and the new one starts to fall in behind it, drop by drop, until it has taken over.
      for (let i = 0; i < 10; i++) st.pendingDrops.push({ at: st.time + 0.75 + i * 0.22, kick: 0.9 - i * 0.06 });
    }
  }

  /** @param {{a:number[], b:number[], c:number[]}} palette sRGB 0..255 triples */
  function setPalette(palette, immediate = false) {
    const to = { a: srgbToLinear(palette.a), b: srgbToLinear(palette.b), c: srgbToLinear(palette.c) };
    if (immediate) { st.pal = to; st.palT = 1; return; }
    st.palFrom = { a: [...st.pal.a], b: [...st.pal.b], c: [...st.pal.c] };
    st.palTo = to;
    st.palT = 0;
  }

  function setPlaying(v) {
    v = Boolean(v);
    ink.set({ playing: v });
    if (v === st.playing) return;
    st.playing = v;
    st.lastStir = st.time;
    if (st.reducedMotion) return;
    const [bx, by] = L.buttons[1].c;
    if (v) {
      // Waking: the drop jumps, a ring leaves the button, pigment lets go of the cover.
      sp.thump.kick(11);
      ripple(bx, by, 1.2);
      for (let i = 0; i < 4; i++) st.pendingDrops.push({ at: st.time + 0.05 + i * 0.09, kick: 0.7 });
      swirl(rand(320, 460), rand(210, 250), 420, 44);
    } else {
      // Settling: one slow ring, and the body lets its breath out.
      ripple(bx, by, 0.8);
      sp.thump.kick(-7);
      sp.swell.kick(-18);
    }
  }

  /** Skipping a track: the whole drop feels the jump. dir is -1 for back, +1 for forward. */
  function lurch(dir) {
    if (st.reducedMotion) return;
    sp.shear.kick(-dir * 46, 0);
    sp.thump.kick(6);
    push(300, 236, dir * 520, 0, 150);
    push(600, 226, dir * 520, 0, 150);
    st.lastStir = st.time;
  }

  /** The drop coalesces out of nothing. */
  function appear() {
    sp.form.set({ k: 95, c: 12 }).target = 1;
    if (st.reducedMotion) sp.form.snap(1);
    else setTimeout(() => ripple(L.lobeL.c[0], L.lobeL.c[1] + 40, 1.1), 420);
    st.lastStir = st.time;
  }
  /** It lets go: the neck parts, the two beads draw in and are gone. */
  function vanish() {
    sp.form.set({ k: 150, c: 25 }).target = 0;
    if (st.reducedMotion) sp.form.snap(0);
    st.lastStir = st.time;
  }
  const formed = () => sp.form.x > 0.9;
  function setProgress(v) { st.progress = Math.min(1, Math.max(0, v)); }
  function setVolume(v, muted = st.muted) {
    st.volume = Math.min(1, Math.max(0, v));
    st.muted = muted;
    ink.set({ muted });
  }

  /** Words on the widget: { title, artist, cur, rem }. */
  function setLabels(labels) { ink.set(labels); }

  /** The time preview lens. Pass null to put it away. */
  function setTip(x, y, text) {
    if (text == null) { sp.tip.target = 0; return; }
    st.tip = [x, y];
    sp.tip.target = 1;
    ink.set({ tip: text });
  }

  /** @param {ArrayLike<number>} bands 16 values 0..1, low to high.  @param {number} pulse beat, 0..1 */
  function setAudio(bands, pulse) {
    let bass = 0, mid = 0, high = 0;
    for (let i = 0; i < 16; i++) {
      const v = bands[i] || 0;
      st.bands[i] += (v - st.bands[i]) * (v > st.bands[i] ? 0.55 : 0.16);
      if (i < 3) bass += v / 3;
      else if (i < 9) mid += v / 6;
      else high += v / 7;
    }
    st.bass += (bass - st.bass) * (bass > st.bass ? 0.5 : 0.12);
    st.mid += (mid - st.mid) * 0.2;
    st.high += (high - st.high) * 0.25;
    st.pulse = pulse;
  }

  function ripple(x, y, strength = 1) {
    if (st.reducedMotion) return;
    st.ripples[st.ripIndex] = [x, y, st.time, strength];
    st.ripIndex = (st.ripIndex + 1) % S.RIPPLES;
    st.lastStir = st.time;
  }

  /* ------------------------------------------------- stirring the liquid --- */

  const impulses = [];     // pushes on the velocity field
  const drops = [];        // pigment added

  /** A straight shove: a dragging pointer, a jet. Stage units and px/s. */
  function push(x, y, vx, vy, radius = 26) { impulses.push({ x, y, vx, vy, spin: 0, burst: 0, radius }); st.lastStir = st.time; }
  /** A vortex. Positive spins clockwise on screen. */
  function swirl(x, y, spin, radius = 40) { impulses.push({ x, y, vx: 0, vy: 0, spin, burst: 0, radius }); st.lastStir = st.time; }
  /** A splash outward from a point. */
  function splash(x, y, burst, radius = 30) { impulses.push({ x, y, vx: 0, vy: 0, spin: 0, burst, radius }); st.lastStir = st.time; }

  /** A drop of pigment. color is linear rgb; coverUv takes its colour from the cover instead. */
  function drop(x, y, { radius = 11, amount = 0.9, color = null, coverUv = null, outgoing = false } = {}) {
    drops.push({ x, y, radius, amount, color: color || [0, 0, 0], coverUv, outgoing });
    st.lastStir = st.time;
  }

  /**
   * Pigment leaving the cover: a drop on the rim with a jet behind it. In
   * still water a jet rolls up into a mushroom, which is the curl of ink.
   */
  function rimDrop({ kick = 0, fromOutgoing = false, angle = null } = {}) {
    // Most drops head into the ribbon; a few go the other way round the lobe.
    const a = angle ?? (Math.random() < 0.72 ? rand(-1.15, 1.15) : rand(0, Math.PI * 2));
    const dx = Math.cos(a), dy = Math.sin(a);
    const m = Math.max(Math.abs(dx), Math.abs(dy));
    const c = L.cover;
    const x = c.c[0] + dx / m * (c.half + 5), y = c.c[1] + dy / m * (c.half + 5);
    if (bodySdf(x + dx * 14, y + dy * 14) > -8) return;        // would jet straight into the wall
    const speed = lerp(rand(70, 120), rand(190, 300), Math.min(1, kick));
    drop(x, y, {
      radius: lerp(rand(8, 12), rand(12, 17), Math.min(1, kick)),
      amount: lerp(0.42, 0.66, Math.min(1, kick)),
      coverUv: [0.5 + dx / m * 0.4, 0.5 + dy / m * 0.4],
      outgoing: fromOutgoing,
    });
    push(x + dx * 4, y + dy * 4, dx * speed, dy * speed, lerp(15, 22, Math.min(1, kick)));
  }

  function pointerMove(x, y) {
    const h = hit(x, y);
    st.pointerInside = h.inside;
    sp.cursor.to(x, y);
    // Over a button the button is the dimple, so the cursor's own one backs off.
    const nearness = Math.min(1, Math.max(0, (46 - h.d) / 50));     // begins 46 units out
    sp.presence.target = nearness * ((h.target === 'button' || h.target === 'util') ? 0.25 : 1);
    sp.lean.to((x - STAGE.w / 2) / (STAGE.w / 2), (y - STAGE.h / 2) / (STAGE.h / 2));
    sp.util.target = h.inside ? 1 : 0;
    // A small wake behind the cursor as it travels over the liquid.
    const dx = x - st.lastWake[0], dy = y - st.lastWake[1];
    const dist = Math.hypot(dx, dy);
    if (h.inside && dist > 30) {
      // The faster the pointer, the bigger the wake.
      const now = performance.now();
      const speed = dist / Math.max(8, now - (st.lastWakeAt || 0)) * 1000;
      st.lastWakeAt = now;
      ripple(x, y, Math.min(0.75, 0.16 + speed / 2600));
      push(x, y, dx * 6, dy * 6, 24);
      st.lastWake = [x, y];
    } else if (!h.inside) {
      st.lastWake = [x, y];
    }
    return h;
  }

  function pointerLeave() {
    st.pointerInside = false;
    sp.presence.target = 0;
    sp.lean.to(0, 0);
    sp.util.target = 0;
  }

  /** The body takes a press: squash, deepen the dimple, send a ripple out, puff pigment. */
  function pressAt(x, y, strength = 1) {
    sp.pressed.set('press').target = 1;
    sp.squashAt = [x, y];
    sp.squash.set('press').target = 0.035 * strength;
    ripple(x, y, 1.5 * strength);
    if (!st.reducedMotion) {
      splash(x, y, 130 * strength, 34);
      drop(x, y, { radius: 9, amount: 0.5 * strength, color: st.pal.a });
    }
  }

  function release() {
    sp.pressed.set('jelly').target = 0;
    sp.squash.set('jelly').target = 0;
  }

  function pressButton(i, down) {
    const s = sp.btn[i];
    if (down) s.set('press').target = 1;
    else s.set('jelly').target = 0;
  }
  function pressUtil(i, down) {
    const s = sp.utilPress[i];
    if (down) s.set('press').target = 1;
    else s.set('jelly').target = 0;
  }

  /**
   * @param {number} [pull] how far above or below the line the pointer is,
   *   stage units. The line gives a little toward it, like a surface under tension.
   */
  function setSeekDrag(on, progress, pull = 0) {
    const was = st.seekDrag;
    st.seekDrag = on;
    if (progress != null) sp.seekBead.target = progress;
    sp.seekGrow.target = on ? 1 : 0;
    sp.seekGlow.target = on ? 1 : 0;
    sp.seekPull.target = on && !st.reducedMotion ? Math.max(-8, Math.min(8, pull * 0.55)) : 0;
    if (was && !on) {
      // Let go: it snaps home and the liquid rings once.
      const bx = seekX(sp.seekBead.target);
      ripple(bx, seekY(bx), 0.7);
    }
  }
  function setVolDrag(on) { st.volDrag = on; sp.volGrow.target = on ? 1 : 0; }
  function setHover(target) {
    sp.seekHover.target = target === 'seek' ? 1 : 0;
    sp.volHover.target = target === 'volume' ? 1 : 0;
  }

  /** Dragging the widget: the body lags behind, the liquid inside sloshes, and it wobbles when let go. */
  let lastDragVel = [0, 0];
  function setDragVelocity(vx, vy) {
    sp.shear.to(Math.max(-1, Math.min(1, -vx / 900)) * 5, Math.max(-1, Math.min(1, -vy / 900)) * 5);
    if (!st.reducedMotion) {
      const ax = vx - lastDragVel[0], ay = vy - lastDragVel[1];
      if (Math.hypot(ax, ay) > 60) {
        push(300, 230, -ax * 0.25, -ay * 0.25, 150);
        push(600, 220, -ax * 0.25, -ay * 0.25, 150);
      }
    }
    lastDragVel = [vx, vy];
  }

  // The body has a visible thickness, and the cursor tilts it: the underside
  // slides out from under the top face as the pointer moves across.
  const wall = () => (st.reducedMotion ? [0, 11] : [-4 * sp.lean.x, 11 + 4 * sp.lean.y]);
  // The cover tile floats, so it shifts a little against the body.
  const tile = () => (st.reducedMotion ? L.cover.c : [L.cover.c[0] - 2.5 * sp.lean.x, L.cover.c[1] - 2.5 * sp.lean.y]);
  const hit = (x, y) => (formed()
    ? hitShape(x, y, { swell: sp.swell.x, wall: wall(), tile: tile() })
    : { inside: false, d: 999, target: null });

  /* ----------------------------------------------------------- simulation --- */

  function simulate(dt, idle = false) {
    gl.disable(gl.BLEND);
    const texel = sim.vel.read.texel;
    const flow = st.reducedMotion ? 0 : lerp(260, 1150 + 1500 * st.bass, sp.playing.x);

    let u = use(P.force);
    bind(sim.vel.write);
    sampler(u.uVel, sim.vel.read.tex[0]);
    gl.uniform2fv(u.uTexel, texel);
    gl.uniform1f(u.uDt, dt);
    gl.uniform1f(u.uTime, st.time);
    gl.uniform1f(u.uFlow, flow);
    draw();
    sim.vel.swap();

    for (const im of impulses) {
      u = use(P.impulse);
      bind(sim.vel.write);
      sampler(u.uVel, sim.vel.read.tex[0]);
      gl.uniform2f(u.uPoint, im.x, im.y);
      gl.uniform2f(u.uPush, im.vx, im.vy);
      gl.uniform1f(u.uSpin, im.spin);
      gl.uniform1f(u.uBurst, im.burst);
      gl.uniform1f(u.uRadius, im.radius);
      draw();
      sim.vel.swap();
    }
    impulses.length = 0;

    u = use(P.curl);
    bind(sim.curl);
    sampler(u.uVel, sim.vel.read.tex[0]);
    gl.uniform2fv(u.uTexel, texel);
    draw();

    u = use(P.vorticity);
    bind(sim.vel.write);
    sampler(u.uVel, sim.vel.read.tex[0]);
    sampler(u.uCurl, sim.curl.tex[0]);
    gl.uniform2fv(u.uTexel, texel);
    gl.uniform1f(u.uDt, dt);
    gl.uniform1f(u.uStrength, 30);
    draw();
    sim.vel.swap();

    u = use(P.divergence);
    bind(sim.div);
    sampler(u.uVel, sim.vel.read.tex[0]);
    gl.uniform2fv(u.uTexel, texel);
    draw();

    u = use(P.pressure);
    gl.uniform2fv(u.uTexel, texel);
    for (let i = 0; i < (idle ? 6 : PRESSURE_ITERATIONS); i++) {
      bind(sim.pressure.write);
      unit = 0;
      sampler(u.uPressure, sim.pressure.read.tex[0]);
      sampler(u.uDiv, sim.div.tex[0]);
      draw();
      sim.pressure.swap();
    }

    u = use(P.project);
    bind(sim.vel.write);
    sampler(u.uPressure, sim.pressure.read.tex[0]);
    sampler(u.uVel, sim.vel.read.tex[0]);
    gl.uniform2fv(u.uTexel, texel);
    draw();
    sim.vel.swap();

    // Pigment: new drops first, then carried with a corrected step.
    for (const d of drops) {
      u = use(P.drop);
      bind(sim.dye.write);
      sampler(u.uDye, sim.dye.read.tex[0]);
      sampler(u.uCover, d.outgoing ? coverA : coverB);
      gl.uniform2f(u.uPoint, d.x, d.y);
      gl.uniform1f(u.uRadius, d.radius);
      gl.uniform1f(u.uAmount, d.amount);
      gl.uniform3fv(u.uColor, d.color);
      gl.uniform3f(u.uCoverUv, d.coverUv ? d.coverUv[0] : 0, d.coverUv ? d.coverUv[1] : 0, d.coverUv ? 1 : 0);
      draw();
      sim.dye.swap();
    }
    drops.length = 0;

    u = use(P.advect);
    bind(sim.fwd);
    sampler(u.uSrc, sim.dye.read.tex[0]);
    sampler(u.uVel, sim.vel.read.tex[0]);
    gl.uniform1f(u.uDt, dt);
    draw();
    bind(sim.bwd);
    unit = 0;
    sampler(u.uSrc, sim.fwd.tex[0]);
    sampler(u.uVel, sim.vel.read.tex[0]);
    gl.uniform1f(u.uDt, -dt);
    draw();

    u = use(P.dye);
    bind(sim.dye.write);
    sampler(u.uDye, sim.dye.read.tex[0]);
    sampler(u.uFwd, sim.fwd.tex[0]);
    sampler(u.uBwd, sim.bwd.tex[0]);
    sampler(u.uVel, sim.vel.read.tex[0]);
    sampler(u.uCover, st.trans < 0.5 ? coverA : coverB);
    gl.uniform2fv(u.uTexel, sim.dye.read.texel);
    gl.uniform1f(u.uDt, dt);
    gl.uniform1f(u.uFade, st.transActive ? 8 : 12);
    gl.uniform1f(u.uSeep, st.reducedMotion ? 0.08 : lerp(0.02, 0.1, sp.playing.x));
    gl.uniform1f(u.uBurst, st.burst);
    gl.uniform1f(u.uTime, st.time);
    draw();
    sim.dye.swap();
  }

  /* --------------------------------------------------------------- render --- */

  const btnUniform = new Float32Array(12);
  const ripUniform = new Float32Array(S.RIPPLES * 4);

  function render() {
    ink.set({ morph: Math.round(Math.min(1, Math.max(0, sp.glyph.x)) * 48) / 48 });
    ink.update();
    gl.disable(gl.BLEND);
    uploadBackdrop();

    let u = use(P.surface);
    bind(scene);
    gl.uniform2f(u.uRes, scene.w, scene.h);
    gl.uniform1f(u.uScale, scale);
    gl.uniform1f(u.uTime, st.time);
    const quiet = st.reducedMotion ? 0 : 1;
    gl.uniform4f(u.uAudio, st.bass * quiet, st.mid * quiet, st.high * quiet, st.pulse * quiet);
    gl.uniform1fv(u.uBands, st.bands);
    gl.uniform4f(u.uCursor, sp.cursor.x, sp.cursor.y, sp.presence.x * quiet, sp.pressed.x);
    gl.uniform2f(u.uLean, sp.lean.x * quiet, sp.lean.y * quiet);
    L.buttons.forEach((b, i) => btnUniform.set([b.c[0], b.c[1], b.r, sp.btn[i].x], i * 4));
    gl.uniform4fv(u.uBtn, btnUniform);
    st.ripples.forEach((r, i) => ripUniform.set(r, i * 4));
    gl.uniform4fv(u.uRip, ripUniform);
    gl.uniform4f(u.uSeek, sp.seekBead.x, sp.seekGrow.x, sp.seekGlow.x, sp.seekHover.x);
    gl.uniform4f(u.uVol, sp.volBead.x, sp.volGrow.x, sp.volHover.x, sp.muted.x);
    gl.uniform3f(u.uUtil, sp.util.x, sp.utilPress[0].x, sp.utilPress[1].x);
    // The preview rises out of the surface as it grows.
    gl.uniform4f(u.uTip, st.tip[0], st.tip[1] + 13 * (1 - Math.min(1, Math.max(0, sp.tip.x))), Math.max(0, sp.tip.x), 0);
    gl.uniform4f(u.uSquash, sp.squashAt[0], sp.squashAt[1], sp.squash.x * quiet, 0);
    gl.uniform2f(u.uShear, sp.shear.x * quiet, sp.shear.y * quiet);
    gl.uniform1f(u.uSwell, sp.swell.x);
    gl.uniform1f(u.uThump, sp.thump.x * quiet);
    gl.uniform1f(u.uGap, sp.gap.x);
    gl.uniform1f(u.uPlaying, sp.playing.x);
    gl.uniform1f(u.uTrans, st.trans);
    gl.uniform3fv(u.uPalA, st.pal.a);
    gl.uniform3fv(u.uPalB, st.pal.b);
    gl.uniform3fv(u.uPalC, st.pal.c);
    sampler(u.uDye, sim.dye.read.tex[0]);
    sampler(u.uVel, sim.vel.read.tex[0]);
    sampler(u.uCoverA, coverA);
    sampler(u.uCoverB, coverB);
    sampler(u.uInk, ink.tex);
    gl.uniform1f(u.uInkScale, ink.scale);
    gl.uniform1f(u.uForm, sp.form.x);
    const [wx, wy] = wall();
    gl.uniform2f(u.uWall, wx, wy);
    const [tx, ty] = tile();
    gl.uniform4f(u.uTile, tx, ty, 2.5 - 2 * sp.lean.x * quiet, 6.5 + 2 * sp.lean.y * quiet);
    const span = L.seek.x1 - L.seek.x0;
    gl.uniform3f(u.uSeekPull, Math.max(-1, Math.min(1, sp.seekBead.v * span / 520)) * quiet, sp.seekPull.x, sp.muted.x > 0.5 ? 0 : sp.level.x);
    sampler(u.uBack, back.tex);
    gl.uniform4fv(u.uBackMap, back.map);
    gl.uniform2f(u.uBackPx, Math.max(1e-3, back.map[2] * back.w), Math.min(1, Math.max(0, sp.refract.x)));
    gl.uniform1f(u.uGlassFloor, back.floor);
    draw();

    // Bloom: keep what is brighter than white, blur it down a pyramid and back up.
    u = use(P.prefilter);
    bind(bloom[0]);
    sampler(u.uBody, scene.tex[0]);
    sampler(u.uAura, scene.tex[1]);
    gl.uniform2fv(u.uTexel, scene.texel);
    draw();
    u = use(P.down);
    for (let i = 1; i < bloom.length; i++) {
      bind(bloom[i]);
      unit = 0;
      sampler(u.uSrc, bloom[i - 1].tex[0]);
      gl.uniform2fv(u.uTexel, bloom[i - 1].texel);
      draw();
    }
    u = use(P.up);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    for (let i = bloom.length - 1; i > 0; i--) {
      bind(bloom[i - 1]);
      unit = 0;
      sampler(u.uSrc, bloom[i].tex[0]);
      gl.uniform2fv(u.uTexel, bloom[i].texel);
      draw();
    }
    gl.disable(gl.BLEND);

    u = use(P.composite);
    bind(null);
    sampler(u.uBody, scene.tex[0]);
    sampler(u.uAura, scene.tex[1]);
    sampler(u.uGlass, scene.tex[2]);
    sampler(u.uBloom, bloom[0].tex[0]);
    gl.uniform1f(u.uBloomAmt, 0.5);
    gl.uniform2f(u.uCanvasTexel, 1 / canvas.width, 1 / canvas.height);
    draw();
  }

  /* ---------------------------------------------------------------- frame --- */

  /** What the music does to the liquid this frame. */
  function react(dt) {
    if (st.reducedMotion || !st.playing) return;

    // A kick: the drop jumps, pigment jets off the cover, and two vortices stir the body.
    const kicked = st.pulse > 0.5 && st.lastPulse <= 0.5 && st.time - st.lastKick > 0.16;
    st.lastPulse = st.pulse;
    if (kicked) {
      st.lastKick = st.time;
      const power = Math.min(1, st.pulse);
      sp.thump.kick(9 * power);
      const n = power > 0.8 ? 2 : 1;
      for (let i = 0; i < n; i++) rimDrop({ kick: power });
      const s = (Math.random() < 0.5 ? 1 : -1) * (260 + 520 * power);
      swirl(rand(300, 480), rand(205, 255), s, rand(34, 52));
      swirl(rand(540, 720), rand(170, 250), -s, rand(34, 52));
      splash(L.cover.c[0], L.cover.c[1], 50 * power, 120);
      if (power > 0.7) ripple(L.cover.c[0] + rand(-20, 20), L.cover.c[1] + 60, 0.5 * power);
    }

    // Between kicks the cover still lets a drop go now and then.
    if (st.time >= st.nextDrop) {
      rimDrop({ kick: 0.15 * st.mid });
      st.nextDrop = st.time + rand(1.0, 1.8) / (0.6 + st.mid + st.bass);
    }
    // The bead leaves a thread of colour behind it as the song moves on.
    if (st.time >= st.nextTrail) {
      const bx = seekX(sp.seekBead.x);
      drop(bx, seekY(bx) + 6, { radius: 8, amount: 0.4, color: st.pal.a });
      push(bx, seekY(bx) - 4, rand(-20, 20), -34, 12);
      st.nextTrail = st.time + rand(0.9, 1.5);
    }
    // Highs shiver the whole body with small eddies.
    if (st.high > 0.25 && Math.random() < st.high * dt * 14) {
      swirl(rand(130, 760), rand(120, 290), rand(-1, 1) * 260 * st.high, rand(14, 24));
    }
  }

  /**
   * Advance one frame.
   * @param {boolean} paint false advances the liquid without drawing it.
   * @param {boolean} idle true for the slow breathing frames: a lighter simulation step.
   * @returns {boolean} true while anything is still moving. When it returns
   *   false the caller can stop its loop: the picture will not change until
   *   something new happens.
   */
  function frame(dt, paint = true, idle = false) {
    dt = Math.min(dt, idle ? 1 / 10 : 1 / 20);
    st.time += dt;

    sp.playing.target = st.playing ? 1 : 0;
    sp.glyph.target = st.playing ? 1 : 0;
    sp.level.target = st.volume;
    sp.muted.target = st.muted ? 1 : 0;
    sp.refract.target = back.has ? 1 : 0;
    sp.swell.target = st.reducedMotion ? 0 : 2.6 * st.bass + 1.6 * st.pulse;
    sp.gap.target = st.reducedMotion ? 0.3 : 0.25 + 1.3 * st.bass + 0.9 * st.pulse;
    if (!st.seekDrag) sp.seekBead.target = st.progress;
    if (!st.volDrag) sp.volBead.target = st.volume;
    for (const s of allSprings()) s.step(dt);

    // Cover change: liquefy, flow, resolve.
    if (st.transActive) {
      st.trans = Math.min(1, st.trans + dt / 1.7);
      st.burst = st.trans < 0.4 ? 1 : Math.max(0, st.burst - dt * 2.2);
      if (st.trans >= 1) { st.transActive = false; st.burst = 0; }
    }
    if (st.palT < 1) {
      st.palT = Math.min(1, st.palT + dt / 1.2);
      const t = 1 - Math.pow(1 - st.palT, 3);
      for (const k of ['a', 'b', 'c']) st.pal[k] = st.palFrom[k].map((v, i) => lerp(v, st.palTo[k][i], t));
    }

    while (st.pendingDrops.length && st.pendingDrops[0].at <= st.time) rimDrop({ kick: st.pendingDrops.shift().kick });
    react(dt);
    simulate(dt, idle);
    if (paint) render();

    const springs = allSprings().some((s) => !s.resting);
    const rippling = st.ripples.some((r) => r[3] && st.time - r[2] < 2.4);
    // After the last disturbance the liquid is given a few seconds to come to rest.
    const settling = st.time - st.lastStir < 4;
    return st.playing || st.transActive || st.palT < 1 || springs || rippling || settling || sp.presence.x > 0.002
      || st.pendingDrops.length > 0;
  }

  function destroy() {
    const ext = gl.getExtension('WEBGL_lose_context');
    if (ext) ext.loseContext();
  }

  return {
    gl, state: st, springs: sp, ink,
    resize, frame, render, destroy, hit,
    setCover, setPalette, setPlaying, setProgress, setVolume, setAudio, setLabels, setTip,
    setBackdropFrame, setBackdropMap, backdrop: back,
    pointerMove, pointerLeave, pressAt, release, pressButton, pressUtil, ripple, lurch, appear, vanish,
    push, swirl, splash, drop,
    setSeekDrag, setVolDrag, setHover, setDragVelocity,
    get scale() { return scale; },
    seekX, seekY, volX, volY, bodySdf,
  };
}
