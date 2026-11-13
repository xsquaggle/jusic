'use strict';
/**
 * Library scanner: walks the music root, reads tags/duration/artwork once,
 * and keeps the result in a JSON cache keyed by size+mtime so restarts are instant.
 */

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const crypto = require('crypto');

const { readId3v2, readId3v1 } = require('./id3');
const { probeMp3, probeWav, probeM4a, probeFlac, sniffContainer } = require('./audio');
const { parseFilename } = require('./titles');

const AUDIO_EXT = new Set(['.mp3', '.wav', '.m4a', '.flac', '.ogg', '.opus', '.aac', '.wma', '.webm']);
const MIME = {
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.m4a': 'audio/mp4', '.flac': 'audio/flac',
  '.ogg': 'audio/ogg', '.opus': 'audio/ogg', '.aac': 'audio/aac', '.wma': 'audio/x-ms-wma',
  '.webm': 'audio/webm',
};
const ART_EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/gif': '.gif', 'image/webp': '.webp', 'image/bmp': '.bmp' };
const CACHE_VERSION = 5;
const SCAN_WINDOW = 256 * 1024; // audio bytes read past the tag, for frame/VBR headers

const sha1 = (v) => crypto.createHash('sha1').update(v).digest('hex');

async function readHead(filePath, size) {
  const fh = await fsp.open(filePath, 'r');
  try {
    // Learn the ID3v2 tag length first so we read exactly as much as we need.
    const probe = Buffer.alloc(10);
    await fh.read(probe, 0, 10, 0);
    let tagLen = 0;
    if (probe.toString('latin1', 0, 3) === 'ID3') {
      tagLen = 10 + (((probe[6] & 0x7f) << 21) | ((probe[7] & 0x7f) << 14) |
                     ((probe[8] & 0x7f) << 7) | (probe[9] & 0x7f));
    }
    const want = Math.min(size, tagLen + SCAN_WINDOW);
    const buf = Buffer.alloc(want);
    const { bytesRead } = await fh.read(buf, 0, want, 0);

    let tail = Buffer.alloc(0);
    if (size > 128) {
      tail = Buffer.alloc(128);
      await fh.read(tail, 0, 128, size - 128);
    }
    return { head: buf.subarray(0, bytesRead), tail };
  } finally {
    await fh.close();
  }
}

/** Read the last `n` bytes, for containers that park their metadata at the end. */
async function readTail(filePath, size, n) {
  const want = Math.min(size, n);
  const fh = await fsp.open(filePath, 'r');
  try {
    const buf = Buffer.alloc(want);
    const { bytesRead } = await fh.read(buf, 0, want, size - want);
    return buf.subarray(0, bytesRead);
  } finally {
    await fh.close();
  }
}

async function saveArt(art, artDir) {
  const hash = sha1(art.data).slice(0, 16);
  const ext = ART_EXT[art.mime] || '.jpg';
  const name = hash + ext;
  const dest = path.join(artDir, name);
  try {
    await fsp.access(dest);
  } catch {
    await fsp.writeFile(dest, art.data);
  }
  return name;
}

async function readTrack(filePath, relPath, stat, artDir) {
  const ext = path.extname(filePath).toLowerCase();
  const { head, tail } = await readHead(filePath, stat.size);

  const v2 = readId3v2(head);
  const sniffed = sniffContainer(head.subarray(v2.audioStart)) || sniffContainer(head);
  const container = sniffed ? sniffed.container : ext.slice(1);
  const mime = sniffed ? sniffed.mime : (MIME[ext] || 'application/octet-stream');

  let tags = {};
  let art = null;
  if (v2.audioStart > 0 || container === 'mp3') {
    art = v2.art;
    tags = { ...readId3v1(tail), ...v2.tags };
  }

  const audioStart = v2.audioStart;
  let audioTail = 0;
  if (tail.length === 128 && tail.toString('latin1', 0, 3) === 'TAG') audioTail = 128;
  const audioBytes = Math.max(0, stat.size - audioStart - audioTail);

  let probe = null;
  try {
    if (container === 'mp3') probe = probeMp3(head, audioStart, audioBytes);
    else if (container === 'wav') probe = probeWav(head, stat.size);
    else if (container === 'flac') probe = probeFlac(head.subarray(audioStart));
    else if (container === 'm4a' || container === 'mov') {
      probe = probeM4a(head);
      // `moov` is often written after the audio data.
      if (!probe && stat.size > head.length) {
        probe = probeM4a(await readTail(filePath, stat.size, 2 * 1024 * 1024));
      }
    }
  } catch { /* unreadable bitstream: the client reports duration once it loads */ }

  if (probe && probe.bitrate == null && probe.duration > 0) {
    probe.bitrate = Math.round(audioBytes * 8 / probe.duration / 1000);
  }

  const parsed = parseFilename(path.basename(filePath));
  let artFile = null;
  if (art) {
    try { artFile = await saveArt(art, artDir); } catch { /* art cache write failed: skip */ }
  }

  // The tag title is shown as a secondary hint, so only keep it when it adds
  // something the filename does not already say.
  const tagTitle = (tags.title || '').trim();
  const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const stemNorm = norm(path.basename(filePath, path.extname(filePath)));
  const tagNorm = norm(tagTitle);
  const useTagTitle = Boolean(
    tagTitle && tagTitle.length > 1 && tagNorm &&
    !/^track\s*\d+$/i.test(tagTitle) &&
    !stemNorm.includes(tagNorm) && !tagNorm.includes(norm(parsed.title))
  );

  return {
    id: sha1(relPath).slice(0, 12),
    file: relPath,
    ext: ext.slice(1),
    container,
    size: stat.size,
    mtime: stat.mtimeMs,
    mime,

    title: parsed.title,
    tagTitle: useTagTitle ? tagTitle : null,
    artist: (tags.artist || '').trim() || null,
    albumArtist: (tags.albumArtist || '').trim() || null,
    album: (tags.album || '').trim() || null,
    genre: (tags.genre || '').trim() || null,
    year: (tags.year || '').trim().slice(0, 4) || null,
    track: tags.track ? Number(String(tags.track).split('/')[0]) || null : null,

    aka: parsed.aka,
    features: parsed.features,
    version: parsed.version,
    collections: parsed.collections,
    qualifiers: parsed.qualifiers,
    variant: parsed.variant,
    isCopy: parsed.isCopy,
    dedupeKey: parsed.dedupeKey,

    art: artFile,
    duration: probe ? probe.duration : null,
    bitrate: probe ? probe.bitrate : null,
    sampleRate: probe ? probe.sampleRate : null,
    channels: probe ? probe.channels : null,
    vbr: probe ? probe.vbr : false,
    codec: probe ? probe.codec : null,
  };
}

async function walk(root, dir = root, out = []) {
  let entries;
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.') || entry.name === 'desktop.ini') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(root, full, out);
    else if (AUDIO_EXT.has(path.extname(entry.name).toLowerCase())) {
      out.push(path.relative(root, full).split(path.sep).join('/'));
    }
  }
  return out;
}

/**
 * Collapse near-identical tag spellings. The archive has the same album written
 * several ways ("JW3 Sessions" / "JW3 (Sessions)", "WRLD ON DRUGS" / "WRLD On Drugs"),
 * which would otherwise split one session into three shelves.
 */
function canonicalize(tracks, field) {
  const key = (v) => v.toLowerCase().replace(/[^a-z0-9]/g, '');
  const counts = new Map();
  for (const t of tracks) {
    const v = t[field];
    if (!v) continue;
    const k = key(v);
    if (!counts.has(k)) counts.set(k, new Map());
    const variants = counts.get(k);
    variants.set(v, (variants.get(v) || 0) + 1);
  }
  const canonical = new Map();
  for (const [k, variants] of counts) {
    // Most common spelling wins; ties break toward the longer, more descriptive one.
    const best = [...variants.entries()].sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)[0][0];
    canonical.set(k, best);
  }
  for (const t of tracks) {
    if (t[field]) t[field] = canonical.get(key(t[field])) || t[field];
  }
}

/** Give every track a shelf: its album, or the era its filename hints at. */
function assignSessions(tracks) {
  for (const t of tracks) {
    // "JW3 Sessions" and "JW3 (Sessions)" should read the same way.
    if (t.album) t.album = t.album.replace(/\s+Sessions$/i, ' (Sessions)');
  }
  canonicalize(tracks, 'album');
  canonicalize(tracks, 'artist');
  canonicalize(tracks, 'albumArtist');

  for (const t of tracks) {
    if (t.album && !/^unreleased$/i.test(t.album)) t.session = t.album;
    else if (t.collections.length) t.session = t.collections[0] + ' (Sessions)';
    else if (t.album) t.session = t.album;
    else t.session = null;
  }
  canonicalize(tracks, 'session');
  return tracks;
}

/** Mark "X - Copy" files whose twin exists at the same byte size. */
function markDuplicates(tracks) {
  const bySignature = new Map();
  for (const t of tracks) {
    const key = t.dedupeKey + ':' + t.size;
    if (!bySignature.has(key)) bySignature.set(key, []);
    bySignature.get(key).push(t);
  }
  for (const group of bySignature.values()) {
    if (group.length < 2) continue;
    // Keep the cleanest name as the original; everything else is a redundant copy.
    group.sort((a, b) => (a.isCopy - b.isCopy) || (a.file.length - b.file.length));
    group.slice(1).forEach((t) => { t.duplicateOf = group[0].id; });
  }
  return tracks;
}

class Library {
  constructor({ root, dataDir }) {
    this.root = root;
    this.dataDir = dataDir;
    this.artDir = path.join(dataDir, 'art');
    this.cacheFile = path.join(dataDir, 'index.json');
    this.tracks = [];
    this.byId = new Map();
    this.scannedAt = null;
    this.scanning = null;
    this.progress = { done: 0, total: 0 };
  }

  async init() {
    fs.mkdirSync(this.artDir, { recursive: true });
    try {
      const cached = JSON.parse(await fsp.readFile(this.cacheFile, 'utf8'));
      if (cached.version === CACHE_VERSION && cached.root === this.root) {
        this.tracks = cached.tracks;
        this.scannedAt = cached.scannedAt;
        this.#index();
      }
    } catch { /* no usable cache: a scan will build one */ }
  }

  #index() {
    this.byId = new Map(this.tracks.map((t) => [t.id, t]));
  }

  get(id) {
    return this.byId.get(id) || null;
  }

  absPath(track) {
    const full = path.resolve(this.root, track.file);
    // Defence in depth: never serve anything outside the music root.
    if (!full.startsWith(path.resolve(this.root))) return null;
    return full;
  }

  /** Rescan the root. Concurrent callers share the in-flight scan. */
  scan({ force = false } = {}) {
    if (this.scanning) return this.scanning;
    this.scanning = this.#scan(force).finally(() => { this.scanning = null; });
    return this.scanning;
  }

  async #scan(force) {
    const started = Date.now();
    await fsp.mkdir(this.artDir, { recursive: true }); // may have been cleared since init
    const files = await walk(this.root);
    const previous = new Map(this.tracks.map((t) => [t.file, t]));
    this.progress = { done: 0, total: files.length };

    const results = new Array(files.length);
    const CONCURRENCY = 16;
    let cursor = 0;

    const worker = async () => {
      while (cursor < files.length) {
        const i = cursor++;
        const rel = files[i];
        const full = path.join(this.root, rel);
        try {
          const stat = await fsp.stat(full);
          const cached = previous.get(rel);
          if (!force && cached && cached.size === stat.size && cached.mtime === stat.mtimeMs) {
            results[i] = cached;
          } else {
            results[i] = await readTrack(full, rel, stat, this.artDir);
          }
        } catch (err) {
          results[i] = null;
        }
        this.progress.done++;
      }
    };

    await Promise.all(Array.from({ length: CONCURRENCY }, worker));

    this.tracks = markDuplicates(assignSessions(results.filter(Boolean)));
    this.scannedAt = Date.now();
    this.#index();
    await this.#writeCache();
    await this.#pruneArt();

    return { count: this.tracks.length, ms: Date.now() - started };
  }

  async #writeCache() {
    const payload = {
      version: CACHE_VERSION,
      root: this.root,
      scannedAt: this.scannedAt,
      tracks: this.tracks,
    };
    const tmp = this.cacheFile + '.tmp';
    await fsp.writeFile(tmp, JSON.stringify(payload));
    await fsp.rename(tmp, this.cacheFile);
  }

  /** Drop cached cover images no track references any more. */
  async #pruneArt() {
    try {
      const used = new Set(this.tracks.map((t) => t.art).filter(Boolean));
      for (const name of await fsp.readdir(this.artDir)) {
        if (!used.has(name)) await fsp.unlink(path.join(this.artDir, name)).catch(() => {});
      }
    } catch { /* pruning is best-effort */ }
  }
}

module.exports = { Library, MIME };
