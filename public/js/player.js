/**
 * Playback engine: a queue, a separate play order so shuffle stays honest about
 * what is actually coming up next, and two decks, so one track can fade out
 * while the next fades in.
 */

import { shuffled, toast, clamp, api } from './util.js';
import { store, notePlay, setResume, setSetting } from './store.js';
import { createEq } from './eq.js';

/** Each deck: its <audio>, then (once the graph exists) fade and level gains and a loudness meter. */
const decks = [document.getElementById('audio'), Object.assign(new Audio(), { preload: 'metadata', crossOrigin: 'anonymous' })]
  .map((audio) => ({ audio, fade: null, level: null, meter: null, stop: 0 }));
let live = 0;       // the deck the listener hears, or is about to

export const player = {
  queue: [],        // tracks, in the order they were added
  order: [],        // indices into queue - the real playback sequence
  cursor: -1,       // position within `order`
  source: '',       // where the queue came from, shown above Up Next
  /** The element that is "the" audio right now. It changes with every track, so never hold on to it. */
  get audio() { return decks[live].audio; },
};

const listeners = new Set();
export const onPlayer = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const emit = (what) => { for (const fn of listeners) fn(what); };

export const current = () => (player.cursor >= 0 ? player.queue[player.order[player.cursor]] ?? null : null);
export const upNext = () => player.order.slice(player.cursor + 1).map((i) => player.queue[i]).filter(Boolean);

/* ------------------------------------------------------------- web audio --- */

let ctx = null;
let analyser = null;
let graphFailed = false;   // Web Audio unavailable, so the element plays directly
let sinkId = '';           // chosen output device; '' is the system default
let routing = null;        // a pending move of the graph onto `sinkId`

/**
 * Built on the first user-initiated play, as autoplay policy requires.
 * @returns {?Promise} settles once the graph is on the chosen device; await it
 *   before starting playback so the first notes don't come out of the wrong one.
 */
function ensureGraph() {
  if (ctx || graphFailed) return routing;
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.82;
    // The equaliser sits before the analyser, so the bars show the sound as
    // it actually leaves the app.
    const eq = createEq(ctx);
    // deck -> level (evening out loudness) -> fade (crossfades) -> equaliser. The meter listens
    // to the deck before either gain, so it measures the recording, not what was done to it.
    for (const deck of decks) {
      const src = ctx.createMediaElementSource(deck.audio);
      deck.level = ctx.createGain();
      deck.fade = ctx.createGain();
      deck.meter = ctx.createAnalyser();
      deck.meter.fftSize = 2048;
      src.connect(deck.meter);
      src.connect(deck.level).connect(deck.fade).connect(eq.input);
    }
    decks[1 - live].fade.gain.value = 0;
    eq.output.connect(analyser);
    analyser.connect(ctx.destination);
    // Constructing the context with { sinkId } would be tidier, but for a device
    // that has since been unplugged it silently stays suspended - no sound at all.
    // setSinkId rejects instead, so a vanished device falls back to the default.
    if (sinkId && typeof ctx.setSinkId === 'function') {
      routing = ctx.setSinkId(sinkId)
        .catch((err) => {
          console.warn('saved output unavailable, using the default', err);
          sinkId = '';
        })
        .finally(() => { routing = null; });
    }
  } catch (err) {
    console.warn('visualizer unavailable', err);
    ctx = null;
    analyser = null;
    graphFailed = true;
  }
  return routing;
}

export const getAnalyser = () => analyser;

/**
 * Send playback to an output device ('' for the system default).
 *
 * Once the visualizer's graph has captured the <audio> element, its sound only
 * reaches the speakers through the AudioContext, and Edge rejects setSinkId on
 * the captured element with AbortError. So the context is the one to switch.
 */
export async function setOutputDevice(id) {
  const next = id || '';
  if (ctx) {
    if (typeof ctx.setSinkId !== 'function') {
      throw new Error('this browser can’t switch outputs while the visualizer is running');
    }
    if (routing) await routing;
    await ctx.setSinkId(next);
  } else if (graphFailed) {
    await Promise.all(decks.map((deck) => deck.audio.setSinkId(next)));
  } else {
    // Nothing has played yet, so there is no graph to move. Check the device is
    // really there now, so a bad choice fails here rather than silently later;
    // the graph picks it up when playback starts.
    await new Audio().setSinkId(next);
  }
  sinkId = next;
}

export const outputDevice = () => sinkId;

/* ------------------------------------------------------------ order logic --- */

function buildOrder(startAt = 0) {
  const indices = player.queue.map((_, i) => i);
  if (!store.settings.shuffle) {
    player.order = indices;
    player.cursor = startAt;
    return;
  }
  // The chosen track plays first; everything else is reshuffled behind it.
  const rest = shuffled(indices.filter((i) => i !== startAt));
  player.order = startAt >= 0 && startAt < indices.length ? [startAt, ...rest] : rest;
  player.cursor = 0;
}

/** Re-roll the order around whatever is playing right now. */
export function reshuffle() {
  const track = current();
  const at = track ? player.queue.indexOf(track) : 0;
  buildOrder(at);
  emit('queue');
}

/* ------------------------------------------------------------- transport --- */

let playToken = 0;
let countTimer = null;

const SKIP_FADE = 0.15;     // seconds: a manual change of track is a quick fade, not a cut
const STEPS = 48;
// Equal power: sine in, cosine out, so the two together stay as loud as one.
const FADE_IN = Float32Array.from({ length: STEPS }, (_, i) => Math.sin((i / (STEPS - 1)) * Math.PI / 2));
const FADE_OUT = Float32Array.from(FADE_IN).reverse();

function ramp(deck, curve, seconds) {
  if (!deck.fade) return;
  const gain = deck.fade.gain;
  gain.cancelAndHoldAtTime(ctx.currentTime);
  if (seconds > 0.02) gain.setValueCurveAtTime(curve, ctx.currentTime, seconds);
  else gain.setValueAtTime(curve[STEPS - 1], ctx.currentTime);
}

/** Ends any fade in progress: the live deck at full, the other silent and stopped. */
function settle() {
  const other = decks[1 - live];
  other.stop++;
  other.audio.pause();
  ramp(other, FADE_OUT, 0);
  ramp(decks[live], FADE_IN, 0);
}

/**
 * Starts a track on the idle deck and makes it the live one. With `fade` seconds, it fades in
 * as whatever was playing fades out, through the same equaliser, analyser and output.
 */
async function loadAndPlay(track, { startTime = 0, autoplay = true, fade = SKIP_FADE } = {}) {
  if (!track) return;
  const token = ++playToken;
  const out = decks[live];
  const sounding = !out.audio.paused && !out.audio.ended;
  live = 1 - live;
  const deck = decks[live];
  const audio = deck.audio;

  audio.volume = out.audio.volume;
  audio.muted = out.audio.muted;
  audio.src = '/api/audio/' + track.id;
  if (startTime > 0) {
    audio.addEventListener('loadedmetadata', () => {
      if (token === playToken) audio.currentTime = startTime;
    }, { once: true });
  }

  emit('track');

  if (!autoplay) { settle(); return; }
  const routed = ensureGraph();
  if (routed) await routed;
  if (ctx?.state === 'suspended') await ctx.resume();
  if (token !== playToken) return;

  if (deck.level) deck.level.gain.value = levelFor(track);
  if (deck.fade && sounding && fade > 0.02) {
    ramp(deck, FADE_IN, fade);
    ramp(out, FADE_OUT, fade);
    const stop = ++out.stop;      // this timer may run late in the background: the gain is already at 0 by then
    setTimeout(() => { if (out.stop === stop && decks[live] !== out) out.audio.pause(); }, fade * 1000 + 60);
  } else {
    settle();
  }

  try {
    await audio.play();
  } catch (err) {
    if (token !== playToken || err.name === 'AbortError') return;
    console.warn('playback failed', err);
  }

  // Only count a play once it has actually been listened to for a moment.
  clearTimeout(countTimer);
  countTimer = setTimeout(() => {
    if (token === playToken && !audio.paused) notePlay(track.id);
  }, 8000);
}

/** While a track's last seconds play, the next one starts under it (the crossfade setting, in seconds). */
function maybeCrossfade() {
  const audio = player.audio;
  const length = Number(store.settings.crossfade) || 0;
  if (!length || !ctx || audio.paused || !Number.isFinite(audio.duration)) return;
  const fade = Math.min(length, audio.duration / 3);
  if (audio.duration - audio.currentTime > fade) return;
  if (store.settings.repeat === 'one') return;                                              // it loops instead
  if (player.cursor >= player.order.length - 1 && store.settings.repeat !== 'all') return;   // the queue ends here: let it ring out
  next(true, fade);
}

/** Replace the queue and start playing. */
export function playList(tracks, startIndex = 0, source = '') {
  if (!tracks.length) return;
  player.queue = [...tracks];
  player.source = source;
  buildOrder(clamp(startIndex, 0, tracks.length - 1));
  loadAndPlay(current());
  emit('queue');
}

/** Play a track, keeping the existing queue if it is already in there. */
export function playTrack(track, list = null, source = '') {
  if (list) {
    const index = list.indexOf(track);
    playList(list, index < 0 ? 0 : index, source);
    return;
  }
  const at = player.queue.indexOf(track);
  if (at === -1) { playList([track], 0, source || 'Single track'); return; }
  player.cursor = player.order.indexOf(at);
  loadAndPlay(track);
  emit('queue');
}

export async function toggle() {
  if (!current()) {
    const list = store.tracks.filter((t) => !t.duplicateOf);
    if (list.length) playList(list, 0, 'All Tracks');
    return;
  }
  const audio = player.audio;
  settle();                                                  // pausing or resuming mid-fade lands on the new track
  if (audio.paused) {
    const routed = ensureGraph();
    if (routed) await routed;
    if (ctx?.state === 'suspended') await ctx.resume();
    if (decks[live].level) decks[live].level.gain.value = levelFor(current());
    try { await audio.play(); } catch { /* interrupted by another load */ }
  } else {
    audio.pause();
  }
}

/**
 * @param {boolean} auto True when a track ended on its own, which is the only
 *   case where repeat modes and end-of-queue behaviour apply.
 * @param {number} fade Seconds of crossfade into the next track (none for a natural end with crossfade off).
 */
export function next(auto = false, fade = auto ? 0 : SKIP_FADE) {
  if (!player.order.length) return;
  const audio = player.audio;

  if (auto && store.settings.repeat === 'one') {
    audio.currentTime = 0;
    audio.play().catch(() => {});
    return;
  }

  if (player.cursor < player.order.length - 1) {
    player.cursor++;
  } else if (store.settings.repeat === 'all' || !auto) {
    if (store.settings.shuffle) reshuffle();
    player.cursor = 0;
  } else {
    audio.pause();
    audio.currentTime = 0;
    emit('track');
    return;
  }

  loadAndPlay(current(), { fade });
  emit('queue');
}

/** Restart the track first, the way every other player does. */
export function prev() {
  const audio = player.audio;
  if (audio.currentTime > 3.5 || player.cursor <= 0) {
    audio.currentTime = 0;
    if (audio.paused) audio.play().catch(() => {});
    return;
  }
  player.cursor--;
  loadAndPlay(current());
  emit('queue');
}

export function seek(seconds) {
  const audio = player.audio;
  if (Number.isFinite(audio.duration)) {
    audio.currentTime = clamp(seconds, 0, audio.duration);
  }
}

export function nudge(delta) {
  seek(player.audio.currentTime + delta);
}

export function setVolume(value) {
  const v = clamp(value, 0, 1);
  for (const { audio } of decks) { audio.volume = v; audio.muted = false; }
  setSetting('volume', v);
  emit('volume');
}

export function toggleMute() {
  const muted = !player.audio.muted;
  for (const { audio } of decks) audio.muted = muted;
  emit('volume');
}

/* ---------------------------------------------------------- queue edits --- */

function queueIndexFor(track) {
  let at = player.queue.indexOf(track);
  if (at === -1) {
    player.queue.push(track);
    at = player.queue.length - 1;
  }
  return at;
}

export function playNext(tracks) {
  const list = [].concat(tracks);
  if (!player.queue.length) { playList(list, 0, 'Queue'); return; }
  const positions = list.map(queueIndexFor);
  player.order = player.order.filter((i, idx) => idx <= player.cursor || !positions.includes(i));
  player.order.splice(player.cursor + 1, 0, ...positions);
  emit('queue');
}

export function addToQueue(tracks) {
  const list = [].concat(tracks);
  if (!player.queue.length) { playList(list, 0, 'Queue'); return; }
  for (const track of list) {
    const at = queueIndexFor(track);
    if (!player.order.includes(at)) player.order.push(at);
  }
  emit('queue');
}

/** @param {number} position Index within the visible Up Next list. */
export function removeUpNext(position) {
  player.order.splice(player.cursor + 1 + position, 1);
  emit('queue');
}

export function jumpUpNext(position) {
  player.cursor += position + 1;
  loadAndPlay(current());
  emit('queue');
}

export function moveUpNext(from, to) {
  const base = player.cursor + 1;
  const [moved] = player.order.splice(base + from, 1);
  player.order.splice(base + to, 0, moved);
  emit('queue');
}

export function clearQueue() {
  const keep = player.cursor >= 0 ? player.order[player.cursor] : null;
  player.order = keep === null ? [] : [keep];
  player.cursor = keep === null ? -1 : 0;
  emit('queue');
}

/* ------------------------------------------------------------- lifecycle --- */

// Both decks report here, but only the live one is listened to: the other is a track fading out.
for (const { audio } of decks) {
  const on = (type, fn) => audio.addEventListener(type, () => { if (audio === player.audio) fn(); });
  on('play', () => { document.body.classList.add('is-playing'); emit('playing'); });
  on('pause', () => { document.body.classList.remove('is-playing'); emit('playing'); });
  on('ended', () => next(true));
  on('timeupdate', () => { measure(); maybeCrossfade(); emit('time'); });
  on('progress', () => emit('buffer'));
  on('loadedmetadata', () => emit('time'));
  on('volumechange', () => emit('volume'));
  on('error', () => {
    const track = current();
    if (!track) return;
    toast(`Couldn't play "${track.title}"`, 'x');
    if (player.cursor < player.order.length - 1) setTimeout(() => next(true), 600);
  });
}

// Remember where we were, so a reload can offer to pick it back up.
setInterval(() => {
  const track = current();
  const audio = player.audio;
  if (track && !audio.paused && audio.currentTime > 5) setResume(track.id, audio.currentTime);
}, 5000);

window.addEventListener('beforeunload', () => {
  const track = current();
  if (track && player.audio.currentTime > 5) setResume(track.id, player.audio.currentTime);
});

/* -------------------------------------------------------------- loudness --- */

/**
 * Evening out volume. Some tracks are much quieter than others, so each is measured while it
 * plays (the files are never touched) and, from its next play on, brought to the same level.
 * Measurements live in data/loudness.json, which can be deleted: they are simply taken again.
 */
const TARGET = -18;            // dB RMS every track is brought to
const loud = new Map();        // track id -> { rms, peak (dB), secs measured }
const samples = new Float32Array(2048);
let tally = { id: '', sum: 0, n: 0, peak: 0 };

export async function initLoudness() {
  try { for (const [id, m] of Object.entries(await api('/api/loudness'))) loud.set(id, m); } catch { /* measured as tracks play */ }
}

/** The gain for a track: toward the target, never more than +6 dB, never pushing its peaks past full scale. */
function levelFor(track) {
  const m = store.settings.normalize && track && loud.get(track.id);
  if (!m || m.secs < 20) return 1;
  return 10 ** (clamp(Math.min(TARGET - m.rms, -1 - m.peak), -12, 6) / 20);
}

/** Call when the setting changes: the playing track glides to its level rather than jumping. */
export function refreshLevel() {
  const deck = decks[live];
  if (deck.level) deck.level.gain.setTargetAtTime(levelFor(current()), ctx.currentTime, 0.4);
}

/** A look at the live deck about four times a second. It rides on timeupdate, so it needs no timer of its own. */
function measure() {
  const { meter, audio } = decks[live];
  const track = current();
  if (!meter || !track || audio.paused || audio.muted || audio.volume < 0.05) return;
  meter.getFloatTimeDomainData(samples);
  let sum = 0, peak = 0;
  for (const v of samples) { sum += v * v; if (v > peak || -v > peak) peak = Math.abs(v); }
  const power = sum / samples.length / (audio.volume * audio.volume);       // the element's volume comes before the graph: undo it
  if (power < 1e-5) return;                                                 // silence (under about -50 dB) doesn't count
  if (tally.id !== track.id) tally = { id: track.id, sum: 0, n: 0, peak: 0 };
  tally.sum += power; tally.n++; tally.peak = Math.max(tally.peak, peak / audio.volume);
  if (tally.n % 80) return;                                                 // every 20 seconds of sound, keep the longer measurement
  const secs = tally.n / 4;
  if ((loud.get(track.id)?.secs || 0) >= secs) return;
  const m = { rms: +(10 * Math.log10(tally.sum / tally.n)).toFixed(2), peak: +(20 * Math.log10(tally.peak)).toFixed(2), secs };
  loud.set(track.id, m);
  api('/api/loudness', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: track.id, ...m }) }).catch(() => {});
}

/**
 * Restore a track at a saved position without starting playback.
 * `list` becomes the surrounding queue, so pressing play carries on into the
 * rest of the library instead of stopping after one song.
 */
export function cue(track, startTime = 0, list = null, source = 'Resumed') {
  const queue = list && list.includes(track) ? list : [track];
  player.queue = [...queue];
  player.order = queue.map((_, i) => i);
  player.cursor = queue.indexOf(track);
  player.source = source;
  loadAndPlay(track, { startTime, autoplay: false });
  emit('queue');
}

/* -------------------------------------------------------- media session --- */

export function updateMediaSession(track, artworkUrl) {
  if (!('mediaSession' in navigator)) return;
  if (!track) { navigator.mediaSession.metadata = null; return; }

  navigator.mediaSession.metadata = new MediaMetadata({
    title: track.title,
    artist: [track.artist, ...track.features].filter(Boolean).join(', ') || 'Unknown artist',
    album: track.session || track.album || 'jusic',
    artwork: artworkUrl ? [{ src: artworkUrl, sizes: '512x512', type: 'image/jpeg' }] : [],
  });

  const actions = {
    play: () => toggle(),
    pause: () => toggle(),
    previoustrack: () => prev(),
    nexttrack: () => next(false),
    seekbackward: () => nudge(-10),
    seekforward: () => nudge(10),
    seekto: (details) => { if (details.fastSeek !== true) seek(details.seekTime); },
  };
  for (const [action, handler] of Object.entries(actions)) {
    try { navigator.mediaSession.setActionHandler(action, handler); } catch { /* unsupported action */ }
  }
}
