/**
 * Playback engine: one <audio> element, a queue, and a separate play order so
 * shuffle stays honest about what is actually coming up next.
 */

import { shuffled, toast, clamp } from './util.js';
import { store, notePlay, setResume, setSetting } from './store.js';
import { createEq } from './eq.js';

const audio = document.getElementById('audio');

export const player = {
  queue: [],        // tracks, in the order they were added
  order: [],        // indices into queue - the real playback sequence
  cursor: -1,       // position within `order`
  source: '',       // where the queue came from, shown above Up Next
  audio,
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
    const src = ctx.createMediaElementSource(audio);
    analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.82;
    // The equaliser sits before the analyser, so the bars show the sound as
    // it actually leaves the app.
    const eq = createEq(ctx);
    src.connect(eq.input);
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
    await audio.setSinkId(next);
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

async function loadAndPlay(track, { startTime = 0, autoplay = true } = {}) {
  if (!track) return;
  const token = ++playToken;

  audio.src = '/api/audio/' + track.id;
  if (startTime > 0) {
    audio.addEventListener('loadedmetadata', () => {
      if (token === playToken) audio.currentTime = startTime;
    }, { once: true });
  }

  emit('track');

  if (!autoplay) return;
  const routed = ensureGraph();
  if (routed) await routed;
  if (ctx?.state === 'suspended') await ctx.resume();

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
  if (audio.paused) {
    const routed = ensureGraph();
    if (routed) await routed;
    if (ctx?.state === 'suspended') await ctx.resume();
    try { await audio.play(); } catch { /* interrupted by another load */ }
  } else {
    audio.pause();
  }
}

/**
 * @param {boolean} auto True when a track ended on its own, which is the only
 *   case where repeat modes and end-of-queue behaviour apply.
 */
export function next(auto = false) {
  if (!player.order.length) return;

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

  loadAndPlay(current());
  emit('queue');
}

/** Restart the track first, the way every other player does. */
export function prev() {
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
  if (Number.isFinite(audio.duration)) {
    audio.currentTime = clamp(seconds, 0, audio.duration);
  }
}

export function nudge(delta) {
  seek(audio.currentTime + delta);
}

export function setVolume(value) {
  const v = clamp(value, 0, 1);
  audio.volume = v;
  audio.muted = false;
  setSetting('volume', v);
  emit('volume');
}

export function toggleMute() {
  audio.muted = !audio.muted;
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

audio.addEventListener('play', () => { document.body.classList.add('is-playing'); emit('playing'); });
audio.addEventListener('pause', () => { document.body.classList.remove('is-playing'); emit('playing'); });
audio.addEventListener('ended', () => next(true));
audio.addEventListener('timeupdate', () => emit('time'));
audio.addEventListener('progress', () => emit('buffer'));
audio.addEventListener('loadedmetadata', () => emit('time'));
audio.addEventListener('volumechange', () => emit('volume'));

audio.addEventListener('error', () => {
  const track = current();
  if (!track) return;
  toast(`Couldn't play "${track.title}"`, 'x');
  if (player.cursor < player.order.length - 1) setTimeout(() => next(true), 600);
});

// Remember where we were, so a reload can offer to pick it back up.
setInterval(() => {
  const track = current();
  if (track && !audio.paused && audio.currentTime > 5) setResume(track.id, audio.currentTime);
}, 5000);

window.addEventListener('beforeunload', () => {
  const track = current();
  if (track && audio.currentTime > 5) setResume(track.id, audio.currentTime);
});

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
