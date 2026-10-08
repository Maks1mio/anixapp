'use strict';

/**
 * Preload для окна-баннера уведомлений (notification-banner.html).
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('notificationBanner', {
  ready: () => ipcRenderer.send('notification-banner:ready'),
  onUpdate: (cb) => {
    const handler = (_e, payload) => {
      const items = Array.isArray(payload?.items) ? payload.items : (Array.isArray(payload) ? payload : []);
      const meta = payload && typeof payload === 'object' && !Array.isArray(payload)
        ? { position: payload.position, style: payload.style }
        : {};
      cb(items, meta);
    };
    ipcRenderer.on('notification-banner:update', handler);
    return () => ipcRenderer.removeListener('notification-banner:update', handler);
  },
  dismiss: (id) => ipcRenderer.send('notification-banner:dismiss', id),
  click: (payload) => ipcRenderer.send('notification-banner:click', payload || {}),
  setHeight: (height) => ipcRenderer.send('notification-banner:height', height),
  /** true = клики сквозь окно; false = ловить мышь на карточке */
  setIgnoreMouse: (ignore) => ipcRenderer.send('notification-banner:setIgnoreMouse', !!ignore),
});
