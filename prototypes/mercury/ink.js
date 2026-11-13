/**
 * The label sheet: every word and glyph on the widget, drawn once into a
 * texture the shader then looks at *through* the liquid's surface. That is
 * what lets the title bend with a ripple, pick up a soft glow from the depth
 * it sits at, and have reflections slide across it.
 *
 * White on black; the shader reads coverage from the red channel.
 */

import { STAGE, L, seekY, volY, titleY } from './shape.js';

const ICONS = {
  prev: 'M6 5.2a1.1 1.1 0 0 1 2.2 0v5.3l9.2-5.9A1.1 1.1 0 0 1 19 5.5v13a1.1 1.1 0 0 1-1.6.9l-9.2-5.9v5.3a1.1 1.1 0 0 1-2.2 0Z',
  next: 'M18 5.2a1.1 1.1 0 0 0-2.2 0v5.3L6.6 4.6A1.1 1.1 0 0 0 5 5.5v13a1.1 1.1 0 0 0 1.6.9l9.2-5.9v5.3a1.1 1.1 0 0 0 2.2 0Z',
  play: 'M8.2 4.9v14.2a1.1 1.1 0 0 0 1.7.9l10.9-7.1a1.1 1.1 0 0 0 0-1.8L9.9 4a1.1 1.1 0 0 0-1.7.9Z',
  pause: 'M7.3 4.4h2a1.1 1.1 0 0 1 1.1 1.1v13a1.1 1.1 0 0 1-1.1 1.1h-2a1.1 1.1 0 0 1-1.1-1.1v-13a1.1 1.1 0 0 1 1.1-1.1ZM14.7 4.4h2a1.1 1.1 0 0 1 1.1 1.1v13a1.1 1.1 0 0 1-1.1 1.1h-2a1.1 1.1 0 0 1-1.1-1.1v-13a1.1 1.1 0 0 1 1.1-1.1Z',
  speaker: 'M11 4.6a1 1 0 0 0-1.6-.8L5.6 7H3a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h2.6l3.8 3.2a1 1 0 0 0 1.6-.8Z',
  waves: 'M15.4 8.2a1 1 0 0 1 1.4.1 5.8 5.8 0 0 1 0 7.4 1 1 0 1 1-1.5-1.3 3.8 3.8 0 0 0 0-4.8 1 1 0 0 1 .1-1.4ZM18.3 5.2a1 1 0 0 1 1.4.1 9.8 9.8 0 0 1 0 13.4 1 1 0 1 1-1.5-1.3 7.8 7.8 0 0 0 0-10.8 1 1 0 0 1 .1-1.4Z',
  muted: 'M15.3 9.3a1 1 0 0 1 1.4 0l1.3 1.3 1.3-1.3a1 1 0 1 1 1.4 1.4L19.4 12l1.3 1.3a1 1 0 0 1-1.4 1.4L18 13.4l-1.3 1.3a1 1 0 0 1-1.4-1.4l1.3-1.3-1.3-1.3a1 1 0 0 1 0-1.4Z',
};
// Stroked glyphs for the two utility dishes.
const STROKES = {
  open: 'M14 4h6v6M20 4l-7 7M10 20H4v-6M4 20l7-7',
  hide: 'M6 6l12 12M18 6 6 18',
};

export function createInk(gl, { family = 'Montserrat' } = {}) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const tex = gl.createTexture();
  let scale = 0;
  let labels = { title: '', artist: '', cur: '0:00', rem: '−0:00', playing: false, muted: false, tip: '', morph: 0 };
  let dirty = true;

  function resize(pxPerUnit) {
    const next = Math.min(3, Math.max(1, pxPerUnit));
    if (next === scale) return;
    scale = next;
    canvas.width = Math.round(STAGE.w * scale);
    canvas.height = Math.round(STAGE.h * scale);
    dirty = true;
  }

  function set(patch) {
    for (const [k, v] of Object.entries(patch)) {
      if (labels[k] !== v) { labels[k] = v; dirty = true; }
    }
  }

  const font = (weight, size) => `${weight} ${size}px ${family}, 'Segoe UI', system-ui, sans-serif`;

  /** Cut a string down with an ellipsis until it fits. */
  function fit(text, maxW) {
    if (ctx.measureText(text).width <= maxW) return text;
    let s = text;
    while (s.length > 1 && ctx.measureText(s + '…').width > maxW) s = s.slice(0, -1);
    return s.trimEnd() + '…';
  }

  /**
   * Set text along a curve, one glyph at a time, each turned to the curve's
   * slope. Advances come from the measured run, so kerning survives.
   * @param {(x:number)=>number} yAt baseline height at x
   */
  function along(text, x0, yAt, { tracking = 0, align = 'left' } = {}) {
    const total = ctx.measureText(text).width + tracking * (text.length - 1);
    let x = align === 'right' ? x0 - total : align === 'center' ? x0 - total / 2 : x0;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    let before = 0;
    for (let i = 0; i < text.length; i++) {
      const upTo = ctx.measureText(text.slice(0, i + 1)).width;
      const w = upTo - before;
      before = upTo;
      const cx = x + w / 2;
      const angle = Math.atan((yAt(cx + 2) - yAt(cx - 2)) / 4);
      ctx.save();
      ctx.translate(cx, yAt(cx));
      ctx.rotate(angle);
      ctx.fillText(text[i], 0, 0);
      ctx.restore();
      x += (w + tracking) * Math.cos(angle);
    }
  }

  function icon(name, cx, cy, size, alpha = 1) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(cx - size / 2, cy - size / 2);
    ctx.scale(size / 24, size / 24);
    if (STROKES[name]) {
      ctx.lineWidth = 2.3;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#fff';
      ctx.stroke(new Path2D(STROKES[name]));
    } else {
      ctx.fill(new Path2D(ICONS[name]));
    }
    ctx.restore();
  }

  // Play and pause are the same two pieces of liquid: each half of the
  // triangle draws itself up into a bar. t = 0 is play, 1 is pause.
  const PLAY = [[[8.4, 4.3], [14.5, 8.15], [14.5, 15.85], [8.4, 19.7]], [[14.5, 8.15], [20.6, 12], [20.6, 12], [14.5, 15.85]]];
  const PAUSE = [[[6.4, 4.6], [10.2, 4.6], [10.2, 19.4], [6.4, 19.4]], [[13.8, 4.6], [17.6, 4.6], [17.6, 19.4], [13.8, 19.4]]];
  function playPause(cx, cy, size, t) {
    ctx.save();
    ctx.translate(cx - size / 2 + (1 - t) * 1.5 * size / 24, cy - size / 2);
    ctx.scale(size / 24, size / 24);
    ctx.lineJoin = 'round';
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#fff';
    for (let half = 0; half < 2; half++) {
      ctx.beginPath();
      for (let i = 0; i < 4; i++) {
        const a = PLAY[half][i], b = PAUSE[half][i];
        const x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  function draw() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.fillStyle = '#fff';

    // Title and artist follow the shoulder of the left lobe down into the waist.
    ctx.font = font(600, L.title.size);
    ctx.globalAlpha = 1;
    along(fit(labels.title, L.title.maxW), L.title.x, titleY);
    ctx.font = font(400, L.artist.size);
    ctx.globalAlpha = 0.8;
    along(fit(labels.artist, L.title.maxW - 8), L.title.x + 1, (x) => titleY(x) + L.artist.drop, { tracking: 0.15 });

    // Times sit at the two ends of the timeline, turned to its slope.
    ctx.font = font(500, 13.5);
    ctx.globalAlpha = 1;
    along(labels.cur, L.seek.x0 - 13, (x) => seekY(L.seek.x0) + 4.6 + (x - L.seek.x0) * (seekY(L.seek.x0 + 8) - seekY(L.seek.x0)) / 8, { align: 'right' });
    along(labels.rem, L.seek.x1 + 14, (x) => seekY(L.seek.x1) + 4.6 + (x - L.seek.x1) * (seekY(L.seek.x1) - seekY(L.seek.x1 - 8)) / 8);

    // The lip: speaker, and VOLUME set along the slider's own curve.
    ctx.font = font(600, 8.5);
    ctx.globalAlpha = 1;
    along('VOLUME', L.vol.x0 + 1, (x) => volY(x) - 9.5, { tracking: 1.4 });
    ctx.globalAlpha = 1;
    icon('speaker', L.vol.icon[0], L.vol.icon[1], 22);
    icon(labels.muted ? 'muted' : 'waves', L.vol.icon[0], L.vol.icon[1], 22);

    // Transport.
    ctx.globalAlpha = 1;
    icon('prev', L.buttons[0].c[0] - 0.5, L.buttons[0].c[1], 21);
    playPause(L.buttons[1].c[0], L.buttons[1].c[1], 31, labels.morph);
    icon('next', L.buttons[2].c[0] + 0.5, L.buttons[2].c[1], 21);

    // Utility dishes.
    icon('open', L.utils[0].c[0], L.utils[0].c[1], 10.5, 0.95);
    icon('hide', L.utils[1].c[0], L.utils[1].c[1], 10, 0.95);

    // Time preview, parked off to one side; the shader shows it through the lens.
    if (labels.tip) {
      ctx.font = font(600, 12.5);
      ctx.globalAlpha = 1;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(labels.tip, L.tipSlot[0], L.tipSlot[1] + 0.5);
    }
    ctx.globalAlpha = 1;
  }

  /** Redraw and upload if anything changed. Cheap enough to call every frame. */
  function update() {
    if (!dirty || !scale) return false;
    dirty = false;
    draw();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, gl.RED, gl.UNSIGNED_BYTE, canvas);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return true;
  }

  return { tex, resize, set, update, get scale() { return scale; }, canvas };
}
