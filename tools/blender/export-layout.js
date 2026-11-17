'use strict';
/**
 * Exports the widget's layout for the Blender glass model (tools/blender/mercury_glass.py):
 * the outline's signed distance on a half-unit grid, the fitted ridge, the cover, the buttons, the
 * timeline's and the volume's paths and where their beads are, the palette, and the label sheet (every
 * word and glyph, white on black, at 3 px per stage unit) exactly as the prototype draws it.
 *
 *   npx electron tools/blender/export-layout.js out=design/captures/raw/blender [q=<extra query>]
 *
 * Stage units throughout: x right, y down, 860 x 400. Nothing here holds a real title: the page runs its
 * generated test track unless q names another.
 */
const { app, BrowserWindow, screen } = require('electron');
const fs = require('fs');
const path = require('path');

const args = Object.fromEntries(process.argv.slice(2).filter((a) => a.includes('=')).map((a) => a.split(/=(.*)/s).slice(0, 2)));
const REPO = path.resolve(__dirname, '..', '..');
const OUT = path.resolve(args.out || 'design/captures/raw/blender');
const PORT = 5191;

app.whenReady().then(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  await require(path.join(REPO, 'prototypes', 'serve.js')).start(PORT);
  const primary = screen.getPrimaryDisplay();
  const display = screen.getAllDisplays().find((d) => d.id !== primary.id) || primary;
  const win = new BrowserWindow({ width: 960, height: 480, useContentSize: true, show: false, frame: false, backgroundColor: '#000000', focusable: false,
    webPreferences: { backgroundThrottling: false, contextIsolation: true, sandbox: true } });
  win.setPosition(display.workArea.x + 20, display.workArea.y + 20);
  win.showInactive();
  await win.loadURL(`http://127.0.0.1:${PORT}/prototypes/mercury/?capture=1&bg=studio&scale=1&mat=2&play${args.q ? '&' + args.q : ''}`);
  const run = (js) => win.webContents.executeJavaScript(js, true);
  for (let i = 0; i < 200; i++) { if (await run('Boolean(window.__mercury && window.__mercury.ready)')) break; await new Promise((r) => setTimeout(r, 50)); }
  await run('window.__mercury.step(120, 1 / 60, true); 0');
  const data = await run(`(async () => {
    const m = window.__mercury.mercury, S = await import('./shape.js'), SH = await import('./shaders.js');
    // The ridge as the shader has it: the fitted curve, parsed back out of the shader's source.
    const src = SH.SURFACE, a = src.indexOf('const vec2 RIDGE2[RIDGE2_N]'), b = src.indexOf(';', a);
    const ridge = [...src.slice(a, b).matchAll(/vec2\\(([-0-9.]+), ([-0-9.]+)\\)/g)].map((r) => [+r[1], +r[2]]);
    const mk = src.match(/const vec3 RIDGE2_MARK = vec3\\(([-0-9.]+), ([-0-9.]+), ([-0-9.]+)\\)/);
    const seek = [], vol = [];
    for (let i = 0; i <= 120; i++) { const x = S.L.seek.x0 + (S.L.seek.x1 - S.L.seek.x0) * i / 120; seek.push([x, S.seekY(x)]); }
    for (let i = 0; i <= 40; i++) { const x = S.L.vol.x0 + (S.L.vol.x1 - S.L.vol.x0) * i / 40; vol.push([x, S.volY(x)]); }
    // The outline's signed distance (negative inside) every half unit, row by row from the top.
    const W = 1720, H = 800, d = new Float32Array(W * H);
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) d[j * W + i] = S.bodySdf((i + 0.5) / 2, (j + 0.5) / 2);
    const u8 = new Uint8Array(d.buffer); let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    // The label sheet at 3 px a unit.
    m.ink.resize(3); m.ink.update();
    const ink = m.ink.canvas.toDataURL('image/png');
    return { ridge, marks: mk ? [+mk[1], +mk[2], +mk[3]] : null, seek, vol, L: S.L, stage: S.STAGE,
      progress: m.state.progress, volume: m.state.volume, pal: m.state.pal, outline: { w: W, h: H, step: 0.5, b64: btoa(s) }, ink };
  })()`);
  fs.writeFileSync(path.join(OUT, 'outline.bin'), Buffer.from(data.outline.b64, 'base64'));
  fs.writeFileSync(path.join(OUT, 'ink.png'), Buffer.from(data.ink.split(',')[1], 'base64'));
  delete data.ink; data.outline = { w: data.outline.w, h: data.outline.h, step: data.outline.step, file: 'outline.bin' };
  fs.writeFileSync(path.join(OUT, 'layout.json'), JSON.stringify(data, null, 1));
  console.log(`ridge ${data.ridge.length} points, progress ${data.progress.toFixed(3)}, volume ${data.volume.toFixed(3)} -> ${OUT}`);
  app.quit();
});
