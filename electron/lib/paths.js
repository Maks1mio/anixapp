'use strict';

const path = require('path');
const fs = require('fs');
const { app } = require('electron');

function getIconPath() {
  const base = path.join(__dirname, '..', '..', 'public', 'logo');
  const ico = path.join(base, 'icon.ico');
  const png = path.join(base, '512x512.png');
  if (process.platform !== 'win32') {
    if (fs.existsSync(png)) return png;
    if (fs.existsSync(ico)) return ico;
    return null;
  }
  if (fs.existsSync(ico)) return ico;
  if (fs.existsSync(png)) return png;
  return null;
}

/** macOS: иконка с полями под сетку Apple (для дока в dev; в сборке её ставит electron-builder). */
function getMacDockIconPath() {
  const icon = path.join(__dirname, '..', '..', 'public', 'logo', 'icon-mac.png');
  return fs.existsSync(icon) ? icon : null;
}

/** macOS: монохромный template-значок для строки меню (рядом лежит @2x). */
function getMacTrayIconPath() {
  const icon = path.join(__dirname, '..', '..', 'public', 'logo', 'trayTemplate.png');
  return fs.existsSync(icon) ? icon : null;
}

module.exports = { getIconPath, getMacDockIconPath, getMacTrayIconPath };
