/**
 * How the light lies over an area of the drop, as a grid of numbers: the main reference beside
 * one of our shots, in stage units, so the two can be read cell for cell. No window is opened.
 * The companion of cut-profile.js (vertical cuts) and ring-profile.js (the ring round the cover),
 * for parts that a line through them does not describe: the upper lip as a sheet, a bowl's rim.
 *
 *   npx electron tools/capture/area-map.js shot=design/captures/raw/roundNN/dark.png [box=560,70,800,260] [step=8] [part=lip]
 *
 * box is x0,y0,x1,y1 in stage units, step the size of a cell. Each cell is the mean of the
 * pixels in it. Printed per picture: brightness (0 black to 9 white), then warmth (red over
 * blue, 0 neutral to 9 strongly coral). A cell outside the drop is a space; with part=lip only
 * the upper lip (on the lip side of its leading edge, archSdf > 0) is printed and the rest is a
 * dot. The reference is mapped onto the stage as outline.js maps it (it is in perspective and
 * ours is square on, so it fits within a few units on the right lobe, less well on the left).
 * Last, the mean brightness and warmth of the printed cells, for a one-line comparison.
 *
 * Use a shot of the dark desktop ('dark.png'): the reference stands on a dark ground too.
 */
const { app, nativeImage } = require('electron');
const path = require('path');

const args = Object.fromEntries(process.argv.slice(2).filter((a) => a.includes('=')).map((a) => a.split(/=(.*)/s).slice(0, 2)));
const REPO = path.resolve(__dirname, '..', '..');
// As in outline.js: a stage point (sx, sy) is the reference's pixel at + (s - is) * k.
const REF = { file: 'design/references/widget-mercury.png', k: 1 / 0.485, at: [40, 477], is: [58, 196] };

function load(file) {
  const img = nativeImage.createFromPath(path.resolve(REPO, file));
  const { width, height } = img.getSize();
  if (!width) throw new Error('cannot read ' + file);
  return { width, height, data: img.toBitmap() };      // BGRA
}
/** Mean colour of the pixels in a rectangle, 0..1. */
function mean(img, x0, y0, x1, y1) {
  let r = 0, g = 0, b = 0, n = 0;
  for (let y = Math.max(0, Math.round(y0)); y < Math.min(img.height, Math.round(y1)); y++) {
    for (let x = Math.max(0, Math.round(x0)); x < Math.min(img.width, Math.round(x1)); x++) {
      const i = (y * img.width + x) * 4;
      b += img.data[i]; g += img.data[i + 1]; r += img.data[i + 2]; n++;
    }
  }
  return n ? [r / n / 255, g / n / 255, b / n / 255] : [0, 0, 0];
}
const lumOf = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const digit = (v) => String(Math.min(9, Math.max(0, Math.round(v))));

app.whenReady().then(async () => {
  const S = await import(require('url').pathToFileURL(path.join(REPO, 'prototypes', 'mercury', 'shape.js')).href);
  const shot = args.shot || 'design/captures/raw/round33/dark.png';
  const [x0, y0, x1, y1] = (args.box || '560,70,800,260').split(',').map(Number);
  const step = Number(args.step || 8);
  const lipOnly = args.part === 'lip';
  const ref = load(REF.file), ours = load(shot);
  const k = ours.width / 960;                    // the shot is 960 CSS px wide with the stage 50, 40 in
  const pics = {
    ref: { img: ref, px: (sx, sy) => [REF.at[0] + (sx - REF.is[0]) * REF.k, REF.at[1] + (sy - REF.is[1]) * REF.k] },
    ours: { img: ours, px: (sx, sy) => [(sx + 50) * k, (sy + 40) * k] },
  };
  console.log(`box ${x0},${y0} to ${x1},${y1}, cells of ${step} units; ours: ${shot}${lipOnly ? '; the upper lip only' : ''}`);
  const header = '      ' + Array.from({ length: Math.ceil((x1 - x0) / step) }, (_, i) => ((x0 + i * step) % 40 === 0 ? '|' : ' ')).join('');
  for (const [name, p] of Object.entries(pics)) {
    const lum = [], warm = [];
    let sumL = 0, sumW = 0, n = 0; const sumC = [0, 0, 0];
    for (let sy = y0; sy < y1; sy += step) {
      let l = '', w = '';
      for (let sx = x0; sx < x1; sx += step) {
        const cx = sx + step / 2, cy = sy + step / 2;
        if (S.bodySdf(cx, cy) >= -1) { l += ' '; w += ' '; continue; }
        if (lipOnly && !(S.archSdf(cx, cy) > 1 && S.archOn(cx, cy) > 0.5)) { l += '.'; w += '.'; continue; }
        const [ax, ay] = p.px(sx, sy), [bx, by] = p.px(sx + step, sy + step);
        const c = mean(p.img, ax, ay, bx, by);
        const L = lumOf(c), W = (c[0] - c[2]) * 12;
        l += digit(L * 9); w += digit(W);
        sumL += L * 9; sumW += W; n++; c.forEach((v, i) => { sumC[i] += v; });
      }
      lum.push(`${String(sy).padStart(4)}  ${l}`); warm.push(`${String(sy).padStart(4)}  ${w}`);
    }
    console.log(`\n${name}: brightness${' '.repeat(Math.max(1, lum[0].length - 16))}warmth`);
    console.log(header + '   ' + header.slice(6));
    lum.forEach((row, i) => console.log(row + '   ' + warm[i].slice(6)));
    console.log(`${name} mean over ${n} cells: brightness ${(sumL / Math.max(1, n)).toFixed(2)}, warmth ${(sumW / Math.max(1, n)).toFixed(2)}, colour ${sumC.map((v) => Math.round(v / Math.max(1, n) * 255)).join(" ")}`);
  }
  app.quit();
});
