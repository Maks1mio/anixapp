'use strict';

const { Tray, nativeImage, Menu, app } = require('electron');
const state = require('../lib/app-state');
const { createMainWindow } = require('./main-window');
const { getMacTrayIconPath } = require('../lib/paths');

function createTray(deps) {
  const { getIconPath } = deps;

  function getTrayImage() {
    if (state._trayImage) return state._trayImage;
    // macOS: template-значок сам перекрашивается под светлую и тёмную строку меню.
    if (process.platform === 'darwin') {
      const templatePath = getMacTrayIconPath();
      const template = templatePath ? nativeImage.createFromPath(templatePath) : null;
      if (template && !template.isEmpty()) {
        template.setTemplateImage(true);
        state._trayImage = template;
        return state._trayImage;
      }
    }
    const iconPath = getIconPath();
    if (!iconPath) return null;
    const image = nativeImage.createFromPath(iconPath);
    if (image.isEmpty()) return null;
    const traySize = process.platform === 'linux' ? 22 : 16;
    state._trayImage = image.resize({ width: traySize, height: traySize });
    return state._trayImage;
  }

  const image = getTrayImage();
  if (!image) return;

  state.tray = new Tray(image);
  state.tray.setToolTip('AnixApp');

  const showWindow = () => {
    // macOS: окно может быть закрыто при живом приложении — создаём заново
    if (!state.mainWindow) {
      createMainWindow(deps);
      return;
    }
    state.mainWindow.show();
    state.mainWindow.focus();
  };

  // macOS: клик по значку открывает меню — показывать окно одновременно с ним не нужно.
  if (process.platform !== 'darwin') {
    state.tray.on('click', showWindow);
    state.tray.on('double-click', showWindow);
  }

  state.tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Показать', click: showWindow },
    { type: 'separator' },
    { label: 'Выход', click: () => { state.isQuitting = true; app.quit(); } },
  ]));
}

module.exports = { createTray };
