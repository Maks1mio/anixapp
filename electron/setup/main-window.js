'use strict';

const path = require('path');
const { BrowserWindow } = require('electron');
const state = require('../lib/app-state');
const logger = require('../logger');
const { flushPendingDeepLink } = require('../lib/deep-link');
const { getDevServerOrigin } = require('../lib/dev-server');

function createMainWindow(deps) {
  const { isDev, getIconPath, applyUiZoom, config, electronDir } = deps;
  const isTv = process.env.ANIXAPP_TV === '1';

  const iconPath = getIconPath();
  const winOpts = {
    width: isTv ? 1920 : 1280,
    height: isTv ? 1080 : 800,
    minWidth: isTv ? 1280 : 900,
    minHeight: isTv ? 720 : 600,
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
    title: isTv ? 'AnixApp TV' : 'AnixApp',
    show: false,
  };
  if (iconPath) winOpts.icon = iconPath;
  state.mainWindow = new BrowserWindow(winOpts);
  logger.info('main', 'window created');

  if (isDev) {
    state.mainWindow.loadURL(getDevServerOrigin());
    if (process.env.ELECTRON_DEVTOOLS === '1') {
      state.mainWindow.webContents.openDevTools({ mode: 'detach' });
    }
  } else {
    state.mainWindow.loadFile(path.join(electronDir, '../dist/index.html'));
  }

  state.mainWindow.once('ready-to-show', () => {
    logger.info('main', 'window ready-to-show');
    applyUiZoom(isTv ? 100 : config.getUiZoom());
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
