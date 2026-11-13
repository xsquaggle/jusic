'use strict';
/**
 * Does the compositor keep light that a premultiplied WebGL canvas adds where its alpha is low?
 * The Mercury glow depends on the answer.
 *
 *   npx electron tools/capture/premul-probe.js                 inside an ordinary opaque window
 *   npx electron tools/capture/premul-probe.js transparent=1   in a transparent window over another window, read back
 *                                                              from the real screen (second monitor if there is one;
 *                                                              add display=primary for the main one)
 *
 * A canvas writes rgb (0.30, 0.10, 0.05) with alpha 0, 1/255, 0.1 and 0.3 over a dark and a light
 * strip; the composited result is read back.
 *
 * Results on the owner's PC, 13 Nov 2026. The same pixels are treated differently in different places:
 *   opaque window, main monitor (125% scale):       alpha 0 adds nothing; alpha 1/255 and above adds the full amount
 *   transparent window, main monitor (125% scale):  the same: alpha 0 adds nothing
 *   transparent window, second monitor (100%):      alpha 0 adds the full amount as well
 * So light with no alpha behind it cannot be relied on. The glow needs alpha of its own.
 */
const { app, BrowserWindow, screen, desktopCapturer } = require('electron');

const TRANSPARENT = process.argv.slice(2).includes('transparent=1');
const ON_PRIMARY = process.argv.slice(2).includes('display=primary');
const M = 16;      // the backdrop shows this far past the canvas, to prove it really is what is behind it
const W = 400, H = 120;

const strips = `<div style="position:fixed;left:0;top:0;width:100%;height:50%;background:#101010"></div>
<div style="position:fixed;left:0;top:50%;width:100%;height:50%;background:#f3f4f6"></div>`;

const canvasPage = (withStrips) => `<!DOCTYPE html><style>html,body{margin:0;overflow:hidden;background:transparent}
canvas{position:fixed;left:0;top:0;width:${W}px;height:${H}px}</style>
${withStrips ? strips : ''}<canvas id="c" width="${W}" height="${H}"></canvas><script>
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

const dataUrl = (html) => 'data:text/html;base64,' + Buffer.from(html).toString('base64');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function pixel(image, x, y) {
  const { width } = image.getSize();
  const b = image.toBitmap();
  const i = (y * width + x) * 4;
  return [b[i + 2], b[i + 1], b[i]];      // BGRA -> RGB
}

app.whenReady().then(async () => {
  const primary = screen.getPrimaryDisplay();
  const d = TRANSPARENT && !ON_PRIMARY ? (screen.getAllDisplays().find((x) => x.id !== primary.id) || primary) : primary;
  console.log(`${TRANSPARENT ? 'transparent window, read from the screen' : 'opaque window, read from the page'}; display colour space ${d.colorSpace}, ${d.depthPerComponent} bits per channel, scale ${d.scaleFactor}`);
  const at = { x: d.workArea.x + 80, y: d.workArea.y + 80, width: W, height: H };
  const common = { ...at, useContentSize: true, show: false, frame: false, resizable: false, skipTaskbar: true, focusable: false };

  let image;
  if (TRANSPARENT) {
    const back = new BrowserWindow({ ...common, x: at.x - M, y: at.y - M, width: W + 2 * M, height: H + 2 * M, alwaysOnTop: true, backgroundColor: '#000000' });
    await back.loadURL(dataUrl(`<!DOCTYPE html><style>html,body{margin:0;overflow:hidden}</style>${strips}`));
    back.showInactive();
    back.moveTop();
    const win = new BrowserWindow({ ...common, alwaysOnTop: true, transparent: true, hasShadow: false, roundedCorners: false, backgroundColor: '#00000000' });
    await win.loadURL(dataUrl(canvasPage(false)));
    win.showInactive();
    win.moveTop();
    await sleep(900);
    const sf = d.scaleFactor;
    const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: Math.round(d.size.width * sf), height: Math.round(d.size.height * sf) } });
    const source = sources.find((s) => String(s.display_id) === String(d.id)) || sources[0];
    const shot = (r) => source.thumbnail.crop({ x: Math.round((r.x - d.bounds.x) * sf), y: Math.round((r.y - d.bounds.y) * sf), width: Math.round(r.width * sf), height: Math.round(r.height * sf) });
    image = shot(at);
    const margin = shot({ x: at.x - M, y: at.y - M, width: W + 2 * M, height: H + 2 * M });
    const mh = margin.getSize().height;
    console.log(`backdrop seen past the canvas: ${pixel(margin, 4, Math.round(mh * .25)).join(',')} (want 16,16,16) and ${pixel(margin, 4, Math.round(mh * .75)).join(',')} (want 243,244,246)`);
  } else {
    const win = new BrowserWindow({ ...common, backgroundColor: '#000000' });
    await win.loadURL(dataUrl(canvasPage(true)));
    win.showInactive();
    await sleep(700);
    image = await win.webContents.capturePage();
  }

  const s = image.getSize().width / W;
  console.log('canvas writes rgb (77, 26, 13) with alpha 0, 1/255, 0.1, 0.3');
  for (const [name, y] of [['over dark  (16,16,16)   ', 30], ['over light (243,244,246)', 90]]) {
    const row = [50, 150, 250, 350].map((x) => pixel(image, Math.round(x * s), Math.round(y * s)).join(','));
    console.log(`${name}: a=0 -> ${row[0]} | a=1/255 -> ${row[1]} | a=.1 -> ${row[2]} | a=.3 -> ${row[3]}`);
  }
  app.quit();
});
