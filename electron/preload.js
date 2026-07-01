const { contextBridge, ipcRenderer } = require('electron');

/**
 * Expose a safe `window.jarvisElectron` API to the renderer.
 * contextIsolation=true means the renderer cannot touch Node directly.
 */
contextBridge.exposeInMainWorld('jarvisElectron', {
  // Tell main process to resize/reposition the window
  setState: (state) => ipcRenderer.send('set-state', state),

  // Listen for commands from main process (tray clicks, reauth etc.)
  on: (channel, fn) => {
    const allowed = ['cmd:reauth', 'cmd:tray-click', 'cmd:test-mic'];
    if (allowed.includes(channel)) {
      ipcRenderer.on(channel, (_e, ...args) => fn(...args));
    }
  },

  off: (channel, fn) => {
    ipcRenderer.removeListener(channel, fn);
  },
});
