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
 *     the glass;
 *   - phase 3, the cursor and the presses (see "motion" below): the glass turning toward the cursor (the highlights
 *     slide, the upper sheet leans more), the dimple under the cursor, a click's ripple, a press squashing in and
 *     wobbling back, the buttons sinking into their wells; reduced motion (Windows' setting, the tray's switch, ?still)
 *     turns all of it off. The rest of phase 3 (seek and volume, the music, colour, the beads, the drop) waits for the
 *     owner's OK on how these feel.
 * Draws only when something changed (a new screen frame, a new track, a second of the clock); ?spike draws every frame,
 * for measuring. Hooks for the shell's tests: window.__glass.
 *
 *   ?assets=  ?ss=2  ?light=0|1  ?studio=live|cycles  ?dbg=1..7  ?words=0  ?pools=0  ?bg=ref (pictures only)
 *   ?track=n  ?play  ?cover=<url>&title=&artist=&dur=   and every light-pass number by name (see LIGHT)
 *   ?deskimg=<url> (pictures only): a still image as the desktop behind the window, filling the canvas, bent through
 *   the glass as refraction would (for checking the look over a desktop at any size without the window)
 *   ?still (reduced motion)  ?m_tilt= m_lean= m_dimple= m_press= m_rip= m_sink= (each interaction's strength; 0: off)
 *   window.__glass.drive(kind, seconds): a pretend pointer playing cursor | dimple | ripple | press | buttons | seek | pause (the
 *   shell's recordings and measures use it; the real mouse is never touched)
 */
import { createGlass } from './renderer.js';
import { paletteFromImage } from '../mercury/palette.js';
import { Spring, Spring2 } from '../mercury/springs.js';

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
      below: 1, marble: 0, marbleReach: 0.4, desk: 0.14, deskGap: 0.4, deskKeep: 0.15, coat: 0.006, edgeReach: 45, wordsDesk: 1 }
  : { exposure: 1, soft: 0, band: 3.2, lobe: 1, middle: 0.6, spill: 0.15, well: 0.6, warmth: 0.35, path: 2.2, through: 0.6, mirror: 1,
      hot: 0, hotk: 0, below: 1, marble: 1.4, marbleReach: 0.6, desk: 0.22, deskGap: 0.4, deskKeep: 0.05, coat: 0.006, edgeReach: 45,
      wordsDesk: 0.3 };
// (the clear-glass polish) bloom: the glow round the hot lines (light in the glass, not lines drawn on it; only inside
// the outline), above bloomThr, its spread bloomR, warmed toward peach by bloomWarm; keepRoll: how much of the studio's
// light the rolls keep over a dark desktop (luminous, as the reference's body; it fades out over bright desktops, where
// the desktop is what the glass shows); sheen: a broad, soft reflection; edgeCore: the edge's light toward a narrower
// core hugging the outline (a lit edge, not a painted rim); ringMirror: the art mirrored round the ring (the marble)
Object.assign(LIGHT, MODE === 0
  ? { bloom: 0, bloomThr: 1, bloomR: 1, bloomWarm: 0, keepRoll: LIGHT.deskKeep, sheen: 0, edgeCore: 0, ringMirror: 0 }
  : { bloom: 1.5, bloomThr: 0.5, bloomR: 1.5, bloomWarm: 1, keepRoll: 0.6, sheen: 0.1, edgeCore: 0.8, ringMirror: 0.3 });
for (const k of Object.keys(LIGHT)) if (Q.has(k)) LIGHT[k] = Number(Q.get(k));

const $ = (id) => document.getElementById(id);
const under = $('under'), canvas = $('gl'), ink = $('ink');
const state = { ready: false, formed: false, frames: 0, cpuMs: 0, error: null, paused: false, light: LIGHT, gaps: [], lastDrawAt: 0 };
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
let deskImg = null;                  // ?deskimg: a still desktop behind (pictures only)
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
function setPlaying(on) { player.playing = on; paintWords(); redraw(); }

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
  redraw();                          // (the music starts or fades out with it)
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
      if (!backdrop.frozen) {
        G.setDesk(value); fadeDesk(1); redraw();
        if (rec.on) {        // (recording: the piece of screen under the window, as it was when this frame was drawn)
          const m = G.desk.map, fw = value.displayWidth, fh = value.displayHeight;
          const sx = m[0] * fw, sy = (1 - m[1] - m[3]) * fh, sw = m[2] * fw, sh = m[3] * fh;
          createImageBitmap(value, sx, sy, sw, sh).then((bm) => { if (rec.under) rec.under.close(); rec.under = bm; }).catch(() => {});
        }
      }
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
  const shade = Q.has('shade') ? Number(Q.get('shade')) : 0.85;
  function words(txt, weight, x, baseline, refWidth, refText, colour, spacing = 0, maxW = refWidth) {
    let size = 40;
    for (let i = 0; i < 4; i++) {
      c.font = `${weight} ${size}px Montserrat`; c.letterSpacing = spacing * size + 'px';
      const m = c.measureText(refText); size *= refWidth / (m.actualBoundingBoxRight + m.actualBoundingBoxLeft);
    }
    c.font = `${weight} ${size}px Montserrat`; c.letterSpacing = spacing * size + 'px';
    let s = txt;
    while (s.length > 1 && c.measureText(s).width > maxW) s = s.slice(0, -2) + '…';
    // a faint, wide dark shade behind the letters: the glass a little darker behind the words (and readable
    // where a light desktop shows through it); then the letters, crisp
    if (shade > 0) {
      c.save(); c.shadowColor = `rgba(12,5,7,${shade})`; c.shadowBlur = 16 * k; c.fillStyle = 'rgba(12,5,7,0.01)';
      for (let i = 0; i < 2; i++) c.fillText(s, x, baseline);
      c.restore();
    }
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
  // a liquid bead: stretched along its line by its speed (a drop being pulled), a little thinner across; a ghost is
  // the same bead, faint, where a click would land
  function bead(pts, q, r, sp = 0, alpha = 1) {
    const p = along(pts, q), a = along(pts, Math.max(0, q - 0.01)), b = along(pts, Math.min(1, q + 0.01));
    const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
    const s = Math.max(-0.7, Math.min(0.7, sp));
    c.save(); c.globalAlpha = alpha; c.translate(p[0], p[1]); c.rotate(ang); c.translate(-r * s * 0.5, 0);
    c.scale(1 + Math.abs(s), 1 - 0.32 * Math.abs(s));
    const g = c.createRadialGradient(0, 0, r * 0.6, 0, 0, r * 3.2);
    g.addColorStop(0, coral(0.55)); g.addColorStop(1, coral(0));
    c.fillStyle = g; c.beginPath(); c.arc(0, 0, r * 3.2, 0, 7); c.fill();
    c.fillStyle = 'rgba(255,250,246,1)'; c.beginPath(); c.arc(0, 0, r, 0, 7); c.fill();
    c.restore();
  }
  // a small label riding above a dragged bead: the exact time it would seek to, or the volume
  function label(pts, q, text) {
    const p = along(pts, q);
    c.save(); c.font = '500 27px Montserrat'; c.letterSpacing = '0px';
    const w = c.measureText(text).width + 30, h = 42, x = p[0] - w / 2, y = p[1] - 34 - h;
    c.fillStyle = 'rgba(20,9,11,0.74)'; c.beginPath(); c.roundRect(x, y, w, h, 21); c.fill();
    c.strokeStyle = coral(0.6); c.lineWidth = 1.6; c.stroke();
    c.fillStyle = 'rgba(255,250,248,0.97)'; c.textAlign = 'center'; c.fillText(text, p[0], y + 30); c.restore();
  }
  const BS = beads.seek, BV = beads.vol;
  const prog = BS.at.x;
  track(LINES.timeline, prog);
  if (BS.ghostA.x > 0.01) bead(LINES.timeline, BS.ghostAt, 9, 0, BS.ghostA.x);
  bead(LINES.timeline, prog, 9, motion.reduced ? 0 : BS.at.v * 0.0045);
  if (BS.drag && d > 0) label(LINES.timeline, prog, fmt(prog * d));
  track(LINES.volume, BV.at.x);
  if (BV.ghostA.x > 0.01) bead(LINES.volume, BV.ghostAt, 7.5, 0, BV.ghostA.x);
  bead(LINES.volume, BV.at.x, 7.5, motion.reduced ? 0 : BV.at.v * 0.004);
  if (BV.drag) label(LINES.volume, BV.at.x, Math.round(player.volume * 100) + '%');
  const glyph = (i) => `rgba(255,255,255,${(player.dim.includes('ptn'[i]) ? 0.3 : 0.97) * (motion.downBtn === i ? 0.82 : 1)})`;
  // a button's glyph sinks with its well's floor: a few per cent smaller as it goes back (its centre never moves)
  const sunk = (i, draw) => {
    const f = 1 - 0.07 * Math.min(1, motion.sink[i].x / SINK.down);
    c.save(); c.translate(WELLS[i][0], WELLS[i][1]); c.scale(f, f); c.translate(-WELLS[i][0], -WELLS[i][1]); draw(); c.restore();
  };
  const rr = (x, y, w, h, r) => { c.beginPath(); c.roundRect(x, y, w, h, r); c.fill(); };
  const tri = (ax, ay, bx, by, cx, cy) => { c.beginPath(); c.moveTo(ax, ay); c.lineTo(bx, by); c.lineTo(cx, cy); c.closePath(); c.fill(); };
  sunk(0, () => { c.fillStyle = glyph(0); rr(1062, 452, 5, 32, 1.5); tri(1095, 452, 1095, 484, 1069, 468); });
  sunk(1, () => {
    c.fillStyle = glyph(1);
    if (player.playing) { rr(1215, 435, 13, 51, 2.5); rr(1241, 435, 13, 51, 2.5); } else tri(1222, 434, 1222, 488, 1262, 461);
  });
  sunk(2, () => { c.fillStyle = glyph(2); rr(1403, 452, 5, 32, 1.5); tri(1375, 452, 1375, 484, 1401, 468); });
  c.fillStyle = 'rgba(255,255,255,0.97)';
  rr(1185, 312, 8, 14, 1); tri(1192, 312, 1204, 303, 1204, 335); tri(1192, 312, 1204, 335, 1192, 326);
  c.strokeStyle = 'rgba(255,255,255,0.95)'; c.lineWidth = 2.6; c.lineCap = 'round';
  for (const [r, a] of [[8, 0.75], [13, 0.8], [18, 0.85]]) { c.beginPath(); c.arc(1205, 319, r, -a, a); c.stroke(); }
}
// Soft warm pools where a floor would be, below the lobes (never a halo round the outline).
function paintPools() {
  const c = under.getContext('2d'); const k = kRef(), o = refOrigin();
  c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, under.width, under.height);
  if (deskImg) c.drawImage(deskImg, 0, 0, under.width, under.height);
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
  motionMove(x, y, h);
  beadsMove(x, y, h);
}
function onDown(e) {
  if (e.button !== undefined && e.button !== 0) return;
  const [x, y] = local(e);
  const h = hit(x, y);
  if (!h.inside) return;
  if (e.preventDefault) e.preventDefault();
  downAt = { h, sx: e.screenX || 0, sy: e.screenY || 0 };
  motionDown(x, y, h);
  beadsDown(h);
}
function onWheel(e) {
  const [x, y] = local(e); if (!hit(x, y).inside) return;
  player.volume = Math.min(1, Math.max(0, player.volume + (e.deltaY < 0 ? 0.05 : -0.05)));
  kickInk();
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
        if (h.index === 1 && (st.canPlay || st.canPause || st.canToggle)) { player.playing = !player.playing; command(player.playing ? 'play' : 'pause'); paintWords(); redraw(); }
        if (h.index === 2 && st.canNext) command('next');
      }
    }
    // (the seek and the volume are the beads': dragged or clicked, they land on release, in beadsUp)
  }
  const wasDown = Boolean(downAt);
  beadsUp();
  dragging = null; downAt = null;
  passThrough(!h.inside);
  if (wasDown) motionUp();
}

/* ------------------------------------------------------- seek and volume --- */
// The beads on the timeline and the volume line are springy liquid beads (springs.js 'bead'): dragged, they chase the
// pointer and stretch along their line with their speed, a precise time (or the volume) riding above; hovering a
// line shows a faint ghost bead where a click would land; the wheel over the widget changes the volume, its bead
// springing there. They live on the words layer: crisp, and the glass is not redrawn for them. Reduced motion: the
// beads jump, no stretch, no ghost easing.
const beads = {
  seek: { at: new Spring('bead'), drag: false, ghostA: new Spring('glide'), ghostAt: 0 },
  vol: { at: new Spring('bead'), drag: false, ghostA: new Spring('glide'), ghostAt: 0 },
};
/** Where along a line (0..1) the point nearest to (u, v), reference px, lies. */
function nearestOn(pts, u, v) {
  let best = 1e18, bt = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[i + 1], dx = bx - ax, dy = by - ay;
    const f = Math.max(0, Math.min(1, ((u - ax) * dx + (v - ay) * dy) / (dx * dx + dy * dy || 1)));
    const d = (ax + dx * f - u) ** 2 + (ay + dy * f - v) ** 2;
    if (d < best) { best = d; bt = (i + f) / (pts.length - 1); }
  }
  return bt;
}
function refOf(x, y) {
  const r = canvas.getBoundingClientRect();
  return FRAME_REF ? [x, y] : toRef(x / (r.width / STAGE.w), y / (r.height / STAGE.h));
}
/** Where the beads should be when nobody is dragging them: the playback position, the volume. */
function beadTargets() {
  const d = player.track.duration, t = SYSTEM ? mediaTime() : player.time;
  if (!beads.seek.drag) {
    const q = d > 0 ? Math.min(1, t / d) : 0;
    // (a jump, a seek or a new track, springs there; the second-by-second advance just follows)
    if (Math.abs(q - beads.seek.at.target) > 0.02 && !motion.reduced) beads.seek.at.target = q; else beads.seek.at.snap(q);
  }
  if (!beads.vol.drag) { if (motion.reduced) beads.vol.at.snap(player.volume); else beads.vol.at.target = player.volume; }
}
function beadsMove(x, y, h) {
  const [u, v] = refOf(x, y);
  for (const [key, B, pts] of [['seek', beads.seek, LINES.timeline], ['volume', beads.vol, LINES.volume]]) {
    if (B.drag) { const q = nearestOn(pts, u, v); B.at.target = q; if (motion.reduced) B.at.snap(q); if (key === 'volume') player.volume = q; }
    const hov = !B.drag && h.inside && h.target === key;
    if (hov) B.ghostAt = h.progress;
    B.ghostA.target = hov && !motion.reduced ? 0.42 : 0;
    if (motion.reduced) B.ghostA.snap(B.ghostA.target);
  }
  kickInk();
}
function beadsDown(h) {
  const B = h.target === 'seek' ? beads.seek : h.target === 'volume' ? beads.vol : null;
  if (!B) return;
  if (h.target === 'seek' && !(player.track.duration > 0)) return;
  B.drag = true; B.ghostA.target = 0;
  B.at.target = h.progress; if (motion.reduced) B.at.snap(h.progress);
  if (h.target === 'volume') player.volume = h.progress;
  kickInk();
}
/** On release: the seek lands where its bead was let go; the volume is already set. True if a bead was being dragged. */
function beadsUp() {
  let was = false;
  if (beads.seek.drag) {
    beads.seek.drag = false; was = true;
    if (player.track.duration > 0) command('seek', beads.seek.at.target * player.track.duration);
  }
  if (beads.vol.drag) { beads.vol.drag = false; was = true; }
  kickInk();
  return was;
}
let inkRaf = 0, inkLast = 0;
/** The words layer alone, stepped while its beads move (the glass is not redrawn for them). */
function kickInk() { if (!inkRaf && LINES) inkRaf = requestAnimationFrame(inkFrame); }
function inkFrame(now) {
  inkRaf = 0;
  const dt = inkLast ? Math.min(0.05, (now - inkLast) / 1000) : 1 / 60;
  inkLast = now;
  beadTargets();
  const springs = [beads.seek.at, beads.vol.at, beads.seek.ghostA, beads.vol.ghostA];
  for (const sp of springs) sp.step(dt);
  state.inkFrames = (state.inkFrames || 0) + 1;
  paintWords();
  if (springs.some((sp) => !sp.resting) || beads.seek.drag || beads.vol.drag) inkRaf = requestAnimationFrame(inkFrame);
  else inkLast = 0;
}

/* ----------------------------------------------------------------- music --- */
// The music (phase 3, after the cursor and the presses): the lobes swell gently with the bass; on the beat a wave runs
// along the ribbon from the cover to the tail; glints run along the hot highlights with the highs; the spectrum
// glows in the fold under the sheet over the buttons, fine strands of coral light each band lifts. In "any media"
// (source=system) it hears what the PC really plays (the shell's sound helper, as in the 2D widget); the test
// tracks move to a made-up beat (silent). On pause it all fades out and the glass goes still. Reduced motion: none.
// Strengths by URL: ?mu_flex= mu_beat= mu_glint= mu_spec= (0: off).
const MUS = { flex: 0.04, beat: 0.014, glint: 1, spec: 4.5, specSwing: 0.1, specWidth: 0.022, bpm: 112 };
for (const k of Object.keys(MUS)) if (Q.has('mu_' + k)) MUS[k] = Number(Q.get('mu_' + k));
const listener = (() => {
  // (from the 2D widget: 16 loudnesses on a decibel scale about 30 times a second, evened out so a quiet song moves
  // the glass as much as a loud one; silence stays still)
  const target = new Float32Array(16), smooth = new Float32Array(16), bands = new Float32Array(16);
  let bassAvg = 0, pulse = 0, level = 0.12, fedAt = -1e9;
  return {
    get ready() { return performance.now() - fedAt < 2000; },
    feed(values) { for (let i = 0; i < 16; i++) target[i] = (Number(values[i]) || 0) ** 1.6 * (0.9 + 0.9 * (i / 16)); fedAt = performance.now(); },
    analyse() {
      let top = 0;
      for (let i = 0; i < 16; i++) { smooth[i] = target[i] > smooth[i] ? target[i] : smooth[i] + (target[i] - smooth[i]) * 0.35; top = Math.max(top, smooth[i]); }
      level = top > level ? level + (top - level) * 0.3 : Math.max(0.12, level * 0.9992);
      const gain = 0.85 / level;
      for (let i = 0; i < 16; i++) bands[i] = Math.min(1, Math.max(0, smooth[i] * gain - 0.25) / 0.75);
      const bass = (bands[0] + bands[1] + bands[2]) / 3;
      bassAvg += (bass - bassAvg) * 0.04;
      const hit = Math.max(0, bass - bassAvg * 0.92) * 3.2 + bass * 0.18;
      pulse = hit > pulse ? pulse + (hit - pulse) * 0.6 : pulse * 0.9;
      return { bands, pulse: Math.min(1, pulse) };
    },
  };
})();
/** A made-up beat (the 2D widget's capture spectrum): the same every run. */
function madeUpBeat(t, bpm) {
  const bands = new Float32Array(16);
  const beat = (t * bpm / 60) % 1, kick = Math.exp(-beat * 7), off = Math.exp(-(((t * bpm / 60) + 0.5) % 1) * 9);
  for (let i = 0; i < 16; i++) {
    const x = i / 15, wob = 0.5 + 0.5 * Math.sin(t * (1.3 + i * 0.37) + i * 1.7);
    bands[i] = Math.min(1, kick * Math.exp(-x * 5) * 0.95 + (0.22 + 0.3 * wob) * Math.exp(-((x - 0.42) ** 2) / 0.08)
      + off * 0.5 * Math.exp(-((x - 0.85) ** 2) / 0.02) + 0.06);
  }
  return { bands, pulse: Math.min(1, kick * 1.1) };
}
const music = { on: new Spring('glide'), bands: new Float32Array(16), bass: 0, highs: 0, pulse: 0, beats: [], lastBeat: -1e9, t0: performance.now() };
if (host && host.onBands) host.onBands((b) => listener.feed(b));
/** Step the music; true while it is moving the glass. Its uniforms ride along with the motion's. */
function musicStep(dt) {
  const m = music;
  const t = (performance.now() - m.t0) / 1000;
  const live = player.playing && !motion.reduced && !document.hidden;
  m.on.target = live ? 1 : 0; m.on.step(dt);
  if (motion.reduced) m.on.snap(0);
  if (m.on.x < 1e-3 && !live) { m.beats = []; return false; }
  const a = SYSTEM ? (listener.ready ? listener.analyse() : { bands: new Float32Array(16), pulse: 0 }) : madeUpBeat(t, MUS.bpm);
  for (let i = 0; i < 16; i++) m.bands[i] = a.bands[i];
  m.bass = (a.bands[0] + a.bands[1] + a.bands[2]) / 3;
  m.highs = (a.bands[11] + a.bands[12] + a.bands[13] + a.bands[14] + a.bands[15]) / 5;
  // a beat: the pulse rising through a threshold, not too soon after the last
  if (a.pulse > 0.55 && m.pulse <= 0.55 && t - m.lastBeat > 0.28 && MUS.beat > 0) {
    m.lastBeat = t; m.beats.push({ x0: -5.4, t0: t, s: MUS.beat * (0.6 + 0.4 * a.pulse) }); if (m.beats.length > 2) m.beats.shift();
  }
  m.pulse = a.pulse;
  m.beats = m.beats.filter((b) => t - b.t0 < 3.5);
  return true;
}
function musicUniforms() {
  const m = music, t = (performance.now() - m.t0) / 1000, on = m.on.x;
  return {
    flex: MUS.flex * m.bass * on,
    beats: [0, 1].map((i) => (m.beats[i] ? [m.beats[i].x0, t - m.beats[i].t0, m.beats[i].s * on, 0] : [0, -1, 0, 0])),
    beatK: [6.5, 0.7, 0.75],
    music: [m.bass, m.highs * MUS.glint, t, on],
    bands: m.bands,
    spec: [MUS.spec, MUS.specSwing, MUS.specWidth, 0],
  };
}

/* ---------------------------------------------------------------- motion --- */
// Phase 3, the cursor and the presses: everything on springs (springs.js), so it carries momentum and settles on its
// own. The glass turns a little toward the cursor (the highlights slide; the upper sheet leans more, the glass round
// the controls hardly at all); a small dimple follows under the cursor, its reflection travelling with it; a click
// sends a shallow ripple out from where it landed; a press squashes the glass in under the pointer (bulging round it)
// and wobbles back on release; a button's well sinks a little under the pointer and more while pressed, its glyph
// with it. Words and controls never move (the glyphs only shrink a few per cent as they sink). Nothing is drawn once
// everything has settled. Reduced motion (Windows' setting, or ?still): none of it, only the glyphs dimming while
// pressed. Strengths: ?m_tilt= m_lean= m_dimple= m_press= m_rip= m_sink= (0 turns one off).
const RM = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
// (the owner, 17 November: "a little bit stronger", and the press to squish more like jelly)
const MOT = { tilt: 0.065, lean: 0.06, dimple: 0.06, dimpleR: 0.2, press: 0.11, pressR: 1.3, rip: 0.015, ripSpeed: 9, ripWave: 0.38,
  ripDecay: 0.6, jig: 0.022, jigSpeed: 3.4, jigWave: 1.1, jigDecay: 0.9, sink: 1 };
for (const k of Object.keys(MOT)) if (Q.has('m_' + k)) MOT[k] = Number(Q.get('m_' + k));
const SINK = { hover: 0.03, down: 0.07 };                   // how far a well's floor goes back (root units: 1 = 100 ref px)
// Jelly: a press goes in with a little overshoot and comes back bouncing three or four times; a button's floor the same,
// smaller. (springs.js's 'press' is critically damped: it read as a stiff push, not jelly.)
const JELLY = { in: { k: 380, c: 15 }, out: { k: 230, c: 6.5 }, sinkIn: { k: 600, c: 22 }, sinkOut: { k: 300, c: 8 } };
const motion = {
  reduced: Q.has('still') || Boolean(RM && RM.matches),
  tilt: new Spring2('glide'), lean: new Spring2('lean'),
  dimpleAt: new Spring2({ k: 520, c: 40 }), dimple: new Spring('glide'), dimpleSeen: false,
  press: new Spring('press'), pressAt: [0, 0],
  rips: [],                                    // { x, z, t0 }: a click's ripple, in root units, started at t0 (s)
  jig: null, pressing: false,                  // the wobble rolling out from a release
  sink: [0, 1, 2].map(() => new Spring('press')), hoverBtn: -1, downBtn: -1,
  pointer: null, last: 0,
};
/** Where a point of the page (CSS px) lies in the model's frame (root units: x right, z up). */
function rootAt(cx, cy) {
  const r = canvas.getBoundingClientRect();
  const [u, v] = FRAME_REF ? [cx, cy] : toRef(cx / (r.width / STAGE.w), cy / (r.height / STAGE.h));
  return [(u - G.meta.CX) * G.meta.S, (G.meta.CY - v) * G.meta.S];
}
function setReduced(on) {
  motion.reduced = on;
  if (on) {
    motion.tilt.snap(0, 0); motion.lean.snap(0, 0); motion.dimple.snap(0); motion.press.snap(0); motion.rips = []; motion.jig = null;
    motion.sink.forEach((s) => s.snap(0));
  }
  paintWords(); redraw();
}
// Windows' setting (Animation effects off), ?still, or the tray's switch
let trayReduced = false;
if (RM && RM.addEventListener) RM.addEventListener('change', () => setReduced(Q.has('still') || RM.matches || trayReduced));
if (host && host.onReduced) host.onReduced((on) => { trayReduced = on; setReduced(Q.has('still') || Boolean(RM && RM.matches) || on); });
function sinkTargets() {
  const m = motion;
  m.sink.forEach((s, i) => {
    const t = m.reduced ? 0 : MOT.sink * (m.downBtn === i ? SINK.down : m.hoverBtn === i ? SINK.hover : 0);
    if (t < s.target) s.set(JELLY.sinkOut); else s.set(JELLY.sinkIn);
    s.target = t;
  });
}
function motionMove(x, y, h) {
  const m = motion, r = canvas.getBoundingClientRect();
  if (!Number.isFinite(x) || !Number.isFinite(y)) return;
  m.pointer = [x, y];
  m.hoverBtn = h.inside && h.target === 'button' ? h.index : -1;
  sinkTargets();
  if (!m.reduced) {
    // toward the cursor: the widget's middle is level, its edges turn the glass up to MOT.tilt
    const nx = Math.max(-1.2, Math.min(1.2, (x - r.width / 2) / (r.width / 2))), ny = Math.max(-1.2, Math.min(1.2, (y - r.height / 2) / (r.height / 2)));
    m.tilt.to(MOT.tilt * nx, -MOT.tilt * ny); m.lean.to(MOT.lean * nx, -MOT.lean * ny);
    const p = rootAt(x, y);
    if (h.inside) {
      if (!m.dimpleSeen || m.dimple.x < 1e-3) m.dimpleAt.snap(p[0], p[1]); else m.dimpleAt.to(p[0], p[1]);
      m.dimpleSeen = true;
      m.dimple.target = MOT.dimple;
    } else m.dimple.target = 0;
    redraw();
  }
}
function motionLeave() {
  const m = motion;
  m.pointer = null; m.hoverBtn = -1; m.tilt.to(0, 0); m.lean.to(0, 0); m.dimple.target = 0;
  sinkTargets(); if (!m.reduced) redraw();
}
function motionDown(x, y, h) {
  const m = motion;
  if (h.target === 'button') m.downBtn = h.index;
  sinkTargets();
  if (!m.reduced) {
    const p = rootAt(x, y);
    if (MOT.rip > 0) { m.rips.push({ x: p[0], z: p[1], t0: performance.now() / 1000 }); if (m.rips.length > 4) m.rips.shift(); }
    if (h.target === 'body' || h.target === 'cover') { m.pressAt = p; m.press.set(JELLY.in); m.press.target = MOT.press; m.pressing = true; }
    redraw();
  }
  paintWords();
}
function motionUp() {
  const m = motion;
  const btn = m.downBtn;
  m.downBtn = -1; sinkTargets();
  m.press.set(JELLY.out); m.press.target = 0;         // back bouncing, three or four times
  // and a slow, wide wobble rolling out through the body from where it was let go (smaller from a button)
  if (!m.reduced && MOT.jig > 0 && (m.pressing || btn >= 0)) {
    const at = m.pressing ? m.pressAt : G.wells[btn].slice(0, 2);
    m.jig = { x: at[0], z: at[1], t0: performance.now() / 1000, s: MOT.jig * (m.pressing ? 1 : 0.5) };
  }
  m.pressing = false;
  paintWords(); if (!m.reduced) redraw();
}
/** Step the springs; hand the renderer what it needs. True while anything is still moving. */
function motionStep(now) {
  const m = motion;
  const dt = m.last ? Math.min(0.05, (now - m.last) / 1000) : 1 / 60;
  m.last = now;
  const springs = [m.tilt, m.lean, m.dimpleAt, m.dimple, m.press, ...m.sink];
  const was = springs.map((s) => s.resting);
  for (const s of springs) s.step(dt);
  const t = performance.now() / 1000;
  m.rips = m.rips.filter((r) => t - r.t0 < MOT.ripDecay * 5);
  if (m.jig && t - m.jig.t0 > MOT.jigDecay * 5) m.jig = null;
  const sinking = m.sink.some((s) => !s.resting) || m.sink.some((s, i) => !was[5 + i]);
  if (sinking) paintWords();
  const playingMusic = musicStep(dt);
  const moving = springs.some((s) => !s.resting) || m.rips.length > 0 || Boolean(m.jig) || playingMusic;
  const any = moving || Math.abs(m.tilt.x) + Math.abs(m.tilt.y) + Math.abs(m.lean.x) + Math.abs(m.lean.y) + Math.abs(m.dimple.x)
    + Math.abs(m.press.x) + m.sink.reduce((a, s) => a + Math.abs(s.x), 0) > 1e-5;
  G.motion = any || playingMusic ? {
    tilt: [m.tilt.x, m.tilt.y, m.lean.x, m.lean.y],
    dimple: [m.dimpleAt.x, m.dimpleAt.y, m.dimple.x, MOT.dimpleR],
    press: [m.pressAt[0], m.pressAt[1], m.press.x, MOT.pressR],
    rips: [0, 1, 2, 3].map((i) => (m.rips[i] ? [m.rips[i].x, m.rips[i].z, t - m.rips[i].t0, MOT.rip] : [0, 0, -1, 0])),
    ripK: [MOT.ripSpeed, MOT.ripWave, MOT.ripDecay],
    jig: m.jig ? [m.jig.x, m.jig.z, t - m.jig.t0, m.jig.s] : [0, 0, -1, 0],
    jigK: [MOT.jigSpeed, MOT.jigWave, MOT.jigDecay],
    ...musicUniforms(),
    sink: m.sink.map((s) => s.x),
  } : null;
  if (moving || springs.some((s, i) => s.resting !== was[i])) dirty = true;
  return moving;
}
/** A pretend pointer along a path, for the recordings and the measures (stage units; the real mouse is never touched). */
function drive(kind = 'cursor', seconds = 8) {
  const P = (type, x, y) => state.pointer(type, x, y);
  const W = [[569, 184], [647, 181], [722, 184]];        // the wells, in stage units
  const t0 = performance.now();
  const plan = [];                                      // [time (s), type, x, y]
  const wander = (from, dur, ax, ay) => { for (let t = 0; t < dur; t += 1 / 60) plan.push([from + t, 'move', 430 + ax * Math.sin(2 * Math.PI * t / 3.1), 200 + ay * Math.sin(2 * Math.PI * t / 2.3 + 1)]); };
  const glide = (at, dur, a, b) => { for (let t = 0; t <= dur; t += 1 / 60) { const f = 0.5 - 0.5 * Math.cos(Math.PI * t / dur); plan.push([at + t, 'move', a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]); } return at + dur; };
  if (kind === 'cursor') wander(0, seconds, 470, 230);
  if (kind === 'dimple') {      // slowly over the glass: the cover's ring, the words' hollow, the sheet, the lower band
    let at = glide(0, 1.2, [120, 120], [160, 230]);
    at = glide(at, 1.6, [160, 230], [400, 175]); at = glide(at, 1.6, [400, 175], [690, 105]);
    at = glide(at, 1.6, [690, 105], [520, 290]); at = glide(at, 1.6, [520, 290], [250, 300]);
  }
  if (kind === 'ripple') {
    const pts = [[300, 175], [520, 285], [190, 290], [690, 112], [420, 230]];
    let at = 0.3, last = [430, 200];
    for (const p of pts) { at = glide(at, 0.5, last, p); plan.push([at + 0.1, 'down', ...p], [at + 0.2, 'up', ...p]); at += 1.0; last = p; }
  }
  if (kind === 'press') {
    const pts = [[330, 190], [560, 290], [660, 108]];
    let at = 0.3, last = [430, 200];
    for (const p of pts) { at = glide(at, 0.5, last, p); plan.push([at + 0.1, 'down', ...p], [at + 1.1, 'up', ...p]); at += 2.2; last = p; }
  }
  if (kind === 'seek') {        // hover the timeline (the ghost), drag its bead along and let go; then the volume; the wheel
    const st = ([u, v]) => (FRAME_REF ? [u, v] : [(u - REF0[0]) / K, (v - REF0[1]) / K]);
    const T = (q) => st(along(LINES.timeline, q)), Vv = (q) => st(along(LINES.volume, q));
    let at = glide(0.2, 0.6, [430, 330], T(0.62));
    at = glide(at, 0.7, T(0.62), T(0.75));                   // hovering: the ghost follows
    plan.push([at + 0.15, 'down', ...T(0.75)]);
    at = glide(at + 0.2, 0.35, T(0.75), T(0.2));               // a quick pull back: the bead stretches
    at = glide(at + 0.25, 0.9, T(0.2), T(0.55));               // and slowly forward, the time riding above
    plan.push([at + 0.3, 'up', ...T(0.55)]);
    at = glide(at + 0.5, 0.6, T(0.55), Vv(0.68));
    plan.push([at + 0.1, 'down', ...Vv(0.68)]);
    at = glide(at + 0.2, 0.4, Vv(0.68), Vv(0.25));
    at = glide(at + 0.15, 0.5, Vv(0.25), Vv(0.85));
    plan.push([at + 0.2, 'up', ...Vv(0.85)]);
    for (let i = 0; i < 4; i++) plan.push([at + 0.6 + i * 0.12, 'wheel', ...Vv(0.85)]);
  }
  if (kind === 'pause') {       // let the music play, then pause it (the glass goes still), then play again
    let at = glide(2.4, 0.6, [470, 330], W[1]);
    plan.push([at + 0.1, 'down', ...W[1]], [at + 0.25, 'up', ...W[1]]);
    at = glide(at + 0.5, 0.5, W[1], [470, 340]);
    if (seconds > 7) { at = glide(at + 2.2, 0.5, [470, 340], W[1]); plan.push([at + 0.1, 'down', ...W[1]], [at + 0.25, 'up', ...W[1]]); }
  }
  if (kind === 'buttons') {
    let at = 0.3, last = [470, 120];
    for (const w of W) { at = glide(at, 0.6, last, w); at += 0.6; plan.push([at, 'down', ...w], [at + 0.3, 'up', ...w]); at += 0.9; last = w; }
    glide(at, 0.8, last, [800, 330]);
  }
  plan.sort((a, b) => a[0] - b[0]);
  return new Promise((done) => {
    let i = 0;
    const tick = () => {
      const t = (performance.now() - t0) / 1000;
      while (i < plan.length && plan[i][0] <= t) { const [, type, x, y] = plan[i++]; P(type, x, y); }
      if (t < seconds && i < plan.length) requestAnimationFrame(tick); else { P('leave', 0, 0); done(); }
    };
    tick();
  });
}

/* ------------------------------------------------------------- recording --- */
// What is really on the screen there, composed by the page itself (the window is left out of screen captures while it
// refracts): the desktop under the window, the pools, the glass bending that desktop, the words. A WebM, as base64.
const rec = { on: false, under: null, cursor: false };
// (a scripted recording shows where its pretend pointer is: an arrow like Windows' own)
function drawCursor(x, px, py, k) {
  x.save(); x.translate(px, py); x.scale(k, k);
  x.beginPath(); x.moveTo(0, 0); x.lineTo(0, 17); x.lineTo(4.2, 13.2); x.lineTo(7.2, 19.6); x.lineTo(9.6, 18.6); x.lineTo(6.7, 12.3);
  x.lineTo(12, 12.3); x.closePath();
  x.fillStyle = '#fff'; x.strokeStyle = '#000'; x.lineWidth = 1.1; x.fill(); x.stroke(); x.restore();
}
async function record(seconds = 6, fps = 30, script = null) {
  const [W, H] = G.size.canvas;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d');
  rec.on = true;
  const stream = c.captureStream(fps);
  const mr = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9', videoBitsPerSecond: 12e6 });
  const chunks = [];
  mr.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  const t = setInterval(() => {
    if (rec.under) x.drawImage(rec.under, 0, 0, W, H); else { x.fillStyle = '#000'; x.fillRect(0, 0, W, H); }
    x.drawImage(under, 0, 0); x.drawImage(canvas, 0, 0); x.drawImage(ink, 0, 0);
    if (rec.cursor && motion.pointer) drawCursor(x, motion.pointer[0] * G.size.dpr, motion.pointer[1] * G.size.dpr, G.size.dpr);
  }, 1000 / fps);
  mr.start(250);
  rec.cursor = Boolean(script);
  if (script) drive(script, seconds - 0.3);
  await new Promise((r) => setTimeout(r, seconds * 1000));
  mr.stop(); clearInterval(t); rec.on = false;
  await new Promise((r) => { mr.onstop = r; });
  const buf = new Uint8Array(await new Blob(chunks, { type: 'video/webm' }).arrayBuffer());
  let bin = ''; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
  return btoa(bin);
}

/* ----------------------------------------------------------------- loop --- */
let dirty = true, raf = 0, lastDraw = -1e9;
const CAP = Number(Q.get('fps')) || 0;           // ?fps=60: at most this often (the spike measures at the display's rate)
function redraw() { dirty = true; if (!raf && !state.paused) raf = requestAnimationFrame(frame); }
function frame(now) {
  raf = 0;
  if (state.paused) return;
  if (CAP && now - lastDraw < 1000 / CAP - 1.5) { raf = requestAnimationFrame(frame); return; }
  const moving = motionStep(now);
  if (!dirty && !SPIKE) { motion.last = 0; return; }
  lastDraw = now;
  const t0 = performance.now();
  G.draw();
  state.cpuMs = state.cpuMs * 0.95 + (performance.now() - t0) * 0.05;
  state.frames++;
  // (the gaps between frames drawn back to back while something moves: the measure of 60 fps in motion)
  if (state.lastDrawAt && now - state.lastDrawAt < 100) { state.gaps.push(now - state.lastDrawAt); if (state.gaps.length > 4000) state.gaps.shift(); }
  state.lastDrawAt = now;
  dirty = false;
  if (SPIKE || moving) raf = requestAnimationFrame(frame);
  else motion.last = 0;                // (settled: nothing more is drawn until something changes)
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
  // behind the title and artist, the two times, the volume's word (reference px): calmer, less desktop through
  G.words = [[492, 418, 830, 520], [240, 608, 322, 646], [1276, 572, 1370, 610], [1176, 290, 1330, 340]];
  for (const c of [under, ink]) { c.width = G.size.canvas[0]; c.height = G.size.canvas[1]; c.style.width = css[0] + 'px'; c.style.height = css[1] + 'px'; }
  await Promise.all(['500 40px Montserrat', '300 40px Montserrat', '400 40px Montserrat'].map((f) => document.fonts.load(f)));
  if (Q.get('deskimg')) { deskImg = await loadImage(Q.get('deskimg')); G.setDesk(deskImg); G.desk.on = 1; G.desk.map = [0, 0, 1, 1]; }
  if (SYSTEM) {
    player.track = { title: 'Nothing playing', artist: '', duration: 0 }; player.time = 0; player.dim = 'ptn';
    useCover(plainCover()); G.coverSet = false;
    host.onMedia(applyMedia);
  } else {
    await setTrack(Number(Q.get('track')) || 0);
    if (Q.has('play')) setPlaying(true);
  }
  // (the beads start where they belong: no glide in)
  { const d = player.track.duration; beads.seek.at.snap(d > 0 ? Math.min(1, player.time / d) : 0); beads.vol.at.snap(player.volume); }
  paintWords(); paintPools();
  G.draw();
  mask = G.readMask();
  passThrough(true);                 // until the pointer is seen over the glass, the mouse belongs to the desktop
  // the clock: the words layer once a second while playing; nothing is redrawn in the glass for it
  setInterval(() => {
    if (!SYSTEM && player.playing) { player.time += 1; if (player.time >= player.track.duration) command('next'); }
    if (player.playing) { beadTargets(); kickInk(); }
  }, 1000);
  for (const [type, fn] of [['pointermove', onMove], ['pointerdown', onDown], ['pointerup', onUp], ['pointercancel', onUp]]) document.addEventListener(type, fn);
  document.addEventListener('pointerleave', () => { if (!dragging) passThrough(true); motionLeave(); });
  document.addEventListener('wheel', onWheel, { passive: true });
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
      if (type === 'leave') { if (!dragging) passThrough(true); motionLeave(); beadsMove(-1e4, -1e4, { inside: false }); }
      if (type === 'wheel') onWheel({ clientX: e.clientX, clientY: e.clientY, deltaY: -1 });
    },
    setLight(k, v) { LIGHT[k] = v; redraw(); },
    record, drive, motion, setReduced,
    /** What is still moving (for the measures: nothing, once everything has settled). */
    motionInfo() {
      const m = motion, n = (s) => !s.resting;
      return { tilt: n(m.tilt), lean: n(m.lean), dimpleAt: n(m.dimpleAt), dimple: [m.dimple.x, m.dimple.target, m.dimple.v],
        press: [m.press.x, m.press.target, m.press.v], sink: m.sink.map((s) => [s.x, s.target]), rips: m.rips.length, dirty, raf: Boolean(raf),
        downBtn: m.downBtn, hoverBtn: m.hoverBtn, dragging };
    },
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
