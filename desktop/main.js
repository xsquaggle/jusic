'use strict';
/**
 * Jusic as a desktop app: one frameless window around the same page a browser tab gets, with the
 * same server.js, unchanged, running in a process of its own. This process only owns the window
 * and answers its events; between events it does nothing.
 *
 *   electron .                 the app
 *   electron . --perf[=x,y]    a measurement run: DevTools on 127.0.0.1:9333, audio muted, and
 *                              (with a position) opened there without taking the focus
 *   electron . --unoccluded    keep rendering while covered (measurement runs behind other windows)
 */
const { app, BrowserWindow, ipcMain, Menu, nativeImage, screen, session, utilityProcess } = require('electron');
const fs = require('fs');
const net = require('net');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DATA = path.join(ROOT, 'data');
const STATE_FILE = path.join(DATA, 'desktop.json');
const flag = (name) => process.argv.find((a) => a === name || a.startsWith(name + '='));
const perf = flag('--perf');

app.setName('Jusic');
app.setAppUserModelId('jusic.desktop');
app.setPath('userData', path.join(DATA, 'electron'));       // its own profile, inside this folder
if (perf) {
  app.commandLine.appendSwitch('remote-debugging-port', '9333');
  app.commandLine.appendSwitch('remote-allow-origins', '*');
  app.commandLine.appendSwitch('mute-audio');
}
if (flag('--unoccluded')) app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');

let win = null;
let server = null;
let origin = '';

/* ---------------------------------------------------------------- server --- */

const listening = (port) => new Promise((done) => {
  const s = net.connect(port, '127.0.0.1').on('connect', () => { s.destroy(); done(true); }).on('error', () => done(false));
});

async function startServer() {
  let port = 5175;
  try { port = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8')).port || port; } catch { /* optional */ }
  if (await listening(port)) port += 1;                     // the daily app has it: stay out of its way
  fs.mkdirSync(DATA, { recursive: true });
  const log = fs.createWriteStream(path.join(DATA, 'jusic.log'), { flags: 'a' });
  log.write(`\n--- ${new Date().toISOString()} (desktop) ---\n`);
  server = utilityProcess.fork(path.join(ROOT, 'server.js'), ['--no-open', '--port', String(port)], { cwd: ROOT, stdio: 'pipe', serviceName: 'Jusic server' });
  server.stdout.pipe(log);
  server.stderr.pipe(log);
  server.once('exit', () => { server = null; app.quit(); });  // Quit in the page stops the server: follow it
  for (let i = 0; !(await listening(port)); i++) {
    if (i > 150 || !server) throw new Error('the server did not start (see data/jusic.log)');
    await new Promise((r) => setTimeout(r, 100));
  }
  origin = `http://127.0.0.1:${port}`;
}

/* ---------------------------------------------------------------- window --- */

function savedBounds() {
  let saved = {};
  try { saved = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch { /* first run */ }
  const b = { width: 1380, height: 900, ...saved };
  // Only reuse a position that is still on a screen (a monitor may have gone since).
  if (Number.isFinite(b.x) && Number.isFinite(b.y)) {
    const area = screen.getDisplayMatching(b).workArea;
    if (b.x + b.width < area.x + 80 || b.x > area.x + area.width - 80 || b.y < area.y - 10 || b.y > area.y + area.height - 80) { delete b.x; delete b.y; }
  }
  return b;
}

/** Where the window is, kept in memory as it changes and written once, on the way out. */
let placed = null;
function notePlace() { if (win && !win.isMinimized()) placed = { ...win.getNormalBounds(), maximized: win.isMaximized() }; }
function savePlace() { if (placed) try { fs.writeFileSync(STATE_FILE, JSON.stringify(placed)); } catch { /* not worth failing over */ } }

function createWindow() {
  const bounds = savedBounds();
  const at = perf && perf.includes('=') ? perf.split('=')[1].split(',').map(Number) : null;
  win = new BrowserWindow({
    ...bounds, ...(at ? { x: at[0], y: at[1], width: 1380, height: 900 } : {}),
    minWidth: 940, minHeight: 600, show: false, backgroundColor: '#120b0c',
    icon: path.join(ROOT, 'jusic.ico'), title: 'Jusic',
    // Windows keeps its own caption buttons (and Snap Layouts); the page draws the rest of the bar.
    titleBarStyle: 'hidden', titleBarOverlay: { color: '#00000000', symbolColor: '#ffffff', height: 40 },
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false },
  });
  win.once('ready-to-show', () => {
    if (bounds.maximized && !at) win.maximize();
    if (perf) win.showInactive(); else win.show();         // a measurement run never takes the focus
  });
  for (const event of ['resize', 'move', 'maximize', 'unmaximize', 'show']) win.on(event, notePlace);
  win.on('closed', () => { win = null; savePlace(); });

  const wc = win.webContents;
  wc.setWindowOpenHandler(() => ({ action: 'deny' }));
  wc.on('will-navigate', (event, url) => { if (!url.startsWith(origin)) event.preventDefault(); });
  wc.on('before-input-event', (event, input) => {             // no menu, so no reload or DevTools keys unless asked for
    if (flag('--dev') && input.type === 'keyDown' && input.key === 'F12') wc.toggleDevTools();
  });
  win.loadURL(origin + '/');
}

/** Stay local: nothing leaves this machine, and only this page may use devices. */
function lockDown() {
  const s = session.defaultSession;
  s.webRequest.onBeforeRequest((details, respond) => {
    const url = new URL(details.url);
    const local = url.origin === origin || (url.hostname === '127.0.0.1' && perf) || !/^(https?|wss?|file|ftp):$/.test(url.protocol);
    respond({ cancel: !local });
  });
  // Output device names need the "media" permission; granting it here means no microphone prompt.
  const allowed = (permission, from) => ['media', 'speaker-selection'].includes(permission) && String(from).startsWith(origin);
  s.setPermissionCheckHandler((wc, permission, from) => allowed(permission, from));
  s.setPermissionRequestHandler((wc, permission, respond, details) => respond(allowed(permission, details.requestingUrl)));
}

/* ------------------------------------------------- taskbar and title bar --- */

const glyph = (d) => nativeImage.createFromDataURL('data:image/svg+xml;base64,' + Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24"><path fill="#fff" d="${d}"/></svg>`).toString('base64'));
const ICONS = {
  prev: 'M7 6h2v12H7zM20 6v12L10 12z', next: 'M15 6h2v12h-2zM4 6l10 6L4 18z',
  play: 'M8 5v14l11-7z', pause: 'M7 5h3.5v14H7zM13.5 5H17v14h-3.5z',
};

/** The page says what is playing; the taskbar button shows it. Sent only when something changes. */
function showTransport({ playing = false, progress = -1 } = {}) {
  if (!win) return;
  win.setProgressBar(progress < 0 ? -1 : Math.max(0.001, progress), { mode: playing ? 'normal' : 'paused' });
  if (showTransport.playing === playing) return;
  showTransport.playing = playing;
  const send = (what) => () => win && win.webContents.send('transport', what);
  win.setThumbarButtons([
    { tooltip: 'Previous', icon: glyph(ICONS.prev), click: send('prev') },
    { tooltip: playing ? 'Pause' : 'Play', icon: glyph(playing ? ICONS.pause : ICONS.play), click: send('toggle') },
    { tooltip: 'Next', icon: glyph(ICONS.next), click: send('next') },
  ]);
}

ipcMain.on('transport', (event, state) => showTransport(state));
ipcMain.on('overlay', (event, color, symbolColor) => { if (win) win.setTitleBarOverlay({ color, symbolColor }); });

/* ------------------------------------------------------------- lifecycle --- */

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (win && !perf) { if (win.isMinimized()) win.restore(); win.focus(); } });
  app.on('window-all-closed', () => app.quit());
  // Closing the window quits everything. The server is asked first, so it can flush what it is still holding.
  app.on('will-quit', (event) => {
    if (!server) return;
    event.preventDefault();
    const child = server;
    child.removeAllListeners('exit');
    child.once('exit', () => { server = null; app.quit(); });
    fetch(origin + '/api/quit', { method: 'POST' }).catch(() => child.kill());
    setTimeout(() => child.kill(), 1500);
  });
  app.whenReady().then(async () => {
    Menu.setApplicationMenu(null);
    await startServer();
    lockDown();
    createWindow();
  }).catch((err) => { console.error(err); app.exit(1); });
}
