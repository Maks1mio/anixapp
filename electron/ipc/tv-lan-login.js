'use strict';

const { ipcMain } = require('electron');
const state = require('../lib/app-state');
const lan = require('../lib/tv-lan-login');

function register() {
  ipcMain.handle('tvLan:start', async () => {
    const result = await lan.start((creds) => {
      const wc = state.mainWindow?.webContents;
      if (wc && !wc.isDestroyed()) wc.send('tvLan:credentials', creds);
    });
    return result;
  });

  ipcMain.handle('tvLan:stop', async () => {
    await lan.stop();
    return true;
  });
}

module.exports = { register };
