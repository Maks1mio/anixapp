'use strict';

const { ipcMain, BrowserWindow } = require('electron');
const { shell, app } = require('electron');
const diagnostics = require('../session-diagnostics');
const {
  listInstalledPlayers,
  listKnownPlayers,
  launchExternalPlayer,
} = require('../lib/player-integration');

function normalizeExternalPayload(urlOrOpts, headers = {}) {
  if (urlOrOpts && typeof urlOrOpts === 'object' && !Array.isArray(urlOrOpts)) {
    const opts = urlOrOpts;
    return {
      url: typeof opts.url === 'string' ? opts.url : '',
      headers: (opts.headers && typeof opts.headers === 'object') ? opts.headers : {},
      title: typeof opts.title === 'string' ? opts.title : '',
      playlist: Array.isArray(opts.playlist) ? opts.playlist : null,
      startIndex: Number.isFinite(Number(opts.startIndex)) ? Math.max(0, Number(opts.startIndex)) : 0,
      playerId: typeof opts.playerId === 'string' ? opts.playerId : '',
    };
  }
  return {
    url: typeof urlOrOpts === 'string' ? urlOrOpts : '',
    headers: (headers && typeof headers === 'object') ? headers : {},
    title: '',
    playlist: null,
    startIndex: 0,
    playerId: '',
  };
}

function register() {
  ipcMain.handle('player:listExternal', (_, opts = {}) => {
    const fresh = !!(opts && opts.fresh);
    const installed = listInstalledPlayers({ fresh }).map((p) => ({
      id: p.id,
      label: p.label,
      description: p.description,
      installed: true,
      path: p.path,
    }));
    const installedIds = new Set(installed.map((p) => p.id));
    const missing = listKnownPlayers()
      .filter((p) => !installedIds.has(p.id))
      .map((p) => ({
        id: p.id,
        label: p.label,
        description: p.description,
        installed: false,
        path: null,
      }));
    return { players: [...installed, ...missing], installedCount: installed.length };
  });

  ipcMain.handle('player:openExternal', async (_, urlOrOpts, headers = {}) => {
    const payload = normalizeExternalPayload(urlOrOpts, headers);
    try {
      const referer = typeof payload.headers.Referer === 'string' ? payload.headers.Referer : '';
      const userAgent = typeof payload.headers['User-Agent'] === 'string' ? payload.headers['User-Agent'] : '';
      const playlist = (payload.playlist || [])
        .map((e) => ({
          title: String(e?.title || '').trim() || 'Серия',
          url: String(e?.url || '').trim(),
        }))
        .filter((e) => /^https?:\/\//i.test(e.url));

      return await launchExternalPlayer({
        playerId: payload.playerId || undefined,
        url: payload.url,
        title: payload.title,
        referer,
        userAgent,
        playlist: playlist.length ? playlist : undefined,
        startIndex: payload.startIndex,
      });
    } catch {
      return { ok: false, reason: 'invalid-url' };
    }
  });

  ipcMain.handle('shell:openExternal', (_, url) => {
    if (!url || typeof url !== 'string') return false;
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
      return shell.openExternal(parsed.href);
    } catch {
      return false;
    }
  });

  ipcMain.handle('app:getVersion', () => app.getVersion());

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

  ipcMain.handle('diagnostics:get', (_, opts) => diagnostics.getEntries(opts || {}));
  ipcMain.handle('diagnostics:stats', () => diagnostics.stats());
  ipcMain.handle('diagnostics:clear', () => diagnostics.clear());

  ipcMain.handle('diagnostics:subscribe', (event) => {
    const id = event.sender?.id;
    return diagnostics.subscribe(id);
  });

  ipcMain.handle('diagnostics:unsubscribe', (event) => {
    const id = event.sender?.id;
    return diagnostics.unsubscribe(id);
  });

  ipcMain.handle('diagnostics:exportZip', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    return diagnostics.exportZipWithDialog(win && !win.isDestroyed() ? win : null);
  });

  ipcMain.handle('diagnostics:paths', () => diagnostics.getPaths());
  ipcMain.handle('diagnostics:openDir', () => diagnostics.openLogsDir());

  ipcMain.handle('diagnostics:reveal', async (_, filePath) => {
    if (filePath) shell.showItemInFolder(filePath);
    return { ok: true };
  });
}

module.exports = { register };
