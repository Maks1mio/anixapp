const { app, BrowserWindow, ipcMain, Tray, nativeImage, Menu, session, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { Anixart, KodikParser, SibnetParser, AniLibriaParser } = require('anixartjs');
const { DefaultResult, BookmarkType, BookmarkSortType } = require('anixartjs');

/** Строковый id статуса из UI -> BookmarkType (число для API) */
const LIST_STATUS_TO_TYPE = {
  watching: BookmarkType.Watching,
  planned: BookmarkType.InPlans,
  completed: BookmarkType.Completed,
  on_hold: BookmarkType.HoldOn,
  dropped: BookmarkType.Dropped,
};

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
let mainWindow = null;
let playerWindowRef = null;
/** Текущий контент плеера (releaseId, sourceId, ep) — для сравнения при sync: при смене тайтла переоткрываем окно */
let currentPlayerPlayback = null;
let tray = null;
let anixart = null;
let isQuitting = false;

function getIconPath() {
  const base = path.join(__dirname, '..', 'public', 'logo');
  const ico = path.join(base, 'icon.ico');
  const png = path.join(base, '512x512.png');
  if (fs.existsSync(ico)) return ico;
  if (fs.existsSync(png)) return png;
  return null;
}

const AUTH_FILE = 'auth.json';
const DEFAULT_BASE_URL = 'https://api-s.anixsekai.com';
const LOG_DIR = 'logs';

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

function getConfigPath() {
  return path.join(app.getPath('userData'), AUTH_FILE);
}

function loadConfig() {
  try {
    const p = getConfigPath();
    if (fs.existsSync(p)) {
      const data = JSON.parse(fs.readFileSync(p, 'utf8'));
      return {
        token: data.token || null,
        baseUrl: data.baseUrl || DEFAULT_BASE_URL,
        profileId: data.profileId ?? null,
        profileLogin: data.profileLogin || null,
        profileAvatar: data.profileAvatar || null,
        profileRaw: data.profileRaw || null,
      };
    }
  } catch (_) {}
  return {
    token: null,
    baseUrl: DEFAULT_BASE_URL,
    profileId: null,
    profileLogin: null,
    profileAvatar: null,
    profileRaw: null,
  };
}

function saveConfig(updates) {
  try {
    const p = getConfigPath();
    const current = loadConfig();
    const next = { ...current, ...updates };
    fs.writeFileSync(p, JSON.stringify(next), 'utf8');
  } catch (err) {
    console.error('Failed to save config', err);
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

function createTray() {
  const iconPath = getIconPath();
  if (!iconPath) return;
  const image = nativeImage.createFromPath(iconPath);
  if (image.isEmpty()) return;
  tray = new Tray(image.resize({ width: 16, height: 16 }));
  tray.setToolTip('AnixApp');
  tray.on('click', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Показать', click: () => mainWindow && mainWindow.show() },
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
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
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
      e.preventDefault();
      mainWindow.hide();
    }
  });
  mainWindow.on('closed', () => { mainWindow = null; });
}

/** User-Agent и заголовки как в приложении Anixart (Android), чтобы видеоисточники отдавали поток */
const ANIXART_UA = 'AnixartApp/9.0 BETA 3-25021818 (Android 9; SDK 28; x86_64; ROG ASUS AI2201_B; ru)';
const VIDEO_HOSTS = ['anixis.com', 'aniqart.com', 'aniqit.com', 'video.sibnet.ru', 'sibnet.ru', 'kodik.info', 'kodik-cdn.com', 'collaps.io'];

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
      upsertHeader(requestHeaders, 'Referer', 'https://aniqit.com/');
    }
    if (host !== 'kodik.info' && host !== 'video.sibnet.ru') {
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
  setupVideoRequestHeaders();
  createWindow();
  createTray();
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

ipcMain.on('window:minimize', () => mainWindow?.minimize());
ipcMain.on('window:maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize();
  else mainWindow?.maximize();
});
ipcMain.on('window:close', () => mainWindow?.hide());

// ——— Auth ———

ipcMain.handle('anix:getAuthStatus', () => {
  const token = loadSavedToken();
  return { hasToken: !!token };
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
  const client = getAnixart();
  const data = await client.endpoints.release.info(id, extended);
  return data;
});

ipcMain.handle('anix:getVideos', async (_, releaseId) => {
  const client = getAnixart();
  return await client.endpoints.release.getVideos(releaseId);
});

ipcMain.handle('anix:getVideoInCategory', async (_, releaseId, categoryId, page = 1) => {
  const client = getAnixart();
  return await client.endpoints.release.getVideoInCategory({ id: releaseId, categoryId, page });
});

ipcMain.handle('anix:getDubbers', async (_, releaseId) => {
  const client = getAnixart();
  return await client.endpoints.release.getDubbers(releaseId);
});

ipcMain.handle('anix:getDubberSources', async (_, releaseId, dubberId) => {
  const client = getAnixart();
  return await client.endpoints.release.getDubberSources(releaseId, dubberId);
});

ipcMain.handle('anix:getEpisodes', async (_, releaseId, dubberId, sourceId, sort = 1) => {
  const client = getAnixart();
  return await client.endpoints.release.getEpisodes(releaseId, dubberId, sourceId, sort);
});

ipcMain.handle('anix:getEpisode', async (_, releaseId, sourceId, episodePosition) => {
  const client = getAnixart();
  return await client.endpoints.release.getEpisode(releaseId, sourceId, episodePosition);
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
  });
  playerWindow.once('ready-to-show', () => playerWindow.show());
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
  await waitPlayerClosed();
  const safe = {
    releaseId: String(params.releaseId ?? ''),
    sourceId: String(params.sourceId ?? ''),
    ep: String(params.ep ?? ''),
    title: String(params.title ?? ''),
    sourceName: String(params.sourceName ?? ''),
    ...(params.dubberId != null && params.dubberId !== '' ? { dubberId: String(params.dubberId) } : {}),
  };
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
  const sameContent = isSamePlaybackContent(currentPlayerPlayback, incomingContent);
  if (playerWindowRef && !playerWindowRef.isDestroyed() && sameContent) {
    playerWindowRef.webContents.send('player:applySync', params);
    return;
  }
  await waitPlayerClosed();
  createPlayerWindow(params);
});

ipcMain.on('player:stateChanged', (event, playback) => {
  if (playback && typeof playback === 'object') {
    currentPlayerPlayback = {
      releaseId: String(playback.releaseId ?? ''),
      sourceId: String(playback.sourceId ?? ''),
      ep: String(playback.ep ?? ''),
      dubberId: String(playback.dubberId ?? ''),
    };
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('lobby:playerStateChanged', playback);
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

// Простая система скачивания обновления с GitHub Releases.
// Скачиваем первый .exe из assets последнего релиза и шлём прогресс в renderer.
let pendingInstallerPath = null;
let updateDownloadState = { state: 'idle', received: 0, total: 0 };

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
            const exe = assets.find((a) => typeof a.browser_download_url === 'string' && /\.exe(\?|$)/i.test(a.browser_download_url));
            if (!exe) {
              reject(new Error('No .exe asset in latest release'));
              return;
            }
            resolve(exe.browser_download_url);
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
    const child = spawn(pendingInstallerPath, [], {
      detached: true,
      stdio: 'ignore',
    });
    child.unref();
    isQuitting = true;
    app.quit();
  } catch (e) {
    console.error('Failed to start installer', e);
  }
});

ipcMain.handle('anix:randomRelease', async (_, extended = true) => {
  const client = getAnixart();
  const data = await client.endpoints.release.getRandomRelease(extended);
  return data;
});

ipcMain.handle('anix:latestFeed', async (_, page = 1) => {
  const client = getAnixart();
  const data = await client.endpoints.feed.latest(page);
  return data;
});

ipcMain.handle('anix:discoverRecommendations', async (_, page = 0) => {
  const client = getAnixart();
  const data = await client.endpoints.discover.getRecommendations(page);
  return data;
});

ipcMain.handle('anix:articleById', async (_, id) => {
  const client = getAnixart();
  const data = await client.endpoints.channel.getArticle(id);
  return data;
});

ipcMain.handle('anix:channelById', async (_, id) => {
  const client = getAnixart();
  const data = await client.endpoints.channel.info(id);
  return data;
});

ipcMain.handle('anix:profileById', async (_, id) => {
  const client = getAnixart();
  const data = await client.endpoints.profile.info(id);
  return data;
});

ipcMain.handle('anix:collectionById', async (_, id) => {
  const client = getAnixart();
  const data = await client.endpoints.collection.info(id);
  return data;
});

ipcMain.handle('anix:collectionReleases', async (_, id, page = 0) => {
  const client = getAnixart();
  const data = await client.endpoints.collection.getCollectionReleases(id, page);
  return data;
});

ipcMain.handle('anix:collectionRandomRelease', async (_, id) => {
  const client = getAnixart();
  const data = await client.endpoints.collection.getRandomRelease(id, true);
  return data;
});

ipcMain.handle('anix:addCollectionFavorite', async (_, id) => {
  const client = getAnixart();
  return await client.endpoints.collection.addCollectionFavorite(id);
});

ipcMain.handle('anix:removeCollectionFavorite', async (_, id) => {
  const client = getAnixart();
  return await client.endpoints.collection.removeCollectionFavorite(id);
});

ipcMain.handle('anix:collectionsAll', async (_, page = 1, sort = 2) => {
  const client = getAnixart();
  const data = await client.endpoints.collection.all(page, sort);
  return data;
});

ipcMain.handle('anix:favorites', async (_, page = 0) => {
  const client = getAnixart();
  const data = await client.endpoints.profile.getFavorites({
    page,
    sort: BookmarkSortType.NewToOldAddTime,
    filter_announce: 0,
    filter: 0,
  });
  appendLog('favorites', { page, response: data });
  return data;
});

ipcMain.handle('anix:getBookmarks', async (_, profileId, type, page = 0) => {
  const client = getAnixart();
  return await client.endpoints.profile.getBookmarks({
    id: profileId,
    type: type ?? BookmarkType.Watching,
    page,
    sort: BookmarkSortType.NewToOldAddTime,
    filter_announce: 0,
    filter: 0,
  });
});

ipcMain.handle('anix:notificationsAll', async (_, page = 0) => {
  const client = getAnixart();
  const data = await client.endpoints.notification.getNotifications(page);
  appendLog('notifications', { page, response: data });
  return data;
});

ipcMain.handle('anix:notificationsCount', async () => {
  const client = getAnixart();
  const data = await client.endpoints.notification.countNotifications();
  return data;
});

ipcMain.handle('anix:history', async (_, page = 0) => {
  const client = getAnixart();
  const data = await client.endpoints.release.getHistory(page);
  return data;
});

ipcMain.handle('anix:addToHistory', async (_, releaseId, sourceId, episodePosition) => {
  const client = getAnixart();
  await client.endpoints.release.addToHistory(releaseId, sourceId, episodePosition);
});

ipcMain.handle('anix:relatedReleases', async (_, releaseId, page = 0) => {
  const client = getAnixart();
  const data = await client.endpoints.release.getRelatedReleases(releaseId, page);
  appendLog('relatedReleases', { releaseId, page, response: data });
  return data;
});

ipcMain.handle('anix:votedReleases', async (_, profileId, page = 0) => {
  const client = getAnixart();
  const data = await client.endpoints.profile.getVotedReleases(profileId, page);
  return data;
});

ipcMain.handle('anix:friends', async (_, profileId, page = 0) => {
  const client = getAnixart();
  const data = await client.endpoints.profile.getFriends({ id: profileId, page });
  return data;
});

// ——— Поиск ———

ipcMain.handle('anix:searchReleases', async (_, query, page = 0) => {
  const client = getAnixart();
  const data = await client.endpoints.search.releases({ query, page, searchBy: 0 });
  appendLog('searchReleases', { query, page, response: data });
  return data;
});

ipcMain.handle('anix:searchProfiles', async (_, query, page = 0) => {
  const client = getAnixart();
  const data = await client.endpoints.search.profiles({ query, page, searchBy: 0 });
  appendLog('searchProfiles', { query, page, response: data });
  return data;
});

ipcMain.handle('anix:searchCollections', async (_, query, page = 0) => {
  const client = getAnixart();
  const data = await client.endpoints.search.collections({ query, page, searchBy: 0 });
  appendLog('searchCollections', { query, page, response: data });
  return data;
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
