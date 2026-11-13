'use strict';
/**
 * Turns a messy archive filename into structured, displayable metadata.
 * The library is a flat folder of leaks and session rips, so the filename is
 * usually richer than the ID3 tag: it carries alternate names, version numbers,
 * era abbreviations and featured artists.
 */

// Era / project abbreviations that show up in parentheses.
const COLLECTIONS = {
  'WOD': 'World On Drugs',
  'GB&GR': 'Goodbye & Good Riddance',
  'JUTE': 'JUTE',
  'ATTDI': 'ATTDI',
  'KKK': 'KKK',
};

// Parenthetical notes that describe the recording rather than rename the song.
const QUALIFIER_PATTERNS = [
  /^session(s| edit)?$/i,
  /^freestyle$/i,
  /^unreleased$/i,
  /^official audio$/i,
  /^lyrics$/i,
  /^(cdq )?remaster(ed)?$/i,
  /^demo$/i,
  /^in the mix$/i,
  /^with drums$/i,
  /^tampered instrumental$/i,
  /^instrumental$/i,
  /^open$/i,
  /^snippet$/i,
  /^remix$/i,
  /^\d+\s*bpm$/i,
  /^mix \d+$/i,
  /^new version$/i,
  /^999remix$/i,
];

const ARTIST_PREFIX = /^(?:the\s+chainsmokers\s*x\s*juice\s*wrld|juice\s*x\s*ski|juicewrld[.\s]\S+|juice\s*wrld|juice)\s*(?:[-–—]\s*|\s+(?=\S))/i;
const SCRAPE_JUNK = /\s*[-–]?\s*(?:NEW[\s-]GRAIL|Leaked|\d*Naijamuzic[-.\s]?com|Hippopcharts[-.\s]?com|Official[\s-]Audio)\s*/gi;

function collapse(s) {
  return s.replace(/\s+/g, ' ')
    .replace(/\s+([,.!?])/g, '$1')
    .replace(/^[\s\-–—]+|[\s\-–—]+$/g, '')
    .trim();
}

function splitArtists(s) {
  return s.split(/\s*(?:,|&|\band\b|\bx\b|\+)\s*/i).map((a) => collapse(a)).filter(Boolean);
}

/** Pull out every top-level (...) / [...] / {...} group, returning the stripped stem too. */
function extractGroups(stem) {
  const groups = [];
  let out = '';
  let depth = 0;
  let current = '';
  let opener = '';
  const closers = { '(': ')', '[': ']', '{': '}' };

  for (const ch of stem) {
    if (depth === 0 && closers[ch]) {
      depth = 1;
      opener = ch;
      current = '';
    } else if (depth > 0) {
      if (ch === opener) depth++;
      else if (ch === closers[opener]) {
        depth--;
        if (depth === 0) { groups.push(current); current = ''; continue; }
      }
      current += ch;
    } else {
      out += ch;
    }
  }
  if (depth > 0 && current.trim()) groups.push(current); // unbalanced, e.g. "Do It (ATTDI"
  return { base: collapse(out), groups: groups.map(collapse).filter(Boolean) };
}

/**
 * @param {string} filename Basename including extension.
 * @returns {{title: string, aka: string[], features: string[], version: ?string,
 *            collections: string[], qualifiers: string[], isCopy: boolean,
 *            variant: ?number, dedupeKey: string}}
 */
function parseFilename(filename) {
  let stem = filename.replace(/\.[a-z0-9]+$/i, '');

  const isCopy = /\s*-\s*Copy$/i.test(stem);
  stem = stem.replace(/\s*-\s*Copy$/i, '');

  let variant = null;
  const variantMatch = stem.match(/\s*\((\d{1,2})\)\s*$/);
  if (variantMatch) {
    variant = Number(variantMatch[1]);
    stem = stem.slice(0, variantMatch.index);
  }

  stem = stem.replace(/_/g, ' ').replace(SCRAPE_JUNK, ' ');
  // Some scraped names are fully hyphen-delimited with no spaces at all.
  if (!stem.trim().includes(' ') && (stem.match(/-/g) || []).length >= 3) stem = stem.replace(/-/g, ' ');
  stem = collapse(stem.replace(SCRAPE_JUNK, ' ')).replace(ARTIST_PREFIX, '');

  // Bare trailing version tokens: "v1.1", "V2", "1.0rl"
  let version = null;
  const bareVersion = stem.match(/\s(v\d+(?:\.\d+)?[a-z]*)\b/i);
  if (bareVersion) {
    version = bareVersion[1].toLowerCase();
    stem = stem.slice(0, bareVersion.index) + ' ' + stem.slice(bareVersion.index + bareVersion[0].length);
  }

  // Loose tempo markers like "170bpm" are a note about the file, not the title.
  const qualifiersFromStem = [];
  const bpm = stem.match(/\s*\b(\d{2,3})\s?bpm\b/i);
  if (bpm) {
    qualifiersFromStem.push(bpm[1] + ' BPM');
    stem = stem.slice(0, bpm.index) + ' ' + stem.slice(bpm.index + bpm[0].length);
  }

  const { base, groups } = extractGroups(stem);
  const aka = [];
  const features = [];
  const collections = [];
  const qualifiers = [...qualifiersFromStem];

  let titleSuffix = '';

  for (const raw of groups) {
    const g = collapse(raw);
    if (!g) continue;

    // "Pt. 2" belongs to the title rather than beside it.
    if (/^(?:pt\.?|part)\s*\d+$/i.test(g)) { titleSuffix = ' (' + g + ')'; continue; }

    const feat = g.match(/^(?:feat\.?|featuring|ft\.?|with|w\/)\s+(.+)$/i);
    if (feat) {
      // "(With drums)" describes the mix, not a guest: real names are capitalised.
      if (feat[1] === feat[1].toLowerCase()) qualifiers.push(g);
      else features.push(...splitArtists(feat[1]));
      continue;
    }

    const ver = g.match(/^v\.?\s*(\d+(?:\.\d+)?)$/i);
    if (ver) { version = version || 'v' + ver[1]; continue; }

    if (/^[A-Z0-9&.']{2,8}$/.test(g) && /[A-Z]/.test(g) && g !== g.toLowerCase()) {
      collections.push(COLLECTIONS[g.toUpperCase()] || g);
      continue;
    }

    if (QUALIFIER_PATTERNS.some((re) => re.test(g))) { qualifiers.push(g); continue; }

    // Session / producer scribbles ("chalice 2018 270", "metro sizzle faded")
    // read as notes about the file, not as an alternate song name.
    const words = g.split(' ');
    if (g === g.toLowerCase() || (/\d/.test(g) && words.length > 1)) { qualifiers.push(g); continue; }

    // "Revive v1" style groups: an alternate title carrying its own version.
    const akaVer = g.match(/^(.*?)\s+v\.?\s*(\d+(?:\.\d+)?)$/i);
    if (akaVer && akaVer[1]) {
      aka.push(akaVer[1]);
      version = version || 'v' + akaVer[2];
      continue;
    }
    aka.push(g);
  }

  let title = collapse(base);
  // "juice 3 (Compromised v3)" leaves a bare "3" behind: the alternate name is
  // the real title in that case.
  if (title.length <= 2 && aka.length) title = aka.shift();
  if (!title && aka.length) title = aka.shift();
  if (!title && qualifiers.length) title = qualifiers.shift();
  if (!title) title = collapse(stem) || filename;
  title += titleSuffix;

  // Restore natural capitalisation for all-lowercase scraped names.
  if (title === title.toLowerCase() && /[a-z]/.test(title)) {
    title = title.replace(/\b[a-z]/g, (c) => c.toUpperCase());
  }

  const dedupeKey = title.toLowerCase().replace(/[^a-z0-9]/g, '');

  return {
    title,
    aka,
    features: [...new Set(features)],
    version,
    collections: [...new Set(collections)],
    qualifiers,
    isCopy,
    variant,
    dedupeKey,
  };
}

module.exports = { parseFilename };
