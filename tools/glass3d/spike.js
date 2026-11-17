'use strict';
/**
 * The phase 2 spike: Mercury as live 3D glass (prototypes/glass3d/) in a widget-style window, photographed and
 * measured on the real GPU.
 *
 *   npx electron tools/glass3d/spike.js out=design/captures/raw/glass3d [q=<extra query>] [seconds=8] [scales=1,0.75]
 *
 * The window is the widget's kind (frameless, transparent, never focused), opened on the second monitor when there is
 * one; it is placed when it is created and never moved. The photo is the page's own pixels (capturePage), never the
 * screen. For each size it reports frames per second (the page draws every frame, no caching), the CPU time a frame
 * takes in the page, the GPU process's 3D engine share (Windows' per-process GPU Engine counters) and the whole card
 * (nvidia-smi, for context). The real mouse is not touched.
 */
const { app, BrowserWindow, screen } = require('electron');
const { execFile, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const args = Object.fromEntries(process.argv.slice(2).filter((a) => a.includes('=')).map((a) => a.split(/=(.*)/s).slice(0, 2)));
const REPO = path.resolve(__dirname, '..', '..');
const OUT = path.resolve(args.out || 'design/captures/raw/glass3d');
const PORT = 5193;
const SECONDS = Number(args.seconds) || 8;
const SCALES = (args.scales || '1,0.75').split(',').map(Number);
app.commandLine.appendSwitch('force-device-scale-factor', '1');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);
const round = (v, n = 1) => Math.round(v * 10 ** n) / 10 ** n;

function gpuEngine(pid, seconds) {
  const script = `$ErrorActionPreference = 'SilentlyContinue'
Get-Counter -Counter '\\GPU Engine(pid_${pid}_*engtype_3D)\\Utilization Percentage' -SampleInterval 1 -MaxSamples ${seconds} | ForEach-Object {
  ($_.CounterSamples | Measure-Object -Property CookedValue -Sum).Sum
}`;
  return new Promise((resolve) => execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { encoding: 'utf8' },
    (err, out) => resolve(String(out || '').split(/\r?\n/).map(Number).filter(Number.isFinite))));
}
function wholeCard() {
  const rows = []; let child = null;
  try {
    child = spawn('nvidia-smi', ['--query-gpu=utilization.gpu,power.draw', '--format=csv,noheader,nounits', '-l', '1']);
    child.on('error', () => { child = null; });
    child.stdout.on('data', (d) => { for (const line of String(d).split(/\r?\n/)) { const [u, p] = line.split(',').map(Number); if (Number.isFinite(u) && Number.isFinite(p)) rows.push([u, p]); } });
  } catch { child = null; }
  return { stop() { if (child) child.kill(); return rows.length ? { utilisation: round(mean(rows.map((r) => r[0]))), watts: round(mean(rows.map((r) => r[1]))) } : null; } };
}

app.whenReady().then(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  await require(path.join(REPO, 'prototypes', 'serve.js')).start(PORT);
  const primary = screen.getPrimaryDisplay();
  const display = screen.getAllDisplays().find((d) => d.id !== primary.id) || primary;
  const results = [];
  for (const scale of SCALES) {
    const W = Math.round(1586 * scale), H = Math.round(992 * scale);
    const win = new BrowserWindow({ x: display.workArea.x + 10, y: display.workArea.y + 10, width: W, height: H, useContentSize: true,
      show: false, frame: false, transparent: true, focusable: false, skipTaskbar: true, resizable: false,
      webPreferences: { backgroundThrottling: false, contextIsolation: true, sandbox: true } });
    const messages = [];
    win.webContents.on('console-message', (e) => { if (e.level === 'error' || e.level === 'warning') messages.push(e.message); });
    await win.loadURL(`http://127.0.0.1:${PORT}/prototypes/glass3d/?scale=${scale}${args.q ? '&' + args.q : ''}`);
    win.showInactive();
    const run = (js) => win.webContents.executeJavaScript(js, true);
    for (let i = 0; i < 400 && !(await run('Boolean(window.__glass && (window.__glass.ready || window.__glass.error))')); i++) await sleep(50);
    const err = await run('window.__glass.error');
    if (err) { console.log('page error: ' + err); app.quit(); return; }
    await sleep(1500);
    const image = await win.webContents.capturePage();
    const file = path.join(OUT, `live-${scale}.png`);
    fs.writeFileSync(file, image.toPNG());
    // Frames per second and the GPU, over the same seconds.
    const gpuPid = app.getAppMetrics().find((m) => m.type === 'GPU');
    const card = wholeCard();
    const f0 = await run('window.__glass.frames'); const t0 = Date.now();
    const engine = gpuPid ? await gpuEngine(gpuPid.pid, SECONDS) : [];
    const f1 = await run('window.__glass.frames'); const t1 = Date.now();
    const cpuMs = await run('window.__glass.cpuMs');
    const whole = card.stop();
    const r = { scale, canvas: [W, H], fps: round((f1 - f0) / ((t1 - t0) / 1000)), pageCpuMsPerFrame: round(cpuMs, 2),
      gpuProcess3dPercent: engine.length ? { mean: round(mean(engine)), max: round(Math.max(...engine)) } : 'no reading', wholeCard: whole || 'nvidia-smi not available',
      ...(messages.length ? { console: messages.slice(0, 3) } : {}) };
    console.log(JSON.stringify(r));
    results.push(r);
    win.destroy();
    await sleep(500);
  }
  fs.writeFileSync(path.join(OUT, 'measure.json'), JSON.stringify(results, null, 1));
  app.quit();
});
