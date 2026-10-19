'use strict';

/**
 * Preload для скрытого окна воспроизведения звуков уведомлений.
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('notificationSound', {
  ready: () => {},
  onPlay: (cb) => {
    ipcRenderer.on('notification-sound:play', (_e, payload) => cb(payload || {}));
  },
  getVolume: () => ipcRenderer.invoke('notifications:soundVolume'),
});
