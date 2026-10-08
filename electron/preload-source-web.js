'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('anixSourceWeb', {
  selectEpisode: (position) => ipcRenderer.invoke('source-web:selectEpisode', Number(position)),
  onPlaylist: (cb) => {
    const handler = (_event, data) => {
      try { cb(data); } catch (_) { /* ignore */ }
    };
    ipcRenderer.on('source-web:playlist', handler);
    return () => ipcRenderer.removeListener('source-web:playlist', handler);
  },
  minimize: () => ipcRenderer.send('window:minimize'),
  close: () => ipcRenderer.send('player:close'),
  toggleAlwaysOnTop: () => ipcRenderer.invoke('player:toggleAlwaysOnTop'),
  platform: process.platform,
});
