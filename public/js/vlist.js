/**
 * A virtualised list: however many items there are, only the rows on screen (and a few either
 * side) exist as elements, and they are reused as the list scrolls. Rows have one fixed height,
 * so nothing is ever measured.
 */

/**
 * @param {HTMLElement} scroller  the element that scrolls
 * @param {object} options
 * @param {number} options.rowHeight  CSS pixels, the same for every row
 * @param {function(): HTMLElement} options.create  makes one empty row
 * @param {function(HTMLElement, number): void} options.fill  shows item i in a row
 * @returns {{ setCount(n: number): void, refresh(): void, scrollTo(i: number): void, top(i: number): number }}
 */
export function virtualList(scroller, { rowHeight, create, fill, overscan = 4 }) {
  const content = document.createElement('div');
  content.className = 'vlist';
  scroller.append(content);
  const rows = new Map();          // index -> row element in use
  const spare = [];
  let count = 0;
  let from = 0, to = -1;

  function update(force = false) {
    const first = Math.max(0, Math.floor(scroller.scrollTop / rowHeight) - overscan);
    const last = Math.min(count - 1, Math.ceil((scroller.scrollTop + scroller.clientHeight) / rowHeight) + overscan);
    if (!force && first === from && last === to) return;
    from = first; to = last;
    for (const [i, row] of rows) {
      if (i < first || i > last || force) { rows.delete(i); spare.push(row); }
    }
    for (let i = first; i <= last; i++) {
      if (rows.has(i)) continue;
      const row = spare.pop() || content.appendChild(create());
      row.style.transform = `translateY(${i * rowHeight}px)`;
      row.hidden = false;
      fill(row, i);
      rows.set(i, row);
    }
    for (const row of spare) row.hidden = true;
  }

  scroller.addEventListener('scroll', () => update(), { passive: true });
  new ResizeObserver(() => update()).observe(scroller);

  return {
    setCount(n) { count = n; content.style.height = n * rowHeight + 'px'; update(true); },
    refresh: () => update(true),
    scrollTo(i) { scroller.scrollTop = Math.max(0, i * rowHeight - (scroller.clientHeight - rowHeight) / 2); },
    top: (i) => i * rowHeight,
    content,
  };
}
