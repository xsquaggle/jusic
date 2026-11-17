/**
 * Mercury as live 3D glass, in the widget window (tools/widget-proto/main.js page=glass3d) or a plain page.
 *
 * What this page does around the renderer (renderer.js):
 *   - the frame: the widget's stage (860 x 400 CSS px, the old widget's) shows the reference's frame at 2.0619 of its
 *     pixels to one CSS px; ?frame=ref shows the whole reference frame (1586 x 992) instead, for side-by-side pictures;
 *   - the words, times, timeline, volume and glyphs, drawn crisp on a 2D layer from the player (never bent by the glass);
 *     soft warm pools below the lobes underneath;
 *   - the player: the prototype's test tracks (cover, title, artist, time), or with ?source=system whatever Windows says
 *     is playing on this PC (the "any media" setting; the shell's media helper), its controls sent back to that app;
 *   - refraction (?refract=live, the shell's default): a capture of the monitor behind the window (the window is left
 *     out of it) bent through the glass; the tray's Refraction switch turns it off and on;
 *   - the click-through: the window lets the mouse through wherever the pointer is not over the model's real
 *     silhouette (its own pixels, read back from the GPU), and takes it back the moment the pointer is over it;
 *   - the buttons (previous, play/pause, next), a click on the timeline or the volume line, and dragging the window by
 *     the glass; nothing else of the interactions yet (phase 3, after the owner's OK).
 * Draws only when something changed (a new screen frame, a new track, a second of the clock); ?spike draws every frame,
 * for measuring. Hooks for the shell's tests: window.__glass.
 *
 *   ?assets=  ?ss=2  ?light=0|1  ?studio=live|cycles  ?dbg=1..7  ?words=0  ?pools=0  ?bg=ref (pictures only)
 *   ?track=n  ?play  ?cover=<url>&title=&artist=&dur=   and every light-pass number by name (see LIGHT)
 */
import { createGlass } from './renderer.js';
import { paletteFromImage } from '../mercury/palette.js';

const Q = new URLSearchParams(location.search);
const WIDGET = Q.has('widget');
const host = WIDGET ? window.widgetHost : null;
const SPIKE = Q.has('spike');
const FRAME_REF = Q.get('frame') === 'ref';
const STAGE = { w: Number(Q.get('w')) || 860, h: Number(Q.get('h')) || 400 };
const K = 2.0619;                                          // reference px per stage unit (the old stage's scale)
const REF0 = [790 - STAGE.w * K / 2, 500 - STAGE.h * K / 2];   // the stage's top left, in reference px
const toRef = (x, y) => [REF0[0] + x * K, REF0[1] + y * K];

// The light pass toward the reference (see renderer.js). light=0: the studio exactly, nothing added.
const MODE = Q.has('light') ? Number(Q.get('light')) : 1;
const LIGHT = MODE === 0
  ? { exposure: 1, soft: 0, band: 0, lobe: 0, middle: 1, spill: 0, well: 0, warmth: 0, path: 1, through: 1, mirror: 1, hot: 0, hotk: 0,
      below: 1, marble: 0, marbleReach: 0.4, desk: 0.14, deskGap: 0.4, deskKeep: 0.15, coat: 0.006 }
  : { exposure: 1, soft: 0.25, band: 1.3, lobe: 0.5, middle: 0.6, spill: 0.15, well: 0.6, warmth: 0.35, path: 2.2, through: 0.6, mirror: 0.8,
      hot: 0, hotk: 0, below: 1, marble: 0.6, marbleReach: 0.45, desk: 0.22, deskGap: 0.4, deskKeep: 0.12, coat: 0.006 };
for (const k of Object.keys(LIGHT)) if (Q.has(k)) LIGHT[k] = Number(Q.get(k));

const $ = (id) => document.getElementById(id);
const under = $('under'), canvas = $('gl'), ink = $('ink');
const state = { ready: false, formed: false, frames: 0, cpuMs: 0, error: null, paused: false, light: LIGHT };
window.__glass = state;

/* ----------------------------------------------------------------- player --- */
const COVERS = '/prototypes/mercury/covers/';
const TRACKS = [
  { title: 'Silver Current', artist: 'Artist 02', cover: COVERS + 'silver-current.jpg', duration: 226 },
  { title: 'Cold Winters', artist: 'Lawson', cover: COVERS + 'cold-winters.jpg', duration: 198 },
  { title: 'Verdant Static', artist: 'Artist 05', cover: COVERS + 'verdant-static.jpg', duration: 254 },
  { title: 'Violet Hour', artist: 'Artist 11', cover: COVERS + 'violet-hour.jpg', duration: 187 },
  { title: 'Amber Drift', artist: 'Lawson', cover: COVERS + 'amber-drift.jpg', duration: 241 },
];
if (Q.get('cover')) Object.assign(TRACKS[0], { cover: Q.get('cover'), title: Q.get('title') || TRACKS[0].title, artist: Q.get('artist') || '', duration: Number(Q.get('dur')) || TRACKS[0].duration });
const SYSTEM = Boolean(host && host.onMedia && Q.get('source') === 'system');
const player = { index: 0, playing: false, time: 88, volume: 0.68, track: TRACKS[0], dim: '' };
const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const media = { state: null, key: null, art: null, base: 0, at: 0, rate: 1, sent: [] };

let G = null;                        // the renderer
let tint = [1, 0.45, 0.4];           // the album's colour (0..1)

function loadImage(src) {
  return new Promise((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = bad; i.src = src; });
}
function plainCover() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d'); const f = g.createLinearGradient(0, 0, 256, 256);
  f.addColorStop(0, '#3a3d46'); f.addColorStop(1, '#15161b'); g.fillStyle = f; g.fillRect(0, 0, 256, 256);
  return c;
}
function useCover(img) {
  const pal = paletteFromImage(img);
  const a = pal.a.map((v) => v / 255), m = Math.max(...a, 1e-3);
  tint = a.map((v) => v / m);
  G.setCover(img); G.setTint(tint);
  paintWords(); paintPools(); redraw();
}
async function setTrack(i) {
  player.index = (i + TRACKS.length) % TRACKS.length;
  player.track = TRACKS[player.index];
  useCover(await loadImage(player.track.cover));
}
function setPlaying(on) { player.playing = on; paintWords(); }

/* ------------------------------------------------------------ any media --- */
async function applyMedia(st) {
  media.state = st;
  const has = Boolean(st && st.source);
  const key = has ? `${st.source}|${st.title}|${st.artist}` : '';
  if (key !== media.key) {
    media.key = key;
    player.track = { title: has ? st.title || 'Untitled' : 'Nothing playing', artist: has ? st.artist || '' : '', duration: 0 };
  }
  player.track.duration = has ? Math.max(0, st.duration || 0) : 0;
  media.base = has ? st.position : 0; media.at = has ? st.updatedAt : 0; media.rate = has ? st.rate || 1 : 0;
  player.playing = Boolean(has && st.playing);
  player.dim = !has ? 'ptn' : (st.canPrev ? '' : 'p') + (st.canPlay || st.canPause || st.canToggle ? '' : 't') + (st.canNext ? '' : 'n');
  const art = has ? st.art || null : null;
  if (art !== media.art || !G.coverSet) {
    media.art = art; G.coverSet = true;
    let img; try { img = art ? await loadImage(art) : plainCover(); } catch { img = plainCover(); }
    if (media.art === art) useCover(img);
  }
  paintWords();
}
function mediaTime() {
  const d = player.track.duration;
  const t = media.base + (player.playing && media.at ? (Date.now() - media.at) / 1000 * media.rate : 0);
  return d > 0 ? Math.min(d, Math.max(0, t)) : 0;
}
function command(c, v) {
  if (SYSTEM) { media.sent.push(c); host.media(c, v); return; }
  if (c === 'prev') setTrack(player.index - 1).then(() => { player.time = 0; paintWords(); });
  if (c === 'next') setTrack(player.index + 1).then(() => { player.time = 0; paintWords(); });
  if (c === 'toggle') setPlaying(!player.playing);
  if (c === 'seek') { player.time = v; paintWords(); }
}

/* ------------------------------------------------------------- refraction --- */
const REFRACT = host && host.backdropSource ? Q.get('refract') : null;
const backdrop = { on: true, track: null, sourceId: null, placement: null, frames: 0, settings: null, error: null, frozen: false };
function placeBackdrop(p = backdrop.placement) {
  if (!p || !G) return;
  backdrop.placement = p;
  const rect = canvas.getBoundingClientRect();
  const { window: win, display } = p;
  // canvas fraction (x right, y up) -> the capture's coordinates (y up: frames are uploaded flipped)
  const u0 = (win.x - display.x + rect.left) / display.width, su = rect.width / display.width;
  const vTop = (win.y - display.y + rect.top) / display.height, sv = rect.height / display.height;
  G.desk.map = [u0, 1 - vTop - sv, su, sv];
  if (backdrop.track && p.sourceId !== backdrop.sourceId) startBackdrop();
  redraw();
}
async function startBackdrop() {
  stopBackdrop();
  try {
    const p = await host.backdropSource();
    backdrop.sourceId = p.sourceId;
    const mandatory = { chromeMediaSource: 'desktop', chromeMediaSourceId: p.sourceId, maxFrameRate: Number(Q.get('rfps')) || 30 };
    const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { mandatory } });
    const track = backdrop.track = stream.getVideoTracks()[0];
    backdrop.settings = track.getSettings(); backdrop.error = null;
    placeBackdrop(p);
    const reader = new MediaStreamTrackProcessor({ track, maxBufferSize: 1 }).readable.getReader();
    for (;;) {
      const { value, done } = await reader.read();
      if (done || backdrop.track !== track) { if (value) value.close(); break; }
      backdrop.frames++;
      if (!backdrop.frozen) { G.setDesk(value); fadeDesk(1); redraw(); }
      value.close();
    }
  } catch (e) {
    backdrop.error = String((e && e.message) || e);
    console.error('refraction: ' + backdrop.error);
  }
}
function stopBackdrop() { if (backdrop.track) backdrop.track.stop(); backdrop.track = null; }
// the switch eases the desktop in and out of the glass (never a jump)
let fadeTo = 0, fadeRaf = 0;
function fadeDesk(to) {
  fadeTo = to;
  if (fadeRaf) return;
  const step = () => {
    const d = fadeTo - G.desk.on;
    G.desk.on = Math.abs(d) < 0.02 ? fadeTo : G.desk.on + d * 0.15;
    redraw();
    fadeRaf = G.desk.on === fadeTo ? 0 : requestAnimationFrame(step);
  };
  fadeRaf = requestAnimationFrame(step);
}

/* ------------------------------------------------------------ the layers --- */
const WELLS = [[1077, 467, 58], [1237, 460, 82], [1392, 467, 58]];
let LINES = null;
const kRef = () => ink.width / (FRAME_REF ? 1586 : STAGE.w * K);           // device px per reference px
const refOrigin = () => (FRAME_REF ? [0, 0] : REF0);
function along(pts, t) {
  const n = pts.length - 1, i = Math.min(n - 1, Math.max(0, Math.floor(t * n))), f = t * n - i;
  return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * f, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * f];
}
function paintWords() {
  const c = ink.getContext('2d'); const k = kRef(), o = refOrigin();
  c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, ink.width, ink.height);
  if (Q.get('words') === '0' || !LINES) return;
  c.setTransform(k, 0, 0, k, -o[0] * k, -o[1] * k);
  const T = tint;
  const coral = (a) => `rgba(${Math.round(255 * T[0])},${Math.round(255 * (0.35 + 0.65 * T[1]))},${Math.round(255 * (0.3 + 0.7 * T[2]))},${a})`;
  // Words fit the reference's line lengths at the reference's size; longer titles keep that size and are cut.
  function words(txt, weight, x, baseline, refWidth, refText, colour, spacing = 0, maxW = refWidth) {
    let size = 40;
    for (let i = 0; i < 4; i++) {
      c.font = `${weight} ${size}px Montserrat`; c.letterSpacing = spacing * size + 'px';
      const m = c.measureText(refText); size *= refWidth / (m.actualBoundingBoxRight + m.actualBoundingBoxLeft);
    }
    c.font = `${weight} ${size}px Montserrat`; c.letterSpacing = spacing * size + 'px';
    let s = txt;
    while (s.length > 1 && c.measureText(s).width > maxW) s = s.slice(0, -2) + '…';
    c.fillStyle = colour; c.fillText(s, x, baseline); c.letterSpacing = '0px';
  }
  const tr = player.track, d = tr.duration, t = SYSTEM ? mediaTime() : player.time;
  words(tr.title, 500, 505, 468, 309, 'Silver Current', 'rgba(255,252,250,0.97)', 0, 330);
  words(tr.artist, 300, 507, 509, 127, 'Artist 02', 'rgba(236,226,224,0.66)', 0, 300);
  words(fmt(t), 400, 253, 638, 56, '1:28', 'rgba(255,250,248,0.92)', 0, 200);
  words('−' + fmt(Math.max(0, d - t)), 400, 1288, 602, 69, '−2:18', 'rgba(255,250,248,0.92)', 0, 200);
  words('VOLUME', 500, 1248, 308, 70, 'VOLUME', 'rgba(245,238,236,0.8)', 0.12, 200);
  function stroke(pts, t0, t1, width, style, blur, glow) {
    if (t1 <= t0) return;
    c.save(); c.lineCap = 'round'; c.lineJoin = 'round'; c.strokeStyle = style; c.lineWidth = width;
    if (blur) { c.shadowColor = glow; c.shadowBlur = blur * k; }
    c.beginPath();
    for (let i = 0; i <= 160; i++) { const p = along(pts, t0 + (t1 - t0) * i / 160); if (i) c.lineTo(p[0], p[1]); else c.moveTo(p[0], p[1]); }
    c.stroke(); c.restore();
  }
  function track(pts, p) {
    stroke(pts, p, 1, 3.0, 'rgba(205,198,198,0.5)');
    stroke(pts, 0, p, 13.0, 'rgba(40,14,16,0.35)', 10, 'rgba(20,6,8,0.6)');
    stroke(pts, 0, p, 9.0, coral(1), 18, coral(1));
    stroke(pts, 0, p, 4.0, 'rgba(255,250,246,1)');
  }
  function bead(p, r) {
    const g = c.createRadialGradient(p[0], p[1], r * 0.6, p[0], p[1], r * 3.2);
    g.addColorStop(0, coral(0.55)); g.addColorStop(1, coral(0));
    c.fillStyle = g; c.beginPath(); c.arc(p[0], p[1], r * 3.2, 0, 7); c.fill();
    c.fillStyle = 'rgba(255,250,246,1)'; c.beginPath(); c.arc(p[0], p[1], r, 0, 7); c.fill();
  }
  const prog = d > 0 ? Math.min(1, t / d) : 0;
  track(LINES.timeline, prog); bead(along(LINES.timeline, prog), 9);
  track(LINES.volume, player.volume); bead(along(LINES.volume, player.volume), 7.5);
  const glyph = (i) => `rgba(255,255,255,${player.dim.includes('ptn'[i]) ? 0.3 : 0.97})`;
  const rr = (x, y, w, h, r) => { c.beginPath(); c.roundRect(x, y, w, h, r); c.fill(); };
  const tri = (ax, ay, bx, by, cx, cy) => { c.beginPath(); c.moveTo(ax, ay); c.lineTo(bx, by); c.lineTo(cx, cy); c.closePath(); c.fill(); };
  c.fillStyle = glyph(0); rr(1062, 452, 5, 32, 1.5); tri(1095, 452, 1095, 484, 1069, 468);
  c.fillStyle = glyph(1);
  if (player.playing) { rr(1215, 435, 13, 51, 2.5); rr(1241, 435, 13, 51, 2.5); } else tri(1222, 434, 1222, 488, 1262, 461);
  c.fillStyle = glyph(2); rr(1403, 452, 5, 32, 1.5); tri(1375, 452, 1375, 484, 1401, 468);
  c.fillStyle = 'rgba(255,255,255,0.97)';
  rr(1185, 312, 8, 14, 1); tri(1192, 312, 1204, 303, 1204, 335); tri(1192, 312, 1204, 335, 1192, 326);
  c.strokeStyle = 'rgba(255,255,255,0.95)'; c.lineWidth = 2.6; c.lineCap = 'round';
  for (const [r, a] of [[8, 0.75], [13, 0.8], [18, 0.85]]) { c.beginPath(); c.arc(1205, 319, r, -a, a); c.stroke(); }
}
// Soft warm pools where a floor would be, below the lobes (never a halo round the outline).
function paintPools() {
  const c = under.getContext('2d'); const k = kRef(), o = refOrigin();
  c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, under.width, under.height);
  c.setTransform(k, 0, 0, k, -o[0] * k, -o[1] * k);
  if (Q.get('bg') === 'ref') {
    c.save(); c.translate(793, 496); c.scale(0.7 * 1586, 0.8 * 992);
    const g = c.createRadialGradient(0, 0, 0, 0, 0, 1);
    g.addColorStop(0, 'rgb(27,15,17)'); g.addColorStop(1, 'rgb(15,8,10)');
    c.fillStyle = g; c.fillRect(-4, -4, 8, 8); c.restore();
  }
  if (Q.get('pools') === '0') return;
  const col = tint.map((v, i) => Math.round(255 * (0.55 * v + 0.45 * [1, 0.62, 0.52][i])));
  for (const [u, v, rx, ry, a] of [[330, 790, 300, 46, 0.28], [1280, 712, 260, 40, 0.24], [820, 712, 200, 26, 0.10]]) {
    c.save(); c.translate(u, v); c.scale(1, ry / rx);
    const g = c.createRadialGradient(0, 0, 0, 0, 0, rx);
    g.addColorStop(0, `rgba(${col},${a})`); g.addColorStop(0.5, `rgba(${col},${a * 0.45})`); g.addColorStop(1, `rgba(${col},0)`);
    c.fillStyle = g; c.beginPath(); c.arc(0, 0, rx, 0, 7); c.fill(); c.restore();
  }
}

/* -------------------------------------------------------------- pointer --- */
let mask = null;
let passing = null;
let dragging = null, downAt = null;
function passThrough(on) { if (!host || on === passing) return; passing = on; host.setIgnore(on); }
/** What is under a point (CSS px of the page): outside, the cover, a button, the timeline, the volume, or the body. */
function hit(cx, cy) {
  if (!mask) return { inside: false };
  const dpr = G.size.dpr;
  const x = Math.floor(cx * dpr), y = Math.floor(cy * dpr);
  if (x < 0 || y < 0 || x >= mask.w || y >= mask.h || !mask.data[y * mask.w + x]) return { inside: false };
  const [u, v] = FRAME_REF ? [cx, cy] : toRef(cx / (canvas.getBoundingClientRect().width / STAGE.w), cy / (canvas.getBoundingClientRect().height / STAGE.h));
  for (let i = 0; i < 3; i++) if (Math.hypot(u - WELLS[i][0], v - WELLS[i][1]) < WELLS[i][2] * 0.9) return { inside: true, target: 'button', index: i, u, v };
  const near = (pts) => { let best = 1e9, bi = 0; pts.forEach((p, i) => { const d = Math.hypot(u - p[0], v - p[1]); if (d < best) { best = d; bi = i; } }); return [best, bi / (pts.length - 1)]; };
  if (LINES) {
    const [ds, ps] = near(LINES.timeline); if (ds < 16) return { inside: true, target: 'seek', progress: ps, u, v };
    const [dv, pv] = near(LINES.volume); if (dv < 16) return { inside: true, target: 'volume', progress: pv, u, v };
  }
  if (u > 144 && u < 446 && v > 271 && v < 572) return { inside: true, target: 'cover', u, v };
  return { inside: true, target: 'body', u, v };
}
const local = (e) => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
function onMove(e) {
  const [x, y] = local(e);
  const h = hit(x, y);
  passThrough(!h.inside && !dragging);
  if (downAt && !dragging && (downAt.h.target === 'body' || downAt.h.target === 'cover') && Math.hypot(e.screenX - downAt.sx, e.screenY - downAt.sy) > 5) {
    dragging = 'body'; if (host) host.drag('start');
  }
  if (dragging === 'body' && host) host.drag('move');
  document.body.style.cursor = !h.inside ? 'default' : ['button', 'seek', 'volume'].includes(h.target) ? 'pointer' : 'grab';
}
function onDown(e) {
  if (e.button !== undefined && e.button !== 0) return;
  const [x, y] = local(e);
  const h = hit(x, y);
  if (!h.inside) return;
  if (e.preventDefault) e.preventDefault();
  downAt = { h, sx: e.screenX || 0, sy: e.screenY || 0 };
}
function onUp(e) {
  const [x, y] = local(e);
  const h = hit(x, y);
  if (dragging === 'body') { if (host) host.drag('end'); }
  else if (downAt && h.inside && downAt.h.target === h.target) {
    if (h.target === 'button') {
      const st = media.state;
      if (!SYSTEM) command(['prev', 'toggle', 'next'][h.index]);
      else if (st && st.source) {
        // the other app does it, and the widget follows what Windows then reports
        if (h.index === 0 && st.canPrev) command('prev');
        if (h.index === 1 && (st.canPlay || st.canPause || st.canToggle)) { player.playing = !player.playing; command(player.playing ? 'play' : 'pause'); paintWords(); }
        if (h.index === 2 && st.canNext) command('next');
      }
    }
    if (h.target === 'seek' && player.track.duration > 0) command('seek', h.progress * player.track.duration);
    if (h.target === 'volume') { player.volume = h.progress; paintWords(); }
  }
  dragging = null; downAt = null;
  passThrough(!h.inside);
}

/* ----------------------------------------------------------------- loop --- */
let dirty = true, raf = 0;
function redraw() { dirty = true; if (!raf && !state.paused) raf = requestAnimationFrame(frame); }
function frame() {
  raf = 0;
  if (state.paused) return;
  if (!dirty && !SPIKE) return;
  const t0 = performance.now();
  G.draw();
  state.cpuMs = state.cpuMs * 0.95 + (performance.now() - t0) * 0.05;
  state.frames++;
  dirty = false;
  if (SPIKE) raf = requestAnimationFrame(frame);
}
state.resume = () => { state.paused = false; redraw(); };

async function main() {
  G = await createGlass(canvas, { assets: Q.get('assets') || '/design/captures/raw/mercury3d/live/', ss: Number(Q.get('ss')) || 2,
    studio: Q.get('studio') || 'live', light: LIGHT, dbg: Number(Q.get('dbg')) || 0 });
  LINES = await fetch('/tools/mercury3d/lines.json').then((r) => r.json());
  const css = FRAME_REF ? [1586, 992] : [STAGE.w, STAGE.h];
  const dpr = window.devicePixelRatio || 1;
  const ref = FRAME_REF ? [0, 0, 1586, 992] : [REF0[0], REF0[1], STAGE.w * K, STAGE.h * K];
  G.resize(css[0], css[1], dpr, ref);
  for (const c of [under, ink]) { c.width = G.size.canvas[0]; c.height = G.size.canvas[1]; c.style.width = css[0] + 'px'; c.style.height = css[1] + 'px'; }
  await Promise.all(['500 40px Montserrat', '300 40px Montserrat', '400 40px Montserrat'].map((f) => document.fonts.load(f)));
  if (SYSTEM) {
    player.track = { title: 'Nothing playing', artist: '', duration: 0 }; player.time = 0; player.dim = 'ptn';
    useCover(plainCover()); G.coverSet = false;
    host.onMedia(applyMedia);
  } else {
    await setTrack(Number(Q.get('track')) || 0);
    if (Q.has('play')) setPlaying(true);
  }
  paintWords(); paintPools();
  G.draw();
  mask = G.readMask();
  passThrough(true);                 // until the pointer is seen over the glass, the mouse belongs to the desktop
  // the clock: the words layer once a second while playing; nothing is redrawn in the glass for it
  setInterval(() => {
    if (!SYSTEM && player.playing) { player.time += 1; if (player.time >= player.track.duration) command('next'); }
    if (player.playing) paintWords();
  }, 1000);
  for (const [type, fn] of [['pointermove', onMove], ['pointerdown', onDown], ['pointerup', onUp], ['pointercancel', onUp]]) document.addEventListener(type, fn);
  document.addEventListener('pointerleave', () => { if (!dragging) passThrough(true); });
  document.addEventListener('wheel', (e) => {
    const [x, y] = local(e); if (!hit(x, y).inside) return;
    player.volume = Math.min(1, Math.max(0, player.volume + (e.deltaY < 0 ? 0.05 : -0.05))); paintWords();
  }, { passive: true });
  if (REFRACT) {
    host.onPlacement(placeBackdrop);
    document.addEventListener('visibilitychange', () => { if (document.hidden) stopBackdrop(); else if (backdrop.on) startBackdrop(); });
    if (host.onRefract) host.onRefract((on) => {
      backdrop.on = on;
      if (on) { if (!document.hidden) startBackdrop(); } else { stopBackdrop(); fadeDesk(0); }
    });
    if (!document.hidden) startBackdrop();
  }
  Object.assign(state, {
    G, player, media, backdrop, setTrack, setPlaying, size: G.size, redraw,
    /** A pretend pointer for the shell's tests, in stage units (the real mouse is never touched). */
    pointer(type, x, y) {
      const r = canvas.getBoundingClientRect();
      const s = FRAME_REF ? 1 : r.width / STAGE.w;
      const e = { clientX: r.left + x * s, clientY: r.top + y * s, screenX: 0, screenY: 0, button: 0, preventDefault() {} };
      if (type === 'move') onMove(e); if (type === 'down') onDown(e); if (type === 'up') onUp(e);
    },
    setLight(k, v) { LIGHT[k] = v; redraw(); },
    /** Where the controls are, in stage units, for the shell's tests. */
    layout: {
      buttons: WELLS.map(([u, v]) => [(u - REF0[0]) / K, (v - REF0[1]) / K]),
      seekAt: (p) => { const [u, v] = along(LINES.timeline, p); return [(u - REF0[0]) / K, (v - REF0[1]) / K]; },
    },
  });
  // (live values: what the page last asked of its window, true to let the mouse through; where the track is now)
  Object.defineProperty(state, 'passing', { get: () => passing });
  Object.defineProperty(state, 'time', { get: () => (SYSTEM ? mediaTime() : player.time) });
  state.ready = true; state.formed = true;
  redraw();
}
main().catch((e) => { state.error = String((e && e.stack) || e); console.error(e); });
