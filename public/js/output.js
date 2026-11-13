/**
 * Audio output selection.
 *
 * Chromium routes audio to a chosen device with setSinkId, but only lists
 * devices by name once the page has been granted media access. That permission
 * is asked for once, the microphone stream is stopped the instant it opens, and
 * the app window's profile remembers the grant, so the chosen device comes back
 * on every launch.
 */

import { toast } from './util.js';
import { store, setSetting } from './store.js';
import { setOutputDevice, outputDevice } from './player.js';

export const outputSupported =
  typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype &&
  Boolean(navigator.mediaDevices?.enumerateDevices);

let devices = [];
let named = false;
const listeners = new Set();

export const onOutputsChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const emit = () => { for (const fn of listeners) fn(); };

/** "Headphones (Arctis 7 Game) (1038:12ad)" -> "Headphones (Arctis 7 Game)" */
export function cleanLabel(label) {
  return String(label || '').replace(/\s*\([0-9a-f]{4}:[0-9a-f]{4}\)\s*$/i, '').trim();
}

export async function refreshOutputs() {
  if (!outputSupported) return [];
  const all = await navigator.mediaDevices.enumerateDevices();
  const outs = all.filter((d) => d.kind === 'audiooutput');
  named = outs.some((d) => d.deviceId && d.label);
  // "communications" is Windows' duplicate of a real device, not a destination of its own.
  devices = outs.filter((d) => d.deviceId && d.deviceId !== 'communications');
  return devices;
}

export const outputs = () => devices;
export const outputsNamed = () => named;

/** Ask once for access so device names become visible. Throws if refused. */
export async function unlockOutputs() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  stream.getTracks().forEach((track) => track.stop());
  await refreshOutputs();
  emit();
  return devices;
}

/** The device jusic is set to use ('' means the system default). */
export const selectedOutput = () => {
  const id = store.settings.audioOutput?.deviceId;
  return id && id !== 'default' ? id : '';
};

export function outputName(deviceId) {
  if (!deviceId || deviceId === 'default') {
    const def = devices.find((d) => d.deviceId === 'default');
    const underlying = def ? cleanLabel(def.label.replace(/^Default\s*-\s*/i, '')) : '';
    return underlying ? `System default (${underlying})` : 'System default';
  }
  const d = devices.find((x) => x.deviceId === deviceId);
  return d ? cleanLabel(d.label) : store.settings.audioOutput?.label || 'Selected device';
}

/** Route playback to a device and remember the choice. */
export async function chooseOutput(deviceId) {
  const id = deviceId && deviceId !== 'default' ? deviceId : '';
  await setOutputDevice(id);
  setSetting('audioOutput', { deviceId: id, label: id ? outputName(id) : '' });
  emit();
}

/**
 * Re-apply the saved device. Falls back to the default quietly when it isn't
 * connected, and switches back when it returns.
 */
async function restore({ announce = false } = {}) {
  const wanted = selectedOutput();
  if (!wanted) {
    if (outputDevice()) await setOutputDevice('').catch(() => {});
    return;
  }
  const present = devices.some((d) => d.deviceId === wanted);
  // Without named devices we can't see it in the list, but it may still accept the id.
  if (present || !named) {
    if (outputDevice() === wanted) return;
    try {
      await setOutputDevice(wanted);
      if (announce) toast(`Playing through ${outputName(wanted)}`, 'headphones');
      return;
    } catch { /* not available right now */ }
  }
  if (outputDevice()) {
    await setOutputDevice('').catch(() => {});
    if (announce) toast(`${store.settings.audioOutput?.label || 'Your output'} disconnected · using system default`, 'vol');
  }
}

export async function initOutput() {
  if (!outputSupported) return;
  try {
    await refreshOutputs();
    await restore();
  } catch (err) {
    console.warn('audio output restore failed', err);
  }
  navigator.mediaDevices.addEventListener('devicechange', async () => {
    try {
      await refreshOutputs();
      await restore({ announce: true });
    } catch { /* devices changing mid-query */ }
    emit();
  });
}

/** A short two-note chime rendered to WAV, so the test needs no network or files. */
function chimeUrl() {
  const rate = 44100;
  const length = Math.floor(rate * 0.9);
  const data = new Int16Array(length);
  const notes = [[523.25, 0], [783.99, 0.14]];
  for (let i = 0; i < length; i++) {
    const t = i / rate;
    let v = 0;
    for (const [freq, start] of notes) {
      if (t < start) continue;
      const local = t - start;
      const env = Math.min(1, local / 0.01) * Math.exp(-local * 5.5);
      v += Math.sin(2 * Math.PI * freq * local) * env + 0.25 * Math.sin(4 * Math.PI * freq * local) * env;
    }
    data[i] = Math.max(-1, Math.min(1, v * 0.35)) * 32767;
  }
  const buffer = new ArrayBuffer(44 + data.length * 2);
  const view = new DataView(buffer);
  const text = (offset, s) => { for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i)); };
  text(0, 'RIFF'); view.setUint32(4, 36 + data.length * 2, true); text(8, 'WAVE');
  text(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  text(36, 'data'); view.setUint32(40, data.length * 2, true);
  new Int16Array(buffer, 44).set(data);
  return URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' }));
}

export async function playTestSound(deviceId = selectedOutput()) {
  const url = chimeUrl();
  const test = new Audio(url);
  test.volume = Math.max(0.35, store.settings.volume ?? 0.85);
  if (outputSupported) await test.setSinkId(deviceId || '');
  test.addEventListener('ended', () => URL.revokeObjectURL(url), { once: true });
  await test.play();
}
