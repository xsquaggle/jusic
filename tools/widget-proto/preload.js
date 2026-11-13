'use strict';
/** The only things the widget page may ask of its window. */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('widgetHost', {
  /** true: clicks pass through the window to whatever is behind it. Mouse moves are still reported to the page. */
  setIgnore: (on) => ipcRenderer.send('widget:ignore', Boolean(on)),
  /** 'start' | 'move' | 'end': the window follows the cursor between start and end. */
  drag: (phase) => ipcRenderer.send('widget:drag', String(phase)),
  close: () => ipcRenderer.send('widget:close'),
});
