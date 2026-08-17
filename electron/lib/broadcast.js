'use strict';

const { BrowserWindow } = require('electron');

function broadcastToRenderers(channel, payload) {
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed()) continue;
    try {
      win.webContents.send(channel, payload);
    } catch {
      /* ignore */
    }
  }
}

function broadcastBookmarksChanged(detail) {
  broadcastToRenderers('bookmarks:changed', detail ?? {});
}

module.exports = { broadcastToRenderers, broadcastBookmarksChanged };
