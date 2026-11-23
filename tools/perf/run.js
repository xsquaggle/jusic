'use strict';
/**
 * Runs the performance scenarios (S1 to S10: design/FABLE_PROMPT_FROSTED.md, section 6) against
 * Jusic and writes every 1-second sample to design/perf/<date>-<label>.json.
 *
 *   node tools/perf/run.js --label baseline-edge [--app edge] [--screen other|main] [--sizes default,max] [--runs 2] [--only S1,S9]
 *   node tools/perf/run.js --app electron --ui spike --page spike.html ...     another page of the app, with its own profile
 *   node tools/perf/run.js --table design/perf/a.json [design/perf/b.json]     prints the table(s)
 *
 * The number is the share of the whole machine: CPU time used by every process under the app's
 * roots in a second, divided by (1 s x logical processors). Nothing here moves the real mouse:
 * input goes through a DevTools port on 127.0.0.1 (open for these runs only) and the window is
 * sized with Win32 calls that never activate it. Unless --screen main is given, the window opens
 * on the second monitor and stays at the bottom of the window stack, under whatever the owner has
 * open, with Chromium's occlusion check off so the page still renders as it would in view. S8
 * (covered) needs that check, so it runs on its own: --occlusion on --only S8. Audio is muted at
 * the browser (--mute-audio); the audio path still runs.
 */
const { spawn, execFileSync } = require('child_process');
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');
const readline = require('readline');
const { connect, sleep } = require('./cdp');

const ROOT = path.resolve(__dirname, '..', '..');
const CPUS = os.cpus().length;
const DEBUG_PORT = 9333;
const args = process.argv.slice(2);
const arg = (name, fallback) => { const i = args.indexOf('--' + name); return i < 0 ? fallback : args[i + 1]; };
const q = JSON.stringify;
const ps = (file, list) => ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, file), ...list.map(String)];

/* ------------------------------------------------------------- the pages --- */

/** Where things are in each interface. `old` is today's app; the frosted one is added with it. */
const UI = {
  old: {
    ready: `!!document.querySelector('.row[data-id]')`,
    playing: `!document.querySelector('#audio').paused`,
    seekTo: (fromEnd) => `(() => { const a = document.querySelector('#audio'); a.currentTime = Math.max(0, a.duration - ${fromEnd}); })()`,
    row: '.row[data-id]', scroller: '#scroller', sidebar: '#sidebar', nav: '.nav-item', views: ['favorites', 'recent', 'most', 'eras', 'sessions', 'all'],
    play: '#btn-play', next: '#btn-next', seek: '#pb-seek', search: '#search', rescan: '#btn-rescan',
    eqOpen: '#btn-eq', eqTrack: '.eq-band .eq-track', eqKnob: '.eq-knob',
    // Today's app shows the spectrum beside the library, so its "focus view" is the same screen.
    focus: async (page) => {
      if (await page.eval(`document.body.classList.contains('no-rail')`)) await page.clickOn('#btn-rail');
      if (await page.eval(`document.body.classList.contains('no-viz')`)) await page.clickOn('#btn-viz');
      await page.clickOn('.rail-tab[data-tab="now"]');
    },
    library: async (page) => page.clickOn('.nav-item[data-view="all"]'),
  },
  // The stage 2 material spike (--ui spike --page spike.html): the glass with a pretend transport.
  spike: {
    ready: `!!(window.spike && 'playing' in window.spike)`,
    playing: `spike.playing`,
    seekTo: (fromEnd) => `spike.seekTo(${fromEnd})`,
    row: '.row', scroller: '#rows', sidebar: '#sidebar', play: '.bowl--play', next: '.bowl--next',
    focus: async () => {}, library: async () => {},
  },
};

/* ------------------------------------------------------------- launching --- */

const listening = (port) => new Promise((done) => {
  const s = net.connect(port, '127.0.0.1').on('connect', () => { s.destroy(); done(true); }).on('error', () => done(false));
});

const SCREEN = arg('screen', 'other');
const BEHIND = SCREEN === 'other';                               // out of the owner's way
const OCCLUSION = arg('occlusion', BEHIND ? 'off' : 'on') === 'on';
const winArgs = (op, more = []) => ps('win.ps1', ['-Op', op, '-Screen', SCREEN, ...(BEHIND ? ['-Behind'] : []), ...more]);
const powershell = (command) => execFileSync('powershell', ['-NoProfile', '-Command', command], { encoding: 'utf8' }).trim();
/** The app window's browser processes, found by the profile folder they were started with. */
const browsers = (exe) => `Get-CimInstance Win32_Process -Filter "Name='${exe}'" | Where-Object { $_.CommandLine -like '*data\\window*' -and $_.CommandLine -notlike '*--type=*' }`;

async function launchEdge() {
  const port = (await listening(5175)) ? 5176 : 5175;            // never collide with the daily app
  const server = spawn(process.execPath, ['server.js', '--no-open', '--port', String(port)], { cwd: ROOT, stdio: 'ignore' });
  for (let i = 0; !(await listening(port)); i++) { if (i > 100) throw new Error('server did not start'); await sleep(200); }
  const exe = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Google/Chrome/Application/chrome.exe'].find((p) => fs.existsSync(p));
  const name = path.basename(exe);
  const address = `http://localhost:${port}`;
  powershell(`${browsers(name)} | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }`);     // a window an interrupted run left behind
  const [x, y, front] = execFileSync('powershell', winArgs('where'), { encoding: 'utf8' }).trim().split(' ');
  spawn(exe, [`--app=${address}`, `--user-data-dir=${path.join(ROOT, 'data', 'window')}`, '--no-first-run',
    '--no-default-browser-check', '--window-size=1380,900', `--window-position=${x},${y}`, `--remote-debugging-port=${DEBUG_PORT}`,
    '--remote-allow-origins=*', '--mute-audio', ...(OCCLUSION ? [] : ['--disable-features=CalculateNativeWinOcclusion'])], { stdio: 'ignore' });
  // The process we started often hands over to another and exits (server.js says the same),
  // so the browser is found by its profile folder once it is up.
  let pid = 0;
  for (let i = 0; !pid; i++) {
    if (i > 40) throw new Error('the app window never appeared');
    await sleep(500);
    pid = Number(powershell(`(${browsers(name)} | Select-Object -First 1).ProcessId`));
  }
  const stop = () => { server.kill(); try { process.kill(pid); } catch { /* already closed */ } };
  return { address, roots: [server.pid, pid], windowPid: pid, front, ui: UI.old, exe: name, stop };
}

/** The desktop app, started the way its shortcut starts it, plus the measurement flags. */
async function launchElectron() {
  powershell(`Get-CimInstance Win32_Process -Filter "Name='electron.exe'" | Where-Object { $_.CommandLine -like '* --perf*' -and $_.CommandLine -notlike '*widget-proto*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }`);
  const [x, y] = execFileSync('powershell', winArgs('where'), { encoding: 'utf8' }).trim().split(' ');
  const child = spawn(path.join(ROOT, 'node_modules/electron/dist/electron.exe'), ['.', `--perf=${x},${y}`, ...(OCCLUSION ? [] : ['--unoccluded'])], { cwd: ROOT, stdio: 'ignore' });
  let address = '';
  for (let i = 0; !address; i++) {
    if (i > 100) throw new Error('the desktop app never opened its page');
    await sleep(300);
    try { address = new URL((await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`)).json()).find((t) => t.type === 'page' && t.url.startsWith('http://127.0.0.1:')).url).origin; } catch { /* not up yet */ }
  }
  return { address, roots: [child.pid], windowPid: child.pid, front: 0, ui: UI.old, exe: 'electron.exe', stop: () => child.kill() };
}

const LAUNCH = { edge: launchEdge, electron: launchElectron };

/* -------------------------------------------------------------- sampling --- */

function startSampler(roots) {
  const samples = [];                 // { at, pct, machine, memMB, by: Map(pid -> 100 ns used) }
  const names = new Map();
  const known = new Map();            // pid -> last cpu reading, kept for the whole run
  let last = null;
  const cpu = spawn('powershell', ps('sample.ps1', ['-Roots', roots.join(',')]), { stdio: ['ignore', 'pipe', 'inherit'] });
  readline.createInterface({ input: cpu.stdout }).on('line', (line) => {
    let s; try { s = JSON.parse(line); } catch { return; }
    let used = 0, bytes = 0;
    const by = new Map();
    for (const [pid, name, time, priv] of s.p) {
      const d = time - (known.get(pid) || 0);
      known.set(pid, time); names.set(pid, name);
      used += d; bytes += priv; by.set(pid, d);
    }
    if (last) {
      const span = (s.t - last.t) * 1e4 * CPUS;                  // 100 ns of machine time
      samples.push({ at: Date.now(), pct: (used / span) * 100, machine: ((s.sys - last.sys) / span) * 100, memMB: bytes / 1048576, by });
    }
    last = s;
  });

  const gpuRows = [];                 // { at, total, by: Map(pid -> %) }
  let columns = null;
  const gpu = spawn('typeperf', ['\\GPU Engine(*engtype_3D)\\Utilization Percentage', '-si', '1'], { stdio: ['ignore', 'pipe', 'ignore'] });
  readline.createInterface({ input: gpu.stdout }).on('line', (line) => {
    const cells = line.split('","').map((c) => c.replace(/"/g, ''));
    if (line.startsWith('"(PDH')) { columns = cells.map((c) => Number((c.match(/pid_(\d+)_/) || [])[1])); return; }
    if (!columns || cells.length !== columns.length) return;
    const by = new Map();
    let total = 0;
    for (let i = 1; i < cells.length; i++) { const v = Number(cells[i]) || 0; total += v; by.set(columns[i], (by.get(columns[i]) || 0) + v); }
    gpuRows.push({ at: Date.now(), total, by });
  });

  return { samples, gpuRows, names, stop: () => { cpu.kill(); gpu.kill(); } };
}

const stat = (list) => {
  const sorted = [...list].sort((a, b) => a - b);
  const pick = (f) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(f * sorted.length))] : 0);
  return { mean: list.reduce((a, b) => a + b, 0) / (list.length || 1), p95: pick(0.95), max: pick(1) };
};
const r2 = (n) => Math.round(n * 100) / 100;

/** What each process is, from its command line (asked once per pass, outside the measured windows). */
function processKinds() {
  const out = execFileSync('powershell', ['-NoProfile', '-Command',
    `Get-CimInstance Win32_Process -Filter "Name='msedge.exe' or Name='chrome.exe' or Name='electron.exe' or Name='node.exe'" | ForEach-Object { "$($_.ProcessId)|$($_.CommandLine)" }`], { encoding: 'utf8' });
  const kinds = new Map();
  for (const line of out.split(/\r?\n/)) {
    const [pid, cmd = ''] = line.split(/\|(.*)/s);
    const type = (cmd.match(/--utility-sub-type=([\w.]+)/) || cmd.match(/--type=([\w-]+)/) || [])[1];
    kinds.set(Number(pid), type ? type.split('.').slice(-2).join('.') : /server\.js/.test(cmd) ? 'server' : 'main');
  }
  return kinds;
}

function summarise(sampler, from, to, kinds) {
  const mine = sampler.samples.filter((s) => s.at - 900 >= from && s.at <= to + 200);
  const cpu = stat(mine.map((s) => s.pct));
  const by = new Map();
  for (const s of mine) for (const [pid, d] of s.by) by.set(pid, (by.get(pid) || 0) + d);
  const total = [...by.values()].reduce((a, b) => a + b, 0) || 1;
  const [topPid, topUsed] = [...by].sort((a, b) => b[1] - a[1])[0] || [0, 0];
  const gpu = stat(sampler.gpuRows.filter((g) => g.at >= from && g.at <= to + 200)
    .map((g) => [...g.by].reduce((sum, [pid, v]) => sum + (by.has(pid) ? v : 0), 0)));
  return {
    samples: mine.map((s) => r2(s.pct)), mean: r2(cpu.mean), p95: r2(cpu.p95), max: r2(cpu.max),
    top: `${(sampler.names.get(topPid) || '?').replace('.exe', '')} ${kinds.get(topPid) || ''} ${Math.round((topUsed / total) * 100)}%`.replace('  ', ' '),
    gpuMean: r2(gpu.mean), gpuMax: r2(gpu.max),
    memMB: Math.round(stat(mine.map((s) => s.memMB)).max), machine: r2(stat(mine.map((s) => s.machine)).mean),
  };
}

/* ------------------------------------------------------------- scenarios --- */

/** Calls fn n times at a steady rate, correcting for drift. */
async function steady(seconds, perSecond, fn) {
  const n = Math.round(seconds * perSecond);
  const started = Date.now();
  for (let i = 0; i < n; i++) { await fn(i, n); await sleep(Math.max(0, started + ((i + 1) * 1000) / perSecond - Date.now())); }
}

async function setPlaying(c, want) {
  if ((await c.page.eval(c.ui.playing)) === want) return;
  await c.page.clickOn(c.ui.play);
  await sleep(1200);
  if (want && !(await c.page.eval(c.ui.playing))) { await c.page.clickOn(c.ui.row, 0.3); await sleep(1200); }   // nothing to resume
}
const pointerOut = (c) => c.page.mouse('mouseMoved', -40, -40);

const SCENARIOS = {
  S1: { name: 'Idle, paused', seconds: 60, prep: async (c) => { await c.ui.library(c.page); await setPlaying(c, false); await pointerOut(c); } },
  S2: { name: 'Playing, library, one track change', seconds: 120,
    prep: async (c) => { await c.ui.library(c.page); await setPlaying(c, true); await c.page.eval(c.ui.seekTo(60)); await pointerOut(c); } },
  S3: { name: 'Playing, focus view + spectrum', seconds: 120,
    prep: async (c) => { await setPlaying(c, true); await c.ui.focus(c.page); await c.page.eval(c.ui.seekTo(170)); await pointerOut(c); },
    after: async (c) => c.ui.library(c.page) },
  S4: { name: 'Playing, visible, another app focused', seconds: 60,
    prep: async (c) => { await setPlaying(c, true); await c.page.eval(c.ui.seekTo(110)); await pointerOut(c); } },
  S5: { name: 'Interacting while playing', seconds: 60,
    prep: async (c) => { await c.ui.library(c.page); await setPlaying(c, true); await c.page.eval(c.ui.seekTo(170)); },
    run: async ({ page, ui }) => {
      const [sx, sy] = await page.at(ui.scroller);
      const distance = await page.eval(`(() => { const s = document.querySelector(${q(ui.scroller)}); return s.scrollHeight - s.clientHeight; })()`);
      await steady(20, 60, (i, n) => page.wheel(sx, sy, distance / n));                      // the whole library
      await page.eval(`document.querySelector(${q(ui.scroller)}).scrollTop = 0`);
      await sleep(300);
      const [rx, ry] = await page.at(ui.row, 0.4);
      const [bx] = await page.at(ui.sidebar, 0.5, 0.5);
      const low = (await page.eval('innerHeight')) - 150;
      await page.sweep([[rx, ry], [rx, low], [bx, low], [bx, 110], [rx, ry], [rx, low]], 10);  // rows and the sidebar
      for (let i = 0; i < 10; i++) {                                                          // the track menu
        const [x, y] = await page.at(ui.row, 0.3 + (i % 3) * 0.1);
        await page.click(x, y, 'right'); await sleep(350);
        await page.key('Escape', 'Escape', 27); await sleep(250);
      }
      const [a, y] = await page.at(ui.seek, 0.2);                                             // the seek bead
      const [b] = await page.at(ui.seek, 0.8);
      await page.mouse('mousePressed', a, y, { button: 'left', buttons: 1, clickCount: 1 });
      await page.sweep([[a, y], [b, y], [a, y], [b, y], [(a + b) / 2, y]], 5, { button: 'left', buttons: 1 });
      await page.mouse('mouseReleased', (a + b) / 2, y, { button: 'left', clickCount: 1 });
      await page.clickOn(ui.eqOpen); await sleep(700);                                        // four EQ bands, put back where they were
      const bands = await page.eval(`[...document.querySelectorAll(${q(ui.eqTrack)})].slice(0, 4).map((t) => { const r = t.getBoundingClientRect(), k = t.querySelector(${q(ui.eqKnob)}).getBoundingClientRect(); return [r.left + r.width / 2, r.top + 8, r.bottom - 8, k.top + k.height / 2]; })`);
      for (const [x, top, bottom, home] of bands) {
        await page.mouse('mousePressed', x, home, { button: 'left', buttons: 1, clickCount: 1 });
        await page.sweep([[x, home], [x, top], [x, bottom], [x, home]], 1.15, { button: 'left', buttons: 1 });
        await page.mouse('mouseReleased', x, home, { button: 'left', clickCount: 1 });
      }
      await page.key('Escape', 'Escape', 27); await sleep(400);
      await page.send('Emulation.setFocusEmulationEnabled', { enabled: true });               // typing needs a focused page; only here,
      await page.clickOn(ui.search); await page.type('night drive', 8); await sleep(500);      // because it also hides "hidden" from the page
      await page.key('Escape', 'Escape', 27); await sleep(300);
      await page.send('Emulation.setFocusEmulationEnabled', { enabled: false });
      for (let i = 0; i < 10; i++) { await page.clickOn(`${ui.nav}[data-view="${ui.views[i % ui.views.length]}"]`); await sleep(550); }
      await ui.library(page);
    } },
  S6: { name: 'Resizing while playing', seconds: 40,
    prep: async (c) => { await setPlaying(c, true); await c.page.eval(c.ui.seekTo(120)); },
    op: ['resize', '-Seconds', 20, '-Count', 10] },
  S7: { name: 'Minimised, playing', seconds: 60, hidden: true,
    prep: async (c) => { await setPlaying(c, true); await c.page.eval(c.ui.seekTo(150)); await c.win('min'); },
    after: (c) => c.restore() },
  S8: { name: 'Fully covered, playing', seconds: 60, hidden: true,
    prep: async (c) => { await setPlaying(c, true); await c.page.eval(c.ui.seekTo(150)); },
    op: ['cover', '-Seconds', 62] },
  S9: { name: 'Ten track changes, one a second', seconds: 15,
    prep: async (c) => { await c.ui.library(c.page); await setPlaying(c, true); },
    run: (c) => steady(10, 1, () => c.page.clickOn(c.ui.next)) },
  S10: { name: 'Rescan library', seconds: 10,
    prep: async (c) => { await c.ui.library(c.page); await setPlaying(c, true); await c.page.eval(c.ui.seekTo(150)); },
    run: async (c) => {
      await c.page.clickOn(c.ui.rescan);
      const started = Date.now();
      do await sleep(500); while (await c.page.eval(`document.querySelector(${q(c.ui.rescan)}).disabled`));
      c.note(`scan took ${((Date.now() - started) / 1000).toFixed(1)} s`);
      await sleep(4000);                                             // the list re-rendering afterwards
    } },
  // The browser's own floor for resizing: the same window on an empty dark page.
  S6E: { name: 'Resizing an empty dark page (control)', seconds: 40,
    prep: async (c) => { await c.page.send('Page.navigate', { url: 'data:text/html,<title>empty</title><body style="background:%2314100f">' }); await sleep(1500); },
    op: ['resize', '-Seconds', 20, '-Count', 10],
    after: async (c) => { await c.page.send('Page.navigate', { url: c.address }); await c.waitReady(); } },
};

/* ------------------------------------------------------------------- run --- */

async function run() {
  const label = arg('label', 'run');
  const sizes = arg('sizes', 'default,max').split(',');
  const runs = Number(arg('runs', 2));
  const only = arg('only', '') ? arg('only').split(',') : Object.keys(SCENARIOS);
  const scale = Number(arg('scale', 1));                          // --scale 0.2: a quick smoke test, not a measurement
  const app = await LAUNCH[arg('app', 'edge')]();
  process.on('exit', app.stop);                                   // never leave the test server behind
  const page = await connect(DEBUG_PORT, (t) => t.url.startsWith(app.address));
  const ui = UI[arg('ui', 'old')];
  const home = app.address + (arg('page') ? '/' + arg('page') : '');
  if (arg('page')) await page.send('Page.navigate', { url: home });
  const sampler = startSampler(app.roots);
  const report = { label, app: arg('app', 'edge'), exe: app.exe, date: new Date().toISOString(), cpus: CPUS, results: [],
    conditions: { devtools: 'attached on 127.0.0.1:' + DEBUG_PORT, audio: '--mute-audio (the audio path runs; the speakers are silent)',
      screen: SCREEN === 'other' ? 'the second monitor (the owner was using the main one)' : 'the main monitor',
      focus: 'the window was never the active one (the keyboard focus stayed with the owner)',
      stacking: BEHIND ? `under the owner's windows${OCCLUSION ? '' : ", with Chromium's occlusion check off so the page rendered as if in view"}` : 'in view' } };
  const c = {
    page, ui, address: home, notes: [],
    note: (text) => c.notes.push(text),
    /** Runs a window op. The promise settles when it ends; its .up settles when the op says its measured part has begun. */
    win: (op, ...more) => {
      const child = spawn('powershell', winArgs(op, ['-ProcId', app.windowPid, ...more]), { stdio: ['ignore', 'pipe', 'inherit'] });
      const ended = new Promise((done, fail) => child.on('exit', (code) => (code ? fail(new Error(`win.ps1 ${op} failed`)) : done())));
      ended.up = Promise.race([ended, new Promise((up) => child.stdout.on('data', up))]);
      return ended;
    },
    restore: async () => { await c.win('place'); if (c.size === 'max') await c.win('max'); },
    waitReady: async () => { for (let i = 0; !(await page.eval(ui.ready).catch(() => false)); i++) { if (i > 150) throw new Error('the app never became ready'); await sleep(200); } },
  };
  try {
    await c.win('place', '-Back', app.front);                       // on the right screen, and the focus handed back
    await c.waitReady();
    await sleep(Number(arg('warm', 20)) * 1000);                    // let a fresh browser profile settle
    const idle = sampler.samples.slice(-5);
    report.conditions.machineBefore = `${r2(stat(idle.map((s) => s.machine - s.pct)).mean)}% of the machine busy with other things`;
    report.conditions.gpuBefore = `${r2(stat(sampler.gpuRows.slice(-5).map((g) => g.total)).mean)}% summed over every process's 3D engines`;
    for (const size of sizes) {
      c.size = size;
      await c.restore();
      await sleep(1500);
      report.conditions[size] = await page.eval(`innerWidth + ' x ' + innerHeight + ' CSS px (window ' + outerWidth + ' x ' + outerHeight + '), scale ' + devicePixelRatio + ', screen ' + screen.width + ' x ' + screen.height`);
      const seen = (await page.eval('document.visibilityState')) === 'visible';
      if (seen) report.conditions.refresh = (await page.eval(`new Promise((done) => { let n = 0; const t = performance.now(); const f = () => (++n < 120 ? requestAnimationFrame(f) : done(Math.round(120000 / (performance.now() - t)))); requestAnimationFrame(f); })`)) + ' Hz (frames a second the page is offered)';
      fs.mkdirSync(path.join(ROOT, 'design/captures/raw'), { recursive: true });
      if (seen) await page.screenshot(path.join(ROOT, `design/captures/raw/perf-${label}-${size}.png`));
      for (let n = 1; n <= runs; n++) {
        for (const id of only) {
          const s = SCENARIOS[id];
          if (size === 'max' && id.startsWith('S6')) continue;       // S6 sets its own sizes
          if (BEHIND && OCCLUSION !== (id === 'S8')) continue;       // under other windows, S8 needs the occlusion check and the rest need it off
          c.notes = [];
          if (s.prep) await s.prep(c);
          await sleep(2000);
          const op = s.op ? c.win(...s.op) : null;
          if (op) await op.up;
          const from = Date.now();
          if (s.run) await s.run(c);
          await sleep(Math.max(0, from + s.seconds * scale * 1000 - Date.now()));
          const to = Date.now();
          const state = await page.eval('document.visibilityState').catch(() => 'unknown');
          if (state !== (s.hidden ? 'hidden' : 'visible')) c.note(`INVALID: the page was ${state}`);
          await sleep(1200);                                         // the last sample lands
          if (op) await op;
          if (s.after) await s.after(c);
          const result = { id, name: s.name, size, run: n, seconds: Math.round((to - from) / 1000), ...summarise(sampler, from, to, processKinds()), notes: c.notes.join('; ') };
          report.results.push(result);
          console.log(`${id.padEnd(4)} ${size.padEnd(7)} run ${n}  mean ${String(result.mean).padStart(5)}  p95 ${String(result.p95).padStart(5)}  max ${String(result.max).padStart(5)}  gpu ${result.gpuMean}/${result.gpuMax}  ${result.memMB} MB  top: ${result.top}  ${result.notes}`);
        }
      }
    }
  } finally {
    sampler.stop();
    // The report first: Electron closes without replying to Browser.close, and waiting on that
    // reply with nothing else pending once ended the run before anything was written.
    setTimeout(() => { app.stop(); process.exit(0); }, 4000).unref();
    fs.mkdirSync(path.join(ROOT, 'design/perf'), { recursive: true });
    const file = path.join(ROOT, 'design/perf', `${report.date.slice(0, 10)}-${label}.json`);
    fs.writeFileSync(file, JSON.stringify(report, null, 1).replace(/\n\s+(-?[\d.]+,?)(?=\n)/g, ' $1'));
    console.log('\nwrote ' + path.relative(ROOT, file) + '\n\n' + table(report));
    await Promise.race([page.send('Browser.close').catch(() => {}), sleep(1500)]);
    app.stop();
  }
}

/** The worse of the runs for each scenario and size, as a Markdown table. */
function table(report) {
  const worst = new Map();
  for (const r of report.results) { const key = r.id + ' ' + r.size; if (!worst.has(key) || r.max > worst.get(key).max) worst.set(key, r); }
  const rows = [...worst.values()].map((r) => `| ${r.id} ${r.name} | ${r.size} | ${r.mean} | ${r.p95} | ${r.max}${r.max > 10 ? ' **over 10**' : r.max > 7 ? ' *over 7*' : r.max > 5 ? ' (over 5)' : ''} | ${r.top} | ${r.gpuMean} / ${r.gpuMax} | ${r.memMB} | ${r.notes || ''} |`);
  return [`**${report.label}** (${report.exe}, ${report.date.slice(0, 16).replace('T', ' ')} UTC; % of the whole machine, ${report.cpus} logical processors; worse of the runs)`, '',
    '| Scenario | Size | Mean | p95 | Max 1 s | Busiest process | GPU 3D mean / max | Memory MB | Notes |', '|---|---|---|---|---|---|---|---|---|', ...rows].join('\n');
}

if (args[0] === '--table') { for (const file of args.slice(1)) console.log(table(JSON.parse(fs.readFileSync(file, 'utf8'))) + '\n'); }
else run().then(() => process.exit(0), (err) => { console.error(err); process.exit(1); });   // exit even if a child is still open
