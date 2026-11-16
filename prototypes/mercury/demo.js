/**
 * Prototype harness for Mercury. Stands in for the real engine: a handful of
 * test tracks, a small synth so the chrome has real audio to react to, and the
 * pointer handling the widget window will use.
 *
 * ?capture=1 switches off the clock and the synth so frames can be stepped
 * one at a time and photographed.
 */

import { createMercury } from './mercury.js';
import { STAGE, L, seekY, seekProgress, volValue, volX, volY } from './shape.js';
import { paletteFromImage } from './palette.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const CAPTURE = params.has('capture');
if (CAPTURE) document.body.classList.add('capture');
const WIDGET = params.has('widget');      // running in the real transparent widget window (tools/widget-proto)
if (WIDGET) document.body.classList.add('widget-mode');
const host = WIDGET ? window.widgetHost : null;   // the window's own controls, exposed by its preload

const TRACKS = [
  { title: 'Silver Current', artist: 'Artist 02', cover: 'covers/silver-current.jpg', duration: 226, bpm: 96, root: 45 },
  { title: 'Cold Winters', artist: 'Lawson', cover: 'covers/cold-winters.jpg', duration: 198, bpm: 84, root: 41 },
  { title: 'Verdant Static', artist: 'Artist 05', cover: 'covers/verdant-static.jpg', duration: 254, bpm: 110, root: 43 },
  { title: 'Violet Hour', artist: 'Artist 11', cover: 'covers/violet-hour.jpg', duration: 187, bpm: 124, root: 48 },
  { title: 'Amber Drift', artist: 'Lawson', cover: 'covers/amber-drift.jpg', duration: 241, bpm: 90, root: 38 },
];

// ?cover=<url>&title=&artist=&dur= put a real cover and its words in place of the first test track.
if (params.get('cover')) {
  Object.assign(TRACKS[0], {
    cover: params.get('cover'), title: params.get('title') || TRACKS[0].title,
    artist: params.get('artist') || '', duration: Number(params.get('dur')) || TRACKS[0].duration,
  });
}

// "Any media" proof, in the widget window only (?source=system): the widget shows and controls
// whatever Windows says is playing on this PC, from any app, in place of the test tracks.
const SYSTEM = Boolean(host && host.onMedia && params.get('source') === 'system');

const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/* ------------------------------------------------------------------ setup --- */

const widget = $('widget');
const canvas = $('gl');
const mercury = createMercury(canvas, {
  reducedMotion: params.has('still'), family: 'Montserrat',
  ...(params.has('uncapped') ? { maxRender: null } : {}),      // ?uncapped lifts the 1920x1080 render cap, for inspection only
});

const view = { scale: 1, x: 0, y: 0 };

function layout() {
  const fit = Math.min(1.5, (innerWidth - 16) / STAGE.w, (innerHeight - 16) / STAGE.h);
  view.fit = Number(params.get('scale')) || Math.max(0.35, fit) * (view.size || 1);
  view.scale = view.fit;
  const dpr = Number(params.get('dpr')) || Math.min(window.devicePixelRatio || 1, 2);
  mercury.resize(STAGE.w * view.scale, STAGE.h * view.scale, dpr, Number(params.get('ss')) || undefined);
  applyTransform();
  placeBackdrop();
  wake();
}
function applyTransform() {
  widget.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.scale})`;
}
addEventListener('resize', layout);

/* ------------------------------------------------------------- refraction --- */

// The widget's look, in the widget window only (?refract=live, which its shell gives by default):
// bend what is really behind the window.
// The window's host keeps it out of screen captures, so a capture of its monitor shows exactly
// what it is covering. Frames are handed to the renderer as they arrive; it uploads the newest
// one when it next draws. ?rfps=N sets the capture rate (30), ?rmax=N the capture's longest side.
// ?glass=0.88 is the alternative being weighed against it: a nearly opaque body, no capture.
const REFRACT = host && host.backdropSource ? params.get('refract') : null;
const backdrop = { on: true, track: null, sourceId: null, placement: null, frames: 0, settings: null, error: null };
mercury.backdrop.floor = Number(params.get('glass')) || 0;

/** Tell the renderer where the stage sits inside the captured monitor. Everything is in the screen's own units. */
function placeBackdrop(placement = backdrop.placement) {
  if (!placement) return;
  backdrop.placement = placement;
  const rect = widget.getBoundingClientRect();
  const { window: win, display } = placement;
  mercury.setBackdropMap(
    (win.x - display.x + rect.left) / display.width, (win.y - display.y + rect.top) / display.height,
    rect.width / STAGE.w / display.width, rect.height / STAGE.h / display.height);
  if (backdrop.track && placement.sourceId !== backdrop.sourceId) startBackdrop();      // it was moved to another monitor
  wake();
}

async function startBackdrop() {
  stopBackdrop();
  try {
    const placement = await host.backdropSource();
    backdrop.sourceId = placement.sourceId;
    const mandatory = { chromeMediaSource: 'desktop', chromeMediaSourceId: placement.sourceId, maxFrameRate: Number(params.get('rfps')) || 30 };
    const longest = Number(params.get('rmax'));
    if (longest) { mandatory.maxWidth = longest; mandatory.maxHeight = longest; }
    const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { mandatory } });
    const track = backdrop.track = stream.getVideoTracks()[0];
    backdrop.settings = track.getSettings();
    backdrop.error = null;
    placeBackdrop(placement);
    const reader = new MediaStreamTrackProcessor({ track, maxBufferSize: 1 }).readable.getReader();
    for (;;) {
      const { value, done } = await reader.read();
      if (done || backdrop.track !== track) { if (value) value.close(); break; }
      backdrop.frames++;
      mercury.setBackdropFrame(value);
      if (mercury.state.reducedMotion && !raf && !CAPTURE) mercury.render();      // standing still: nothing else would redraw it
    }
  } catch (error) {
    backdrop.error = String((error && error.message) || error);
    console.error('refraction: ' + backdrop.error);
  }
}

function stopBackdrop() {
  if (backdrop.track) backdrop.track.stop();
  backdrop.track = null;
}

if (REFRACT) {
  host.onPlacement(placeBackdrop);
  // A hidden widget must cost nothing, so the capture stops with it.
  document.addEventListener('visibilitychange', () => { if (document.hidden) stopBackdrop(); else if (backdrop.on) startBackdrop(); });
  // The switch in the tray menu. Off: stop capturing and let the opaque body come back.
  if (host.onRefract) host.onRefract((on) => {
    backdrop.on = on;
    if (on) { if (!document.hidden) startBackdrop(); } else { stopBackdrop(); mercury.setBackdropFrame(null); }
    wake();
  });
}

/* ----------------------------------------------------------------- player --- */

const player = { index: 0, playing: false, time: 88, volume: 0.72, muted: false, track: TRACKS[0] };
const images = new Map();

/** A cover as the tile wants it: the middle square of the picture, no larger than 1024 px. */
function loadImage(src) {
  if (images.has(src)) return images.get(src);
  const promise = new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  }).then((img) => {
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    if (side <= 1024 && img.naturalWidth === img.naturalHeight) return img;
    const to = Math.min(side, 1024);
    return createImageBitmap(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side,
      { resizeWidth: to, resizeHeight: to, resizeQuality: 'high' });
  });
  images.set(src, promise);
  return promise;
}

async function setTrack(index, { immediate = false } = {}) {
  player.index = (index + TRACKS.length) % TRACKS.length;
  const track = player.track = TRACKS[player.index];
  const img = await loadImage(track.cover);
  const palette = paletteFromImage(img);
  mercury.setCover(img, immediate ? null : palette);
  if (immediate) {
    mercury.setPalette(palette, true);
    mercury.state.trans = 1;
    mercury.state.transActive = false;
  }
  // The new words surface as the new cover resolves.
  setTimeout(() => { mercury.setLabels({ title: track.title, artist: track.artist }); wake(); }, immediate ? 0 : 520);
  if (!immediate) player.time = 0;
  synth.setTrack(track);
  wake();
}

function setPlaying(on) {
  player.playing = on;
  mercury.setPlaying(on);
  if (on && !SYSTEM) synth.start(); else synth.stop();
  $('hint').style.opacity = on ? 0 : 1;
  wake();
}

function setVolume(v, muted = false) {
  player.volume = Math.min(1, Math.max(0, v));
  player.muted = muted;
  mercury.setVolume(player.volume, muted);
  synth.setVolume(muted ? 0 : player.volume);
  wake();
}

/* ----------------------------------------------------------- any media --- */

// What Windows reports, and what the widget does with it. The title, artist and cover are the
// other app's; play, pause, next, previous and seeking are sent back to it. A control it does
// not allow is dimmed and does nothing. Volume stays this page's own and moves nothing yet. The
// liquid moves to what the PC is playing (the listening block below).
const media = { state: null, key: null, art: null, base: 0, at: 0, sent: [] };

/** A plain glass tile for a source that gives no cover. */
function plainCover() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const fill = g.createLinearGradient(0, 0, 256, 256);
  fill.addColorStop(0, '#3a3d46'); fill.addColorStop(1, '#15161b');
  g.fillStyle = fill; g.fillRect(0, 0, 256, 256);
  return c;
}

async function applyMedia(state) {
  media.state = state;
  const has = Boolean(state && state.source);
  const key = has ? `${state.source}|${state.title}|${state.artist}` : '';
  const changed = key !== media.key;
  media.key = key;
  if (changed) {
    player.track = { title: has ? state.title || 'Untitled' : 'Nothing playing', artist: has ? state.artist || '' : '', duration: 0, bpm: 96 };
    const { title, artist } = player.track;
    setTimeout(() => { if (media.key === key) { mercury.setLabels({ title, artist }); wake(); } }, 520);
  }
  player.track.duration = has ? Math.max(0, state.duration || 0) : 0;
  media.base = has ? state.position : 0;
  media.at = has ? state.updatedAt : 0;
  media.rate = has ? state.rate || 1 : 0;
  if (Boolean(has && state.playing) !== player.playing) setPlaying(Boolean(has && state.playing));
  mercury.setLabels({ dim: !has ? 'ptn' : (state.canPrev ? '' : 'p') + (state.canPlay || state.canPause || state.canToggle ? '' : 't') + (state.canNext ? '' : 'n') });
  // The cover: the other app's artwork, which often arrives a moment after its title.
  const art = has ? state.art || null : null;
  if (changed || art !== media.art) {
    media.art = art;
    let img;
    try { img = art ? await loadImage(art) : plainCover(); } catch { img = plainCover(); }
    if (media.art === art) mercury.setCover(img, paletteFromImage(img));
  }
  wake();
}

/** Where the other app is in its track now: its last report, carried forward while it plays. */
function mediaTime() {
  const d = player.track.duration;
  const t = media.base + (player.playing && media.at ? (Date.now() - media.at) / 1000 * media.rate : 0);
  return d > 0 ? Math.min(d, Math.max(0, t)) : 0;
}

function mediaCommand(command, value) {
  media.sent.push(command);
  host.media(command, value);
}

/* -------------------------------------------------------------- listening --- */

// In "any media" the sound is another app's and never passes through this page, so the liquid
// had nothing to move to but a made-up beat. Now the widget's shell listens to what the PC is
// really playing (tools/widget-proto/sound-helper.ps1: whichever sound output carries the music,
// analysed and dropped, never stored) and hands this page its spectrum about 30 times a second.
// Here it becomes the same 16 bands and beat pulse the test synth gives. The level is evened
// out, so a quiet song moves the liquid as much as a loud one; silence stays still.
// (The browser's own loopback was tried first. It hears only the output Windows calls the
// default, and on this PC the music goes out through another one: the liquid lay dead.)
const listener = (() => {
  const target = new Float32Array(16), smooth = new Float32Array(16), bands = new Float32Array(16);
  let bassAvg = 0, pulse = 0, level = 0.12, fedAt = -1e9;
  const state = { get ready() { return performance.now() - fedAt < 2000; }, level: 0, lines: 0 };

  /** A line from the helper: 16 loudnesses on a decibel scale. */
  function feed(values) {
    for (let i = 0; i < 16; i++) target[i] = (Number(values[i]) || 0) ** 1.6 * (0.9 + 0.9 * (i / 16));
    fedAt = performance.now();
    state.lines++;
  }
  function analyse() {
    let top = 0;
    for (let i = 0; i < 16; i++) {
      // Up at once, down a little slower: a kick shows as a kick.
      smooth[i] = target[i] > smooth[i] ? target[i] : smooth[i] + (target[i] - smooth[i]) * 0.35;
      top = Math.max(top, smooth[i]);
    }
    // Follow the loudest band: up quickly, down slowly. Below the floor it is silence, not a quiet song.
    level = top > level ? level + (top - level) * 0.3 : Math.max(0.12, level * 0.9992);
    state.level = level;
    const gain = 0.85 / level;
    // What stands out above the song's own steady level is what moves the liquid.
    for (let i = 0; i < 16; i++) bands[i] = Math.min(1, Math.max(0, smooth[i] * gain - 0.25) / 0.75);
    const bass = (bands[0] + bands[1] + bands[2]) / 3;
    bassAvg += (bass - bassAvg) * 0.04;
    const hit = Math.max(0, bass - bassAvg * 0.92) * 3.2 + bass * 0.18;
    pulse = hit > pulse ? pulse + (hit - pulse) * 0.6 : pulse * 0.9;
    return { bands, pulse: Math.min(1, pulse) };
  }
  return { feed, analyse, state };
})();

/* ------------------------------------------------------------------ synth --- */

/** A few oscillators and some noise: enough of a beat to drive the visuals. */
const synth = (() => {
  let ctx = null, master = null, analyser = null, timer = 0, step = 0, nextTime = 0;
  let track = TRACKS[0];
  let freq = null;
  const bands = new Float32Array(16);
  let bassAvg = 0, pulse = 0;
  const midi = (n) => 440 * 2 ** ((n - 69) / 12);

  function ensure() {
    if (ctx) return;
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = player.volume * 0.5;
    analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.72;
    master.connect(analyser);
    analyser.connect(ctx.destination);
    freq = new Uint8Array(analyser.frequencyBinCount);
  }

  function kick(t) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.13);
    g.gain.setValueAtTime(1, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.34);
    o.connect(g).connect(master);
    o.start(t); o.stop(t + 0.36);
  }
  function hat(t, level) {
    const len = Math.floor(ctx.sampleRate * 0.05);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2;
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = buf; f.type = 'highpass'; f.frequency.value = 7000; g.gain.value = level;
    s.connect(f).connect(g).connect(master);
    s.start(t);
  }
  function note(t, n, dur, type, level, cutoff) {
    const o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    o.type = type; o.frequency.value = midi(n);
    f.type = 'lowpass'; f.frequency.setValueAtTime(cutoff, t); f.frequency.exponentialRampToValueAtTime(Math.max(120, cutoff * 0.3), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(level, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f).connect(g).connect(master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  function schedule() {
    const beat = 60 / track.bpm / 4;                     // sixteenths
    while (nextTime < ctx.currentTime + 0.12) {
      const s = step % 32;
      if (s % 8 === 0 || s === 22) kick(nextTime);
      if (s % 2 === 0) hat(nextTime, s % 4 === 2 ? 0.16 : 0.07);
      const bassline = [0, 0, 7, 0, 3, 0, 10, 5];
      if (s % 4 === 0 || s % 8 === 6) note(nextTime, track.root - 12 + bassline[(s >> 2) % 8], beat * 2.6, 'sawtooth', 0.34, 620);
      const arp = [0, 3, 7, 10, 12, 10, 7, 3];
      if (s % 2 === 1) note(nextTime, track.root + 12 + arp[(s >> 1) % 8], beat * 1.8, 'triangle', 0.1, 3600);
      if (s === 0 || s === 16) for (const iv of [0, 7, 10, 15]) note(nextTime, track.root + iv, beat * 15, 'sawtooth', 0.045, 1500);
      nextTime += beat;
      step++;
    }
  }

  return {
    setTrack(t) { track = t; },
    setVolume(v) { if (master) master.gain.setTargetAtTime(v * 0.5, ctx.currentTime, 0.03); },
    start() {
      if (CAPTURE) return;
      ensure();
      ctx.resume();
      nextTime = ctx.currentTime + 0.05;
      clearInterval(timer);
      timer = setInterval(schedule, 25);
    },
    stop() { clearInterval(timer); },
    /** 16 log-spaced bands and a beat pulse, the same shape the real engine will send. */
    analyse() {
      if (!analyser) return { bands, pulse: 0 };
      analyser.getByteFrequencyData(freq);
      const nyquist = ctx.sampleRate / 2;
      for (let i = 0; i < 16; i++) {
        const f0 = 32 * (14000 / 32) ** (i / 16), f1 = 32 * (14000 / 32) ** ((i + 1) / 16);
        const from = Math.max(1, Math.floor(f0 / nyquist * freq.length));
        const to = Math.max(from + 1, Math.ceil(f1 / nyquist * freq.length));
        let peak = 0;
        for (let j = from; j < to; j++) peak = Math.max(peak, freq[j]);
        bands[i] = Math.min(1, (peak / 255) ** 1.6 * (0.9 + 0.9 * (i / 16)));
      }
      const bass = (bands[0] + bands[1] + bands[2]) / 3;
      bassAvg += (bass - bassAvg) * 0.04;
      const hitLevel = Math.max(0, bass - bassAvg * 0.92) * 3.2 + bass * 0.18;
      pulse = hitLevel > pulse ? pulse + (hitLevel - pulse) * 0.6 : pulse * 0.9;
      return { bands, pulse: Math.min(1, pulse) };
    },
  };
})();

/** A scripted spectrum for capture mode: same beat every run. */
function fakeAudio(t, bpm) {
  const bands = new Float32Array(16);
  const beat = (t * bpm / 60) % 1;
  const kick = Math.exp(-beat * 7);
  const off = Math.exp(-(((t * bpm / 60) + 0.5) % 1) * 9);
  for (let i = 0; i < 16; i++) {
    const x = i / 15;
    const wob = 0.5 + 0.5 * Math.sin(t * (1.3 + i * 0.37) + i * 1.7);
    bands[i] = Math.min(1, kick * Math.exp(-x * 5) * 0.95 + (0.22 + 0.3 * wob) * Math.exp(-((x - 0.42) ** 2) / 0.08)
      + off * 0.5 * Math.exp(-((x - 0.85) ** 2) / 0.02) + 0.06);
  }
  return { bands, pulse: Math.min(1, kick * 1.1) };
}

/* ----------------------------------------------------------------- labels --- */

let tipState = null;       // { x, y, text }: the time preview lens

function paintLabels() {
  const duration = player.track.duration;
  const shown = dragging === 'seek' ? dragProgress * duration : player.time;
  mercury.setLabels({ cur: fmt(shown), rem: '−' + fmt(Math.max(0, duration - shown)) });
  if (tipState) mercury.setTip(tipState.x, tipState.y, tipState.text);
  else mercury.setTip(0, 0, null);
}

const seekTip = (x, progress) => {
  const cx = Math.min(L.seek.x1 - 6, Math.max(L.seek.x0 + 6, x));
  return { x: cx, y: seekY(cx) - 25, text: fmt(progress * player.track.duration) };
};
const volTip = () => ({ x: volX(player.volume), y: volY(volX(player.volume)) + 24, text: Math.round(player.volume * 100) + '%' });

/* ---------------------------------------------------------------- pointer --- */

let dragging = null;         // 'seek' | 'volume' | 'body' | 'button'
let dragProgress = 0;
let downTarget = null;
let dragStart = null;
let lastPointer = null;
let dragVel = [0, 0];

// In the real widget window, a click outside the liquid belongs to whatever is behind it.
// The window is told to let the mouse through whenever the pointer is not over the shape.
// It still reports mouse moves, so the page takes the mouse back the moment the pointer returns.
let passing = null;
function passThrough(on) {
  if (!host || on === passing) return;
  passing = on;
  host.setIgnore(on);
}
// Dragging the body moves the window itself there, so distances have to be measured on the screen.
const dragPoint = (event) => (host && event.screenX !== undefined ? [event.screenX, event.screenY] : [event.clientX, event.clientY]);

function toStage(event) {
  const rect = widget.getBoundingClientRect();
  return [(event.clientX - rect.left) / rect.width * STAGE.w, (event.clientY - rect.top) / rect.height * STAGE.h];
}

function onMove(event) {
  const [x, y] = toStage(event);
  const h = mercury.pointerMove(x, y);
  passThrough(!h.inside && !dragging);
  wake();

  if (dragging === 'seek') {
    dragProgress = seekProgress(x);
    mercury.setSeekDrag(true, dragProgress, y - seekY(x));
    tipState = seekTip(x, dragProgress);
    return;
  }
  if (dragging === 'volume') {
    setVolume(volValue(x));
    tipState = volTip();
    return;
  }
  if (dragging === 'body' || (downTarget && dragStart && (downTarget.target === 'body' || downTarget.target === 'cover'))) {
    const [sx, sy] = dragPoint(event);
    const dx = sx - dragStart.cx, dy = sy - dragStart.cy;
    if (dragging !== 'body' && Math.hypot(dx, dy) > 5) { dragging = 'body'; mercury.release(); if (host) host.drag('start'); }
    if (dragging === 'body') {
      if (host) {
        host.drag('move');                      // the window follows the cursor
      } else {
        view.x = dragStart.vx + dx;
        view.y = dragStart.vy + dy;
        applyTransform();
      }
      const now = performance.now();
      if (lastPointer) {
        const dt = Math.max(1, now - lastPointer.t) / 1000;
        dragVel = [(sx - lastPointer.x) / dt, (sy - lastPointer.y) / dt];
        mercury.setDragVelocity(dragVel[0] / view.scale, dragVel[1] / view.scale);
      }
      lastPointer = { x: sx, y: sy, t: now };
      return;
    }
  }

  mercury.setHover(h.target);
  if (h.target === 'seek' && !dragging) {
    tipState = seekTip(x, seekProgress(x));
  } else if (!dragging) {
    tipState = null;
  }
  document.body.style.cursor = !h.inside || h.target === 'gap' ? 'default'
    : ['button', 'seek', 'volume', 'mute', 'util'].includes(h.target) ? 'pointer' : 'grab';
}

function onDown(event) {
  if (event.button !== undefined && event.button !== 0) return;
  const [x, y] = toStage(event);
  const h = mercury.pointerMove(x, y);
  if (!h.inside) return;            // outside the chrome: this click belongs to the desktop
  event.preventDefault();
  if (h.target === 'gap') return;   // between the end and its beads: nothing to press, nothing to drag
  try { widget.setPointerCapture(event.pointerId); } catch { /* synthetic events have no capture */ }
  downTarget = h;
  const [sx, sy] = dragPoint(event);
  dragStart = { cx: sx, cy: sy, vx: view.x, vy: view.y };
  lastPointer = null;
  wake();

  if (h.target === 'button') {
    dragging = 'button';
    mercury.pressButton(h.index, true);
    mercury.pressAt(x, y, 0.7);
  } else if (h.target === 'seek') {
    dragging = 'seek';
    dragProgress = seekProgress(x);
    mercury.setSeekDrag(true, dragProgress);
    mercury.ripple(x, y, 0.7);
    tipState = seekTip(x, dragProgress);
  } else if (h.target === 'util') {
    dragging = 'util';
    mercury.pressUtil(h.index, true);
    mercury.ripple(x, y, 0.5);
  } else if (h.target === 'volume') {
    dragging = 'volume';
    mercury.setVolDrag(true);
    setVolume(volValue(x));
    mercury.ripple(x, y, 0.5);
  } else {
    mercury.pressAt(x, y, 1);
  }
}

function onUp(event) {
  const [x, y] = toStage(event);
  const h = mercury.hit(x, y);
  mercury.release();
  wake();

  if (dragging === 'button' && downTarget) {
    mercury.pressButton(downTarget.index, false);
    if (h.target === 'button' && h.index === downTarget.index) {
      if (SYSTEM) {
        // The other app does it, and the widget follows what Windows then reports.
        const st = media.state && media.state.source ? media.state : null;
        if (st && h.index === 0 && st.canPrev) { mercury.lurch(-1); mediaCommand('prev'); }
        if (st && h.index === 1 && (st.canPlay || st.canPause || st.canToggle)) { setPlaying(!player.playing); mediaCommand(player.playing ? 'play' : 'pause'); }
        if (st && h.index === 2 && st.canNext) { mercury.lurch(1); mediaCommand('next'); }
      } else {
        if (h.index === 0) { mercury.lurch(-1); setTrack(player.index - 1); }
        if (h.index === 1) setPlaying(!player.playing);
        if (h.index === 2) { mercury.lurch(1); setTrack(player.index + 1); }
      }
    }
  } else if (dragging === 'util' && downTarget) {
    mercury.pressUtil(downTarget.index, false);
    if (h.target === 'util' && h.index === downTarget.index) {
      $('hint').textContent = h.index === 0 ? 'Would open the full app' : 'Would hide the widget';
      $('hint').style.opacity = 1;
      if (host && h.index === 1) host.close();
    }
  } else if (dragging === 'seek') {
    player.time = dragProgress * player.track.duration;
    if (SYSTEM && media.state && media.state.canSeek && player.track.duration > 0) {
      media.base = player.time; media.at = Date.now();
      mediaCommand('seek', player.time);
    }
    mercury.setProgress(dragProgress);
    mercury.setSeekDrag(false);
    mercury.springs.seekBead.kick(0.0);
    tipState = null;
  } else if (dragging === 'volume') {
    mercury.setVolDrag(false);
    tipState = null;
  } else if (dragging === 'body') {
    mercury.setDragVelocity(0, 0);
    if (host) host.drag('end');
  } else if (downTarget) {
    if (downTarget.target === 'mute' && h.target === 'mute') setVolume(player.volume, !player.muted);
  }
  dragging = null;
  downTarget = null;
  dragStart = null;
  passThrough(!h.inside);
}

// While the capture tools are photographing (?capture=1) only their own pretend pointer counts: the
// real mouse of whoever is using the PC crossing the capture window put the beads and the dimple
// away in the middle of a shot.
const real = (fn) => (CAPTURE ? () => {} : fn);
widget.addEventListener('pointermove', real(onMove));
widget.addEventListener('pointerdown', real(onDown));
widget.addEventListener('pointerup', real(onUp));
widget.addEventListener('pointercancel', real(onUp));
widget.addEventListener('pointerleave', real(() => { if (!dragging) { mercury.pointerLeave(); tipState = null; passThrough(true); wake(); } }));
widget.addEventListener('wheel', (event) => {
  const [x, y] = toStage(event);
  if (!mercury.hit(x, y).inside) return;
  event.preventDefault();
  setVolume(player.volume + (event.deltaY < 0 ? 0.05 : -0.05));
  tipState = volTip();
  clearTimeout(onMove.tipTimer);
  onMove.tipTimer = setTimeout(() => { if (!dragging) tipState = null; wake(); }, 900);
}, { passive: false });

/* ------------------------------------------------------------------- loop --- */

// Two speeds. While anything is happening the widget runs every frame. Once it
// is paused and left alone it drops to a slow breathing cadence: the surface
// still drifts and the pigment still turns, at a fraction of the cost.
let raf = 0, last = 0, idleFor = 0, breathing = 0;
let frames = 0, fpsAt = performance.now();
const IDLE_AFTER = 2.5;      // seconds of stillness before it settles into breathing
const BREATH_FPS = 15;
const MAX_FPS = Number(params.get('fps')) || 120;
let refreshPrev = 0, refreshMs = 1000 / 60, refreshCount = 0;

function tick(dt, paint = true, idle = false) {
  if (SYSTEM) {
    player.time = mediaTime();
  } else if (player.playing) {
    player.time += dt;
    if (player.time >= player.track.duration) setTrack(player.index + 1);
  }
  if (dragging !== 'seek') mercury.setProgress(player.track.duration > 0 ? player.time / player.track.duration : 0);
  const silent = { bands: new Float32Array(16), pulse: 0 };
  // In "any media" the liquid moves to what the PC is really playing; the made-up beat is only
  // for when nothing is listening (the helper is not running: listen=off).
  const audio = !player.playing ? silent
    : SYSTEM ? (listener.state.ready ? listener.analyse() : fakeAudio(mercury.state.time, player.track.bpm))
    : CAPTURE ? fakeAudio(mercury.state.time, player.track.bpm) : synth.analyse();
  mercury.setAudio(audio.bands, audio.pulse);
  paintLabels();
  return mercury.frame(dt, paint, idle);
}

function loop(now) {
  // The display can refresh far faster than the liquid needs to be drawn (360 Hz on the
  // owner's monitor). Draw on every nth refresh: the pace stays even and never passes MAX_FPS.
  if (refreshPrev && now - refreshPrev < 50) refreshMs += (now - refreshPrev - refreshMs) * 0.1;
  refreshPrev = now;
  const every = Math.max(1, Math.ceil(1000 / MAX_FPS / refreshMs - 0.15));
  if (refreshCount++ % every) { raf = requestAnimationFrame(loop); return; }

  const dt = last ? (now - last) / 1000 : 1 / 60;
  last = now;
  const moving = tick(dt);
  idleFor = moving ? 0 : idleFor + dt;

  frames++;
  if (now - fpsAt > 500) {
    $('fps').textContent = Math.round(frames * 1000 / (now - fpsAt)) + ' fps';
    frames = 0; fpsAt = now;
  }
  if (idleFor > IDLE_AFTER) {
    raf = 0; last = 0;
    breathe();
    return;
  }
  raf = requestAnimationFrame(loop);
}

function breathe() {
  clearInterval(breathing);
  if (mercury.state.reducedMotion) { $('fps').textContent = 'still · 0 fps'; return; }
  $('fps').textContent = `breathing · ${BREATH_FPS} fps`;
  breathing = setInterval(() => { if (!document.hidden) tick(1 / BREATH_FPS, true, true); }, 1000 / BREATH_FPS);
}

function wake() {
  idleFor = 0;
  clearInterval(breathing);
  breathing = 0;
  if (!raf && !CAPTURE) raf = requestAnimationFrame(loop);
}

/* ------------------------------------------------------------------ panel --- */

const BACKDROPS = ['studio', 'wallpaper', 'window', 'black'];
$('panel').addEventListener('click', (event) => {
  const act = event.target.dataset.act;
  if (act === 'bg') {
    const desk = $('desk');
    desk.dataset.bg = BACKDROPS[(BACKDROPS.indexOf(desk.dataset.bg) + 1) % BACKDROPS.length];
  }
  if (act === 'size') {
    view.size = { 1: 0.8, 0.8: 0.6, 0.6: 1 }[view.size || 1];
    layout();
  }
  if (act === 'form') {
    if (mercury.springs.form.target > 0.5) mercury.vanish(); else mercury.appear();
    wake();
  }
  if (act === 'motion') {
    mercury.state.reducedMotion = !mercury.state.reducedMotion;
    event.target.textContent = 'Reduced motion: ' + (mercury.state.reducedMotion ? 'on' : 'off');
    wake();
  }
});
if (params.get('bg')) $('desk').dataset.bg = params.get('bg');

/* ------------------------------------------------------------------- boot --- */

await Promise.all([document.fonts.load('600 24px Montserrat'), document.fonts.load('400 16px Montserrat'), document.fonts.load('500 13px Montserrat')]);
layout();
setVolume(player.volume);
await setTrack(Number(params.get('track')) || 0, { immediate: true });
if (SYSTEM) {
  // Until Windows says what is playing, the widget is an empty glass.
  player.track = { title: 'Nothing playing', artist: '', duration: 0, bpm: 96 };
  player.time = 0;
  const blank = plainCover();
  mercury.setCover(blank, null);
  mercury.setPalette(paletteFromImage(blank), true);
  mercury.setLabels({ dim: 'ptn' });
  host.onMedia(applyMedia);
  if (host.onBands) host.onBands(listener.feed);
}
mercury.setLabels({ title: player.track.title, artist: player.track.artist });
mercury.setProgress(player.track.duration > 0 ? player.time / player.track.duration : 0);
mercury.springs.seekBead.snap(player.track.duration > 0 ? player.time / player.track.duration : 0);
mercury.springs.volBead.snap(player.volume);
if (params.has('play') && !SYSTEM) setPlaying(true);
passThrough(true);        // until the pointer is seen over the liquid, the mouse belongs to the desktop
// It forms like a droplet. Capture scripts can ask for it already formed.
if (params.has('unformed')) mercury.springs.form.snap(0);
else if (CAPTURE) mercury.springs.form.snap(1);
else mercury.appear();
if (REFRACT && !document.hidden) startBackdrop();
wake();

/** Hooks for the capture scripts. */
window.__mercury = {
  mercury, player, setTrack, setPlaying, setVolume, TRACKS, backdrop, startBackdrop, media, listener, L,
  /** Advance n frames. With paint false the liquid moves but nothing is drawn, which is far quicker. */
  step(n = 1, dt = 1 / 60, paint = true) { let m = false; for (let i = 0; i < n; i++) m = tick(dt, paint); return m; },
  pointer(type, x, y) {
    const rect = widget.getBoundingClientRect();
    const event = { clientX: rect.left + x / STAGE.w * rect.width, clientY: rect.top + y / STAGE.h * rect.height, button: 0, pointerId: 1, preventDefault() {} };
    if (type === 'move') onMove(event);
    if (type === 'down') onDown(event);
    if (type === 'up') onUp(event);
    if (type === 'leave') { mercury.pointerLeave(); tipState = null; }
  },
  ready: true,
};
