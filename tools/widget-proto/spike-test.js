'use strict';
/**
 * Phase 2's spike (the 3D brief): the live 3D glass (prototypes/glass3d/) still, in the real widget window, photographed
 * and measured.
 *
 *   <jusic-redesign>/node_modules/.bin/electron tools/widget-proto/main.js test=spike page=glass3d \
 *       [frame=ref dsf=1 | dsf=1.25] [q=<page query>] [out=<folder>] [seconds=8] [tag=<name>]
 *
 * The window is the widget's own (createWidget in main.js: frameless, transparent, always on top, never focused), on
 * the other monitor only (it refuses to run without one), placed when it is created and never moved. The photo is the
 * page's own pixels (capturePage), never the screen. Readings, over the same seconds:
 *   - frames per second the page draws (it draws every frame while measuring; q=fps=60 caps it at the display's rate);
 *   - the page's own CPU time a frame;
 *   - the GPU process's share of the 3D engine (Windows' per-process "GPU Engine" counters: a game or anything else
 *     running on the card does not count);
 *   - the same once the page stops drawing (idle: nothing moves, nothing is drawn);
 *   - the whole card from nvidia-smi, for context only.
 * One JSON line is printed (Electron prints its own warnings too: do not filter out lines containing "Warning").
 * The real mouse is not touched.
 */
const { execFile, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

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

async function runSpike({ app, screen, createWidget, getWidget, args, REPO }) {
  const SECONDS = Number(args.seconds) || 8;
  const OUT = path.resolve(REPO, args.out || 'design/captures/raw/mercury3d/spike');
  fs.mkdirSync(OUT, { recursive: true });
  const primary = screen.getPrimaryDisplay();
  const other = screen.getAllDisplays().find((d) => d.id !== primary.id);
  if (!other) { console.log('spike: no second monitor; test windows stay off the main screen, so nothing was run'); app.quit(); return; }
  const area = other.workArea;
  // (motion=<kind>: the page draws only when something moves, as in use; a pretend pointer plays that interaction
  // while it is measured, then everything is left to settle and the idle reading is what the page really does then)
  const MOTION = args.motion || null;
  await createWidget({ query: MOTION ? 'play' : 'spike', display: 'other', x: area.x + 20, y: area.y + 20 });
  const win = getWidget();
  win.showInactive();
  const run = (js) => win.webContents.executeJavaScript(js, true);
  for (let i = 0; i < 600 && !(await run('Boolean(window.__glass && ((window.__glass.ready && window.__glass.formed) || window.__glass.error))')); i++) await sleep(50);
  const err = await run('window.__glass && window.__glass.error');
  if (err) { console.log('page error: ' + err); app.quit(); return; }
  await sleep(1500);
  const tag = args.tag || `${args.frame === 'ref' ? 'ref' : 'widget'}-${args.dsf || 'native'}`;
  // (with refraction on the page bends what is really on the screen: measured, never photographed)
  const file = path.join(OUT, `live-${tag}.png`);
  if (args.refract !== 'live') fs.writeFileSync(file, (await win.webContents.capturePage()).toPNG());
  const size = await run('JSON.stringify(window.__glass.size)').then(JSON.parse);
  const gpu = app.getAppMetrics().find((m) => m.type === 'GPU');
  // drawing every frame
  let card = wholeCard();
  if (MOTION) await run(`window.__glass.gaps.length = 0; window.__glass.drive(${JSON.stringify(MOTION)}, ${SECONDS + 2}); 0`);
  const f0 = await run('window.__glass.frames'); const t0 = Date.now();
  const busy = gpu ? await gpuEngine(gpu.pid, SECONDS) : [];
  const f1 = await run('window.__glass.frames'); const t1 = Date.now();
  const cpuMs = await run('window.__glass.cpuMs');
  // while it moves: the frames drawn back to back (gaps under 100 ms), their rate and how many came late (> 20 ms)
  const gaps = MOTION ? await run('JSON.stringify(window.__glass.gaps)').then(JSON.parse) : [];
  const cardBusy = card.stop();
  // idle: the page stops drawing
  // (idle=pause: the music is paused first, as the widget is when nothing plays: the colour drains, the ink runs on
  // for a few seconds and stops, and then nothing at all should be drawn; without it the music keeps the glass moving)
  if (MOTION && args.idle === 'pause') { await sleep(2500); await run('window.__glass.setPlaying(false); 0'); await sleep(7000); }
  else if (MOTION) await sleep(4500);       // the drive ends, the springs settle by themselves
  else { await run('window.__glass.paused = true; 0'); await sleep(1500); }
  const fi0 = await run('window.__glass.frames'); const ti0 = Date.now();
  card = wholeCard();
  const idle = gpu ? await gpuEngine(gpu.pid, Math.max(4, Math.round(SECONDS / 2))) : [];
  const cardIdle = card.stop();
  const fi1 = await run('window.__glass.frames'); const ti1 = Date.now();
  const info = MOTION ? await run('JSON.stringify(window.__glass.motionInfo ? window.__glass.motionInfo() : null)') : null;
  const r = {
    tag, photo: args.refract === 'live' ? 'none (refraction on)' : path.relative(REPO, file), size,
    drawing: { fps: round((f1 - f0) / ((t1 - t0) / 1000)), pageCpuMsPerFrame: round(cpuMs, 2),
      gpuProcess3dPercent: busy.length ? { mean: round(mean(busy)), max: round(Math.max(...busy)) } : 'no reading', wholeCard: cardBusy || 'nvidia-smi not available' },
    motion: MOTION || 'none (drawing every frame)',
    stillMoving: info ? JSON.parse(info) : undefined,
    whileMoving: gaps.length ? { fps: round(1000 / mean(gaps)), framesTimed: gaps.length, late: gaps.filter((g) => g > 20).length } : null,
    idle: { framesPerSecond: round((fi1 - fi0) / ((ti1 - ti0) / 1000)), gpuProcess3dPercent: idle.length ? { mean: round(mean(idle)), max: round(Math.max(...idle)) } : 'no reading', wholeCard: cardIdle || 'nvidia-smi not available' },
  };
  console.log(JSON.stringify(r));
  fs.writeFileSync(path.join(OUT, `measure-${tag}.json`), JSON.stringify(r, null, 1));
  win.destroy();
  app.quit();
}

module.exports = { runSpike };
