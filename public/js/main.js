/** Bootstrap: load data, wire every control, then get out of the way. */

import { $, $$, h, icon, clamp, debounce, fmtTime, plural, toast, api } from './util.js';
import { store, load, onChange, setSetting, toggleFavorite, sessions } from './store.js';
import { initArt, warmThumbnails, thumbUrl } from './art.js';
import {
  player, current, onPlayer, playList, toggle, next, prev,
  seek, nudge, setVolume, toggleMute, reshuffle, clearQueue, addToQueue, cue,
  updateMediaSession,
} from './player.js';
import { startVisualizer } from './viz.js';
import { initOutput } from './output.js';
import { openSettings } from './settings.js';
import { eq, eqActive, onEqChange } from './eq.js';
import { computeEras, computeEraColors, eras } from './eras.js';
import { initFx, glider, burst, haptic, replay } from './fx.js';
import * as ui from './ui.js';

/* ------------------------------------------------------------------- boot --- */

async function boot() {
  ui.cacheDom();
  const bootMsg = $('#boot-msg');

  try {
    const lib = await load();
    bootMsg.textContent = `${plural(lib.count, 'track')} ready`;
  } catch (err) {
    bootMsg.textContent = 'Could not reach the jusic server. Is it still running?';
    console.error(err);
    return;
  }

  computeEras();
  await initArt();
  await computeEraColors();
  applySettings();
  ui.render();
  ui.renderNowPlaying();
  ui.renderQueue();
  wire();
  startVisualizer($('#viz'));
  initOutput();
  initFx();
  glider($('#nav-primary'), '.nav-item.is-active');
  glider($('#sort-seg'), 'button.is-active');
  glider($('#side-switch'), 'button.is-active');
  glider($('.rail-tabs'), '.rail-tab.is-active');

  $('#boot').classList.add('is-done');

  connectLive();
  offerResume();

  // Warm the thumbnail cache quietly in the background on first run.
  if (typeof requestIdleCallback === 'function') requestIdleCallback(() => warmCovers());
  else setTimeout(warmCovers, 1200);
}

async function warmCovers() {
  const total = await warmThumbnails(store.tracks);
  if (total > 0) {
    // Swap the freshly cached thumbnails in for the full-size images.
    for (const img of $$('img[data-src]')) {
      const better = thumbUrl(decodeURIComponent((img.dataset.src || '').split('/').pop() || ''));
      if (better && img.src && better !== img.dataset.src) {
        img.dataset.src = better;
        if (img.src) img.src = better;
      }
    }
  }
}

function offerResume() {
  const saved = store.resume;
  if (!saved) return;
  const track = store.byId.get(saved.id);
  if (!track || saved.time < 20) return;

  // Queue the rest of the library behind it so play just keeps going.
  const library = store.tracks.filter((t) => !t.duplicateOf);
  cue(track, saved.time, library.includes(track) ? library : null, 'All Tracks');
  ui.renderNowPlaying();
  ui.renderQueue();

  const bar = h('div.toast', null,
    icon('play'),
    h('span', null, `Resume “${track.title}” at ${fmtTime(saved.time)}?`),
    h('button.ghost-btn.ghost-btn--sm', {
      style: { pointerEvents: 'auto', color: 'var(--accent)' },
      onclick: () => { bar.remove(); toggle(); },
    }, 'Resume'),
  );
  bar.style.pointerEvents = 'auto';
  $('#toasts').append(bar);
  setTimeout(() => {
    bar.classList.add('is-out');
    bar.addEventListener('animationend', () => bar.remove(), { once: true });
  }, 9000);
}

/** True when running in the desktop app window rather than a browser tab. */
function isAppWindow() {
  return 'desktop' in window || window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: window-controls-overlay)').matches ||
    navigator.standalone === true;
}

/**
 * Hold a stream open for as long as this page is. The server uses it to tell
 * whether anyone is still listening, which is how the app knows to shut itself
 * down once the last window is gone. EventSource reconnects on its own.
 */
function connectLive() {
  try {
    const stream = new EventSource('/api/live');
    window.addEventListener('pagehide', () => stream.close());
  } catch (err) {
    console.debug('live connection unavailable', err);
  }
}

async function quitApp() {
  try {
    await fetch('/api/quit', { method: 'POST' });
  } catch { /* the server going away mid-request is the expected outcome */ }
  window.close();
  // If the window refuses to close (a plain tab), say so rather than sit there.
  setTimeout(() => toast('jusic has stopped. You can close this tab.', 'power'), 400);
}

function applySettings() {
  const { volume, shuffle, repeat, hideDupes, sort, viz, rail } = store.settings;
  player.audio.volume = clamp(volume ?? 0.85, 0, 1);

  $('#btn-shuffle').classList.toggle('is-on', shuffle);
  $('#btn-dupes').classList.toggle('is-on', hideDupes);
  $('#btn-dupes').title = hideDupes ? 'Duplicate copies hidden' : 'Showing duplicate copies';
  $('#btn-viz').classList.toggle('is-on', viz !== false);
  document.body.classList.toggle('no-viz', viz === false);
  document.body.classList.toggle('no-rail', rail === false);
  $('#btn-rail').classList.toggle('is-on', rail !== false);

  setRepeatButton(repeat);
  for (const button of $$('#sort-seg button')) {
    button.classList.toggle('is-active', button.dataset.sort === sort);
  }
  renderVolume();
}

function setRepeatButton(mode) {
  const button = $('#btn-repeat');
  button.classList.toggle('is-on', mode !== 'off');
  button.replaceChildren(icon(mode === 'one' ? 'repeat1' : 'repeat'));
  button.title = { off: 'Repeat off', all: 'Repeat all', one: 'Repeat one' }[mode];
}

/* ------------------------------------------------------------------ wiring --- */

function wire() {
  /* sidebar + views */
  for (const button of $$('#nav-primary .nav-item')) {
    button.addEventListener('click', () => ui.setView(button.dataset.view));
  }
  $('#new-playlist').addEventListener('click', () => ui.openNewPlaylist());
  $('#btn-shortcuts').addEventListener('click', ui.openShortcuts);
  $('#btn-settings').addEventListener('click', openSettings);
  $('#btn-rescan').addEventListener('click', rescan);
  for (const button of $$('#side-switch button')) {
    button.addEventListener('click', () => ui.setSideList(button.dataset.side));
  }

  // Quitting only makes sense when this window *is* the app.
  const quit = $('#btn-quit');
  quit.hidden = !isAppWindow();
  quit.addEventListener('click', quitApp);
  $('#btn-menu').addEventListener('click', () => document.body.classList.toggle('menu-open'));

  /* search */
  const search = $('#search');
  const clear = $('#search-clear');
  const runSearch = debounce(() => {
    store.query = search.value;
    ui.render();
    $('#scroller').scrollTop = 0;
  }, 140);
  search.addEventListener('input', () => {
    clear.hidden = !search.value;
    search.parentElement.classList.toggle('has-text', Boolean(search.value));
    runSearch();
  });
  clear.addEventListener('click', () => {
    search.value = '';
    clear.hidden = true;
    search.parentElement.classList.remove('has-text');
    store.query = '';
    ui.render();
    search.focus();
  });

  /* sort + filters */
  for (const button of $$('#sort-seg button')) {
    button.addEventListener('click', () => {
      setSetting('sort', button.dataset.sort);
      applySettings();
      ui.render();
    });
  }
  $('#btn-dupes').addEventListener('click', () => {
    setSetting('hideDupes', !store.settings.hideDupes);
    applySettings();
    ui.render();
    toast(store.settings.hideDupes ? 'Duplicate copies hidden' : 'Showing every file', 'grid');
  });

  /* rail */
  $('#btn-rail').addEventListener('click', () => {
    if (window.matchMedia('(max-width: 1120px)').matches) {
      document.body.classList.toggle('rail-open');
      return;
    }
    setSetting('rail', store.settings.rail === false);
    applySettings();
  });
  for (const tab of $$('.rail-tab')) {
    tab.addEventListener('click', () => {
      $$('.rail-tab').forEach((t) => t.classList.toggle('is-active', t === tab));
      $$('.rail-pane').forEach((pane) => pane.classList.toggle('is-active', pane.id === 'pane-' + tab.dataset.tab));
    });
  }
  $('#queue-clear').addEventListener('click', () => { clearQueue(); toast('Queue cleared'); });

  /* hero */
  $('#hero-play').addEventListener('click', () => playCurrentView(false));
  $('#hero-shuffle').addEventListener('click', () => playCurrentView(true));
  $('#hero-queue').addEventListener('click', () => {
    const list = viewTracks();
    if (!list.length) return;
    addToQueue(list);
    toast(`Queued ${plural(list.length, 'track')}`, 'queue');
  });

  /* transport */
  $('#btn-play').addEventListener('click', () => { haptic(8); replay($('#btn-play'), 'is-kick'); toggle(); });
  $('#btn-next').addEventListener('click', () => { haptic(6); replay($('#btn-next'), 'is-kick'); next(false); });
  $('#btn-prev').addEventListener('click', () => { haptic(6); replay($('#btn-prev'), 'is-kick'); prev(); });
  $('#btn-shuffle').addEventListener('click', () => {
    setSetting('shuffle', !store.settings.shuffle);
    applySettings();
    replay($('#btn-shuffle'), 'is-kick');
    haptic(6);
    if (store.settings.shuffle) reshuffle();
    else rebuildLinearOrder();
    ui.renderQueue();
    toast(store.settings.shuffle ? 'Shuffle on' : 'Shuffle off', 'shuffle');
  });
  $('#btn-repeat').addEventListener('click', () => {
    const order = ['off', 'all', 'one'];
    const mode = order[(order.indexOf(store.settings.repeat) + 1) % 3];
    setSetting('repeat', mode);
    setRepeatButton(mode);
    replay($('#btn-repeat'), 'is-kick');
    haptic(6);
    toast({ off: 'Repeat off', all: 'Repeat all', one: 'Repeat this track' }[mode], 'repeat');
  });
  $('#btn-eq').addEventListener('click', () => openSettings({ focus: 'eq' }));
  onEqChange(paintEqButton);
  paintEqButton();

  $('#btn-viz').addEventListener('click', () => {
    setSetting('viz', store.settings.viz === false);
    applySettings();
  });
  $('#btn-mute').addEventListener('click', toggleMute);

  /* now-playing actions */
  $('#np-fav').addEventListener('click', favoriteCurrent);
  $('#pb-fav').addEventListener('click', favoriteCurrent);
  $('#np-add').addEventListener('click', () => {
    const track = current();
    if (track) ui.openPlaylistPicker([track.id]);
  });
  $('#np-reveal').addEventListener('click', () => {
    const track = current();
    if (!track) return;
    fetch('/api/reveal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: track.id }),
    }).then(() => toast('Opened in Explorer', 'folder')).catch(() => toast('Could not open the folder', 'x'));
  });
  $('#np-download').addEventListener('click', () => {
    const track = current();
    if (!track) return;
    const link = h('a', { href: `/api/audio/${track.id}?download=1`, download: '' });
    document.body.append(link);
    link.click();
    link.remove();
  });

  wireSeek();
  wireVolume();
  wireKeyboard();

  /* modal + menu dismissal */
  $('#modal').addEventListener('mousedown', (event) => {
    if (event.target.hasAttribute('data-close')) ui.closeModal();
  });
  $('#scroller').addEventListener('scroll', ui.closeMenu, { passive: true });

  /* store + player events */
  onChange((what) => {
    if (what === 'favorites') { ui.refreshRows(); ui.renderNowPlaying(); ui.renderSidebar(); }
    if (what === 'playlists') ui.renderSidebar();
  });

  onPlayer((what) => {
    if (what === 'track' || what === 'queue') {
      ui.refreshRows();
      ui.renderNowPlaying();
      ui.renderQueue();
      const track = current();
      updateMediaSession(track, track?.art ? location.origin + thumbUrl(track.art) : null);
    }
    if (what === 'time') ui.renderTime();
    if (what === 'buffer') ui.renderBuffer();
    if (what === 'volume') renderVolume();
    if (what === 'playing' && 'mediaSession' in navigator) {
      navigator.mediaSession.playbackState = player.audio.paused ? 'paused' : 'playing';
    }
  });
}

/** The playbar button lights up only while the equaliser is doing something. */
function paintEqButton() {
  const state = eq();
  const button = $('#btn-eq');
  button.classList.toggle('is-on', eqActive(state));
  button.title = state.on
    ? `Equalizer: ${state.preset || 'custom'} (.)`
    : 'Equalizer: off (.)';
}

function favoriteCurrent() {
  const track = current();
  if (!track) return;
  const on = toggleFavorite(track.id);
  if (on) {
    burst($('#pb-fav'));
    if ($('#np-fav').offsetParent) burst($('#np-fav'));
  }
  toast(on ? 'Added to favorites' : 'Removed from favorites', 'heart');
}

/** Tracks behind the current view, used by the hero buttons. */
function viewTracks() {
  if (store.view.kind === 'sessions' && !store.query) {
    return sessions().flatMap((s) => s.tracks);
  }
  if (store.view.kind === 'eras' && !store.query) {
    return eras().flatMap((e) => e.tracks);
  }
  return [...document.querySelectorAll('#tracklist .row')]
    .map((row) => store.byId.get(row.dataset.id))
    .filter(Boolean);
}

function playCurrentView(shuffle) {
  const list = viewTracks();
  if (!list.length) return;
  if (shuffle && !store.settings.shuffle) {
    setSetting('shuffle', true);
    applySettings();
  }
  const start = shuffle ? Math.floor(Math.random() * list.length) : 0;
  playList(list, start, store.query ? 'Search results' : viewLabel());
}

function viewLabel() {
  if (store.view.kind === 'eras') return 'All eras';
  return store.view.kind === 'sessions' ? 'All sessions' : (store.view.key || {
    all: 'All Tracks', favorites: 'Favorites', recent: 'Recently Played', most: 'Most Played',
  }[store.view.kind] || 'Library');
}

/** Turning shuffle off should leave the queue in its natural order. */
function rebuildLinearOrder() {
  const track = current();
  player.order = player.queue.map((_, i) => i);
  player.cursor = track ? player.queue.indexOf(track) : 0;
}

/* -------------------------------------------------------------- seek bar --- */

function wireSeek() {
  const bar = $('#pb-seek');
  const ghost = $('#pb-ghost');
  const tip = $('#pb-tip');
  let scrubbing = false;

  const ratioAt = (clientX) => {
    const rect = bar.getBoundingClientRect();
    return clamp((clientX - rect.left - 6) / (rect.width - 12), 0, 1);
  };
  const duration = () => (Number.isFinite(player.audio.duration) ? player.audio.duration : current()?.duration || 0);

  const preview = (clientX) => {
    const ratio = ratioAt(clientX);
    const rect = bar.getBoundingClientRect();
    ghost.style.width = (ratio * 100).toFixed(2) + '%';
    tip.textContent = fmtTime(ratio * duration());
    tip.style.left = clamp((clientX - rect.left), 26, rect.width - 26) + 'px';
    return ratio;
  };

  bar.addEventListener('pointermove', (event) => {
    if (!scrubbing) preview(event.clientX);
  });

  bar.addEventListener('pointerdown', (event) => {
    if (!duration()) return;
    scrubbing = true;
    bar.classList.add('is-scrubbing');
    bar.setPointerCapture(event.pointerId);
    const ratio = preview(event.clientX);
    $('#pb-fill').style.width = (ratio * 100).toFixed(2) + '%';
  });

  bar.addEventListener('pointermove', (event) => {
    if (!scrubbing) return;
    const ratio = preview(event.clientX);
    $('#pb-fill').style.width = (ratio * 100).toFixed(2) + '%';
    $('#pb-cur').textContent = fmtTime(ratio * duration());
  });

  const finish = (event) => {
    if (!scrubbing) return;
    scrubbing = false;
    bar.classList.remove('is-scrubbing');
    seek(ratioAt(event.clientX) * duration());
  };
  bar.addEventListener('pointerup', finish);
  bar.addEventListener('pointercancel', () => { scrubbing = false; bar.classList.remove('is-scrubbing'); });
}

/* ---------------------------------------------------------------- volume --- */

function renderVolume() {
  const audio = player.audio;
  const level = audio.muted ? 0 : audio.volume;
  $('#vol-fill').style.width = (level * 100).toFixed(1) + '%';
  $('#vol-tip').textContent = audio.muted ? 'Muted' : Math.round(level * 100) + '%';
  const name = level === 0 ? 'mute' : level < 0.45 ? 'vol-low' : 'vol';
  $('#btn-mute').replaceChildren(icon(name));
  $('#btn-mute').title = audio.muted ? 'Unmute (M)' : 'Mute (M)';
}

function wireVolume() {
  const track = $('#vol-track');
  let dragging = false;

  const apply = (clientX) => {
    const rect = track.getBoundingClientRect();
    setVolume((clientX - rect.left) / rect.width);
  };

  // The percentage lingers briefly after a wheel nudge so you can see where it landed.
  let tipTimer = 0;
  const showTip = () => {
    track.classList.add('is-active');
    clearTimeout(tipTimer);
    tipTimer = setTimeout(() => { if (!dragging) track.classList.remove('is-active'); }, 900);
  };

  track.addEventListener('pointerdown', (event) => {
    dragging = true;
    track.classList.add('is-active');
    track.setPointerCapture(event.pointerId);
    apply(event.clientX);
  });
  track.addEventListener('pointermove', (event) => { if (dragging) apply(event.clientX); });
  const release = () => { dragging = false; showTip(); };
  track.addEventListener('pointerup', release);
  track.addEventListener('pointercancel', release);
  track.addEventListener('wheel', (event) => {
    event.preventDefault();
    setVolume(player.audio.volume + (event.deltaY < 0 ? 0.05 : -0.05));
    showTip();
  }, { passive: false });
}

/* -------------------------------------------------------------- keyboard --- */

function wireKeyboard() {
  document.addEventListener('keydown', (event) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName) || event.target.isContentEditable;

    if (event.key === 'Escape') {
      if (!$('#modal').hidden) { ui.closeModal(); return; }
      if (typing) { event.target.value = ''; event.target.dispatchEvent(new Event('input')); event.target.blur(); }
      document.body.classList.remove('menu-open', 'rail-open');
      ui.closeMenu();
      return;
    }

    if (typing) return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;

    switch (event.key) {
      case ' ':
        event.preventDefault();
        toggle();
        break;
      case 'ArrowRight':
        event.preventDefault();
        event.shiftKey ? next(false) : nudge(5);
        break;
      case 'ArrowLeft':
        event.preventDefault();
        event.shiftKey ? prev() : nudge(-5);
        break;
      case 'ArrowUp':
        event.preventDefault();
        setVolume(player.audio.volume + 0.05);
        break;
      case 'ArrowDown':
        event.preventDefault();
        setVolume(player.audio.volume - 0.05);
        break;
      case '/':
        event.preventDefault();
        $('#search').focus();
        $('#search').select();
        break;
      default:
        handleLetter(event);
    }
  });
}

function handleLetter(event) {
  switch (event.key.toLowerCase()) {
    case 's': $('#btn-shuffle').click(); break;
    case 'r': $('#btn-repeat').click(); break;
    case 'f': favoriteCurrent(); break;
    case 'm': toggleMute(); break;
    case 'q': {
      const tab = $('.rail-tab[data-tab="queue"]');
      if (document.body.classList.contains('no-rail')) $('#btn-rail').click();
      if (window.matchMedia('(max-width: 1120px)').matches) document.body.classList.add('rail-open');
      tab.click();
      break;
    }
    case 'e': {
      const track = current();
      if (track) ui.openEraPicker([track.id]);
      else toast('Play something first, then press E to set its era', 'layers');
      break;
    }
    case '?': ui.openShortcuts(); break;
    case ',': openSettings(); break;
    case '.': openSettings({ focus: 'eq' }); break;
    default: break;
  }
}

/* ---------------------------------------------------------------- rescan --- */

async function rescan() {
  const button = $('#btn-rescan');
  button.disabled = true;
  button.querySelector('span').textContent = 'Scanning…';
  try {
    await api('/api/scan', { method: 'POST' });
    const before = store.tracks.length;
    await load();
    computeEras();
    await computeEraColors();
    ui.render();
    const delta = store.tracks.length - before;
    toast(delta ? `${delta > 0 ? '+' : ''}${delta} tracks - ${plural(store.tracks.length, 'total')}` : 'Library is up to date', 'refresh');
    warmCovers();
  } catch (err) {
    toast('Rescan failed', 'x');
    console.error(err);
  } finally {
    button.disabled = false;
    button.querySelector('span').textContent = 'Rescan library';
  }
}

boot();
