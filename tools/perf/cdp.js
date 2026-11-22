'use strict';
/**
 * A small Chrome DevTools Protocol client: Node 24's own fetch and WebSocket, no dependencies.
 * Drives the page with real input events (so clicks count as user gestures) and takes screenshots.
 */
const fs = require('fs');

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

async function connect(port, match = () => true, timeout = 30000) {
  const until = Date.now() + timeout;
  let target;
  while (!target) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      target = list.find((t) => t.type === 'page' && match(t));
    } catch { /* not listening yet */ }
    if (!target) {
      if (Date.now() > until) throw new Error('no DevTools page on port ' + port);
      await sleep(250);
    }
  }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((ok, no) => { ws.onopen = ok; ws.onerror = () => no(new Error('DevTools socket refused')); });
  const waiting = new Map();
  let id = 0;
  ws.onmessage = (message) => {
    const msg = JSON.parse(message.data);
    const w = waiting.get(msg.id);
    if (!w) return;
    waiting.delete(msg.id);
    if (msg.error) w.no(new Error(msg.error.message)); else w.ok(msg.result);
  };
  const send = (method, params = {}) => new Promise((ok, no) => {
    waiting.set(++id, { ok, no });
    ws.send(JSON.stringify({ id, method, params }));
  });

  const page = {
    send,
    close: () => ws.close(),
    async eval(expression) {
      const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
      return r.result.value;
    },
    /** A point inside the first visible match of a selector: fx, fy are fractions of its box. */
    async at(selector, fx = 0.5, fy = 0.5) {
      const p = await page.eval(`(() => { for (const el of document.querySelectorAll(${JSON.stringify(selector)})) {
        const r = el.getBoundingClientRect();
        if (r.width && r.height && r.bottom > 0 && r.top < innerHeight) return [r.left + r.width * ${fx}, r.top + r.height * ${fy}];
      } return null; })()`);
      if (!p) throw new Error('nothing visible matches ' + selector);
      return p;
    },
    mouse: (type, x, y, more = {}) => send('Input.dispatchMouseEvent', { type, x, y, button: 'none', ...more }),
    async click(x, y, button = 'left') {
      await page.mouse('mouseMoved', x, y);
      await page.mouse('mousePressed', x, y, { button, clickCount: 1 });
      await page.mouse('mouseReleased', x, y, { button, clickCount: 1 });
    },
    async clickOn(selector, fx, fy) { const [x, y] = await page.at(selector, fx, fy); await page.click(x, y); },
    wheel: (x, y, deltaY) => page.mouse('mouseWheel', x, y, { deltaX: 0, deltaY }),
    /** Moves the pointer from a to b (and on through any further points) at 60 events a second. */
    async sweep(points, seconds, more = {}) {
      const steps = Math.max(1, Math.round(seconds * 60));
      const started = Date.now();
      for (let i = 0; i <= steps; i++) {
        const f = (i / steps) * (points.length - 1);
        const k = Math.min(points.length - 2, Math.floor(f));
        const [a, b] = [points[k], points[k + 1]];
        await page.mouse('mouseMoved', a[0] + (b[0] - a[0]) * (f - k), a[1] + (b[1] - a[1]) * (f - k), more);
        await sleep(Math.max(0, started + ((i + 1) * 1000) / 60 - Date.now()));
      }
    },
    async key(key, code = key, keyCode = 0) {
      await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key, code, windowsVirtualKeyCode: keyCode });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: keyCode });
    },
    async type(text, perSecond = 10) {
      for (const ch of text) { await send('Input.dispatchKeyEvent', { type: 'char', text: ch }); await sleep(1000 / perSecond); }
    },
    async screenshot(file) {
      const { data } = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(file, Buffer.from(data, 'base64'));
      return file;
    },
  };
  return page;
}

module.exports = { connect, sleep };
