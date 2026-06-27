'use strict';

const { UI_ZOOM_LEVELS } = require('./constants');
const state = require('./app-state');

function applyUiZoomToWebContents(wc, percent) {
  if (!wc || wc.isDestroyed()) return;
  try {
    wc.setZoomFactor(percent / 100);
  } catch (_) {}
}

function applyUiZoom(percent) {
  const p = UI_ZOOM_LEVELS.includes(percent) ? percent : 100;
  if (state.mainWindow && !state.mainWindow.isDestroyed()) {
    applyUiZoomToWebContents(state.mainWindow.webContents, p);
  }
  if (state.playerWindowRef && !state.playerWindowRef.isDestroyed()) {
    applyUiZoomToWebContents(state.playerWindowRef.webContents, p);
  }
  if (state.themeEditorWindow && !state.themeEditorWindow.isDestroyed()) {
    applyUiZoomToWebContents(state.themeEditorWindow.webContents, p);
  }
  if (state.upscaleToolWindow && !state.upscaleToolWindow.isDestroyed()) {
    applyUiZoomToWebContents(state.upscaleToolWindow.webContents, p);
  }
}

module.exports = { applyUiZoomToWebContents, applyUiZoom };
