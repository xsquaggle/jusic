/**
 * Ten-band equaliser.
 *
 * The bands sit between the player's source and the visualiser, so what you
 * see dancing is what you hear. Settings live with the rest of the app state,
 * and the graph picks them up whenever it is built.
 */

import { store, setSetting } from './store.js';
import { clamp } from './util.js';

export const BANDS = [
  { freq: 32, label: '32' },
  { freq: 64, label: '64' },
  { freq: 125, label: '125' },
  { freq: 250, label: '250' },
  { freq: 500, label: '500' },
  { freq: 1000, label: '1k' },
  { freq: 2000, label: '2k' },
  { freq: 4000, label: '4k' },
  { freq: 8000, label: '8k' },
  { freq: 16000, label: '16k' },
];

export const MAX_GAIN = 12;     // dB, either way
export const MAX_PREAMP = 9;    // dB, either way

/** Hand-tuned curves. The first is the one everything falls back to. */
export const PRESETS = {
  Flat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  'Bass boost': [6, 5.5, 4, 2, 0, 0, 0, 0, 1, 1.5],
  Warm: [3, 3, 2, 1, 0, -1, -2, -2.5, -1.5, -1],
  Vocals: [-3, -2.5, -1, 1, 3, 4, 3, 1.5, 0, -1],
  Bright: [-1, -1, 0, 0, 1, 1.5, 3, 4, 5, 4],
  Headphones: [4.5, 3.5, 1.5, 0, -1, 0, 1.5, 2.5, 3.5, 3],
  'Late night': [-4, -3, -1.5, 0, 1.5, 2, 2, 1, 0, -1],
  'Lo-fi': [2, 1, 0, -1, -2, -3.5, -5, -7, -9, -11],
};

const DEFAULTS = { on: false, preamp: 0, preset: 'Flat', gains: [...PRESETS.Flat] };

const listeners = new Set();
export const onEqChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const emit = () => { for (const fn of listeners) fn(eq()); };

/** Current settings, repaired if anything on disk looks wrong. */
export function eq() {
  const saved = store.settings.eq || {};
  const gains = BANDS.map((_, i) => {
    const value = Number(saved.gains?.[i]);
    return Number.isFinite(value) ? clamp(value, -MAX_GAIN, MAX_GAIN) : 0;
  });
  return {
    on: saved.on === true,
    preamp: Number.isFinite(Number(saved.preamp)) ? clamp(Number(saved.preamp), -MAX_PREAMP, MAX_PREAMP) : 0,
    preset: typeof saved.preset === 'string' ? saved.preset : matchPreset(gains),
    gains,
  };
}

/** The preset a curve corresponds to, or null when it has been nudged. */
export function matchPreset(gains) {
  for (const [name, values] of Object.entries(PRESETS)) {
    if (values.every((v, i) => Math.abs(v - gains[i]) < 0.05)) return name;
  }
  return null;
}

export const isFlat = (state = eq()) => state.gains.every((g) => Math.abs(g) < 0.05) && Math.abs(state.preamp) < 0.05;

/** True when the equaliser is actually changing the sound. */
export const eqActive = (state = eq()) => state.on && !isFlat(state);

function write(patch) {
  const next = { ...eq(), ...patch };
  next.preset = patch.preset !== undefined ? patch.preset : matchPreset(next.gains);
  setSetting('eq', next);
  applyToGraph(next);
  emit();
  return next;
}

// Moving a band means you want to hear it, so it switches on with the first nudge.
export const setBandGain = (index, db) => {
  const gains = eq().gains;
  gains[index] = clamp(Math.round(db * 2) / 2, -MAX_GAIN, MAX_GAIN);
  return write({ gains, on: true });
};
export const setPreamp = (db) => write({ preamp: clamp(Math.round(db * 2) / 2, -MAX_PREAMP, MAX_PREAMP), on: true });
export const setEqOn = (on) => write({ on: Boolean(on) });
export const applyPreset = (name) => write({ on: true, gains: [...(PRESETS[name] || PRESETS.Flat)], preset: name });
export const resetEq = () => write({ gains: [...PRESETS.Flat], preamp: 0, preset: 'Flat' });

/* ------------------------------------------------------------------ graph --- */

let filters = [];
let preampNode = null;

/**
 * Build the band chain for a context.
 * @returns {{input: AudioNode, output: AudioNode}} ends to splice into the graph.
 */
export function createEq(ctx) {
  preampNode = ctx.createGain();
  filters = BANDS.map(({ freq }, i) => {
    const node = ctx.createBiquadFilter();
    // Shelves at the ends, so the lowest and highest bands lift everything
    // beyond them instead of poking a hole in the middle of nowhere.
    node.type = i === 0 ? 'lowshelf' : i === BANDS.length - 1 ? 'highshelf' : 'peaking';
    node.frequency.value = freq;
    if (node.type === 'peaking') node.Q.value = 1.1;
    return node;
  });

  let node = preampNode;
  for (const filter of filters) {
    node.connect(filter);
    node = filter;
  }
  applyToGraph(eq());
  return { input: preampNode, output: node };
}

/** Slide to new values rather than stepping, which would click. */
function applyToGraph(state = eq()) {
  if (!preampNode) return;
  const ctx = preampNode.context;
  const at = ctx.currentTime + 0.02;
  const live = state.on;
  preampNode.gain.setTargetAtTime(live ? 10 ** (state.preamp / 20) : 1, at, 0.02);
  filters.forEach((filter, i) => filter.gain.setTargetAtTime(live ? state.gains[i] : 0, at, 0.02));
}

/**
 * The curve the current settings describe, in dB, across a set of frequencies.
 * It always reflects the settings, even while bypassed, so the panel can show
 * a dimmed version of what turning the equaliser on would do.
 * @param {Float32Array} freqs
 * @returns {Float32Array}
 */
export function response(freqs) {
  const out = new Float32Array(freqs.length);
  const state = eq();

  if (filters.length && state.on) {
    const mag = new Float32Array(freqs.length);
    const phase = new Float32Array(freqs.length);
    for (const filter of filters) {
      filter.getFrequencyResponse(freqs, mag, phase);
      for (let i = 0; i < out.length; i++) out[i] += 20 * Math.log10(Math.max(mag[i], 1e-6));
    }
  } else {
    // No graph yet, or bypassed: approximate each band with a bell of its own.
    for (let i = 0; i < freqs.length; i++) {
      let db = 0;
      BANDS.forEach(({ freq }, b) => {
        const octaves = Math.log2(freqs[i] / freq);
        const width = b === 0 || b === BANDS.length - 1 ? 1.7 : 1.15;
        db += state.gains[b] * Math.exp(-((octaves / width) ** 2));
      });
      out[i] = db;
    }
  }

  for (let i = 0; i < out.length; i++) out[i] += state.preamp;
  return out;
}
