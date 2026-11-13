'use strict';
/**
 * Throwaway shell for the Mercury prototype. It puts the page in the kind of window the real
 * widget will live in (transparent, frameless, always on top, never taking focus) so the things
 * only a real desktop can show get tested: transparency, click-through, GPU load, refraction.
 * Nothing here is the real app shell; that is phase 2 of the plan.
 *
 *   npx electron tools/widget-proto/main.js                 run it on the desktop (tray icon to quit)
 *   npx electron tools/widget-proto/main.js size=0.8        at 80% size
 *   npx electron tools/widget-proto/main.js shots=<folder>  photograph it over test backdrops, then quit
 *   display=primary|other                                   which monitor (shots default to the other one, to stay
 *                                                           out of the way of whatever is on the main screen)
 */
const { app, BrowserWindow, Tray, Menu, screen, ipcMain, desktopCapturer } = require('electron');
const fs = require('fs');
const path = require('path');
const http = require('http');

const REPO = path.resolve(__dirname, '..', '..');
const args = Object.fromEntries(process.argv.slice(2).filter((a) => a.includes('=')).map((a) => a.split(/=(.*)/s).slice(0, 2)));
const SIZE = Number(args.size) || 1;
const SHOTS = args.shots ? path.resolve(args.shots) : null;
const PORT = 5190;
const STAGE = { w: 860, h: 400 };

// Keep this prototype's browser profile inside the repo's ignored data folder, not in %APPDATA%.
app.setPath('userData', path.join(REPO, 'data', 'widget-proto'));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Use the prototype server if one is already running, otherwise start it here. */
async function ensureServer() {
  const up = await new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port: PORT, path: '/prototypes/mercury/', timeout: 800 }, (res) => { res.resume(); resolve(true); });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
  if (!up) await require(path.join(REPO, 'prototypes', 'serve.js')).start(PORT);
}

let widget = null;
let tray = null;

/** The monitor to work on. */
function pickDisplay(fallback) {
  const primary = screen.getPrimaryDisplay();
  const other = screen.getAllDisplays().find((d) => d.id !== primary.id);
  const want = args.display || fallback;
  return want === 'other' && other ? other : primary;
}

function createWidget({ query = 'play', x, y } = {}) {
  const w = Math.round(STAGE.w * SIZE), h = Math.round(STAGE.h * SIZE);
  const area = pickDisplay('primary').workArea;
  widget = new BrowserWindow({
    width: w, height: h, useContentSize: true,
    x: x ?? area.x + area.width - w - 40, y: y ?? area.y + area.height - h - 40,
    transparent: true, frame: false, hasShadow: false, roundedCorners: false, thickFrame: false,
    resizable: false, maximizable: false, minimizable: false, fullscreenable: false,
    alwaysOnTop: true, skipTaskbar: true, focusable: false, show: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, sandbox: true, nodeIntegration: false, backgroundThrottling: false,
    },
  });
  widget.setAlwaysOnTop(true, 'floating');
  widget.webContents.on('console-message', (event) => {
    if (event.level === 'error') console.log('page error: ' + event.message);
  });
  return widget.loadURL(`http://127.0.0.1:${PORT}/prototypes/mercury/?widget=1&scale=${SIZE}&${query}`);
}

/* ------------------------------------------------------------ window controls --- */

ipcMain.on('widget:ignore', (event, on) => {
  if (widget && !widget.isDestroyed()) widget.setIgnoreMouseEvents(Boolean(on), { forward: true });
});
let drag = null;
ipcMain.on('widget:drag', (event, phase) => {
  if (!widget || widget.isDestroyed()) return;
  const cursor = screen.getCursorScreenPoint();
  if (phase === 'start') {
    const [wx, wy] = widget.getPosition();
    drag = { cx: cursor.x, cy: cursor.y, wx, wy };
  } else if (phase === 'move' && drag) {
    widget.setPosition(drag.wx + cursor.x - drag.cx, drag.wy + cursor.y - drag.cy);
  } else if (phase === 'end') {
    drag = null;
  }
});
ipcMain.on('widget:close', () => app.quit());

/* ------------------------------------------------------------------- shots --- */

/** A piece of the screen as it is really composited, in physical pixels. rect is in DIPs. */
async function grabScreen(rect, d) {
  const sf = d.scaleFactor;
  const sources = await desktopCapturer.getSources({
    types: ['screen'], thumbnailSize: { width: Math.round(d.size.width * sf), height: Math.round(d.size.height * sf) },
  });
  const source = sources.find((s) => String(s.display_id) === String(d.id)) || sources[0];
  return source.thumbnail.crop({
    x: Math.round((rect.x - d.bounds.x) * sf), y: Math.round((rect.y - d.bounds.y) * sf),
    width: Math.round(rect.width * sf), height: Math.round(rect.height * sf),
  });
}

/**
 * Photographs the widget over windows of our own, so nothing of the owner's desktop is recorded:
 * the backdrop window covers the whole area that is captured.
 */
async function runShots() {
  fs.mkdirSync(SHOTS, { recursive: true });
  const display = pickDisplay('other');
  console.log(`display ${display.size.width}x${display.size.height} at scale ${display.scaleFactor}${display.id === screen.getPrimaryDisplay().id ? ' (primary)' : ' (second monitor)'}`);
  const area = {
    x: display.workArea.x + 60, y: display.workArea.y + 60,
    width: Math.round(STAGE.w * SIZE) + 100, height: Math.round(STAGE.h * SIZE) + 80,
  };
  const backdrop = new BrowserWindow({
    ...area, frame: false, resizable: false, skipTaskbar: true, focusable: false, show: false, alwaysOnTop: true,
    backgroundColor: '#000000', webPreferences: { contextIsolation: true, sandbox: true },
  });
  const setBackdrop = (mode) => backdrop.loadFile(path.join(__dirname, 'backdrop.html'), { query: { mode } });
  await setBackdrop('dark');
  backdrop.setAlwaysOnTop(true, 'floating');
  backdrop.showInactive();
  backdrop.moveTop();

  await createWidget({ query: 'capture=1&play', x: area.x + 50, y: area.y + 40 });
  widget.webContents.setAudioMuted(true);
  widget.showInactive();
  widget.moveTop();
  const run = (js) => widget.webContents.executeJavaScript(js, true);
  for (let i = 0; i < 200 && !(await run('Boolean(window.__mercury && window.__mercury.ready)')); i++) await sleep(50);
  for (let done = 0; done < 720; done += 30) await run('window.__mercury.step(30, 1 / 60, true); window.__mercury.mercury.gl.finish(); 0');

  for (const mode of ['dark', 'light', 'busy']) {
    await setBackdrop(mode);
    backdrop.moveTop();
    widget.moveTop();
    await run('window.__mercury.step(2, 1 / 60, true); 0');
    await sleep(600);
    const image = await grabScreen(area, display);
    fs.writeFileSync(path.join(SHOTS, `window-${mode}.png`), image.toPNG());
    const size = image.getSize();
    console.log(`window-${mode}: ${size.width}x${size.height}`);
  }
  app.quit();
}

/* -------------------------------------------------------------------- boot --- */

app.whenReady().then(async () => {
  await ensureServer();
  if (SHOTS) { await runShots(); return; }

  await createWidget({ x: args.x && Number(args.x), y: args.y && Number(args.y) });
  widget.showInactive();
  tray = new Tray(path.join(REPO, 'jusic.ico'));
  tray.setToolTip('Mercury prototype');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Mercury prototype', enabled: false },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ]));
});

app.on('window-all-closed', () => app.quit());
