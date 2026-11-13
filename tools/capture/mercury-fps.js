'use strict';
/**
 * Runs the Mercury prototype live (muted) in a real window for a few seconds and
 * reports how often it actually draws and at what size.
 *
 *   node prototypes/serve.js
 *   npx electron tools/capture/mercury-fps.js [scale=1] [seconds=5] [q=bg=black&play]
 */
const { app, BrowserWindow, screen } = require('electron');

const args = Object.fromEntries(process.argv.slice(2).filter((a) => a.includes('=')).map((a) => a.split(/=(.*)/s).slice(0, 2)));
const SCALE = Number(args.scale) || 1;
const SECONDS = Number(args.seconds) || 5;
const QUERY = args.q || 'bg=black&play';

app.whenReady().then(async () => {
  const d = screen.getPrimaryDisplay();
  const win = new BrowserWindow({
    width: Math.round(860 * SCALE + 100), height: Math.round(400 * SCALE + 80), useContentSize: true, show: false, frame: false,
    backgroundColor: '#000000', webPreferences: { backgroundThrottling: false, contextIsolation: true, sandbox: true },
  });
  win.webContents.setAudioMuted(true);
  await win.loadURL(`http://127.0.0.1:5190/prototypes/mercury/?${QUERY}&scale=${SCALE}`);
  win.showInactive();
  const result = await win.webContents.executeJavaScript(`(async () => {
    while (!(window.__mercury && window.__mercury.ready)) await new Promise((r) => setTimeout(r, 50));
    await new Promise((r) => setTimeout(r, 1500));
    const m = window.__mercury.mercury;
    const frame = m.frame;
    // Count real draws by watching the liquid's own clock advance.
    let refreshes = 0, draws = 0, lastTime = m.state.time, gaps = [], lastDraw = 0;
    const t0 = performance.now();
    await new Promise((done) => {
      const watch = (now) => {
        refreshes++;
        if (m.state.time !== lastTime) { draws++; lastTime = m.state.time; if (lastDraw) gaps.push(now - lastDraw); lastDraw = now; }
        if (now - t0 < ${SECONDS * 1000}) requestAnimationFrame(watch); else done();
      };
      requestAnimationFrame(watch);
    });
    const secs = (performance.now() - t0) / 1000;
    gaps.sort((a, b) => a - b);
    const c = document.getElementById('gl');
    return {
      refreshHz: Math.round(refreshes / secs), drawsPerSecond: Math.round(draws / secs),
      frameGapMs: { median: +gaps[gaps.length >> 1].toFixed(2), p95: +gaps[Math.floor(gaps.length * 0.95)].toFixed(2), max: +gaps[gaps.length - 1].toFixed(2) },
      canvas: [c.width, c.height], scene: [Math.round(m.scale * 860), Math.round(m.scale * 400)], dpr: devicePixelRatio,
      label: document.getElementById('fps').textContent,
    };
  })()`, true);
  console.log(`display ${d.size.width * d.scaleFactor}x${d.size.height * d.scaleFactor} @ ${d.displayFrequency} Hz, scale ${d.scaleFactor}`);
  console.log(JSON.stringify(result));
  app.quit();
});
