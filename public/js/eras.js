/**
 * Eras: which chapter of the catalogue a track belongs to.
 *
 * The archive never says so directly. The answer is spread across album tags
 * ("WRLD ON DRUGS (Sessions)", "Analog (GB&GR)"), filename abbreviations and,
 * for untagged leaks, other copies of the same song that *are* tagged. Anything
 * still unknown can be set by hand, and those choices win over every guess.
 */

import { store, save, emit } from './store.js';
import { paletteFor } from './art.js';

/** Known eras, oldest first. `match` runs on the album with punctuation stripped. */
const KNOWN = [
  { name: 'JUTE', abbr: ['JUTE'], match: /jute|juiceduptheep/ },
  { name: '999', abbr: ['999'], match: /999/ },
  { name: 'Goodbye & Good Riddance', abbr: ['GB&GR', 'GBGR'], match: /goodbye(and)?goodriddance/ },
  { name: 'WRLD ON DRUGS', abbr: ['WOD'], match: /(wrld|world)ondrugs/ },
  { name: 'Death Race For Love', abbr: ['DRFL'], match: /deathraceforlove/ },
  { name: 'JW3', abbr: ['JW3'], match: /jw3/ },
  { name: 'Outsiders', abbr: [], match: /outsiders/ },
  { name: 'Posthumous', abbr: ['LND', 'TPNE'], match: /posthumous|legendsneverdie|thepartyneverends|fightingdemons/ },
];

const ORDER = new Map(KNOWN.map((era, i) => [era.name, i]));
const BY_ABBR = new Map(KNOWN.flatMap((era) => era.abbr.map((a) => [a, era.name])));
// titles.js expands a few abbreviations into longer names before we see them.
BY_ABBR.set('WORLD ON DRUGS', 'WRLD ON DRUGS');
BY_ABBR.set('GOODBYE & GOOD RIDDANCE', 'Goodbye & Good Riddance');

const squash = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

function fromText(text) {
  if (!text) return null;
  // Abbreviations only count as whole parenthesised tokens: "(WOD)", not "wodka".
  for (const [, token] of text.matchAll(/\(([^()]+)\)/g)) {
    const hit = BY_ABBR.get(token.trim().toUpperCase());
    if (hit) return hit;
  }
  const flat = squash(text);
  return KNOWN.find((era) => era.match.test(flat))?.name || null;
}

function fromCollections(track) {
  for (const c of track.collections) {
    const hit = BY_ABBR.get(c.toUpperCase()) || fromText(c);
    if (hit) return hit;
  }
  return null;
}

/* --------------------------------------------------------------- guessing --- */

const guessed = new Map();   // track id -> era name (or null)

/** Work out every track's era from its own metadata, then from its twins. */
export function computeEras() {
  guessed.clear();
  const byTitle = new Map();

  for (const track of store.tracks) {
    const era = fromText(track.album) || fromCollections(track);
    guessed.set(track.id, era);
    if (era) {
      for (const key of [track.dedupeKey, ...track.aka.map(squash)]) {
        if (key && !byTitle.has(key)) byTitle.set(key, era);
      }
    }
  }

  for (const track of store.tracks) {
    if (guessed.get(track.id)) continue;
    // An untagged "Flaws.mp3" is the same song as "Flaws (Ray Charles) (GB&GR)".
    const twin = [track.dedupeKey, ...track.aka.map(squash)].map((k) => byTitle.get(k)).find(Boolean);
    // Unrecognised abbreviations like "(KKK)" still name a chapter of their own.
    guessed.set(track.id, twin || track.collections.find((c) => /^[A-Z0-9&.']{2,8}$/.test(c)) || null);
  }
}

/** The era shown for a track: the user's choice first, then the best guess. */
export function eraOf(track) {
  if (!track) return null;
  if (Object.hasOwn(store.eras, track.id)) return store.eras[track.id] || null;
  return guessed.get(track.id) ?? null;
}

export const isManual = (track) => Boolean(track) && Object.hasOwn(store.eras, track.id);

/**
 * Set (or clear, with null) the era for tracks, including their duplicate
 * copies so a hidden twin never disagrees with the visible one.
 * @param {string|null|undefined} name  null = "no era"; undefined = back to the automatic guess
 */
export function setEra(trackIds, name) {
  const ids = new Set(trackIds);
  for (const track of store.tracks) {
    if (track.duplicateOf && ids.has(track.duplicateOf)) ids.add(track.id);
  }
  for (const id of ids) {
    if (name === undefined) delete store.eras[id];
    else store.eras[id] = name ? name.trim() : '';
  }
  save();
  emit('eras');
}

/* ---------------------------------------------------------------- listing --- */

/** Sort position: known eras chronologically, custom ones after, none last. */
export function eraRank(name) {
  if (!name) return 1e6;
  return ORDER.has(name) ? ORDER.get(name) : 1000;
}

/** Every era in use, in chronological order, with its tracks. */
export function eras() {
  const map = new Map();
  for (const track of store.tracks) {
    if (store.settings.hideDupes && track.duplicateOf) continue;
    const name = eraOf(track);
    if (!name) continue;
    if (!map.has(name)) map.set(name, []);
    map.get(name).push(track);
  }
  return [...map.entries()]
    .map(([name, tracks]) => ({ name, tracks }))
    .sort((a, b) => eraRank(a.name) - eraRank(b.name) || a.name.localeCompare(b.name));
}

/** Names worth offering in the era picker, even ones with no tracks yet. */
export function eraNames() {
  const names = new Set(KNOWN.map((era) => era.name));
  for (const { name } of eras()) names.add(name);
  return [...names].sort((a, b) => eraRank(a) - eraRank(b) || a.localeCompare(b));
}

/* ----------------------------------------------------------------- colour --- */

const colors = new Map();   // era name -> "r g b"

function fallbackColor(name) {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const hue = (hash % 360) / 360;
  // hsl(hue, 62%, 64%) without pulling in a colour library.
  const q = 0.64 + 0.62 - 0.64 * 0.62;
  const p = 2 * 0.64 - q;
  const channel = (t) => {
    t = (t + 1) % 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [hue + 1 / 3, hue, hue - 1 / 3].map((t) => Math.round(channel(t) * 255)).join(' ');
}

/** "r g b" for an era, taken from the cover that appears most often inside it. */
export const eraColor = (name) => colors.get(name) || fallbackColor(name || '');

/** Resolve each era's colour from its artwork; cheap once palettes are cached. */
export async function computeEraColors() {
  await Promise.all(eras().map(async ({ name, tracks }) => {
    const counts = new Map();
    for (const t of tracks) if (t.art) counts.set(t.art, (counts.get(t.art) || 0) + 1);
    const art = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    const palette = art ? await paletteFor(art) : null;
    if (palette?.color) colors.set(name, palette.color.join(' '));
  }));
}
