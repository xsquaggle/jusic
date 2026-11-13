/** All rendering: sidebar, hero, track list, queue, now-playing and the playbar. */

import { $, $$, h, icon, fmtTime, fmtSpan, fmtBytes, fmtDate, plural, toast } from './util.js';
import {
  store, sessions, currentList, viewTitle, toggleFavorite, setSetting,
  addToPlaylist, createPlaylist, renamePlaylist, deletePlaylist, removeFromPlaylist,
} from './store.js';
import { eras, eraOf, eraColor, eraNames, setEra, isManual, computeEraColors } from './eras.js';
import { burst, haptic, replay, refreshScrollFx, reducedMotion } from './fx.js';
import { lazyImage, setArtVar, applyTheme } from './art.js';
import {
  player, current, upNext, playList, playTrack, playNext, addToQueue,
  removeUpNext, jumpUpNext, moveUpNext,
} from './player.js';

const dom = {};
export function cacheDom() {
  Object.assign(dom, {
    board: $('#board'),
    hero: $('#hero'),
    heroArt: $('#hero-art'),
    heroKicker: $('#hero-kicker'),
    heroTitle: $('#hero-title'),
    heroMeta: $('#hero-meta'),
    scroller: $('#scroller'),
    navPlaylists: $('#nav-playlists'),
    navSessions: $('#nav-sessions'),
    queueList: $('#queue-list'),
    queueCount: $('#queue-count'),
    queueSource: $('#queue-source'),
    npArt: $('#np-art'),
    npTitle: $('#np-title'),
    npSub: $('#np-sub'),
    npChips: $('#np-chips'),
    npFacts: $('#np-facts'),
    npFav: $('#np-fav'),
    pbArt: $('#pb-art'),
    pbTitle: $('#pb-title'),
    pbSub: $('#pb-sub'),
    pbFav: $('#pb-fav'),
    pbCur: $('#pb-cur'),
    pbDur: $('#pb-dur'),
    pbFill: $('#pb-fill'),
    pbBuffer: $('#pb-buffer'),
    menu: $('#context-menu'),
    modal: $('#modal'),
    modalCard: $('#modal-card'),
  });
}

/* ------------------------------------------------------------- formatting --- */

const DOT = ' · ';

/** "feat. Future · Death Race For Love (Sessions)" */
function subtitleFor(track) {
  const bits = [];
  if (track.features.length) bits.push('feat. ' + track.features.join(', '));
  if (track.aka.length) bits.push('aka ' + track.aka.join(' / '));
  if (track.session) bits.push(track.session);
  else if (track.artist && !track.features.length) bits.push(track.artist);
  return bits.join(DOT);
}

function tagsFor(track) {
  const tags = [];
  if (track.version) tags.push({ text: track.version.toUpperCase(), cls: 'tag--ver' });
  for (const c of track.collections) tags.push({ text: c });
  for (const q of track.qualifiers.slice(0, 2)) tags.push({ text: q });
  if (track.variant) tags.push({ text: 'alt ' + track.variant, cls: 'tag--dupe' });
  if (track.duplicateOf) tags.push({ text: 'copy', cls: 'tag--dupe' });
  return tags;
}

/** A coloured era label; clicking it opens that era. */
function eraChip(name) {
  const chip = h('button.era', {
    title: `Open ${name}`,
    onclick: (event) => { event.stopPropagation(); setView('era', name); },
  }, h('i.era-dot'), h('span', null, name));
  chip.style.setProperty('--era', eraColor(name));
  return chip;
}

function eraCell(track) {
  const name = eraOf(track);
  if (name) {
    const chip = eraChip(name);
    if (isManual(track)) chip.classList.add('is-manual');
    return h('div.r-era', null, chip);
  }
  return h('div.r-era', null, h('button.era-set', {
    title: 'Choose an era for this track',
    onclick: (event) => { event.stopPropagation(); openEraPicker([track.id]); },
  }, icon('plus'), h('span', null, 'Set era')));
}

/** Pick the cover that best represents a group of tracks. */
function representativeArt(list) {
  const counts = new Map();
  for (const track of list) {
    if (!track.art) continue;
    counts.set(track.art, (counts.get(track.art) || 0) + 1);
  }
  if (!counts.size) return null;
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

/* --------------------------------------------------------------- sidebar --- */

export function renderSidebar() {
  const counts = {
    all: store.tracks.filter((t) => !(store.settings.hideDupes && t.duplicateOf)).length,
    favorites: store.favorites.size,
    recent: store.recent.length,
    most: Object.keys(store.playCounts).length,
    eras: eras().length,
    sessions: sessions().length,
  };
  for (const [key, value] of Object.entries(counts)) {
    const node = $(`.nav-count[data-count="${key}"]`);
    if (node) node.textContent = value ? value.toLocaleString() : '';
  }

  for (const button of $$('#nav-primary .nav-item')) {
    button.classList.toggle('is-active', store.view.kind === button.dataset.view);
  }

  dom.navPlaylists.replaceChildren(
    ...store.playlists.map((playlist) => {
      const button = h('button.nav-item', {
        dataset: { playlist: playlist.id },
        class: store.view.kind === 'playlist' && store.view.key === playlist.id ? 'is-active' : '',
      },
        icon('list'),
        h('span', null, playlist.name),
        h('em.nav-count', null, playlist.tracks.length || ''),
      );
      button.addEventListener('click', () => setView('playlist', playlist.id));
      button.addEventListener('contextmenu', (event) => {
        event.preventDefault();
        openMenu(event, playlistMenu(playlist));
      });
      return button;
    }),
    ...(store.playlists.length
      ? []
      : [h('p.empty', { style: { padding: '10px', fontSize: '12px' } }, 'No playlists yet')]),
  );

  const side = store.settings.sideList === 'sessions' ? 'sessions' : 'eras';
  for (const button of $$('#side-switch button')) {
    button.classList.toggle('is-active', button.dataset.side === side);
    button.setAttribute('aria-selected', String(button.dataset.side === side));
  }

  const kind = side === 'eras' ? 'era' : 'session';
  const groups = side === 'eras' ? eras() : sessions();
  dom.navSessions.replaceChildren(...groups.map(({ name, tracks }) => {
    const button = h('button.nav-item', {
      class: store.view.kind === kind && store.view.key === name ? 'is-active' : '',
      title: name,
    },
      kind === 'era' ? h('i.era-dot.era-dot--nav') : icon('disc'),
      h('span', null, name),
      h('em.nav-count', null, tracks.length),
    );
    if (kind === 'era') button.style.setProperty('--era', eraColor(name));
    button.addEventListener('click', () => setView(kind, name));
    return button;
  }));
}

export function setSideList(which) {
  if (store.settings.sideList === which) return;
  setSetting('sideList', which);
  renderSidebar();
  replay(dom.navSessions, 'is-swapping');
}

/* ------------------------------------------------------------------ views --- */

export function setView(kind, key = null) {
  if (store.view.kind !== kind || store.view.key !== key) haptic(5);
  store.view = { kind, key };
  const search = $('#search');
  if (search.value) { search.value = ''; store.query = ''; $('#search-clear').hidden = true; }
  render();
  dom.scroller.scrollTo({ top: 0, behavior: 'instant' });
  document.body.classList.remove('menu-open');
}

let lastBoardKey = '';

export function render() {
  renderSidebar();
  renderHero();
  renderBoard();
  refreshScrollFx();
}

/** Shelves of cards rather than a track list. */
export const isShelf = () => (store.view.kind === 'sessions' || store.view.kind === 'eras') && !store.query;

function renderHero() {
  const isSessions = store.view.kind === 'sessions';
  const isEras = store.view.kind === 'eras';
  const list = isSessions || isEras ? [] : currentList();
  const kicker = {
    all: 'Library', favorites: 'Your picks', recent: 'History',
    most: 'On repeat', sessions: 'Browse', session: 'Session', playlist: 'Playlist',
    eras: 'Browse', era: 'Era',
  }[store.view.kind] || 'Library';

  const heroKey = store.view.kind + '|' + store.view.key + '|' + store.query;
  if (dom.hero.dataset.key !== heroKey) {
    dom.hero.dataset.key = heroKey;
    replay(dom.hero, 'is-entering');
  }
  if (store.view.kind === 'era') dom.hero.style.setProperty('--era', eraColor(store.view.key));
  else dom.hero.style.removeProperty('--era');
  dom.hero.classList.toggle('is-era', store.view.kind === 'era' && !store.query);

  dom.heroKicker.textContent = store.query ? 'Search' : kicker;
  dom.heroTitle.textContent = store.query ? `“${store.query}”` : viewTitle();

  const meta = [];
  if (isSessions || isEras) {
    const all = isEras ? eras() : sessions();
    meta.push(plural(all.length, isEras ? 'era' : 'session'));
    meta.push(plural(all.reduce((sum, s) => sum + s.tracks.length, 0), 'track'));
  } else {
    meta.push(plural(list.length, 'track'));
    const seconds = list.reduce((sum, t) => sum + (t.duration || 0), 0);
    if (seconds) meta.push(fmtSpan(seconds));
    if (store.view.kind === 'all' && store.settings.hideDupes) {
      const hidden = store.tracks.filter((t) => t.duplicateOf).length;
      if (hidden) meta.push(`${hidden} duplicates hidden`);
    }
  }

  dom.heroMeta.replaceChildren(...meta.flatMap((text, i) => (i ? [h('i', null, DOT.trim()), text] : [text])));

  const art = isSessions || isEras ? representativeArt(store.tracks) : representativeArt(list);
  setArtVar(dom.heroArt, art, true);
  dom.heroArt.classList.toggle('is-empty', !art);
  dom.heroArt.replaceChildren(...(art ? [] : [icon('disc', 'ic')]));

  const playable = isSessions || isEras ? store.tracks.filter((t) => !t.duplicateOf) : list;
  dom.hero.dataset.count = playable.length;
  $('#hero-play').disabled = !playable.length;
  $('#hero-shuffle').disabled = !playable.length;
}

function renderBoard() {
  // Rows cascade in when the list itself changes, not when it merely refreshes.
  const boardKey = [store.view.kind, store.view.key, store.query, store.settings.sort, store.settings.hideDupes].join('|');
  dom.board.classList.toggle('is-fresh', boardKey !== lastBoardKey && !reducedMotion());
  lastBoardKey = boardKey;

  if (isShelf()) {
    dom.board.replaceChildren(store.view.kind === 'eras' ? renderEraCards() : renderSessionCards());
    return;
  }

  const list = currentList();
  if (!list.length) {
    dom.board.replaceChildren(h('div.empty', null,
      icon('search'),
      h('strong', null, store.query ? 'Nothing matched that' : 'Nothing here yet'),
      h('span', null, store.query
        ? 'Try a shorter phrase, or search by session or featured artist.'
        : emptyHint()),
    ));
    return;
  }

  dom.board.replaceChildren(
    h('div.list-head', null,
      h('span', null, '#'),
      h('span', null, ''),
      sortHeader('Title', 'title'),
      sortHeader('Era', 'era', 'th-era'),
      h('span.th-tags', null, 'Tags'),
      sortHeader('Time', 'duration', 'th-dur'),
      h('span', null, ''),
    ),
    h('div.tracklist', { id: 'tracklist' }, ...list.map((track, index) => renderRow(track, index, list))),
  );
  currentRow = null;
  paintRowProgress();
}

/** Column labels double as sort controls wherever sorting applies. */
function sortHeader(label, sort, cls = '') {
  const fixedOrder = ['recent', 'most', 'playlist'].includes(store.view.kind) || Boolean(store.query.trim());
  const active = !fixedOrder && store.settings.sort === sort;
  return h('button.th-sort', {
    class: [cls, active ? 'is-active' : ''].filter(Boolean).join(' '),
    disabled: fixedOrder,
    title: fixedOrder ? '' : `Sort by ${label.toLowerCase()}`,
    onclick: () => {
      if (store.settings.sort === sort) return;
      setSetting('sort', sort);
      for (const b of $$('#sort-seg button')) b.classList.toggle('is-active', b.dataset.sort === sort);
      render();
    },
  }, h('span', null, label), icon('sort'));
}

function emptyHint() {
  switch (store.view.kind) {
    case 'favorites': return 'Tap the heart on any track to keep it here.';
    case 'recent': return 'Play something and it will show up here.';
    case 'most': return 'Your most-played tracks will collect here.';
    case 'playlist': return 'Right-click any track to add it to this playlist.';
    default: return 'No audio files were found in your music folder.';
  }
}

function renderEraCards() {
  const all = eras();
  const loose = store.tracks.filter((t) => !(store.settings.hideDupes && t.duplicateOf) && !eraOf(t));
  return h('div.shelf', null,
    h('div.shelf-head', null, h('h2', null, 'Eras'), h('span', null, 'Oldest to newest')),
    h('div.cards.cards--eras', null, ...all.map(({ name, tracks }, index) => {
      const art = representativeArt(tracks);
      const seconds = tracks.reduce((sum, t) => sum + (t.duration || 0), 0);
      const card = h('button.card.card--era', { title: name },
        h('div.card-art', null,
          art ? lazyImage(art, name) : null,
          h('span.card-index', null, String(index + 1).padStart(2, '0')),
          h('button.card-play', {
            title: 'Play ' + name,
            onclick: (event) => { event.stopPropagation(); playList(tracks, 0, name); },
          }, icon('play')),
        ),
        h('div.card-title', null, h('i.era-dot'), h('span', null, name)),
        h('div.card-sub', null, plural(tracks.length, 'track') + (seconds ? ' · ' + fmtSpan(seconds) : '')),
      );
      card.style.setProperty('--era', eraColor(name));
      card.style.setProperty('--i', index);
      card.addEventListener('click', () => setView('era', name));
      return card;
    })),
    loose.length
      ? h('p.shelf-note', null, icon('tag'),
        h('span', null, `${plural(loose.length, 'track')} ${loose.length === 1 ? 'has' : 'have'} no era yet. Right-click one and choose Set era, or press E while it plays.`))
      : null,
  );
}

function renderSessionCards() {
  const all = sessions();
  return h('div.shelf', null,
    h('div.shelf-head', null, h('h2', null, 'Sessions'), h('span', null, plural(all.length, 'collection'))),
    h('div.cards', null, ...all.map(({ name, tracks }, index) => {
      const art = representativeArt(tracks);
      const card = h('button.card', { title: name },
        h('div.card-art', null,
          art ? lazyImage(art, name) : null,
          h('button.card-play', {
            title: 'Play ' + name,
            onclick: (event) => { event.stopPropagation(); playList(tracks, 0, name); },
          }, icon('play')),
        ),
        h('div.card-title', null, name),
        h('div.card-sub', null, plural(tracks.length, 'track')),
      );
      card.style.setProperty('--i', Math.min(index, 24));
      card.addEventListener('click', () => setView('session', name));
      return card;
    })),
  );
}

/* ------------------------------------------------------------------- rows --- */

function renderRow(track, index, list) {
  const playing = current();
  const isCurrent = playing && playing.id === track.id;
  const favorited = store.favorites.has(track.id);

  const favButton = h('button.icon-btn.r-fav', {
    title: favorited ? 'Remove from favorites' : 'Add to favorites',
    class: favorited ? 'is-on' : '',
    onclick: (event) => { event.stopPropagation(); toggleFavorite(track.id); },
  }, icon(favorited ? 'heart' : 'heart-o'));
  favButton.addEventListener('click', () => { if (store.favorites.has(track.id)) burst(favButton); });

  const row = h('div.row', {
    dataset: { id: track.id, index },
    class: [isCurrent ? 'is-current' : '', track.duplicateOf ? 'is-dupe' : ''].filter(Boolean).join(' '),
    tabIndex: 0,
  },
    h('div.r-idx', null,
      h('span.num', null, index + 1),
      h('span.go', null, icon('play')),
      h('div.eq', null, h('i'), h('i'), h('i')),
    ),
    h('div.r-art', null,
      track.art ? lazyImage(track.art, '') : null,
      track.art ? null : h('div.fallback', null, icon('disc')),
    ),
    h('div.r-main', null,
      h('div.r-title', { title: track.title }, track.title),
      h('div.r-sub', { title: subtitleFor(track) }, subtitleFor(track) || track.ext.toUpperCase()),
    ),
    eraCell(track),
    h('div.r-tags', null, ...tagsFor(track).map((tag) => h('span.tag', { class: tag.cls || '' }, tag.text))),
    h('div.r-dur', null, track.duration ? fmtTime(track.duration) : '—'),
    h('div.r-actions', null,
      favButton,
      h('button.icon-btn.r-more', {
        title: 'More',
        onclick: (event) => { event.stopPropagation(); openMenu(event, trackMenu(track, list)); },
      }, icon('dots')),
    ),
  );

  // Only the first screenful cascades in; everything below arrives settled.
  if (index < 28) row.style.setProperty('--i', index);
  row.addEventListener('click', () => { haptic(6); playTrack(track, list, viewTitle()); });
  row.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') { event.preventDefault(); playTrack(track, list, viewTitle()); }
  });
  row.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    openMenu(event, trackMenu(track, list));
  });
  return row;
}

/** Swap in fresh era cells after eras change, without rebuilding the list. */
export function refreshEraCells() {
  for (const row of $$('#tracklist .row')) {
    const track = store.byId.get(row.dataset.id);
    const cell = row.querySelector('.r-era');
    if (track && cell) cell.replaceWith(eraCell(track));
  }
}

/** Repaint only the rows whose playing/favourite state changed. */
export function refreshRows() {
  const playing = current();
  currentRow = null;
  for (const row of $$('#tracklist .row')) {
    const id = row.dataset.id;
    const isCurrent = Boolean(playing && playing.id === id);
    if (isCurrent && !row.classList.contains('is-current')) replay(row, 'is-arriving');
    if (!isCurrent) row.style.removeProperty('--p');
    row.classList.toggle('is-current', isCurrent);
    const fav = row.querySelector('.r-fav');
    if (!fav) continue;
    const on = store.favorites.has(id);
    fav.classList.toggle('is-on', on);
    fav.replaceChildren(icon(on ? 'heart' : 'heart-o'));
    fav.title = on ? 'Remove from favorites' : 'Add to favorites';
  }
}

/* ------------------------------------------------------------ now playing --- */

let shownTrackId = null;

export function renderNowPlaying() {
  const track = current();
  const changed = (track?.id ?? null) !== shownTrackId;
  shownTrackId = track?.id ?? null;

  if (!track) {
    dom.npTitle.textContent = 'Nothing playing';
    dom.npSub.textContent = 'Pick something from your library';
    dom.npChips.replaceChildren();
    dom.npFacts.replaceChildren();
    dom.npArt.classList.remove('has-art');
    dom.npArt.style.removeProperty('--art');
    dom.pbTitle.textContent = '—';
    dom.pbSub.textContent = '';
    dom.pbArt.style.removeProperty('--art');
    dom.pbDur.textContent = '0:00';
    applyTheme(null);
    return;
  }

  dom.npTitle.textContent = track.title;
  dom.npTitle.title = track.title;
  dom.npSub.textContent = subtitleFor(track) || 'Unknown';
  const era = eraOf(track);
  dom.npChips.replaceChildren(
    era
      ? eraChip(era)
      : h('button.era-set.era-set--np', { onclick: () => openEraPicker([track.id]) }, icon('plus'), h('span', null, 'Set era')),
    ...tagsFor(track).map((tag) => h('span.tag', { class: tag.cls || '' }, tag.text)),
  );

  setArtVar(dom.npArt, track.art, true);
  setArtVar(dom.pbArt, track.art);
  if (changed) {
    for (const node of [dom.npArt, dom.pbArt, dom.npTitle, dom.npSub, dom.npChips, dom.pbTitle, dom.pbSub]) {
      replay(node, 'is-swap');
    }
  }

  dom.pbTitle.textContent = track.title;
  dom.pbTitle.title = track.title;
  dom.pbSub.textContent = subtitleFor(track);
  dom.pbDur.textContent = track.duration ? fmtTime(track.duration) : '0:00';

  const facts = [
    ['Era', era],
    ['Session', track.session],
    ['Artist', [track.artist, ...track.features].filter(Boolean).join(', ')],
    ['Year', track.year],
    ['Quality', track.bitrate ? `${track.bitrate} kbps${track.vbr ? ' VBR' : ''}` : null],
    ['Format', track.codec || track.ext.toUpperCase()],
    ['Sample rate', track.sampleRate ? (track.sampleRate / 1000).toFixed(1) + ' kHz' : null],
    ['Size', fmtBytes(track.size)],
    ['Added', fmtDate(track.mtime)],
    ['Plays', store.playCounts[track.id] || 0],
    ['File', track.file],
  ].filter(([, value]) => value !== null && value !== undefined && value !== '');

  dom.npFacts.replaceChildren(...facts.flatMap(([label, value]) => [
    h('dt', null, label),
    h('dd', { title: String(value) }, String(value)),
  ]));

  const favorited = store.favorites.has(track.id);
  for (const button of [dom.npFav, dom.pbFav]) {
    button.classList.toggle('is-on', favorited);
    button.replaceChildren(icon(favorited ? 'heart' : 'heart-o'));
  }

  applyTheme(track);
}

/* ------------------------------------------------------------------ queue --- */

export function renderQueue() {
  const list = upNext();
  dom.queueCount.textContent = list.length ? list.length : '';
  dom.queueSource.textContent = player.source ? `From ${player.source}` : 'Queue';

  if (!list.length) {
    dom.queueList.replaceChildren(h('div.empty', null,
      icon('queue'),
      h('strong', null, 'Nothing queued'),
      h('span', null, 'Play an album or right-click a track to line things up.'),
    ));
    return;
  }

  dom.queueList.replaceChildren(...list.map((track, position) => {
    const item = h('div.q-item', { draggable: true, dataset: { position }, title: track.title },
      h('div.q-art', null, track.art ? lazyImage(track.art, '') : null),
      h('div', null,
        h('div.q-title', null, track.title),
        h('div.q-sub', null, subtitleFor(track) || fmtTime(track.duration || 0)),
      ),
      h('button.icon-btn.icon-btn--sm.q-drop', {
        title: 'Remove from queue',
        onclick: (event) => { event.stopPropagation(); removeUpNext(position); },
      }, icon('x')),
    );

    item.addEventListener('click', () => jumpUpNext(position));
    item.addEventListener('dragstart', (event) => {
      event.dataTransfer.setData('text/plain', String(position));
      event.dataTransfer.effectAllowed = 'move';
      item.classList.add('is-dragging');
    });
    item.addEventListener('dragend', () => {
      item.classList.remove('is-dragging');
      $$('.q-item').forEach((node) => node.classList.remove('is-over'));
    });
    item.addEventListener('dragover', (event) => {
      event.preventDefault();
      item.classList.add('is-over');
    });
    item.addEventListener('dragleave', () => item.classList.remove('is-over'));
    item.addEventListener('drop', (event) => {
      event.preventDefault();
      const from = Number(event.dataTransfer.getData('text/plain'));
      if (Number.isInteger(from) && from !== position) moveUpNext(from, position);
    });
    return item;
  }));
}

/* ---------------------------------------------------------------- playbar --- */

let currentRow = null;

/** The playing row slowly fills with colour as the song goes on. */
function paintRowProgress(pct) {
  const track = current();
  if (!track) return;
  if (!currentRow || !currentRow.isConnected || currentRow.dataset.id !== track.id) {
    currentRow = dom.board.querySelector(`.row[data-id="${track.id}"]`);
  }
  if (!currentRow) return;
  if (pct === undefined) {
    const audio = player.audio;
    const duration = Number.isFinite(audio.duration) ? audio.duration : (track.duration || 0);
    pct = duration ? (audio.currentTime / duration) * 100 : 0;
  }
  currentRow.style.setProperty('--p', pct.toFixed(2) + '%');
}

export function renderTime() {
  const audio = player.audio;
  const duration = Number.isFinite(audio.duration) ? audio.duration : (current()?.duration || 0);
  const pct = duration ? (audio.currentTime / duration) * 100 : 0;
  dom.pbFill.style.width = pct.toFixed(3) + '%';
  paintRowProgress(pct);
  dom.pbCur.textContent = fmtTime(audio.currentTime);
  dom.pbDur.textContent = fmtTime(duration);
}

export function renderBuffer() {
  const audio = player.audio;
  const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
  if (!duration || !audio.buffered.length) { dom.pbBuffer.style.width = '0%'; return; }
  let end = 0;
  for (let i = 0; i < audio.buffered.length; i++) {
    if (audio.buffered.start(i) <= audio.currentTime) end = Math.max(end, audio.buffered.end(i));
  }
  dom.pbBuffer.style.width = ((end / duration) * 100).toFixed(2) + '%';
}

/* ----------------------------------------------------------- context menu --- */

let menuCloser = null;

export function openMenu(event, items) {
  closeMenu();
  const menu = dom.menu;
  menu.replaceChildren(...items.map((item) => {
    if (item === '-') return h('hr');
    if (item.label) return h('div.menu-label', null, item.label);
    return h('button', {
      class: item.danger ? 'is-danger' : '',
      onclick: () => { closeMenu(); item.run(); },
    }, icon(item.icon || 'dots'), h('span', null, item.text));
  }));

  menu.hidden = false;
  const { innerWidth: vw, innerHeight: vh } = window;
  const rect = menu.getBoundingClientRect();
  const x = Math.min(event.clientX, vw - rect.width - 12);
  const y = Math.min(event.clientY, vh - rect.height - 12);
  menu.style.left = Math.max(8, x) + 'px';
  menu.style.top = Math.max(8, y) + 'px';

  const onAway = (e) => { if (!menu.contains(e.target)) closeMenu(); };
  const onKey = (e) => { if (e.key === 'Escape') closeMenu(); };
  setTimeout(() => {
    document.addEventListener('mousedown', onAway);
    document.addEventListener('keydown', onKey);
    window.addEventListener('blur', closeMenu);
  }, 0);
  menuCloser = () => {
    document.removeEventListener('mousedown', onAway);
    document.removeEventListener('keydown', onKey);
    window.removeEventListener('blur', closeMenu);
  };
}

export function closeMenu() {
  dom.menu.hidden = true;
  menuCloser?.();
  menuCloser = null;
}

export function trackMenu(track, list = null) {
  const favorited = store.favorites.has(track.id);
  const items = [
    { text: 'Play now', icon: 'play', run: () => playTrack(track, list, viewTitle()) },
    { text: 'Play next', icon: 'next', run: () => { playNext(track); toast('Playing next'); } },
    { text: 'Add to queue', icon: 'queue', run: () => { addToQueue(track); toast('Added to queue'); } },
    '-',
    {
      text: favorited ? 'Remove from favorites' : 'Add to favorites',
      icon: favorited ? 'heart' : 'heart-o',
      run: () => { toggleFavorite(track.id); toast(favorited ? 'Removed from favorites' : 'Added to favorites', 'heart'); },
    },
    { text: 'Add to playlist…', icon: 'plus', run: () => openPlaylistPicker([track.id]) },
  ];

  if (store.view.kind === 'playlist') {
    items.push({
      text: 'Remove from this playlist',
      icon: 'x',
      danger: true,
      run: () => { removeFromPlaylist(store.view.key, track.id); render(); },
    });
  }

  const era = eraOf(track);
  items.push(
    '-',
    { text: era ? 'Change era…' : 'Set era…', icon: 'layers', run: () => openEraPicker([track.id]) },
    ...(era ? [{ text: `Go to ${era}`, icon: 'tag', run: () => setView('era', era) }] : []),
    { text: 'Go to session', icon: 'disc', run: () => setView('session', track.session) },
    { text: 'Show file in folder', icon: 'folder', run: () => revealFile(track) },
    { text: 'Save a copy', icon: 'down', run: () => downloadTrack(track) },
  );
  if (!track.session) items.splice(items.findIndex((i) => i.text === 'Go to session'), 1);
  return items;
}

function playlistMenu(playlist) {
  return [
    { text: 'Play', icon: 'play', run: () => {
      const tracks = playlist.tracks.map((id) => store.byId.get(id)).filter(Boolean);
      if (tracks.length) playList(tracks, 0, playlist.name);
    } },
    { text: 'Rename…', icon: 'list', run: () => openRename(playlist) },
    '-',
    { text: 'Delete playlist', icon: 'x', danger: true, run: () => {
      deletePlaylist(playlist.id);
      render();
      toast('Playlist deleted');
    } },
  ];
}

async function revealFile(track) {
  try {
    await fetch('/api/reveal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: track.id }),
    });
    toast('Opened in Explorer', 'folder');
  } catch {
    toast('Could not open the folder', 'x');
  }
}

function downloadTrack(track) {
  const link = h('a', { href: `/api/audio/${track.id}?download=1`, download: '' });
  document.body.append(link);
  link.click();
  link.remove();
}

/* ----------------------------------------------------------------- modals --- */

export function openModal(...children) {
  const body = h('div.modal-body', null, ...children);
  dom.modalCard.replaceChildren(body);
  dom.modal.hidden = false;
  // The era picker is mostly clicks and number keys, so leave its text box alone.
  const field = dom.modalCard.querySelector('.field');
  if (field && !dom.modalCard.querySelector('.era-pick')) setTimeout(() => { field.focus(); field.select?.(); }, 40);
  return body;
}

export function closeModal() {
  dom.modal.hidden = true;
  dom.modalCard.replaceChildren();
}

export function openNewPlaylist(seedTracks = []) {
  const input = h('input.field', {
    type: 'text',
    placeholder: 'Late night rotation',
    maxLength: 60,
    value: '',
  });
  const submit = () => {
    const playlist = createPlaylist(input.value, seedTracks);
    closeModal();
    render();
    toast(seedTracks.length ? `Created “${playlist.name}” with ${plural(seedTracks.length, 'track')}` : `Created “${playlist.name}”`, 'plus');
  };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });

  openModal(
    h('h2', null, 'New playlist'),
    h('p.sub', null, seedTracks.length ? `Starting with ${plural(seedTracks.length, 'track')}.` : 'Give it a name you will recognise later.'),
    input,
    h('div.modal-actions', null,
      h('button.pill', { onclick: closeModal }, 'Cancel'),
      h('button.pill.pill--primary', { onclick: submit }, 'Create'),
    ),
  );
}

function openRename(playlist) {
  const input = h('input.field', { type: 'text', value: playlist.name, maxLength: 60 });
  const submit = () => { renamePlaylist(playlist.id, input.value); closeModal(); render(); };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
  openModal(
    h('h2', null, 'Rename playlist'),
    h('p.sub', null, 'Pick something new.'),
    input,
    h('div.modal-actions', null,
      h('button.pill', { onclick: closeModal }, 'Cancel'),
      h('button.pill.pill--primary', { onclick: submit }, 'Save'),
    ),
  );
}

export function openPlaylistPicker(trackIds) {
  openModal(
    h('h2', null, 'Add to playlist'),
    h('p.sub', null, plural(trackIds.length, 'track') + ' ready to file away.'),
    h('div.pl-pick', null,
      h('button', { onclick: () => { closeModal(); openNewPlaylist(trackIds); } },
        icon('plus'), h('span', null, 'New playlist…')),
      ...store.playlists.map((playlist) => h('button', {
        onclick: () => {
          const added = addToPlaylist(playlist.id, trackIds);
          closeModal();
          render();
          toast(added ? `Added ${plural(added, 'track')} to “${playlist.name}”` : 'Already in that playlist', 'plus');
        },
      }, icon('list'), h('span', null, playlist.name), h('em', null, playlist.tracks.length))),
    ),
    h('div.modal-actions', null, h('button.pill', { onclick: closeModal }, 'Close')),
  );
}

/** Choose the era for one or more tracks. */
export function openEraPicker(trackIds) {
  const tracks = trackIds.map((id) => store.byId.get(id)).filter(Boolean);
  if (!tracks.length) return;
  const first = tracks[0];
  const selected = eraOf(first);
  const manual = isManual(first);
  const counts = new Map(eras().map((e) => [e.name, e.tracks.length]));

  const finish = async (name, message) => {
    setEra(tracks.map((t) => t.id), name);
    closeModal();
    haptic([5, 25, 8]);
    toast(message, 'layers');
    // A brand-new era needs its colour worked out before it is drawn.
    await computeEraColors();
    const listAffected = ['era', 'eras'].includes(store.view.kind) || store.settings.sort === 'era';
    if (listAffected) render();
    else { refreshEraCells(); renderSidebar(); }
    renderNowPlaying();
  };

  const input = h('input.field', { type: 'text', placeholder: 'New era, e.g. Heartbreak Kid', maxLength: 40 });
  const create = () => {
    const name = input.value.trim();
    if (name) finish(name, `Moved to ${name}`);
  };
  input.addEventListener('keydown', (event) => { if (event.key === 'Enter') create(); });

  const options = eraNames().map((name, i) => {
    const button = h('button', {
      class: name === selected ? 'is-on' : '',
      onclick: () => finish(name, `Moved to ${name}`),
    },
      h('i.era-dot'),
      h('span', null, name),
      h('em', null, counts.get(name) || ''),
      i < 9 ? h('kbd', null, String(i + 1)) : h('kbd.is-blank'),
      icon('check', 'ic era-check'),
    );
    button.style.setProperty('--era', eraColor(name));
    return button;
  });

  let hint = 'Nothing in the file says. Pick where it belongs.';
  if (manual) hint = 'You chose this one yourself.';
  else if (selected) hint = 'Worked out from the tags. Pick another if it’s wrong.';

  const body = openModal(
    h('h2', null, tracks.length === 1 ? `Era for “${first.title}”` : `Era for ${plural(tracks.length, 'track')}`),
    h('p.sub', null, hint),
    h('div.era-pick', null, ...options),
    h('div.era-new', null, input, h('button.pill', { onclick: create }, icon('plus'), h('span', null, 'Add'))),
    h('div.modal-actions.modal-actions--split', null,
      h('div.modal-links', null,
        manual ? h('button.link-btn', { onclick: () => finish(undefined, 'Back to the automatic era') }, 'Use automatic') : null,
        selected ? h('button.link-btn', { onclick: () => finish(null, 'Era cleared') }, 'No era') : null,
      ),
      h('button.pill', { onclick: closeModal }, 'Cancel'),
    ),
  );

  // Number keys pick straight from the list while the text box isn't focused.
  const onKey = (event) => {
    if (!body.isConnected) { document.removeEventListener('keydown', onKey, true); return; }
    if (event.target === input || event.ctrlKey || event.metaKey || event.altKey) return;
    const n = Number(event.key);
    if (n >= 1 && n <= Math.min(9, options.length)) {
      event.preventDefault();
      event.stopPropagation();
      options[n - 1].click();
    }
  };
  document.addEventListener('keydown', onKey, true);
}

const SHORTCUTS = [
  [['Space'], 'Play / pause'],
  [['→'], 'Forward 5s'],
  [['←'], 'Back 5s'],
  [['Shift', '→'], 'Next track'],
  [['Shift', '←'], 'Previous track'],
  [['↑'], 'Volume up'],
  [['↓'], 'Volume down'],
  [['S'], 'Toggle shuffle'],
  [['R'], 'Cycle repeat'],
  [['F'], 'Favorite current'],
  [['M'], 'Mute'],
  [['Q'], 'Show queue'],
  [['E'], 'Set era of current track'],
  [['/'], 'Search'],
  [['Esc'], 'Clear search'],
  [[','], 'Settings'],
  [['.'], 'Equalizer'],
];

export function openShortcuts() {
  openModal(
    h('h2', null, 'Keyboard shortcuts'),
    h('p.sub', null, 'Everything you need without reaching for the mouse.'),
    h('div.keys', null, ...SHORTCUTS.map(([keys, label]) => h('div', null,
      h('span', null, label),
      h('b', null, ...keys.map((key) => h('kbd', null, key))),
    ))),
    h('div.modal-actions', null, h('button.pill.pill--primary', { onclick: closeModal }, 'Got it')),
  );
}
