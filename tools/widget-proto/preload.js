'use strict';
/** The only things the widget page may ask of its window. */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('widgetHost', {
  /** true: clicks pass through the window to whatever is behind it. Mouse moves are still reported to the page. */
  setIgnore: (on) => ipcRenderer.send('widget:ignore', Boolean(on)),
  /** 'start' | 'move' | 'end': the window follows the cursor between start and end. */
  drag: (phase) => ipcRenderer.send('widget:drag', String(phase)),
  close: () => ipcRenderer.send('widget:close'),
  /**
   * Refraction. Resolves with which screen capture shows what is behind the window and
   * where the window sits on that screen: { sourceId, window: {x, y, width, height}, display: {...} }.
   */
  backdropSource: () => ipcRenderer.invoke('widget:backdrop'),
  /** Called with the same thing again whenever the window moves. */
  onPlacement: (fn) => { ipcRenderer.on('widget:placement', (event, placement) => fn(placement)); },
  /** Called with false when refraction is switched off from the tray menu, true when it is switched back on. */
  onRefract: (fn) => { ipcRenderer.on('widget:refract', (event, on) => fn(Boolean(on))); },
});
