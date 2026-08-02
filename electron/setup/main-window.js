'use strict';

const path = require('path');
const { BrowserWindow } = require('electron');
const state = require('../lib/app-state');
const logger = require('../logger');
const { flushPendingDeepLink } = require('../lib/deep-link');

function createMainWindow(deps) {
  const { isDev, getIconPath, applyUiZoom, config, electronDir } = deps;

  const iconPath = getIconPath();
  const winOpts = {
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#0d0d0d',
    webPreferences: {
      preload: path.join(electronDir, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: true,
    },
    title: 'AnixApp',
    show: false,
  };
  if (iconPath) winOpts.icon = iconPath;
  state.mainWindow = new BrowserWindow(winOpts);
  logger.info('main', 'window created');

  if (isDev) {
    state.mainWindow.loadURL('http://127.0.0.1:5173');
    if (process.env.ELECTRON_DEVTOOLS === '1') {
      state.mainWindow.webContents.openDevTools({ mode: 'detach' });
    }
  } else {
    state.mainWindow.loadFile(path.join(electronDir, '../dist/index.html'));
  }

  state.mainWindow.once('ready-to-show', () => {
    logger.info('main', 'window ready-to-show');
    applyUiZoom(config.getUiZoom());
    state.mainWindow.show();
    flushPendingDeepLink();
  });
  state.mainWindow.webContents.once('did-finish-load', () => {
    flushPendingDeepLink();
  });
  state.mainWindow.on('close', (e) => {
    if (!state.isQuitting) {
      if (config.getMinimizeToTray()) {
        e.preventDefault();
        state.mainWindow.hide();
      }
    }
  });
  state.mainWindow.on('closed', () => { state.mainWindow = null; });
}

module.exports = { createMainWindow };
