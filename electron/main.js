/**
 * Electron main — точка входа.
 *
 * Структура:
 *   lib/       — конфиг, состояние, IPC-хелперы, константы
 *   setup/     — GPU-флаги, webRequest, главное окно, трей
 *   services/  — API-клиент, медиа/загрузки, автообновление
 *   windows/   — плеер и вспомогательные окна
 *   ipc/       — регистрация ipcMain.handle / on
 */
'use strict';

const path = require('path');
const { loadLocalEnv } = require('./lib/load-dotenv');
loadLocalEnv();
require('./lib/anixart-proxy-auth').installAnixartProxyFetchAuth();

const { app, BrowserWindow } = require('electron');

// TV dev can run alongside desktop dev (separate userData → separate single-instance lock).
if (process.env.ANIXAPP_TV === '1') {
  app.setPath('userData', path.join(app.getPath('userData'), '-tv-dev'));
}

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
const electronDir = __dirname;

const { registerCdnScheme, setupCdnProtocol } = require('./cdn-proxy');
const { registerLocalMediaScheme, setupLocalMediaProtocol } = require('./lib/local-media-protocol');
const {
  setupDeepLinks,
  handleSecondInstanceArgv,
  flushPendingDeepLink,
} = require('./lib/deep-link');
const logger = require('./logger');
const state = require('./lib/app-state');
const config = require('./lib/config-store');
const { LIST_STATUS_TO_TYPE } = require('./lib/constants');
const { getIconPath, getMacDockIconPath } = require('./lib/paths');
const { applyUiZoom } = require('./lib/ui-zoom');
const { createDiscordSettings } = require('./lib/discord-settings');
const { createIpcHelpers } = require('./lib/ipc-helpers');
const { applyGpuFlags } = require('./setup/gpu-flags');
const { setupSessionRequestHeaders } = require('./setup/session-headers');
const { createMainWindow } = require('./setup/main-window');
const { createTray } = require('./setup/tray');
const { setupAppMenu } = require('./setup/app-menu');
const { createAnixClient, getAnixart, resetAnixart } = require('./services/anix-client');
const { createDevApiBridge } = require('./dev-api-bridge');
const { registerAll } = require('./ipc');
const { media } = require('./services/media');
const homeCustomFilter = require('./home-custom-filter');
const { startFetchAAppBridge, stopFetchAAppBridge } = require('./lib/fetchaapp-bridge');

registerCdnScheme();
registerLocalMediaScheme();
applyGpuFlags();

// Deep links (anixart://…) need a single instance so the OS hands URLs to a running app.
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
  process.exit(0);
}

app.on('second-instance', (_event, commandLine) => {
  handleSecondInstanceArgv(commandLine);
});

setupDeepLinks(app);

let discordRpc = null;
try { discordRpc = require('./discord-rpc'); } catch (_) {}

const discord = createDiscordSettings(discordRpc);
const { handleAnixError, loggedHandle } = createIpcHelpers({ isDev, logger, state });
const appendLog = (name, payload) => config.appendLog(name, payload, isDev);

const devApiBridge = createDevApiBridge({
  isDev,
  getAnixart,
  getRawConfig: config.getRawConfig,
  saveConfig: config.saveConfig,
  logger,
});

const deps = {
  app,
  isDev,
  electronDir,
  logger,
  state,
  config,
  discordRpc,
  discord,
  devApiBridge,
  handleAnixError,
  loggedHandle,
  appendLog,
  getAnixart,
  createAnixClient,
  resetAnixart,
  getIconPath,
  applyUiZoom,
  homeCustomFilter,
  LIST_STATUS_TO_TYPE,
};

registerAll(deps);

app.whenReady().then(() => {
  config.primeConfigCache();

  require('./session-diagnostics').install();

  logger.init(app.getPath('userData'), app.getVersion(), process.versions.electron);
  logger.patchConsole();
  logger.info('main', 'app ready', {
    platform: process.platform,
    version: app.getVersion(),
    electron: process.versions.electron,
  });

  setupSessionRequestHeaders();
  setupCdnProtocol(logger);
  setupLocalMediaProtocol(() => media.getDownloadDirectory?.() || '', logger);
  if (media.getDownloadDirectory) media.getDownloadDirectory();

  // macOS: в dev док показывает иконку Electron; в сборке её задаёт electron-builder.
  if (process.platform === 'darwin' && !app.isPackaged) {
    const dockIcon = getMacDockIconPath();
    if (dockIcon) app.dock?.setIcon(dockIcon);
  }

  setupAppMenu(deps);
  createMainWindow(deps);
  createTray(deps);
  discord.initDiscordRpc();
  flushPendingDeepLink();
  try {
    require('./lib/backup-proxy').initBackupProxyKeepAlive();
  } catch (_) {}
  // Ранний скан VLC/mpv/PotPlayer — к моменту выбора плеера список уже в кэше.
  setImmediate(() => {
    try {
      const { warmInstalledPlayersCache } = require('./lib/player-integration');
      const found = warmInstalledPlayersCache();
      logger.info('player-integration', 'warm scan', {
        players: found.map((p) => p.id),
      });
    } catch (err) {
      logger.warn('player-integration', `warm scan failed: ${err?.message || err}`);
    }
  });
  void startFetchAAppBridge(logger).catch((err) => {
    logger.warn('fetchaapp', `bridge failed: ${err?.message || err}`);
  });

  // Продолжить незавершённые загрузки после рестарта
  setTimeout(() => {
    try {
      const n = media.restoreDownloads?.() || 0;
      if (n > 0) logger.info('downloads', `restored ${n} incomplete download(s)`);
    } catch (e) {
      logger.warn('downloads', `restore failed: ${e?.message || e}`);
    }
  }, 2000);

  if (isDev) {
    void devApiBridge.start().catch((err) => {
      logger.error('dev-bridge', `startup failed: ${err?.message || err}`);
    });
  }
});

app.on('before-quit', () => {
  logger.info('main', 'app before-quit');
  // macOS: ⌘Q, «Завершить» в доке и выключение системы должны завершать приложение,
  // а не прятать окно в трей.
  if (process.platform === 'darwin') state.isQuitting = true;
  try { media.persistDownloads?.(); } catch (_) {}
  stopFetchAAppBridge();
  try { require('./lib/tv-lan-login').stop(); } catch (_) {}
  if (discordRpc) discordRpc.destroy();
  if (isDev) void devApiBridge.stop();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createMainWindow(deps);
  } else if (state.mainWindow && !state.mainWindow.isVisible()) {
    // Окно спрятано в трей — клик по иконке в доке должен его вернуть.
    state.mainWindow.show();
    state.mainWindow.focus();
  }
});
