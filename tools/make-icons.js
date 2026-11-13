'use strict';
/**
 * Draws the jusic mark and writes it out as PNGs plus a multi-resolution .ico.
 * Run with `node tools/make-icons.js`. No image libraries involved: the shapes
 * are rasterised by hand and the PNG/ICO containers are assembled here.
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

/* ------------------------------------------------------------- PNG output --- */

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'latin1');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

/** @param {Buffer} rgba Raw RGBA pixels, `size * size * 4` bytes. */
function encodePng(rgba, size) {
  const stride = size * 4;
  // Each scanline is prefixed with its filter type; 0 (None) keeps this simple.
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // colour type: RGBA
  ihdr[10] = 0;  // deflate
  ihdr[11] = 0;  // adaptive filtering
  ihdr[12] = 0;  // no interlace

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Windows accepts PNG-compressed entries in an .ico from Vista onwards. */
function buildIco(images) {
  const header = Buffer.alloc(6 + images.length * 16);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);                 // 1 = icon
  header.writeUInt16LE(images.length, 4);

  let offset = header.length;
  images.forEach(({ size, data }, i) => {
    const at = 6 + i * 16;
    header[at] = size >= 256 ? 0 : size;      // 0 means 256
    header[at + 1] = size >= 256 ? 0 : size;
    header[at + 2] = 0;                       // palette size
    header[at + 3] = 0;                       // reserved
    header.writeUInt16LE(1, at + 4);          // colour planes
    header.writeUInt16LE(32, at + 6);         // bits per pixel
    header.writeUInt32LE(data.length, at + 8);
    header.writeUInt32LE(offset, at + 12);
    offset += data.length;
  });

  return Buffer.concat([header, ...images.map((i) => i.data)]);
}

/* ---------------------------------------------------------------- drawing --- */

const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Signed distance to a rounded rectangle, negative inside. */
function roundedRectSdf(px, py, halfW, halfH, radius) {
  const qx = Math.abs(px) - halfW + radius;
  const qy = Math.abs(py) - halfH + radius;
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
  return outside + Math.min(Math.max(qx, qy), 0) - radius;
}

// Four bars echoing the equaliser mark in the app's sidebar.
const BARS = [0.46, 1.0, 0.64, 0.86];
const GRAD_FROM = [124, 58, 237];
const GRAD_TO = [14, 165, 233];

/**
 * Sample the artwork at a point in the unit square.
 * @returns {[number, number, number, number]} RGBA, alpha 0..1
 */
function sample(u, v) {
  // Background plate: rounded square, almost filling the canvas.
  const plate = roundedRectSdf(u - 0.5, v - 0.5, 0.472, 0.472, 0.225);
  if (plate > 0) return [0, 0, 0, 0];

  // Diagonal gradient, brightened slightly toward the top-left.
  const t = clamp01((u + v) / 2);
  let r = lerp(GRAD_FROM[0], GRAD_TO[0], t);
  let g = lerp(GRAD_FROM[1], GRAD_TO[1], t);
  let b = lerp(GRAD_FROM[2], GRAD_TO[2], t);
  const sheen = clamp01(1 - (u * 0.6 + v * 0.9)) * 0.13;
  r = Math.min(255, r + 255 * sheen);
  g = Math.min(255, g + 255 * sheen);
  b = Math.min(255, b + 255 * sheen);

  // Bars: bottom-aligned, rounded caps, drawn in white.
  const left = 0.235;
  const right = 0.765;
  const span = right - left;
  const gap = span * 0.085;
  const barW = (span - gap * (BARS.length - 1)) / BARS.length;
  const bottom = 0.775;
  const tallest = 0.55;

  for (let i = 0; i < BARS.length; i++) {
    const x0 = left + i * (barW + gap);
    const height = tallest * BARS[i];
    const cx = x0 + barW / 2;
    const cy = bottom - height / 2;
    const d = roundedRectSdf(u - cx, v - cy, barW / 2, height / 2, barW / 2);
    if (d <= 0) return [255, 255, 255, 1];
  }

  return [r, g, b, 1];
}

/** Render at `size` px, supersampling to keep the curves clean. */
function render(size) {
  const ss = size <= 48 ? 4 : 3;
  const rgba = Buffer.alloc(size * size * 4);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const u = (x + (sx + 0.5) / ss) / size;
          const v = (y + (sy + 0.5) / ss) / size;
          const [pr, pg, pb, pa] = sample(u, v);
          r += pr * pa; g += pg * pa; b += pb * pa; a += pa;
        }
      }
      const n = ss * ss;
      const i = (y * size + x) * 4;
      // Un-premultiply so edge pixels keep their colour as they fade out.
      rgba[i] = a > 0 ? Math.round(r / a) : 0;
      rgba[i + 1] = a > 0 ? Math.round(g / a) : 0;
      rgba[i + 2] = a > 0 ? Math.round(b / a) : 0;
      rgba[i + 3] = Math.round((a / n) * 255);
    }
  }
  return rgba;
}

/* ------------------------------------------------------------------- main --- */

const root = path.join(__dirname, '..');
const pub = path.join(root, 'public');

const icoSizes = [16, 24, 32, 48, 64, 128, 256];
const ico = buildIco(icoSizes.map((size) => ({ size, data: encodePng(render(size), size) })));
fs.writeFileSync(path.join(root, 'jusic.ico'), ico);
fs.writeFileSync(path.join(pub, 'favicon.ico'), ico);

for (const size of [192, 512]) {
  fs.writeFileSync(path.join(pub, `icon-${size}.png`), encodePng(render(size), size));
}

console.log('wrote jusic.ico (' + icoSizes.join(', ') + 'px), public/favicon.ico, public/icon-192.png, public/icon-512.png');
