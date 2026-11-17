'use strict';
/**
 * Lays captures and references out on one labelled sheet and saves it as a PNG.
 *
 *   npx electron tools/capture/sheet.js tools/capture/sheets/round8-overview.json
 *
 * Spec: { out, width, title?, notes?: [line, ...], rows: [ [ cell, cell, ... ], ... ] }
 * notes: short lines under the title (the checklist of what must not be lost; 'ok: ', 'no: ' or 'part: ' marks each).
 * Cell: { label, src, crop?: [x, y, w, h] in source pixels, w?: width on the sheet, pixel?: true for hard pixel zoom }
 * Cells in a row share the sheet width equally unless they give w.
 */
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { pathToFileURL } = require('url');

app.commandLine.appendSwitch('force-device-scale-factor', '1');
app.disableHardwareAcceleration();     // offscreen, software: plain images, exact pixels

const specPath = path.resolve(process.argv.slice(2).find((a) => a.endsWith('.json')));
const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
const root = path.resolve(__dirname, '..', '..');
const GAP = 8;

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function html() {
  const rows = spec.rows.map((row) => {
    const free = spec.width - GAP * (row.length + 1) - row.reduce((sum, c) => sum + (c.w || 0), 0);
    const auto = row.filter((c) => !c.w).length;
    const cells = row.map((c) => {
      const w = c.w || Math.floor(free / auto);
      return `<figure style="width:${w}px"><figcaption>${esc(c.label || '')}</figcaption>`
        + `<div class="clip" data-w="${w}" data-crop="${c.crop ? c.crop.join(',') : ''}">`
        + `<img src="${pathToFileURL(path.resolve(root, c.src)).href}" class="${c.pixel ? 'pixel' : ''}"></div></figure>`;
    }).join('');
    return `<div class="row">${cells}</div>`;
  }).join('');
  return `<!DOCTYPE html><meta charset="utf-8"><style>
    html, body { margin: 0; background: #0c0c0f; overflow: hidden; }
    body { width: ${spec.width}px; font: 500 13px/1 'Segoe UI', system-ui, sans-serif; color: #c9c9d2; padding-bottom: ${GAP}px; }
    h1 { margin: 0; padding: 12px ${GAP}px 4px; font: 600 15px/1.2 'Segoe UI', system-ui, sans-serif; color: #fff; }
    .row { display: flex; gap: ${GAP}px; padding: 0 ${GAP}px; align-items: flex-start; }
    figure { margin: 0; flex: none; }
    figcaption { padding: 9px 2px 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .clip { position: relative; overflow: hidden; background: #000; }
    .clip img { position: absolute; display: block; max-width: none; }
    img.pixel { image-rendering: pixelated; }
    ul { margin: 2px 0 2px; padding: 4px ${GAP + 18}px 2px; columns: 2; font: 400 13px/1.45 'Segoe UI', system-ui, sans-serif; color: #c9c9d2; }
    li b { color: #fff; font-weight: 600; }
  </style>${spec.title ? `<h1>${esc(spec.title)}</h1>` : ''}${spec.notes ? `<ul>${spec.notes.map((n) => { const m = String(n).match(/^(w+): (.*)$/s); return `<li>${m ? `<b>${esc(m[1])}</b> ` + esc(m[2]) : esc(n)}</li>`; }).join('')}</ul>` : ''}${rows}
  <script>
    window.laid = Promise.all([...document.images].map((img) => img.decode().catch(() => {}))).then(() => {
      for (const clip of document.querySelectorAll('.clip')) {
        const img = clip.firstElementChild;
        const crop = clip.dataset.crop ? clip.dataset.crop.split(',').map(Number) : [0, 0, img.naturalWidth, img.naturalHeight];
        const s = Number(clip.dataset.w) / crop[2];
        clip.style.width = clip.dataset.w + 'px';
        clip.style.height = Math.round(crop[3] * s) + 'px';
        img.style.width = img.naturalWidth * s + 'px';
        img.style.left = -crop[0] * s + 'px';
        img.style.top = -crop[1] * s + 'px';
      }
      return document.body.scrollHeight;
    });
  </script>`;
}

app.whenReady().then(async () => {
  const tmp = path.join(os.tmpdir(), `jusic-sheet-${process.pid}.html`);
  fs.writeFileSync(tmp, html());
  const win = new BrowserWindow({ width: spec.width, height: 600, useContentSize: true, show: false, webPreferences: { offscreen: true } });
  await win.loadFile(tmp);
  const height = await win.webContents.executeJavaScript('window.laid', true);
  win.setContentSize(spec.width, height);
  await new Promise((r) => setTimeout(r, 400));
  const image = await win.webContents.capturePage();
  const out = path.resolve(root, spec.out);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, out.endsWith('.jpg') ? image.toJPEG(spec.quality || 92) : image.toPNG());
  fs.unlinkSync(tmp);
  const size = image.getSize();
  console.log(`${spec.out}: ${size.width}x${size.height}, ${(fs.statSync(out).size / 1024).toFixed(0)} KB`);
  app.quit();
});
