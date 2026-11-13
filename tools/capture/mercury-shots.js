'use strict';
/**
 * Photographs the Mercury prototype on the real GPU, through Electron.
 *
 *   node prototypes/serve.js                         (in another terminal)
 *   npx electron tools/capture/mercury-shots.js out=design/captures/raw/round8 [only=dark,light] [dsf=1.25]
 *
 * The window opens on the second monitor when there is one, so it stays out of the way of whatever
 * is on the main screen, and is drawn at the main monitor's 125% scale (dsf) wherever it is.
 *
 * Every shot runs the page in ?capture=1 mode: the clock is stopped, the test
 * audio is scripted, and the liquid is stepped a fixed number of frames, so
 * two runs of the same code give the same picture.
 */
const { app, BrowserWindow, screen } = require('electron');
const fs = require('fs');
const path = require('path');

const args = Object.fromEntries(process.argv.slice(2).filter((a) => a.includes('=')).map((a) => a.split(/=(.*)/s).slice(0, 2)));
const OUT = path.resolve(args.out || 'design/captures/raw/latest');
const ONLY = args.only ? args.only.split(',') : null;
const BASE = args.base || 'http://127.0.0.1:5190/prototypes/mercury/';
app.commandLine.appendSwitch('force-device-scale-factor', args.dsf || '1.25');

// Where the reference images have their cursor: on the lower edge, right of the middle.
const HOVER = `(() => { const m = window.__mercury; m.pointer('move', 300, 300); m.step(6); m.pointer('move', 400, 262); m.step(6);
  m.pointer('move', 470, 246); m.step(50); })()`;

/** name, query, content size in CSS px, frames to run before the photo, extra script. */
const SHOTS = [
  { name: 'dark', q: 'bg=studio&play&scale=1', w: 960, h: 480, warm: 720 },
  { name: 'black', q: 'bg=black&play&scale=1', w: 960, h: 480, warm: 720 },
  { name: 'light', q: 'bg=wallpaper&play&scale=1', w: 960, h: 480, warm: 720 },
  { name: 'window', q: 'bg=window&play&scale=1', w: 960, h: 480, warm: 720 },
  { name: 'dark-hover', q: 'bg=studio&play&scale=1', w: 960, h: 480, warm: 720, after: HOVER },
  { name: 'light-hover', q: 'bg=wallpaper&play&scale=1', w: 960, h: 480, warm: 720, after: HOVER },
  { name: 'dark-paused', q: 'bg=studio&scale=1', w: 960, h: 480, warm: 360 },
  { name: 'dark-small', q: 'bg=studio&play&scale=0.6', w: 600, h: 300, warm: 720 },
  { name: 'light-small', q: 'bg=wallpaper&play&scale=0.6', w: 600, h: 300, warm: 720 },
  { name: 'dark-2x', q: 'bg=studio&play&scale=2', w: 1800, h: 880, warm: 720 },
  { name: 'light-2x', q: 'bg=wallpaper&play&scale=2', w: 1800, h: 880, warm: 720 },
  { name: 'dark-t1', q: 'bg=studio&play&scale=1&track=1', w: 960, h: 480, warm: 720 },
  { name: 'dark-t3', q: 'bg=studio&play&scale=1&track=3', w: 960, h: 480, warm: 720 },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let win = null;
const messages = [];

async function shoot(shot) {
  if (!win) {
    win = new BrowserWindow({
      width: shot.w, height: shot.h, useContentSize: true, show: false, frame: false,
      backgroundColor: '#000000',
      webPreferences: { backgroundThrottling: false, contextIsolation: true, sandbox: true },
    });
    win.webContents.on('console-message', (event) => {
      if (event.level === 'error' || (event.level === 'warning' && !event.message.includes('Electron Security Warning'))) messages.push(event.message);
    });
  }
  const wc = win.webContents;
  const run = (js) => wc.executeJavaScript(js, true);
  messages.length = 0;
  win.setContentSize(shot.w, shot.h);
  const primary = screen.getPrimaryDisplay();
  const display = screen.getAllDisplays().find((d) => d.id !== primary.id) || primary;
  win.setPosition(display.workArea.x + 20, display.workArea.y + 20);
  const url = `${BASE}?capture=1&${shot.q}`;
  for (let attempt = 0; ; attempt++) {
    try { await win.loadURL(url); break; } catch (err) { if (attempt >= 3) throw err; await sleep(400); }
  }
  win.showInactive();           // a real, composited window: this is what the GPU actually puts on screen
  for (let i = 0; i < 200; i++) {
    if (await run('Boolean(window.__mercury && window.__mercury.ready)')) break;
    await sleep(50);
  }
  // Let the liquid run. In chunks, with a finish between them, so commands cannot pile up.
  const t0 = Date.now();
  for (let done = 0; done < shot.warm; done += 30) {
    await run('window.__mercury.step(30, 1 / 60, true); window.__mercury.mercury.gl.finish(); 0');
  }
  const stepMs = (Date.now() - t0) / shot.warm;
  if (shot.after) await run(shot.after);
  await run('window.__mercury.step(2, 1 / 60, true); window.__mercury.mercury.gl.finish(); 0');
  await sleep(250);             // two or three compositor frames
  const image = await wc.capturePage();
  const file = path.join(OUT, shot.name + '.png');
  fs.writeFileSync(file, image.toPNG());
  const info = await run(`(() => { const c = document.getElementById('gl'); const gl = window.__mercury.mercury.gl;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return { canvas: [c.width, c.height], dpr: devicePixelRatio, renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : '?' }; })()`);
  const size = image.getSize();
  console.log(`${shot.name}: ${size.width}x${size.height}, canvas ${info.canvas.join('x')}, dpr ${info.dpr}, ${stepMs.toFixed(2)} ms per painted frame`
    + (messages.length ? `\n  console: ${messages.slice(0, 4).join(' | ')}` : ''));
  return info;
}

app.whenReady().then(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const d = screen.getPrimaryDisplay();
  console.log(`display ${d.size.width}x${d.size.height} at scale ${d.scaleFactor}, ${d.displayFrequency} Hz`);
  let info = null;
  for (const shot of SHOTS) {
    if (ONLY && !ONLY.includes(shot.name)) continue;
    try { info = await shoot(shot); } catch (err) { console.log(`${shot.name}: FAILED ${err.message}`); }
  }
  if (info) console.log('renderer: ' + info.renderer);
  app.quit();
});
