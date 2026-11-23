/**
 * The stage 2 material spike: the frosted glass on the library layout, nothing else.
 *
 * It shows the demo library when a capture tool has put one on window.__demo (so committed
 * pictures never show a real library), and otherwise a few tracks from the real one.
 * Click the cover, or call spike.next(), to pour the next track's colours through the glass.
 */
import { glass, setPalette, currentPalette, MODE } from './glass.js';
import { ribbonShape, seekPath, drawLine } from './ribbon.js';
import { paletteFromImage } from './palette.js';

const $ = (sel) => document.querySelector(sel);
const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
const ERA_COLORS = { '2020s': '#c8616a', '2010s': '#a8607e', '2000s': '#5f78a8', '1990s': '#9a5a8c', '1980s': '#a05560', '1970s': '#b07a3c' };

async function tracks() {
  if (window.__demo) {                                        // the references' six tracks; ?blue leads with the blue cover
    const t = window.__demo.tracks;
    return new URLSearchParams(location.search).has('blue') ? [t[6], ...t.slice(1, 6)] : t.slice(0, 6);
  }
  const [{ tracks: all }, state] = await Promise.all([fetch('/api/library').then((r) => r.json()), fetch('/api/state').then((r) => r.json())]);
  const withArt = all.filter((t) => t.art && !t.isCopy);
  const first = withArt.find((t) => t.id === state.resume?.id) || withArt[0];
  const seen = new Set([first.art]);
  const rest = withArt.filter((t) => !seen.has(t.art) && seen.add(t.art)).slice(0, 8);   // one per cover, for variety
  return [first, ...rest].map((t) => ({
    title: t.title, artist: t.artist || 'Unknown artist', album: t.album || t.session || '', era: t.year ? `${Math.floor(t.year / 10)}0s` : '',
    time: fmt(t.duration || 0), cover: '/api/art/' + encodeURIComponent(t.art),
  }));
}

const list = await tracks();
let playing = 0;

$('#count').textContent = `${list.length} tracks`;
$('#rows').innerHTML = list.map((t, i) => `
  <div class="row${i === 0 ? ' is-current' : ''}" data-i="${i}">
    <svg class="ic bars"><use href="#i-bars"/></svg><img src="${t.cover}" alt="" loading="lazy">
    <span class="title">${t.title}</span><span>${t.artist}</span><span>${t.album}</span>
    <span class="chip" style="--era:${ERA_COLORS[t.era] || '#a66'}">${t.era || 'unknown'}</span><span class="num">${t.time}</span>
  </div>`).join('');

/* --------------------------------------------------------------- the glass --- */

const ribbon = $('#ribbon');
glass($('#room'), { mode: MODE.room, bleed: 0 });
const melt = () => [1.15 * ribbon.offsetHeight, 0.55 * ribbon.offsetHeight];   // panels melt away behind the ribbon
glass($('#sidebar'), { radius: 30, rim: 18, body: 0.6, melt });
glass($('#list'), { radius: 28, rim: 16, body: 0.42, melt });
glass($('#search'), { radius: 23, rim: 11, body: 0.5, bleed: 16 });
glass($('#sort'), { radius: 23, rim: 11, body: 0.5, bleed: 16 });
glass($('#nav-active'), { radius: 22, rim: 10, body: 0.6, glow: 0.9, bleed: 16 });
glass(ribbon, { shape: ribbonShape, rim: 34, body: 0.7, bleed: 44, pour: true });
for (const bowl of document.querySelectorAll('.bowl')) glass(bowl, { mode: MODE.bowl, hot: true, bleed: 18 });
const currentRow = () => $('.row.is-current');
let rowGlass = null;
const markRow = () => { rowGlass = glass(currentRow(), { radius: 22, rim: 7, body: 0.5, glow: 0.8, bleed: 14 }); };
markRow();

/* ------------------------------------------------------ what's playing --- */

const seek = $('#seek');
const LENGTH = 226;                 // a pretend song, so the cost of "playing" can be measured without audio
let position = 88;
function lines() {
  const w = ribbon.offsetWidth, u = ribbon.offsetHeight;
  const path = seekPath(w, u);
  drawLine(seek, { w, h: u, ...path, value: position / LENGTH, color: currentPalette().a });
  // the volume line shares the canvas: a short run on the pod's upper lip
  const ctx = seek.getContext('2d');
  const x0 = w - 0.88 * u, x1 = w - 0.3 * u, y = 0.225 * u, head = x0 + (x1 - x0) * 0.72, [r, g, b] = currentPalette().a;
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgb(255 255 255 / .26)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(head, y); ctx.lineTo(x1, y); ctx.stroke();
  ctx.shadowColor = `rgb(${r} ${g} ${b})`; ctx.shadowBlur = 10;
  ctx.strokeStyle = '#fff6f0'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(head, y); ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(head, y, 5, 0, 7); ctx.fill();
  ctx.shadowBlur = 0;
}
let settle = 0;                     // the line stretches with the ribbon and is redrawn once the size settles
new ResizeObserver(() => { clearTimeout(settle); settle = setTimeout(lines, 150); }).observe(ribbon);

const cover = $('#cover');
async function show(i, pour) {
  const t = list[playing = (i + list.length) % list.length];
  $('#now-title').textContent = t.title;
  $('#now-artist').textContent = t.artist;
  $('#now-dur').textContent = t.time;
  const image = new Image();
  image.src = t.cover;
  await image.decode();
  cover.src = t.cover;
  const p = paletteFromImage(image);
  document.documentElement.style.setProperty('--a', p.a.join(' '));
  const box = cover.getBoundingClientRect();
  setPalette(p, pour ? { x: box.left + box.width / 2, y: box.top + box.height / 2 } : null);
  if (window.desktop) window.desktop.overlay('#00000000', '#ffffff');
  lines();
  setTimeout(lines, 1200);                                   // once the pour has landed
}

// A pretend transport: the seek line moves 5 times a second, the time once a second, and the next
// cover pours in when the song ends. This is everything the playing library view has to draw.
const clock = $('.time--cur');
let timer = 0;
function tick() {
  position += 0.2;
  if (position >= LENGTH) { position = 0; show(playing + 1, true); }
  lines();
  const text = fmt(Math.floor(position));
  if (clock.textContent !== text) clock.textContent = text;
}
function toggle() {
  clearInterval(timer);
  timer = spike.playing ? 0 : setInterval(tick, 200);
  spike.playing = !spike.playing;
  $('.bowl--play use').setAttribute('href', spike.playing ? '#i-pause' : '#i-play');
}
cover.addEventListener('click', () => show(playing + 1, true));
$('.bowl--next').addEventListener('click', () => show(playing + 1, true));
$('.bowl--prev').addEventListener('click', () => show(playing - 1, true));
$('.bowl--play').addEventListener('click', toggle);
window.spike = {
  playing: false, toggle, next: () => show(playing + 1, true), show: (i, pour = false) => show(i, pour),
  seekTo: (fromEnd) => { position = LENGTH - fromEnd; lines(); },
  ready: show(0, false),
};
$('.bowl--play use').setAttribute('href', '#i-play');
