'use strict';

const path = require('path');
const fs = require('fs');
const { ipcMain, shell, app } = require('electron');
const logger = require('../logger');

function register() {

ipcMain.handle('shell:openExternal', (_, url) => {
  if (url && typeof url === 'string') shell.openExternal(url);
});

ipcMain.handle('app:getVersion', () => app.getVersion());

ipcMain.handle('log:renderer', (_, entry) => {
  if (entry && typeof entry === 'object') {
    logger.renderer(entry.level || 'INFO', entry.ch || 'unknown', entry.msg || '', entry.data);
  }
});

ipcMain.handle('log:getSessions', () => logger.getSessions().map(s => ({ id: s.id, ts: s.ts })));

ipcMain.handle('log:getSessionLog', (_, sessionId, file, limit) => {
  const allowed = ['main', 'ipc', 'renderer', 'errors'];
  const safeFile = allowed.includes(file) ? file : 'main';
  return logger.getSessionLog(sessionId, safeFile, limit || 500);
});

ipcMain.handle('log:getSystemInfo', () => logger.getSystemInfo());

ipcMain.handle('log:collectZip', async () => {
  try {
    const buf = logger.collectZip();
    const dir = logger.getCurrentSessionDir() || app.getPath('temp');
    const zipPath = path.join(dir, `anixapp-logs-${Date.now()}.zip`);
    fs.writeFileSync(zipPath, buf);
    return { ok: true, path: zipPath };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
});

ipcMain.handle('log:openZip', async (_, zipPath) => {
  const { shell: s } = require('electron');
  if (zipPath && fs.existsSync(zipPath)) {
    await s.showItemInFolder(zipPath);
  }
});

ipcMain.handle('log:openFolder', async () => {
  const { shell: s } = require('electron');
  const dir = logger.getCurrentSessionDir();
  if (dir) await s.openPath(path.dirname(dir));
});

ipcMain.handle('app:getVersions', () => {
  let anixapiVersion = '';
  try {
    const pkg = require('anixapi/package.json');
    anixapiVersion = pkg.version || '';
  } catch (_) {}
  return {
    app: app.getVersion(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    anixapi: anixapiVersion,
    anixartjs: anixapiVersion,
  };
});
}

module.exports = { register };
