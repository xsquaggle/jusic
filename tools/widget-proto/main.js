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
 *   npx electron tools/widget-proto/main.js test=passthrough   check that the window lets the mouse through outside the
 *                                                           shape and takes it inside, without touching the real mouse
 *   display=primary|other                                   which monitor (shots and tests default to the other one, to
 *                                                           stay out of the way of whatever is on the main screen)
 */
const { app, BrowserWindow, Tray, Menu, screen, ipcMain, desktopCapturer } = require('electron');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');

const REPO = path.resolve(__dirname, '..', '..');
const args = Object.fromEntries(process.argv.slice(2).filter((a) => a.includes('=')).map((a) => a.split(/=(.*)/s).slice(0, 2)));
const SIZE = Number(args.size) || 1;
const SHOTS = args.shots ? path.resolve(args.shots) : null;
const TEST = args.test || null;
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

const POSITION_FILE = path.join(REPO, 'data', 'widget-proto', 'position.json');

/** Where it was left last time, if that is still on a screen. */
function savedPosition(w, h) {
  try {
    const p = JSON.parse(fs.readFileSync(POSITION_FILE, 'utf8'));
    const on = screen.getAllDisplays().some((d) => p.x + w > d.workArea.x + 40 && p.x < d.workArea.x + d.workArea.width - 40
      && p.y + h > d.workArea.y + 40 && p.y < d.workArea.y + d.workArea.height - 40);
    return on ? p : null;
  } catch { return null; }
}

function createWidget({ query = 'play', x, y } = {}) {
  const w = Math.round(STAGE.w * SIZE), h = Math.round(STAGE.h * SIZE);
  const area = pickDisplay('primary').workArea;
  if (x === undefined && y === undefined && !args.display) ({ x, y } = savedPosition(w, h) || {});
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

let ignoring = null;      // what the page last asked for
ipcMain.on('widget:ignore', (event, on) => {
  ignoring = Boolean(on);
  if (widget && !widget.isDestroyed()) widget.setIgnoreMouseEvents(ignoring, { forward: true });
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
    const [px, py] = widget.getPosition();
    try { fs.writeFileSync(POSITION_FILE, JSON.stringify({ x: px, y: py })); } catch { /* remembering is a nicety */ }
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

/* ------------------------------------------------------------ pass-through --- */

const WINDOW_AT = ["Add-Type @'","using System; using System.Runtime.InteropServices;","public class W {","  [StructLayout(LayoutKind.Sequential)] public struct P { public int x, y; }","  [DllImport(\"user32.dll\")] public static extern IntPtr WindowFromPhysicalPoint(P p);","  [DllImport(\"user32.dll\")] public static extern IntPtr GetAncestor(IntPtr h, uint f);","}","'@"];

/** The top-level window the mouse would reach at a point (physical screen pixels), as Windows itself answers it. */
function windowAt(point) {
  const script = WINDOW_AT.concat([
    `$p = New-Object W+P; $p.x = ${Math.round(point.x)}; $p.y = ${Math.round(point.y)}`,
    '[W]::GetAncestor([W]::WindowFromPhysicalPoint($p), 2).ToInt64()',
  ]).join('\n');
  return BigInt(execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { encoding: 'utf8' }).trim());
}
const handleOf = (win) => win.getNativeWindowHandle().readBigUInt64LE(0);

/**
 * Moves a pretend pointer over the page (the real mouse is not touched) and asks Windows which
 * window a real click would reach at that spot. Proves the chain: shape test in the page ->
 * message to the window -> the window letting the mouse through. It does not prove that real
 * mouse moves are still reported while the window is letting them through; only a real mouse can.
 */
async function runPassThroughTest() {
  const display = pickDisplay('other');
  const area = {
    x: display.workArea.x + 60, y: display.workArea.y + 60,
    width: Math.round(STAGE.w * SIZE) + 100, height: Math.round(STAGE.h * SIZE) + 80,
  };
  const backdrop = new BrowserWindow({
    ...area, frame: false, resizable: false, skipTaskbar: true, focusable: false, show: false, alwaysOnTop: true,
    backgroundColor: '#000000', webPreferences: { contextIsolation: true, sandbox: true },
  });
  await backdrop.loadFile(path.join(__dirname, 'backdrop.html'), { query: { mode: 'light' } });
  backdrop.setAlwaysOnTop(true, 'floating');
  backdrop.showInactive();
  backdrop.moveTop();
  const origin = { x: area.x + 50, y: area.y + 40 };
  await createWidget({ query: '', ...origin });
  widget.webContents.setAudioMuted(true);
  widget.showInactive();
  widget.moveTop();
  const run = (js) => widget.webContents.executeJavaScript(js, true);
  for (let i = 0; i < 200 && !(await run('Boolean(window.__mercury && window.__mercury.ready)')); i++) await sleep(50);
  await sleep(1500);      // let it finish forming

  const names = new Map([[handleOf(widget), 'the widget'], [handleOf(backdrop), 'the window behind']]);
  // label, where the pretend pointer goes (stage units), where Windows is asked, what should be there
  const cases = [
    ['no pointer yet, asked at the play button', null, [642, 198], 'the window behind'],
    ['pointer on the play button', [642, 198], [642, 198], 'the widget'],
    ['pointer on the body, by the title', [400, 235], [400, 235], 'the widget'],
    ['pointer on the cover tile', [172, 152], [172, 152], 'the widget'],
    ['pointer in the notch above the waist', [430, 120], [430, 120], 'the window behind'],
    ['pointer in the corner of the window', [20, 20], [20, 20], 'the window behind'],
    ['pointer just below the lower edge', [430, 330], [430, 330], 'the window behind'],
    ['pointer back on the timeline', [430, 268], [430, 268], 'the widget'],
  ];
  let failed = 0;
  for (const [label, pointer, probe, want] of cases) {
    if (pointer) await run(`window.__mercury.pointer('move', ${pointer[0]}, ${pointer[1]}); 0`);
    await sleep(250);
    const at = screen.dipToScreenPoint({ x: Math.round(origin.x + probe[0] * SIZE), y: Math.round(origin.y + probe[1] * SIZE) });
    const got = names.get(windowAt(at)) || 'something else';
    if (got !== want) failed++;
    console.log(`${got === want ? 'ok  ' : 'FAIL'} ${label}: a click would reach ${got}${got === want ? '' : ' (expected ' + want + ')'}; the page asked the window to ${ignoring ? 'let the mouse through' : 'take the mouse'}`);
  }
  console.log(`focused: widget ${widget.isFocused()}, window behind ${backdrop.isFocused()}`);
  console.log(failed ? `${failed} of ${cases.length} failed` : `all ${cases.length} passed`);
  app.quit();
}

/* -------------------------------------------------------------------- boot --- */

app.whenReady().then(async () => {
  await ensureServer();
  if (SHOTS) { await runShots(); return; }
  if (TEST === 'passthrough') { await runPassThroughTest(); return; }

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
