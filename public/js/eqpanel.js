/**
 * The equaliser panel: ten draggable bands over a live curve, with the music's
 * own spectrum drifting behind it so you can see what you are shaping.
 */

import { h, icon, clamp, toast } from './util.js';
import {
  BANDS, PRESETS, MAX_GAIN, MAX_PREAMP, eq, eqActive, response,
  setBandGain, setPreamp, setEqOn, applyPreset, resetEq, onEqChange,
} from './eq.js';
import { getAnalyser, player } from './player.js';
import { haptic, replay, reducedMotion } from './fx.js';

const FREQ_LO = 32;
const FREQ_HI = 16000;
const fmtDb = (db) => (db > 0 ? '+' : '') + (Math.round(db * 10) / 10).toFixed(Math.abs(db) % 1 ? 1 : 0);

/** A vertical fader. Pointer, wheel, arrow keys and double-click all work. */
function fader(
  { label, value, min, max, onInput, ariaLabel, className = 'eq-band' },
) {
  const fill = h('i.eq-fill');
  const knob = h('i.eq-knob');
  const track = h('div.eq-track', null, h('i.eq-zero'), fill, knob);
  const readout = h('span.eq-value', null, fmtDb(value));
  const node = h(`div.${className}`, {
    tabIndex: 0,
    role: 'slider',
    'aria-label': ariaLabel || label,
    'aria-valuemin': min,
    'aria-valuemax': max,
  }, readout, track, h('span.eq-label', null, label));

  let db = value;
  const paint = () => {
    const ratio = (db - min) / (max - min);            // 0 at the bottom
    const fromCenter = (db / max) * 50;                 // % of half the track
    knob.style.bottom = `calc(${(ratio * 100).toFixed(2)}% - 7px)`;
    fill.style.height = Math.abs(fromCenter).toFixed(2) + '%';
    fill.style.bottom = db >= 0 ? '50%' : `${(50 - Math.abs(fromCenter)).toFixed(2)}%`;
    readout.textContent = fmtDb(db);
    node.setAttribute('aria-valuenow', db);
    node.classList.toggle('is-zero', Math.abs(db) < 0.05);
    node.style.setProperty('--lift', (Math.abs(db) / max).toFixed(3));
  };

  const set = (next, fromUser = true) => {
    const clamped = clamp(Math.round(next * 2) / 2, min, max);
    if (clamped === db) return;
    db = clamped;
    paint();
    if (fromUser) onInput(db);
  };

  const fromPointer = (clientY) => {
    const rect = track.getBoundingClientRect();
    const ratio = clamp(1 - (clientY - rect.top) / rect.height, 0, 1);
    set(min + ratio * (max - min));
  };

  let dragging = false;
  track.addEventListener('pointerdown', (event) => {
    dragging = true;
    node.classList.add('is-dragging');
    track.setPointerCapture(event.pointerId);
    fromPointer(event.clientY);
    haptic(4);
  });
  track.addEventListener('pointermove', (event) => { if (dragging) fromPointer(event.clientY); });
  const drop = () => { dragging = false; node.classList.remove('is-dragging'); };
  track.addEventListener('pointerup', drop);
  track.addEventListener('pointercancel', drop);
  node.addEventListener('dblclick', () => { set(0); replay(node, 'is-snap'); haptic(6); });
  node.addEventListener('wheel', (event) => {
    event.preventDefault();
    set(db + (event.deltaY < 0 ? 0.5 : -0.5));
  }, { passive: false });
  node.addEventListener('keydown', (event) => {
    const step = { ArrowUp: 0.5, ArrowRight: 0.5, ArrowDown: -0.5, ArrowLeft: -0.5, PageUp: 3, PageDown: -3 }[event.key];
    if (step !== undefined) { event.preventDefault(); set(db + step); return; }
    if (event.key === 'Home' || event.key === '0') { event.preventDefault(); set(0); }
  });

  paint();
  return { node, sync: (next) => set(next, false) };
}

/* ------------------------------------------------------------------ curve --- */

/**
 * Draws the response curve, the band handles, and a faint live spectrum.
 * Returns a stop function; it also stops on its own once detached.
 */
function curve(canvas) {
  const ctx = canvas.getContext('2d');
  const POINTS = 220;
  const freqs = new Float32Array(POINTS);
  for (let i = 0; i < POINTS; i++) {
    freqs[i] = 20 * (22000 / 20) ** (i / (POINTS - 1));
  }
  const spectrum = new Float32Array(POINTS);
  let bins = null;
  let width = 0;
  let height = 0;

  const resize = () => {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width) return false;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = rect.width;
    height = rect.height;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return true;
  };
  new ResizeObserver(resize).observe(canvas);

  const accent = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '139 92 246';
  // Band centres line up with the faders: the columns are evenly spaced, and so
  // are the bands in log-frequency, which is what makes this work.
  const pad = () => width / (BANDS.length * 2);
  const xOf = (freq) => {
    const t = Math.log2(clamp(freq, 20, 22000) / FREQ_LO) / Math.log2(FREQ_HI / FREQ_LO);
    return pad() + t * (width - pad() * 2);
  };
  // A little headroom past the maximum band gain, so a full boost still has
  // somewhere to go and the shape stays readable.
  const yOf = (db) => height / 2 - (db / (MAX_GAIN + 3)) * (height / 2 - 6);

  function sampleSpectrum() {
    const analyser = getAnalyser();
    if (!analyser || player.audio.paused) {
      for (let i = 0; i < POINTS; i++) spectrum[i] *= 0.9;
      return;
    }
    if (!bins || bins.length !== analyser.frequencyBinCount) bins = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(bins);
    const nyquist = analyser.context.sampleRate / 2;
    for (let i = 0; i < POINTS; i++) {
      const bin = Math.min(bins.length - 1, Math.round((freqs[i] / nyquist) * bins.length));
      const value = bins[bin] / 255;
      spectrum[i] = value > spectrum[i] ? value : spectrum[i] * 0.86 + value * 0.14;
    }
  }

  function draw() {
    if (!width && !resize()) return;
    ctx.clearRect(0, 0, width, height);
    const primary = accent('--accent-rgb');
    const secondary = accent('--accent-2-rgb');

    // Grid: the 0 dB line, and a marker every 6 dB.
    ctx.lineWidth = 1;
    for (const db of [-12, -6, 0, 6, 12]) {
      ctx.strokeStyle = db === 0 ? 'rgb(255 255 255 / .16)' : 'rgb(255 255 255 / .05)';
      ctx.beginPath();
      ctx.moveTo(0, Math.round(yOf(db)) + 0.5);
      ctx.lineTo(width, Math.round(yOf(db)) + 0.5);
      ctx.stroke();
    }

    sampleSpectrum();
    ctx.fillStyle = `rgb(${secondary} / .16)`;
    ctx.beginPath();
    ctx.moveTo(0, height);
    for (let i = 0; i < POINTS; i++) ctx.lineTo(xOf(freqs[i]), height - spectrum[i] * height * 0.82);
    ctx.lineTo(width, height);
    ctx.closePath();
    ctx.fill();

    const state = eq();
    const dbs = response(freqs);
    const points = [];
    for (let i = 0; i < POINTS; i++) points.push([xOf(freqs[i]), yOf(dbs[i])]);

    const line = new Path2D();
    line.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) {
      const [x0, y0] = points[i - 1];
      const [x1, y1] = points[i];
      line.quadraticCurveTo(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
    }

    const under = new Path2D(line);
    under.lineTo(width, yOf(0));
    under.lineTo(0, yOf(0));
    under.closePath();
    const fade = ctx.createLinearGradient(0, 0, 0, height);
    fade.addColorStop(0, `rgb(${primary} / .3)`);
    fade.addColorStop(1, `rgb(${primary} / .02)`);
    ctx.fillStyle = fade;
    ctx.fill(under);

    const stroke = ctx.createLinearGradient(0, 0, width, 0);
    stroke.addColorStop(0, `rgb(${primary})`);
    stroke.addColorStop(1, `rgb(${secondary})`);
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 2.4;
    ctx.lineJoin = 'round';
    ctx.shadowColor = `rgb(${primary} / .7)`;
    ctx.shadowBlur = state.on ? 12 : 0;
    ctx.globalAlpha = state.on ? 1 : 0.35;
    ctx.stroke(line);
    ctx.shadowBlur = 0;

    // A handle per band, sitting on the curve.
    for (let b = 0; b < BANDS.length; b++) {
      const x = xOf(BANDS[b].freq);
      const y = yOf(state.gains[b] + (state.on ? state.preamp : 0));
      ctx.fillStyle = `rgb(${primary})`;
      ctx.beginPath();
      ctx.arc(x, y, 3.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgb(255 255 255 / .9)';
      ctx.beginPath();
      ctx.arc(x, y, 1.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // The panel is built before it is put on screen, so the loop waits to be
  // attached, and only gives up once it has been attached and then removed.
  let raf = 0;
  let attached = false;
  const loop = () => {
    if (canvas.isConnected) attached = true;
    else if (attached) return;
    raf = requestAnimationFrame(loop);
    if (attached) draw();
  };
  loop();
  return () => cancelAnimationFrame(raf);
}

/* ---------------------------------------------------------------- section --- */

/** The whole equaliser card, ready to drop into the settings dialog. */
export function eqSection() {
  const state = eq();
  const section = h('section.setting.setting--eq');

  const toggle = h('button.switch', {
    role: 'switch',
    'aria-label': 'Equalizer',
    onclick: () => {
      const next = !eq().on;
      setEqOn(next);
      paintHead();
      haptic(8);
      toast(next ? 'Equalizer on' : 'Equalizer off', 'eq');
    },
  }, h('i'));

  const summary = h('p');
  const head = h('div.setting-head', null,
    h('span.setting-icon', null, icon('eq')),
    h('div', null, h('b', null, 'Equalizer'), summary),
    toggle,
  );

  const canvas = h('canvas.eq-curve', { height: 128 });
  const faders = [];

  const preampFader = fader({
    label: 'PRE',
    ariaLabel: 'Preamp',
    value: state.preamp,
    min: -MAX_PREAMP,
    max: MAX_PREAMP,
    className: 'eq-band eq-band--pre',
    onInput: (db) => { setPreamp(db); paintHead(); },
  });

  for (const [index, band] of BANDS.entries()) {
    faders.push(fader({
      label: band.label,
      ariaLabel: `${band.freq} hertz`,
      value: state.gains[index],
      min: -MAX_GAIN,
      max: MAX_GAIN,
      onInput: (db) => { setBandGain(index, db); paintHead(); },
    }));
  }

  const presetRow = h('div.eq-presets', null, ...Object.keys(PRESETS).map((name) => h('button.chip', {
    dataset: { preset: name },
    onclick: () => {
      applyPreset(name);
      syncFaders();
      paintHead();
      haptic(6);
    },
  }, name)));

  const foot = h('div.setting-foot', null,
    h('div.eq-hint', null, icon('wave'), h('span', null, 'Drag a band, or double-click it to zero. Scroll and arrow keys work too.')),
    h('button.link-btn', {
      onclick: () => { resetEq(); syncFaders(); paintHead(); toast('Equalizer flattened', 'eq'); },
    }, 'Flatten'),
  );

  section.append(
    head,
    h('div.eq-panel', null,
      preampFader.node,
      h('div.eq-stack', null, canvas, h('div.eq-bands', null, ...faders.map((f) => f.node))),
    ),
    presetRow,
    foot,
  );

  function syncFaders() {
    const now = eq();
    preampFader.sync(now.preamp);
    faders.forEach((f, i) => f.sync(now.gains[i]));
  }

  function paintHead() {
    const now = eq();
    section.classList.toggle('is-off', !now.on);
    toggle.classList.toggle('is-on', now.on);
    toggle.setAttribute('aria-checked', String(now.on));
    summary.textContent = now.on
      ? (now.preset ? `${now.preset}${eqActive(now) ? '' : ' - no change to the sound'}` : 'Custom curve')
      : 'Off. Your music plays exactly as recorded.';
    for (const chip of presetRow.children) {
      chip.classList.toggle('is-on', now.on && chip.dataset.preset === now.preset);
    }
  }

  const stop = curve(canvas);

  const off = onEqChange(() => {
    if (!section.isConnected) { off(); stop(); return; }
    syncFaders();
    paintHead();
  });

  paintHead();
  if (reducedMotion()) canvas.classList.add('is-still');
  return section;
}
