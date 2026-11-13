/**
 * Artwork pipeline.
 *
 * The embedded covers are full-size (650 KB on average), so the browser
 * downsamples each one exactly once, posts the thumbnail back to the server,
 * and everything afterwards runs off the cached 224px version. The same pass
 * extracts the palette the whole interface themes itself with.
 */

import { api, clamp } from './util.js';
import { glideAccent } from './fx.js';

const THUMB_SIZE = 224;
const haveThumb = new Set();      // art filenames with a cached thumbnail
const palettes = new Map();       // art filename -> { color, palette }
const pending = new Set();        // art filenames queued for generation

export const artUrl = (name) => (name ? '/api/art/' + encodeURIComponent(name) : null);
export const thumbUrl = (name) => {
  if (!name) return null;
  const key = name.replace(/\.[a-z]+$/i, '');
  return haveThumb.has(key) ? '/api/thumb/' + encodeURIComponent(name) : artUrl(name);
};

export async function initArt() {
  try {
    const data = await api('/api/thumbs');
    for (const key of data.have) haveThumb.add(key);
    for (const [key, value] of Object.entries(data.colors || {})) palettes.set(key, value);
  } catch (err) {
    console.warn('thumbnail manifest unavailable', err);
  }
}

/* ------------------------------------------------------------ lazy images --- */

const observer = new IntersectionObserver((entries) => {
  for (const entry of entries) {
    if (!entry.isIntersecting) continue;
    const img = entry.target;
    observer.unobserve(img);
    const src = img.dataset.src;
    if (!src) continue;
    img.src = src;
    if (img.complete) img.classList.add('is-loaded');
  }
}, { rootMargin: '320px 0px' });

/** An <img> that only fetches once it is close to the viewport. */
export function lazyImage(artName, alt = '') {
  const img = new Image();
  img.alt = alt;
  img.decoding = 'async';
  img.loading = 'lazy';
  img.dataset.src = thumbUrl(artName);
  img.addEventListener('load', () => img.classList.add('is-loaded'), { once: true });
  img.addEventListener('error', () => { img.dataset.failed = '1'; }, { once: true });
  observer.observe(img);
  return img;
}

/* -------------------------------------------------------------- palettes --- */

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (!d) return [0, 0, l];
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let hue;
  if (max === r) hue = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) hue = ((b - r) / d + 2) / 6;
  else hue = ((r - g) / d + 4) / 6;
  return [hue, s, l];
}

function hslToRgb(hue, s, l) {
  if (!s) { const v = Math.round(l * 255); return [v, v, v]; }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const channel = (t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [channel(hue + 1 / 3), channel(hue), channel(hue - 1 / 3)].map((v) => Math.round(v * 255));
}

/** Nudge a sampled colour into a range that reads well as a UI accent. */
function vivify(rgb, targetL = 0.6) {
  const [hue, s, l] = rgbToHsl(...rgb);
  return hslToRgb(hue, clamp(Math.max(s, 0.45), 0, 0.92), clamp(l < 0.1 || l > 0.9 ? targetL : (l * 0.45 + targetL * 0.55), 0.42, 0.72));
}

/**
 * Bucket pixels by hue, weight each by saturation and mid-lightness, and take
 * the two strongest distinct hues.
 */
function extractPalette(canvas) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);

  const BUCKETS = 24;
  const buckets = Array.from({ length: BUCKETS }, () => ({ weight: 0, r: 0, g: 0, b: 0 }));
  let fallback = { weight: 0, r: 0, g: 0, b: 0 };

  for (let i = 0; i < data.length; i += 4) {
    const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]];
    if (a < 128) continue;
    const [hue, s, l] = rgbToHsl(r, g, b);

    fallback.weight += 1; fallback.r += r; fallback.g += g; fallback.b += b;
    if (l < 0.12 || l > 0.93 || s < 0.14) continue;   // near-black, blown out, or grey

    // Mid-tones carry an album's identity better than shadows or highlights.
    const weight = s * s * (1 - Math.abs(l - 0.52) * 1.5);
    if (weight <= 0) continue;

    const bucket = buckets[Math.min(BUCKETS - 1, Math.floor(hue * BUCKETS))];
    bucket.weight += weight;
    bucket.r += r * weight;
    bucket.g += g * weight;
    bucket.b += b * weight;
  }

  const ranked = buckets
    .map((bucket, index) => ({ ...bucket, index }))
    .filter((bucket) => bucket.weight > 0)
    .sort((a, b) => b.weight - a.weight);

  const mean = (bucket) => [bucket.r / bucket.weight, bucket.g / bucket.weight, bucket.b / bucket.weight].map(Math.round);

  if (!ranked.length) {
    if (!fallback.weight) return { color: [139, 92, 246], palette: [[56, 189, 248]] };
    return { color: vivify(mean(fallback)), palette: [] };
  }

  const primary = vivify(mean(ranked[0]));
  // Prefer a second hue far enough away to be visibly different.
  const secondary = ranked.find((bucket) => {
    const gap = Math.abs(bucket.index - ranked[0].index);
    return Math.min(gap, 24 - gap) >= 3;
  });

  return {
    color: primary,
    palette: secondary ? [vivify(mean(secondary), 0.63)] : [],
  };
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('could not load ' + src));
    img.src = src;
  });
}

/** Downsample one cover, cache the thumbnail and palette on the server. */
async function generate(artName) {
  const key = artName.replace(/\.[a-z]+$/i, '');
  const img = await loadImage(artUrl(artName));

  const side = Math.min(img.naturalWidth, img.naturalHeight) || THUMB_SIZE;
  const sx = (img.naturalWidth - side) / 2;
  const sy = (img.naturalHeight - side) / 2;

  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = THUMB_SIZE;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, sx, sy, side, side, 0, 0, THUMB_SIZE, THUMB_SIZE);

  // Palette comes off a tiny copy: 48x48 is plenty and keeps the read cheap.
  const small = document.createElement('canvas');
  small.width = small.height = 48;
  small.getContext('2d').drawImage(canvas, 0, 0, 48, 48);
  const palette = extractPalette(small);

  const dataUrl = canvas.toDataURL('image/jpeg', 0.84);
  palettes.set(key, palette);

  await api('/api/thumb/' + encodeURIComponent(artName), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dataUrl, color: palette.color, palette: palette.palette }),
  });
  haveThumb.add(key);
  return palette;
}

/**
 * Work through missing thumbnails a couple at a time, during idle moments, so
 * the first run warms the cache without ever blocking playback or scrolling.
 */
export function warmThumbnails(tracks, onProgress) {
  const missing = [...new Set(tracks.map((t) => t.art).filter(Boolean))]
    .filter((name) => !haveThumb.has(name.replace(/\.[a-z]+$/i, '')));
  if (!missing.length) return Promise.resolve(0);

  let done = 0;
  let cursor = 0;

  const worker = async () => {
    while (cursor < missing.length) {
      const name = missing[cursor++];
      try {
        await generate(name);
      } catch (err) {
        console.debug('thumbnail skipped', name, err.message);
      }
      done++;
      onProgress?.(done, missing.length);
      // Yield between covers so the UI thread stays responsive.
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  };

  return Promise.all([worker(), worker()]).then(() => done);
}

/** Palette for a cover, computing it on demand if it was never cached. */
export async function paletteFor(artName) {
  if (!artName) return null;
  const key = artName.replace(/\.[a-z]+$/i, '');
  if (palettes.has(key)) return palettes.get(key);
  if (pending.has(key)) return null;

  pending.add(key);
  try {
    return await generate(artName);
  } catch {
    return null;
  } finally {
    pending.delete(key);
  }
}

/* ---------------------------------------------------------------- theming --- */

const DEFAULT_ACCENT = [139, 92, 246];
const DEFAULT_SECOND = [56, 189, 248];
let ambientSlot = 0;

/** Repaint the accent colour and the blurred backdrop for a track. */
export async function applyTheme(track) {
  const layers = document.querySelectorAll('.ambient-art');

  if (!track || !track.art) {
    glideAccent(DEFAULT_ACCENT, DEFAULT_SECOND);
    layers.forEach((layer) => layer.classList.remove('is-on'));
    return;
  }

  const url = `url("${thumbUrl(track.art)}")`;
  const incoming = layers[ambientSlot % layers.length];
  const outgoing = layers[(ambientSlot + 1) % layers.length];
  ambientSlot++;

  incoming.style.setProperty('--art', url);
  incoming.classList.add('is-on');
  outgoing.classList.remove('is-on');

  const palette = await paletteFor(track.art);
  if (!palette) return;
  glideAccent(palette.color, palette.palette?.[0] || DEFAULT_SECOND);
}

/** Set a CSS background-image variable on an element, if there is art for it. */
export function setArtVar(node, artName, useFull = false) {
  const url = useFull ? artUrl(artName) : thumbUrl(artName);
  if (url) {
    node.style.setProperty('--art', `url("${url}")`);
    node.classList.add('has-art');
    node.classList.remove('is-empty');
  } else {
    node.style.removeProperty('--art');
    node.classList.remove('has-art');
    node.classList.add('is-empty');
  }
}
