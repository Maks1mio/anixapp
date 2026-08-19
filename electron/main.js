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

const { loadLocalEnv } = require('./lib/load-dotenv');
loadLocalEnv();

const { app, BrowserWindow } = require('electron');

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
const { getIconPath } = require('./lib/paths');
const { applyUiZoom } = require('./lib/ui-zoom');
const { createDiscordSettings } = require('./lib/discord-settings');
const { createIpcHelpers } = require('./lib/ipc-helpers');
const { applyGpuFlags } = require('./setup/gpu-flags');
const { setupSessionRequestHeaders } = require('./setup/session-headers');
const { createMainWindow } = require('./setup/main-window');
const { createTray } = require('./setup/tray');
const { createAnixClient, getAnixart, resetAnixart } = require('./services/anix-client');
const { createDevApiBridge } = require('./dev-api-bridge');
const { registerAll } = require('./ipc');
const { media } = require('./services/media');
const homeCustomFilter = require('./home-custom-filter');

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

  createMainWindow(deps);
  createTray(deps);
  discord.initDiscordRpc();
  flushPendingDeepLink();

  if (isDev) {
    void devApiBridge.start().catch((err) => {
      logger.error('dev-bridge', `startup failed: ${err?.message || err}`);
    });
  }
});

app.on('before-quit', () => {
  logger.info('main', 'app before-quit');
  if (discordRpc) discordRpc.destroy();
  if (isDev) void devApiBridge.stop();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createMainWindow(deps);
  }
});
