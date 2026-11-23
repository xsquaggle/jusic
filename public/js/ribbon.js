/**
 * The Mercury ribbon: its poured shape, and the seek and volume lines that run along it.
 *
 * Everything is measured in u, the ribbon's height, so it scales as one object. The bulb (left,
 * holding the cover in its pocket) and the pod (right, holding the bowls) keep their shape at any
 * width; only the waist between them grows. The stylesheet places text and controls with the same
 * numbers (as calc() on --u).
 */

/** The kiln's shape list for a ribbon w by h CSS pixels: [cx, cy, halfW, halfH, radius, kind, blend]. */
export function ribbonShape(w, u) {
  const neck = 0.5 * u;                                        // how far joined forms flow into each other
  const waist = Math.max(0.2 * u, (w - 2.3 * u) / 2);
  return [
    [0.64 * u, 0.52 * u, 0.62 * u, 0.49 * u, 0.44 * u, 0, neck],            // bulb
    [1.1 * u + waist, 0.67 * u, waist + 0.5 * u, 0.215 * u, 0.215 * u, 0, neck],   // waist: thin, and low
    [w - 0.9 * u, 0.585 * u, 0.72 * u, 0.385 * u, 0.385 * u, 0, neck],      // pod
    [w - 0.66 * u, 0.37 * u, 0.3 * u, 0.3 * u, 0.3 * u, 0, neck],           // the lip, rising at upper right
    [w - 0.15 * u, 0.72 * u, 0.15 * u, 0.1 * u, 0.1 * u, 0, 0.7 * neck],    // tail
    [0.64 * u, 0.52 * u, 0.36 * u, 0.36 * u, 0.1 * u, 1, 0],                // the cover's pocket (a hole)
    [w - 0.86 * u, 0.56 * u, 0.6 * u, 0.235 * u, 0.235 * u, 2, 0],          // the recess the bowls sit in
  ];
}

/**
 * Where the seek line runs: from beside the cover, along the waist and on under the bowls,
 * keeping the same distance above the ribbon's lower roll all the way. x in [x0, x1].
 */
export function seekPath(w, u) {
  const x0 = 1.22 * u, x1 = w - 0.64 * u;
  const y = (x) => { const t = Math.min(1, Math.max(0, (x - (w - 1.85 * u)) / (0.65 * u))); return (0.757 + 0.078 * t * t * (3 - 2 * t)) * u; };
  return { x0, x1, y };
}

const rgb = (c, a = 1) => `rgb(${c[0]} ${c[1]} ${c[2]} / ${a})`;

/**
 * Draws a line of light on a canvas that covers the ribbon: a glowing hot core for the played
 * part, a bead at the head, a thin dim line for the rest. `y` gives the line's height at each x.
 */
export function drawLine(canvas, { w, h, x0, x1, y, value, color, bead = 1 }) {
  const px = window.devicePixelRatio || 1;
  if (canvas.width !== Math.round(w * px) || canvas.height !== Math.round(h * px)) { canvas.width = Math.round(w * px); canvas.height = Math.round(h * px); }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(px, 0, 0, px, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const head = x0 + (x1 - x0) * Math.min(1, Math.max(0, value));
  const trace = (from, to) => {
    ctx.beginPath();
    for (let x = from; x <= to; x += 6) ctx.lineTo(x, y(x));
    ctx.lineTo(to, y(to));
  };
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  trace(head, x1);                                           // what's left: thin and dim
  ctx.strokeStyle = 'rgb(255 255 255 / .26)'; ctx.lineWidth = 1.5; ctx.stroke();
  if (head > x0) {
    trace(x0, head);                                         // what's played: the album's colour as light,
    ctx.shadowColor = rgb(color, 0.95); ctx.shadowBlur = 12;
    ctx.strokeStyle = rgb(color, 0.9); ctx.lineWidth = 4; ctx.stroke();
    ctx.shadowBlur = 5;                                      // then a near-white core
    ctx.strokeStyle = 'rgb(255 246 240)'; ctx.lineWidth = 2; ctx.stroke();
  }
  ctx.shadowColor = rgb(color, 1); ctx.shadowBlur = 14;      // the bead
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(head, y(head), 5.5 * bead, 0, Math.PI * 2); ctx.fill();
  ctx.shadowBlur = 0;
}
