const { app, BrowserWindow, ipcMain, Tray, nativeImage, Menu, session, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { Anixart, KodikParser, SibnetParser, AniLibriaParser } = require('anixartjs');
const { DefaultResult, BookmarkType, BookmarkSortType } = require('anixartjs');

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

// ——— Single instance lock ———
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

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
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

function getAnixart() {
  if (!anixart) {
    const { token, baseUrl } = loadConfig();
    anixart = new Anixart({ baseUrl, token: token || undefined });
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

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.once('ready-to-show', () => mainWindow.show());
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
const VIDEO_HOSTS = ['anixis.com', 'aniqart.com', 'aniqit.com', 'video.sibnet.ru', 'sibnet.ru', 'kodikplayer.com', 'kodik-cdn.com', 'collaps.io'];

function upsertHeader(headers, name, value) {
  const lower = name.toLowerCase();
  for (const k of Object.keys(headers)) {
    if (k.toLowerCase() === lower) { headers[k] = value; return; }
  }
  headers[name] = value;
}

/** Логика заголовков как в AniDesk: Referer сбрасываем для всех, для sibnet — подставляем url запроса; для остальных видеохостингов — только User-Agent Anixart */
function setupVideoRequestHeaders() {
  const ses = session.defaultSession;
  ses.webRequest.onBeforeSendHeaders((details, callback) => {
    let host;
    try { host = new URL(details.url).host.replace(/^www\./, ''); } catch (_) { callback({ requestHeaders: details.requestHeaders }); return; }
    const requestHeaders = { ...details.requestHeaders };
    if (!VIDEO_HOSTS.some(h => host === h || host.endsWith('.' + h))) {
      callback({ requestHeaders });
      return;
    }
    // Как в AniDesk: Referer сбрасываем для всех; только sibnet — подставляем url
    for (const k of Object.keys(requestHeaders)) {
      const lower = k.toLowerCase();
      if (lower === 'referer') { delete requestHeaders[k]; break; }
    }
    if (host === 'video.sibnet.ru') {
      upsertHeader(requestHeaders, 'Referer', details.url);
    }
    if (host.endsWith('kodik-cdn.com')) {
      upsertHeader(requestHeaders, 'Referer', 'https://kodikplayer.com/');
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
    const responseHeaders = { ...details.responseHeaders };
    upsertHeader(responseHeaders, 'Access-Control-Allow-Origin', '*');
    upsertHeader(responseHeaders, 'Access-Control-Allow-Headers', '*');
    callback({ responseHeaders });
  });
}

app.whenReady().then(() => {
  // Prime the config cache now that userData path is fully reliable.
  if (_configCache === null) _configCache = _readConfigFromDisk();

  setupVideoRequestHeaders();
  createWindow();
  createTray();
  // Discord RPC
  if (discordRpc && mainWindow) {
    discordRpc.setMainWindow(mainWindow);
    discordRpc.setBrowsing(_discordSessionStart);
    discordRpc.connect();
    // Focus tracking: switch Discord activity when user moves between windows
    mainWindow.on('focus', () => discordRpc.focusWindow('main'));
  }
});
app.on('before-quit', () => { if (discordRpc) discordRpc.destroy(); });
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
    };
  } catch (_) {
    return { minimizeToTray: getMinimizeToTray(), adaptiveAcceleration: getAdaptiveAcceleration(), upscaleEnabled: false, upscaleMode: 15 };
  }
});

ipcMain.handle('app:saveSettings', (_, settings) => {
  if (settings && typeof settings === 'object') {
    saveConfig(settings);
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
ipcMain.handle('anix:checkConnection', async () => {
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

ipcMain.handle('anix:login', async (_, username, password) => {
  // Для логина используем отдельный клиент БЕЗ сохранённого токена,
  // чтобы старый токен не перезаписывал учётку.
  const { baseUrl } = loadConfig();
  const loginClient = new Anixart({ baseUrl });
  const res = await loginClient.endpoints.auth.signIn({ login: username, password });
  appendLog('auth', { event: 'login', code: res?.code, profile: res?.profile, profileToken: res?.profileToken });
  const code = res?.code;
  const profile = res?.profile;
  const profileToken = res?.profileToken;
  if (code === DefaultResult.Ok && profileToken?.token) {
    saveConfig({
      token: profileToken.token,
      profileId: profile?.id ?? null,
      profileLogin: profile?.login ?? null,
      profileAvatar: profile?.avatar ?? null,
      profileRaw: profile || null,
    });
    // Пересоздаём основной клиент с новым токеном
    anixart = new Anixart({ baseUrl, token: profileToken.token });
    return { success: true };
  }
  return { success: false, code };
});

ipcMain.handle('anix:logout', () => {
  saveConfig({
    token: null,
    profileId: null,
    profileLogin: null,
    profileAvatar: null,
    profileRaw: null,
  });
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
    const client = new Anixart({ baseUrl, token: undefined });
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

ipcMain.handle('anix:releaseById', async (_, id, extended = true) => {
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

/** Прямые ссылки на видео (как в AniDesk): парсеры anixartjs, чтобы не грузить embed в iframe и не получать 500 от aniqit.com */
ipcMain.handle('anix:getDirectVideoLink', async (_, embedUrl) => {
  if (!embedUrl || typeof embedUrl !== 'string') return { directUrl: null, quality: null };
  const url = embedUrl.startsWith('http') ? embedUrl : `https:${embedUrl}`;
  const host = (url.match(/https?:\/\/([^/]+)/) || [])[1] || '';
  try {
    if (host.includes('kodik')) {
      const links = await KodikParser.getDirectLinks(url);
      if (!links || typeof links !== 'object') return { directUrl: null, quality: null };
      const q720 = links['720']?.[0]?.src || links['720p']?.[0]?.src;
      const q1080 = links['1080']?.[0]?.src || links['1080p']?.[0]?.src;
      const q480 = links['480']?.[0]?.src || links['480p']?.[0]?.src;
      const src = q720 || q1080 || q480 || Object.values(links)[0]?.[0]?.src;
      return { directUrl: src || null, quality: src ? (q1080 ? '1080' : q720 ? '720' : '480') : null };
    }
    if (host.includes('sibnet')) {
      const direct = await SibnetParser.getDirectLink(url);
      return { directUrl: direct || null, quality: direct ? '720' : null };
    }
    if (host.includes('aniliberty') || host.includes('libria')) {
      const links = await AniLibriaParser.getDirectLinks(url);
      if (!links || typeof links !== 'object') return { directUrl: null, quality: null };
      const src = links['720']?.src || links['1080']?.src || links['480']?.src || Object.values(links)[0]?.src;
      return { directUrl: src || null, quality: src ? '720' : null };
    }
  } catch (e) {
    console.error('getDirectVideoLink', e);
  }
  return { directUrl: null, quality: null };
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
    // Revert Discord presence to browsing when player is closed
    if (discordRpc) {
      discordRpc.focusWindow('main');
      discordRpc.setBrowsing(_discordSessionStart);
    }
  });
  playerWindow.once('ready-to-show', () => playerWindow.show());
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
    // Party info is managed separately via discord:partyInfo from renderer
    if (discordRpc) {
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
  if (!data || typeof data !== 'object') return;

  if (data.type === 'watching') {
    if (discordRpc) {
      discordRpc.setWatching({
        title: String(data.title ?? ''),
        ep: String(data.ep ?? ''),
        sourceName: String(data.sourceName ?? ''),
        dubberName: data.dubberName ? String(data.dubberName) : undefined,
        paused: !!data.paused,
        currentTime: Number(data.currentTime ?? 0),
        duration: data.duration != null ? Number(data.duration) : undefined,
        posterUrl: data.posterUrl ? String(data.posterUrl) : undefined,
      });
    }
  } else if (data.type === 'partyInfo') {
    // Update persistent party info for Discord (from lobby-modal)
    if (discordRpc) {
      if (data.partyId) {
        discordRpc.setPartyInfo({
          partyId: String(data.partyId),
          partySize: Number(data.partySize ?? 1),
          partyMax: Number(data.partyMax ?? 10),
          joinSecret: data.joinSecret ? String(data.joinSecret) : undefined,
        });
      } else {
        // Clear party info (left lobby)
        discordRpc.setPartyInfo(null);
      }
    }
  } else if (data.type === 'posterUrl') {
    // Remember poster URL for subsequent watching activities
    if (discordRpc && data.posterUrl) {
      discordRpc.setPosterUrl(String(data.posterUrl));
    }
  } else if (data.type === 'page') {
    if (discordRpc) {
      discordRpc.setPage({
        details: String(data.details ?? ''),
        state: String(data.state ?? ''),
      });
    }
  } else if (data.type === 'release') {
    if (discordRpc) {
      discordRpc.setViewingRelease({
        title: String(data.title ?? ''),
        posterUrl: data.posterUrl ? String(data.posterUrl) : null,
      });
    }
  } else if (data.type === 'profile') {
    if (discordRpc) {
      discordRpc.setViewingProfile({
        username: data.username ? String(data.username) : '',
        avatarUrl: data.avatarUrl ? String(data.avatarUrl) : null,
        isSelf: !!data.isSelf,
      });
    }
  } else if (data.type === 'browsing') {
    if (discordRpc) {
      discordRpc.setBrowsing(_discordSessionStart);
    }
    if (discordSocial) {
      discordSocial.setActivity({
        name: 'AnixApp',
        details: 'Просматривает аниме',
        state: 'В главном меню',
        startTimestamp: _discordSessionStart,
      });
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

ipcMain.handle('shell:openExternal', (_, url) => {
  if (url && typeof url === 'string') shell.openExternal(url);
});

ipcMain.handle('app:getVersion', () => app.getVersion());

ipcMain.handle('app:getVersions', () => {
  let anixartjsVersion = '';
  try {
    const pkg = require('anixartjs/package.json');
    anixartjsVersion = pkg.version || '';
  } catch (_) {}
  return {
    app: app.getVersion(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    anixartjs: anixartjsVersion,
  };
});

// Простая система скачивания обновления с GitHub Releases.
// Определяем платформу и скачиваем соответствующий пакет.
let pendingInstallerPath = null;
let updateDownloadState = { state: 'idle', received: 0, total: 0 };

/** Возвращает regex-паттерн для поиска подходящего ассета в GitHub Releases. */
function getUpdateAssetPattern() {
  if (process.platform === 'linux') {
    try {
      require('child_process').execSync('which pacman', { stdio: 'ignore' });
      return /\.(pacman|pkg\.tar\.zst)(\?|$)/i;
    } catch {
      return /\.deb(\?|$)/i;
    }
  }
  return /\.exe(\?|$)/i;
}

/** Человекочитаемое расширение для логов. */
function getUpdateAssetLabel() {
  if (process.platform === 'linux') {
    try {
      require('child_process').execSync('which pacman', { stdio: 'ignore' });
      return '.pacman/.pkg.tar.zst';
    } catch {
      return '.deb';
    }
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
    ...(extra || {}),
  };
  mainWindow.webContents.send('app:update-progress', payload);
}

async function fetchLatestInstallerUrl() {
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
            const data = JSON.parse(raw);
            const assets = Array.isArray(data.assets) ? data.assets : [];
            const pattern = getUpdateAssetPattern();
            const asset = assets.find((a) => typeof a.browser_download_url === 'string' && pattern.test(a.browser_download_url));
            if (!asset) {
              reject(new Error(`No ${getUpdateAssetLabel()} asset in latest release`));
              return;
            }
            resolve(asset.browser_download_url);
          } catch (e) {
            reject(e);
          }
        });
      },
    );
    req.on('error', reject);
  });
}

async function downloadInstaller() {
  const path = require('path');
  const fs = require('fs');
  const https = require('https');

  try {
    updateDownloadState = { state: 'downloading', received: 0, total: 0 };
    sendUpdateProgress();
    const downloadUrl = await fetchLatestInstallerUrl();
    const updatesDir = path.join(app.getPath('userData'), 'updates');
    if (!fs.existsSync(updatesDir)) fs.mkdirSync(updatesDir, { recursive: true });
    const fileName = path.basename(downloadUrl.split('?')[0] || 'AnixApp-Setup.exe');
    const destPath = path.join(updatesDir, fileName);
    const file = fs.createWriteStream(destPath);

    await new Promise((resolve, reject) => {
      const maxRedirects = 5;
      function doRequest(url, redirectsLeft) {
        const req = https.get(
          url,
          {
            headers: {
              'User-Agent': 'AnixApp-Updater',
            },
          },
          (res) => {
            // GitHub assets обычно отдают 302/301 на CDN — поддерживаем редиректы.
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
              if (redirectsLeft <= 0) {
                reject(new Error('Too many redirects while downloading update'));
                res.resume();
                return;
              }
              const nextUrl = res.headers.location;
              res.resume();
              doRequest(nextUrl, redirectsLeft - 1);
              return;
            }
            if (res.statusCode !== 200) {
              reject(new Error(`Download status ${res.statusCode}`));
              res.resume();
              return;
            }
            const total = parseInt(res.headers['content-length'] || '0', 10) || 0;
            updateDownloadState.total = total;
            res.on('data', (chunk) => {
              file.write(chunk);
              updateDownloadState.received += chunk.length;
              sendUpdateProgress();
            });
            res.on('end', () => {
              file.end(() => resolve());
            });
          },
        );
        req.on('error', reject);
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
  }
}

ipcMain.handle('app:startUpdateDownload', async () => {
  if (updateDownloadState.state === 'downloading') {
    return;
  }
  downloadInstaller();
});

ipcMain.handle('app:installUpdate', async () => {
  const fs = require('fs');
  const { spawn } = require('child_process');
  if (!pendingInstallerPath || !fs.existsSync(pendingInstallerPath)) {
    return;
  }
  try {
    if (process.platform === 'win32') {
      // Windows: запускаем .exe инсталлятор
      const child = spawn(pendingInstallerPath, [], {
        detached: true,
        stdio: 'ignore',
      });
      child.unref();
    } else if (process.platform === 'linux') {
      // Linux: устанавливаем через pkexec (графический sudo)
      let installCmd, installArgs;
      if (pendingInstallerPath.endsWith('.deb')) {
        installCmd = 'pkexec';
        installArgs = ['dpkg', '-i', pendingInstallerPath];
      } else if (pendingInstallerPath.endsWith('.pkg.tar.zst') || pendingInstallerPath.endsWith('.pacman')) {
        installCmd = 'pkexec';
        installArgs = ['pacman', '-U', '--noconfirm', pendingInstallerPath];
      } else {
        console.error('Unknown Linux package format:', pendingInstallerPath);
        return;
      }
      const child = spawn(installCmd, installArgs, {
        detached: true,
        stdio: 'ignore',
      });
      child.unref();
    }
    isQuitting = true;
    app.quit();
  } catch (e) {
    console.error('Failed to start installer', e);
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

ipcMain.handle('anix:discoverRecommendations', async (_, page = 0) => {
  try {
    const client = getAnixart();
    const data = await client.endpoints.discover.getRecommendations(page);
    return data;
  } catch (err) {
    handleAnixError(err, 'discoverRecommendations');
  }
});

ipcMain.handle('anix:filterReleases', async (_, page = 0, filterArgs = {}, extended = true) => {
  try {
    const client = getAnixart();
    // Поведение как в AniDesk: release.filter(page, filterArgs, extended)
    const data = await client.endpoints.release.filter(page, filterArgs, extended);
    return data;
  } catch (err) {
    handleAnixError(err, 'filterReleases');
  }
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

ipcMain.handle('anix:collectionsAll', async (_, page = 1, sort = 2) => {
  try {
    const client = getAnixart();
    const data = await client.endpoints.collection.all(page, sort);
    return data;
  } catch (err) {
    handleAnixError(err, 'collectionsAll');
  }
});

ipcMain.handle('anix:favorites', async (_, page = 0) => {
  try {
    const client = getAnixart();
    const data = await client.endpoints.profile.getFavorites({
      page,
      sort: BookmarkSortType.NewToOldAddTime,
      filter_announce: 0,
      filter: 0,
    });
    appendLog('favorites', { page, response: data });
    return data;
  } catch (err) {
    handleAnixError(err, 'favorites');
  }
});

ipcMain.handle('anix:getBookmarks', async (_, profileId, type, page = 0) => {
  try {
    const client = getAnixart();
    return await client.endpoints.profile.getBookmarks({
      id: profileId,
      type: type ?? BookmarkType.Watching,
      page,
      sort: BookmarkSortType.NewToOldAddTime,
      filter_announce: 0,
      filter: 0,
    });
  } catch (err) {
    handleAnixError(err, 'getBookmarks');
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

ipcMain.handle('anix:relatedReleases', async (_, releaseId, page = 0) => {
  try {
    const client = getAnixart();
    const data = await client.endpoints.release.getRelatedReleases(releaseId, page);
    appendLog('relatedReleases', { releaseId, page, response: data });
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

ipcMain.handle('anix:searchReleases', async (_, query, page = 0) => {
  try {
    const client = getAnixart();
    const data = await client.endpoints.search.releases({ query, page, searchBy: 0 });
    appendLog('searchReleases', { query, page, response: data });
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
  themeEditorWindow.once('ready-to-show', () => themeEditorWindow.show());

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
  upscaleToolWindow.once('ready-to-show', () => upscaleToolWindow.show());
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
