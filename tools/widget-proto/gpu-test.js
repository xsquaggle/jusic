'use strict';
/**
 * How much of the graphics card the widget window uses: idle, playing, and hidden.
 *
 *   npx electron tools/widget-proto/main.js test=gpu [dsf=1.25] [seconds=12] [display=primary]
 *
 * Two readings per phase:
 *   - this window's own share: Windows' per-process "GPU Engine" counters for the Electron GPU
 *     process (3D engine), so a game or anything else running does not count;
 *   - the whole card, from nvidia-smi, for context only.
 * The real mouse is not touched. Audio is muted.
 */
const { execFile, spawn } = require('child_process');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);
const round = (v, n = 1) => Math.round(v * 10 ** n) / 10 ** n;

/** Per-second readings of one process's share of the 3D engine, in percent. */
function processGpu(pid, seconds) {
  const script = `$ErrorActionPreference = 'SilentlyContinue'
$s = Get-Counter '\\GPU Engine(pid_${pid}_*engtype_3D)\\Utilization Percentage' -SampleInterval 1 -MaxSamples ${seconds}
$v = $s | ForEach-Object { ($_.CounterSamples | Measure-Object CookedValue -Sum).Sum }
if ($v) { ($v | ForEach-Object { [math]::Round($_, 3) }) -join ',' } else { 'none' }`;
  return new Promise((resolve) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { encoding: 'utf8' }, (err, out) => {
      const text = String(out || '').trim();
      resolve(text && text !== 'none' ? text.split(',').map(Number).filter((n) => Number.isFinite(n)) : []);
    });
  });
}

/** Whole-card utilisation and power once a second, until stop() is called. */
function wholeCard() {
  const rows = [];
  let child = null;
  try {
    child = spawn('nvidia-smi', ['--query-gpu=utilization.gpu,power.draw', '--format=csv,noheader,nounits', '-l', '1']);
    child.on('error', () => { child = null; });
    child.stdout.on('data', (d) => {
      for (const line of String(d).split(/\r?\n/)) {
        const [u, p] = line.split(',').map((x) => Number(x));
        if (Number.isFinite(u) && Number.isFinite(p)) rows.push([u, p]);
      }
    });
  } catch { child = null; }
  return {
    stop() {
      if (child) child.kill();
      return rows.length ? { utilisation: round(mean(rows.map((r) => r[0]))), watts: round(mean(rows.map((r) => r[1]))) } : null;
    },
  };
}

async function runGpuTest({ app, screen, createWidget, getWidget, pickDisplay, seconds = 12 }) {
  const display = pickDisplay('other');
  const primary = screen.getPrimaryDisplay();
  await createWidget({ query: '', x: display.workArea.x + 80, y: display.workArea.y + 80 });
  const widget = getWidget();
  widget.webContents.setAudioMuted(true);
  const run = (js) => widget.webContents.executeJavaScript(js, true);
  const gpuPid = () => (app.getAppMetrics().find((m) => m.type === 'GPU') || {}).pid;
  const cpu = () => {
    const m = app.getAppMetrics();
    const of = (pred) => round(m.filter(pred).reduce((s, x) => s + x.cpu.percentCPUUsage, 0), 2);
    return { page: of((x) => x.pid === widget.webContents.getOSProcessId()), gpuProcess: of((x) => x.type === 'GPU'), all: of(() => true) };
  };
  const drawsPerSecond = () => run(`new Promise((done) => { const m = window.__mercury.mercury; let n = 0, last = m.state.time; const t0 = performance.now();
    const id = setInterval(() => { if (m.state.time !== last) { n++; last = m.state.time; } }, 2);
    setTimeout(() => { clearInterval(id); done(Math.round(n * 1000 / (performance.now() - t0))); }, 2000); })`);

  console.log(`window on the ${display.id === primary.id ? 'main' : 'second'} monitor: ${display.size.width}x${display.size.height} DIP at scale ${display.scaleFactor}, ${display.displayFrequency} Hz`);

  const liquidClock = () => run('window.__mercury.mercury.state.time');

  async function phase(name, note) {
    cpu();                                   // reset the CPU counters' window
    const card = wholeCard();
    const clock0 = await liquidClock();
    const [own, draws] = await Promise.all([processGpu(gpuPid(), seconds), note === 'hidden' ? Promise.resolve(null) : drawsPerSecond()]);
    const clock1 = await liquidClock();
    const whole = card.stop();
    const c = cpu();
    const result = {
      phase: name, drawsPerSecond: draws,
      liquidClockAdvanced: round(clock1 - clock0, 2) + ' s in about ' + seconds + ' s',
      ownGpuPercent: own.length ? { mean: round(mean(own), 2), max: round(Math.max(...own), 2), samples: own.length } : 'no activity recorded',
      cpuPercentOfOneCore: c, wholeCard: whole || 'nvidia-smi not available',
    };
    console.log(JSON.stringify(result));
    return result;
  }

  // Baseline: the window exists but has not been shown, so nothing is drawn to the screen.
  await sleep(1500);
  const results = [await phase('not shown (baseline)', 'hidden')];

  widget.showInactive();
  for (let i = 0; i < 200 && !(await run('Boolean(window.__mercury && window.__mercury.ready)')); i++) await sleep(50);
  // It forms, then about ten seconds after launch settles into the slow breathing cadence. Wait for that.
  let label = '';
  for (let i = 0; i < 40; i++) {
    label = await run(`document.getElementById('fps').textContent`);
    if (label.startsWith('breathing')) break;
    await sleep(1000);
  }
  console.log('label before the idle reading: ' + label);
  const info = await run(`(() => { const c = document.getElementById('gl'); const m = window.__mercury.mercury; return { canvas: [c.width, c.height], scene: [Math.round(m.scale * 860), Math.round(m.scale * 400)], dpr: devicePixelRatio }; })()`);
  console.log('drawing: ' + JSON.stringify(info));
  results.push(await phase('idle: paused, pointer away'));

  await run('window.__mercury.setPlaying(true); 0');
  await sleep(2500);
  console.log('label: ' + await run(`document.getElementById('fps').textContent`));
  results.push(await phase('playing'));

  await run('window.__mercury.setPlaying(false); 0');
  widget.hide();
  await sleep(3000);
  results.push(await phase('hidden (window.hide())', 'hidden'));

  const mem = app.getAppMetrics().reduce((s, m) => s + m.memory.workingSetSize, 0);
  console.log(`memory, all processes of this prototype: ${Math.round(mem / 1024)} MB`);
  app.quit();
  return results;
}

module.exports = { runGpuTest };
