'use strict';

const path = require('path');
const fs = require('fs');
const { app } = require('electron');

function getIconPath() {
  const base = path.join(__dirname, '..', '..', 'public', 'logo');
  const ico = path.join(base, 'icon.ico');
  const png = path.join(base, '512x512.png');
  if (process.platform === 'linux') {
    if (fs.existsSync(png)) return png;
    if (fs.existsSync(ico)) return ico;
    return null;
  }
  if (fs.existsSync(ico)) return ico;
  if (fs.existsSync(png)) return png;
  return null;
}

module.exports = { getIconPath };
