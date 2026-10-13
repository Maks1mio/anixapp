'use strict';

const { ipcMain } = require('electron');
const cursor = require('../lib/win-cursor-pos');

function register() {
  ipcMain.handle('cursor:setScreenPos', (_evt, payload) => {
    const x = payload?.x;
    const y = payload?.y;
    return cursor.setCursorScreenPos(x, y);
  });
}

module.exports = { register };
