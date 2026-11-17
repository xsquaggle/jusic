'use strict';
/**
 * The widget's live layer for the stills: title, artist, times, the timeline and its bead, the volume, and the
 * button glyphs, drawn crisp on a transparent sheet at the reference's framing (1586 x 992), the way the live
 * widget draws them on top of the glass (never bent by it).
 *
 *   <jusic-redesign>/node_modules/.bin/electron tools/mercury3d/overlay.js out=<png> [lines=<json>]
 *     [title="Silver Current"] [artist="Artist 02"] [played=0.40] [volume=0.68] [tint=r,g,b (0..1)]
 *
 * lines: the timeline's and the volume line's paths in reference pixels ({timeline: [[x, y], ...], volume: ...}).
 * Positions follow the reference; the live widget will take them from the model.
 */
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

app.commandLine.appendSwitch('force-device-scale-factor', '1');
app.disableHardwareAcceleration();

const ARGS = Object.fromEntries(process.argv.slice(2).filter((a) => a.includes('=')).map((a) => {
  const i = a.indexOf('='); return [a.slice(0, i), a.slice(i + 1)];
}));
const root = path.resolve(__dirname, '..', '..');
const fontUrl = pathToFileURL(path.join(root, 'public', 'fonts', 'montserrat-latin-wght-normal.woff2')).href;
const lines = JSON.parse(fs.readFileSync(path.resolve(ARGS.lines || path.join(root, 'tools', 'mercury3d', 'lines.json')), 'utf8'));
const tint = (ARGS.tint || '1,0.45,0.4').split(',').map(Number);

const page = `<!DOCTYPE html><meta charset="utf-8"><body style="margin:0;background:transparent">
<canvas id="c" width="1586" height="992"></canvas>
<script>
const W = 1586, H = 992;
const L = ${JSON.stringify(lines)};
const T = ${JSON.stringify(tint)};
const OPT = ${JSON.stringify({ title: ARGS.title || 'Silver Current', artist: ARGS.artist || 'Artist 02',
    played: Number(ARGS.played || 0.4065), volume: Number(ARGS.volume || 0.68) })};
const coral = (a) => 'rgba(' + Math.round(255 * T[0]) + ',' + Math.round(255 * (0.35 + 0.65 * T[1])) + ','
  + Math.round(255 * (0.3 + 0.7 * T[2])) + ',' + a + ')';
async function render() {
  const f = new FontFace('Montserrat', 'url(${fontUrl})', { weight: '100 900' });
  await f.load(); document.fonts.add(f);
  const c = document.getElementById('c').getContext('2d');
  c.clearRect(0, 0, W, H);
  // fit a text's size so its ink spans a given width
  function fitText(txt, weight, x, baseline, width, colour, spacing) {
    let size = 40;
    for (let k = 0; k < 4; k++) {
      c.font = weight + ' ' + size + 'px Montserrat';
      c.letterSpacing = (spacing || 0) * size + 'px';
      const m = c.measureText(txt);
      size *= width / (m.actualBoundingBoxRight + m.actualBoundingBoxLeft);
    }
    c.font = weight + ' ' + size + 'px Montserrat';
    c.letterSpacing = (spacing || 0) * size + 'px';
    c.fillStyle = colour; c.fillText(txt, x, baseline);
    c.letterSpacing = '0px';
  }
  fitText(OPT.title, 500, 505, 468, 309, 'rgba(255,252,250,0.97)');
  fitText(OPT.artist, 300, 507, 509, 127, 'rgba(236,226,224,0.66)');
  fitText('1:28', 400, 253, 638, 56, 'rgba(255,250,248,0.92)');
  fitText('\\u22122:18', 400, 1288, 602, 69, 'rgba(255,250,248,0.92)');
  fitText('VOLUME', 500, 1248, 308, 70, 'rgba(245,238,236,0.8)', 0.12);
  // a line along a path: the played part a hot core with coral sides, the rest thin and dim
  function along(pts, t) {
    const n = pts.length - 1, k = Math.min(n - 1, Math.floor(t * n)), f = t * n - k;
    return [pts[k][0] + (pts[k + 1][0] - pts[k][0]) * f, pts[k][1] + (pts[k + 1][1] - pts[k][1]) * f];
  }
  function stroke(pts, t0, t1, width, style, blur, glow) {
    c.save(); c.lineCap = 'round'; c.lineJoin = 'round';
    c.strokeStyle = style; c.lineWidth = width;
    if (blur) { c.shadowColor = glow; c.shadowBlur = blur; }
    c.beginPath();
    const steps = 160;
    for (let i = 0; i <= steps; i++) {
      const p = along(pts, t0 + (t1 - t0) * i / steps);
      if (i === 0) c.moveTo(p[0], p[1]); else c.lineTo(p[0], p[1]);
    }
    c.stroke(); c.restore();
  }
  function track(pts, t) {
    stroke(pts, t, 1, 3.0, 'rgba(205,198,198,0.5)');                   // unplayed: thin, dim grey
    stroke(pts, 0, t, 13.0, 'rgba(40,14,16,0.35)', 10, 'rgba(20,6,8,0.6)');   // a soft dark bed: readable on any glass
    stroke(pts, 0, t, 9.0, coral(1), 18, coral(1));                     // played: coral sides ...
    stroke(pts, 0, t, 4.0, 'rgba(255,250,246,1)');                       // ... and a hot core
  }
  function bead(p, r) {
    const g = c.createRadialGradient(p[0], p[1], r * 0.6, p[0], p[1], r * 3.2);
    g.addColorStop(0, coral(0.55)); g.addColorStop(1, coral(0));
    c.fillStyle = g; c.beginPath(); c.arc(p[0], p[1], r * 3.2, 0, 7); c.fill();
    c.fillStyle = 'rgba(255,250,246,1)'; c.beginPath(); c.arc(p[0], p[1], r, 0, 7); c.fill();
  }
  track(L.timeline, OPT.played); bead(along(L.timeline, OPT.played), 9);
  track(L.volume, OPT.volume); bead(along(L.volume, OPT.volume), 7.5);
  // glyphs: previous, pause, next, speaker
  c.fillStyle = 'rgba(255,255,255,0.97)';
  function rr(x, y, w, h, r) { c.beginPath(); c.roundRect(x, y, w, h, r); c.fill(); }
  function tri(ax, ay, bx, by, cx, cy) { c.beginPath(); c.moveTo(ax, ay); c.lineTo(bx, by); c.lineTo(cx, cy); c.closePath(); c.fill(); }
  rr(1062, 452, 5, 32, 1.5); tri(1095, 452, 1095, 484, 1069, 468);                    // previous
  rr(1215, 435, 13, 51, 2.5); rr(1241, 435, 13, 51, 2.5);                             // pause
  rr(1403, 452, 5, 32, 1.5); tri(1375, 452, 1375, 484, 1401, 468);                    // next
  tri(1186, 312, 1186, 326, 1186, 326); rr(1185, 312, 8, 14, 1);                      // speaker
  tri(1192, 312, 1204, 303, 1204, 335); tri(1192, 312, 1204, 335, 1192, 326);
  c.strokeStyle = 'rgba(255,255,255,0.95)'; c.lineWidth = 2.6; c.lineCap = 'round';
  for (const [r, a] of [[8, 0.75], [13, 0.8], [18, 0.85]]) { c.beginPath(); c.arc(1205, 319, r, -a, a); c.stroke(); }
  return document.getElementById('c').toDataURL('image/png');
}
</script>`;

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 1586, height: 992, webPreferences: { offscreen: true } });
  // a file page, so it may load the font from disk (a data: page may not)
  const tmp = path.join(require('os').tmpdir(), 'mercury3d-overlay.html');
  fs.writeFileSync(tmp, page);
  try {
    await win.loadFile(tmp);
    const url = await win.webContents.executeJavaScript('render().catch((e) => "ERR " + e)');
    if (url.startsWith('ERR')) throw new Error(url);
    fs.writeFileSync(path.resolve(ARGS.out), Buffer.from(url.split(',')[1], 'base64'));
    console.log('overlay saved', ARGS.out);
  } catch (e) {
    console.error('overlay failed:', e && e.message ? e.message : e);
    process.exitCode = 1;
  }
  app.quit();
});
