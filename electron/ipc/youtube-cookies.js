'use strict';

const { ipcMain } = require('electron');
const { openYoutubeLoginWindow } = require('../lib/youtube-login');

function register() {
  ipcMain.handle('admin:captureYoutubeCookies', async () => {
    try {
      const result = await openYoutubeLoginWindow();
      if (!result || typeof result !== 'object') {
        return { ok: false, error: 'не удалось получить куки YouTube' };
      }
      return result;
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });
}

module.exports = { register };
