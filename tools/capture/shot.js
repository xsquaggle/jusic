'use strict';
/**
 * Takes a picture of a page in the app window a measurement launch has open (DevTools on
 * 127.0.0.1:9333), at an exact size and scale whatever the real window is.
 *
 *   node_modules/electron/dist/electron.exe . --perf=<x>,<y> --unoccluded       (once; `win.ps1 -Op where` gives x y)
 *   node tools/capture/shot.js <out.png> [--path spike.html] [--size 1380x863] [--scale 1.25]
 *                              [--demo] [--eval "spike.show(6)"] [--wait 800] [--clip x,y,w,h]
 *
 * --demo puts the demo library (tools/demo) on window.__demo before the page starts, so the
 * picture shows the reference's tracks and covers, never a real library.
 */
const fs = require('fs');
const path = require('path');
const { connect, sleep } = require('../perf/cdp');

const args = process.argv.slice(2);
const arg = (name, fallback) => { const i = args.indexOf('--' + name); return i < 0 ? fallback : args[i + 1]; };
const ROOT = path.resolve(__dirname, '..', '..');

function demoScript() {
  const dir = path.join(ROOT, 'tools/demo');
  const tracks = JSON.parse(fs.readFileSync(path.join(dir, 'library.json'), 'utf8'));
  for (const t of tracks) t.cover = 'data:image/jpeg;base64,' + fs.readFileSync(path.join(dir, t.cover)).toString('base64');
  return `window.__demo = ${JSON.stringify({ tracks })};`;
}

(async () => {
  const out = path.resolve(args[0]);
  const page = await connect(9333, (t) => t.url.startsWith('http://127.0.0.1:'));
  const [width, height] = arg('size', '1380x863').split('x').map(Number);
  await page.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: Number(arg('scale', 1.25)), mobile: false });
  await page.send('Page.enable');
  const collect = `window.__errors = []; addEventListener('error', (e) => __errors.push(e.message)); addEventListener('unhandledrejection', (e) => __errors.push(String(e.reason && e.reason.message || e.reason)));`;
  const { identifier } = await page.send('Page.addScriptToEvaluateOnNewDocument', { source: collect + (args.includes('--demo') ? demoScript() : '') });
  const origin = await page.eval('location.origin');
  if (arg('path')) { await page.send('Page.navigate', { url: origin + '/' + arg('path') }); await sleep(600); }
  for (let i = 0; i < 60 && (await page.eval('document.readyState')) !== 'complete'; i++) await sleep(100);
  await page.eval('window.spike ? spike.ready.then(() => 1) : 1').catch((err) => console.log('not ready: ' + err.message));
  if (arg('eval')) console.log('eval: ' + JSON.stringify(await page.eval(arg('eval'))));
  await sleep(Number(arg('wait', 800)));
  const errors = await page.eval('window.__errors ? window.__errors.join(" | ") : ""').catch(() => '');
  if (errors) console.log('page errors: ' + errors);
  const clip = arg('clip') ? (([x, y, w, h]) => ({ x, y, width: w, height: h, scale: 1 }))(arg('clip').split(',').map(Number)) : undefined;
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const { data } = await page.send('Page.captureScreenshot', { format: 'png', ...(clip ? { clip } : {}) });
  fs.writeFileSync(out, Buffer.from(data, 'base64'));
  if (identifier) await page.send('Page.removeScriptToEvaluateOnNewDocument', { identifier });
  console.log('wrote ' + path.relative(ROOT, out));
  page.close();
})().catch((err) => { console.error(err.message); process.exit(1); });
