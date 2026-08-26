'use strict';

const { ipcMain } = require('electron');
const {
  setExtraVideoHosts,
  addExtraVideoHosts,
  getExtraVideoHosts,
  persistExtraVideoHosts,
} = require('../lib/extra-video-hosts');

function register() {
  ipcMain.handle('video:setExtraHosts', (_, hosts) => {
    const next = setExtraVideoHosts(hosts);
    persistExtraVideoHosts();
    return next;
  });
  ipcMain.handle('video:addExtraHosts', (_, hosts) => {
    addExtraVideoHosts(Array.isArray(hosts) ? hosts : [hosts]);
    persistExtraVideoHosts();
    return getExtraVideoHosts();
  });
}

module.exports = { register };
