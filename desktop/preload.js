'use strict';
/**
 * The only bridge between the page and the desktop shell. The page works without it (a normal
 * browser tab has no `window.desktop`), so everything here is an extra, never a requirement.
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  /** Taskbar button: { playing, progress } with progress 0..1, or -1 for none. */
  transport: (state) => ipcRenderer.send('transport', state),
  /** Called with 'prev', 'toggle' or 'next' when a taskbar thumbnail button is pressed. */
  onTransport: (fn) => { ipcRenderer.on('transport', (event, what) => fn(what)); },
  /** Recolours Windows' caption buttons to sit on the glass. */
  overlay: (color, symbolColor) => ipcRenderer.send('overlay', color, symbolColor),
});

// Lets the stylesheet show the title bar only here.
window.addEventListener('DOMContentLoaded', () => document.documentElement.classList.add('is-desktop'));
