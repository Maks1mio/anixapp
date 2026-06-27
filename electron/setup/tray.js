'use strict';

const { Tray, nativeImage, Menu, app } = require('electron');
const state = require('../lib/app-state');

function createTray(deps) {
  const { getIconPath } = deps;

  function getTrayImage() {
    if (state._trayImage) return state._trayImage;
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
    if (state.mainWindow) {
      state.mainWindow.show();
      state.mainWindow.focus();
    }
  };

  state.tray.on('click', showWindow);
  state.tray.on('double-click', showWindow);

  state.tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Показать', click: showWindow },
    { type: 'separator' },
    { label: 'Выход', click: () => { state.isQuitting = true; app.quit(); } },
  ]));
}

module.exports = { createTray };
