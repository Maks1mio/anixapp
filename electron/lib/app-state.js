'use strict';

/** Общее mutable-состояние main-процесса (окна, клиент API, флаги). */
module.exports = {
  mainWindow: null,
  playerWindowRef: null,
  currentPlayerPlayback: null,
  tray: null,
  anixart: null,
  isQuitting: false,
  themeEditorWindow: null,
  upscaleToolWindow: null,
  overviewEditorWindow: null,
  overviewEditorPayload: null,
  adminPanelWindow: null,
  pendingInstallerPath: null,
  updateDownloadState: { state: 'idle', received: 0, total: 0 },
  ffmpegPathCache: undefined,
  _trayImage: null,
  discordSessionStart: Math.floor(Date.now() / 1000),
};
