const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('concord', {
  getSources: () => ipcRenderer.invoke('get-sources'),
  getCaptureEnv: () => ipcRenderer.invoke('get-capture-env'),
  setDisplaySource: (source) => ipcRenderer.invoke('set-display-source', source),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  getMediaAccess: () => ipcRenderer.invoke('get-media-access'),
  getAppVersion: () => ipcRenderer.invoke('updater:get-version'),
  checkForUpdates: () => ipcRenderer.invoke('updater:check'),
  installUpdate: () => ipcRenderer.invoke('updater:install'),
  onUpdaterEvent: (cb) => {
    const listener = (_event, payload) => cb(payload);
    ipcRenderer.on('updater:event', listener);
    return () => ipcRenderer.removeListener('updater:event', listener);
  },
});
