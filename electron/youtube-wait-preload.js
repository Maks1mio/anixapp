'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('anixYtWait', {
  done: () => ipcRenderer.send('youtube-wait:done'),
  cancel: () => ipcRenderer.send('youtube-wait:cancel'),
});
