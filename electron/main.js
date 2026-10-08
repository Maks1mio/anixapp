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

const { app, BrowserWindow, shell } = require('electron');

/** Имя в системных уведомлениях / доке вместо «Electron». */
const APP_DISPLAY_NAME = 'AnixApp';
const APP_USER_MODEL_ID = 'com.anixapp.client';
app.setName(APP_DISPLAY_NAME);
try { process.title = APP_DISPLAY_NAME; } catch { /* ignore */ }
if (process.platform === 'win32') {
  app.setAppUserModelId(APP_USER_MODEL_ID);
}

/** Windows: без ярлыка с AUMID тосты подписываются как «Electron». */
function ensureWindowsNotificationIdentity() {
  if (process.platform !== 'win32') return;
  try {
    const fs = require('fs');
    const programs = path.join(
      app.getPath('appData'),
      'Microsoft',
      'Windows',
      'Start Menu',
      'Programs',
    );
    fs.mkdirSync(programs, { recursive: true });
    const shortcutPath = path.join(programs, `${APP_DISPLAY_NAME}.lnk`);
    const appRoot = path.join(electronDir, '..');
    const iconPath = getIconPath();
    const options = {
      target: process.execPath,
      args: app.isPackaged ? '' : `"${appRoot}"`,
      cwd: app.isPackaged ? path.dirname(process.execPath) : appRoot,
      appUserModelId: APP_USER_MODEL_ID,
      description: APP_DISPLAY_NAME,
      ...(iconPath ? { icon: iconPath, iconIndex: 0 } : {}),
    };
    const operation = fs.existsSync(shortcutPath) ? 'replace' : 'create';
    const ok = shell.writeShortcutLink(shortcutPath, operation, options);
    if (!ok) logger.warn('main', 'failed to write Start Menu shortcut for toast identity');
  } catch (err) {
    logger.warn('main', `toast identity shortcut: ${err?.message || err}`);
  }
}

// TV dev can run alongside desktop dev (separate userData → separate single-instance lock).
if (process.env.ANIXAPP_TV === '1') {
  app.setPath('userData', path.join(app.getPath('userData'), '-tv-dev'));
}

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
const electronDir = __dirname;

const { registerCdnScheme, setupCdnProtocol } = require('./cdn-proxy');
const { registerLocalMediaScheme, setupLocalMediaProtocol } = require('./lib/local-media-protocol');
const {
  registerNotificationSoundScheme,
  setupNotificationSoundProtocol,
} = require('./lib/notification-sound-protocol');
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
registerNotificationSoundScheme();
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

  ensureWindowsNotificationIdentity();

  setupSessionRequestHeaders();
  setupCdnProtocol(logger);
  setupLocalMediaProtocol(() => media.getDownloadDirectory?.() || '', logger);
  setupNotificationSoundProtocol(electronDir, logger);
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
