'use strict';
/** The only things the widget page may ask of its window. */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('widgetHost', {
  /** true: clicks pass through the window to whatever is behind it. Mouse moves are still reported to the page. */
  setIgnore: (on) => ipcRenderer.send('widget:ignore', Boolean(on)),
  /** 'start' | 'move' | 'end': the window follows the cursor between start and end. */
  drag: (phase) => ipcRenderer.send('widget:drag', String(phase)),
  close: () => ipcRenderer.send('widget:close'),
  /** The small beads by the end: open the full app; hide the widget (sent once the drop has melted away). */
  openApp: () => ipcRenderer.send('widget:open-app'),
  hide: () => ipcRenderer.send('widget:hide'),
  /** The tray's Show / hide: the page forms the drop (shown) or melts it away and then calls hide() (hiding). */
  onAppear: (fn) => { ipcRenderer.on('widget:appear', () => fn()); },
  onVanish: (fn) => { ipcRenderer.on('widget:vanish', () => fn()); },
  /**
   * Refraction. Resolves with which screen capture shows what is behind the window and
   * where the window sits on that screen: { sourceId, window: {x, y, width, height}, display: {...} }.
   */
  backdropSource: () => ipcRenderer.invoke('widget:backdrop'),
  /** Called with where the window now is ({ x, y }, screen DIPs) after each step of a drag: the glass sloshes with it. */
  onMoved: (fn) => { ipcRenderer.on('widget:moved', (event, p) => fn(p)); },
  /** Called with the same thing again whenever the window moves. */
  onPlacement: (fn) => { ipcRenderer.on('widget:placement', (event, placement) => fn(placement)); },
  /**
   * "Any media" proof (source=system). Called with what Windows says is playing on this PC, from
   * whatever app: { source, title, artist, playing, position, duration, updatedAt, rate, canNext, ...,
   * art (a data: URL or null) }, or { source: null } when nothing is.
   */
  onMedia: (fn) => { ipcRenderer.on('widget:media', (event, state) => fn(state)); },
  /** The spectrum of what the PC is playing, about 30 times a second: 16 numbers from 0 to 1, low to high. */
  onBands: (fn) => { ipcRenderer.on('widget:bands', (event, bands) => fn(bands)); },
  /** 'toggle' | 'play' | 'pause' | 'next' | 'prev' | 'seek' (with seconds): sent to the app that is playing. */
  media: (command, value) => ipcRenderer.send('widget:media-command', String(command), Number(value) || 0),
  /** Called with false when refraction is switched off from the tray menu, true when it is switched back on. */
  onRefract: (fn) => { ipcRenderer.on('widget:refract', (event, on) => fn(Boolean(on))); },
  /** Called with true when Reduced motion is switched on from the tray menu (as well as Windows' own setting), false off. */
  onReduced: (fn) => { ipcRenderer.on('widget:reduced', (event, on) => fn(Boolean(on))); },
});
