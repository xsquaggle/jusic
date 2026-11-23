/**
 * Palette from a cover: the album's primary and secondary hues plus a deep
 * tone. Same hue-bucket method the app already uses (public/js/art.js), with
 * one more swatch taken from the shadows.
 */

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

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

function vivify(rgb, targetL = 0.6) {
  const [hue, s, l] = rgbToHsl(...rgb);
  return hslToRgb(hue, clamp(Math.max(s, 0.45), 0, 0.92), clamp(l < 0.1 || l > 0.9 ? targetL : (l * 0.45 + targetL * 0.55), 0.42, 0.72));
}

/** @returns {{a:number[], b:number[], c:number[]}} sRGB 0..255 */
export function paletteFromImage(image) {
  const size = 48;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(image, 0, 0, size, size);
  const { data } = ctx.getImageData(0, 0, size, size);

  const BUCKETS = 24;
  const buckets = Array.from({ length: BUCKETS }, () => ({ weight: 0, r: 0, g: 0, b: 0 }));
  const all = { weight: 0, r: 0, g: 0, b: 0 };
  let colourful = 0;     // pixels with a colour of their own (the audit's measure)
  let vivid = 0;         // how saturated those pixels are, summed
  const dark = { weight: 0, r: 0, g: 0, b: 0 };

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    if (data[i + 3] < 128) continue;
    const [hue, s, l] = rgbToHsl(r, g, b);
    all.weight += 1; all.r += r; all.g += g; all.b += b;
    if (s > 0.2 && l > 0.12 && l < 0.93) { colourful++; vivid += s; }
    if (l > 0.04 && l < 0.3) {
      const w = 0.2 + s;
      dark.weight += w; dark.r += r * w; dark.g += g * w; dark.b += b * w;
    }
    if (l < 0.12 || l > 0.93 || s < 0.14) continue;
    const weight = s * s * (1 - Math.abs(l - 0.52) * 1.5);
    if (weight <= 0) continue;
    const bucket = buckets[Math.min(BUCKETS - 1, Math.floor(hue * BUCKETS))];
    bucket.weight += weight;
    bucket.r += r * weight; bucket.g += g * weight; bucket.b += b * weight;
  }

  const mean = (k) => [k.r / k.weight, k.g / k.weight, k.b / k.weight].map(Math.round);
  const ranked = buckets.map((k, index) => ({ ...k, index })).filter((k) => k.weight > 0).sort((x, y) => y.weight - x.weight);

  let a, b;
  if (!ranked.length) {
    a = all.weight ? vivify(mean(all)) : [139, 92, 246];
    b = all.weight ? vivify(mean(all), 0.7) : [56, 189, 248];
  } else {
    a = vivify(mean(ranked[0]));
    const second = ranked.find((k) => {
      const gap = Math.abs(k.index - ranked[0].index);
      return Math.min(gap, BUCKETS - gap) >= 3 && k.weight > ranked[0].weight * 0.06;
    });
    // No second hue on the cover: use a lighter, slightly rotated version of the first.
    if (second) b = vivify(mean(second), 0.63);
    else { const [h, s] = rgbToHsl(...a); b = hslToRgb((h + 0.06) % 1, s * 0.7, 0.74); }
  }

  // Deep tone: the cover's own shadows, pulled toward the primary hue so it never reads as grey.
  const [ha, sa] = rgbToHsl(...a);
  let c;
  if (dark.weight > 20) {
    const [hd, sd] = rgbToHsl(...mean(dark));
    c = hslToRgb(sd > 0.12 ? hd : ha, clamp(Math.max(sd, 0.35), 0, 0.7), 0.2);
  } else {
    c = hslToRgb(ha, sa * 0.6, 0.2);
  }
  // A cover with little colour of its own (a white sleeve with line art, a near-black photograph) gets
  // pure mercury: a cool silver, not a colour invented by forcing saturation onto its grey mean (the
  // independent audit, 16 November 2026: the white cover turned the drop khaki, the near-black one bronze).
  // Fully silver below 5% of colourful pixels, fully the cover's own above 15%, between them a blend.
  const share = all.weight ? colourful / all.weight : 0;
  const k = clamp((share - 0.05) / 0.1, 0, 1);
  // A small accent that is truly vivid is the cover's own colour, not an invented one: it keeps up to 40% of its hue.
  const accent = clamp(share / 0.02, 0, 1) * clamp((vivid / (colourful || 1) - 0.45) / 0.3, 0, 1) * 0.4;
  const kk = Math.max(k * k * (3 - 2 * k), accent);
  const toSilver = (rgb) => {
    const l = rgbToHsl(...rgb)[2];
    const silver = hslToRgb(0.6, 0.06, l);
    return rgb.map((v, i) => Math.round(silver[i] + (v - silver[i]) * kk));
  };
  return { a: toSilver(a), b: toSilver(b), c: toSilver(c), colourful: share };
}
