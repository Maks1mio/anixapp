const { app, BrowserWindow, ipcMain, Tray, nativeImage, Menu, session, shell, dialog, net } = require('electron');
const path = require('path');
const fs = require('fs');
const { Readable } = require('stream');
const { pipeline } = require('stream/promises');
const { spawn, execFile } = require('child_process');
const { promisify } = require('util');

/** В dev можно запускать два процесса (тесты лобби / WebRTC). В production — один экземпляр. */
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
const { Anixart, KodikParser, SibnetParser, AniLibriaParser } = require('anixapi');
const { DefaultResult, BookmarkType, BookmarkSortType } = require('anixapi');
const { attachLegacyEndpoints } = require('./anix-legacy-endpoints');
const homeCustomFilter = require('./home-custom-filter');
const logger = require('./logger');
const {
  registerCdnScheme,
  setupCdnProtocol,
  ANIXART_CDN_HOSTS,
  ANIXART_SITE_ORIGIN,
  ANIXART_SITE_REFERER,
  BROWSER_UA,
} = require('./cdn-proxy');

registerCdnScheme();

// ——— Discord Rich Presence (graceful — disabled if Discord is not running) ———
let discordRpc = null;
try { discordRpc = require('./discord-rpc'); } catch (_) {}
let _discordSessionStart = Math.floor(Date.now() / 1000);

/** Строковый id статуса из UI -> BookmarkType (число для API) */
const LIST_STATUS_TO_TYPE = {
  watching: BookmarkType.Watching,
  planned: BookmarkType.InPlans,
  completed: BookmarkType.Completed,
  on_hold: BookmarkType.HoldOn,
  dropped: BookmarkType.Dropped,
};

// ——— Single instance lock (только production) ———
if (!isDev) {
  if (!app.requestSingleInstanceLock()) {
    app.quit();
    process.exit(0);
  }
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
}
let mainWindow = null;
let playerWindowRef = null;
/** Текущий контент плеера (releaseId, sourceId, ep) — для сравнения при sync: при смене тайтла переоткрываем окно */
let currentPlayerPlayback = null;
let tray = null;
let anixart = null;
let isQuitting = false;

function handleAnixError(err, context) {
  const msg = err && err.message ? String(err.message) : String(err);
  const isNetwork =
    msg.includes('fetch failed') ||
    msg.includes('ENOTFOUND') ||
    msg.includes('ECONNREFUSED') ||
    msg.includes('ECONNRESET') ||
    msg.includes('ETIMEDOUT');

  // Always log API errors — they're the most important for debugging
  logger.error('api', `${context}: ${msg}`, {
    context,
    network: isNetwork,
    stack: err && err.stack ? String(err.stack).slice(0, 600) : undefined,
  });

  if (isNetwork && mainWindow && !mainWindow.isDestroyed()) {
    try {
      mainWindow.webContents.send('anix:offline', {
        context,
        message: msg,
      });
    } catch (_) {
      // ignore
    }
  }
  throw err;
}

/**
 * Wrap an async IPC handler with automatic logging:
 * - Logs every call with args (sanitised) and duration
 * - Logs errors before rethrowing
 */
function loggedHandle(channel, fn) {
  return ipcMain.handle(channel, async (event, ...args) => {
    const t0 = Date.now();
    // Sanitise args — never log passwords/tokens
    const safeArgs = args.map((a, i) => {
      if (channel === 'anix:login' && i === 1) return '[PASSWORD]';
      if (typeof a === 'string' && a.length > 120) return a.slice(0, 120) + '…';
      return a;
    });
    logger.ipc(channel, '→', safeArgs.length ? { args: safeArgs } : undefined);
    try {
      const result = await fn(event, ...args);
      logger.ipc(channel, '←', { ms: Date.now() - t0 });
      return result;
    } catch (err) {
      const msg = err && err.message ? String(err.message) : String(err);
      logger.error('ipc', `${channel} failed: ${msg}`, {
        ms: Date.now() - t0,
        stack: err && err.stack ? String(err.stack).slice(0, 400) : undefined,
      });
      throw err;
    }
  });
}

// ——— Config constants (must be before any config reads) ———
const AUTH_FILE = 'auth.json';
const DEFAULT_BASE_URL = 'https://api-s.anixsekai.com';
const LOG_DIR = 'logs';

/** In-memory config cache — loaded once at startup, kept in sync on every saveConfig(). */
let _configCache = null;

function getConfigPath() {
  return path.join(app.getPath('userData'), AUTH_FILE);
}

function _readConfigFromDisk() {
  try {
    const p = getConfigPath();
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (_) {}
  return {};
}

function getIconPath() {
  const base = path.join(__dirname, '..', 'public', 'logo');
  const ico = path.join(base, 'icon.ico');
  const png = path.join(base, '512x512.png');
  // On Linux prefer PNG — ICO files may not render correctly in system tray
  if (process.platform === 'linux') {
    if (fs.existsSync(png)) return png;
    if (fs.existsSync(ico)) return ico;
    return null;
  }
  if (fs.existsSync(ico)) return ico;
  if (fs.existsSync(png)) return png;
  return null;
}

function getMinimizeToTray() {
  const data = _configCache ?? _readConfigFromDisk();
  return data.minimizeToTray === true;
}

function getAdaptiveAcceleration() {
  const data = _configCache ?? _readConfigFromDisk();
  // default: enabled (true means hardware acceleration ON)
  return data.adaptiveAcceleration !== false;
}

const UI_ZOOM_LEVELS = [50, 67, 75, 80, 90, 100, 110, 125, 150, 175, 200];

function getUiZoom() {
  const data = _configCache ?? _readConfigFromDisk();
  const z = Number(data.uiZoom);
  return UI_ZOOM_LEVELS.includes(z) ? z : 100;
}

function getDiscordRpcEnabled() {
  const data = _configCache ?? _readConfigFromDisk();
  return data.discordRpcEnabled !== false;
}

function getDiscordRpcShowBrowsing() {
  const data = _configCache ?? _readConfigFromDisk();
  return data.discordRpcShowBrowsing !== false;
}

function getDiscordRpcShowWatching() {
  const data = _configCache ?? _readConfigFromDisk();
  return data.discordRpcShowWatching !== false;
}

function getDiscordRpcShowProgress() {
  const data = _configCache ?? _readConfigFromDisk();
  return data.discordRpcShowProgress !== false;
}

function getDiscordRpcShowDubber() {
  const data = _configCache ?? _readConfigFromDisk();
  return data.discordRpcShowDubber !== false;
}

function getDiscordRpcShowImages() {
  const data = _configCache ?? _readConfigFromDisk();
  return data.discordRpcShowImages !== false;
}

function getDiscordRpcShowParty() {
  const data = _configCache ?? _readConfigFromDisk();
  return data.discordRpcShowParty !== false;
}

const DISCORD_RPC_PAGE_KEYS = [
  'discordRpcPageHome',
  'discordRpcPageOverview',
  'discordRpcPagePopular',
  'discordRpcPageCollections',
  'discordRpcPageMyCollections',
  'discordRpcPageCollection',
  'discordRpcPageCollectionEdit',
  'discordRpcPageRelease',
  'discordRpcPageReleaseComments',
  'discordRpcPageReleaseRelated',
  'discordRpcPageProfile',
  'discordRpcPageProfileFriends',
  'discordRpcPageProfileVotes',
  'discordRpcPageBookmarks',
  'discordRpcPageSearch',
  'discordRpcPageDownloads',
  'discordRpcPageAnnouncement',
  'discordRpcPageOther',
];

function readDiscordRpcPageFlags(data) {
  const out = {};
  for (const key of DISCORD_RPC_PAGE_KEYS) {
    out[key] = data[key] !== false;
  }
  return out;
}

function applyDiscordRpcOptionsFromSettings() {
  if (!discordRpc) return;
  discordRpc.setRpcOptions({
    showImages: getDiscordRpcShowImages(),
    showProgress: getDiscordRpcShowProgress(),
    showDubber: getDiscordRpcShowDubber(),
  });
}

function setDiscordGenericInApp() {
  if (!discordRpc) return;
  discordRpc.setPage({ details: 'AnixApp', state: 'В приложении' });
}

function buildDiscordRpcSettingsPayload(data) {
  return {
    discordRpcEnabled: getDiscordRpcEnabled(),
    discordRpcShowBrowsing: getDiscordRpcShowBrowsing(),
    discordRpcShowWatching: getDiscordRpcShowWatching(),
    discordRpcShowProgress: getDiscordRpcShowProgress(),
    discordRpcShowDubber: getDiscordRpcShowDubber(),
    discordRpcShowImages: getDiscordRpcShowImages(),
    discordRpcShowParty: getDiscordRpcShowParty(),
    ...readDiscordRpcPageFlags(data),
  };
}

function applyUiZoomToWebContents(wc, percent) {
  if (!wc || wc.isDestroyed()) return;
  try {
    wc.setZoomFactor(percent / 100);
  } catch (_) {}
}

function applyUiZoom(percent) {
  const p = UI_ZOOM_LEVELS.includes(percent) ? percent : 100;
  if (mainWindow && !mainWindow.isDestroyed()) {
    applyUiZoomToWebContents(mainWindow.webContents, p);
  }
  if (playerWindowRef && !playerWindowRef.isDestroyed()) {
    applyUiZoomToWebContents(playerWindowRef.webContents, p);
  }
  if (themeEditorWindow && !themeEditorWindow.isDestroyed()) {
    applyUiZoomToWebContents(themeEditorWindow.webContents, p);
  }
  if (upscaleToolWindow && !upscaleToolWindow.isDestroyed()) {
    applyUiZoomToWebContents(upscaleToolWindow.webContents, p);
  }
}

function initDiscordRpc() {
  if (!discordRpc || !mainWindow || !getDiscordRpcEnabled()) return;
  discordRpc.setPaused(false);
  discordRpc.setMainWindow(mainWindow);
  applyDiscordRpcOptionsFromSettings();
  if (getDiscordRpcShowBrowsing()) {
    discordRpc.setBrowsing(_discordSessionStart);
  } else {
    setDiscordGenericInApp();
  }
  discordRpc.connect();
  mainWindow.on('focus', () => discordRpc.focusWindow('main'));
}

// Apply acceleration preference early (before app is ready).
// AUTH_FILE / getConfigPath() are now defined above, so no TDZ issue.
// If adaptiveAcceleration === false — turn off HW acceleration (restart required to re-enable).
if (!getAdaptiveAcceleration()) {
  app.disableHardwareAcceleration();
}

// GPU command-line tweaks to reduce flickering on problematic drivers.
// These are safe no-ops on drivers that don't need them.
app.commandLine.appendSwitch('disable-gpu-vsync');
app.commandLine.appendSwitch('enable-zero-copy');

// Enable WebGPU on Linux (required for Anime4K).
// Equivalent to Firefox flags: dom.webgpu.enabled, gfx.webgpu.ignore-blocklist, gfx.webrender.all
if (process.platform === 'linux') {
  app.commandLine.appendSwitch('enable-unsafe-webgpu');
  app.commandLine.appendSwitch('ignore-gpu-blocklist');
  app.commandLine.appendSwitch('enable-features', 'Vulkan,UseVulkanForDisplay,WebGPUService');
}

function getLogDir() {
  const dir = path.join(app.getPath('userData'), LOG_DIR);
  try {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  } catch (err) {
    console.error('Failed to ensure log dir', err);
  }
  return dir;
}

function appendLog(name, payload) {
  try {
    const dir = getLogDir();
    const file = path.join(dir, `${name}.log`);
    const line = `[${new Date().toISOString()}] ${JSON.stringify(payload)}\n`;
    fs.appendFile(file, line, () => {});
  } catch (err) {
    console.error('Failed to write log', err);
  }
}

function loadConfig() {
  const raw = _readConfigFromDisk();
  const cfg = {
    token: raw.token || null,
    baseUrl: raw.baseUrl || DEFAULT_BASE_URL,
    profileId: raw.profileId ?? null,
    profileLogin: raw.profileLogin || null,
    profileAvatar: raw.profileAvatar || null,
    profileRaw: raw.profileRaw || null,
    deviceId: raw.deviceId || null,
  };
  // Prime the cache on first load after app is ready (getPath is reliable then).
  if (_configCache === null) _configCache = raw;
  return cfg;
}

function saveConfig(updates) {
  try {
    const p = getConfigPath();
    const raw = _configCache ?? _readConfigFromDisk();
    const next = { ...raw, ...updates };
    fs.writeFileSync(p, JSON.stringify(next), 'utf8');
    // Keep in-memory cache in sync — avoids a disk read on next access.
    _configCache = next;
  } catch (err) {
    console.error('Failed to save config', err);
  }
}

function getOrCreateDeviceId() {
  try {
    const current = loadConfig();
    if (current.deviceId && typeof current.deviceId === 'string') {
      return current.deviceId;
    }
    const { randomBytes } = require('crypto');
    const id = randomBytes(16).toString('hex');
    saveConfig({ deviceId: id });
    return id;
  } catch (err) {
    console.error('Failed to get/create deviceId', err);
    return 'unknown-device';
  }
}

function loadSavedToken() {
  return loadConfig().token;
}

function saveToken(token) {
  saveConfig({ token });
}

function clearToken() {
  const { baseUrl } = loadConfig();
  saveConfig({ token: null, baseUrl });
}

function createAnixClient(options) {
  return attachLegacyEndpoints(new Anixart(options));
}

function getAnixart() {
  if (!anixart) {
    const { token, baseUrl } = loadConfig();
    anixart = createAnixClient({ baseUrl, token: token || undefined });
  }
  return anixart;
}

let _trayImage = null;

function getTrayImage() {
  if (_trayImage) return _trayImage;
  const iconPath = getIconPath();
  if (!iconPath) return null;
  const image = nativeImage.createFromPath(iconPath);
  if (image.isEmpty()) return null;
  // Linux tray icons are typically 22px; Windows/macOS use 16px
  const traySize = process.platform === 'linux' ? 22 : 16;
  _trayImage = image.resize({ width: traySize, height: traySize });
  return _trayImage;
}

function createTray() {
  const image = getTrayImage();
  if (!image) return;
  tray = new Tray(image);
  tray.setToolTip('AnixApp');

  const showWindow = () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  };

  tray.on('click', showWindow);
  // On some Linux DEs (e.g. KDE) only double-click fires; add it as fallback
  tray.on('double-click', showWindow);

  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Показать', click: showWindow },
    { type: 'separator' },
    { label: 'Выход', click: () => { isQuitting = true; app.quit(); } },
  ]));
}

function createWindow() {
  const iconPath = getIconPath();
  const winOpts = {
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    titleBarStyle: 'hidden',
    // Dark background prevents the white flash that appears between window creation
    // and the first painted frame — especially visible with frameless windows.
    backgroundColor: '#0d0d0d',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      // Keep background throttling off to prevent animation glitches when the
      // window loses focus momentarily (e.g. opening a system dialog).
      backgroundThrottling: false,
    },
    title: 'AnixApp',
    show: false,
  };
  if (iconPath) winOpts.icon = iconPath;
  mainWindow = new BrowserWindow(winOpts);
  logger.info('main', 'window created');

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    logger.info('main', 'window ready-to-show');
    applyUiZoom(getUiZoom());
    mainWindow.show();
  });
  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      if (getMinimizeToTray()) {
        e.preventDefault();
        mainWindow.hide();
      }
      // If minimizeToTray is off — let the window close naturally (quit)
    }
  });
  mainWindow.on('closed', () => { mainWindow = null; });
}

/** User-Agent и заголовки как в приложении Anixart (Android), чтобы видеоисточники отдавали поток */
const ANIXART_UA = 'AnixartApp/9.0 BETA 3-25021818 (Android 9; SDK 28; x86_64; ROG ASUS AI2201_B; ru)';
/** Статика Anixart — см. cdn-proxy.js (ANIXART_CDN_HOSTS) */
const VIDEO_HOSTS = ['anixis.com', 'aniqart.com', 'aniqit.com', 'video.sibnet.ru', 'sibnet.ru', 'kodikplayer.com', 'kodik-cdn.com', 'kodik-storage.com', 'solodcdn.com', 'collaps.io', 'aniliberty.top', 'anilibria.tv', 'anilibria.top', 'libria.fun', 'cache.libria.fun'];
/** Не подменять CORS-заголовки — ломает YouTube/Rutube embed (credentialed fetch + ACAO: *) */
const EMBED_MEDIA_HOSTS = [
  'youtube.com', 'youtu.be', 'googlevideo.com', 'ytimg.com', 'ggpht.com',
  'googleapis.com', 'gstatic.com', 'google.com', 'rutube.ru',
];

function hostMatchesList(host, list) {
  return list.some((h) => host === h || host.endsWith('.' + h));
}

function isAnixartCdnHost(host) {
  return hostMatchesList(host, ANIXART_CDN_HOSTS);
}

function applyAnixartSiteHeaders(requestHeaders) {
  upsertHeader(requestHeaders, 'Referer', ANIXART_SITE_REFERER);
  upsertHeader(requestHeaders, 'Origin', ANIXART_SITE_ORIGIN);
  upsertHeader(requestHeaders, 'User-Agent', BROWSER_UA);
  upsertHeader(requestHeaders, 'Accept', 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8');
  upsertHeader(requestHeaders, 'Accept-Language', 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7');
  upsertHeader(requestHeaders, 'sec-ch-ua', '"Chromium";v="122", "Not(A:Brand";v="24", "Google Chrome";v="122"');
  upsertHeader(requestHeaders, 'sec-ch-ua-mobile', '?0');
  upsertHeader(requestHeaders, 'sec-ch-ua-platform', '"Windows"');
}

/** Заголовки сессии: CDN Anixart как с anixart.tv + видеохостинги */
function setupSessionRequestHeaders() {
  const ses = session.defaultSession;
  const cdnPatterns = ANIXART_CDN_HOSTS.flatMap((h) => [`*://*.${h}/*`, `*://${h}/*`]);

  ses.webRequest.onBeforeSendHeaders({ urls: cdnPatterns }, (details, callback) => {
    const requestHeaders = { ...details.requestHeaders };
    applyAnixartSiteHeaders(requestHeaders);
    callback({ requestHeaders });
  });

  ses.webRequest.onBeforeSendHeaders((details, callback) => {
    let host;
    try { host = new URL(details.url).host.replace(/^www\./, ''); } catch (_) { callback({ requestHeaders: details.requestHeaders }); return; }
    const requestHeaders = { ...details.requestHeaders };

    if (hostMatchesList(host, ANIXART_CDN_HOSTS)) {
      callback({ requestHeaders });
      return;
    }

    if (!hostMatchesList(host, VIDEO_HOSTS)) {
      callback({ requestHeaders });
      return;
    }
    // Referer сбрасываем и подставляем корректный для CDN (как в AniDesk / Android)
    let preservedReferer = '';
    for (const k of Object.keys(requestHeaders)) {
      if (k.toLowerCase() === 'referer') {
        preservedReferer = requestHeaders[k];
        delete requestHeaders[k];
        break;
      }
    }
    if (host === 'video.sibnet.ru') {
      upsertHeader(requestHeaders, 'Referer', details.url);
    } else if (host.endsWith('.sibnet.ru')) {
      upsertHeader(requestHeaders, 'Referer', 'https://video.sibnet.ru/');
    } else if (host.endsWith('kodik-cdn.com') || host.includes('kodik-storage') || host.includes('solodcdn')) {
      upsertHeader(requestHeaders, 'Referer', 'https://kodikplayer.com/');
    } else if (host.includes('libria') || host.includes('anilib')) {
      upsertHeader(requestHeaders, 'Referer', preservedReferer || details.referrer || 'https://anilibria.top/');
    } else if (preservedReferer) {
      upsertHeader(requestHeaders, 'Referer', preservedReferer);
    }
    if (host !== 'kodikplayer.com' && host !== 'video.sibnet.ru') {
      upsertHeader(requestHeaders, 'User-Agent', ANIXART_UA);
      upsertHeader(requestHeaders, 'sec-ch-ua', '"AnixartApp"');
      upsertHeader(requestHeaders, 'sec-ch-ua-mobile', '?1');
      upsertHeader(requestHeaders, 'sec-ch-ua-platform', 'Android');
    }
    callback({ requestHeaders });
  });
  ses.webRequest.onHeadersReceived((details, callback) => {
    let host;
    try { host = new URL(details.url).host.replace(/^www\./, ''); } catch (_) { callback({ responseHeaders: details.responseHeaders }); return; }

    // Wildcard ACAO ломает googlevideo.com внутри YouTube iframe
    if (hostMatchesList(host, EMBED_MEDIA_HOSTS) || !hostMatchesList(host, VIDEO_HOSTS)) {
      callback({ responseHeaders: details.responseHeaders });
      return;
    }

    const responseHeaders = { ...details.responseHeaders };
    upsertHeader(responseHeaders, 'Access-Control-Allow-Origin', '*');
    upsertHeader(responseHeaders, 'Access-Control-Allow-Headers', '*');
    callback({ responseHeaders });
  });
}

function upsertHeader(headers, name, value) {
  const lower = name.toLowerCase();
  for (const k of Object.keys(headers)) {
    if (k.toLowerCase() === lower) { headers[k] = value; return; }
  }
  headers[name] = value;
}

app.whenReady().then(() => {
  // Prime the config cache now that userData path is fully reliable.
  if (_configCache === null) _configCache = _readConfigFromDisk();

  logger.init(app.getPath('userData'), app.getVersion(), process.versions.electron);
  logger.patchConsole();
  logger.info('main', 'app ready', { platform: process.platform, version: app.getVersion(), electron: process.versions.electron });

  setupSessionRequestHeaders();
  setupCdnProtocol(logger);
  getDownloadDirectory();
  createWindow();
  createTray();
  // Discord RPC
  initDiscordRpc();
});
app.on('before-quit', () => { logger.info('main', 'app before-quit'); if (discordRpc) discordRpc.destroy(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

ipcMain.on('window:minimize', () => mainWindow?.minimize());
ipcMain.on('window:maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize();
  else mainWindow?.maximize();
});
ipcMain.on('window:close', () => {
  if (getMinimizeToTray()) {
    mainWindow?.hide();
  } else {
    isQuitting = true;
    app.quit();
  }
});

// ——— App settings ———

ipcMain.handle('app:getSettings', () => {
  try {
    const p = getConfigPath();
    const data = fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : {};
    return {
      minimizeToTray: getMinimizeToTray(),
      adaptiveAcceleration: getAdaptiveAcceleration(),
      upscaleEnabled: data.upscaleEnabled === true,
      upscaleMode: typeof data.upscaleMode === 'number' ? data.upscaleMode : 15,
      playerDebugOverlay: data.playerDebugOverlay === true,
      uiZoom: getUiZoom(),
      ...buildDiscordRpcSettingsPayload(data),
    };
  } catch (_) {
    return {
      minimizeToTray: getMinimizeToTray(),
      adaptiveAcceleration: getAdaptiveAcceleration(),
      upscaleEnabled: false,
      upscaleMode: 15,
      playerDebugOverlay: false,
      uiZoom: 100,
      ...buildDiscordRpcSettingsPayload({}),
    };
  }
});

ipcMain.handle('app:saveSettings', (_, settings) => {
  if (settings && typeof settings === 'object') {
    saveConfig(settings);
    if (typeof settings.uiZoom === 'number') {
      applyUiZoom(settings.uiZoom);
    }
    if (typeof settings.discordRpcEnabled === 'boolean' && discordRpc) {
      discordRpc.setPaused(!settings.discordRpcEnabled);
      if (settings.discordRpcEnabled && mainWindow && !mainWindow.isDestroyed()) {
        discordRpc.setMainWindow(mainWindow);
        if (getDiscordRpcShowBrowsing()) {
          discordRpc.setBrowsing(_discordSessionStart);
        }
      }
    }
    if (typeof settings.discordRpcShowBrowsing === 'boolean' && discordRpc && getDiscordRpcEnabled()) {
      if (getDiscordRpcShowBrowsing()) {
        discordRpc.setBrowsing(_discordSessionStart);
      } else {
        setDiscordGenericInApp();
      }
    }
    if (
      settings.discordRpcShowWatching !== undefined
      || settings.discordRpcShowProgress !== undefined
      || settings.discordRpcShowDubber !== undefined
      || settings.discordRpcShowImages !== undefined
    ) {
      applyDiscordRpcOptionsFromSettings();
    }
    if (typeof settings.playerDebugOverlay === 'boolean' && playerWindowRef && !playerWindowRef.isDestroyed()) {
      playerWindowRef.webContents.send('player:debugOverlay', settings.playerDebugOverlay);
    }
  }
});

// ——— Auth ———

ipcMain.handle('anix:getAuthStatus', () => {
  const token = loadSavedToken();
  return { hasToken: !!token };
});

// Лёгкая проверка соединения с API.
// Если токена ещё нет (пользователь не залогинен) — считаем соединение доступным,
// чтобы не блокировать экран логина.
// Если сеть/сервер недоступны — промис отклонится.
loggedHandle('anix:checkConnection', async () => {
  try {
    const token = loadSavedToken();
    if (!token) {
      return { ok: true };
    }
    const client = getAnixart();
    await client.endpoints.feed.latest(1);
    return { ok: true };
  } catch (err) {
    handleAnixError(err, 'checkConnection');
  }
});

loggedHandle('anix:login', async (_, username, password) => {
  // Для логина используем отдельный клиент БЕЗ сохранённого токена,
  // чтобы старый токен не перезаписывал учётку.
  const { baseUrl } = loadConfig();
  const loginClient = createAnixClient({ baseUrl });
  const res = await loginClient.endpoints.auth.signIn({ login: username, password });
  const code = res?.code;
  const profile = res?.profile;
  const profileToken = res?.profileToken;
  // Log auth result but never the token/password
  logger.info('auth', 'login attempt', { code, profileId: profile?.id, login: profile?.login });
  if (code === DefaultResult.Ok && profileToken?.token) {
    saveConfig({
      token: profileToken.token,
      profileId: profile?.id ?? null,
      profileLogin: profile?.login ?? null,
      profileAvatar: profile?.avatar ?? null,
      profileRaw: profile || null,
    });
    logger.info('auth', 'login success', { profileId: profile?.id, login: profile?.login });
    anixart = createAnixClient({ baseUrl, token: profileToken.token });
    return { success: true };
  }
  logger.warn('auth', 'login failed', { code });
  return { success: false, code };
});

loggedHandle('anix:logout', async () => {
  saveConfig({
    token: null,
    profileId: null,
    profileLogin: null,
    profileAvatar: null,
    profileRaw: null,
  });
  logger.info('auth', 'logout');
  anixart = null;
  return undefined;
});

ipcMain.handle('anix:getBaseUrl', () => {
  return loadConfig().baseUrl;
});

ipcMain.handle('anix:setBaseUrl', (_, baseUrl) => {
  if (typeof baseUrl !== 'string' || !baseUrl) return;
  saveConfig({ baseUrl });
  anixart = null;
  return undefined;
});

// Пинг произвольного эндпоинта без изменения глобального baseUrl и без оффлайн‑экрана.
ipcMain.handle('anix:pingBaseUrl', async (_, baseUrl) => {
  if (typeof baseUrl !== 'string' || !baseUrl) return { ok: false, latencyMs: null };
  try {
    const started = Date.now();
    const client = createAnixClient({ baseUrl, token: undefined });
    await client.endpoints.feed.latest(1);
    return { ok: true, latencyMs: Date.now() - started };
  } catch (err) {
    // Здесь намеренно НЕ вызываем handleAnixError, чтобы не включать глобальный оффлайн‑режим
    // при проверке альтернативных эндпоинтов.
    appendLog('endpoint_ping', { baseUrl, error: String(err) });
    return { ok: false, latencyMs: null };
  }
});

// Тестовый метод для проверки оффлайн‑экрана из renderer (dev).
ipcMain.handle('anix:testOffline', async () => {
  const err = new Error('TypeError: fetch failed (test)');
  (err).code = 'ENOTFOUND';
  handleAnixError(err, 'testOffline');
});

ipcMain.handle('app:getDeviceId', () => {
  return getOrCreateDeviceId();
});

ipcMain.handle('admin:getSession', () => {
  const raw = _configCache ?? _readConfigFromDisk();
  return {
    token: raw.adminSessionToken ?? null,
    userId: raw.adminSessionUserId ?? null,
  };
});

ipcMain.handle('admin:saveSession', (_, payload) => {
  if (!payload || typeof payload !== 'object') return false;
  saveConfig({
    adminSessionToken: payload.token ?? null,
    adminSessionUserId: payload.userId ?? null,
  });
  return true;
});

ipcMain.handle('admin:clearSession', () => {
  saveConfig({ adminSessionToken: null, adminSessionUserId: null });
  return true;
});

ipcMain.handle('anix:getAnixbackEndpoint', () => {
  const raw = _configCache ?? _readConfigFromDisk();
  const v = raw.anixbackEndpoint;
  return v === 'local' || v === 'prod' ? v : null;
});

ipcMain.handle('anix:setAnixbackEndpoint', (_, mode) => {
  if (mode !== 'local' && mode !== 'prod') return false;
  saveConfig({ anixbackEndpoint: mode });
  return true;
});

const ANIXBACK_LOCAL_ORIGIN = 'http://localhost:8787';
const ANIXBACK_PROD_ORIGIN = 'https://anix.maks1mio.su';

function getAnixbackOrigin() {
  const raw = _configCache ?? _readConfigFromDisk();
  const mode = raw.anixbackEndpoint;
  if (mode === 'local') return ANIXBACK_LOCAL_ORIGIN;
  if (mode === 'prod') return ANIXBACK_PROD_ORIGIN;
  return isDev ? ANIXBACK_LOCAL_ORIGIN : ANIXBACK_PROD_ORIGIN;
}

ipcMain.handle('anix:releaseInfoGeoBypass', async (_, releaseId) => {
  const id = Number(releaseId);
  if (!Number.isFinite(id) || id <= 0) {
    throw new Error('invalid release id');
  }

  const { token } = loadConfig();
  const url = `${getAnixbackOrigin()}/api/anixart/release/${id}?extended=true`;
  const headers = { Accept: 'application/json' };
  if (token) headers['X-Anixart-Token'] = token;

  const res = await fetch(url, { headers });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`anixback geo bypass HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  return JSON.parse(text);
});

ipcMain.handle('anix:selfProfile', async () => {
  const config = loadConfig();
  const { profileLogin, profileAvatar, profileRaw } = config;
  const profileId = config.profileId || (profileRaw && profileRaw.id) || null;
  appendLog('profile', { event: 'selfProfile_start', profileId, hasRaw: !!profileRaw, hasLogin: !!profileLogin });

  // Если есть profileId — всегда пробуем свежий запрос для полных данных
  if (profileId) {
    try {
      const client = getAnixart();
      const data = await client.endpoints.profile.info(profileId);
      if (data && data.is_my_profile === false) {
        appendLog('profile', { event: 'selfProfile_mismatch', savedProfileId: profileId });
        saveConfig({ profileId: null, profileLogin: null, profileAvatar: null, profileRaw: null });
        return { profile: null, session_mismatch: true };
      }
      if (data && data.profile) {
        appendLog('profile', { event: 'selfProfile_ok', profileId });
        return data;
      }
    } catch (err) {
      appendLog('profile', { event: 'selfProfile_api_error', profileId, error: String(err) });
      handleAnixError(err, 'selfProfile');
    }
  }

  // Фоллбэк: кэшированный profileRaw
  if (profileRaw) {
    appendLog('profile', { event: 'selfProfile_cached_fallback', profileId });
    return { code: 0, profile: profileRaw, is_my_profile: true };
  }

  // Последний фоллбэк: базовые данные
  if (profileLogin || profileAvatar) {
    return {
      profile: { id: profileId || null, login: profileLogin || '', avatar: profileAvatar || '' },
      is_my_profile: true,
    };
  }

  appendLog('profile', { event: 'selfProfile_no_data' });
  return null;
});

// ——— Anixart API bridge (raw JSON responses for renderer) ———

loggedHandle('anix:releaseById', async (_, id, extended = true) => {
  try {
    const client = getAnixart();
    const data = await client.endpoints.release.info(id, extended);
    return data;
  } catch (err) {
    handleAnixError(err, 'releaseById');
  }
});

ipcMain.handle('anix:getVideos', async (_, releaseId) => {
  try {
    const client = getAnixart();
    return await client.endpoints.release.getVideos(releaseId);
  } catch (err) {
    handleAnixError(err, 'getVideos');
  }
});

ipcMain.handle('anix:getVideoInCategory', async (_, releaseId, categoryId, page = 1) => {
  try {
    const client = getAnixart();
    return await client.endpoints.release.getVideoInCategory({ id: releaseId, categoryId, page });
  } catch (err) {
    handleAnixError(err, 'getVideoInCategory');
  }
});

ipcMain.handle('anix:getDubbers', async (_, releaseId) => {
  try {
    const client = getAnixart();
    return await client.endpoints.release.getDubbers(releaseId);
  } catch (err) {
    handleAnixError(err, 'getDubbers');
  }
});

ipcMain.handle('anix:typeAll', async () => {
  try {
    const client = getAnixart();
    return await client.endpoints.type.types();
  } catch (err) {
    handleAnixError(err, 'typeAll');
  }
});

ipcMain.handle('anix:getDubberSources', async (_, releaseId, dubberId) => {
  try {
    const client = getAnixart();
    return await client.endpoints.release.getDubberSources(releaseId, dubberId);
  } catch (err) {
    handleAnixError(err, 'getDubberSources');
  }
});

ipcMain.handle('anix:getEpisodes', async (_, releaseId, dubberId, sourceId, sort = 1) => {
  try {
    const client = getAnixart();
    return await client.endpoints.release.getEpisodes(releaseId, dubberId, sourceId, sort);
  } catch (err) {
    handleAnixError(err, 'getEpisodes');
  }
});

ipcMain.handle('anix:getEpisode', async (_, releaseId, sourceId, episodePosition) => {
  try {
    const client = getAnixart();
    return await client.endpoints.release.getEpisode(releaseId, sourceId, episodePosition);
  } catch (err) {
    handleAnixError(err, 'getEpisode');
  }
});

ipcMain.handle('anix:getEpisodeUpdates', async (_, releaseId, page = 0) => {
  try {
    const client = getAnixart();
    return await client.endpoints.episode.updates(releaseId, page);
  } catch (err) {
    handleAnixError(err, 'getEpisodeUpdates');
  }
});

/**
 * Получает прямую ссылку на Sibnet-видео.
 *
 * Корень проблемы «раз через раз»: SibnetParser.srcMatch — статичный /g-регекс,
 * он запоминает lastIndex между вызовами. Чётные вызовы ищут с нулевой позиции
 * и находят src; нечётные начинают с lastIndex прошлого совпадения, не находят
 * ничего и возвращают null. Сбрасываем lastIndex перед каждым вызовом.
 *
 * Два этапа:
 *  1. SibnetParser.getDirectLink (с правильным lastIndex)
 *  2. Собственный fetch с браузерным UA + такая же логика — парсим src из HTML,
 *     затем следуем редиректу, чтобы получить финальный CDN-URL
 */
async function getSibnetDirectLink(embedUrl) {
  const SIBNET_HEADERS = {
    'User-Agent':      BROWSER_UA,
    'Referer':         'https://sibnet.ru/',
    'Accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8',
  };

  // Этап 1 — SibnetParser с принудительным сбросом lastIndex (/g-флаг!)
  try {
    if (SibnetParser.srcMatch) SibnetParser.srcMatch.lastIndex = 0;
    const direct = await SibnetParser.getDirectLink(embedUrl);
    if (direct && !direct.includes('404')) {
      return direct.startsWith('http') ? direct : `https:${direct}`;
    }
  } catch {}

  // Этап 2 — собственный fetch с браузерными заголовками
  // Повторяет логику SibnetParser, но с нормальным User-Agent
  try {
    const pageRes = await fetch(embedUrl, { headers: SIBNET_HEADERS });
    const html    = await pageRes.text();

    // Sibnet кладёт src-путь видео в строку: src: "/shell.php?video_pid=...&d=...&s=..."
    const SRC_RE = /src:\s*("\/[^"]+?")/i;
    const m = SRC_RE.exec(html);
    if (m) {
      const srcPath   = m[1].replace(/"/g, '');
      const videoUrl  = `https://video.sibnet.ru${srcPath}`;

      // Следуем редиректу — финальный URL и есть прямая ссылка на поток
      const streamRes = await fetch(videoUrl, {
        headers:  { 'Referer': embedUrl, 'User-Agent': BROWSER_UA },
        redirect: 'follow',
      });
      // streamRes.url — URL после всех редиректов (реальный CDN)
      if (streamRes.url && streamRes.url !== videoUrl) return streamRes.url;
      return videoUrl; // если редиректов нет — сам signed-URL уже работает
    }
  } catch {}

  return null;
}

const KODIK_PLAYER_ORIGIN = 'https://kodikplayer.com/';
const KODIK_VALID_SRC = /\/\/(get|cloud)\.(kodik-storage|solodcdn)\.com\/useruploads\/.*?\/.*?\/(240|360|480|720|1080)\.mp4:hls:manifest\.m3u8/;

function normalizeKodikEmbedUrl(embedUrl) {
  let url = embedUrl.startsWith('http') ? embedUrl : `https:${embedUrl}`;
  try {
    const u = new URL(url);
    url = u.origin + u.pathname;
  } catch {}
  return url;
}

function decryptKodikSrc(src) {
  const zCharCode = 'Z'.charCodeAt(0);
  const decryptedBase64 = src.replace(/[a-zA-Z]/g, (e) => {
    let eCharCode = e.charCodeAt(0);
    return String.fromCharCode(
      (eCharCode <= zCharCode ? 90 : 122) >= (eCharCode = eCharCode + 18) ? eCharCode : eCharCode - 26,
    );
  });
  return atob(decryptedBase64);
}

function parseKodikLinkFromUrl(pageUrl) {
  const m = pageUrl.match(/\/(seria|video|movie|anime)\/(\d+)\/([0-9a-f]+)\//i);
  if (!m) return null;
  return { type: m[1], id: m[2], hash: m[3] };
}

function parseKodikEmbedHtml(html) {
  const hash = html.match(/\w+\.hash\s=\s'([^']+)';/is)?.[1];
  const id = html.match(/\w+\.id\s=\s'([^']+)';/is)?.[1];
  const type = html.match(/\w+\.type\s=\s'([^']+)';/is)?.[1];
  return { hash, id, type };
}

function decryptKodikLinks(links) {
  if (!links || typeof links !== 'object') return null;
  for (const [, sources] of Object.entries(links)) {
    if (!Array.isArray(sources)) continue;
    for (const source of sources) {
      if (!source?.src || KODIK_VALID_SRC.test(source.src)) continue;
      try {
        source.src = decryptKodikSrc(source.src);
      } catch {}
    }
  }
  return links;
}

/** /ftor только с type+hash+id — urlParams с localhost/_sign ломают запрос (500) */
async function fetchKodikFtorLinks(pageUrl, videoInfo) {
  const { type, hash, id } = videoInfo;
  if (!type || !hash || !id) return null;

  const ftorUrl = `https://kodikplayer.com/ftor?${new URLSearchParams({ type, hash, id }).toString()}`;
  let ftorBuf;
  if (typeof session.defaultSession.fetch === 'function') {
    const res = await session.defaultSession.fetch(ftorUrl, {
      headers: { Referer: pageUrl, Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    ftorBuf = Buffer.from(await res.arrayBuffer());
  } else {
    ftorBuf = await sessionFetchBuffer(ftorUrl, { Referer: pageUrl, Accept: 'application/json' });
  }

  let payload;
  try {
    payload = JSON.parse(ftorBuf.toString('utf8'));
  } catch {
    return null;
  }
  if (!payload?.links || typeof payload.links !== 'object') return null;
  return decryptKodikLinks(payload.links);
}

async function getKodikDirectLinks(embedUrl) {
  const pageUrl = await resolveKodikEmbedUrl(embedUrl);
  let videoInfo = parseKodikLinkFromUrl(pageUrl);

  if (!videoInfo?.hash || !videoInfo?.id || !videoInfo?.type) {
    try {
      const html = await sessionFetchText(pageUrl, {
        Referer: KODIK_PLAYER_ORIGIN,
        Accept: 'text/html,application/xhtml+xml',
      });
      videoInfo = parseKodikEmbedHtml(html);
    } catch (e) {
      console.warn('kodik embed fetch:', e?.message || e);
    }
  }

  try {
    return await fetchKodikFtorLinks(pageUrl, videoInfo || {});
  } catch (e) {
    console.warn('kodik ftor:', e?.message || e);
  }
  return null;
}

async function resolveKodikEmbedUrl(embedUrl) {
  let url = normalizeKodikEmbedUrl(embedUrl);
  const host = (url.match(/https?:\/\/([^/]+)/) || [])[1] || '';
  if (host.includes('kodik')) return url;

  if (host.includes('aniqit') || host.includes('anixis') || host.includes('aniqart')) {
    const html = await sessionFetchText(url, {
      Referer: KODIK_PLAYER_ORIGIN,
      Accept: 'text/html,application/xhtml+xml',
    });
    const m = html.match(/https?:\\\/\\\/(?:[^\\/]+\.)?kodikplayer\.com\\\/seria\\\/[^"']+/i)
      ?? html.match(/(?:https:)?\/\/[^"'\s]*kodikplayer\.com\/seria\/[^"'\s]+/i);
    if (m) {
      let kodikUrl = m[0].replace(/\\/g, '');
      if (kodikUrl.startsWith('//')) kodikUrl = `https:${kodikUrl}`;
      return normalizeKodikEmbedUrl(kodikUrl);
    }
  }
  return url;
}

/** Загрузка через session Chromium — те же Referer/UA, что и у плеера */
function sessionFetchBuffer(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = net.request({ url, session: session.defaultSession, redirect: 'follow' });
    const merged = { 'User-Agent': ANIXART_UA, ...headers };
    for (const [k, v] of Object.entries(merged)) {
      if (v != null && v !== '') req.setHeader(k, String(v));
    }
    const chunks = [];
    req.on('response', (res) => {
      if (res.statusCode && res.statusCode >= 400) {
        reject(new Error(`HTTP ${res.statusCode}`));
        res.resume();
        return;
      }
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.end();
  });
}

async function sessionFetchText(url, headers = {}) {
  return (await sessionFetchBuffer(url, headers)).toString('utf8');
}

function sessionFetchStreamToFile(url, outputPath, headers = {}, onProgress = null) {
  return new Promise((resolve, reject) => {
    const req = net.request({ url, session: session.defaultSession, redirect: 'follow' });
    const merged = { 'User-Agent': ANIXART_UA, ...headers };
    for (const [k, v] of Object.entries(merged)) {
      if (v != null && v !== '') req.setHeader(k, String(v));
    }
    req.on('response', (res) => {
      if (res.statusCode && res.statusCode >= 400) {
        reject(new Error(`HTTP ${res.statusCode}`));
        res.resume();
        return;
      }
      const total = parseInt(res.headers['content-length'] || '0', 10) || 0;
      let received = 0;
      let lastEmit = 0;
      const ws = fs.createWriteStream(outputPath);
      const fail = (err) => {
        try { ws.destroy(); } catch (_) {}
        reject(err);
      };
      res.on('data', (chunk) => {
        received += chunk.length;
        ws.write(chunk);
        const now = Date.now();
        if (onProgress && now - lastEmit >= 300) {
          lastEmit = now;
          onProgress(received, total);
        }
      });
      res.on('end', () => {
        ws.end();
        ws.on('finish', () => {
          if (onProgress) onProgress(received || 1, total || received || 1);
          resolve();
        });
      });
      res.on('error', fail);
      ws.on('error', fail);
    });
    req.on('error', reject);
    req.end();
  });
}

/** Прямые MP4 с embed AniLibria (как fallback в Android AniLibriaParser) */
async function scrapeAnilibriaDirectFiles(embedUrl, epNum) {
  try {
    const html = await sessionFetchText(embedUrl, {
      Accept: 'text/html,application/xhtml+xml',
      Referer: embedUrl.split('?')[0],
    });
    const blockRe = new RegExp(`"s${epNum}"[^]*?"file":"(.*?)"`, 's');
    const blockMatch = blockRe.exec(html);
    if (!blockMatch) return null;

    const raw = blockMatch[1].replace(/\\\//g, '/');
    const qualityMap = {};
    const qualRe = /\[(\d+)p\]([^,\[]+)/g;
    let m;
    while ((m = qualRe.exec(raw)) !== null) {
      const src = m[2].trim();
      if (src) qualityMap[m[1]] = src.startsWith('http') ? src : `https:${src}`;
    }
    if (Object.keys(qualityMap).length) return qualityMap;

    if (raw && !/^\[/.test(raw)) {
      const single = raw.startsWith('http') ? raw : `https:${raw}`;
      if (/\.(mp4|mkv|webm)(\?|$)/i.test(single)) return { '720': single };
    }
  } catch (_) {}
  return null;
}

let ffmpegPathCache;

async function resolveFfmpegPath() {
  if (ffmpegPathCache !== undefined) return ffmpegPathCache;

  try {
    const bundled = require('ffmpeg-static');
    if (typeof bundled === 'string' && fs.existsSync(bundled)) {
      ffmpegPathCache = bundled;
      return ffmpegPathCache;
    }
  } catch (_) {}

  const tryCmd = process.platform === 'win32' ? 'where ffmpeg' : 'which ffmpeg';
  try {
    const { stdout } = await execFileAsync(tryCmd, { shell: true });
    const line = stdout.trim().split(/\r?\n/).map(s => s.trim()).find(Boolean);
    if (line && fs.existsSync(line)) {
      ffmpegPathCache = line;
      return ffmpegPathCache;
    }
  } catch (_) {}

  ffmpegPathCache = null;
  return null;
}

function buildFfmpegHeaderArg(headers = {}) {
  const lines = [];
  if (headers.Referer) lines.push(`Referer: ${headers.Referer}`);
  lines.push(`User-Agent: ${headers['User-Agent'] || BROWSER_UA}`);
  return `${lines.join('\r\n')}\r\n`;
}

/** Разбор m3u8: master → media, список сегментов, нужна ли расшифровка */
async function resolveHlsSegments(m3u8Url, headers = {}) {
  const text = await sessionFetchText(m3u8Url, headers);
  if (text.includes('#EXT-X-STREAM-INF')) {
    const lines = text.split('\n');
    let bestUrl = null;
    let bestBw = 0;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line.startsWith('#EXT-X-STREAM-INF')) continue;
      const bwMatch = /BANDWIDTH=(\d+)/i.exec(line);
      const bw = bwMatch ? parseInt(bwMatch[1], 10) : 0;
      const next = lines[i + 1]?.trim();
      if (next && !next.startsWith('#') && bw >= bestBw) {
        bestBw = bw;
        bestUrl = next.startsWith('http') ? next : new URL(next, m3u8Url).href;
      }
    }
    if (!bestUrl) throw new Error('В master-плейлисте нет потока');
    return resolveHlsSegments(bestUrl, headers);
  }

  const encrypted = /#EXT-X-KEY:/i.test(text);
  const baseUrl = m3u8Url.substring(0, m3u8Url.lastIndexOf('/') + 1);
  const segments = text.split('\n')
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('#'))
    .map(s => (s.startsWith('http') ? s : baseUrl + s));

  if (segments.length === 0) throw new Error('В плейлисте нет сегментов');
  return { segments, encrypted };
}

/** Параллельная загрузка HLS-сегментов (до 12 одновременно), запись по порядку */
async function downloadHlsParallel(segments, outputPath, headers = {}, onProgress = null) {
  const total = segments.length;
  const pending = new Map();
  let nextWrite = 0;
  let nextFetch = 0;
  const CONCURRENCY = 12;
  const ws = fs.createWriteStream(outputPath);

  const flush = () => {
    while (pending.has(nextWrite)) {
      ws.write(pending.get(nextWrite));
      pending.delete(nextWrite);
      nextWrite++;
      if (onProgress) onProgress(nextWrite, total);
    }
  };

  async function worker() {
    while (nextFetch < total) {
      const i = nextFetch++;
      const buf = await sessionFetchBuffer(segments[i], headers);
      pending.set(i, buf);
      flush();
    }
  }

  const workers = Math.min(CONCURRENCY, total);
  await Promise.all(Array.from({ length: workers }, () => worker()));

  while (nextWrite < total) {
    await new Promise(r => setTimeout(r, 20));
    flush();
  }
  if (nextWrite !== total) throw new Error('Не все сегменты загружены');

  ws.end();
  await new Promise((resolve, reject) => {
    ws.on('finish', resolve);
    ws.on('error', reject);
  });
}

async function remuxTsToMp4(inputPath, outputPath) {
  const ffmpeg = await resolveFfmpegPath();
  if (!ffmpeg) {
    fs.renameSync(inputPath, outputPath);
    return;
  }
  await new Promise((resolve, reject) => {
    const args = ['-y', '-hide_banner', '-loglevel', 'error', '-i', inputPath, '-c', 'copy', '-movflags', '+faststart', outputPath];
    const proc = spawn(ffmpeg, args, { windowsHide: true });
    let stderr = '';
    proc.stderr.on('data', (c) => { stderr += c.toString(); });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr.trim() || `ffmpeg remux ${code}`));
    });
  });
}

/** HLS → MP4: параллельные сегменты или ffmpeg при шифровании */
async function downloadHlsToFile(m3u8Url, outputPath, headers = {}, onProgress = null) {
  const { segments, encrypted } = await resolveHlsSegments(m3u8Url, headers);
  if (encrypted) {
    await downloadWithFfmpeg(m3u8Url, outputPath, headers, onProgress);
    return;
  }

  const tmpPath = `${outputPath}.ts.part`;
  try {
    await downloadHlsParallel(segments, tmpPath, headers, onProgress);
    await remuxTsToMp4(tmpPath, outputPath);
  } finally {
    try { if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath); } catch (_) {}
  }
}

/** HLS → MP4 через ffmpeg (fallback для зашифрованных потоков) */
async function downloadWithFfmpeg(inputUrl, outputPath, headers = {}, onProgress = null) {
  const ffmpeg = await resolveFfmpegPath();
  if (!ffmpeg) {
    throw new Error('Для HLS нужен ffmpeg. Установите ffmpeg и добавьте в PATH.');
  }

  return new Promise((resolve, reject) => {
    const args = [
      '-y', '-hide_banner', '-loglevel', 'error',
      '-headers', buildFfmpegHeaderArg(headers),
      '-i', inputUrl,
      '-c', 'copy',
      '-bsf:a', 'aac_adtstoasc',
      '-movflags', '+faststart',
      '-progress', 'pipe:1',
      '-nostats',
      outputPath,
    ];

    const proc = spawn(ffmpeg, args, { windowsHide: true });
    let durationUs = 0;
    let lastEmit = 0;

    proc.stdout.on('data', (chunk) => {
      for (const line of chunk.toString().split('\n')) {
        if (line.startsWith('duration=')) {
          const v = parseFloat(line.slice(9));
          if (Number.isFinite(v) && v > 0) durationUs = Math.round(v * 1e6);
        }
        if (line.startsWith('out_time_us=')) {
          const outUs = parseInt(line.slice(12), 10);
          if (!Number.isFinite(outUs) || !onProgress) continue;
          const now = Date.now();
          if (now - lastEmit < 350) continue;
          lastEmit = now;
          onProgress(outUs, durationUs > 0 ? durationUs : 0);
        }
      }
    });

    let stderr = '';
    proc.stderr.on('data', (c) => { stderr += c.toString(); });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0) {
        if (onProgress) onProgress(1, 1);
        resolve();
      } else {
        reject(new Error(stderr.trim() || `ffmpeg завершился с кодом ${code}`));
      }
    });
  });
}

/** Прямые ссылки на видео (как в AniDesk): парсеры anixartjs, чтобы не грузить embed в iframe и не получать 500 от aniqit.com */
ipcMain.handle('anix:getDirectVideoLink', async (_, embedUrl) => {
  const EMPTY = { directUrl: null, quality: null, qualityMap: {} };
  if (!embedUrl || typeof embedUrl !== 'string') return EMPTY;
  const url = embedUrl.startsWith('http') ? embedUrl : `https:${embedUrl}`;
  const host = (url.match(/https?:\/\/([^/]+)/) || [])[1] || '';
  const toAbs = (src) => (!src ? null : src.startsWith('http') ? src : `https:${src}`);
  const PRIO  = ['1080', '1080p', '720', '720p', '480', '480p', '360', '360p'];

  try {
    // ── Kodik (array format: { "720": [{ src }], ... }) ─────────────────
    if (host.includes('kodik') || host.includes('aniqit') || host.includes('anixis') || host.includes('aniqart')) {
      const links = await getKodikDirectLinks(url);
      if (!links || typeof links !== 'object') return EMPTY;
      // Strip :hls:manifest.m3u8 / :hls:hls.m3u8 suffix → direct MP4 download URL
      // (same approach as in the Android app's KodikParser.i())
      const stripHls = (u) => u
        ? u.replace(/:hls:manifest\.m3u8$/, '').replace(/:hls:hls\.m3u8$/, '')
        : u;
      const qualityMap = {};
      for (const [key, arr] of Object.entries(links)) {
        const src = toAbs(arr?.[0]?.src);
        if (src) qualityMap[key.replace('p', '')] = stripHls(src);
      }
      const best = PRIO.find(k => qualityMap[k]) || Object.keys(qualityMap)[0];
      const directUrl = qualityMap[best] || null;
      return {
        directUrl,
        quality: best || null,
        qualityMap,
        downloadHeaders: directUrl ? { 'Referer': 'https://kodikplayer.com/' } : {},
      };
    }

    // ── Sibnet — трёхэтапный парсер с браузерными заголовками ───────────
    if (host.includes('sibnet')) {
      const direct = await getSibnetDirectLink(url);
      if (!direct) return EMPTY;
      return { directUrl: direct, quality: '720', qualityMap: { '720': direct } };
    }

    // ── AniLibria / AniLiberty ──────────────────────────────────────────────
    // Не используем AniLibriaParser.getDirectLinks() из anixartjs — там regex с
    // флагом /g хранит lastIndex как статическое поле класса, из-за чего каждый
    // второй вызов возвращает null (lastIndex не сбрасывается между вызовами).
    if (host.includes('aniliberty') || host.includes('anilibria') || host.includes('libria')) {
      // Парсим id и ep из URL без /g-regex, чтобы избежать stateful lastIndex
      const parsed   = new URL(url);
      const releaseId = parsed.searchParams.get('id');
      const epOrdinal = parsed.searchParams.get('ep');
      if (!releaseId || !epOrdinal) return EMPTY;

      // Определяем домен API (aniliberty.top или api.anilibria.tv)
      const apiBase = host.includes('aniliberty') || host.includes('libria.fun')
        ? 'https://aniliberty.top/api/v1/anime/releases'
        : 'https://aniliberty.top/api/v1/anime/releases';

      const apiResp = await fetch(`${apiBase}/${releaseId}`);
      if (!apiResp.ok) return EMPTY;
      const body = await apiResp.json();
      if (!body?.episodes) return EMPTY;

      const ep = body.episodes.find(e => String(e.ordinal) === String(parseInt(epOrdinal, 10)));
      if (!ep) return EMPTY;

      // Прямые MP4 с embed-страницы (fallback как в Android AniLibriaParser)
      const directMap = await scrapeAnilibriaDirectFiles(url, parseInt(epOrdinal, 10));
      if (directMap && Object.keys(directMap).length) {
        const bestDirect = PRIO.find(k => directMap[k]) || Object.keys(directMap)[0];
        const directUrl = directMap[bestDirect] || null;
        return {
          directUrl,
          quality: bestDirect || null,
          qualityMap: directMap,
          downloadHeaders: { Referer: url.split('?')[0], 'User-Agent': BROWSER_UA },
        };
      }

      const qualityMap = {};
      if (ep.hls_1080) qualityMap['1080'] = toAbs(ep.hls_1080);
      if (ep.hls_720)  qualityMap['720']  = toAbs(ep.hls_720);
      if (ep.hls_480)  qualityMap['480']  = toAbs(ep.hls_480);
      if (!Object.keys(qualityMap).length) return EMPTY;

      const best = PRIO.find(k => qualityMap[k]) || Object.keys(qualityMap)[0];
      const directUrl = qualityMap[best] || null;
      return {
        directUrl,
        quality: best || null,
        qualityMap,
        isHls: /\.m3u8(\?|$)/i.test(directUrl || ''),
        downloadHeaders: { Referer: url.split('?')[0], 'User-Agent': BROWSER_UA },
      };
    }
  } catch (e) {
    console.error('getDirectVideoLink error:', e?.message || e);
  }
  return EMPTY;
});

const DOWNLOAD_VIDEO_EXT = new Set(['.mp4', '.mkv', '.webm', '.avi', '.mov', '.m4v']);
const MIN_DOWNLOAD_VIDEO_BYTES = 256 * 1024;

function getDefaultDownloadDirectory() {
  return path.join(app.getPath('videos'), 'Anixapp');
}

function ensureDownloadDirectory(dir) {
  if (!dir) return;
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch (e) {
    console.warn('ensureDownloadDirectory:', e?.message || e);
  }
}

function getDownloadDirectory() {
  const raw = _configCache ?? _readConfigFromDisk();
  const custom = raw.downloadDirectory;
  let dir;
  if (typeof custom === 'string' && custom.trim()) {
    dir = custom.trim();
  } else {
    dir = getDefaultDownloadDirectory();
  }
  ensureDownloadDirectory(dir);
  return dir;
}

function setDownloadDirectory(dir) {
  if (typeof dir !== 'string' || !dir.trim()) return false;
  saveConfig({ downloadDirectory: dir.trim() });
  return true;
}

function sanitizeDownloadDirName(name) {
  return String(name || 'downloads')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120) || 'downloads';
}

function guessTitleFromFilename(name) {
  const m = name.match(/^(.+?) [^ ]+ \d{2}\.\w+$/i);
  if (m) return m[1].trim();
  return name.replace(/\.[^.]+$/, '');
}

function scanDownloadLibrary(rootDir) {
  const groups = new Map();
  const addFile = (filePath, stat, groupName) => {
    const key = groupName || 'Без папки';
    if (!groups.has(key)) {
      groups.set(key, { id: key, name: key, files: [] });
    }
    groups.get(key).files.push({
      name: path.basename(filePath),
      path: filePath,
      size: stat.size,
      modifiedAt: stat.mtimeMs,
    });
  };

  if (!rootDir || !fs.existsSync(rootDir)) return [];

  let entries;
  try {
    entries = fs.readdirSync(rootDir, { withFileTypes: true });
  } catch {
    return [];
  }

  for (const ent of entries) {
    const full = path.join(rootDir, ent.name);
    if (ent.isDirectory()) {
      let files;
      try {
        files = fs.readdirSync(full);
      } catch {
        continue;
      }
      for (const f of files) {
        const fp = path.join(full, f);
        const ext = path.extname(f).toLowerCase();
        if (!DOWNLOAD_VIDEO_EXT.has(ext)) continue;
        try {
          addFile(fp, fs.statSync(fp), ent.name);
        } catch {}
      }
      continue;
    }
    const ext = path.extname(ent.name).toLowerCase();
    if (!DOWNLOAD_VIDEO_EXT.has(ext)) continue;
    try {
      addFile(full, fs.statSync(full), guessTitleFromFilename(ent.name));
    } catch {}
  }

  const list = [...groups.values()];
  for (const g of list) {
    g.files.sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  }
  list.sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  return list;
}

function isValidDownloadVideoFile(filePath) {
  try {
    const st = fs.statSync(filePath);
    return st.isFile() && st.size >= MIN_DOWNLOAD_VIDEO_BYTES;
  } catch {
    return false;
  }
}

function findExistingDownloadFile(folder, filename) {
  const baseDir = getDownloadDirectory();
  const targetDir = folder
    ? path.join(baseDir, sanitizeDownloadDirName(folder))
    : baseDir;
  if (!fs.existsSync(targetDir)) return null;

  const parsed = path.parse(sanitizeDownloadName(filename));
  const ext = parsed.ext || '.mp4';
  const baseName = parsed.name || 'episode';

  const direct = path.join(targetDir, `${baseName}${ext}`);
  if (isValidDownloadVideoFile(direct)) return direct;

  for (let i = 2; i <= 30; i++) {
    const candidate = path.join(targetDir, `${baseName} (${i})${ext}`);
    if (!fs.existsSync(candidate)) break;
    if (isValidDownloadVideoFile(candidate)) return candidate;
  }
  return null;
}

ipcMain.handle('downloads:getSettings', () => ({
  directory: getDownloadDirectory(),
  defaultDirectory: getDefaultDownloadDirectory(),
}));

ipcMain.handle('downloads:pickDirectory', async () => {
  const result = await dialog.showOpenDialog(mainWindow ?? undefined, {
    title: 'Папка для загрузок',
    defaultPath: getDownloadDirectory(),
    properties: ['openDirectory', 'createDirectory'],
  });
  if (result.canceled || !result.filePaths?.[0]) return { ok: false };
  setDownloadDirectory(result.filePaths[0]);
  return { ok: true, directory: result.filePaths[0] };
});

ipcMain.handle('downloads:openDirectory', async (_, dir) => {
  const target = typeof dir === 'string' && dir.trim() ? dir : getDownloadDirectory();
  await shell.openPath(target);
});

ipcMain.handle('downloads:showFile', (_, filePath) => {
  if (typeof filePath === 'string' && filePath.trim()) {
    shell.showItemInFolder(filePath);
  }
});

ipcMain.handle('downloads:openFile', (_, filePath) => {
  if (typeof filePath === 'string' && filePath.trim()) {
    shell.openPath(filePath);
  }
});

ipcMain.handle('downloads:listLibrary', () => scanDownloadLibrary(getDownloadDirectory()));

ipcMain.handle('downloads:checkFiles', (_, payload) => {
  const items = Array.isArray(payload?.items) ? payload.items : [];
  getDownloadDirectory();
  return items.map((item) => {
    const folder = typeof item?.folder === 'string' ? item.folder : '';
    const filename = typeof item?.filename === 'string' ? item.filename : '';
    const filePath = findExistingDownloadFile(folder, filename);
    return { folder, filename, exists: !!filePath, path: filePath };
  });
});

/** Background download queue — starts downloads without blocking the renderer */
ipcMain.handle('episode-download:queue', async (_, payload) => {
  const items = Array.isArray(payload?.items) ? payload.items : [];
  if (items.length === 0) return { ok: false, error: 'empty', items: [] };

  const sendProgress = (data) => {
    try { mainWindow?.webContents?.send('episode-download:progress', data); } catch (_) {}
  };

  const queued = [];
  for (const item of items) {
    const url = typeof item?.url === 'string' ? item.url : '';
    if (!/^https?:\/\//i.test(url)) continue;
    if (/\/(seria|video|movie|anime)\/\d+\/[0-9a-f]+\//i.test(url)
      && /kodikplayer\.com|kodik\.info|aniqit\.com|anixis\.com|aniqart\.com/i.test(url)) {
      sendProgress({
        id: `dl-${Date.now()}-skip`,
        filename: item?.filename || 'episode.mp4',
        status: 'error',
        received: 0,
        total: 0,
        error: 'embed-url-not-video',
      });
      continue;
    }

    const id = `dl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const baseDir = getDownloadDirectory();
    const subFolder = typeof item?.folder === 'string' ? sanitizeDownloadDirName(item.folder) : '';
    const targetDir = subFolder ? path.join(baseDir, subFolder) : baseDir;
    try { fs.mkdirSync(targetDir, { recursive: true }); } catch {}
    const filePath = uniqueDownloadPath(targetDir, item?.filename || path.basename(url.split('?')[0]) || 'episode.mp4');
    const filename = path.basename(filePath);

    queued.push({ id, filename });
    sendProgress({ id, filename, status: 'queued', received: 0, total: 0 });

    const dlHeaders = item?.headers && typeof item.headers === 'object' ? item.headers : {};
    const isHls = /\.m3u8(\?|$)/i.test(url) || url.includes(':hls:manifest') || url.includes(':hls:hls');

    setImmediate(async () => {
      sendProgress({ id, filename, status: 'downloading', received: 0, total: 0 });
      try {
        if (isHls) {
          await downloadHlsToFile(url, filePath, dlHeaders, (received, total) => {
            sendProgress({ id, filename, status: 'downloading', received, total });
          });
        } else {
          await sessionFetchStreamToFile(url, filePath, dlHeaders, (received, total) => {
            sendProgress({ id, filename, status: 'downloading', received, total });
          });
        }
        let fileSize = 0;
        try { fileSize = fs.statSync(filePath).size; } catch {}
        sendProgress({
          id, filename, status: 'done', received: fileSize || 1, total: fileSize || 1, filePath, fileSize,
        });
      } catch (err) {
        sendProgress({
          id, filename, status: 'error', received: 0, total: 0,
          error: err?.message ?? String(err),
        });
        try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch (_) {}
      }
    });
  }

  return { ok: queued.length > 0, items: queued };
});

function sanitizeDownloadName(name) {
  return String(name || 'episode')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160) || 'episode';
}

function uniqueDownloadPath(dir, fileName) {
  const parsed = path.parse(sanitizeDownloadName(fileName));
  const ext = parsed.ext || '.mp4';
  const base = parsed.name || 'episode';
  let candidate = path.join(dir, `${base}${ext}`);
  let idx = 2;
  while (fs.existsSync(candidate)) {
    candidate = path.join(dir, `${base} (${idx})${ext}`);
    idx++;
  }
  return candidate;
}

ipcMain.handle('episode-download:download', async (_, payload) => {
  const items = Array.isArray(payload?.items) ? payload.items : [];
  if (items.length === 0) return { ok: false, cancelled: false, downloaded: 0, error: 'empty' };

  const result = await dialog.showOpenDialog(mainWindow ?? undefined, {
    title: 'Выберите папку для сохранения серий',
    defaultPath: app.getPath('downloads'),
    properties: ['openDirectory', 'createDirectory'],
  });
  if (result.canceled || !result.filePaths?.[0]) {
    return { ok: false, cancelled: true, downloaded: 0 };
  }

  const targetDir = result.filePaths[0];
  let downloaded = 0;
  let firstDownloadedPath = '';
  const errors = [];

  for (const item of items) {
    const url = typeof item?.url === 'string' ? item.url : '';
    if (!/^https?:\/\//i.test(url)) {
      errors.push({ filename: item?.filename, error: 'invalid-url' });
      continue;
    }

    const filePath = uniqueDownloadPath(targetDir, item?.filename || path.basename(url.split('?')[0]) || 'episode.mp4');
    const dlHeaders = item?.headers && typeof item.headers === 'object' ? item.headers : {};
    try {
      if (/\.m3u8(\?|$)/i.test(url)) {
        await downloadHlsToFile(url, filePath, dlHeaders);
      } else {
        await sessionFetchStreamToFile(url, filePath, dlHeaders);
      }
      if (!firstDownloadedPath) firstDownloadedPath = filePath;
      downloaded++;
    } catch (err) {
      errors.push({
        filename: path.basename(filePath),
        error: err && err.message ? String(err.message) : String(err),
      });
      try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch (_) {}
    }
  }

  if (downloaded > 0) {
    try { shell.showItemInFolder(firstDownloadedPath); } catch (_) {}
  }

  return {
    ok: downloaded > 0 && errors.length === 0,
    cancelled: false,
    downloaded,
    errors,
  };
});

/** Создаёт отдельное окно только с плеером (загружает player.html), а не основное приложение */
function createPlayerWindow(params) {
  const iconPath = getIconPath();
  const playerWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 640,
    minHeight: 400,
    frame: false,
    titleBarStyle: 'hidden',
    title: 'AnixApp — Просмотр',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    ...(iconPath && { icon: iconPath }),
  });
  playerWindowRef = playerWindow;
  currentPlayerPlayback = {
    releaseId: String(params.releaseId ?? ''),
    sourceId: String(params.sourceId ?? ''),
    ep: String(params.ep ?? ''),
    dubberId: String(params.dubberId ?? ''),
  };
  playerWindow.on('closed', () => {
    playerWindowRef = null;
    currentPlayerPlayback = null;
    // Revert Discord presence when player is closed
    if (discordRpc && getDiscordRpcEnabled()) {
      discordRpc.focusWindow('main');
      if (getDiscordRpcShowBrowsing()) {
        discordRpc.setBrowsing(_discordSessionStart);
      } else {
        setDiscordGenericInApp();
      }
    }
    // Notify main window so it can show the lobby "now watching" widget
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('player:closed');
    }
  });
  playerWindow.once('ready-to-show', () => {
    applyUiZoom(getUiZoom());
    playerWindow.show();
  });
  // Focus tracking: when user brings the player window to front, switch Discord to watching activity
  playerWindow.on('focus', () => { if (discordRpc) discordRpc.focusWindow('player'); });
  playerWindow.on('enter-full-screen', () => playerWindow.webContents.send('player:fullscreen', true));
  playerWindow.on('leave-full-screen', () => playerWindow.webContents.send('player:fullscreen', false));

  const queryParams = {
    releaseId: params.releaseId ?? '',
    sourceId: params.sourceId ?? '',
    ep: params.ep ?? '',
    title: params.title ?? '',
    sourceName: params.sourceName ?? '',
    ...(params.dubberId != null && params.dubberId !== '' ? { dubberId: params.dubberId } : {}),
  };
  if (isDev) {
    const q = new URLSearchParams(queryParams).toString();
    playerWindow.loadURL('http://localhost:5173/player.html?' + q);
  } else {
    const playerPath = path.join(__dirname, '../dist/player.html');
    playerWindow.loadFile(playerPath, { query: queryParams });
  }
  if (params.paused != null || params.currentTime != null) {
    playerWindow.webContents.once('did-finish-load', () => {
      if (playerWindowRef === playerWindow && !playerWindow.isDestroyed()) {
        playerWindow.webContents.send('player:applySync', params);
      }
    });
  }
}

function isSamePlaybackContent(a, b) {
  if (!a || !b) return false;
  return a.releaseId === b.releaseId && a.sourceId === b.sourceId && a.ep === b.ep && (a.dubberId || '') === (b.dubberId || '');
}

function waitPlayerClosed() {
  return new Promise((resolve) => {
    if (!playerWindowRef || playerWindowRef.isDestroyed()) {
      resolve();
      return;
    }
    playerWindowRef.once('closed', resolve);
    playerWindowRef.close();
  });
}

ipcMain.handle('player:openWindow', async (_, params) => {
  if (!params || typeof params !== 'object') return;
  const safe = {
    releaseId: String(params.releaseId ?? ''),
    sourceId: String(params.sourceId ?? ''),
    ep: String(params.ep ?? ''),
    title: String(params.title ?? ''),
    sourceName: String(params.sourceName ?? ''),
    ...(params.dubberId != null && params.dubberId !== '' ? { dubberId: String(params.dubberId) } : {}),
  };
  // If player window already exists — change content dynamically without closing/reopening
  if (playerWindowRef && !playerWindowRef.isDestroyed()) {
    currentPlayerPlayback = {
      releaseId: safe.releaseId,
      sourceId: safe.sourceId,
      ep: safe.ep,
      dubberId: safe.dubberId || '',
    };
    // local: true → player knows to send changeEpisode command to lobby
    playerWindowRef.webContents.send('player:changeContent', { ...safe, local: true });
    playerWindowRef.focus();
    return;
  }
  createPlayerWindow(safe);
});

ipcMain.on('player:syncState', async (_, playback) => {
  if (!playback || typeof playback !== 'object') return;
  const params = {
    releaseId: String(playback.releaseId ?? ''),
    sourceId: String(playback.sourceId ?? ''),
    ep: String(playback.ep ?? ''),
    title: String(playback.title ?? ''),
    sourceName: String(playback.sourceName ?? ''),
    ...(playback.dubberId != null && playback.dubberId !== '' ? { dubberId: String(playback.dubberId) } : {}),
    paused: !!playback.paused,
    currentTime: typeof playback.currentTime === 'number' ? playback.currentTime : 0,
  };
  const incomingContent = { releaseId: params.releaseId, sourceId: params.sourceId, ep: params.ep, dubberId: params.dubberId || '' };
  if (playerWindowRef && !playerWindowRef.isDestroyed()) {
    const sameContent = isSamePlaybackContent(currentPlayerPlayback, incomingContent);
    if (sameContent) {
      // Same content — just seek/pause sync
      playerWindowRef.webContents.send('player:applySync', params);
    } else {
      // Different content — change dynamically without closing/reopening
      currentPlayerPlayback = incomingContent;
      playerWindowRef.webContents.send('player:changeContent', params);
    }
    return;
  }
  // No player window — create one
  createPlayerWindow(params);
});

// ── Upscale settings sync: Main window → Player window ──
ipcMain.on('upscale:applySettings', (_, settings) => {
  if (playerWindowRef && !playerWindowRef.isDestroyed()) {
    playerWindowRef.webContents.send('upscale:settingsChanged', settings);
  }
});

// ── Lobby proposal IPC forwarding ──
// Main window → Player window (proposal events)
ipcMain.on('lobby:proposalToPlayer', (_, data) => {
  if (playerWindowRef && !playerWindowRef.isDestroyed()) {
    playerWindowRef.webContents.send('lobby:proposal', data);
  }
});

// Main window → Player window (activity feed & participant list)
ipcMain.on('lobby:activityToPlayer', (_, data) => {
  if (playerWindowRef && !playerWindowRef.isDestroyed()) {
    playerWindowRef.webContents.send('lobby:activityFeed', data);
  }
});

ipcMain.on('lobby:participantsToPlayer', (_, participants) => {
  if (playerWindowRef && !playerWindowRef.isDestroyed()) {
    playerWindowRef.webContents.send('lobby:participantsList', participants);
  }
});

ipcMain.on('lobby:bufferingStartFromPlayer', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('lobby:bufferingStartFromPlayer');
  }
});

ipcMain.on('lobby:playerSyncedFromPlayer', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('lobby:playerSyncedFromPlayer');
  }
});

ipcMain.on('lobby:waitingOverlayToPlayer', (_, payload) => {
  if (playerWindowRef && !playerWindowRef.isDestroyed()) {
    playerWindowRef.webContents.send('lobby:playerWaitingOverlay', payload);
  }
});

// Player window → Main window (vote)
ipcMain.on('lobby:voteFromPlayer', (_, proposalId, accept) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('lobby:voteFromPlayer', { proposalId, accept });
  }
});

ipcMain.on('player:stateChanged', (event, payload) => {
  let playback = payload;
  if (payload && typeof payload === 'object' && payload.playback) {
    playback = payload.playback;
  }
  if (playback && typeof playback === 'object') {
    currentPlayerPlayback = {
      releaseId: String(playback.releaseId ?? ''),
      sourceId: String(playback.sourceId ?? ''),
      ep: String(playback.ep ?? ''),
      dubberId: String(playback.dubberId ?? ''),
    };
    // Update Discord presence with current watching state
    if (discordRpc && getDiscordRpcEnabled() && getDiscordRpcShowWatching()) {
      applyDiscordRpcOptionsFromSettings();
      discordRpc.setWatching({
        title: String(playback.title ?? ''),
        ep: String(playback.ep ?? ''),
        sourceName: String(playback.sourceName ?? ''),
        dubberName: playback.dubberName ? String(playback.dubberName) : undefined,
        paused: !!playback.paused,
        currentTime: Number(playback.currentTime ?? 0),
        duration: playback.duration != null ? Number(playback.duration) : undefined,
        posterUrl: playback.posterUrl ? String(playback.posterUrl) : undefined,
      });
    }
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('lobby:playerStateChanged', payload);
  }
});

// Renderer sends lobby state to update Discord party presence
ipcMain.on('discord:update', (_, data) => {
  if (!data || typeof data !== 'object' || !discordRpc || !getDiscordRpcEnabled()) return;

  applyDiscordRpcOptionsFromSettings();
  const showImages = data.showImages !== false && getDiscordRpcShowImages();

  if (data.type === 'watching') {
    if (!getDiscordRpcShowWatching()) return;
    discordRpc.setWatching({
      title: String(data.title ?? ''),
      ep: String(data.ep ?? ''),
      sourceName: String(data.sourceName ?? ''),
      dubberName: data.dubberName ? String(data.dubberName) : undefined,
      paused: !!data.paused,
      currentTime: Number(data.currentTime ?? 0),
      duration: data.duration != null ? Number(data.duration) : undefined,
      posterUrl: showImages && data.posterUrl ? String(data.posterUrl) : undefined,
    });
  } else if (data.type === 'partyInfo') {
    if (!getDiscordRpcShowParty()) {
      discordRpc.setPartyInfo(null);
      return;
    }
    if (data.partyId) {
      discordRpc.setPartyInfo({
        partyId: String(data.partyId),
        partySize: Number(data.partySize ?? 1),
        partyMax: Number(data.partyMax ?? 10),
        joinSecret: data.joinSecret ? String(data.joinSecret) : undefined,
      });
    } else {
      discordRpc.setPartyInfo(null);
    }
  } else if (data.type === 'posterUrl') {
    if (showImages && data.posterUrl) {
      discordRpc.setPosterUrl(String(data.posterUrl));
    }
  } else if (
    data.type === 'page'
    || data.type === 'release'
    || data.type === 'profile'
    || data.type === 'collection'
    || data.type === 'browsing'
  ) {
    if (!getDiscordRpcShowBrowsing()) {
      setDiscordGenericInApp();
      return;
    }
    if (data.type === 'page') {
      discordRpc.setPage({
        details: String(data.details ?? ''),
        state: String(data.state ?? ''),
      });
    } else if (data.type === 'release') {
      discordRpc.setViewingRelease({
        title: String(data.title ?? ''),
        posterUrl: showImages && data.posterUrl ? String(data.posterUrl) : null,
        state: data.state ? String(data.state) : undefined,
      });
    } else if (data.type === 'profile') {
      discordRpc.setViewingProfile({
        username: data.username ? String(data.username) : '',
        avatarUrl: showImages && data.avatarUrl ? String(data.avatarUrl) : null,
        isSelf: !!data.isSelf,
        state: data.state ? String(data.state) : undefined,
      });
    } else if (data.type === 'collection') {
      discordRpc.setViewingCollection({
        title: String(data.title ?? ''),
        imageUrl: showImages && data.imageUrl ? String(data.imageUrl) : null,
        state: data.state ? String(data.state) : undefined,
      });
    } else if (data.type === 'browsing') {
      setDiscordGenericInApp();
    }
  }
});

ipcMain.on('player:close', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win && !win.isDestroyed()) win.close();
});

ipcMain.handle('player:toggleFullScreen', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win || win.isDestroyed()) return false;
  const next = !win.isFullScreen();
  win.setFullScreen(next);
  event.sender.send('player:fullscreen', next);
  return next;
});

ipcMain.handle('player:toggleAlwaysOnTop', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win || win.isDestroyed()) return false;
  const next = !win.isAlwaysOnTop();
  win.setAlwaysOnTop(next, 'floating');
  return next;
});

ipcMain.handle('player:isOpen', () => {
  return !!(playerWindowRef && !playerWindowRef.isDestroyed());
});

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

// Простая система скачивания обновления с GitHub Releases.
// Определяем платформу и скачиваем соответствующий пакет.
let pendingInstallerPath = null;
let updateDownloadState = { state: 'idle', received: 0, total: 0 };

/**
 * Определяет способ установки AnixApp на текущей Linux-системе.
 * Приоритет: flatpak → appimage → pacman (Arch/AUR) → deb (Debian/Ubuntu) → appimage (fallback)
 */
function getLinuxInstallType() {
  if (process.platform !== 'linux') return null;
  // Запущено внутри Flatpak-контейнера
  if (process.env.FLATPAK_ID) return 'flatpak';
  // Запущено как AppImage (AppImage runtime задаёт эту переменную)
  if (process.env.APPIMAGE) return 'appimage';
  // Arch Linux / AUR
  try { require('child_process').execSync('which pacman', { stdio: 'ignore' }); return 'pacman'; } catch {}
  // Debian / Ubuntu / apt
  try { require('child_process').execSync('which dpkg',   { stdio: 'ignore' }); return 'deb';    } catch {}
  // Fallback — предлагаем AppImage как универсальный вариант
  return 'appimage';
}

/** Возвращает regex-паттерн для поиска подходящего ассета в GitHub Releases. */
function getUpdateAssetPattern() {
  if (process.platform === 'linux') {
    const t = getLinuxInstallType();
    if (t === 'pacman')  return /\.(pacman|pkg\.tar\.zst)(\?|$)/i;
    if (t === 'deb')     return /\.deb(\?|$)/i;
    if (t === 'flatpak') return /\.flatpak(\?|$)/i;
    return /\.AppImage(\?|$)/i; // appimage + fallback
  }
  return /\.exe(\?|$)/i;
}

/** Человекочитаемое расширение для логов. */
function getUpdateAssetLabel() {
  if (process.platform === 'linux') {
    const t = getLinuxInstallType();
    if (t === 'pacman')  return '.pacman/.pkg.tar.zst';
    if (t === 'deb')     return '.deb';
    if (t === 'flatpak') return '.flatpak';
    return '.AppImage';
  }
  return '.exe';
}

function sendUpdateProgress(extra) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const payload = {
    state: updateDownloadState.state,
    received: updateDownloadState.received,
    total: updateDownloadState.total,
    percent: updateDownloadState.total > 0 ? Math.round((updateDownloadState.received / updateDownloadState.total) * 100) : 0,
    filePath: pendingInstallerPath,
    installType: process.platform === 'linux' ? getLinuxInstallType() : null,
    ...(extra || {}),
  };
  mainWindow.webContents.send('app:update-progress', payload);
}

async function fetchLatestGitHubRelease() {
  const https = require('https');
  const url = 'https://api.github.com/repos/Maks1mio/anixapp/releases/latest';
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        headers: {
          'User-Agent': 'AnixApp-Updater',
          Accept: 'application/vnd.github.v3+json',
        },
        timeout: 15000,
      },
      (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`GitHub status ${res.statusCode}`));
          res.resume();
          return;
        }
        let raw = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          raw += chunk;
        });
        res.on('end', () => {
          try {
            resolve(JSON.parse(raw));
          } catch (e) {
            reject(e);
          }
        });
      },
    );
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('GitHub request timeout'));
    });
    req.on('error', reject);
  });
}

function isNewerAppVersion(latest, current) {
  const parse = (v) => String(v).replace(/^v/i, '').split('.').map((n) => parseInt(n, 10) || 0);
  const a = parse(latest);
  const b = parse(current);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x > y) return true;
    if (x < y) return false;
  }
  return false;
}

ipcMain.handle('app:checkForUpdate', async (_, currentVersion) => {
  try {
    const data = await fetchLatestGitHubRelease();
    const latest = String(data.tag_name ?? data.name ?? '').replace(/^v/i, '').trim();
    const current = String(currentVersion ?? '').trim();
    if (!latest || !current || !isNewerAppVersion(latest, current)) return null;
    return {
      version: latest,
      url: data.html_url ?? 'https://github.com/Maks1mio/anixapp/releases',
      body: typeof data.body === 'string' ? data.body : null,
    };
  } catch (err) {
    logger.warn('update', `checkForUpdate: ${err?.message ?? err}`);
    return null;
  }
});

async function fetchLatestInstallerUrl() {
  const data = await fetchLatestGitHubRelease();
  const assets = Array.isArray(data.assets) ? data.assets : [];
  const pattern = getUpdateAssetPattern();
  const asset = assets.find((a) => typeof a.browser_download_url === 'string' && pattern.test(a.browser_download_url));
  if (!asset) {
    throw new Error(`No ${getUpdateAssetLabel()} asset in latest release`);
  }
  return asset.browser_download_url;
}

async function downloadInstaller() {
  const path = require('path');
  const fs = require('fs');
  const https = require('https');

  let file = null;
  let destPath = null;

  try {
    updateDownloadState = { state: 'downloading', received: 0, total: 0 };
    sendUpdateProgress();

    const downloadUrl = await fetchLatestInstallerUrl();
    const updatesDir = path.join(app.getPath('userData'), 'updates');
    if (!fs.existsSync(updatesDir)) fs.mkdirSync(updatesDir, { recursive: true });

    const fileName = path.basename(downloadUrl.split('?')[0] || 'AnixApp-Setup.exe');
    destPath = path.join(updatesDir, fileName);

    // Remove stale partial downloads
    if (fs.existsSync(destPath)) {
      try { fs.unlinkSync(destPath); } catch (_) {}
    }

    file = fs.createWriteStream(destPath);

    await new Promise((resolve, reject) => {
      // Surface WriteStream errors — unhandled 'error' on a stream crashes the process
      file.on('error', (err) => {
        reject(new Error(`File write error: ${err.message}`));
      });

      const maxRedirects = 5;
      function doRequest(url, redirectsLeft) {
        const req = https.get(
          url,
          { headers: { 'User-Agent': 'AnixApp-Updater' } },
          (res) => {
            // GitHub assets redirect 302 → CDN — follow redirects
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
              res.resume();
              if (redirectsLeft <= 0) {
                reject(new Error('Too many redirects while downloading update'));
                return;
              }
              doRequest(res.headers.location, redirectsLeft - 1);
              return;
            }
            if (res.statusCode !== 200) {
              res.resume();
              reject(new Error(`Download status ${res.statusCode}`));
              return;
            }

            const total = parseInt(res.headers['content-length'] || '0', 10) || 0;
            updateDownloadState.total = total;

            // Propagate response stream errors
            res.on('error', (err) => reject(new Error(`Response stream error: ${err.message}`)));

            res.on('data', (chunk) => {
              // file.write() can return false (backpressure) but never throws synchronously;
              // errors are emitted on the 'error' event above.
              file.write(chunk);
              updateDownloadState.received += chunk.length;
              sendUpdateProgress();
            });

            res.on('end', () => {
              file.end(() => resolve());
            });
          },
        );
        req.on('error', (err) => reject(new Error(`Request error: ${err.message}`)));
      }

      doRequest(downloadUrl, maxRedirects);
    });

    pendingInstallerPath = destPath;
    updateDownloadState.state = 'ready';
    sendUpdateProgress();
  } catch (e) {
    console.error('Updater download error', e);
    updateDownloadState = { state: 'error', received: 0, total: 0 };
    sendUpdateProgress({ errorMessage: String(e) });

    // Clean up partial file
    if (file) { try { file.destroy(); } catch (_) {} }
    if (destPath) { try { if (fs.existsSync(destPath)) fs.unlinkSync(destPath); } catch (_) {} }
  }
}

ipcMain.handle('app:startUpdateDownload', async () => {
  if (updateDownloadState.state === 'downloading') return;
  // downloadInstaller is a floating promise — catch here so unhandled rejection never crashes main.
  downloadInstaller().catch((e) => {
    console.error('Updater unexpected error', e);
    updateDownloadState = { state: 'error', received: 0, total: 0 };
    sendUpdateProgress({ errorMessage: String(e) });
  });
});

/** Возвращает тип установки для рендерера (используется для подписей кнопок). */
ipcMain.handle('app:getLinuxInstallType', () => getLinuxInstallType());

ipcMain.handle('app:installUpdate', async () => {
  const { spawn } = require('child_process');
  if (!pendingInstallerPath || !fs.existsSync(pendingInstallerPath)) return;

  try {
    // ── Windows ──────────────────────────────────────────────────────────
    if (process.platform === 'win32') {
      const child = spawn(pendingInstallerPath, [], { detached: true, stdio: 'ignore', shell: false });
      child.unref();
      isQuitting = true;
      app.quit();
      return;
    }

    // ── Linux ─────────────────────────────────────────────────────────────
    if (process.platform === 'linux') {
      const installType = getLinuxInstallType();

      // ── AppImage: заменяем файл на месте и перезапускаем ──────────────
      if (installType === 'appimage') {
        const currentPath = process.env.APPIMAGE;
        if (!currentPath) {
          sendUpdateProgress({ state: 'error', errorMessage: 'Переменная APPIMAGE не найдена — невозможно обновить' });
          return;
        }
        // chmod +x нового файла, заменяем старый, перезапускаем
        fs.chmodSync(pendingInstallerPath, 0o755);
        fs.copyFileSync(pendingInstallerPath, currentPath);
        const child = spawn(currentPath, [], { detached: true, stdio: 'ignore' });
        child.unref();
        isQuitting = true;
        app.quit();
        return;
      }

      // ── Arch / AUR: pkexec pacman -U (polkit диалог авторизации) ──────
      if (installType === 'pacman') {
        // Не detach — ждём пока пользователь введёт пароль и pkexec завершится.
        // Только после успешного выхода (code === 0) закрываем приложение.
        sendUpdateProgress({ state: 'installing' });
        const child = spawn('pkexec', ['pacman', '-U', '--noconfirm', pendingInstallerPath], {
          detached: false,
          stdio: 'ignore',
        });
        child.on('exit', (code) => {
          if (code === 0) {
            isQuitting = true;
            app.quit();
          } else {
            // Пользователь отменил или ошибка установки — остаёмся в приложении
            sendUpdateProgress({ state: 'install-error', errorMessage: `pkexec завершился с кодом ${code}` });
          }
        });
        child.on('error', (err) => {
          sendUpdateProgress({ state: 'install-error', errorMessage: String(err) });
        });
        return;
      }

      // ── Debian / Ubuntu: pkexec dpkg -i, fallback → xdg-open ─────────
      if (installType === 'deb') {
        let usedPkexec = false;
        try {
          require('child_process').execSync('which pkexec', { stdio: 'ignore' });
          sendUpdateProgress({ state: 'installing' });
          const child = spawn('pkexec', ['dpkg', '-i', pendingInstallerPath], {
            detached: false,
            stdio: 'ignore',
          });
          child.on('exit', (code) => {
            if (code === 0) {
              isQuitting = true;
              app.quit();
            } else {
              sendUpdateProgress({ state: 'install-error', errorMessage: `pkexec завершился с кодом ${code}` });
            }
          });
          child.on('error', (err) => {
            sendUpdateProgress({ state: 'install-error', errorMessage: String(err) });
          });
          usedPkexec = true;
        } catch {}
        if (!usedPkexec) {
          // pkexec недоступен — открываем через software center / gdebi
          const { shell: electronShell } = require('electron');
          const err = await electronShell.openPath(pendingInstallerPath);
          if (err) {
            sendUpdateProgress({ state: 'error', errorMessage: `Не удалось открыть установщик: ${err}` });
            return;
          }
          // software center сам управляет установкой — просто закрываемся
          isQuitting = true;
          app.quit();
        }
        return;
      }

      // ── Flatpak: flatpak update через хост ────────────────────────────
      if (installType === 'flatpak') {
        const inSandbox = !!process.env.FLATPAK_ID;
        const flatpakId = process.env.FLATPAK_ID || 'com.anixapp.client';
        // Внутри sandbox нужен flatpak-spawn --host чтобы выйти за пределы контейнера
        const cmd  = inSandbox ? 'flatpak-spawn' : 'flatpak';
        const args = inSandbox
          ? ['--host', 'flatpak', 'update', '--assumeyes', flatpakId]
          : ['update', '--assumeyes', flatpakId];
        sendUpdateProgress({ state: 'installing' });
        const child = spawn(cmd, args, { detached: false, stdio: 'ignore' });
        child.on('exit', (code) => {
          if (code === 0) {
            isQuitting = true;
            app.quit();
          } else {
            sendUpdateProgress({ state: 'install-error', errorMessage: `flatpak update завершился с кодом ${code}` });
          }
        });
        child.on('error', (err) => {
          sendUpdateProgress({ state: 'install-error', errorMessage: String(err) });
        });
        return;
      }
    }
  } catch (e) {
    console.error('Failed to start installer', e);
    sendUpdateProgress({ state: 'error', errorMessage: String(e) });
  }
});

ipcMain.handle('anix:randomRelease', async (_, extended = true) => {
  try {
    const client = getAnixart();
    const data = await client.endpoints.release.getRandomRelease(extended);
    return data;
  } catch (err) {
    handleAnixError(err, 'randomRelease');
  }
});

ipcMain.handle('anix:latestFeed', async (_, page = 1) => {
  try {
    const client = getAnixart();
    const data = await client.endpoints.feed.latest(page);
    return data;
  } catch (err) {
    handleAnixError(err, 'latestFeed');
  }
});

ipcMain.handle('anix:discoverRecommendations', async (_, page = -1, previousPage = -1) => {
  try {
    const client = getAnixart();
    const data = await client.endpoints.discover.recommendations(page, { previous_page: previousPage });
    return data;
  } catch (err) {
    logger.error('api', `discoverRecommendations: ${err?.message ?? err}`);
    return { content: [] };
  }
});

ipcMain.handle('anix:discoverInteresting', async () => {
  try {
    const client = getAnixart();
    return await client.endpoints.discover.interesting();
  } catch (err) {
    logger.error('api', `discoverInteresting: ${err?.message ?? err}`);
    return { content: [] };
  }
});

ipcMain.handle('anix:discoverWatching', async (_, page = 0) => {
  try {
    const client = getAnixart();
    return await client.endpoints.discover.watching(page);
  } catch (err) {
    logger.error('api', `discoverWatching: ${err?.message ?? err}`);
    return { content: [] };
  }
});

ipcMain.handle('anix:discoverDiscussing', async () => {
  try {
    const client = getAnixart();
    return await client.endpoints.discover.discussing();
  } catch (err) {
    logger.error('api', `discoverDiscussing: ${err?.message ?? err}`);
    return { content: [] };
  }
});

ipcMain.handle('anix:discoverCommentsWeek', async () => {
  try {
    const client = getAnixart();
    return await client.endpoints.discover.commentsWeek();
  } catch (err) {
    logger.error('api', `discoverCommentsWeek: ${err?.message ?? err}`);
    return { content: [] };
  }
});

ipcMain.handle('anix:discoverCollectionsWeek', async (_, page = -1, previousPage = -1) => {
  try {
    const client = getAnixart();
    return await client.endpoints.collection.collections(page, { where: 2, sort: 4, previous_page: previousPage });
  } catch (err) {
    logger.error('api', `discoverCollectionsWeek: ${err?.message ?? err}`);
    return { content: [] };
  }
});

loggedHandle('anix:filterReleases', async (_, page = 0, filterArgs = {}, extended = true) => {
  try {
    const client = getAnixart();
    const data = await client.endpoints.release.filter(page, filterArgs, extended);
    return data;
  } catch (err) {
    handleAnixError(err, 'filterReleases');
  }
});

loggedHandle('anix:homeCustomTabGet', async () => {
  const cfg = loadConfig();
  const profileId = cfg.profileId;
  if (!profileId) return { tabName: '', filter: null, activeTab: null };
  const entry = homeCustomFilter.getEntry(app.getPath('userData'), profileId);
  return entry ?? { tabName: '', filter: null, activeTab: null };
});

loggedHandle('anix:homeCustomTabSet', async (_, data) => {
  const cfg = loadConfig();
  const profileId = cfg.profileId;
  if (!profileId) throw new Error('Not logged in');
  homeCustomFilter.setEntry(app.getPath('userData'), profileId, {
    tabName: typeof data?.tabName === 'string' ? data.tabName : '',
    filter: data?.filter ?? null,
    activeTab: typeof data?.activeTab === 'string' ? data.activeTab : null,
  });
  return { ok: true };
});

ipcMain.handle('anix:articleById', async (_, id) => {
  try {
    const client = getAnixart();
    const data = await client.endpoints.channel.getArticle(id);
    return data;
  } catch (err) {
    handleAnixError(err, 'articleById');
  }
});

ipcMain.handle('anix:channelById', async (_, id) => {
  try {
    const client = getAnixart();
    const data = await client.endpoints.channel.info(id);
    return data;
  } catch (err) {
    handleAnixError(err, 'channelById');
  }
});

ipcMain.handle('anix:channelBlog', async (_, id) => {
  try {
    const client = getAnixart();
    const data = await client.endpoints.channel.getBlog(id);
    return data;
  } catch (err) {
    handleAnixError(err, 'channelBlog');
  }
});

ipcMain.handle('anix:profileById', async (_, id) => {
  try {
    const client = getAnixart();
    const data = await client.endpoints.profile.info(id);
    return data;
  } catch (err) {
    handleAnixError(err, 'profileById');
  }
});

ipcMain.handle('anix:collectionById', async (_, id) => {
  try {
    const client = getAnixart();
    const data = await client.endpoints.collection.info(id);
    return data;
  } catch (err) {
    handleAnixError(err, 'collectionById');
  }
});

ipcMain.handle('anix:collectionReleases', async (_, id, page = 0) => {
  try {
    const client = getAnixart();
    const data = await client.endpoints.collection.getCollectionReleases(id, page);
    return data;
  } catch (err) {
    handleAnixError(err, 'collectionReleases');
  }
});

ipcMain.handle('anix:collectionRandomRelease', async (_, id) => {
  try {
    const client = getAnixart();
    const data = await client.endpoints.collection.getRandomRelease(id, true);
    return data;
  } catch (err) {
    handleAnixError(err, 'collectionRandomRelease');
  }
});

ipcMain.handle('anix:addCollectionFavorite', async (_, id) => {
  try {
    const client = getAnixart();
    return await client.endpoints.collection.addCollectionFavorite(id);
  } catch (err) {
    handleAnixError(err, 'addCollectionFavorite');
  }
});

ipcMain.handle('anix:removeCollectionFavorite', async (_, id) => {
  try {
    const client = getAnixart();
    return await client.endpoints.collection.removeCollectionFavorite(id);
  } catch (err) {
    handleAnixError(err, 'removeCollectionFavorite');
  }
});

loggedHandle('anix:collectionsAll', async (_, page = 0, options = {}) => {
  try {
    const client = getAnixart();
    const sort = typeof options?.sort === 'number' ? options.sort : 2;
    const query = { sort };
    if (typeof options?.where === 'number') query.where = options.where;
    if (typeof options?.previousPage === 'number') query.previous_page = options.previousPage;
    const data = await client.endpoints.collection.collections(page, query);
    return data;
  } catch (err) {
    handleAnixError(err, 'collectionsAll');
  }
});

ipcMain.handle('anix:collectionProfileCollections', async (_, profileId, page = 0) => {
  try {
    const client = getAnixart();
    return await client.endpoints.collection.profileCollections(profileId, page);
  } catch (err) {
    handleAnixError(err, 'collectionProfileCollections');
  }
});

ipcMain.handle('anix:collectionMyCreate', async (_, body) => {
  try {
    const client = getAnixart();
    return await client.endpoints.collectionMy.create(body);
  } catch (err) {
    handleAnixError(err, 'collectionMyCreate');
  }
});

ipcMain.handle('anix:collectionMyEdit', async (_, id, body) => {
  try {
    const client = getAnixart();
    return await client.endpoints.collectionMy.edit(id, body);
  } catch (err) {
    handleAnixError(err, 'collectionMyEdit');
  }
});

ipcMain.handle('anix:collectionMyEditImage', async (_, id, imageBase64, fileName = 'image.jpg') => {
  try {
    const client = getAnixart();
    const base64 = typeof imageBase64 === 'string' ? imageBase64.replace(/^data:[^;]+;base64,/, '') : '';
    const buffer = Buffer.from(base64, 'base64');
    return await client.endpoints.collectionMy.editImage(id, buffer, fileName);
  } catch (err) {
    handleAnixError(err, 'collectionMyEditImage');
  }
});

ipcMain.handle('anix:collectionMyReleaseAdd', async (_, id, releaseId) => {
  try {
    const client = getAnixart();
    return await client.endpoints.collectionMy.releaseAdd(id, { release_id: releaseId });
  } catch (err) {
    handleAnixError(err, 'collectionMyReleaseAdd');
  }
});

ipcMain.handle('anix:collectionMyDelete', async (_, id) => {
  try {
    const client = getAnixart();
    return await client.endpoints.collectionMy.delete(id);
  } catch (err) {
    handleAnixError(err, 'collectionMyDelete');
  }
});

loggedHandle('anix:schedule', async () => {
  try {
    const client = getAnixart();
    return await client.endpoints.schedule.schedule();
  } catch (err) {
    logger.error('api', `schedule: ${err?.message ?? err}`);
    return {};
  }
});

ipcMain.handle('anix:favorites', async (_, page = 0, sort = BookmarkSortType.NewToOldAddTime, filterAnnounce = 0, filter = 0) => {
  try {
    const client = getAnixart();
    const data = await client.endpoints.profile.getFavorites({
      page,
      sort,
      filter_announce: filterAnnounce,
      filter,
    });
    appendLog('favorites', { page, sort, filterAnnounce, filter, response: data });
    return data;
  } catch (err) {
    handleAnixError(err, 'favorites');
  }
});

ipcMain.handle('anix:getBookmarks', async (_, profileId, type, page = 0, sort = BookmarkSortType.NewToOldAddTime, filterAnnounce = 0, filter = 0) => {
  try {
    const client = getAnixart();
    return await client.endpoints.profile.getBookmarks({
      id: profileId,
      type: type ?? BookmarkType.Watching,
      page,
      sort,
      filter_announce: filterAnnounce,
      filter,
    });
  } catch (err) {
    handleAnixError(err, 'getBookmarks');
  }
});

ipcMain.handle('anix:collectionFavorites', async (_, page = 0) => {
  try {
    const client = getAnixart();
    return await client.endpoints.collectionFavorite.favorites(page);
  } catch (err) {
    handleAnixError(err, 'collectionFavorites');
  }
});

ipcMain.handle('anix:randomFavorite', async (_, extended = true) => {
  try {
    const client = getAnixart();
    return await client.endpoints.release.randomFavorite({ extended_mode: extended });
  } catch (err) {
    handleAnixError(err, 'randomFavorite');
  }
});

ipcMain.handle('anix:randomProfileList', async (_, profileId, status, extended = true) => {
  try {
    const client = getAnixart();
    return await client.endpoints.release.randomProfileList(profileId, status, { extended_mode: extended });
  } catch (err) {
    handleAnixError(err, 'randomProfileList');
  }
});

ipcMain.handle('anix:notificationsAll', async (_, page = 0) => {
  try {
    const client = getAnixart();
    const data = await client.endpoints.notification.getNotifications(page);
    appendLog('notifications', { page, response: data });
    return data;
  } catch (err) {
    handleAnixError(err, 'notificationsAll');
  }
});

ipcMain.handle('anix:notificationsCount', async () => {
  try {
    const client = getAnixart();
    const data = await client.endpoints.notification.countNotifications();
    return data;
  } catch (err) {
    handleAnixError(err, 'notificationsCount');
  }
});

ipcMain.handle('anix:history', async (_, page = 0) => {
  try {
    const client = getAnixart();
    const data = await client.endpoints.release.getHistory(page);
    return data;
  } catch (err) {
    handleAnixError(err, 'history');
  }
});

ipcMain.handle('anix:deleteFromHistory', async (_, releaseId) => {
  try {
    const client = getAnixart();
    return await client.endpoints.history.delete(releaseId);
  } catch (err) {
    handleAnixError(err, 'deleteFromHistory');
  }
});

ipcMain.handle('anix:addToHistory', async (_, releaseId, sourceId, episodePosition) => {
  try {
    const client = getAnixart();
    await client.endpoints.release.addToHistory(releaseId, sourceId, episodePosition);
  } catch (err) {
    handleAnixError(err, 'addToHistory');
  }
});

ipcMain.handle('anix:markEpisodeAsWatched', async (_, releaseId, sourceId, episodePosition) => {
  try {
    const client = getAnixart();
    await client.endpoints.release.markEpisodeAsWatched(releaseId, sourceId, episodePosition);
  } catch (err) {
    handleAnixError(err, 'markEpisodeAsWatched');
  }
});

ipcMain.handle('anix:unmarkEpisodeAsWatched', async (_, releaseId, sourceId, episodePosition) => {
  try {
    const client = getAnixart();
    await client.endpoints.release.unmarkEpisodeAsWatched(releaseId, sourceId, episodePosition);
  } catch (err) {
    handleAnixError(err, 'unmarkEpisodeAsWatched');
  }
});

ipcMain.handle('anix:relatedReleases', async (_, relatedId, page = 0) => {
  try {
    const client = getAnixart();
    const data = await client.endpoints.release.getRelatedReleases(relatedId, page);
    appendLog('relatedReleases', { relatedId, page, response: data });
    return data;
  } catch (err) {
    handleAnixError(err, 'relatedReleases');
  }
});

ipcMain.handle('anix:votedReleases', async (_, profileId, page = 0) => {
  try {
    const client = getAnixart();
    const data = await client.endpoints.profile.getVotedReleases(profileId, page);
    return data;
  } catch (err) {
    handleAnixError(err, 'votedReleases');
  }
});

ipcMain.handle('anix:friends', async (_, profileId, page = 0) => {
  try {
    const client = getAnixart();
    const data = await client.endpoints.profile.getFriends({ id: profileId, page });
    return data;
  } catch (err) {
    handleAnixError(err, 'friends');
  }
});

// ——— Настройки профиля ———

ipcMain.handle('anix:getProfileSettings', async () => {
  try {
    const client = getAnixart();
    return await client.endpoints.settings.getCurrentProfileSettings();
  } catch (err) {
    handleAnixError(err, 'getProfileSettings');
  }
});

ipcMain.handle('anix:setStatus', async (_, status) => {
  try {
    const client = getAnixart();
    return await client.endpoints.settings.setStatus(status);
  } catch (err) {
    handleAnixError(err, 'setStatus');
  }
});

ipcMain.handle('anix:getSocial', async () => {
  try {
    const client = getAnixart();
    return await client.endpoints.settings.getSocial();
  } catch (err) {
    handleAnixError(err, 'getSocial');
  }
});

ipcMain.handle('anix:setSocial', async (_, data) => {
  try {
    const client = getAnixart();
    return await client.endpoints.settings.setSocial(data);
  } catch (err) {
    handleAnixError(err, 'setSocial');
  }
});

ipcMain.handle('anix:setPrivacyStats', async (_, state) => {
  try {
    const client = getAnixart();
    return await client.endpoints.settings.setPrivacyStats(state);
  } catch (err) {
    handleAnixError(err, 'setPrivacyStats');
  }
});

ipcMain.handle('anix:setPrivacyCounts', async (_, state) => {
  try {
    const client = getAnixart();
    return await client.endpoints.settings.setPrivacyCounts(state);
  } catch (err) {
    handleAnixError(err, 'setPrivacyCounts');
  }
});

ipcMain.handle('anix:setPrivacySocial', async (_, state) => {
  try {
    const client = getAnixart();
    return await client.endpoints.settings.setPrivacySocial(state);
  } catch (err) {
    handleAnixError(err, 'setPrivacySocial');
  }
});

ipcMain.handle('anix:setPrivacyFriendRequests', async (_, state) => {
  try {
    const client = getAnixart();
    return await client.endpoints.settings.setPrivacyFriendRequests(state);
  } catch (err) {
    handleAnixError(err, 'setPrivacyFriendRequests');
  }
});

ipcMain.handle('anix:getLoginInfo', async () => {
  try {
    const client = getAnixart();
    return await client.endpoints.settings.getLoginInfo();
  } catch (err) {
    handleAnixError(err, 'getLoginInfo');
  }
});

ipcMain.handle('anix:changeLogin', async (_, newLogin) => {
  try {
    const client = getAnixart();
    const res = await client.endpoints.settings.changeLogin(newLogin);
    // Update cached login in config if successful
    if (res && res.code === 0) {
      saveConfig({ profileLogin: newLogin });
    }
    return res;
  } catch (err) {
    handleAnixError(err, 'changeLogin');
  }
});

// ——— Поиск ———

loggedHandle('anix:searchReleases', async (_, query, page = 0, searchBy = 0) => {
  try {
    const client = getAnixart();
    const data = await client.endpoints.search.releases({ query, page, searchBy });
    logger.info('search', 'releases', { query, page, searchBy, total: data?.total });
    return data;
  } catch (err) {
    handleAnixError(err, 'searchReleases');
  }
});

ipcMain.handle('anix:searchProfiles', async (_, query, page = 0) => {
  try {
    const client = getAnixart();
    const data = await client.endpoints.search.profiles({ query, page, searchBy: 0 });
    appendLog('searchProfiles', { query, page, response: data });
    return data;
  } catch (err) {
    handleAnixError(err, 'searchProfiles');
  }
});

ipcMain.handle('anix:searchCollections', async (_, query, page = 0) => {
  try {
    const client = getAnixart();
    const data = await client.endpoints.search.collections({ query, page, searchBy: 0 });
    appendLog('searchCollections', { query, page, response: data });
    return data;
  } catch (err) {
    handleAnixError(err, 'searchCollections');
  }
});

// ——— Избранное и список (профиль) ———

ipcMain.handle('anix:addToFavorites', async (_, releaseId) => {
  const client = getAnixart();
  const res = await client.endpoints.release.addFavorite(releaseId);
  return res?.code === DefaultResult.Ok ? undefined : Promise.reject(new Error(res?.code ?? 'fail'));
});

ipcMain.handle('anix:removeFromFavorites', async (_, releaseId) => {
  const client = getAnixart();
  const res = await client.endpoints.release.removeFavorite(releaseId);
  return res?.code === DefaultResult.Ok ? undefined : Promise.reject(new Error(res?.code ?? 'fail'));
});

ipcMain.handle('anix:setListStatus', async (_, releaseId, statusId) => {
  const type = LIST_STATUS_TO_TYPE[statusId];
  if (type == null) return Promise.reject(new Error('unknown status'));
  const client = getAnixart();
  const res = await client.endpoints.release.addToProfileList(releaseId, type);
  return res?.code === DefaultResult.Ok ? undefined : Promise.reject(new Error(res?.code ?? 'fail'));
});

ipcMain.handle('anix:clearListStatus', async (_, releaseId, statusId) => {
  const type = LIST_STATUS_TO_TYPE[statusId];
  if (type == null) return Promise.reject(new Error('unknown status'));
  const client = getAnixart();
  const res = await client.endpoints.release.removeFromProfileList(releaseId, type);
  return res?.code === DefaultResult.Ok ? undefined : Promise.reject(new Error(res?.code ?? 'fail'));
});

ipcMain.handle('anix:releaseVote', async (_, releaseId, vote) => {
  const client = getAnixart();
  const res = await client.endpoints.release.vote(releaseId, vote);
  if (res?.code !== DefaultResult.Ok) {
    return Promise.reject(new Error(String(res?.code ?? 'vote failed')));
  }
  return res;
});

ipcMain.handle('anix:releaseDeleteVote', async (_, releaseId) => {
  const client = getAnixart();
  const res = await client.endpoints.release.deleteVote(releaseId);
  if (res?.code !== DefaultResult.Ok) {
    return Promise.reject(new Error(String(res?.code ?? 'delete vote failed')));
  }
  return res;
});

ipcMain.handle('anix:releaseComments', async (_, releaseId, page = 0, sort = 1) => {
  try {
    const client = getAnixart();
    return await client.endpoints.releaseComment.comments(releaseId, page, { sort });
  } catch (err) {
    handleAnixError(err, 'releaseComments');
  }
});

ipcMain.handle('anix:releaseCommentReplies', async (_, commentId, page = 0, sort = 2) => {
  try {
    const client = getAnixart();
    return await client.endpoints.releaseComment.replies(commentId, page, { sort });
  } catch (err) {
    handleAnixError(err, 'releaseCommentReplies');
  }
});

ipcMain.handle('anix:releaseCommentVote', async (_, commentId, vote) => {
  try {
    const client = getAnixart();
    const res = await client.endpoints.releaseComment.vote(commentId, vote);
    if (res?.code !== DefaultResult.Ok) {
      return Promise.reject(new Error(String(res?.code ?? 'comment vote failed')));
    }
    return res;
  } catch (err) {
    handleAnixError(err, 'releaseCommentVote');
  }
});

ipcMain.handle('anix:releaseCommentById', async (_, commentId) => {
  try {
    const client = getAnixart();
    return await client.endpoints.releaseComment.comment(commentId);
  } catch (err) {
    handleAnixError(err, 'releaseCommentById');
  }
});

ipcMain.handle('anix:releaseCommentAdd', async (_, releaseId, body) => {
  try {
    const client = getAnixart();
    const payload = {
      message: body.message,
      spoiler: !!(body.spoiler ?? body.isSpoiler),
      parentCommentId: body.parentCommentId ?? null,
      replyToProfileId: body.replyToProfileId ?? null,
    };
    const res = await client.endpoints.releaseComment.add(releaseId, payload);
    if (res?.code != null && res.code !== DefaultResult.Ok) {
      return Promise.reject(new Error(String(res.code ?? 'comment add failed')));
    }
    return res;
  } catch (err) {
    handleAnixError(err, 'releaseCommentAdd');
  }
});

ipcMain.handle('anix:releaseCommentEdit', async (_, commentId, body) => {
  try {
    const client = getAnixart();
    const res = await client.endpoints.releaseComment.edit(commentId, {
      message: body.message,
      spoiler: !!(body.spoiler ?? body.isSpoiler),
    });
    if (res?.code !== DefaultResult.Ok) {
      return Promise.reject(new Error(String(res?.code ?? 'comment edit failed')));
    }
    return res;
  } catch (err) {
    handleAnixError(err, 'releaseCommentEdit');
  }
});

ipcMain.handle('anix:releaseCommentDelete', async (_, commentId) => {
  try {
    const client = getAnixart();
    const res = await client.endpoints.releaseComment.delete(commentId);
    if (res?.code !== DefaultResult.Ok) {
      return Promise.reject(new Error(String(res?.code ?? 'comment delete failed')));
    }
    return res;
  } catch (err) {
    handleAnixError(err, 'releaseCommentDelete');
  }
});

// ——— Theme editor window ———

let themeEditorWindow = null;

function createThemeEditorWindow(themeId, isNew) {
  if (themeEditorWindow && !themeEditorWindow.isDestroyed()) {
    themeEditorWindow.focus();
    return;
  }
  const iconPath = getIconPath();
  themeEditorWindow = new BrowserWindow({
    width: 680,
    height: 560,
    minWidth: 560,
    minHeight: 440,
    frame: false,
    titleBarStyle: 'hidden',
    title: 'AnixApp — Редактор темы',
    show: false,
    resizable: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    ...(iconPath && { icon: iconPath }),
  });
  themeEditorWindow.on('closed', () => { themeEditorWindow = null; });
  themeEditorWindow.once('ready-to-show', () => {
    applyUiZoom(getUiZoom());
    themeEditorWindow.show();
  });

  const query = new URLSearchParams();
  if (themeId) query.set('id', themeId);
  if (isNew)   query.set('new', '1');
  const qs = query.toString();

  if (isDev) {
    themeEditorWindow.loadURL('http://localhost:5173/theme-editor.html' + (qs ? '?' + qs : ''));
  } else {
    const p = path.join(__dirname, '../dist/theme-editor.html');
    themeEditorWindow.loadFile(p, qs ? { query: Object.fromEntries(query) } : {});
  }
}

ipcMain.handle('theme-editor:open', (_, { themeId, isNew } = {}) => {
  createThemeEditorWindow(themeId, isNew);
});

// ——— Upscale Preview Tool ———
let upscaleToolWindow = null;

function createUpscaleToolWindow() {
  if (upscaleToolWindow && !upscaleToolWindow.isDestroyed()) {
    upscaleToolWindow.focus();
    return;
  }
  const _toolIcon = getIconPath();
  upscaleToolWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'Предпросмотр моделей',
    backgroundColor: '#0e0e0e',
    frame: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    ...(_toolIcon && { icon: _toolIcon }),
  });
  upscaleToolWindow.on('closed', () => { upscaleToolWindow = null; });
  upscaleToolWindow.once('ready-to-show', () => {
    applyUiZoom(getUiZoom());
    upscaleToolWindow.show();
  });
  upscaleToolWindow.on('maximize',   () => { if (upscaleToolWindow) upscaleToolWindow.webContents.send('tool:windowState', { isMaximized: true }); });
  upscaleToolWindow.on('unmaximize', () => { if (upscaleToolWindow) upscaleToolWindow.webContents.send('tool:windowState', { isMaximized: false }); });

  if (isDev) {
    upscaleToolWindow.loadURL('http://localhost:5173/upscale-tool.html');
  } else {
    upscaleToolWindow.loadFile(path.join(__dirname, '../dist/upscale-tool.html'));
  }
}

ipcMain.handle('tool:openUpscale', () => {
  createUpscaleToolWindow();
});

// ——— Overview video editor ———
let overviewEditorWindow = null;
let overviewEditorPayload = null;

function createOverviewVideoEditorWindow() {
  if (overviewEditorWindow && !overviewEditorWindow.isDestroyed()) {
    overviewEditorWindow.focus();
    return;
  }
  const _icon = getIconPath();
  overviewEditorWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    title: 'AnixApp — Редактор видео (Обзор)',
    backgroundColor: '#0e0e0e',
    frame: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    ...(_icon && { icon: _icon }),
  });
  overviewEditorWindow.on('closed', () => { overviewEditorWindow = null; });
  overviewEditorWindow.once('ready-to-show', () => {
    applyUiZoom(getUiZoom());
    overviewEditorWindow.show();
  });

  if (isDev) {
    overviewEditorWindow.loadURL('http://localhost:5173/overview-video-editor.html');
  } else {
    overviewEditorWindow.loadFile(path.join(__dirname, '../dist/overview-video-editor.html'));
  }
}

ipcMain.handle('overview-editor:open', (_, payload) => {
  overviewEditorPayload = payload ?? null;
  createOverviewVideoEditorWindow();
});

ipcMain.handle('overview-editor:getPayload', () => overviewEditorPayload);

ipcMain.on('overview-editor:done', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('overview-editor:done');
  }
  if (overviewEditorWindow && !overviewEditorWindow.isDestroyed()) {
    overviewEditorWindow.close();
  }
});

// Window controls for frameless tool window
ipcMain.handle('tool:minimize', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) win.minimize();
});
ipcMain.handle('tool:toggleMaximize', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return;
  win.isMaximized() ? win.unmaximize() : win.maximize();
});
ipcMain.handle('tool:close', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) win.close();
});

ipcMain.handle('tool:saveScreenshot', async (_, dataUrl, filename) => {
  const screenshotsDir = path.join(app.getPath('desktop'), 'upscale-screenshots');
  try {
    if (!fs.existsSync(screenshotsDir)) fs.mkdirSync(screenshotsDir, { recursive: true });
    const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');
    const filePath = path.join(screenshotsDir, filename);
    fs.writeFileSync(filePath, Buffer.from(base64, 'base64'));
    return filePath;
  } catch (err) {
    console.error('[UpscaleTool] Failed to save screenshot:', err);
    throw err;
  }
});

// Theme editor → main window: theme was saved, re-apply it
ipcMain.on('theme-editor:saved', (_, themeId) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('theme-editor:saved', themeId);
  }
});

// Theme editor → main window: live color update while editing
ipcMain.on('theme-editor:liveUpdate', (_, vars) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('theme-editor:liveUpdate', vars);
  }
});

// Theme editor → main window: theme was deleted
ipcMain.on('theme-editor:deleted', (_, themeId) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('theme-editor:deleted', themeId);
  }
});
