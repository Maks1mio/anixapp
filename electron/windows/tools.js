'use strict';

const path = require('path');
const fs = require('fs');
const { BrowserWindow, ipcMain, app } = require('electron');
const state = require('../lib/app-state');
const { getDevServerOrigin } = require('../lib/dev-server');

function register(deps) {
  const { isDev, applyUiZoom, electronDir, getIconPath, config } = deps;

// ——— Theme editor window ———

function createThemeEditorWindow(themeId, isNew) {
  if (state.themeEditorWindow && !state.themeEditorWindow.isDestroyed()) {
    state.themeEditorWindow.focus();
    return;
  }
  const iconPath = getIconPath();
  state.themeEditorWindow = new BrowserWindow({
    width: 680,
    height: 560,
    minWidth: 560,
    minHeight: 440,
    frame: false,
    titleBarStyle: 'hidden',
    title: 'AnixApp — Редактор темы',
    show: false,
    resizable: true,
    webPreferences: {
      preload: path.join(electronDir, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    ...(iconPath && { icon: iconPath }),
  });
  state.themeEditorWindow.on('closed', () => { state.themeEditorWindow = null; });
  state.themeEditorWindow.once('ready-to-show', () => {
    applyUiZoom(config.getUiZoom());
    state.themeEditorWindow.show();
  });

  const query = new URLSearchParams();
  if (themeId) query.set('id', themeId);
  if (isNew)   query.set('new', '1');
  const qs = query.toString();

  if (isDev) {
    state.themeEditorWindow.loadURL(`${getDevServerOrigin()}/theme-editor.html${qs ? `?${qs}` : ''}`);
  } else {
    const p = path.join(electronDir, '../dist/theme-editor.html');
    state.themeEditorWindow.loadFile(p, qs ? { query: Object.fromEntries(query) } : {});
  }
}

ipcMain.handle('theme-editor:open', (_, { themeId, isNew } = {}) => {
  createThemeEditorWindow(themeId, isNew);
});

// ——— Upscale Preview Tool ———

function createUpscaleToolWindow() {
  if (state.upscaleToolWindow && !state.upscaleToolWindow.isDestroyed()) {
    state.upscaleToolWindow.focus();
    return;
  }
  const _toolIcon = getIconPath();
  state.upscaleToolWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'Предпросмотр моделей',
    backgroundColor: '#0e0e0e',
    frame: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(electronDir, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    ...(_toolIcon && { icon: _toolIcon }),
  });
  state.upscaleToolWindow.on('closed', () => { state.upscaleToolWindow = null; });
  state.upscaleToolWindow.once('ready-to-show', () => {
    applyUiZoom(config.getUiZoom());
    state.upscaleToolWindow.show();
  });
  state.upscaleToolWindow.on('maximize',   () => { if (state.upscaleToolWindow) state.upscaleToolWindow.webContents.send('tool:windowState', { isMaximized: true }); });
  state.upscaleToolWindow.on('unmaximize', () => { if (state.upscaleToolWindow) state.upscaleToolWindow.webContents.send('tool:windowState', { isMaximized: false }); });

  if (isDev) {
    state.upscaleToolWindow.loadURL(`${getDevServerOrigin()}/upscale-tool.html`);
  } else {
    state.upscaleToolWindow.loadFile(path.join(electronDir, '../dist/upscale-tool.html'));
  }
}

ipcMain.handle('tool:openUpscale', () => {
  createUpscaleToolWindow();
});

// ——— Overview video editor ———

function createOverviewVideoEditorWindow() {
  if (state.overviewEditorWindow && !state.overviewEditorWindow.isDestroyed()) {
    state.overviewEditorWindow.focus();
    return;
  }
  const _icon = getIconPath();
  state.overviewEditorWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    title: 'AnixApp — Редактор видео (Обзор)',
    backgroundColor: '#0e0e0e',
    frame: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(electronDir, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    ...(_icon && { icon: _icon }),
  });
  state.overviewEditorWindow.on('closed', () => { state.overviewEditorWindow = null; });
  state.overviewEditorWindow.once('ready-to-show', () => {
    applyUiZoom(config.getUiZoom());
    state.overviewEditorWindow.show();
  });

  if (isDev) {
    state.overviewEditorWindow.loadURL(`${getDevServerOrigin()}/overview-video-editor.html`);
  } else {
    state.overviewEditorWindow.loadFile(path.join(electronDir, '../dist/overview-video-editor.html'));
  }
}

ipcMain.handle('overview-editor:open', (_, payload) => {
  state.overviewEditorPayload = payload ?? null;
  createOverviewVideoEditorWindow();
});

ipcMain.handle('overview-editor:getPayload', () => state.overviewEditorPayload);

// ——— Admin panel window ———

function createAdminPanelWindow() {
  if (state.adminPanelWindow && !state.adminPanelWindow.isDestroyed()) {
    state.adminPanelWindow.focus();
    return;
  }
  const iconPath = getIconPath();
  state.adminPanelWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    frame: false,
    titleBarStyle: 'hidden',
    title: 'AnixApp — Панель управления',
    backgroundColor: '#0d0d0d',
    show: false,
    resizable: true,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(electronDir, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    ...(iconPath && { icon: iconPath }),
  });
  state.adminPanelWindow.on('closed', () => { state.adminPanelWindow = null; });
  state.adminPanelWindow.once('ready-to-show', () => {
    applyUiZoom(config.getUiZoom());
    state.adminPanelWindow.show();
  });

  if (isDev) {
    state.adminPanelWindow.loadURL(`${getDevServerOrigin()}/#/admin/panel?standalone=1`);
  } else {
    state.adminPanelWindow.loadFile(path.join(electronDir, '../dist/index.html'), {
      hash: '/admin/panel?standalone=1',
    });
  }
}

ipcMain.handle('admin:openWindow', () => {
  createAdminPanelWindow();
});

ipcMain.handle('admin:isStandaloneWindow', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  return !!(state.adminPanelWindow && win && win.id === state.adminPanelWindow.id);
});

ipcMain.on('overview-editor:done', () => {
  if (state.mainWindow && !state.mainWindow.isDestroyed()) {
    state.mainWindow.webContents.send('overview-editor:done');
  }
  if (state.overviewEditorWindow && !state.overviewEditorWindow.isDestroyed()) {
    state.overviewEditorWindow.close();
  }
});

// Window controls for frameless tool window
ipcMain.handle('tool:minimize', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) win.minimize();
});
ipcMain.handle('tool:toggleMaximize', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return;
  win.isMaximized() ? win.unmaximize() : win.maximize();
});
ipcMain.handle('tool:close', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) win.close();
});

ipcMain.handle('tool:saveScreenshot', async (_, dataUrl, filename) => {
  const screenshotsDir = path.join(app.getPath('desktop'), 'upscale-screenshots');
  try {
    if (!fs.existsSync(screenshotsDir)) fs.mkdirSync(screenshotsDir, { recursive: true });
    const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');
    const filePath = path.join(screenshotsDir, filename);
    fs.writeFileSync(filePath, Buffer.from(base64, 'base64'));
    return filePath;
  } catch (err) {
    console.error('[UpscaleTool] Failed to save screenshot:', err);
    throw err;
  }
});

// Theme editor → main window: theme was saved, re-apply it
ipcMain.on('theme-editor:saved', (_, themeId) => {
  if (state.mainWindow && !state.mainWindow.isDestroyed()) {
    state.mainWindow.webContents.send('theme-editor:saved', themeId);
  }
});

// Theme editor → main window: live color update while editing
ipcMain.on('theme-editor:liveUpdate', (_, vars) => {
  if (state.mainWindow && !state.mainWindow.isDestroyed()) {
    state.mainWindow.webContents.send('theme-editor:liveUpdate', vars);
  }
});

// Theme editor → main window: theme was deleted
ipcMain.on('theme-editor:deleted', (_, themeId) => {
  if (state.mainWindow && !state.mainWindow.isDestroyed()) {
    state.mainWindow.webContents.send('theme-editor:deleted', themeId);
  }
});
}

module.exports = { register };
