'use strict';
/**
 * Cuts the demo library's covers out of the reference images, so pictures of the app can show the
 * references' own tracks. Run once (the results are committed); it needs a measurement launch open:
 *
 *   node_modules/electron/dist/electron.exe . --perf=<x>,<y> --unoccluded
 *   node tools/demo/make-covers.js
 */
const fs = require('fs');
const path = require('path');
const { connect } = require('../perf/cdp');

const REFS = path.resolve(__dirname, '../../design/references/frosted');
// name, reference image, then the crop in that image's pixels and the size to save at
const CROPS = [
  ['silver-current', 'frosted-library.webp', 238, 668, 200, 200, 320],
  ['cold-winters', 'frosted-library-blue.webp', 238, 668, 200, 200, 320],
  ['slow-motion', 'frosted-now-playing.webp', 1197, 301, 72, 62, 144],
  ['rosewater', 'frosted-now-playing.webp', 1197, 401, 72, 62, 144],
  ['night-drive', 'frosted-now-playing.webp', 1197, 501, 72, 62, 144],
  ['half-awake', 'frosted-now-playing.webp', 1197, 601, 72, 62, 144],
  ['blue-hour', 'frosted-library.webp', 429, 561, 50, 36, 144],
];

(async () => {
  const page = await connect(9333, (t) => t.url.startsWith('http://127.0.0.1:'));
  for (const [name, ref, x, y, w, h, size] of CROPS) {
    const source = 'data:image/webp;base64,' + fs.readFileSync(path.join(REFS, ref)).toString('base64');
    const jpeg = await page.eval(`(async () => {
      const image = new Image(); image.src = ${JSON.stringify(source)}; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = ${size}; canvas.height = ${Math.round(size * h / w)};
      const ctx = canvas.getContext('2d'); ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(image, ${x}, ${y}, ${w}, ${h}, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/jpeg', 0.9);
    })()`);
    fs.writeFileSync(path.join(__dirname, name + '.jpg'), Buffer.from(jpeg.split(',')[1], 'base64'));
    console.log('wrote ' + name + '.jpg');
  }
  page.close();
})().catch((err) => { console.error(err.message); process.exit(1); });
