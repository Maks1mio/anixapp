'use strict';

const { ipcMain, app, BrowserWindow } = require('electron');
const state = require('../lib/app-state');
const config = require('../lib/config-store');

/** Окно до Big Picture: после выхода из полноэкранного режима возвращаем те же размер и положение. */
const boundsBeforeFullScreen = new WeakMap();

function enterFullScreen(win) {
  if (win.isFullScreen()) return;
  boundsBeforeFullScreen.set(win, {
    bounds: win.getNormalBounds(),
    maximized: win.isMaximized(),
  });
  win.setFullScreen(true);
}

function leaveFullScreen(win) {
  const saved = boundsBeforeFullScreen.get(win);
  boundsBeforeFullScreen.delete(win);
  const restore = () => {
    if (!saved || win.isDestroyed()) return;
    if (saved.maximized) {
      win.maximize();
    } else {
      if (win.isMaximized()) win.unmaximize();
      win.setBounds(saved.bounds);
    }
  };
  if (!win.isFullScreen()) {
    restore();
    return;
  }
  win.once('leave-full-screen', () => {
    // Windows применяет размер после анимации выхода — ставим границы на следующем тике.
    setTimeout(restore, 50);
  });
  win.setFullScreen(false);
}

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
ipcMain.handle('window:isMaximized', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender) || state.mainWindow;
  return !!win && !win.isDestroyed() && win.isMaximized();
});
ipcMain.on('window:setFullScreen', (event, on) => {
  const win = BrowserWindow.fromWebContents(event.sender) || state.mainWindow;
  if (!win || win.isDestroyed()) return;
  if (on === true) enterFullScreen(win);
  else leaveFullScreen(win);
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
