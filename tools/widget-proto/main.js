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
 *   npx electron tools/widget-proto/main.js test=drag          check that the drop stays under the mouse while dragged: no
 *                                                           window is shown and the real mouse is not touched
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
 *   test=listen                                             proves that the liquid hears what the PC plays (sound-helper.ps1):
 *                                                           no window is shown; a quiet pulsed tone is played for a few seconds
 *   listen=off                                              with source=system: do not listen, move to a made-up beat
 *   page=glass3d                                            the live 3D glass (prototypes/glass3d/) in this window; frame=ref
 *                                                           the reference's framing; q=<query> handed on to the page
 *   test=spike page=glass3d [frame=ref] [dsf=1|1.25] [out=<folder>] [seconds=8]   the phase 2 spike: the 3D glass still in
 *                                                           this window on the other monitor, photographed (the page's own
 *                                                           pixels) and measured: fps, the GPU process's share, idle
 *   test=refract page=glass3d                               the tray's Refraction switch, off and on, checked (3D page)
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
// Which page the window shows: the 2D shader widget (prototypes/mercury/, the default and the fallback) or the live 3D
// glass (prototypes/glass3d/, phase 2 of the 3D brief; q=<query> is handed on to it, frame=ref gives the reference's
// framing, 1586 x 992).
const PAGE = args.page === 'glass3d' ? 'glass3d' : 'mercury';
// Refraction is the look (the owner's decision, 13 November 2026): on unless refract=off, or glass= is being tried.
// (test=spike photographs the page's own pixels, so it runs without refraction unless refract=live is given: a picture
// must never carry what is really on the owner's screen.)
const REFRACT = (TEST === 'spike' && args.refract !== 'live') || args.refract === 'off' || (args.glass && !args.refract) ? null : (args.refract || 'live');
// Options that are simply handed on to the page.
const SYSTEM = args.source === 'system' || TEST === 'media' || TEST === 'listen';
const PAGE_OPTIONS = (args.mat ? `&mat=${encodeURIComponent(args.mat)}` : '') + (REFRACT ? `&refract=${encodeURIComponent(REFRACT)}` : '') + (SYSTEM ? '&source=system' : '')
  + ['rfps', 'rmax', 'glass', 'frame'].filter((k) => args[k]).map((k) => `&${k}=${encodeURIComponent(args[k])}`).join('')
  + (args.q ? '&' + args.q : '');
// Draw at a given display scale wherever the window is (the main monitor is 125%).
if (args.dsf) app.commandLine.appendSwitch('force-device-scale-factor', args.dsf);
const PORT = 5190;
const STAGE = PAGE === 'glass3d' && args.frame === 'ref' ? { w: 1586, h: 992 } : { w: 860, h: 400 };

// Keep this prototype's browser profile inside the repo's ignored data folder, not in %APPDATA%.
// (Tests and shots keep a profile of their own: an instance of the widget left running holds the shader cache, and
// a test then compiled everything from scratch and ran late.)
app.setPath('userData', TEST || SHOTS ? path.join(REPO, 'data', 'widget-proto-tests', TEST || 'shots') : path.join(REPO, 'data', 'widget-proto'));

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

/** The window's size as designed, in DIPs. Every move sets it again: see dragStep(). */
let widgetSize = null;

function createWidget({ query = 'play', x, y, display = 'primary' } = {}) {
  const w = Math.round(STAGE.w * SIZE), h = Math.round(STAGE.h * SIZE);
  const area = pickDisplay(display).workArea;
  if (x === undefined && y === undefined && !args.display) ({ x, y } = savedPosition(w, h) || {});
  x = x ?? area.x + area.width - w - 40;
  y = y ?? area.y + area.height - h - 40;
  widgetSize = { width: w, height: h };
  widget = new BrowserWindow({
    width: w, height: h, useContentSize: true, x, y,
    transparent: true, frame: false, hasShadow: false, roundedCorners: false, thickFrame: false,
    resizable: false, maximizable: false, minimizable: false, fullscreenable: false,
    alwaysOnTop: true, skipTaskbar: true, focusable: false, show: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      // Background throttling stays on (the default): when the window is hidden the page is
      // told so and stops drawing. The capture tools turn it off; the widget must not.
      contextIsolation: true, sandbox: true, nodeIntegration: false,
    },
  });
  // On a monitor scaled by 125% or 150% the window comes out a few pixels larger than asked,
  // more or fewer depending on where it stands. Asking once more by its bounds settles it.
  widget.setBounds({ x, y, ...widgetSize });
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
  return widget.loadURL(`http://127.0.0.1:${PORT}/prototypes/${PAGE}/?widget=1&scale=${SIZE}&${query}${PAGE_OPTIONS}`);
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
  // (No guessing: a capture of another screen would bend what is on that one. With the display unmatched the page
  // gets no source and the glass stays as it is without refraction.)
  return { window: bounds, display: display.bounds, sourceId: screenSources.get(String(display.id)) || null };
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

// What the PC is playing, for the liquid to move to (sound-helper.ps1). Its lines are spectra,
// 16 numbers each; nothing of the sound itself comes through here.
let soundHelper = null;
let soundLines = 0;
function startSoundHelper() {
  if (soundHelper || args.listen === 'off') return;
  const child = soundHelper = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File',
    path.join(__dirname, 'sound-helper.ps1')], { windowsHide: true });
  let rest = '';
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    const lines = (rest + chunk).split(/\r?\n/);
    rest = lines.pop();
    const last = lines.filter((l) => l.startsWith('B ')).pop();      // only the newest matters
    if (!last) return;
    soundLines += lines.length;
    if (widget && !widget.isDestroyed()) widget.webContents.send('widget:bands', last.slice(2).split(' ').map(Number));
  });
  child.stderr.on('data', (chunk) => console.log('sound helper: ' + String(chunk).trim()));
  child.on('exit', () => { if (soundHelper === child) soundHelper = null; });
}
app.on('before-quit', () => { if (soundHelper) { try { soundHelper.stdin.end(); } catch { /* gone */ } soundHelper = null; } });

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
  const GLASS = PAGE === 'glass3d';
  const H = GLASS ? 'window.__glass' : 'window.__mercury';
  for (let i = 0; i < 600 && !(await run(`Boolean(${H} && ${H}.ready)`)); i++) await sleep(50);
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
  const shown = GLASS
    ? () => run('JSON.stringify({ title: window.__glass.player.track.title, artist: window.__glass.player.track.artist, playing: window.__glass.player.playing, time: window.__glass.time, duration: window.__glass.player.track.duration, dim: window.__glass.player.dim, art: Boolean(window.__glass.media.art), sent: window.__glass.media.sent })').then(JSON.parse)
    : () => run('JSON.stringify({ title: window.__mercury.player.track.title, artist: window.__mercury.player.track.artist, playing: window.__mercury.player.playing, time: window.__mercury.player.time, duration: window.__mercury.player.track.duration, dim: window.__mercury.mercury.labels ? window.__mercury.mercury.labels.dim : null, art: Boolean(window.__mercury.media.art), sent: window.__mercury.media.sent })').then(JSON.parse);
  const click = async (x, y) => {
    await run(`${H}.pointer('move', ${x}, ${y}); ${H}.pointer('down', ${x}, ${y}); 0`);
    await sleep(120);
    await run(`${H}.pointer('up', ${x}, ${y}); 0`);
  };
  const B = JSON.parse(await run(GLASS ? 'JSON.stringify(window.__glass.layout.buttons)' : 'JSON.stringify(window.__mercury.L.buttons.map((b) => b.c))'));
  const seek = GLASS ? null : JSON.parse(await run('JSON.stringify({ x0: window.__mercury.L.seek.x0, x1: window.__mercury.L.seek.x1 })'));

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
  const [sx, sy] = GLASS ? JSON.parse(await run('JSON.stringify(window.__glass.layout.seekAt(0.75))'))
    : [Math.round(seek.x0 + (seek.x1 - seek.x0) * 0.75), 0];
  await click(sx, GLASS ? sy : Number(await run(`(async () => (await import('./shape.js')).seekY(${sx}))()`)));
  await check('a click three quarters of the way along the timeline seeks the other app there', async () => { const t = await src('window.__source.audio.currentTime'); return t > 43 && t < 50; });
  await check('...and the widget follows', async () => { const t = (await shown()).time; return t > 43 && t < 52; });

  // A source like the browser tab seen on this PC: it allows no next and no previous.
  await loadSource(true);
  await check('a source that allows no next or previous: the helper says so', async () => mediaState && mediaState.source && !mediaState.canNext && !mediaState.canPrev, 50);
  await check('...the widget dims those two buttons', async () => run(`${H}.media.state && !${H}.media.state.canNext && !${H}.media.state.canPrev`));
  const before = (await shown()).sent.length;
  await click(B[2][0], B[2][1]);
  await sleep(600);
  await check('...and pressing a dimmed button sends nothing', async () => (await shown()).sent.length === before, 1);

  await run(`${H}.pointer('leave', 0, 0); 0`);
  await sleep(1500);
  if (SHOTS_DIR_FOR_MEDIA) {
    fs.mkdirSync(SHOTS_DIR_FOR_MEDIA, { recursive: true });
    // Let back into captures to be photographed, with the picture it bends held still meanwhile.
    if (REFRACT) { await run(GLASS ? 'window.__glass.backdrop.frozen = true; 0' : 'window.__mercury.mercury.backdrop.frozen = true; 0'); widget.setContentProtection(false); await sleep(700); }
    const image = await grabScreen(area, display);
    if (saveShot(image, path.join(SHOTS_DIR_FOR_MEDIA, 'media-limited.png'))) console.log('photographed: media-limited.png');
  }
  console.log(failed ? `${failed} of ${count} failed` : `all ${count} passed`);
  app.quit();
}
/**
 * Does the liquid hear what the PC plays? Nothing is shown: the widget's window stays hidden and
 * is read directly. A hidden window of our own plays a quiet 70 Hz tone, pulsed twice a second,
 * for a few seconds. If the PC was silent, the bass has to rise and fall with it and be still
 * before; if something is already playing, that is what is heard, which proves the same thing.
 * Only numbers are printed.
 */
async function runListenTest() {
  await createWidget({ query: '' });
  const run = (js) => widget.webContents.executeJavaScript(js, false);
  for (let i = 0; i < 200 && !(await run('Boolean(window.__mercury && window.__mercury.ready)')); i++) await sleep(50);
  startSoundHelper();
  for (let i = 0; i < 100 && !(await run('window.__mercury.listener.state.ready')); i++) await sleep(100);
  console.log('listening: ' + await run('JSON.stringify({ ready: window.__mercury.listener.state.ready, lines: window.__mercury.listener.state.lines })'));
  const sample = async (seconds) => {
    let lo = 1, hi = 0, pulseHi = 0, level = 0;
    for (let i = 0; i < seconds * 25; i++) {
      const a = JSON.parse(await run('(() => { const a = window.__mercury.listener.analyse(); return JSON.stringify({ bass: (a.bands[0] + a.bands[1] + a.bands[2]) / 3, pulse: a.pulse, level: window.__mercury.listener.state.level }); })()'));
      lo = Math.min(lo, a.bass); hi = Math.max(hi, a.bass); pulseHi = Math.max(pulseHi, a.pulse); level = Math.max(level, a.level);
      await sleep(40);
    }
    return { bassLow: +lo.toFixed(2), bassHigh: +hi.toFixed(2), pulseHigh: +pulseHi.toFixed(2), level: +level.toFixed(3) };
  };
  const before = await sample(3);
  console.log('before the tone: ' + JSON.stringify(before));
  const tone = new BrowserWindow({ show: false, webPreferences: { contextIsolation: true, sandbox: true, backgroundThrottling: false, autoplayPolicy: 'no-user-gesture-required' } });
  await tone.loadURL('data:text/html,<body></body>');
  await tone.webContents.executeJavaScript(`(() => {
    const ctx = new AudioContext(), o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.value = 70; g.gain.value = 0;
    for (let i = 0; i < 12; i++) { const t = ctx.currentTime + 0.2 + i * 0.5; g.gain.setValueAtTime(0.05, t); g.gain.exponentialRampToValueAtTime(0.0005, t + 0.3); }
    o.connect(g).connect(ctx.destination); o.start(); o.stop(ctx.currentTime + 6.5); return ctx.resume();
  })()`, true);
  await sleep(1500);
  const during = await sample(4);
  console.log('during the tone: ' + JSON.stringify(during));
  const heard = before.bassHigh - before.bassLow > 0.3 || during.bassHigh - during.bassLow > 0.3;
  console.log(heard ? 'ok   the liquid hears what the PC plays' : 'FAIL nothing was heard');
  app.quit();
}
/**
 * Does the drop stay under the mouse while it is dragged? Nothing is shown and the real mouse is
 * not touched: the widget's window stays hidden, on the monitor the owner keeps it on (the scaling
 * of that monitor is what matters), and the dragging code is driven with made-up cursor points
 * that wander and come back to where they began. Afterwards the window has to be exactly the size
 * and at exactly the place it started, and so does the drop inside it. The position file is not
 * written. Only numbers are printed.
 */
async function runDragTest() {
  const display = pickDisplay('primary');
  const area = display.workArea;
  await createWidget({ query: '', x: area.x + 201, y: area.y + 203 });
  const run = (js) => widget.webContents.executeJavaScript(js, false);
  for (let i = 0; i < 200 && !(await run('Boolean(window.__mercury && window.__mercury.ready)')); i++) await sleep(50);
  console.log(`display ${display.size.width}x${display.size.height} at scale ${display.scaleFactor}`);
  const measure = async () => {
    await sleep(250);
    const page = JSON.parse(await run(`(() => { const r = document.querySelector('.widget').getBoundingClientRect();
      return JSON.stringify({ inner: [innerWidth, innerHeight], drop: [Math.round(r.left * 100) / 100, Math.round(r.top * 100) / 100] }); })()`));
    return { size: widget.getSize(), position: widget.getPosition(), ...page };
  };
  const path = (i) => ({ x: 1000 + Math.round(70 * Math.sin(i / 9)) + (i % 7), y: 500 + Math.round(45 * Math.cos(i / 13)) + (i % 5) });
  const home = { x: 1000, y: 500 };
  const STEPS = 400;

  const before = await measure();
  console.log('before:                  ' + JSON.stringify(before));
  const [x0, y0] = widget.getPosition();

  // What a drag does now.
  const sizes = new Set();
  let off = 0, dropMoved = 0;
  dragStep('start', home);
  for (let i = 0; i < STEPS; i++) {
    const c = path(i);
    dragStep('move', c);
    const [px, py] = widget.getPosition();
    off = Math.max(off, Math.abs(px - (x0 + c.x - home.x)), Math.abs(py - (y0 + c.y - home.y)));
    sizes.add(widget.getSize().join('x'));
    if (i % 80 === 40) {            // the drop inside the window, a few times on the way
      const m = await measure();
      dropMoved = Math.max(dropMoved, Math.abs(m.drop[0] - before.drop[0]), Math.abs(m.drop[1] - before.drop[1]));
    }
  }
  dragStep('move', home);
  dragStep('end', home, { remember: false });
  const after = await measure();
  console.log('after ' + STEPS + ' moves and back: ' + JSON.stringify(after));
  console.log(`  window sizes on the way: ${[...sizes].join(', ')}; furthest from the mouse: ${off} px; the drop moved inside the window by ${dropMoved} px`);
  const steady = [...sizes].every((s) => { const [sw, sh] = s.split('x').map(Number); return Math.abs(sw - widgetSize.width) <= 1 && Math.abs(sh - widgetSize.height) <= 1; });
  const ok = JSON.stringify(after) === JSON.stringify(before) && steady && off <= 1 && dropMoved === 0;

  // What a drag used to do (moving the window by its position alone), for the record: on a
  // monitor at 100% this adds nothing; at 125% it adds hundreds of pixels.
  for (let i = 0; i < STEPS; i++) { const c = path(i); widget.setPosition(x0 + c.x - home.x, y0 + c.y - home.y); }
  widget.setPosition(x0, y0);
  const [ow, oh] = widget.getSize();
  console.log(`  (the old way, by position alone, over the same path: the window grows by ${ow - after.size[0]} x ${oh - after.size[1]})`);

  console.log(ok ? 'ok   the drop stays under the mouse' : 'FAIL the window or the drop ended somewhere else');
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
/**
 * One step of dragging the window by the drop's body. cursor: where the mouse is, in screen DIPs.
 * (A function of its own so that test=drag can drive it with made-up points, without the mouse.)
 */
function dragStep(phase, cursor, { remember = true } = {}) {
  if (!widget || widget.isDestroyed()) return;
  if (phase === 'start') {
    const [wx, wy] = widget.getPosition();
    drag = { cx: cursor.x, cy: cursor.y, wx, wy };
  } else if (phase === 'move' && drag) {
    // Its size goes with every move, never the position alone. On a monitor scaled by 125% or
    // 150% a position does not fall on whole pixels, Windows is handed the rectangle rounded
    // outward, and setPosition() takes the size from the window as it then is: so each move
    // made the window a pixel or two larger, some hundreds of pixels over one drag. The drop
    // sat in the window's middle and slid away to the right and down for as long as the
    // button was held. Stating the designed size each time leaves nothing to add up.
    widget.setBounds({ x: drag.wx + cursor.x - drag.cx, y: drag.wy + cursor.y - drag.cy, ...widgetSize });
  } else if (phase === 'end') {
    drag = null;
    const [px, py] = widget.getPosition();
    if (remember) try { fs.writeFileSync(POSITION_FILE, JSON.stringify({ x: px, y: py })); } catch { /* remembering is a nicety */ }
  }
}
ipcMain.on('widget:drag', (event, phase) => dragStep(String(phase), screen.getCursorScreenPoint()));
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

  const GLASS = PAGE === 'glass3d';
  await createWidget({ query: GLASS ? 'play' : 'capture=1&play', x: area.x + 50, y: area.y + 40 });
  widget.webContents.setAudioMuted(true);
  widget.showInactive();
  widget.moveTop();
  const run = (js) => widget.webContents.executeJavaScript(js, true);
  if (GLASS) {
    // the 3D glass draws only when something changes: ready once it has drawn and read its silhouette
    for (let i = 0; i < 600 && !(await run('Boolean(window.__glass && (window.__glass.ready || window.__glass.error))')); i++) await sleep(50);
    const err = await run('window.__glass.error');
    if (err) { console.log('page error: ' + err); app.quit(); return; }
  } else {
    for (let i = 0; i < 200 && !(await run('Boolean(window.__mercury && window.__mercury.ready)')); i++) await sleep(50);
    for (let done = 0; done < 720; done += 30) await run('window.__mercury.step(30, 1 / 60, true); window.__mercury.mercury.gl.finish(); 0');
  }
  const B = GLASS ? 'window.__glass.backdrop' : 'window.__mercury.backdrop';

  if (REFRACT) {
    const p = await placement();
    if (!p.sourceId || p.sourceId !== screenSources.get(String(display.id))) {
      console.log('NOT SAVED: the refraction capture is not of the monitor the widget is on (it would bend another screen). Stopping.');
      app.exit(1); return;
    }
    const has = GLASS ? 'window.__glass.backdrop.frames > 2' : 'Boolean(window.__mercury.mercury.backdrop.frame || window.__mercury.mercury.backdrop.has)';
    for (let i = 0; i < 100 && !(await run(has)); i++) await sleep(100);
    console.log('capture: ' + await run(`JSON.stringify({ settings: ${B}.settings, error: ${B}.error, frames: ${B}.frames })`));
  }

  for (const mode of (args.modes || 'dark,light,busy').split(',')) {
    await setBackdrop(mode);
    backdrop.moveTop();
    widget.moveTop();
    if (REFRACT) {
      await sleep(900);         // the capture has to see the new backdrop first
      if (GLASS) { await sleep(400); await run('window.__glass.backdrop.frozen = true; window.__glass.redraw(); 0'); }
      else await run('window.__mercury.step(1, 1 / 60, true); window.__mercury.mercury.springs.refract.snap(1); 0');
    }
    if (!GLASS) await run('window.__mercury.step(2, 1 / 60, true); 0');
    await sleep(600);
    if (REFRACT) {
      // What the capture sees: the same piece of screen with the widget left out of it.
      if (!saveShot(await grabScreen(area, display), path.join(SHOTS, `behind-${mode}.png`))) return;
      // (the page's own pixels, the glass bending what its capture saw: only now that the screen behind is known
      // to be our own backdrop, and the capture known to be of this monitor)
      if (GLASS) fs.writeFileSync(path.join(SHOTS, `page-${mode}.png`), (await widget.webContents.capturePage()).toPNG());
      // To photograph the result the window has to be let back into captures. Nothing is redrawn
      // while the page's clock is stopped, so it cannot start bending a picture of itself.
      widget.setContentProtection(false);
      await sleep(700);
    }
    const image = await grabScreen(area, display);
    if (REFRACT) { widget.setContentProtection(true); await sleep(700); if (GLASS) await run('window.__glass.backdrop.frozen = false; 0'); }
    if (!saveShot(image, path.join(SHOTS, `window-${mode}.png`))) return;
    const size = image.getSize();
    console.log(`window-${mode}: ${size.width}x${size.height}`);
  }
  if (REFRACT && !GLASS) console.log('capture at the end: ' + await run('JSON.stringify({ frames: window.__mercury.backdrop.frames, uploads: window.__mercury.mercury.backdrop.uploads, size: [window.__mercury.mercury.backdrop.w, window.__mercury.mercury.backdrop.h], map: window.__mercury.mercury.backdrop.map })'));
  if (REFRACT && GLASS) console.log('capture at the end: ' + await run('JSON.stringify({ frames: window.__glass.backdrop.frames, uploads: window.__glass.G.desk.uploads, size: [window.__glass.G.desk.w, window.__glass.G.desk.h], map: window.__glass.G.desk.map })'));
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
  // Every check waits for the state it depends on, and says so when that state never comes, instead of
  // checking against whatever is there when a fixed pause runs out. (One run in three failed this way on
  // 17 November: under a loaded GPU, with another instance holding the shader cache, the 2D page took longer
  // to compile and form than the old 10 s wait, and the first checks ran against a drop not yet there.)
  const waitFor = async (js, ms) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) { if (await run(js).catch(() => false)) return Date.now() - t0; await sleep(40); }
    return -1;
  };
  const GLASS = PAGE === 'glass3d';
  const H = GLASS ? 'window.__glass' : 'window.__mercury';
  const quit = (why) => { console.log('FAIL ' + why); console.log('stopped: nothing was checked'); app.quit(); };
  if (await waitFor(`Boolean(${H} && ${H}.ready)`, 30000) < 0) return quit('the page was not ready after 30 s');
  const formed = GLASS ? `${H}.formed` : `${H}.mercury.springs.form.x > 0.97 && ${H}.mercury.springs.form.resting`;
  const formedIn = await waitFor(formed, 60000);
  if (formedIn < 0) return quit('the drop had not formed after 60 s');
  console.log(`(formed after ${(formedIn / 1000).toFixed(1)} s)`);
  // what the page decided last (true: let the mouse through), and when the window has done it
  const pageSays = `${H}.passing`;
  // nothing in the shape still moving (the beads bud out while the pointer is over the right end)
  const still = GLASS ? 'true' : `${H}.mercury.springs.util.resting`;

  const names = new Map([[handleOf(widget), 'the widget'], [handleOf(backdrop), 'the window behind']]);
  // label, where the pretend pointer goes (stage units), where Windows is asked, what should be there
  const cases = GLASS ? [
    // The 3D glass: stage = (reference px + (96.6, -87.6)) / 2.0619, the points kept well inside or outside
    // the model's real silhouette (it has no beads yet).
    ['no pointer yet, asked at the play button', null, [647, 181], 'the window behind'],
    ['no pointer yet, asked on the cover', null, [190, 161], 'the window behind'],
    ['pointer on the play button', [647, 181], [647, 181], 'the widget'],
    ['pointer on the body, by the title', [299, 210], [299, 210], 'the widget'],
    ['pointer on the cover', [190, 161], [190, 161], 'the widget'],
    ['pointer in the notch above the waist', [438, 142], [438, 142], 'the window behind'],
    ['pointer in the corner of the window', [20, 20], [20, 20], 'the window behind'],
    ['pointer just below the lower edge', [438, 293], [438, 293], 'the window behind'],
    ['pointer on the right end', [784, 176], [784, 176], 'the widget'],
    ['pointer beyond the right end', [823, 176], [823, 176], 'the window behind'],
    ['pointer above the right lobe', [677, 66], [677, 66], 'the window behind'],
    ['pointer on the bulb\'s left ring', [81, 152], [81, 152], 'the widget'],
    ['pointer left of the bulb', [50, 152], [50, 152], 'the window behind'],
    ['pointer back on the timeline', [338, 262], [338, 262], 'the widget'],
  ] : [
    ['no pointer yet, asked at the play button', null, [642, 198], 'the window behind'],
    ['no pointer yet, asked where the upper bead rests', null, [807, 184], 'the window behind'],
    ['pointer on the play button', [642, 198], [642, 198], 'the widget'],
    ['pointer on the body, by the title', [400, 235], [400, 235], 'the widget'],
    ['pointer on the cover tile', [172, 152], [172, 152], 'the widget'],
    ['pointer in the notch above the waist', [430, 120], [430, 120], 'the window behind'],
    ['pointer in the corner of the window', [20, 20], [20, 20], 'the window behind'],
    ['pointer just below the lower edge', [430, 330], [430, 330], 'the window behind'],
    // The two beads bud off the right end while the pointer is over its right side.
    ['pointer on the right end (the beads come out)', [760, 200], [760, 200], 'the widget'],
    ['pointer in the gap between the end and its beads', [799, 197], [799, 197], 'the widget'],
    ['pointer on the upper bead', [807, 184], [807, 184], 'the widget'],
    ['pointer on the lower bead', [807, 211], [807, 211], 'the widget'],
    ['pointer beyond the beads', [842, 197], [842, 197], 'the window behind'],
    ['pointer back on the timeline', [430, 268], [430, 268], 'the widget'],
  ];
  let failed = 0;
  for (const [label, pointer, probe, want] of cases) {
    let note = '';
    if (pointer) {
      // the shape at rest before the pointer arrives (a bead still budding is not where it will be)
      if (await waitFor(still, 5000) < 0) note += ' (the shape was still moving after 5 s)';
      await run(`${H}.pointer('move', ${pointer[0]}, ${pointer[1]}); 0`);
    }
    // the page's decision has reached the window (and Windows has had a moment to apply it)
    const t0 = Date.now();
    while (Date.now() - t0 < 3000) { const p = await run(pageSays); if (p === ignoring) break; await sleep(30); }
    if (await run(pageSays) !== ignoring) note += ' (the window never took the page\'s decision)';
    await sleep(120);
    const at = screen.dipToScreenPoint({ x: Math.round(origin.x + probe[0] * SIZE), y: Math.round(origin.y + probe[1] * SIZE) });
    const got = names.get(windowAt(at)) || 'something else';
    if (got !== want) failed++;
    console.log(`${got === want ? 'ok  ' : 'FAIL'} ${label}: a click would reach ${got}${got === want ? '' : ' (expected ' + want + ')'}; the page asked the window to ${ignoring ? 'let the mouse through' : 'take the mouse'}${note}`);
  }
  console.log(`focused: widget ${widget.isFocused()}, window behind ${backdrop.isFocused()}`);
  console.log(failed ? `${failed} of ${cases.length} failed` : `all ${cases.length} passed`);
  app.quit();
}

/**
 * The tray's Refraction switch, without the tray or the mouse: switches it off and on as the menu does and checks what
 * the page and the window then do (3D page). Off: the capture stops, the glass eases to its look without the desktop,
 * and only then is the window let back into screen captures. On: out of captures first, then the capture starts again
 * and the desktop eases back into the glass. Nothing of the screen is saved.
 */
async function runRefractTest() {
  const display = pickDisplay('other');
  const area = display.workArea;
  await createWidget({ query: '', display: 'other', x: area.x + 40, y: area.y + 40 });
  widget.showInactive();
  const run = (js) => widget.webContents.executeJavaScript(js, true);
  const H = PAGE === 'glass3d' ? 'window.__glass' : null;
  if (!H) { console.log('test=refract is for page=glass3d'); app.quit(); return; }
  let failed = 0, count = 0;
  const check = async (label, test, tries = 40) => {
    count++;
    let ok = false;
    for (let i = 0; i < tries && !ok; i++) { ok = Boolean(await test()); if (!ok) await sleep(150); }
    if (!ok) failed++;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`);
  };
  for (let i = 0; i < 600 && !(await run(`Boolean(${H} && ${H}.ready)`)); i++) await sleep(50);
  await check('on at start: the window is out of screen captures', () => refracting && widget.isContentProtected());
  await check('...the page captures the monitor it is on and bends it through the glass', () => run(`${H}.backdrop.frames > 3 && ${H}.G.desk.on > 0.99 && ${H}.G.desk.has`));
  await setRefracting(false);
  await check('switched off: the capture stops', () => run(`!${H}.backdrop.track`));
  await check('...the glass eases to its look without the desktop', () => run(`${H}.G.desk.on === 0`));
  await check('...and then the window is back in screen captures', () => !widget.isContentProtected());
  const frames = await run(`${H}.backdrop.frames`);
  await sleep(1000);
  await check('...and no frame of the screen is taken while off', async () => (await run(`${H}.backdrop.frames`)) === frames, 1);
  await setRefracting(true);
  await check('switched on again: out of captures first', () => widget.isContentProtected());
  await check('...the capture starts again and the desktop eases back in', () => run(`${H}.backdrop.frames > ${frames} && ${H}.G.desk.on > 0.99`));
  console.log(failed ? `${failed} of ${count} failed` : `all ${count} passed`);
  app.quit();
}

/**
 * A short recording of the 3D widget sitting on the desktop of the other monitor (the owner asked for one), refraction
 * on. The window is out of screen captures while it refracts, so the page composes what is really on the screen there
 * itself (the desktop under the window, the glass bending it, the words) and records that. It shows whatever is on that
 * monitor: it is written only to design/captures/raw/ (never committed) and handed to the owner directly.
 *   test=record page=glass3d [seconds=6] [out=<file.webm>]
 */
async function runRecord() {
  const display = pickDisplay('other');
  if (display.id === screen.getPrimaryDisplay().id) { console.log('record: no second monitor; nothing recorded'); app.quit(); return; }
  const area = display.workArea;
  const w = Math.round(STAGE.w * SIZE), h = Math.round(STAGE.h * SIZE);
  const at = { x: area.x + area.width - w - 60, y: area.y + area.height - h - 60 };
  if (args.backdrop) {
    // (a check of the recording itself: one of our own backdrop windows behind the widget instead of the desktop)
    const bd = new BrowserWindow({ x: at.x - 40, y: at.y - 40, width: w + 80, height: h + 80, frame: false, resizable: false, skipTaskbar: true,
      focusable: false, show: false, alwaysOnTop: true, backgroundColor: '#000000', webPreferences: { contextIsolation: true, sandbox: true } });
    await bd.loadFile(path.join(__dirname, 'backdrop.html'), { query: { mode: args.backdrop } });
    onTop(bd); bd.showInactive(); bd.moveTop();
  }
  await createWidget({ query: 'play', display: 'other', ...at });
  widget.moveTop();
  widget.showInactive();
  const run = (js) => widget.webContents.executeJavaScript(js, true);
  for (let i = 0; i < 600 && !(await run('Boolean(window.__glass && window.__glass.ready)')); i++) await sleep(50);
  const p = await placement();
  if (!p.sourceId || p.sourceId !== screenSources.get(String(display.id))) { console.log('record: the capture is not of this monitor; nothing recorded'); app.quit(); return; }
  for (let i = 0; i < 100 && !(await run('window.__glass.backdrop.frames > 5')); i++) await sleep(100);
  await sleep(1500);
  const b64 = await run(`window.__glass.record(${Number(args.seconds) || 6})`);
  const out = path.resolve(REPO, args.out || 'design/captures/raw/mercury3d/desktop.webm');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, Buffer.from(b64, 'base64'));
  console.log('recorded ' + path.relative(REPO, out) + ', ' + Math.round(fs.statSync(out).size / 1024) + ' KB');
  app.quit();
}

/* -------------------------------------------------------------------- boot --- */

app.whenReady().then(async () => {
  await ensureServer();
  if (SHOTS) { await runShots(); return; }
  if (TEST === 'passthrough') { await runPassThroughTest(); return; }
  if (TEST === 'media') { await runMediaTest(); return; }
  if (TEST === 'listen') { await runListenTest(); return; }
  if (TEST === 'drag') { await runDragTest(); return; }
  if (TEST === 'refract') { await runRefractTest(); return; }
  if (TEST === 'record') { await runRecord(); return; }
  if (TEST === 'spike') {
    await require('./spike-test.js').runSpike({ app, screen, createWidget, getWidget: () => widget, args, REPO });
    return;
  }
  if (TEST === 'gpu') {
    await require('./gpu-test.js').runGpuTest({ app, screen, createWidget, getWidget: () => widget, pickDisplay, seconds: Number(args.seconds) || 12, refract: REFRACT });
    return;
  }

  await createWidget({ x: args.x && Number(args.x), y: args.y && Number(args.y) });
  widget.showInactive();
  if (SYSTEM) { startMediaHelper(); startSoundHelper(); }
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
