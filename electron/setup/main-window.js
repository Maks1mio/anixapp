'use strict';

const path = require('path');
const { BrowserWindow, shell } = require('electron');
const state = require('../lib/app-state');
const logger = require('../logger');
const { flushPendingDeepLink } = require('../lib/deep-link');
const { getDevServerOrigin } = require('../lib/dev-server');
const { macTitleBarOptions, setupMacWindow } = require('../lib/mac-window');

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
    ...macTitleBarOptions(),
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
  setupMacWindow(state.mainWindow);
  logger.info('main', 'window created');

  if (isDev) {
    state.mainWindow.loadURL(getDevServerOrigin());
    if (process.env.ELECTRON_DEVTOOLS === '1') {
      state.mainWindow.webContents.openDevTools({ mode: 'detach' });
    }
  } else {
    state.mainWindow.loadFile(path.join(electronDir, '../dist/index.html'));
  }

  // Главное окно с привилегированным preload не должно уходить на чужие страницы:
  // window.open → внешний браузер (только http/https), навигация основного фрейма — только внутри приложения.
  // Политику доверия решает рендерер (`requestOpenExternal`): доверенные хосты открываются сразу,
  // остальные — через модалку подтверждения. Здесь лишь не даём окну уехать на чужой origin.
  const wc = state.mainWindow.webContents;

  function openExternalUrl(url) {
    try {
      const u = new URL(url);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return;
      shell.openExternal(u.href).catch(() => {});
    } catch { /* ignore */ }
  }

  wc.setWindowOpenHandler(({ url }) => {
    openExternalUrl(url);
    return { action: 'deny' };
  });
  wc.on('will-navigate', (e, url) => {
    try {
      const target = new URL(url);
      const current = new URL(wc.getURL() || 'about:blank');
      const sameApp = target.protocol === 'file:'
        ? current.protocol === 'file:' && target.pathname === current.pathname // только сама страница приложения, не любой file://
        : target.origin === current.origin;
      if (sameApp) return;
    } catch { /* блокируем */ }
    e.preventDefault();
    openExternalUrl(url);
  });

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
