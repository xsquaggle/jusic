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
 *     wobbling back, the buttons sinking into their wells; then the springy seek and volume beads, the music, the ink and
 *     the colour states, the window's slosh, the two small beads budding off the right end, the drop forming and
 *     melting (each in its section below); reduced motion (Windows' setting, the tray's switch, ?still) turns all of it
 *     off, crossfades only.
 * Draws only when something changed (a new screen frame, a new track, a second of the clock); ?spike draws every frame,
 * for measuring. Hooks for the shell's tests: window.__glass.
 *
 *   ?assets=  ?ss=2  ?light=0|1  ?studio=live|cycles  ?dbg=1..7  ?words=0  ?pools=0  ?bg=ref (pictures only)
 *   ?track=n  ?play  ?cover=<url>&title=&artist=&dur=   and every light-pass number by name (see LIGHT)
 *   ?deskimg=<url> (pictures only): a still image as the desktop behind the window, filling the canvas, bent through
 *   the glass as refraction would (for checking the look over a desktop at any size without the window)
 *   ?still (reduced motion)  ?m_tilt= m_lean= m_dimple= m_press= m_rip= m_sink= m_slosh= (each one's strength; 0: off)
 *   ?formed (no forming on load)  ?form (form on load outside the widget's window too)
 *   window.__glass.drive(kind, seconds): a pretend pointer playing cursor | dimple | ripple | press | buttons | seek | pause |
 *   track | drag (a pretend window moving) | beads | drop (melting, then forming) (the shell's recordings and measures use
 *   it; the real mouse is never touched)
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
  ? { bloom: 0, bloomThr: 1, bloomR: 1, bloomWarm: 0, keepRoll: LIGHT.deskKeep, sheen: 0, edgeCore: 0, ringMirror: 0, ink: 0, inkGlow: 0 }
  : { bloom: 1.5, bloomThr: 0.5, bloomR: 1.5, bloomWarm: 1, keepRoll: 0.6, sheen: 0.1, edgeCore: 0.8, ringMirror: 0.3, ink: 1, inkGlow: 0.6 });
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
function useCover(img, change = false) {
  const pal = paletteFromImage(img);
  const a = pal.a.map((v) => v / 255), m = Math.max(...a, 1e-3);
  tint = a.map((v) => v / m);
  // a track change: the old art dissolves into liquid pigment that flows off as the new cover resolves
  // (reduced motion: a plain crossfade)
  const from = change ? G.tintBase() : null;
  G.setCover(img, change); G.setTint(tint, from);
  if (change) {
    inkState.dissolve.snap(0); inkState.dissolve.target = 1; G.dissolveNoise = !motion.reduced; inkState.burst = motion.reduced ? 0 : 1;
    inkState.clearUntil = performance.now() + 4000;     // (the old colours clear within a few seconds, then the new cover leaks)
    if (!motion.reduced && mask && LIGHT.ink > 0) {
      // (let go all round, slowly: the old colours drift out and hang in the glass, as the leak does, rather than jet)
      for (let i = 0; i < 14; i++) rimDrop(1, { old: true, angle: (i / 14) * Math.PI * 2 + rnd(-0.2, 0.2), slow: 0.35 });
      G.swirl(rnd(620, 860), rnd(430, 520), 1440, 95); G.swirl(rnd(1070, 1270), rnd(390, 500), -1440, 95);
      redraw();
    }
  }
  paintWords(); paintPools(); redraw();
}
async function setTrack(i, change = true) {
  player.index = (i + TRACKS.length) % TRACKS.length;
  player.track = TRACKS[player.index];
  useCover(await loadImage(player.track.cover), change);
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
    if (media.art === art) useCover(img, media.seen === true);
    media.seen = true;
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
          let sx = m[0] * fw, sy = (1 - m[1] - m[3]) * fh, sw = m[2] * fw, sh = m[3] * fh;
          const D = rec.region && backdrop.placement && backdrop.placement.display;
          if (D) {           // (a larger piece of the screen: the window moving over it)
            sx = (rec.region.x - D.x) / D.width * fw; sy = (rec.region.y - D.y) / D.height * fh;
            sw = rec.region.width / D.width * fw; sh = rec.region.height / D.height * fh;
          }
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
  const T = tintNow();
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
  // the small beads' glyphs, once they are out on their own: the upper opens the full app, the lower hides the widget
  for (let i = 0; i < 2 && G; i++) {
    const b = utilB[i], a = Math.min(1, Math.max(0, (b.out.x - 0.75) / 0.25)) * (1 - Math.min(1, Math.max(0, b.neck.x)));
    if (a < 0.02) continue;
    const g = utilGeom(i), bu = G.meta.CX + g.C[0] / G.meta.S, bv = G.meta.CY - g.C[2] / G.meta.S, s = g.r / UTIL.r;
    c.save(); c.translate(bu, bv); c.scale(s * 0.82, s * 0.82); c.globalAlpha = a;
    c.strokeStyle = 'rgba(255,255,255,0.95)'; c.lineWidth = 2.4; c.lineCap = 'round'; c.lineJoin = 'round';
    c.shadowColor = 'rgba(12,5,7,0.8)'; c.shadowBlur = 6 * k;
    if (i === 0) {        // a window with an arrow out of its corner
      c.beginPath(); c.moveTo(1, -7); c.lineTo(-6, -7); c.lineTo(-6, 7); c.lineTo(7, 7); c.lineTo(7, 0); c.stroke();
      c.beginPath(); c.moveTo(-1, 2); c.lineTo(8, -7); c.moveTo(3, -8); c.lineTo(8, -8); c.lineTo(8, -3); c.stroke();
    } else {              // a short bar: put it away
      c.beginPath(); c.moveTo(-7, 0); c.lineTo(7, 0); c.stroke();
    }
    c.restore();
  }
}
// Soft warm pools where a floor would be, below the lobes (never a halo round the outline).
function paintPools() {
  const c = under.getContext('2d'); const k = kRef(), o = refOrigin();
  c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, under.width, under.height);
  if (deskImg && !rec.stage && !rec.deskSelf) c.drawImage(deskImg, 0, 0, under.width, under.height);
  c.setTransform(k, 0, 0, k, -o[0] * k, -o[1] * k);
  if (Q.get('bg') === 'ref') {
    c.save(); c.translate(793, 496); c.scale(0.7 * 1586, 0.8 * 992);
    const g = c.createRadialGradient(0, 0, 0, 0, 0, 1);
    g.addColorStop(0, 'rgb(27,15,17)'); g.addColorStop(1, 'rgb(15,8,10)');
    c.fillStyle = g; c.fillRect(-4, -4, 8, 8); c.restore();
  }
  if (Q.get('pools') === '0') return;
  const col = tintNow().map((v, i) => Math.round(255 * (0.55 * v + 0.45 * [1, 0.62, 0.52][i])));
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
  if (!mask || !formed()) return { inside: false };          // (while it forms or melts the mouse is the desktop's)
  const dpr = G.size.dpr;
  const x = Math.floor(cx * dpr), y = Math.floor(cy * dpr);
  const [u, v] = FRAME_REF ? [cx, cy] : toRef(cx / (canvas.getBoundingClientRect().width / STAGE.w), cy / (canvas.getBoundingClientRect().height / STAGE.h));
  // the small beads beside the right end while they are out, and the narrow gap between them and the end (it does
  // nothing, but keeps the pointer on the widget as it crosses from the end to a bead)
  const ub = utilHit(u, v);
  if (ub) return { inside: true, ...ub, u, v };
  if (x < 0 || y < 0 || x >= mask.w || y >= mask.h || !mask.data[y * mask.w + x]) return { inside: false };
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
  document.body.style.cursor = !h.inside ? 'default' : ['button', 'seek', 'volume', 'util'].includes(h.target) ? 'pointer' : h.target === 'gap' ? 'default' : 'grab';
  motionMove(x, y, h);
  beadsMove(x, y, h);
  utilMove(h);
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
  if (h.target === 'util') utilPress(h.index, true);
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
    if (h.target === 'util' && h.index === downAt.h.index) utilAct(h.index);
  }
  if (downAt && downAt.h.target === 'util') utilPress(downAt.h.index, false);
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
// (the owner: "the glass doesn't react jelly-like enough": the lobes are springs the bass pulls and every beat kicks,
// each wobbling on its own; the beat's wave rolls slower and deeper; the glass sways a little on the beat)
// (and then: "more the jelly glass itself bouncing, less the ink": three bumps kicked harder, a ring of jelly from the
// cover on every beat; the ink no longer answers the beat)
// (and then, 19 November: far too much, "it looks like it's just constantly moving"; the ripples should only ever so
// slightly bulge out of the glass on strong bass hits. So the glass is still with the music: no bass swelling, no
// bounce, no wave along the ribbon, no sway. A strong bass hit (the pulse rising through 'hit', at most one every 'gap'
// seconds) sends one soft swell out from the cover that bulges the glass, its outline too, a few px as it passes and is
// gone in about half a second. The glints and the spectrum in the fold are light, not motion: they stay.)
const MUS = { flex: 0, kick: 0, beat: 0, ring: 0.012, sway: 0, hit: 0.8, gap: 0.9, swellSpeed: 4, swellWidth: 0.45, swellDecay: 0.55,
  glint: 1, spec: 3.2, specSwing: 0.1, specWidth: 0.022, bpm: 112 };
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
/** A made-up beat (the 2D widget's capture spectrum): the same every run. (Every fourth kick is the strong one, as in
 *  real music not every kick hits hard.) */
function madeUpBeat(t, bpm) {
  const bands = new Float32Array(16);
  const n = Math.floor(t * bpm / 60), accent = n % 4 === 0 ? 1 : 0.55;
  const beat = (t * bpm / 60) % 1, kick = Math.exp(-beat * 7) * accent, off = Math.exp(-(((t * bpm / 60) + 0.5) % 1) * 9);
  for (let i = 0; i < 16; i++) {
    const x = i / 15, wob = 0.5 + 0.5 * Math.sin(t * (1.3 + i * 0.37) + i * 1.7);
    bands[i] = Math.min(1, kick * Math.exp(-x * 5) * 0.95 + (0.22 + 0.3 * wob) * Math.exp(-((x - 0.42) ** 2) / 0.08)
      + off * 0.5 * Math.exp(-((x - 0.85) ** 2) / 0.02) + 0.06);
  }
  return { bands, pulse: Math.min(1, kick * 1.1) };
}
const music = { on: new Spring('glide'), bands: new Float32Array(16), bass: 0, highs: 0, pulse: 0, beats: [], lastBeat: -1e9, t0: performance.now(),
  lobeL: new Spring({ k: 150, c: 4.2 }), lobeR: new Spring({ k: 195, c: 4.8 }), lobeB: new Spring({ k: 120, c: 3.8 }),
  sway: new Spring2({ k: 120, c: 4 }), side: 1, rings: [] };
if (host && host.onBands) host.onBands((b) => listener.feed(b));
/** Step the music; true while it is moving the glass. Its uniforms ride along with the motion's. */
function musicStep(dt) {
  const m = music;
  const t = (performance.now() - m.t0) / 1000;
  const live = player.playing && !motion.reduced && !document.hidden;
  m.on.target = live ? 1 : 0; m.on.step(dt);
  if (motion.reduced) m.on.snap(0);
  if (m.on.x < 1e-3 && !live) {
    m.beats = [];
    for (const sp of [m.lobeL, m.lobeR, m.lobeB]) sp.snap(0);
    m.rings = [];
    m.sway.snap(0, 0);
    return false;
  }
  const a = SYSTEM ? (listener.ready ? listener.analyse() : { bands: new Float32Array(16), pulse: 0 }) : madeUpBeat(t, MUS.bpm);
  for (let i = 0; i < 16; i++) m.bands[i] = a.bands[i];
  m.bass = (a.bands[0] + a.bands[1] + a.bands[2]) / 3;
  m.highs = (a.bands[11] + a.bands[12] + a.bands[13] + a.bands[14] + a.bands[15]) / 5;
  // a strong bass hit: the pulse rising through a high threshold, not too soon after the last
  if (a.pulse > MUS.hit && m.pulse <= MUS.hit && t - m.lastBeat > MUS.gap) {
    m.lastBeat = t;
    const pw = 0.6 + 0.4 * a.pulse;
    if (MUS.ring > 0) { m.rings.push({ t0: t, s: MUS.ring * pw }); if (m.rings.length > 6) m.rings.shift(); }
    // (the earlier, livelier reactions, all off by default: ?mu_beat= mu_kick= mu_sway= mu_flex=)
    if (MUS.beat > 0) { m.beats.push({ x0: -5.4, t0: t, s: MUS.beat * pw }); if (m.beats.length > 6) m.beats.shift(); }
    if (MUS.kick > 0) { m.lobeL.kick(MUS.kick * pw); m.lobeR.kick(MUS.kick * 0.85 * pw); m.lobeB.kick(-MUS.kick * 0.7 * pw); }
    if (MUS.sway > 0) { m.side = -m.side; m.sway.kick(MUS.sway * m.side, MUS.sway * 0.4); }
    m.kicked = Math.min(1, a.pulse);
  }
  m.mid = (a.bands[4] + a.bands[5] + a.bands[6] + a.bands[7] + a.bands[8] + a.bands[9]) / 6;
  // (with ?mu_flex=: the bass pulls the lobes out, a spring with little damping)
  const fl = MUS.flex > 0 ? m.bass : 0;
  m.lobeL.target = fl; m.lobeR.target = fl * 0.85; m.lobeB.target = fl * 0.5;
  m.lobeL.step(dt); m.lobeR.step(dt); m.lobeB.step(dt); m.sway.step(dt);
  m.rings = m.rings.filter((r) => t - r.t0 < 2.5);
  m.pulse = a.pulse;
  m.beats = m.beats.filter((b) => t - b.t0 < 4.5);
  return true;
}
function musicUniforms() {
  const m = music, t = (performance.now() - m.t0) / 1000, on = m.on.x;
  return {
    flex: [MUS.flex * m.lobeL.x * on, MUS.flex * m.lobeR.x * on, MUS.flex * m.lobeB.x * on],
    jigB: [0, 1, 2, 3, 4, 5].map((i) => (m.rings[i] ? [-5.0, 0.3, t - m.rings[i].t0, m.rings[i].s * on] : [0, 0, -1, 0])),
    swellK: [MUS.swellSpeed, MUS.swellWidth, MUS.swellDecay],
    sway: [m.sway.x * 0.05 * on, m.sway.y * 0.05 * on],
    beats: [0, 1, 2, 3, 4, 5].map((i) => (m.beats[i] ? [m.beats[i].x0, t - m.beats[i].t0, m.beats[i].s * on, 0] : [0, -1, 0, 0])),
    beatK: [4.5, 1.0, 1.0],
    music: [m.bass, m.highs * MUS.glint, t, on],
    bands: m.bands,
    spec: [MUS.spec, MUS.specSwing, MUS.specWidth, 0],
  };
}

/* ------------------------------------------------------ ink and colour --- */
// Pigment slowly bleeds out of the cover (its lower edge weeps threads) and flows through the glass on slow currents
// (renderer.js FS_INK). A track change: the old art dissolves into liquid pigment that flows off across the ribbon
// while the next cover resolves. Pause: the colour drains to silver and the ink fades (the glass goes still); play:
// colour floods back out of the cover. Reduced motion: no ink; the cover and the colour crossfade. ?ink=0 turns it off.
const inkState = {
  colour: new Spring({ k: 10, c: 6.3 }), dissolve: new Spring({ k: 9, c: 6 }),
  burst: 0, flood: 0, t0: performance.now(), pausedAt: -1e9, wasPlaying: null, clearUntil: 0,
};
inkState.colour.snap(1); inkState.dissolve.snap(1);
function tintNow() { return G ? G.tintNow() : tint; }
const rnd = (a, b) => a + Math.random() * (b - a);
const mixv = (a, b, t) => a + (b - a) * t;
/** Is a point (reference px) on the glass? (the click-through's own silhouette) */
function onGlassRef(u, v) {
  if (!mask) return false;
  const r = canvas.getBoundingClientRect();
  const cx = FRAME_REF ? u : (u - REF0[0]) / K * (r.width / STAGE.w), cy = FRAME_REF ? v : (v - REF0[1]) / K * (r.height / STAGE.h);
  const x = Math.floor(cx * G.size.dpr), y = Math.floor(cy * G.size.dpr);
  return x >= 0 && y >= 0 && x < mask.w && y < mask.h && Boolean(mask.data[y * mask.w + x]);
}
const COVER_C = [295, 421], COVER_HALF = 151;
/**
 * Pigment leaving the cover (the 2D widget's rimDrop): a drop on the rim with a jet behind it. In still liquid a jet
 * rolls up into a mushroom, which is the curl of ink. Down and to the right by default, toward the lower band, never up
 * among the words; a track change lets go all round (the old cover's colours).
 */
function rimDrop(kick = 0, { old = false, angle = null, slow = 1 } = {}) {
  const a = angle ?? rnd(0.35, 1.45);
  const dx = Math.cos(a), dy = Math.sin(a), m = Math.max(Math.abs(dx), Math.abs(dy));
  const x = COVER_C[0] + dx / m * (COVER_HALF + 10), y = COVER_C[1] + dy / m * (COVER_HALF + 10);
  if (!onGlassRef(x + dx * 30, y + dy * 30)) return;             // (it would jet straight into the wall)
  const k = Math.min(1, kick);
  const speed = mixv(rnd(150, 260), rnd(400, 640), k) * slow;
  G.drop(x, y, { radius: mixv(rnd(10, 14), rnd(15, 21), k), amount: mixv(0.32, 0.55, k), coverUv: [0.5 + dx / m * 0.4, 0.5 - dy / m * 0.4], old });
  G.push(x + dx * 8, y + dy * 8, dx * speed, dy * speed, mixv(32, 46, k));
}
/** What the music and the player do to the liquid this frame (the 2D widget's react()). */
function inkReact(dt) {
  // (the owner: the music should bounce the glass, not the ink; and then, 19 November: no drops jetting off the cover at
  // an interval either. The ink is now a constant, slow leak from the cover while it plays, suspended as ink in oil
  // (renderer.js LEAK_GLSL, FS_INK; INK below), and the beat leaves it alone.)
  music.kicked = 0;
  stirStep(dt);
}
// The leak while playing (?ink_leak= ink_out= ink_reach= ink_jet= ink_jetReach= ink_flow= ink_fade= ink_vort= ink_stir=):
// how much pigment the rim lets go, how fast it drifts out from the rim (reference px a second) and over how far it
// slows, the liquid let out where it leaks (px a second) and over how far, the slow circulation's strength, how long
// pigment lasts (s), how much of the liquid's small curls are kept, how strongly the pointer stirs it.
const INK = { leak: 4, out: 30, reach: 70, jet: 45, jetReach: 80, flow: 230, fade: 24, vort: 2.5, stir: 0.9 };
for (const k of Object.keys(INK)) if (Q.has('ink_' + k)) INK[k] = Number(Q.get('ink_' + k));
// The pointer stirs the ink as it moves over the glass (the owner: in the old player "the mouse would be able to interact
// with it and swirl it around"): every frame it is on the glass and moving, the liquid under it is pushed along with
// it (a spoon drawn through oil), so the pigment trails, curls round behind it and settles. Only on the glass.
const stir = { at: null, prev: null, v: [0, 0] };
function stirStep(dt) {
  if (!stir.at || !G.inkOn || dt <= 0) { stir.prev = stir.at; stir.v = [0, 0]; return; }
  if (stir.prev) {
    const vx = (stir.at[0] - stir.prev[0]) / dt, vy = (stir.at[1] - stir.prev[1]) / dt;
    const k = 1 - Math.exp(-dt / 0.05);
    stir.v = [stir.v[0] + (vx - stir.v[0]) * k, stir.v[1] + (vy - stir.v[1]) * k];
    const sp = Math.hypot(stir.v[0], stir.v[1]);
    if (sp > 20) {
      // (each frame a small share of the pointer's speed is given to the liquid under it, so it is drawn along over the
      // few frames the pointer takes to pass; a flick does not fling it across the glass)
      const c = Math.min(1, 900 / sp) * Math.min(dt, 0.05) * 6 * INK.stir;
      G.push(stir.at[0], stir.at[1], stir.v[0] * c, stir.v[1] * c, 34);
    }
  }
  stir.prev = stir.at;
}
/** Step the ink and the colour; true while either is still moving. */
function inkStep(dt) {
  const st = inkState, playing = player.playing, now = performance.now();
  if (playing !== st.wasPlaying) {
    if (st.wasPlaying !== null) {
      // (play: colour floods back out round the cover's edges, a seep, not jets)
      if (playing) st.flood = motion.reduced ? 0 : 0.6;
      else st.pausedAt = now;
    } else if (playing) st.flood = motion.reduced ? 0 : 0.5;
    st.wasPlaying = playing;
  }
  st.colour.target = playing ? 1 : 0;
  st.colour.set(playing ? { k: 30, c: 11 } : { k: 10, c: 6.3 });       // back quickly, draining slowly
  const was = st.colour.resting && st.dissolve.resting;
  st.colour.step(dt); st.dissolve.step(dt);
  G.colour = Math.max(0, Math.min(1, st.colour.x)); G.dissolve = Math.max(0, Math.min(1, st.dissolve.x));
  st.burst *= Math.exp(-dt / 0.6); st.flood *= Math.exp(-dt / 0.9);
  if (st.burst < 0.01) st.burst = 0; if (st.flood < 0.01) st.flood = 0;
  const flowing = !motion.reduced && LIGHT.ink > 0 && !document.hidden && formed() && (playing || now - st.pausedAt < 4500 || st.burst > 0);
  if (flowing) {
    G.inkOn = true;
    if (playing) inkReact(dt);
    G.stepInk(dt, { fade: !playing ? 1.1 : now < st.clearUntil ? 2 : INK.fade, seep: playing ? 1 : 0, burst: st.burst, flood: st.flood, time: (now - st.t0) / 1000,
      flow: (playing ? INK.flow : 160) * 2.06, vort: INK.vort, iterations: 16,
      leakK: [INK.leak, playing ? INK.out : 0, INK.reach], leakV: [playing ? INK.jet : 0, INK.jetReach] });
  } else if (G.inkOn) { G.inkOn = false; G.clearInk(); dirty = true; }
  const colouring = !st.colour.resting || !st.dissolve.resting;
  if (colouring || !was) { paintWords(); paintPools(); }
  return flowing || colouring;
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
// (the owner, 19 November: "why does it interact when my mouse isn't touching it? If anything, I should just be able to
// see the reflection of my cursor appear as my mouse draws closer." So the glass no longer turns or leans toward the
// pointer at all (tilt and lean are left to the slosh); instead the cursor is reflected in the glass (renderer.js,
// uCursor), more as it nears the glass: from nothing reflectNear CSS px off the outline to full some 35 px off it. Light only.
// ?m_reflect= its strength (0: off), m_reflectNear= (CSS px), m_reflectSize= how big the image is beside the arrow.)
const RM = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
// (the owner, 17 November: "a little bit stronger", and the press to squish more like jelly)
const MOT = { tilt: 0.065, lean: 0.06, dimple: 0.06, dimpleR: 0.2, press: 0.11, pressR: 1.3, rip: 0.015, ripSpeed: 9, ripWave: 0.38,
  ripDecay: 0.6, jig: 0.022, jigSpeed: 3.4, jigWave: 1.1, jigDecay: 0.9, sink: 1, shape: 1, slosh: 1, reflect: 1, reflectNear: 90, reflectSize: 0.8 };
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
  near: new Spring({ k: 120, c: 22 }), cursorAt: [0, 0], cursorM: [0, 0, 0, 1],   // the cursor's reflection: how near, where
};
/**
 * The nearest point of the glass's outline to a point of the page (CSS px), from the click-through's shape: for every
 * pixel, the nearest pixel on the other side of the outline (two sweeps, each pixel taking the nearest of its
 * neighbours' nearest). Outside the glass: how far it is, the outline's nearest point, the way out there.
 */
let nearOut = null, nearIn = null;
function nearestField(m, seed) {
  const { w, h, data } = m, nn = new Int32Array(w * h).fill(-1);
  for (let i = 0; i < nn.length; i++) if (Boolean(data[i]) === seed) nn[i] = i;
  const d2 = (i, j) => { const dx = (i % w) - (j % w), dy = ((i / w) | 0) - ((j / w) | 0); return dx * dx + dy * dy; };
  const take = (i, k) => { const j = nn[k]; if (j >= 0 && (nn[i] < 0 || d2(i, j) < d2(i, nn[i]))) nn[i] = j; };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x; if (nn[i] === i) continue;
    if (x > 0) take(i, i - 1);
    if (y > 0) { take(i, i - w); if (x > 0) take(i, i - w - 1); if (x < w - 1) take(i, i - w + 1); }
  }
  for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) {
    const i = y * w + x; if (nn[i] === i) continue;
    if (x < w - 1) take(i, i + 1);
    if (y < h - 1) { take(i, i + w); if (x < w - 1) take(i, i + w + 1); if (x > 0) take(i, i + w - 1); }
  }
  return nn;
}
function setMask(m) {
  mask = m;
  nearOut = nearestField(m, true);        // (outside: the nearest pixel of the glass)
  nearIn = nearestField(m, false);        // (on the glass: the nearest pixel off it)
}
/** The pointer and the outline: { d } CSS px off the glass (negative: on it), { m } the outline's nearest point, { n } the way out. */
function glassNear(cx, cy) {
  if (!mask || !nearOut) return null;
  const dpr = G.size.dpr, w = mask.w, x = Math.floor(cx * dpr), y = Math.floor(cy * dpr);
  if (x < 0 || y < 0 || x >= w || y >= mask.h) return null;
  const i = y * w + x, inside = Boolean(mask.data[i]), j = (inside ? nearIn : nearOut)[i];
  if (j < 0) return null;
  const mx = ((j % w) + 0.5) / dpr, my = (((j / w) | 0) + 0.5) / dpr;
  const dx = cx - mx, dy = cy - my, d = Math.hypot(dx, dy);
  if (d < 0.75) return null;              // (right on the outline: no way out to be had; the last one stays)
  const n = inside ? [-dx / d, -dy / d] : [dx / d, dy / d];
  return { d: inside ? -d : d, m: [mx, my], n };
}
/** Where a point of the page (CSS px) lies in the model's frame (root units: x right, z up). */
function rootAt(cx, cy) {
  const r = canvas.getBoundingClientRect();
  const [u, v] = FRAME_REF ? [cx, cy] : toRef(cx / (r.width / STAGE.w), cy / (r.height / STAGE.h));
  return [(u - G.meta.CX) * G.meta.S, (G.meta.CY - v) * G.meta.S];
}
function setReduced(on) {
  motion.reduced = on;
  if (on) {
    motion.tilt.snap(0, 0); motion.lean.snap(0, 0); motion.dimple.snap(0); motion.press.snap(0); motion.rips = []; motion.jig = null; motion.near.snap(0);
    motion.sink.forEach((s) => s.snap(0));
    slosh.o.snap(0, 0); slosh.v = [0, 0]; slosh.vPrev = [0, 0];
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
    const p = rootAt(x, y);
    // the cursor's reflection: where the pointer is, the outline's nearest point, and how near (nothing turns or
    // leans: light only). It shows from reflectNear px off the glass, fully as it reaches the outline, and has passed
    // out of the glass a few px in (the shader mirrors it across the outline)
    const gn = glassNear(x, y);
    if (gn) {
      const nr = Math.min(1, Math.max(0, (1 - gn.d / MOT.reflectNear) / 0.6)) * Math.min(1, Math.max(0, 1 + gn.d / 24));
      m.cursorAt = [x, y]; m.cursorM = [gn.m[0], gn.m[1], gn.n[0], gn.n[1]];
      m.near.target = formed() && !(h.inside && h.target === 'util') ? nr * nr * (3 - 2 * nr) : 0;
    } else if (!h.inside) m.near.target = 0;
    else m.cursorAt = [x, y];
    stir.at = h.inside ? refOf(x, y) : null;     // (the pointer stirs the ink while it is on the glass: stirStep)
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
  m.pointer = null; m.hoverBtn = -1; m.tilt.to(0, 0); m.lean.to(0, 0); m.dimple.target = 0; m.near.target = 0; stir.at = null;
  sinkTargets(); if (!m.reduced) redraw();
}
function motionDown(x, y, h) {
  const m = motion;
  if (h.target === 'button') m.downBtn = h.index;
  sinkTargets();
  if (!m.reduced) {
    const p = rootAt(x, y);
    if (MOT.rip > 0) { m.rips.push({ x: p[0], z: p[1], t0: performance.now() / 1000 }); if (m.rips.length > 4) m.rips.shift(); }
    if (h.target === 'body' || h.target === 'cover') {
      m.pressAt = p; m.press.set(JELLY.in); m.press.target = MOT.press; m.pressing = true;
      slosh.grab = p;                 // (where the glass is held, if this press becomes a drag of the window)
      if (G.inkOn) { const [u, v] = refOf(x, y); G.splash(u, v, 270, 70); G.drop(u, v, { radius: 18, amount: 0.5, color: tint }); }
    }
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
/* ----------------------------------------------------------------- slosh --- */
// Dragging the window (phase 3, the window and the beads): the glass is jelly with liquid in it. The window's
// acceleration drives a lightly damped spring: as the window sets off the glass lags behind where it is held (its far
// parts most, the cover with the glass round it), the surface turns back (the highlights slide) and the ink is pushed
// the other way; a steady drag lets it settle (liquid in a glass moving steadily is at rest); when the window stops the
// glass carries on, swings back and settles with a wobble or two. The window says where it is after every move (the
// shell's 'widget:moved'; never setPosition). Reduced motion: none. ?m_slosh= (0: off)
const SLOSH = { gain: 0.17, max: 0.36, k: 85, c: 4.6, tilt: 0.7, ink: 0.3 };
const slosh = { o: new Spring2({ k: SLOSH.k, c: SLOSH.c }), pos: null, last: null, v: [0, 0], vPrev: [0, 0], grab: [0, 0], lastAt: 0 };
/** Where the window is now (screen DIPs: CSS px of this page). */
function sloshFeed(x, y) {
  if (motion.reduced || !(MOT.slosh > 0)) return;
  slosh.pos = [x, y];
  if (!slosh.last) slosh.last = [x, y];
  redraw();
}
/** One frame of the slosh; true while it moves. */
function sloshStep(dt) {
  const s = slosh;
  if (motion.reduced || !(MOT.slosh > 0) || !G) { s.o.snap(0, 0); s.pos = s.last = null; return false; }
  // the window's velocity this frame, in root units a second (x right, z up)
  const r = canvas.getBoundingClientRect();
  const rootPerCss = (FRAME_REF ? 1 : K * STAGE.w / r.width) * G.meta.S;
  let vx = 0, vz = 0;
  if (s.pos && s.last) { vx = (s.pos[0] - s.last[0]) * rootPerCss / dt; vz = -(s.pos[1] - s.last[1]) * rootPerCss / dt; }
  if (s.pos) s.last = s.pos.slice();
  // (eased over a few frames: the mouse's moves arrive unevenly against the frames)
  s.v[0] += (vx - s.v[0]) * 0.45; s.v[1] += (vz - s.v[1]) * 0.45;
  if (Math.abs(s.v[0]) + Math.abs(s.v[1]) < 1e-3) s.v = [0, 0];
  const ax = s.v[0] - s.vPrev[0], az = s.v[1] - s.vPrev[1];
  s.vPrev = s.v.slice();
  if (ax || az) {
    s.o.kick(-ax * SLOSH.gain * MOT.slosh, -az * SLOSH.gain * MOT.slosh);
    // the liquid inside sloshes the other way: the ink is pushed through the body (reference px a second)
    const a = Math.hypot(ax, az);
    if (G.inkOn && a > 0.6) {
      const f = -SLOSH.ink / G.meta.S;
      G.push(330, 430, ax * f, -az * f, 150); G.push(1180, 420, ax * f, -az * f, 150);
    }
  }
  s.o.step(dt);
  return !s.o.resting || s.v[0] !== 0 || s.v[1] !== 0;
}
/** The lag as shown: eased toward a most, so a hard yank never tears the glass. */
function sloshShown() {
  const o = slosh.o, m = Math.hypot(o.x, o.y), f = 1 / (1 + m / SLOSH.max);
  return [o.x * f, o.y * f];
}

/* ------------------------------------------------------- the drop forming --- */
// When the widget appears the drop forms: two beads of glass swell where the lobes will be (the bulb first, the right
// lobe a moment later), each pointing at the other; a neck reaches out from each and they meet, the neck thickens into
// the waist and the whole drop settles with a little overshoot; the words and controls come up as it finishes. On close
// it melts away the same way, backwards, the lobes slumping as they shrink. The model is drawn moved (renderer.js
// formAt); the click-through waits until it has formed. Reduced motion: the widget fades in and out. ?formed: formed
// from the start (pictures, films and the shell's tests ask for it unless they film the forming).
// (how far it has come, f: 0 nothing .. 1 formed, runs along a timed ramp so every stage is seen (a spring alone rushes
// the start and crawls at the end), the spring following it; the forming ends with a kick: the drop bulges a little and
// wobbles once or twice like jelly)
const FORM = { inT: 1.45, outT: 1.25, follow: { k: 170, c: 20 }, jelly: { k: 150, c: 6.5 }, kick: 0.8 };
const form = { f: new Spring(FORM.follow), ramp: null, dir: 1, then: null, melting: false, fade: 1 };
function formed() { return form.dir === 1 && !form.ramp && form.f.x > 0.97; }
function formRamp(to, T) { form.ramp = { from: form.f.x, to, t0: performance.now(), T }; form.f.set(FORM.follow); form.dir = to > 0.5 ? 1 : -1; }
/** The words, controls and pools: up as the drop finishes forming (also how a reduced-motion fade is done). */
function formAlpha() {
  const f = form.f.x, words = Math.min(1, Math.max(0, (f - 0.82) / 0.16));
  return { words: words * form.fade, pools: Math.min(1, Math.max(0, f)) * form.fade, glass: form.fade };
}
function applyFormAlpha() {
  const a = formAlpha();
  ink.style.opacity = a.words; under.style.opacity = a.pools; canvas.style.opacity = a.glass;
}
function appear() {
  form.melting = false; form.then = null;
  if (motion.reduced) {
    form.f.snap(1); form.dir = 1; form.ramp = null; form.fade = 0; applyFormAlpha();
    const t0 = performance.now();
    const step = (now) => { form.fade = Math.min(1, (now - t0) / 350); applyFormAlpha(); if (form.fade < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
    return;
  }
  form.fade = 1;
  formRamp(1, FORM.inT);
  redraw();
}
/** It melts away; then(): the window may hide. */
function vanish(then) {
  form.then = then || null; util.want = false;
  passThrough(true);
  if (motion.reduced) {
    const t0 = performance.now();
    const step = (now) => {
      form.fade = Math.max(0, 1 - (now - t0) / 350); applyFormAlpha();
      if (form.fade > 0) requestAnimationFrame(step); else { form.f.snap(0); form.dir = -1; const t = form.then; form.then = null; if (t) t(); }
    };
    requestAnimationFrame(step);
    return;
  }
  form.melting = true;
  formRamp(0, FORM.outT * Math.max(0.3, form.f.x));
  redraw();
}
/** One frame of the forming; true while it moves. Hands the renderer how far it has come (null once formed). */
function formStep(dt) {
  const was = form.f.resting;
  const R = form.ramp;
  if (R) {
    const p = Math.min(1, (performance.now() - R.t0) / 1000 / R.T);
    form.f.target = R.from + (R.to - R.from) * p;
    if (p >= 1) {
      form.ramp = null;
      if (R.to === 1) { form.f.set(FORM.jelly); form.f.kick(FORM.kick); }       // (formed: a little bulge, a wobble)
    }
  }
  form.f.step(dt);
  const f = form.f.x;
  const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  if (form.dir === 1 && !form.ramp && form.f.resting && f >= 1) { G.form = null; if (!was) applyFormAlpha(); return false; }
  // (the overshoot past 1 swells the whole drop a little, and it settles back)
  const over = f > 0.8 ? (f - 1) * 0.9 : 0;
  // forming: the beads swell first, the necks reach and meet, the waist thickens; melting: the same, backwards
  G.form = {
    s: [Math.max(1e-3, sm(0, 0.5, f) * (1 + over)), Math.max(1e-3, sm(0.07, 0.57, f) * (1 + over))],
    reach: sm(0.42, 0.72, f), thick: sm(0.6, 0.96, f), melt: form.melting ? 1 : 0,
  };
  applyFormAlpha();
  if (form.dir === -1 && !form.ramp && f < 0.004 && form.f.resting) {
    form.f.snap(0); form.melting = false;
    const t = form.then; form.then = null; if (t) t();
    return false;
  }
  return true;
}

/* ------------------------------------------------- the beads by the end --- */
// The two small glass beads beside the right end: the upper one opens the full app, the lower one hides the widget.
// They bud off the end while the pointer is over its right side: the end swells where each comes from, a bead grows out
// of it on a neck that stretches and thins as the bead moves away, until it pinches off (the bead pulls round with a
// wobble, the end's stub springs back) and the bead rests just clear of the end. When the pointer leaves they go back:
// as a bead touches the end the neck joins again and draws it in. The lower one follows a moment after the upper.
// Pressed, a bead squashes; let go, it wobbles. Reduced motion: they are there or not, no neck, nothing moves.
// (Root units: 1 = 100 reference px, x right, y away from the camera, z up.)
const UTIL = {
  rest: [[8.04, 0.05, 0.53], [8.04, 0.05, -0.03]],
  from: [[7.47, 0.06, 0.53], [7.49, 0.0, -0.03]],      // where each buds from: the neck's foot, just inside the end
  r: 0.17, side: 1330, pinch: 0.26, join: 0.08, bud: 0.1, budR: 0.17, stretch: 0.3,
};
const utilB = UTIL.rest.map(() => ({
  out: new Spring({ k: 20, c: 7 }),            // 0 inside the end .. 1 resting out (a slow bud, a little overshoot)
  joined: true, neck: new Spring({ k: 420, c: 24 }), wob: new Spring({ k: 260, c: 6 }), bud: new Spring({ k: 220, c: 8 }),
  press: new Spring({ k: 600, c: 30 }),
}));
utilB.forEach((b) => { b.neck.snap(1); b.wob.snap(1); });
const util = { want: false, since: 0 };
/** Where bead i is now: centre (root units), radius, and how far its surface is from the neck's foot. */
function utilGeom(i) {
  const b = utilB[i], e = Math.max(0, b.out.x), A = UTIL.from[i], R0 = UTIL.rest[i];
  const C = R0.map((c, k) => (A[k] - (k === 0 ? 0.08 : 0)) * (1 - e) + c * e);
  const r = UTIL.r * Math.min(1, e / 0.45) ** 0.7 * (1 - 0.1 * b.press.x);
  const L = Math.hypot(C[0] - A[0], C[1] - A[1], C[2] - A[2]);
  return { C, r, L, gap: L - r };
}
/** Is (u, v) (reference px) on a bead that is out, or in the gap between the end and the beads? */
function utilHit(u, v) {
  if (!G || utilB[0].out.x < 0.3) return null;
  for (let i = 0; i < 2; i++) {
    const g = utilGeom(i); if (g.r < 0.05) continue;
    const bu = G.meta.CX + g.C[0] / G.meta.S, bv = G.meta.CY - g.C[2] / G.meta.S;
    if (Math.hypot(u - bu, v - bv) < g.r / G.meta.S + 6) return { target: 'util', index: i };
  }
  const top = G.meta.CY - UTIL.rest[0][2] / G.meta.S - 8, bottom = G.meta.CY - UTIL.rest[1][2] / G.meta.S + 8;
  if (u > 1528 && u < G.meta.CX + UTIL.rest[0][0] / G.meta.S && v > top && v < bottom) return { target: 'gap' };
  return null;
}
function utilMove(h) {
  const want = Boolean(h.inside && ((h.u > UTIL.side && h.target !== 'gap') || h.target === 'util' || (h.target === 'gap' && util.want)));
  if (want && !util.want) util.since = performance.now();
  if (want !== util.want) { util.want = want; redraw(); }
}
function utilPress(i, down) {
  const b = utilB[i];
  b.press.target = down && !motion.reduced ? 1 : 0;
  if (!down && !motion.reduced) b.wob.kick(1.6);         // (let go: it springs up and wobbles)
  redraw(); paintWords();
}
/** A bead clicked: the upper opens the full app, the lower hides the widget (the drop melts away first). */
function utilAct(i) {
  state.utilActs = (state.utilActs || []).concat(i);
  if (i === 0) { if (host && host.openApp) host.openApp(); }
  else vanish(() => { if (host && host.hide) host.hide(); else if (host) host.close(); });
}
/** One frame of the beads; true while they move. Hands the renderer their shape and the end's swelling. */
function utilStep(dt) {
  const now = performance.now();
  let moving = false;
  const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  utilB.forEach((b, i) => {
    const want = util.want && formed() && (i === 0 || now - util.since > 90);
    b.out.target = want ? 1 : 0;
    if (motion.reduced) {
      b.out.snap(b.out.target); b.joined = !want; b.neck.snap(want ? 0 : 1); b.wob.snap(1); b.bud.snap(0); b.press.snap(0);
      return;
    }
    for (const s of [b.out, b.neck, b.wob, b.bud, b.press]) s.step(dt);
    const g = utilGeom(i);
    const pull = smooth(0, UTIL.pinch, g.gap);
    if (b.joined && want && g.gap > UTIL.pinch) {
      // it pinches off: the neck snaps back into the bead, which pulls round and wobbles; the end's stub springs back
      b.joined = false; b.neck.target = 0; b.wob.target = 1; b.wob.kick(-2.2); b.bud.target = 0; b.bud.kick(-0.5);
    } else if (!b.joined && !want && g.gap < UTIL.join) {
      // touching the end again: the neck joins and draws it in
      b.joined = true; b.neck.target = 1; b.neck.v = 0;
    }
    if (b.joined) {
      b.wob.target = 1 + UTIL.stretch * pull;                         // drawn out toward the end as the neck stretches
      b.bud.target = UTIL.bud * (0.55 + 0.45 * pull) * smooth(0, 0.15, b.out.x);
    }
    if (!(b.out.resting && b.neck.resting && b.wob.resting && b.bud.resting && b.press.resting)) moving = true;
  });
  const geo = [0, 1].map(utilGeom);
  G.beads = {
    c: geo.map((g) => [...g.C, g.r]),
    a: utilB.map((b, i) => [...UTIL.from[i], motion.reduced ? 0 : Math.max(0, Math.min(1, b.neck.x))]),
    w: utilB.map((b, i) => {
      const pull = smooth(0, UTIL.pinch, geo[i].gap);
      return [Math.max(0.6, b.wob.x) * (1 - 0.18 * b.press.x), 0.55 - 0.4 * pull, 0.62, 0];
    }),
  };
  util.bud = utilB.map((b, i) => [UTIL.from[i][0] + 0.02, UTIL.from[i][2], b.bud.x, UTIL.budR]);
  if (moving) paintWords();
  return moving;
}

/** Step the springs; hand the renderer what it needs. True while anything is still moving. */
function motionStep(now) {
  const m = motion;
  const dt = m.last ? Math.min(0.05, (now - m.last) / 1000) : 1 / 60;
  m.last = now;
  const springs = [m.tilt, m.lean, m.dimpleAt, m.dimple, m.press, m.near, ...m.sink];
  const was = springs.map((s) => s.resting);
  for (const s of springs) s.step(dt);
  const t = performance.now() / 1000;
  m.rips = m.rips.filter((r) => t - r.t0 < MOT.ripDecay * 5);
  if (m.jig && t - m.jig.t0 > MOT.jigDecay * 5) m.jig = null;
  const sinking = m.sink.some((s) => !s.resting) || m.sink.some((s, i) => !was[5 + i]);
  if (sinking) paintWords();
  const playingMusic = musicStep(dt);
  const inking = inkStep(dt);
  if (inking) dirty = true;
  const sloshing = sloshStep(dt);
  const sl = sloshShown();
  const forming = formStep(dt);
  const budding = utilStep(dt);
  const budOn = util.bud && util.bud.some((b) => Math.abs(b[2]) > 1e-5);
  if (forming || budding) dirty = true;
  const moving = springs.some((s) => !s.resting) || m.rips.length > 0 || Boolean(m.jig) || playingMusic || inking || sloshing || forming || budding;
  const any = moving || budOn || Math.abs(m.tilt.x) + Math.abs(m.tilt.y) + Math.abs(m.lean.x) + Math.abs(m.lean.y) + Math.abs(m.dimple.x) + Math.abs(m.near.x)
    + Math.abs(m.press.x) + m.sink.reduce((a, s) => a + Math.abs(s.x), 0) > 1e-5;
  G.motion = any || playingMusic ? {
    bud: util.bud || null,
    // (the slosh turns the surface back as the glass lags: the highlights swing with it)
    tilt: [m.tilt.x + music.sway.x * 0.05 * music.on.x - sl[0] * SLOSH.tilt, m.tilt.y + music.sway.y * 0.05 * music.on.x - sl[1] * SLOSH.tilt, m.lean.x, m.lean.y],
    slosh: [sl[0], sl[1], slosh.grab[0], slosh.grab[1]],
    dimple: [m.dimpleAt.x, m.dimpleAt.y, m.dimple.x, MOT.dimpleR],
    cursor: [m.cursorAt[0], m.cursorAt[1], Math.max(0, m.near.x) * MOT.reflect, MOT.reflectSize],
    cursorM: m.cursorM, page: [canvas.getBoundingClientRect().width, canvas.getBoundingClientRect().height],
    press: [m.pressAt[0], m.pressAt[1], m.press.x, MOT.pressR],
    rips: [0, 1, 2, 3].map((i) => (m.rips[i] ? [m.rips[i].x, m.rips[i].z, t - m.rips[i].t0, MOT.rip] : [0, 0, -1, 0])),
    ripK: [MOT.ripSpeed, MOT.ripWave, MOT.ripDecay],
    jig: m.jig ? [m.jig.x, m.jig.z, t - m.jig.t0, m.jig.s] : [0, 0, -1, 0],
    jigK: [MOT.jigSpeed, MOT.jigWave, MOT.jigDecay],
    shapeK: MOT.shape,
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
  if (kind === 'reflect') {     // the pointer drawing near from above the waist, along just off the outline, onto the glass, off below
    // (slowly, as a hand would: the reflection rising to meet it)
    let at = glide(0.3, 3.2, [470, 15], [470, 172]);
    at = glide(at + 0.5, 1.8, [470, 170], [330, 140]);
    at = glide(at + 0.4, 1.3, [330, 140], [430, 222]);
    at = glide(at + 0.7, 1.6, [430, 222], [560, 320]);
    at = glide(at + 0.4, 1.2, [560, 320], [600, 395]);
    plan.push([at + 0.2, 'leave', 0, 0]);
  }
  if (kind === 'stir') {        // let the ink gather, then stir it under the cover: a slow stroke out, back, a slow circle
    let at = glide(2.5, 1.6, [140, 252], [330, 268]);
    at = glide(at + 0.6, 1.4, [330, 268], [130, 238]);
    for (let t = 0; t <= 2.4; t += 1 / 60) plan.push([at + 0.5 + t, 'move', 215 + 38 * Math.cos(2 * Math.PI * t / 1.2), 258 + 22 * Math.sin(2 * Math.PI * t / 1.2)]);
    plan.push([at + 3.2, 'leave', 0, 0]);
  }
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
  if (kind === 'track') {       // let the ink build, then the next track, and the one after
    let at = glide(2.0, 0.6, [470, 330], W[2]);
    plan.push([at + 0.1, 'down', ...W[2]], [at + 0.25, 'up', ...W[2]]);
    at = glide(at + 0.4, 0.5, W[2], [520, 340]);
    if (seconds > 6.5) { at = glide(at + 1.6, 0.5, [520, 340], W[2]); plan.push([at + 0.1, 'down', ...W[2]], [at + 0.25, 'up', ...W[2]]); at = glide(at + 0.4, 0.5, W[2], [520, 340]); }
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
  if (kind === 'beads') {       // over the right end the beads bud off; onto the upper one, a press; away (they go back); again
    let at = glide(0.2, 0.6, [470, 330], [560, 268]);
    at = glide(at + 0.1, 0.7, [560, 268], [760, 190]);
    at = glide(at + 1.3, 0.45, [760, 190], [806, 186]);
    at = glide(at, 0.3, [806, 186], [821, 172]);
    plan.push([at + 0.35, 'down', 821, 172], [at + 0.6, 'up', 821, 172]);
    at = glide(at + 1.0, 0.7, [821, 172], [430, 220]);
    at = glide(at + 1.3, 0.6, [430, 220], [770, 200]);
  }
  if (kind === 'grab') {        // (on screen: the shell moves the real window meanwhile, as a drag does)
    glide(0.1, 0.4, [470, 330], [299, 210]);
    plan.push([0.6, 'down', 299, 210], [6.1, 'up', 299, 210]);
  }
  if (kind === 'drop') {        // the drop melts away (as on close), then forms again (as when the widget appears)
    plan.push([0.6, 'vanish', 0, 0], [3.4, 'appear', 0, 0]);
  }
  if (kind === 'drag') {        // hold the glass by the body and drag the window: a quick pull, a flick back, a slow circle
    // ('win': where the window is, CSS px from the film's top left; the pointer stays on the glass where it holds it)
    const slide = (at, dur, a, b) => { for (let t = 0; t <= dur; t += 1 / 60) { const f = 0.5 - 0.5 * Math.cos(Math.PI * t / dur); plan.push([at + t, 'win', a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]); } return at + dur; };
    const G0 = [299, 210];
    plan.push([0, 'win', 60, 70]);
    glide(0.1, 0.4, [470, 330], G0);
    plan.push([0.6, 'down', ...G0]);
    let at = slide(0.85, 0.42, [60, 70], [370, 70]);           // a quick pull to the right, and stop
    at = slide(at + 1.25, 0.3, [370, 70], [170, 250]);         // a flick down and to the left
    const c = [170, 160];                                     // a slow circle, round and back to where it began
    for (let t = 0; t <= 1.6; t += 1 / 60) { const a = Math.PI / 2 + 2 * Math.PI * (0.5 - 0.5 * Math.cos(Math.PI * t / 1.6)); plan.push([at + 1.2 + t, 'win', c[0] + 90 * Math.cos(a), c[1] + 90 * Math.sin(a)]); }
    plan.push([at + 3.3, 'up', ...G0]);
  }
  plan.sort((a, b) => a[0] - b[0]);
  return new Promise((done) => {
    let i = 0;
    const tick = () => {
      const t = (performance.now() - t0) / 1000;
      while (i < plan.length && plan[i][0] <= t) {
        const [, type, x, y] = plan[i++];
        if (type === 'win') winAt(x, y); else if (type === 'vanish') vanish(); else if (type === 'appear') appear(); else P(type, x, y);
      }
      if (t < seconds && i < plan.length) requestAnimationFrame(tick); else { P('leave', 0, 0); done(); }
    };
    tick();
  });
}

/* ------------------------------------------------------------- recording --- */
// What is really on the screen there, composed by the page itself (the window is left out of screen captures while it
// refracts): the desktop under the window, the pools, the glass bending that desktop, the words. A WebM, as base64.
const rec = { on: false, under: null, cursor: false, stage: null, win: [0, 0] };
/** A pretend window position (CSS px; the films and measures of the slosh): the glass feels it as a move of its window,
 *  and a film that shows the window moving (rec.stage) puts it there over the backdrop, bending what is behind it. */
function winAt(x, y) {
  sloshFeed(x, y);
  rec.win = [x, y];
  if (rec.stage && G) {
    const d = G.size.dpr, [W, H] = G.size.canvas, { w: FW, h: FH } = rec.stage;
    G.desk.map = [x * d / FW, 1 - (y * d + H) / FH, W / FW, H / FH];
  }
}
// (a scripted recording shows where its pretend pointer is: an arrow like Windows' own)
function drawCursor(x, px, py, k) {
  x.save(); x.translate(px, py); x.scale(k, k);
  x.beginPath(); x.moveTo(0, 0); x.lineTo(0, 17); x.lineTo(4.2, 13.2); x.lineTo(7.2, 19.6); x.lineTo(9.6, 18.6); x.lineTo(6.7, 12.3);
  x.lineTo(12, 12.3); x.closePath();
  x.fillStyle = '#fff'; x.strokeStyle = '#000'; x.lineWidth = 1.1; x.fill(); x.stroke(); x.restore();
}
async function record(seconds = 6, fps = 30, script = null, opts = {}) {
  const [W, H] = G.size.canvas;
  // (a drag of the window, over a still backdrop: a larger frame, the widget moving across it; or, on screen, a region
  // of the screen larger than the window (opts.region, screen DIPs), the real window moving over it)
  const moving = script === 'drag' && deskImg;
  const region = !moving && opts.region ? opts.region : null;
  rec.region = region;
  const FW = moving ? Math.round(W * 1.5) : region ? Math.round(region.width * G.size.dpr) : W;
  const FH = moving ? Math.round(H * 1.75) : region ? Math.round(region.height * G.size.dpr) : H;
  const c = document.createElement('canvas'); c.width = FW; c.height = FH;
  const x = c.getContext('2d');
  rec.on = true;
  if (moving) { rec.stage = { w: FW, h: FH }; paintPools(); winAt(60, 70); }
  else if (deskImg) { rec.deskSelf = true; paintPools(); }      // (the backdrop drawn by the film itself: the pools fade alone)
  const stream = c.captureStream(fps);
  const mr = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9', videoBitsPerSecond: 12e6 });
  const chunks = [];
  mr.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  const t = setInterval(() => {
    const d = G.size.dpr, pw = region && backdrop.placement ? backdrop.placement.window : null;
    const ox = moving ? Math.round(rec.win[0] * d) : pw ? Math.round((pw.x - region.x) * d) : 0;
    const oy = moving ? Math.round(rec.win[1] * d) : pw ? Math.round((pw.y - region.y) * d) : 0;
    if (moving) x.drawImage(deskImg, 0, 0, FW, FH);
    else if (deskImg) x.drawImage(deskImg, 0, 0, W, H);
    else if (rec.under) x.drawImage(rec.under, 0, 0, FW, FH); else { x.fillStyle = '#000'; x.fillRect(0, 0, FW, FH); }
    const fa = formAlpha();       // (the forming's fades are on the layers' style: drawn here by hand)
    x.globalAlpha = fa.pools; x.drawImage(under, ox, oy); x.globalAlpha = fa.glass; x.drawImage(canvas, ox, oy);
    x.globalAlpha = fa.words; x.drawImage(ink, ox, oy); x.globalAlpha = 1;
    if (rec.cursor && motion.pointer) drawCursor(x, ox + motion.pointer[0] * d, oy + motion.pointer[1] * d, d);
  }, 1000 / fps);
  mr.start(250);
  rec.cursor = Boolean(script);
  if (script) drive(script, seconds - 0.3);
  await new Promise((r) => setTimeout(r, seconds * 1000));
  mr.stop(); clearInterval(t); rec.on = false; rec.region = null;
  if (moving) { rec.stage = null; G.desk.map = [0, 0, 1, 1]; redraw(); }
  if (rec.deskSelf || moving) { rec.deskSelf = false; paintPools(); }
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

/** The canvases at the display's own scale (again whenever it changes: the window dragged onto a monitor scaled
 *  differently, or Windows' setting changed). Returns false if nothing changed. */
function layoutCanvases() {
  const css = FRAME_REF ? [1586, 992] : [STAGE.w, STAGE.h];
  const dpr = window.devicePixelRatio || 1;
  if (G.size && G.size.dpr === dpr) return false;
  const ref = FRAME_REF ? [0, 0, 1586, 992] : [REF0[0], REF0[1], STAGE.w * K, STAGE.h * K];
  G.resize(css[0], css[1], dpr, ref);
  for (const c of [under, ink]) { c.width = G.size.canvas[0]; c.height = G.size.canvas[1]; c.style.width = css[0] + 'px'; c.style.height = css[1] + 'px'; }
  return true;
}
function watchScale() {
  // (a query for the scale as it is now: it fires once when that stops being true)
  const mq = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
  mq.addEventListener('change', () => {
    if (layoutCanvases()) {
      // the words, the pools, the glass and its click-through shape, all again at the new scale
      paintWords(); paintPools(); G.draw(); setMask(G.readMask()); placeBackdrop(); redraw();
      state.rescaled = (state.rescaled || 0) + 1;
    }
    watchScale();
  }, { once: true });
}

async function main() {
  G = await createGlass(canvas, { assets: Q.get('assets') || '/design/captures/raw/mercury3d/live/', ss: Number(Q.get('ss')) || 2,
    studio: Q.get('studio') || 'live', light: LIGHT, dbg: Number(Q.get('dbg')) || 0 });
  LINES = await fetch('/tools/mercury3d/lines.json').then((r) => r.json());
  layoutCanvases();
  // behind the title and artist, the two times, the volume's word (reference px): calmer, less desktop through
  G.words = [[492, 418, 830, 520], [240, 608, 322, 646], [1276, 572, 1370, 610], [1176, 290, 1330, 340]];
  await Promise.all(['500 40px Montserrat', '300 40px Montserrat', '400 40px Montserrat'].map((f) => document.fonts.load(f)));
  if (Q.get('deskimg')) { deskImg = await loadImage(Q.get('deskimg')); G.setDesk(deskImg); G.desk.on = 1; G.desk.map = [0, 0, 1, 1]; }
  if (SYSTEM) {
    player.track = { title: 'Nothing playing', artist: '', duration: 0 }; player.time = 0; player.dim = 'ptn';
    useCover(plainCover()); G.coverSet = false;
    host.onMedia(applyMedia);
  } else {
    await setTrack(Number(Q.get('track')) || 0, false);
    if (Q.has('play')) setPlaying(true);
  }
  // (the beads start where they belong: no glide in)
  { const d = player.track.duration; beads.seek.at.snap(d > 0 ? Math.min(1, player.time / d) : 0); beads.vol.at.snap(player.volume); }
  // the drop forms as the widget appears (in the widget's window, unless ?formed; ?form anywhere); otherwise formed
  const FORM_ON_LOAD = (WIDGET && !Q.has('formed')) || Q.has('form');
  if (FORM_ON_LOAD) { form.f.snap(0); applyFormAlpha(); G.form = { s: [1e-3, 1e-3], reach: 0, thick: 0, melt: 0 }; } else form.f.snap(1);
  paintWords(); paintPools();
  // (the scale may have changed while all that loaded: the window is often made on one monitor and placed on another)
  layoutCanvases(); paintWords(); paintPools();
  G.draw();
  setMask(G.readMask());
  watchScale();
  if (host && host.onMoved) host.onMoved((p) => sloshFeed(p.x, p.y));
  // the tray's Show / hide: hiding, the drop melts away first and then the window goes; shown again, it forms
  if (host && host.onAppear) host.onAppear(() => appear());
  if (host && host.onVanish) host.onVanish(() => vanish(() => { if (host.hide) host.hide(); }));
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
  Object.defineProperty(state, 'formed', { get: () => formed() && form.f.resting });
  Object.assign(state, { appear, vanish, util, utilB,
    /** Nothing about the beads by the end still moving (the shell's click-through test waits for it). */
    utilResting: () => utilB.every((b) => b.out.resting && b.neck.resting && b.wob.resting && b.bud.resting) });
  state.ready = true;
  if (FORM_ON_LOAD) appear();
  redraw();
}
main().catch((e) => { state.error = String((e && e.stack) || e); console.error(e); });
