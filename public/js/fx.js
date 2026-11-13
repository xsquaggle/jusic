/**
 * Feel: the small physical responses that make the interface satisfying to
 * touch. Ripples, tilt, heart bursts, sliding indicators, the beat pulse and
 * the colour glide between covers. None of it is load-bearing, and all of it
 * steps aside when the system asks for reduced motion.
 */

import { $, $$, clamp } from './util.js';

const reduceQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
export const reducedMotion = () => reduceQuery.matches;

/** A short buzz on devices that have a motor; a no-op everywhere else. */
export function haptic(pattern = 8) {
  if (reducedMotion()) return;
  try { navigator.vibrate?.(pattern); } catch { /* not allowed here */ }
}

/**
 * Restart a one-shot CSS animation class. The class is left in place afterwards:
 * the animations often run on children, whose end events would otherwise cut
 * their siblings short.
 */
export function replay(node, cls) {
  if (!node) return;
  node.classList.remove(cls);
  void node.offsetWidth;
  node.classList.add(cls);
}

/* ---------------------------------------------------------------- ripple --- */

const RIPPLE_TARGETS = '.pill, .play-btn, .row, .nav-item, .card, .seg button, .device, .chip, .pl-pick button, .era-pick button, .menu button, .rail-tab';

function wireRipples() {
  document.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || reducedMotion()) return;
    const host = event.target.closest(RIPPLE_TARGETS);
    // A click on a button nested inside a row belongs to the button.
    if (!host || host.disabled) return;
    const inner = event.target.closest('button, a');
    if (inner && inner !== host && host.contains(inner)) return;

    const rect = host.getBoundingClientRect();
    const size = Math.hypot(rect.width, rect.height) * 2;
    // The wave lives in its own clipping box, so hosts keep their overflow
    // (active-item bars and badges sit outside some of them).
    const box = document.createElement('span');
    box.className = 'ripple-box';
    const wave = document.createElement('span');
    wave.className = 'ripple';
    wave.style.width = wave.style.height = size + 'px';
    wave.style.left = event.clientX - rect.left - size / 2 + 'px';
    wave.style.top = event.clientY - rect.top - size / 2 + 'px';
    box.append(wave);
    host.classList.add('has-ripple');
    host.append(box);
    wave.addEventListener('animationend', () => box.remove(), { once: true });
  });
}

/* ------------------------------------------------------------------ tilt --- */

/**
 * Cover art leans toward the pointer and catches a highlight, like a sleeve
 * held up to the light.
 */
export function tilt(node, { max = 7, lift = 1.02 } = {}) {
  let frame = 0;
  let target = null;

  const apply = () => {
    frame = 0;
    if (!target) {
      node.style.removeProperty('--tilt-x');
      node.style.removeProperty('--tilt-y');
      node.style.removeProperty('--tilt-s');
      node.style.removeProperty('--glare-x');
      node.style.removeProperty('--glare-y');
      node.classList.remove('is-tilting');
      return;
    }
    const { x, y } = target;
    node.classList.add('is-tilting');
    node.style.setProperty('--tilt-x', ((0.5 - y) * max).toFixed(2) + 'deg');
    node.style.setProperty('--tilt-y', ((x - 0.5) * max).toFixed(2) + 'deg');
    node.style.setProperty('--tilt-s', lift);
    node.style.setProperty('--glare-x', (x * 100).toFixed(1) + '%');
    node.style.setProperty('--glare-y', (y * 100).toFixed(1) + '%');
  };

  node.classList.add('tilt');
  node.addEventListener('pointermove', (event) => {
    if (reducedMotion() || event.pointerType === 'touch') return;
    const rect = node.getBoundingClientRect();
    target = {
      x: clamp((event.clientX - rect.left) / rect.width, 0, 1),
      y: clamp((event.clientY - rect.top) / rect.height, 0, 1),
    };
    frame ||= requestAnimationFrame(apply);
  });
  node.addEventListener('pointerleave', () => {
    target = null;
    frame ||= requestAnimationFrame(apply);
  });
}

/* ----------------------------------------------------------------- burst --- */

/** Hearts spray out of a button when something is favourited. */
export function burst(button) {
  if (!button) return;
  replay(button, 'is-burst');
  haptic([6, 30, 10]);
  if (reducedMotion()) return;

  const rect = button.getBoundingClientRect();
  if (!rect.width) return;
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const count = 9;

  for (let i = 0; i < count; i++) {
    const bit = document.createElement('i');
    bit.className = 'spark' + (i % 3 === 0 ? ' spark--heart' : '');
    const angle = (i / count) * Math.PI * 2 + Math.random() * 0.5;
    const distance = 22 + Math.random() * 20;
    bit.style.left = cx + 'px';
    bit.style.top = cy + 'px';
    bit.style.setProperty('--dx', (Math.cos(angle) * distance).toFixed(1) + 'px');
    bit.style.setProperty('--dy', (Math.sin(angle) * distance).toFixed(1) + 'px');
    bit.style.setProperty('--rot', Math.round(Math.random() * 90 - 45) + 'deg');
    bit.style.animationDelay = Math.round(Math.random() * 40) + 'ms';
    document.body.append(bit);
    bit.addEventListener('animationend', () => bit.remove(), { once: true });
  }
}

/* --------------------------------------------------------------- gliders --- */

/**
 * One highlight that slides between the options of a group, instead of each
 * option flashing its own background on and off.
 */
export function glider(container, activeSelector) {
  const pill = document.createElement('span');
  pill.className = 'glider';
  pill.setAttribute('aria-hidden', 'true');
  container.prepend(pill);
  container.classList.add('has-glider');

  let placed = false;
  const update = () => {
    const active = container.querySelector(activeSelector);
    if (!active || !active.offsetParent) {
      pill.classList.remove('is-on');
      return;
    }
    const box = container.getBoundingClientRect();
    const rect = active.getBoundingClientRect();
    if (!placed) pill.classList.add('no-anim');
    pill.style.width = rect.width + 'px';
    pill.style.height = rect.height + 'px';
    pill.style.transform = `translate(${rect.left - box.left + container.scrollLeft - container.clientLeft}px, ${rect.top - box.top + container.scrollTop - container.clientTop}px)`;
    pill.classList.add('is-on');
    if (!placed) {
      void pill.offsetWidth;
      pill.classList.remove('no-anim');
      placed = true;
    }
  };

  new ResizeObserver(update).observe(container);
  // Only a change in which option is active matters. Ripples and the glider's
  // own classes also touch `class`, and reacting to those would loop.
  const flipped = (r) => r.target !== pill &&
    /\bis-active\b/.test(r.oldValue || '') !== r.target.classList.contains('is-active');
  new MutationObserver((records) => { if (records.some(flipped)) update(); })
    .observe(container, { subtree: true, attributes: true, attributeFilter: ['class'], attributeOldValue: true });
  document.fonts?.ready.then(update);
  update();
  return update;
}

/* ---------------------------------------------------------- colour glide --- */

let glideFrame = 0;
const liveAccent = { a: null, b: null };

const readRgb = (name) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim().split(/\s+/).map(Number);

/**
 * Blend the accent colours to a new cover's palette over most of a second,
 * so the whole room shifts tone rather than cutting to it.
 */
export function glideAccent(toA, toB, duration = 900) {
  const root = document.documentElement;
  cancelAnimationFrame(glideFrame);

  const fromA = liveAccent.a || readRgb('--accent-rgb');
  const fromB = liveAccent.b || readRgb('--accent-2-rgb');
  if (reducedMotion() || fromA.length !== 3 || fromB.length !== 3) {
    liveAccent.a = toA; liveAccent.b = toB;
    root.style.setProperty('--accent-rgb', toA.join(' '));
    root.style.setProperty('--accent-2-rgb', toB.join(' '));
    return;
  }

  const start = performance.now();
  const ease = (t) => 1 - (1 - t) ** 3;
  const mix = (from, to, t) => from.map((v, i) => Math.round(v + (to[i] - v) * t));

  const step = (now) => {
    const t = ease(Math.min(1, (now - start) / duration));
    liveAccent.a = mix(fromA, toA, t);
    liveAccent.b = mix(fromB, toB, t);
    root.style.setProperty('--accent-rgb', liveAccent.a.join(' '));
    root.style.setProperty('--accent-2-rgb', liveAccent.b.join(' '));
    if (t < 1) glideFrame = requestAnimationFrame(step);
  };
  glideFrame = requestAnimationFrame(step);
}

/* ------------------------------------------------------------------ beat --- */

let beatNodes = [];
let lastBeat = -1;

/**
 * Feed the current low-end energy (0..1). A few elements pulse with it:
 * the glow behind the cover, the play button, the room light and the seek bar.
 */
export function setBeat(value) {
  const v = reducedMotion() ? 0 : Math.round(clamp(value, 0, 1) * 100) / 100;
  if (v === lastBeat) return;
  lastBeat = v;
  if (!beatNodes.length) beatNodes = $$('[data-beat]');
  for (const node of beatNodes) node.style.setProperty('--beat', v);
}

/* ---------------------------------------------------------------- scroll --- */

/** The header art eases back and the column labels gain depth as you scroll. */
function wireScroll() {
  const scroller = $('#scroller');
  const hero = $('#hero');
  let frame = 0;
  const update = () => {
    frame = 0;
    const y = scroller.scrollTop;
    const progress = clamp(y / Math.max(1, hero.offsetHeight), 0, 1);
    hero.style.setProperty('--hs', progress.toFixed(3));
    const head = scroller.querySelector('.list-head');
    if (head) head.classList.toggle('is-stuck', head.getBoundingClientRect().top - scroller.getBoundingClientRect().top <= 1 && y > 0);
  };
  scroller.addEventListener('scroll', () => { frame ||= requestAnimationFrame(update); }, { passive: true });
  return update;
}

let onScrollUpdate = () => {};
export const refreshScrollFx = () => onScrollUpdate();

export function initFx() {
  wireRipples();
  onScrollUpdate = wireScroll();
  tilt($('#np-art'), { max: 9, lift: 1.025 });
  tilt($('#hero-art'), { max: 10, lift: 1.03 });
}
