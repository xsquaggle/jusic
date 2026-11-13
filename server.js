'use strict';
/**
 * jusic - a local music server.
 * Serves the library index, cached cover art, range-streamed audio, and the player UI.
 * Binds to localhost only; nothing leaves this machine.
 */

const fs = require('fs');
const fsp = require('fs/promises');
const http = require('http');
const path = require('path');
const { URL } = require('url');

const { Library } = require('./lib/library');

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const PUBLIC_DIR = path.join(ROOT, 'public');
const STATE_FILE = path.join(DATA_DIR, 'state.json');
const THUMB_DIR = path.join(DATA_DIR, 'thumbs');
const COLORS_FILE = path.join(DATA_DIR, 'colors.json');

function loadConfig() {
  const defaults = { musicDir: 'Z:/jusic', port: 5175, host: '127.0.0.1', open: true, app: false, autoExit: false };
  let fileConfig = {};
  try {
    fileConfig = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));
  } catch { /* config.json is optional */ }
  const env = {};
  if (process.env.JUSIC_DIR) env.musicDir = process.env.JUSIC_DIR;
  if (process.env.PORT) env.port = Number(process.env.PORT);
  const cfg = { ...defaults, ...fileConfig, ...env };

  // CLI: node server.js [musicDir] [--port N] [--no-open] [--app]
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--port') cfg.port = Number(args[++i]);
    else if (args[i] === '--no-open') cfg.open = false;
    else if (args[i] === '--app') cfg.app = true;
    else if (args[i] === '--auto-exit') cfg.autoExit = true;
    else if (!args[i].startsWith('--')) cfg.musicDir = args[i];
  }
  cfg.musicDir = path.resolve(cfg.musicDir);
  return cfg;
}

const config = loadConfig();
const library = new Library({ root: config.musicDir, dataDir: DATA_DIR });

/* ---------------------------------------------------------------- state --- */

const DEFAULT_STATE = {
  favorites: [],
  playCounts: {},
  lastPlayed: {},
  playlists: [],
  settings: {},
  recent: [],
  resume: null,
};
let state = { ...DEFAULT_STATE };
let stateTimer = null;

async function loadState() {
  try {
    const raw = JSON.parse(await fsp.readFile(STATE_FILE, 'utf8'));
    state = { ...DEFAULT_STATE, ...raw };
  } catch { /* first run */ }
}

/** Written synchronously so it can also run on the way out. */
function saveStateNow() {
  try {
    const tmp = STATE_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
    fs.renameSync(tmp, STATE_FILE);
  } catch (err) {
    console.error('could not save state:', err.message);
  }
}

function queueStateSave() {
  if (stateTimer) return;
  stateTimer = setTimeout(() => {
    stateTimer = null;
    saveStateNow();
  }, 400);
}

/* -------------------------------------------------------------- artwork --- */

/**
 * Embedded covers in this library average ~650 KB, which is far too heavy for a
 * scrolling list. The browser downsamples each cover once and posts the result
 * back here, together with the dominant colour the UI themes itself with.
 */
let colors = {};
let colorsTimer = null;

async function loadColors() {
  try {
    colors = JSON.parse(await fsp.readFile(COLORS_FILE, 'utf8'));
  } catch { /* built lazily as thumbnails arrive */ }
}

function saveColorsNow() {
  try {
    const tmp = COLORS_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(colors));
    fs.renameSync(tmp, COLORS_FILE);
  } catch (err) {
    console.error('could not save colours:', err.message);
  }
}

function queueColorsSave() {
  if (colorsTimer) return;
  colorsTimer = setTimeout(() => {
    colorsTimer = null;
    saveColorsNow();
  }, 1500);
}

const ART_NAME = /^[a-f0-9]{6,32}\.(jpg|jpeg|png|gif|webp|bmp)$/i;

function thumbPath(artName) {
  return path.join(THUMB_DIR, artName.replace(/\.[a-z]+$/i, '') + '.jpg');
}

/* ------------------------------------------------------------ app window --- */

/**
 * Desktop-app mode.
 *
 * A Chromium browser started with `--app` gives a plain window with no tabs or
 * address bar. The process we spawn is *not* a reliable stand-in for the window
 * though: Chromium frequently hands the URL to another instance of the same
 * profile and exits straight away, so watching for the child to exit reports
 * "closed" while the window is still on screen. Whether anyone is still around
 * is answered by the live connections below instead.
 */
const CHROMIUM_CANDIDATES = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  (process.env.LOCALAPPDATA || '') + '/Google/Chrome/Application/chrome.exe',
  (process.env.LOCALAPPDATA || '') + '/Microsoft/Edge/Application/msedge.exe',
  (process.env.PROGRAMFILES || '') + '/BraveSoftware/Brave-Browser/Application/brave.exe',
];

function findChromium() {
  for (const candidate of CHROMIUM_CANDIDATES) {
    const full = path.normalize(candidate);
    try {
      if (fs.existsSync(full)) return full;
    } catch { /* unreadable path: try the next one */ }
  }
  return null;
}

function openInDefaultBrowser(address) {
  const { spawn } = require('child_process');
  try {
    if (process.platform === 'win32') spawn('cmd', ['/c', 'start', '', address], { detached: true, stdio: 'ignore' }).unref();
    else if (process.platform === 'darwin') spawn('open', [address], { detached: true, stdio: 'ignore' }).unref();
    else spawn('xdg-open', [address], { detached: true, stdio: 'ignore' }).unref();
  } catch { /* opening a browser is a convenience, not a requirement */ }
}

/**
 * @returns {boolean} true when we own the window and will exit with it.
 */
function appWindowArgs(address) {
  const profile = path.join(DATA_DIR, 'window');
  const args = [
    `--app=${address}`,
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
  ];
  // Only size the window the very first time. After that the profile remembers
  // where you put it, and forcing a size every launch would undo that.
  if (!fs.existsSync(profile)) args.push('--window-size=1380,900');
  return args;
}

function openAppWindow(address) {
  const browser = findChromium();
  if (!browser) return false;

  const { spawn } = require('child_process');
  const child = spawn(browser, appWindowArgs(address), { stdio: 'ignore' });

  child.on('error', () => openInDefaultBrowser(address));
  // Its exit tells us nothing on its own; the idle check decides from here.
  child.on('exit', () => watchIdle());
  child.unref();
  return true;
}

let shuttingDown = false;
function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  // Flush anything still sitting in a debounce before the process goes away.
  if (stateTimer) { clearTimeout(stateTimer); stateTimer = null; saveStateNow(); }
  if (colorsTimer) { clearTimeout(colorsTimer); colorsTimer = null; saveColorsNow(); }
  // Event streams would otherwise hold the server open indefinitely.
  for (const client of liveClients) {
    try { client.end(); } catch { /* already gone */ }
  }
  liveClients.clear();
  server.close();
  setTimeout(() => process.exit(0), 200);
}

/* ---------------------------------------------------------- live clients --- */

/**
 * Open pages hold an EventSource here. A socket drops the instant its tab
 * closes, which makes this a reliable "is anyone still listening" signal even
 * when the app window is minimised and timers are throttled.
 */
const liveClients = new Set();
let idleTimer = null;
let sawClient = false;

function watchIdle() {
  if (!config.autoExit) return;
  clearTimeout(idleTimer);
  if (liveClients.size > 0) return;
  // A reload drops the stream and reopens it a moment later, so wait long
  // enough that refreshing the page never takes the server down with it.
  idleTimer = setTimeout(() => {
    if (liveClients.size === 0 && sawClient) {
      console.log('  last window closed - stopping jusic');
      shutdown();
    }
  }, 12000);
}

function handleLive(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-store',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write('retry: 2000\n\n');
  res.write(`event: hello\ndata: ${JSON.stringify({ pid: process.pid })}\n\n`);

  liveClients.add(res);
  sawClient = true;
  clearTimeout(idleTimer);

  // Keep the connection from being reaped by an idle timeout somewhere.
  const ping = setInterval(() => res.write(': ping\n\n'), 25000);
  const drop = () => {
    clearInterval(ping);
    liveClients.delete(res);
    watchIdle();
  };
  req.on('close', drop);
  req.on('error', drop);
  res.on('error', drop);
}

/* --------------------------------------------------------------- helpers --- */

const STATIC_TYPES = {
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Cache-Control': 'no-store',
  });
  res.end(payload);
}

function readBody(req, limit = 4 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on('data', (c) => {
      total += c.length;
      if (total > limit) { reject(new Error('payload too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

/** Stream a file with HTTP range support, which is what makes seeking work. */
function serveFile(req, res, filePath, { contentType, cacheControl, download }) {
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
      return;
    }

    const headers = {
      'Content-Type': contentType || STATIC_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Accept-Ranges': 'bytes',
      'Last-Modified': stat.mtime.toUTCString(),
      'Cache-Control': cacheControl || 'no-cache',
    };
    if (download) {
      headers['Content-Disposition'] = 'attachment; filename*=UTF-8\'\'' + encodeURIComponent(download);
    }

    const range = req.headers.range;
    if (range) {
      const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
      if (m) {
        let start = m[1] === '' ? null : Number(m[1]);
        let end = m[2] === '' ? null : Number(m[2]);
        if (start === null && end !== null) {          // suffix range: last N bytes
          start = Math.max(0, stat.size - end);
          end = stat.size - 1;
        } else if (start !== null && end === null) {
          end = stat.size - 1;
        }
        if (start === null || start >= stat.size || start > end) {
          res.writeHead(416, { 'Content-Range': 'bytes */' + stat.size });
          res.end();
          return;
        }
        end = Math.min(end, stat.size - 1);
        headers['Content-Range'] = `bytes ${start}-${end}/${stat.size}`;
        headers['Content-Length'] = end - start + 1;
        res.writeHead(206, headers);
        if (req.method === 'HEAD') { res.end(); return; }
        const stream = fs.createReadStream(filePath, { start, end });
        stream.on('error', () => res.destroy());
        res.on('close', () => stream.destroy());
        stream.pipe(res);
        return;
      }
    }

    headers['Content-Length'] = stat.size;
    res.writeHead(200, headers);
    if (req.method === 'HEAD') { res.end(); return; }
    const stream = fs.createReadStream(filePath);
    stream.on('error', () => res.destroy());
    res.on('close', () => stream.destroy());
    stream.pipe(res);
  });
}

function serveStatic(req, res, pathname) {
  const rel = pathname === '/' ? 'index.html' : decodeURIComponent(pathname).replace(/^\/+/, '');
  const full = path.resolve(PUBLIC_DIR, rel);
  if (!full.startsWith(PUBLIC_DIR)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }
  serveFile(req, res, full, { cacheControl: 'no-cache' });
}

/* ----------------------------------------------------------------- routes --- */

async function handleApi(req, res, url) {
  const route = url.pathname.replace(/^\/api\//, '');

  // Long-lived stream; must not go through the JSON helpers.
  if (route === 'live' && req.method === 'GET') {
    handleLive(req, res);
    return;
  }

  if (route === 'quit' && req.method === 'POST') {
    sendJson(res, 200, { ok: true });
    setTimeout(shutdown, 60);
    return;
  }

  if (route === 'library' && req.method === 'GET') {
    if (!library.scannedAt) await library.scan();
    sendJson(res, 200, {
      root: config.musicDir,
      scannedAt: library.scannedAt,
      count: library.tracks.length,
      tracks: library.tracks,
    });
    return;
  }

  if (route === 'scan' && req.method === 'POST') {
    const result = await library.scan({ force: url.searchParams.get('force') === '1' });
    sendJson(res, 200, { ok: true, ...result, scannedAt: library.scannedAt });
    return;
  }

  if (route === 'scan' && req.method === 'GET') {
    sendJson(res, 200, { scanning: Boolean(library.scanning), progress: library.progress });
    return;
  }

  if (route === 'state' && req.method === 'GET') {
    sendJson(res, 200, state);
    return;
  }

  if (route === 'state' && (req.method === 'PUT' || req.method === 'POST')) {
    try {
      const patch = JSON.parse(await readBody(req));
      state = { ...state, ...patch };
      queueStateSave();
      sendJson(res, 200, { ok: true });
    } catch (err) {
      sendJson(res, 400, { error: err.message });
    }
    return;
  }

  if (route.startsWith('art/')) {
    const name = path.basename(decodeURIComponent(route.slice(4)));
    if (!ART_NAME.test(name)) { res.writeHead(404); res.end('Not found'); return; }
    // Filenames are content hashes, so these can be cached forever.
    serveFile(req, res, path.join(DATA_DIR, 'art', name), { cacheControl: 'public, max-age=31536000, immutable' });
    return;
  }

  // Manifest of which covers already have a thumbnail, plus their palette.
  if (route === 'thumbs' && req.method === 'GET') {
    let have = [];
    try {
      have = (await fsp.readdir(THUMB_DIR)).map((f) => f.replace(/\.jpg$/, ''));
    } catch { /* no thumbnails generated yet */ }
    sendJson(res, 200, { have, colors });
    return;
  }

  if (route.startsWith('thumb/')) {
    const name = path.basename(decodeURIComponent(route.slice(6)));
    if (!ART_NAME.test(name)) { res.writeHead(404); res.end('Not found'); return; }

    if (req.method === 'GET') {
      serveFile(req, res, thumbPath(name), {
        contentType: 'image/jpeg',
        cacheControl: 'public, max-age=31536000, immutable',
      });
      return;
    }

    if (req.method === 'PUT' || req.method === 'POST') {
      try {
        const { dataUrl, color, palette } = JSON.parse(await readBody(req));
        const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl || '');
        if (!m) { sendJson(res, 400, { error: 'expected a base64 JPEG data URL' }); return; }
        await fsp.mkdir(THUMB_DIR, { recursive: true });
        await fsp.writeFile(thumbPath(name), Buffer.from(m[1], 'base64'));
        if (color) {
          colors[name.replace(/\.[a-z]+$/i, '')] = { color, palette: palette || [] };
          queueColorsSave();
        }
        sendJson(res, 200, { ok: true });
      } catch (err) {
        sendJson(res, 400, { error: err.message });
      }
      return;
    }
  }

  if (route.startsWith('audio/')) {
    const id = decodeURIComponent(route.slice(6)).replace(/\.[a-z0-9]+$/i, '');
    const track = library.get(id);
    if (!track) { res.writeHead(404); res.end('Unknown track'); return; }
    const full = library.absPath(track);
    if (!full) { res.writeHead(403); res.end('Forbidden'); return; }
    serveFile(req, res, full, {
      contentType: track.mime,
      cacheControl: 'private, max-age=86400',
      download: url.searchParams.get('download') === '1' ? path.basename(track.file) : null,
    });
    return;
  }

  if (route === 'reveal' && req.method === 'POST') {
    try {
      const { id } = JSON.parse(await readBody(req));
      const track = library.get(id);
      const full = track && library.absPath(track);
      if (!full) { sendJson(res, 404, { error: 'Unknown track' }); return; }
      const { spawn } = require('child_process');
      if (process.platform === 'win32') spawn('explorer.exe', ['/select,', path.win32.normalize(full)], { detached: true, stdio: 'ignore' }).unref();
      else if (process.platform === 'darwin') spawn('open', ['-R', full], { detached: true, stdio: 'ignore' }).unref();
      else spawn('xdg-open', [path.dirname(full)], { detached: true, stdio: 'ignore' }).unref();
      sendJson(res, 200, { ok: true });
    } catch (err) {
      sendJson(res, 400, { error: err.message });
    }
    return;
  }

  sendJson(res, 404, { error: 'No such endpoint: ' + route });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/api/')) {
    handleApi(req, res, url).catch((err) => {
      console.error(err);
      if (!res.headersSent) sendJson(res, 500, { error: err.message });
    });
    return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405); res.end('Method not allowed'); return;
  }
  serveStatic(req, res, url.pathname);
});

/**
 * Desktop-app launches must not leave a console window sitting in the taskbar.
 * Windows always gives `node.exe` a console, so the first process immediately
 * relaunches itself hidden and detached, then gets out of the way. Output goes
 * to data/jusic.log since there is no longer a terminal to print to.
 *
 * @returns {boolean} true if this process handed off and should stop here.
 */
function detachIfNeeded() {
  if (!config.app || process.env.JUSIC_DETACHED === '1' || process.platform !== 'win32') return false;

  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const log = fs.openSync(path.join(DATA_DIR, 'jusic.log'), 'a');
    fs.writeSync(log, `\n--- ${new Date().toISOString()} ---\n`);

    const child = require('child_process').spawn(
      process.execPath,
      [__filename, ...process.argv.slice(2)],
      {
        cwd: ROOT,
        detached: true,
        windowsHide: true,
        stdio: ['ignore', log, log],
        env: { ...process.env, JUSIC_DETACHED: '1' },
      },
    );
    child.unref();
    return true;
  } catch (err) {
    // If the hand-off fails, carry on in this process rather than not starting.
    console.error('could not detach, running in the foreground:', err.message);
    return false;
  }
}

async function main() {
  if (detachIfNeeded()) return;

  if (!fs.existsSync(config.musicDir)) {
    console.error('\n  Music folder not found: ' + config.musicDir);
    console.error('  Point jusic somewhere else with:  node server.js "D:/path/to/music"\n');
    process.exit(1);
  }

  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(THUMB_DIR, { recursive: true });
  await loadState();
  await loadColors();
  await library.init();

  server.listen(config.port, config.host, async () => {
    const address = `http://localhost:${config.port}`;
    console.log('');
    console.log('  jusic  ' + address);
    console.log('  library: ' + config.musicDir);

    if (!library.scannedAt) {
      console.log('  scanning for the first time...');
      const result = await library.scan();
      console.log(`  indexed ${result.count} tracks in ${(result.ms / 1000).toFixed(1)}s`);
    } else {
      console.log(`  ${library.tracks.length} tracks cached - checking for changes...`);
      const result = await library.scan();
      console.log(`  ready: ${result.count} tracks (${(result.ms / 1000).toFixed(1)}s)`);
    }
    console.log('');

    if (config.app) {
      // The app quits with its last window, tracked by live connections.
      config.autoExit = true;
      if (openAppWindow(address)) {
        console.log('  running as a desktop app - close the window to quit');
      } else {
        console.log('  no Chrome or Edge found - opening your default browser');
        openInDefaultBrowser(address);
      }
      // If a window never appears at all, don't leave a stray process behind.
      setTimeout(() => {
        if (!sawClient) {
          console.log('  nothing ever connected - stopping jusic');
          shutdown();
        }
      }, 90000).unref();
    } else if (config.open) {
      openInDefaultBrowser(address);
    }
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      const address = `http://localhost:${config.port}`;
      if (config.app) {
        // jusic is already running: just raise a window against it and step aside.
        console.log('  jusic is already running - opening another window');
        const browser = findChromium();
        if (browser) {
          require('child_process')
            .spawn(browser, appWindowArgs(address), { detached: true, stdio: 'ignore' })
            .unref();
        } else {
          openInDefaultBrowser(address);
        }
        process.exit(0);
      }
      console.error(`\n  Port ${config.port} is already in use - jusic may already be running.`);
      console.error(`  Open ${address} or start with --port 5176\n`);
      process.exit(1);
    }
    throw err;
  });
}

for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(signal, () => {
    console.log('');
    shutdown();
  });
}

main();
