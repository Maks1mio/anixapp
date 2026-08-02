'use strict';

const { ipcMain } = require('electron');

function registerDevBridge(isDev, devApiBridge) {
  if (!isDev) return;
  ipcMain.handle('dev:getBridgeStatus', () => devApiBridge.getStatus());
  ipcMain.handle('dev:setBridgeEnabled', (_, enabled) => devApiBridge.setEnabled(!!enabled));
  ipcMain.handle('dev:regenerateBridgeToken', () => devApiBridge.regenerateToken());
}

function registerAll(deps) {
  require('./window-controls').register();
  require('./app-settings').register(deps);
  registerDevBridge(deps.isDev, deps.devApiBridge);
  require('./auth').register(deps);
  require('./anix-api').register(deps);
  require('../services/media').register(deps);
  require('../windows/player').register(deps);
  require('./shell-logs').register();
  require('./cdn').register();
  require('../services/updater').register();
  require('../windows/tools').register(deps);
}

module.exports = { registerAll };
