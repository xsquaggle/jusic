'use strict';
/**
 * How much of the graphics card the widget window uses: idle, playing, and hidden.
 *
 *   npx electron tools/widget-proto/main.js test=gpu [dsf=1.25] [seconds=12] [display=primary]
 *   ... test=gpu dsf=1.25 refract=live [rfps=30] [rmax=960]     the same with the refraction experiment on
 *
 * Readings per phase:
 *   - this window's own share: Windows' per-process "GPU Engine" counters for the Electron GPU
 *     process (3D engine), so a game or anything else running does not count;
 *   - the same counters for every process of the prototype and for the desktop compositor
 *     (dwm.exe), split by graphics adapter and engine, because a screen capture does its work
 *     outside the GPU process: the main process copies the screen, the compositor composes it;
 *   - CPU for each of those;
 *   - the whole card, from nvidia-smi, for context only.
 * With refract= it also looks for a border Windows may draw round a captured screen: it counts
 * yellow pixels along the monitor's edges before and during the capture (counts only; no picture
 * of the screen is kept or written anywhere).
 * The real mouse is not touched. Audio is muted.
 */
const { execFile, execFileSync, spawn } = require('child_process');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);
const round = (v, n = 1) => Math.round(v * 10 ** n) / 10 ** n;
const powershell = (script, cb) => execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { encoding: 'utf8', maxBuffer: 1 << 26, windowsHide: true }, cb);

/** Graphics adapters by the low half of their id, as the GPU counters name them: { '0x0000d2a6': 'NVIDIA ...' }. */
function adapterNames() {
  const script = `Add-Type @'
using System; using System.Runtime.InteropServices;
public static class Dx {
  [DllImport("dxgi.dll")] static extern int CreateDXGIFactory1(ref Guid riid, out IntPtr f);
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  struct D { [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)] public string Name; public uint Vendor, Device, SubSys, Rev; public UIntPtr Vram, SysMem, Shared; public uint LuidLow; public int LuidHigh; public uint Flags; }
  [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate int EnumFn(IntPtr self, uint i, out IntPtr adapter);
  [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate int DescFn(IntPtr self, out D d);
  public static string List() {
    Guid iid = new Guid("770aae78-f26f-4dba-a829-253c83d1b387"); IntPtr f;
    if (CreateDXGIFactory1(ref iid, out f) != 0) return "";
    EnumFn en = (EnumFn)Marshal.GetDelegateForFunctionPointer(Marshal.ReadIntPtr(Marshal.ReadIntPtr(f), 12 * IntPtr.Size), typeof(EnumFn));
    string s = ""; IntPtr a;
    for (uint i = 0; en(f, i, out a) == 0; i++) {
      DescFn ds = (DescFn)Marshal.GetDelegateForFunctionPointer(Marshal.ReadIntPtr(Marshal.ReadIntPtr(a), 10 * IntPtr.Size), typeof(DescFn));
      D d; if (ds(a, out d) == 0) s += String.Format("0x{0:x8}={1}\\n", d.LuidLow, d.Name);
      Marshal.Release(a);
    }
    Marshal.Release(f); return s;
  }
}
'@
[Dx]::List()`;
  try {
    const out = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { encoding: 'utf8', windowsHide: true });
    return Object.fromEntries(out.split(/\r?\n/).filter((l) => l.includes('=')).map((l) => l.trim().split(/=(.*)/s).slice(0, 2)));
  } catch { return {}; }
}

/**
 * One reading a second, for 'seconds', of GPU use by the given processes and by dwm.exe.
 * Resolves with { samples: [{ 'pid/adapter/engine': percent, ... }], dwmCpu: [percent of one core], dwmPids }.
 */
function counters(pids, seconds) {
  const script = `$ErrorActionPreference = 'SilentlyContinue'
$dwm = @(Get-Process dwm | ForEach-Object { $_.Id })
$want = @(${pids.join(',')}) + $dwm
'dwm=' + ($dwm -join ',')
Get-Counter -Counter '\\GPU Engine(*)\\Utilization Percentage','\\Process(dwm*)\\% Processor Time' -SampleInterval 1 -MaxSamples ${seconds} | ForEach-Object {
  $parts = foreach ($c in $_.CounterSamples) {
    if ($c.Path -like '*gpu engine*') {
      if ($c.CookedValue -gt 0 -and $c.InstanceName -match '^pid_(\\d+)_luid_0x[0-9a-f]+_(0x[0-9a-f]+)_phys_\\d+_eng_\\d+_engtype_(.+)$' -and $want -contains [int]$Matches[1]) {
        $Matches[1] + '/' + $Matches[2] + '/' + $Matches[3] + '=' + [math]::Round($c.CookedValue, 3)
      }
    } else { 'dwmcpu=' + [math]::Round($c.CookedValue, 2) }
  }
  'sample;' + ($parts -join ';')
}`;
  return new Promise((resolve) => {
    powershell(script, (err, out) => {
      const result = { samples: [], dwmCpu: [], dwmPids: [] };
      for (const line of String(out || '').split(/\r?\n/)) {
        if (line.startsWith('dwm=')) result.dwmPids = line.slice(4).split(',').map(Number).filter(Boolean);
        if (!line.startsWith('sample;')) continue;
        const sample = {};
        let dwmCpu = 0;
        for (const part of line.slice(7).split(';')) {
          const [key, value] = part.split('=');
          if (!value) continue;
          if (key === 'dwmcpu') dwmCpu += Number(value);
          else sample[key.toLowerCase()] = (sample[key.toLowerCase()] || 0) + Number(value);
        }
        result.samples.push(sample);
        result.dwmCpu.push(dwmCpu);
      }
      resolve(result);
    });
  });
}

/** Whole-card utilisation and power once a second, until stop() is called. */
function wholeCard() {
  const rows = [];
  let child = null;
  try {
    child = spawn('nvidia-smi', ['--query-gpu=utilization.gpu,power.draw', '--format=csv,noheader,nounits', '-l', '1'], { windowsHide: true });
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

/**
 * Counts yellow pixels in a 4-pixel band along each edge of a monitor (rect in physical pixels).
 * Windows marks a screen that is being captured through its newer capture interface with a
 * yellow border. Only the counts leave this function; the pixels are never stored.
 */
function edgeYellow(rect) {
  const script = `Add-Type -AssemblyName System.Drawing
Add-Type @'
using System; using System.Runtime.InteropServices;
public class Dpi { [DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(IntPtr v); }
'@
[void][Dpi]::SetProcessDpiAwarenessContext([IntPtr](-4))
$x = ${rect.x}; $y = ${rect.y}; $w = ${rect.width}; $h = ${rect.height}; $t = 4
$bands = @(@('top', $x, $y, $w, $t), @('bottom', $x, ($y + $h - $t), $w, $t), @('left', $x, $y, $t, $h), @('right', ($x + $w - $t), $y, $t, $h))
$out = foreach ($b in $bands) {
  $bmp = New-Object System.Drawing.Bitmap ([int]$b[3]), ([int]$b[4])
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.CopyFromScreen([int]$b[1], [int]$b[2], 0, 0, $bmp.Size)
  $n = 0; $total = 0
  for ($i = 0; $i -lt $bmp.Width; $i += 2) { for ($j = 0; $j -lt $bmp.Height; $j++) {
    $p = $bmp.GetPixel($i, $j); $total++
    if ($p.R -gt 200 -and $p.G -gt 140 -and $p.B -lt 90) { $n++ }
  } }
  $g.Dispose(); $bmp.Dispose()
  $b[0] + ' ' + $n + '/' + $total
}
$out -join ', '`;
  try { return execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { encoding: 'utf8', windowsHide: true }).trim(); } catch (e) { return 'could not be read: ' + String(e.message).split('\n')[0]; }
}

async function runGpuTest({ app, screen, createWidget, getWidget, pickDisplay, seconds = 12, refract = null }) {
  const display = pickDisplay('other');
  const primary = screen.getPrimaryDisplay();
  const adapters = adapterNames();
  const edges = refract ? screen.dipToScreenRect(null, display.bounds) : null;
  if (refract) console.log('yellow pixels along the monitor edges before any capture: ' + edgeYellow(edges));

  await createWidget({ query: '', x: display.workArea.x + 80, y: display.workArea.y + 80 });
  const widget = getWidget();
  widget.webContents.setAudioMuted(true);
  const run = (js) => widget.webContents.executeJavaScript(js, true);
  const metrics = () => app.getAppMetrics();
  const gpuPid = () => (metrics().find((m) => m.type === 'GPU') || {}).pid;
  const pagePid = () => widget.webContents.getOSProcessId();
  const cpu = () => {
    const m = metrics();
    const of = (pred) => round(m.filter(pred).reduce((s, x) => s + x.cpu.percentCPUUsage, 0), 2);
    return { page: of((x) => x.pid === pagePid()), gpuProcess: of((x) => x.type === 'GPU'), main: of((x) => x.type === 'Browser'), all: of(() => true) };
  };
  const drawsPerSecond = () => run(`new Promise((done) => { const m = window.__mercury.mercury; let n = 0, last = m.state.time; const t0 = performance.now();
    const id = setInterval(() => { if (m.state.time !== last) { n++; last = m.state.time; } }, 2);
    setTimeout(() => { clearInterval(id); done(Math.round(n * 1000 / (performance.now() - t0))); }, 2000); })`);
  const captured = () => run('[window.__mercury.backdrop.frames, window.__mercury.mercury.backdrop.uploads, performance.now()]');

  console.log(`window on the ${display.id === primary.id ? 'main' : 'second'} monitor: ${display.size.width}x${display.size.height} DIP at scale ${display.scaleFactor}, ${display.displayFrequency} Hz`);
  console.log('graphics adapters: ' + JSON.stringify(adapters));

  const liquidClock = () => run('window.__mercury.mercury.state.time');

  async function phase(name, note) {
    cpu();                                   // reset the CPU counters' window
    const card = wholeCard();
    const clock0 = await liquidClock();
    const cap0 = await captured();
    const names = new Map(metrics().map((m) => [m.pid, m.pid === pagePid() ? 'page' : m.type === 'GPU' ? 'gpu process' : m.type === 'Browser' ? 'main process' : String(m.type).toLowerCase()]));
    const [read, draws] = await Promise.all([counters([...names.keys()], seconds), note === 'hidden' ? Promise.resolve(null) : drawsPerSecond()]);
    const clock1 = await liquidClock();
    const cap1 = await captured();
    const whole = card.stop();
    const c = cpu();
    for (const pid of read.dwmPids) names.set(pid, 'dwm.exe');

    // The widget's own share, as in the first measurements: the GPU process's 3D work, per second.
    const own = read.samples.map((s) => Object.entries(s).filter(([k]) => k.startsWith(gpuPid() + '/') && k.endsWith('/3d')).reduce((sum, [, v]) => sum + v, 0));
    // Everything, averaged over the phase: who, on which adapter, doing what.
    const by = {};
    for (const s of read.samples) {
      for (const [key, value] of Object.entries(s)) {
        const [pid, luid, engine] = key.split('/');
        const label = `${names.get(Number(pid)) || 'pid ' + pid} · ${(adapters[luid] || luid).replace(/\(TM\)|\(R\)/g, '').trim()} · ${engine}`;
        by[label] = (by[label] || 0) + value / read.samples.length;
      }
    }
    const breakdown = Object.fromEntries(Object.entries(by).filter(([, v]) => v >= 0.005).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, round(v, 2)]));
    const dt = (cap1[2] - cap0[2]) / 1000;
    const result = {
      phase: name, drawsPerSecond: draws,
      liquidClockAdvanced: round(clock1 - clock0, 2) + ' s in about ' + seconds + ' s',
      ownGpuPercent: own.length ? { mean: round(mean(own), 2), max: round(Math.max(...own), 2), samples: own.length } : 'no activity recorded',
      gpuPercentByProcess: breakdown,
      cpuPercentOfOneCore: { ...c, dwm: round(mean(read.dwmCpu), 2) },
      ...(refract ? { captureFramesPerSecond: round((cap1[0] - cap0[0]) / dt), uploadsPerSecond: round((cap1[1] - cap0[1]) / dt) } : {}),
      wholeCard: whole || 'nvidia-smi not available',
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
  if (refract) {
    console.log('capture: ' + await run('JSON.stringify({ error: window.__mercury.backdrop.error, frame: [window.__mercury.mercury.backdrop.w, window.__mercury.mercury.backdrop.h], running: Boolean(window.__mercury.backdrop.track) })'));
    console.log('yellow pixels along the monitor edges while it is being captured: ' + edgeYellow(edges));
  }
  results.push(await phase('idle: paused, pointer away'));

  await run('window.__mercury.setPlaying(true); 0');
  await sleep(2500);
  console.log('label: ' + await run(`document.getElementById('fps').textContent`));
  results.push(await phase('playing'));

  await run('window.__mercury.setPlaying(false); 0');
  widget.hide();
  await sleep(3000);
  if (refract) console.log('capture while hidden: ' + await run('JSON.stringify({ running: Boolean(window.__mercury.backdrop.track), hidden: document.hidden })'));
  results.push(await phase('hidden (window.hide())', 'hidden'));

  const mem = app.getAppMetrics().reduce((s, m) => s + m.memory.workingSetSize, 0);
  console.log(`memory, all processes of this prototype: ${Math.round(mem / 1024)} MB`);
  app.quit();
  return results;
}

module.exports = { runGpuTest };
