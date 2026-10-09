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
  require('./tv-lan-login').register();
  require('./anix-api').register(deps);
  require('../services/media').register(deps);
  require('../windows/player').register(deps);
  require('./extra-video-hosts').register();
  require('./shell-logs').register();
  require('./cdn').register();
  require('./cursor').register();
  require('../services/updater').register();
  require('../windows/tools').register(deps);

  const notifications = require('../services/system-notifications').createService(deps);
  notifications.registerIpc();

  const fcm = require('../services/fcm-push').createFcmPushService({
    notify: (payload) => notifications.notify(payload),
    getAnixart: deps.getAnixart,
  });
  deps.fcmPush = fcm;

  ipcMain.handle('notifications:fcmStatus', () => fcm.getStatus());
  ipcMain.handle('notifications:fcmSync', () => fcm.sync());

  // Подписка на FCM topic после старта (когда уже есть токен сессии).
  setTimeout(() => {
    void fcm.sync();
  }, 12_000);
}

module.exports = { registerAll };
