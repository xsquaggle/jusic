/**
 * Springs. Everything that follows a pointer or answers a touch runs on one of
 * these instead of a lerp, so motion carries momentum and settles on its own.
 *
 * Semi-implicit Euler, unit mass, sub-stepped so stiff springs stay stable on
 * a slow frame.
 */

export const PRESETS = {
  glide: { k: 120, c: 20 },   // parallax, tilt, sheen: no visible overshoot
  morph: { k: 210, c: 26 },   // layout changes
  press: { k: 900, c: 40 },   // a button going down
  pop: { k: 420, c: 16 },     // a button coming back in the app
  jelly: { k: 260, c: 9 },    // a release on the widget: two or three wobbles
  bead: { k: 600, c: 28 },    // seek and volume beads chasing the pointer
  lean: { k: 70, c: 14 },     // the body lagging behind a drag
};

const MAX_STEP = 1 / 240;
const REST_X = 1e-4;
const REST_V = 1e-3;

export class Spring {
  /** @param {{k:number,c:number}|string} preset */
  constructor(preset = 'glide', value = 0) {
    this.set(preset);
    this.x = value;
    this.v = 0;
    this.target = value;
  }

  set(preset) {
    const p = typeof preset === 'string' ? PRESETS[preset] : preset;
    this.k = p.k;
    this.c = p.c;
    return this;
  }

  /** Jump without animating. */
  snap(value) {
    this.x = this.target = value;
    this.v = 0;
    return this;
  }

  /** Add velocity, for flicks and impacts. */
  kick(velocity) {
    this.v += velocity;
    return this;
  }

  get resting() {
    return Math.abs(this.x - this.target) < REST_X && Math.abs(this.v) < REST_V;
  }

  step(dt) {
    let left = Math.min(dt, 0.1);
    while (left > 1e-6) {
      const h = Math.min(left, MAX_STEP);
      this.v += (-this.k * (this.x - this.target) - this.c * this.v) * h;
      this.x += this.v * h;
      left -= h;
    }
    if (this.resting) { this.x = this.target; this.v = 0; }
    return this.x;
  }
}

/** Two springs moving as one point. */
export class Spring2 {
  constructor(preset = 'glide', x = 0, y = 0) {
    this.sx = new Spring(preset, x);
    this.sy = new Spring(preset, y);
  }
  set(preset) { this.sx.set(preset); this.sy.set(preset); return this; }
  to(x, y) { this.sx.target = x; this.sy.target = y; return this; }
  snap(x, y) { this.sx.snap(x); this.sy.snap(y); return this; }
  kick(vx, vy) { this.sx.kick(vx); this.sy.kick(vy); return this; }
  step(dt) { this.sx.step(dt); this.sy.step(dt); return this; }
  get x() { return this.sx.x; }
  get y() { return this.sy.x; }
  get vx() { return this.sx.v; }
  get vy() { return this.sy.v; }
  get resting() { return this.sx.resting && this.sy.resting; }
}
