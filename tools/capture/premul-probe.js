'use strict';
/**
 * Does the compositor keep light that a premultiplied WebGL canvas adds where its alpha is low?
 * The Mercury glow depends on the answer.
 *
 *   npx electron tools/capture/premul-probe.js
 *
 * A canvas writes rgb (0.30, 0.10, 0.05) with alpha 0, 1/255, 0.1 and 0.3 over a dark and a light
 * strip; the composited result is read back. Result on the owner's PC (13 Nov 2026, inside an
 * ordinary opaque window): alpha 0 adds nothing, alpha 1/255 adds the full amount.
 * Still to run inside a transparent window, where Windows does the last blend.
 */
const { app, BrowserWindow, screen } = require('electron');

const page = `<!DOCTYPE html><style>html,body{margin:0;overflow:hidden}
.bg{position:fixed;left:0;width:400px;height:60px}.d{top:0;background:#101010}.l{top:60px;background:#f3f4f6}
canvas{position:fixed;left:0;top:0;width:400px;height:120px}</style>
<div class="bg d"></div><div class="bg l"></div><canvas id="c" width="400" height="120"></canvas><script>
const gl = document.getElementById('c').getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false });
const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); return o; };
const p = gl.createProgram();
gl.attachShader(p, sh(gl.VERTEX_SHADER, '#version 300 es\\nin vec2 a; out vec2 v; void main(){ v = a * .5 + .5; gl_Position = vec4(a, 0., 1.); }'));
gl.attachShader(p, sh(gl.FRAGMENT_SHADER, '#version 300 es\\nprecision highp float; in vec2 v; out vec4 o; void main(){ float a = v.x < .25 ? 0. : v.x < .5 ? 1. / 255. : v.x < .75 ? .1 : .3; o = vec4(.3, .1, .05, a); }'));
gl.bindAttribLocation(p, 0, 'a'); gl.linkProgram(p); gl.useProgram(p);
gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
const draw = () => { gl.drawArrays(gl.TRIANGLES, 0, 3); requestAnimationFrame(draw); }; draw();
</script>`;

function pixel(image, x, y) {
  const { width } = image.getSize();
  const b = image.toBitmap();
  const i = (y * width + x) * 4;
  return [b[i + 2], b[i + 1], b[i]];      // BGRA -> RGB
}

app.whenReady().then(async () => {
  const d = screen.getPrimaryDisplay();
  console.log(`display colour space ${d.colorSpace}, ${d.depthPerComponent} bits per channel`);
  const win = new BrowserWindow({ width: 400, height: 120, useContentSize: true, show: false, frame: false, backgroundColor: '#000000' });
  await win.loadURL('data:text/html;base64,' + Buffer.from(page).toString('base64'));
  win.showInactive();
  await new Promise((r) => setTimeout(r, 700));
  const image = await win.webContents.capturePage();
  const s = image.getSize().width / 400;
  console.log('canvas writes rgb (77, 26, 13) with alpha 0, 1/255, 0.1, 0.3');
  for (const [name, y] of [['over dark  (16,16,16)   ', 30], ['over light (243,244,246)', 90]]) {
    const row = [50, 150, 250, 350].map((x) => pixel(image, Math.round(x * s), Math.round(y * s)).join(','));
    console.log(`${name}: a=0 -> ${row[0]} | a=1/255 -> ${row[1]} | a=.1 -> ${row[2]} | a=.3 -> ${row[3]}`);
  }
  app.quit();
});
