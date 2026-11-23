/**
 * The one scheduler. Anything that moves by itself runs through here, so there is a single place
 * that decides when the app is allowed to draw.
 *
 * Tasks are paced by the clock, not by display frames: this monitor offers 360 frames a second,
 * and a requestAnimationFrame loop (or a CSS animation) would take all of them. A task asks for
 * the rate it needs (the seek line 5 a second, a fade 30, the spectrum 60) and gets no more.
 * Nothing runs while the page is hidden (minimised or fully covered), and a task ends itself by
 * returning false, so when nothing is moving no timer is alive at all.
 */

const tasks = new Map();     // name -> { fn, every (ms), due (ms), motion }
let timer = 0;

const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
/** True when Windows asks for less motion or the in-app switch is on. Motion tasks don't start then. */
export const reducedMotion = () => reduce.matches || document.documentElement.classList.contains('reduce-motion');

function tick() {
  timer = 0;
  const now = performance.now();
  for (const [name, task] of tasks) {
    if (now < task.due - 1) continue;
    const late = now - task.due;
    task.due = now + task.every - Math.min(late, task.every);            // hold the rate without bursting to catch up
    if (task.fn(now) === false) tasks.delete(name);
  }
  arm();
}

function arm() {
  if (timer || !tasks.size || document.hidden) return;
  let next = Infinity;
  for (const task of tasks.values()) next = Math.min(next, task.due);
  timer = setTimeout(tick, Math.max(0, next - performance.now()));
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) { clearTimeout(timer); timer = 0; return; }
  const now = performance.now();
  for (const task of tasks.values()) task.due = now;                      // carry on from where things stopped
  arm();
});

/**
 * Runs fn(now) `fps` times a second until it returns false or stop(name) is called. Starting a
 * name that is already running replaces it. With motion: true it is skipped under reduced motion.
 */
export function run(name, fps, fn, { motion = false } = {}) {
  if (motion && reducedMotion()) return;
  tasks.set(name, { fn, every: 1000 / fps, due: performance.now(), motion });
  arm();
}

export function stop(name) {
  tasks.delete(name);
}

export const running = (name) => tasks.has(name);
