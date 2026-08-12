'use strict';

const { ipcMain, app, BrowserWindow } = require('electron');
const state = require('../lib/app-state');
const config = require('../lib/config-store');

function register() {

ipcMain.on('window:minimize', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender) || state.mainWindow;
  win?.minimize();
});
ipcMain.on('window:maximize', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender) || state.mainWindow;
  if (!win || win.isDestroyed()) return;
  if (win.isMaximized()) win.unmaximize();
  else win.maximize();
});
ipcMain.on('window:close', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender) || state.mainWindow;
  if (config.getMinimizeToTray() && win === state.mainWindow) {
    win?.hide();
  } else {
    state.isQuitting = true;
    app.quit();
  }
});

}

module.exports = { register };
