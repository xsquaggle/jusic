/**
 * The spectrum strip under the now-playing cover.
 * Bass sits in the middle and mirrors outward to the highs, with a faint
 * reflection below the baseline so it reads as sitting on a surface.
 */

import { getAnalyser, player } from './player.js';
import { store } from './store.js';
import { setBeat } from './fx.js';

const BANDS = 30;        // distinct frequency bands, mirrored to both sides
const DECAY = 0.82;      // how quickly a band falls back once the energy drops
const BASS_BANDS = 4;    // the lowest bands drive the pulse the rest of the UI feels

export function startVisualizer(canvas) {
  const ctx = canvas.getContext('2d');
  const levels = new Float32Array(BANDS);
  let frequencies = null;
  let bassAverage = 0;   // slow-moving loudness, so quiet and loud songs both pulse
  let pulse = 0;
  let width = 0;
  let height = 0;

  function resize() {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = rect.width;
    height = rect.height;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  resize();

  const accent = (name) =>
    getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '139 92 246';

  function sample() {
    const analyser = getAnalyser();
    if (!analyser) return false;
    if (!frequencies || frequencies.length !== analyser.frequencyBinCount) {
      frequencies = new Uint8Array(analyser.frequencyBinCount);
    }
    analyser.getByteFrequencyData(frequencies);

    // Spread bins logarithmically, otherwise the bass owns almost every band.
    const usable = Math.floor(frequencies.length * 0.7);
    for (let i = 0; i < BANDS; i++) {
      const from = Math.floor(usable * ((i / BANDS) ** 1.8));
      const to = Math.max(from + 1, Math.floor(usable * (((i + 1) / BANDS) ** 1.8)));
      let peak = 0;
      for (let j = from; j < to; j++) peak = Math.max(peak, frequencies[j]);
      // Lift the top end so highs stay visible next to the bass.
      const value = (peak / 255) * (0.7 + 0.75 * (i / BANDS));
      levels[i] = value > levels[i] ? value : levels[i] * DECAY + value * (1 - DECAY);
    }
    return true;
  }

  /** Kicks stand out against the recent average rather than an absolute level. */
  function updatePulse() {
    let bass = 0;
    for (let i = 0; i < BASS_BANDS; i++) bass += levels[i];
    bass /= BASS_BANDS;
    bassAverage += (bass - bassAverage) * 0.04;
    const hit = Math.max(0, bass - bassAverage * 0.92) * 3.2 + bass * 0.18;
    pulse = hit > pulse ? pulse + (hit - pulse) * 0.6 : pulse * 0.9;
    setBeat(pulse < 0.01 ? 0 : pulse);
  }

  function draw() {
    const live = sample();
    if (!live || player.audio.paused) {
      for (let i = 0; i < BANDS; i++) levels[i] *= 0.88;
    }
    updatePulse();

    if (!width || !height) { resize(); return; }
    ctx.clearRect(0, 0, width, height);

    let energy = 0;
    for (let i = 0; i < BANDS; i++) energy += levels[i];
    if (energy < 0.015) return;

    const total = BANDS * 2;
    const slot = width / total;
    const barW = Math.max(2, slot * 0.62);
    const radius = barW / 2;
    const baseline = height * 0.74;
    const maxUp = baseline - 2;
    const maxDown = height - baseline - 2;

    const primary = accent('--accent-rgb');
    const secondary = accent('--accent-2-rgb');

    const gradient = ctx.createLinearGradient(0, baseline - maxUp, 0, baseline);
    gradient.addColorStop(0, `rgb(${secondary})`);
    gradient.addColorStop(1, `rgb(${primary})`);

    for (let i = 0; i < total; i++) {
      // Low frequencies in the middle, mirroring outwards to the highs.
      const band = i < BANDS ? BANDS - 1 - i : i - BANDS;
      const level = Math.min(1, levels[band]);
      const up = Math.max(barW * 0.5, level * maxUp);
      const x = i * slot + (slot - barW) / 2;

      ctx.fillStyle = gradient;
      ctx.globalAlpha = 0.35 + level * 0.65;
      ctx.beginPath();
      ctx.roundRect(x, baseline - up, barW, up, radius);
      ctx.fill();

      // Reflection: shorter, dimmer, fading as it falls away.
      const down = Math.min(maxDown, up * 0.34);
      ctx.globalAlpha = (0.1 + level * 0.2);
      ctx.beginPath();
      ctx.roundRect(x, baseline + 2, barW, down, radius);
      ctx.fill();
    }

    ctx.globalAlpha = 1;
  }

  let raf = 0;
  function loop() {
    raf = requestAnimationFrame(loop);
    if (store.settings.viz !== false) draw();
    else {
      if (width) ctx.clearRect(0, 0, width, height);
      setBeat(0);
    }
  }
  loop();

  return () => { cancelAnimationFrame(raf); observer.disconnect(); };
}
