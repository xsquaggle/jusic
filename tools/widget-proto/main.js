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
 *   npx electron tools/widget-proto/main.js test=gpu           GPU load idle, playing and hidden (see gpu-test.js)
 *   refract=off                                             Refraction is the widget's look and is on unless this is given: the
 *                                                           body bends what is really behind the window. The window is left
 *                                                           out of screen captures and the page is given a capture of the
 *                                                           monitor it is on. Off, the body is the nearly opaque dark glass
 *                                                           that is the base, and the widget shows in screenshots again. The
 *                                                           tray menu switches it while it runs.
 *                                                           rfps=N capture rate (30), rmax=N the capture's longest side.
 *   glass=0.88                                              an old alternative: a body with a floor on its opacity, nothing
 *                                                           captured (implies refract=off)
 *   source=system                                           the "any media" proof: the widget shows and controls whatever
 *                                                           Windows says is playing on this PC (Spotify, a browser tab...)
 *                                                           in place of the test tracks. only=<text> follows the source
 *                                                           whose app id contains it. See media-helper.ps1.
 *   test=media                                              proves that chain end to end against a made-up source of its
 *                                                           own (media-test.html), so nothing of the owner's is read
 *   test=listen                                             proves that the liquid hears what the PC plays: no window is
 *                                                           shown; a quiet pulsed tone is played for a few seconds
 *   listen=off                                              with source=system: do not listen, move to a made-up beat
 *   display=primary|other                                   which monitor (shots and tests default to the other one, to
 *                                                           stay out of the way of whatever is on the main screen)
 */
const { app, BrowserWindow, Tray, Menu, screen, ipcMain, desktopCapturer } = require('electron');
const { execFileSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');

const REPO = path.resolve(__dirname, '..', '..');
const args = Object.fromEntries(process.argv.slice(2).filter((a) => a.includes('=')).map((a) => a.split(/=(.*)/s).slice(0, 2)));
const SIZE = Number(args.size) || 1;
const SHOTS = args.shots ? path.resolve(args.shots) : null;
const TEST = args.test || null;
// Refraction is the look (the owner's decision, 13 November 2026): on unless refract=off, or glass= is being tried.
const REFRACT = args.refract === 'off' || (args.glass && !args.refract) ? null : (args.refract || 'live');
// Options that are simply handed on to the page.
const SYSTEM = args.source === 'system' || TEST === 'media' || TEST === 'listen';
const SYSTEM_LISTEN = args.listen ? `&listen=${encodeURIComponent(args.listen)}` : '';
const PAGE_OPTIONS = SYSTEM_LISTEN + (REFRACT ? `&refract=${encodeURIComponent(REFRACT)}` : '') + (SYSTEM ? '&source=system' : '')
  + ['rfps', 'rmax', 'glass'].filter((k) => args[k]).map((k) => `&${k}=${encodeURIComponent(args[k])}`).join('');
// Draw at a given display scale wherever the window is (the main monitor is 125%).
if (args.dsf) app.commandLine.appendSwitch('force-device-scale-factor', args.dsf);
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

/**
 * Keep a window above everything else. Not Electron's default level ('floating'): on Windows that
 * one also parks the window just behind the taskbar, and while a full-screen game has the
 * foreground Windows takes the taskbar out of the always-on-top band, which drags the window out
 * with it and leaves it behind ordinary windows (seen 13 November 2026: test windows on the second
 * monitor vanished behind the app that was open there while a game ran on the main one).
 */
function onTop(win) { win.setAlwaysOnTop(true, 'screen-saver'); }

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
      // Background throttling stays on (the default): when the window is hidden the page is
      // told so and stops drawing. The capture tools turn it off; the widget must not.
      contextIsolation: true, sandbox: true, nodeIntegration: false,
      // The page analyses the PC's sound in "any media" without anyone having clicked it.
      autoplayPolicy: 'no-user-gesture-required',
    },
  });
  onTop(widget);
  if (REFRACT) {
    // Left out of every screen capture, its own included: otherwise it would bend a picture of itself.
    widget.setContentProtection(true);
    widget.on('move', sendPlacement);
  }
  refracting = Boolean(REFRACT);
  widget.webContents.on('console-message', (event) => {
    if (event.level === 'error') console.log('page error: ' + event.message);
  });
  return widget.loadURL(`http://127.0.0.1:${PORT}/prototypes/mercury/?widget=1&scale=${SIZE}&${query}${PAGE_OPTIONS}`);
}

/* -------------------------------------------------------------- refraction --- */

let screenSources = null;      // display id -> capture source id
let refracting = false;        // whether the window is refracting now (the tray menu switches it)

/**
 * The switch. With refraction on the widget is in no screenshot, recording or screen share, so
 * the owner needs a way to turn it off. Off: the page stops the capture and lets the refraction
 * ease out to the opaque body, and only then is the window let back into captures, so it never
 * bends a picture of itself. On: the other way round.
 */
async function setRefracting(on) {
  if (!widget || widget.isDestroyed() || on === refracting) return;
  refracting = on;
  if (on) {
    widget.setContentProtection(true);
    await sleep(300);
    widget.webContents.send('widget:refract', true);
  } else {
    widget.webContents.send('widget:refract', false);
    await sleep(1200);
    if (!refracting && !widget.isDestroyed()) widget.setContentProtection(false);
  }
}

/** Which capture shows what is behind the widget, and where the widget sits on that screen. */
async function placement() {
  if (!screenSources) {
    const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 0, height: 0 } });
    screenSources = new Map(sources.map((s) => [String(s.display_id), s.id]));
  }
  const bounds = widget.getContentBounds();
  const display = screen.getDisplayMatching(bounds);
  return { window: bounds, display: display.bounds, sourceId: screenSources.get(String(display.id)) || [...screenSources.values()][0] };
}
ipcMain.handle('widget:backdrop', () => placement());
function sendPlacement() {
  placement().then((p) => { if (widget && !widget.isDestroyed()) widget.webContents.send('widget:placement', p); });
}

/* --------------------------------------------------------------- any media --- */

// The proof of REDESIGN_PLAN.md section 6b. A helper (media-helper.ps1) reads Windows' own list
// of playing media and prints each change as a line of JSON; it is passed on to the page, with
// the artwork as a data: URL. The page's commands go back down the helper's stdin.
// What the owner listens to is private: nothing here prints or stores a title, and the artwork
// file lives in data/widget-proto/, which git ignores.
let helper = null;
let mediaState = null;       // the last thing the helper said, for the tests

function startMediaHelper(only = args.only || '') {
  stopMediaHelper();
  const dir = path.join(REPO, 'data', 'widget-proto');
  fs.mkdirSync(dir, { recursive: true });
  const child = helper = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File',
    path.join(__dirname, 'media-helper.ps1'), '-ThumbDir', dir, ...(only ? ['-Only', only] : [])], { windowsHide: true });
  let rest = '';
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    const lines = (rest + chunk).split(/\r?\n/);
    rest = lines.pop();
    for (const line of lines) {
      if (args.debug) console.log('helper line, ' + line.length + ' characters');
      let state;
      try { state = JSON.parse(line); } catch { continue; }
      if (state.thumb) {
        try {
          const bytes = fs.readFileSync(state.thumb);
          state.art = `data:${bytes[0] === 0x89 ? 'image/png' : 'image/jpeg'};base64,${bytes.toString('base64')}`;
        } catch { state.art = null; }
      }
      delete state.thumb;
      mediaState = state;
      if (widget && !widget.isDestroyed()) widget.webContents.send('widget:media', state);
    }
  });
  // Its errors may quote a title, so they are printed only when asked for (debug=1, with a source of our own).
  child.stderr.on('data', (chunk) => { if (args.debug) console.log('helper: ' + chunk); });
  child.on('exit', () => { if (helper === child) helper = null; });
}
function stopMediaHelper() {
  if (helper) { try { helper.stdin.end(); } catch { /* already gone */ } helper = null; }
}
ipcMain.on('widget:media-command', (event, command, value) => {
  if (!helper || !/^(toggle|play|pause|next|prev|seek)$/.test(command)) return;
  helper.stdin.write(command === 'seek' ? `seek ${Number(value) || 0}\n` : command + '\n');
});
app.on('before-quit', stopMediaHelper);

/**
 * The whole chain against a source of our own: a hidden window that announces three made-up
 * tracks to Windows as a browser tab does (media-test.html, near-silent). The widget has to show
 * them and its buttons have to reach that window. Ends with a photograph over the test backdrop.
 */
async function runMediaTest() {
  const display = pickDisplay('other');
  const area = {
    x: display.workArea.x + 60, y: display.workArea.y + 60,
    width: Math.round(STAGE.w * SIZE) + 100, height: Math.round(STAGE.h * SIZE) + 80,
  };
  const backdrop = new BrowserWindow({
    ...area, frame: false, resizable: false, skipTaskbar: true, focusable: false, show: false, alwaysOnTop: true,
    backgroundColor: '#000000', webPreferences: { contextIsolation: true, sandbox: true },
  });
  await backdrop.loadFile(path.join(__dirname, 'backdrop.html'), { query: { mode: 'dark' } });
  onTop(backdrop);
  backdrop.showInactive();
  backdrop.moveTop();

  const source = new BrowserWindow({
    show: false, focusable: false, skipTaskbar: true, width: 300, height: 200,
    webPreferences: { contextIsolation: true, sandbox: true, backgroundThrottling: false, autoplayPolicy: 'no-user-gesture-required' },
  });
  // Over http, like the covers it names as its artwork: Chromium does not fetch artwork for a page opened from a file.
  const loadSource = (limited) => source.loadURL(`http://127.0.0.1:${PORT}/tools/widget-proto/media-test.html${limited ? '?limited=1' : ''}`);
  const src = (js) => source.webContents.executeJavaScript(js, true);
  // Which of Windows' sources is ours: the one that was not there before.
  const list = () => execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File',
    path.join(__dirname, 'media-helper.ps1'), '-List'], { encoding: 'utf8' }).split(/\r?\n/).filter(Boolean);
  const already = new Set(list());
  await loadSource(false);
  let ours = null;
  for (let i = 0; i < 20 && !ours; i++) {
    await sleep(500);
    ours = list().find((id) => !already.has(id)) || null;
  }
  console.log(ours ? `the test source is known to Windows as "${ours}"` : 'FAIL the test source never appeared in Windows\' list');
  if (!ours) { console.log('source: ' + await src('JSON.stringify({ error: window.__source.error, paused: window.__source.audio.paused })')); app.exit(1); return; }

  await createWidget({ query: '', x: area.x + 50, y: area.y + 40 });
  widget.webContents.setAudioMuted(true);
  widget.showInactive();
  widget.moveTop();
  const run = (js) => widget.webContents.executeJavaScript(js, true);
  for (let i = 0; i < 200 && !(await run('Boolean(window.__mercury && window.__mercury.ready)')); i++) await sleep(50);
  startMediaHelper(ours);

  let failed = 0, count = 0;
  const check = async (label, test, tries = 30) => {
    count++;
    let ok = false;
    for (let i = 0; i < tries && !ok; i++) { ok = Boolean(await test()); if (!ok) await sleep(200); }
    if (!ok) failed++;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`);
    return ok;
  };
  const shown = () => run('JSON.stringify({ title: window.__mercury.player.track.title, artist: window.__mercury.player.track.artist, playing: window.__mercury.player.playing, time: window.__mercury.player.time, duration: window.__mercury.player.track.duration, dim: window.__mercury.mercury.labels ? window.__mercury.mercury.labels.dim : null, art: Boolean(window.__mercury.media.art), sent: window.__mercury.media.sent })').then(JSON.parse);
  const click = async (x, y) => {
    await run(`window.__mercury.pointer('move', ${x}, ${y}); window.__mercury.pointer('down', ${x}, ${y}); 0`);
    await sleep(120);
    await run(`window.__mercury.pointer('up', ${x}, ${y}); 0`);
  };
  const B = JSON.parse(await run('JSON.stringify(window.__mercury.L.buttons.map((b) => b.c))'));
  const seek = JSON.parse(await run('JSON.stringify({ x0: window.__mercury.L.seek.x0, x1: window.__mercury.L.seek.x1 })'));

  await check('the widget shows the other app\'s title and artist', async () => { const s = await shown(); return s.title === 'Test Source One' && s.artist === 'Media Test'; });
  await check('...its artwork', async () => (await shown()).art);
  await check('...that it is playing, and how long the track is', async () => { const s = await shown(); return s.playing && Math.abs(s.duration - 60) < 1; });
  await check('...and its position, moving', async () => { const a = (await shown()).time; await sleep(1500); const b = (await shown()).time; return b - a > 0.8 && b - a < 2.5; }, 3);
  await click(B[1][0], B[1][1]);
  await check('the widget\'s pause button pauses the other app', () => src('window.__source.audio.paused'));
  await check('...and the widget then shows it paused', async () => !(await shown()).playing);
  await click(B[1][0], B[1][1]);
  await check('the play button starts it again', () => src('!window.__source.audio.paused'));
  await click(B[2][0], B[2][1]);
  await check('the next button moves the other app to its next track', () => src('window.__source.index === 1'));
  await check('...and the widget shows the new title', async () => (await shown()).title === 'Test Source Two');
  await click(B[0][0], B[0][1]);
  await check('the previous button goes back', async () => (await src('window.__source.index === 0')) && (await shown()).title === 'Test Source One');
  const sx = Math.round(seek.x0 + (seek.x1 - seek.x0) * 0.75);
  const sy = Number(await run(`(async () => (await import('./shape.js')).seekY(${sx}))()`));
  await click(sx, sy);
  await check('a click three quarters of the way along the timeline seeks the other app there', async () => { const t = await src('window.__source.audio.currentTime'); return t > 43 && t < 50; });
  await check('...and the widget follows', async () => { const t = (await shown()).time; return t > 43 && t < 52; });

  // A source like the browser tab seen on this PC: it allows no next and no previous.
  await loadSource(true);
  await check('a source that allows no next or previous: the helper says so', async () => mediaState && mediaState.source && !mediaState.canNext && !mediaState.canPrev, 50);
  await check('...the widget dims those two buttons', async () => run('window.__mercury.media.state && !window.__mercury.media.state.canNext && !window.__mercury.media.state.canPrev'));
  const before = (await shown()).sent.length;
  await click(B[2][0], B[2][1]);
  await sleep(600);
  await check('...and pressing a dimmed button sends nothing', async () => (await shown()).sent.length === before, 1);

  await run(`window.__mercury.pointer('leave', 0, 0); 0`);
  await sleep(1500);
  if (SHOTS_DIR_FOR_MEDIA) {
    fs.mkdirSync(SHOTS_DIR_FOR_MEDIA, { recursive: true });
    // Let back into captures to be photographed, with the picture it bends held still meanwhile.
    if (REFRACT) { await run('window.__mercury.mercury.backdrop.frozen = true; 0'); widget.setContentProtection(false); await sleep(700); }
    const image = await grabScreen(area, display);
    if (saveShot(image, path.join(SHOTS_DIR_FOR_MEDIA, 'media-limited.png'))) console.log('photographed: media-limited.png');
  }
  console.log(failed ? `${failed} of ${count} failed` : `all ${count} passed`);
  app.quit();
}
/**
 * Does the page hear what the PC plays? Nothing is shown: the widget's window stays hidden and is
 * read directly. A hidden window of our own plays a quiet 70 Hz tone, pulsed twice a second, for a
 * few seconds; the listener has to report a bass that rises and falls with it, and stillness
 * again when it stops (if nothing else on the PC is playing).
 */
async function runListenTest() {
  await createWidget({ query: '' });
  const run = (js) => widget.webContents.executeJavaScript(js, true);
  for (let i = 0; i < 200 && !(await run('Boolean(window.__mercury && window.__mercury.ready)')); i++) await sleep(50);
  await run('window.__mercury.listener.start()');
  console.log('listener: ' + await run('JSON.stringify(window.__mercury.listener.state)'));
  const sample = async (seconds) => {
    let lo = 1, hi = 0, pulseHi = 0, raw = 0;
    for (let i = 0; i < seconds * 25; i++) {
      const a = JSON.parse(await run('(() => { const a = window.__mercury.listener.analyse(); return JSON.stringify({ bass: (a.bands[0] + a.bands[1] + a.bands[2]) / 3, pulse: a.pulse, level: window.__mercury.listener.state.level }); })()'));
      lo = Math.min(lo, a.bass); hi = Math.max(hi, a.bass); pulseHi = Math.max(pulseHi, a.pulse); raw = Math.max(raw, a.level);
      await sleep(40);
    }
    return { bassLow: +lo.toFixed(2), bassHigh: +hi.toFixed(2), pulseHigh: +pulseHi.toFixed(2), level: +raw.toFixed(3) };
  };
  const before = await sample(2);
  console.log('before the tone: ' + JSON.stringify(before));
  const tone = new BrowserWindow({ show: false, webPreferences: { contextIsolation: true, sandbox: true, backgroundThrottling: false, autoplayPolicy: 'no-user-gesture-required' } });
  await tone.loadURL('data:text/html,<body></body>');
  await tone.webContents.executeJavaScript(`(() => {
    const ctx = new AudioContext(), o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.value = 70; g.gain.value = 0;
    for (let i = 0; i < 12; i++) { const t = ctx.currentTime + 0.2 + i * 0.5; g.gain.setValueAtTime(0.05, t); g.gain.exponentialRampToValueAtTime(0.0005, t + 0.3); }
    o.connect(g).connect(ctx.destination); o.start(); o.stop(ctx.currentTime + 6.5); return ctx.resume();
  })()`, true);
  await sleep(600);
  const during = await sample(4);
  console.log('during the tone: ' + JSON.stringify(during));
  await sleep(3500);
  const after = await sample(2);
  console.log('after the tone:  ' + JSON.stringify(after));
  const heard = during.level > before.level * 1.5 || during.bassHigh - during.bassLow > 0.3;
  console.log(heard ? 'ok   the liquid hears what the PC plays' : 'FAIL nothing was heard (or something else was playing over it: compare the three lines)');
  app.quit();
}
const SHOTS_DIR_FOR_MEDIA = args.out ? path.resolve(args.out) : null;

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
 * True if a grab of the backdrop window's area really shows the backdrop window: backdrop.html
 * paints a small magenta square in each corner. A grab that fails this shows something else that
 * is on the screen, which must never be saved.
 */
function showsBackdrop(image) {
  const { width, height } = image.getSize();
  const bmp = image.toBitmap();           // BGRA
  const k = Math.max(3, Math.round(width / 960 * 4));
  return [[2, 2], [width - 2 - k, 2], [2, height - 2 - k], [width - 2 - k, height - 2 - k]].every(([x0, y0]) => {
    let r = 0, g = 0, b = 0;
    for (let y = y0; y < y0 + k; y++) for (let x = x0; x < x0 + k; x++) { const i = (y * width + x) * 4; b += bmp[i]; g += bmp[i + 1]; r += bmp[i + 2]; }
    const n = k * k;
    return r / n > 200 && g / n < 70 && b / n > 150;
  });
}

/** Saves a grab, but only if it shows our own backdrop window. */
function saveShot(image, file) {
  if (!showsBackdrop(image)) {
    console.log(`NOT SAVED ${path.basename(file)}: the grab does not show the test backdrop, so it shows something else on the screen. Stopping.`);
    app.exit(1);
    return false;
  }
  fs.writeFileSync(file, image.toPNG());
  return true;
}

/**
 * Photographs the widget over windows of our own, so nothing of the owner's desktop is recorded:
 * the backdrop window covers the whole area that is captured, and nothing is saved unless the
 * grab is seen to show that window.
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
  onTop(backdrop);
  backdrop.showInactive();
  backdrop.moveTop();

  await createWidget({ query: 'capture=1&play', x: area.x + 50, y: area.y + 40 });
  widget.webContents.setAudioMuted(true);
  widget.showInactive();
  widget.moveTop();
  const run = (js) => widget.webContents.executeJavaScript(js, true);
  for (let i = 0; i < 200 && !(await run('Boolean(window.__mercury && window.__mercury.ready)')); i++) await sleep(50);
  for (let done = 0; done < 720; done += 30) await run('window.__mercury.step(30, 1 / 60, true); window.__mercury.mercury.gl.finish(); 0');

  if (REFRACT) {
    for (let i = 0; i < 100 && !(await run('Boolean(window.__mercury.mercury.backdrop.frame || window.__mercury.mercury.backdrop.has)')); i++) await sleep(100);
    console.log('capture: ' + await run('JSON.stringify({ settings: window.__mercury.backdrop.settings, error: window.__mercury.backdrop.error, frames: window.__mercury.backdrop.frames })'));
  }

  for (const mode of (args.modes || 'dark,light,busy').split(',')) {
    await setBackdrop(mode);
    backdrop.moveTop();
    widget.moveTop();
    if (REFRACT) {
      await sleep(900);         // the capture has to see the new backdrop first
      await run('window.__mercury.step(1, 1 / 60, true); window.__mercury.mercury.springs.refract.snap(1); 0');
    }
    await run('window.__mercury.step(2, 1 / 60, true); 0');
    await sleep(600);
    if (REFRACT) {
      // What the capture sees: the same piece of screen with the widget left out of it.
      if (!saveShot(await grabScreen(area, display), path.join(SHOTS, `behind-${mode}.png`))) return;
      // To photograph the result the window has to be let back into captures. Nothing is redrawn
      // while the page's clock is stopped, so it cannot start bending a picture of itself.
      widget.setContentProtection(false);
      await sleep(700);
    }
    const image = await grabScreen(area, display);
    if (REFRACT) { widget.setContentProtection(true); await sleep(700); }
    if (!saveShot(image, path.join(SHOTS, `window-${mode}.png`))) return;
    const size = image.getSize();
    console.log(`window-${mode}: ${size.width}x${size.height}`);
  }
  if (REFRACT) console.log('capture at the end: ' + await run('JSON.stringify({ frames: window.__mercury.backdrop.frames, uploads: window.__mercury.mercury.backdrop.uploads, size: [window.__mercury.mercury.backdrop.w, window.__mercury.mercury.backdrop.h], map: window.__mercury.mercury.backdrop.map })'));
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
  onTop(backdrop);
  backdrop.showInactive();
  backdrop.moveTop();
  const origin = { x: area.x + 50, y: area.y + 40 };
  await createWidget({ query: '', ...origin });
  widget.webContents.setAudioMuted(true);
  widget.showInactive();
  widget.moveTop();
  const run = (js) => widget.webContents.executeJavaScript(js, true);
  for (let i = 0; i < 200 && !(await run('Boolean(window.__mercury && window.__mercury.ready)')); i++) await sleep(50);
  // Let it finish forming. The first launch after the shaders change spends a couple of
  // seconds compiling them before anything moves, so wait for the drop itself, not the clock.
  for (let i = 0; i < 100 && !(await run('window.__mercury.mercury.springs.form.x > 0.97')); i++) await sleep(100);
  await sleep(500);

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
  if (TEST === 'media') { await runMediaTest(); return; }
  if (TEST === 'listen') { await runListenTest(); return; }
  if (TEST === 'gpu') {
    await require('./gpu-test.js').runGpuTest({ app, screen, createWidget, getWidget: () => widget, pickDisplay, seconds: Number(args.seconds) || 12, refract: REFRACT });
    return;
  }

  await createWidget({ x: args.x && Number(args.x), y: args.y && Number(args.y) });
  widget.showInactive();
  if (SYSTEM) startMediaHelper();
  tray = new Tray(path.join(REPO, 'jusic.ico'));
  tray.setToolTip('Mercury prototype');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Mercury prototype', enabled: false },
    { type: 'separator' },
    ...(REFRACT ? [{
      label: 'Refraction (off: the widget shows in screenshots)', type: 'checkbox', checked: true,
      click: (item) => setRefracting(item.checked),
    }] : []),
    { label: 'Quit', click: () => app.quit() },
  ]));
});

app.on('window-all-closed', () => app.quit());
