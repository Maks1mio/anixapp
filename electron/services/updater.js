'use strict';

const path = require('path');
const fs = require('fs');
const { app, ipcMain, shell, dialog } = require('electron');
const state = require('../lib/app-state');
const logger = require('../logger');

function register() {

// Простая система скачивания обновления с GitHub Releases.
// Определяем платформу и скачиваем соответствующий пакет.

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

/** Возвращает regex-паттерны ассетов в порядке предпочтения для текущей ОС. */
function getUpdateAssetPatterns() {
  if (process.platform === 'linux') {
    const t = getLinuxInstallType();
    const patterns = [];
    if (t === 'pacman') patterns.push(/\.(pacman|pkg\.tar\.zst)(\?|$)/i);
    else if (t === 'deb') patterns.push(/\.deb(\?|$)/i);
    else if (t === 'flatpak') patterns.push(/\.flatpak(\?|$)/i);
    // AppImage — универсальный fallback на Linux (в старых релизах часто только он)
    patterns.push(/\.AppImage(\?|$)/i);
    return patterns;
  }
  if (process.platform === 'darwin') {
    // Сборки раздельные по архитектуре: AnixApp-<version>-mac-arm64.dmg / -x64.dmg
    return [new RegExp(`(${process.arch}|universal)\\.dmg(\\?|$)`, 'i')];
  }
  return [/\.exe(\?|$)/i];
}

/** Человекочитаемое расширение / платформа для логов и UI. */
function getUpdateAssetLabel() {
  if (process.platform === 'linux') {
    const t = getLinuxInstallType();
    if (t === 'pacman') return '.pacman / .AppImage';
    if (t === 'deb') return '.deb / .AppImage';
    if (t === 'flatpak') return '.flatpak / .AppImage';
    return '.AppImage';
  }
  if (process.platform === 'darwin') return `${process.arch}.dmg`;
  return '.exe';
}

function getPlatformLabel() {
  if (process.platform === 'linux') return 'Linux';
  if (process.platform === 'darwin') return 'macOS';
  if (process.platform === 'win32') return 'Windows';
  return process.platform;
}

function assetMatchText(asset) {
  const name = typeof asset?.name === 'string' ? asset.name : '';
  const url = typeof asset?.browser_download_url === 'string' ? asset.browser_download_url : '';
  return `${name} ${url}`;
}

function pickInstallAsset(data) {
  const assets = Array.isArray(data?.assets) ? data.assets : [];
  for (const pattern of getUpdateAssetPatterns()) {
    const asset = assets.find((a) => pattern.test(assetMatchText(a)));
    if (asset && typeof asset.browser_download_url === 'string') return asset;
  }
  return null;
}

function releaseHasInstallAsset(data) {
  return !!pickInstallAsset(data);
}

function pickInstallAssetUrl(data) {
  const asset = pickInstallAsset(data);
  if (!asset?.browser_download_url) {
    throw new Error(`No ${getUpdateAssetLabel()} asset in release for ${getPlatformLabel()}`);
  }
  return asset.browser_download_url;
}

function looksPrereleaseVersion(version, prereleaseFlag) {
  if (prereleaseFlag) return true;
  return /(?:^|[.+-])(beta|alpha|rc|pre|dev|test)(?:[.+-]|\d|$)/i.test(String(version || ''));
}

function sendUpdateProgress(extra) {
  if (!state.mainWindow || state.mainWindow.isDestroyed()) return;
  const payload = {
    state: state.updateDownloadState.state,
    received: state.updateDownloadState.received,
    total: state.updateDownloadState.total,
    percent: state.updateDownloadState.total > 0 ? Math.round((state.updateDownloadState.received / state.updateDownloadState.total) * 100) : 0,
    filePath: state.pendingInstallerPath,
    installType: process.platform === 'linux' ? getLinuxInstallType() : null,
    ...(extra || {}),
  };
  state.mainWindow.webContents.send('app:update-progress', payload);
}

const GITHUB_CACHE_TTL_MS = 15 * 60 * 1000;
const GITHUB_FORCE_MIN_INTERVAL_MS = 90 * 1000;

/** @type {Map<string, { at: number; data: any }>} */
const githubJsonCache = new Map();
/** @type {Map<string, Promise<any>>} */
const githubJsonInflight = new Map();

function githubCacheKey(urlPath) {
  return urlPath.startsWith('http') ? urlPath : `https://api.github.com${urlPath}`;
}

function readGithubCache(key, { allowStale = false, maxAge = GITHUB_CACHE_TTL_MS } = {}) {
  const hit = githubJsonCache.get(key);
  if (!hit) return null;
  const age = Date.now() - hit.at;
  if (!allowStale && age > maxAge) return null;
  return hit;
}

function writeGithubCache(key, data) {
  githubJsonCache.set(key, { at: Date.now(), data });
}

function githubGetJsonRaw(urlPath, redirectsLeft = 3) {
  const https = require('https');
  const url = urlPath.startsWith('http')
    ? urlPath
    : `https://api.github.com${urlPath}`;
  const headers = {
    'User-Agent': 'AnixApp-Updater',
    Accept: 'application/vnd.github.v3+json',
  };
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';
  if (token) headers.Authorization = `Bearer ${token}`;

  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        headers,
        timeout: 20000,
      },
      (res) => {
        // Репозиторий переименовали или перенесли — API отвечает 301/307 на новый адрес
        const location = res.headers.location;
        if ([301, 302, 307, 308].includes(res.statusCode) && location && redirectsLeft > 0) {
          res.resume();
          resolve(githubGetJsonRaw(new URL(location, url).href, redirectsLeft - 1));
          return;
        }
        if (res.statusCode !== 200) {
          const err = new Error(`GitHub status ${res.statusCode}`);
          err.statusCode = res.statusCode;
          reject(err);
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

/**
 * Кешированный GitHub JSON.
 * - обычный вызов: TTL 15 мин
 * - force=true: сеть только если кешу ≥ 90 сек (антиспам кнопки «Проверить»)
 * - при 403/сети: отдаём устаревший кеш, если есть
 */
async function githubGetJson(urlPath, { force = false } = {}) {
  const key = githubCacheKey(urlPath);
  const fresh = readGithubCache(key, { maxAge: GITHUB_CACHE_TTL_MS });
  if (fresh && !force) return fresh.data;

  if (force) {
    const recent = readGithubCache(key, { maxAge: GITHUB_FORCE_MIN_INTERVAL_MS });
    if (recent) {
      logger.info('update', `github cache: force skipped (<${GITHUB_FORCE_MIN_INTERVAL_MS / 1000}s) ${urlPath}`);
      return recent.data;
    }
  }

  const existing = githubJsonInflight.get(key);
  if (existing) return existing;

  const request = githubGetJsonRaw(urlPath)
    .then((data) => {
      writeGithubCache(key, data);
      return data;
    })
    .catch((err) => {
      const stale = readGithubCache(key, { allowStale: true, maxAge: Number.POSITIVE_INFINITY });
      if (stale) {
        logger.warn(
          'update',
          `github cache: stale after ${err?.message ?? err} (${urlPath})`,
        );
        return stale.data;
      }
      throw err;
    })
    .finally(() => {
      githubJsonInflight.delete(key);
    });

  githubJsonInflight.set(key, request);
  return request;
}

async function fetchLatestGitHubRelease({ force = false } = {}) {
  return githubGetJson('/repos/Anixapp-Community/anixapp/releases/latest', { force });
}

async function fetchGitHubReleaseByTag(tag, { force = false } = {}) {
  const clean = String(tag || '').replace(/^v/i, '').trim();
  if (!clean) throw new Error('Empty release tag');
  // Try with and without leading v — GitHub tags are usually "v1.2.3"
  try {
    return await githubGetJson(`/repos/Anixapp-Community/anixapp/releases/tags/v${clean}`, { force });
  } catch (first) {
    try {
      return await githubGetJson(`/repos/Anixapp-Community/anixapp/releases/tags/${clean}`, { force });
    } catch {
      throw first;
    }
  }
}

async function fetchGitHubReleasesPage(page = 1, perPage = 30, { force = false } = {}) {
  const data = await githubGetJson(
    `/repos/Anixapp-Community/anixapp/releases?per_page=${perPage}&page=${page}`,
    { force },
  );
  return Array.isArray(data) ? data : [];
}

function normalizeReleaseVersion(data) {
  return String(data?.tag_name ?? data?.name ?? '').replace(/^v/i, '').trim();
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

ipcMain.handle('app:checkForUpdate', async (_, currentVersion, force) => {
  try {
    const data = await fetchLatestGitHubRelease({ force: !!force });
    const latest = normalizeReleaseVersion(data);
    const current = String(currentVersion ?? '').trim().replace(/^v/i, '');
    if (!latest || !current || !isNewerAppVersion(latest, current)) return null;
    // Нет установщика под текущую ОС — обновление не предлагаем
    if (!releaseHasInstallAsset(data)) {
      logger.warn('update', `checkForUpdate: no ${getUpdateAssetLabel()} in v${latest}`);
      return null;
    }
    return {
      version: latest,
      url: data.html_url ?? 'https://github.com/Anixapp-Community/anixapp/releases',
      body: typeof data.body === 'string' ? data.body : null,
    };
  } catch (err) {
    logger.warn('update', `checkForUpdate: ${err?.message ?? err}`);
    return null;
  }
});

/** Список релизов GitHub для выбора версии (stable = без prerelease). */
ipcMain.handle('app:listAppReleases', async (_, currentVersion, channel, force) => {
  try {
    const current = String(currentVersion ?? app.getVersion() ?? '').replace(/^v/i, '').trim();
    const wantBeta = String(channel || 'stable').toLowerCase() === 'beta';
    const platformLabel = getPlatformLabel();
    const rows = await fetchGitHubReleasesPage(1, 40, { force: !!force });
    return rows
      .map((data) => {
        const version = normalizeReleaseVersion(data);
        if (!version) return null;
        const prerelease = looksPrereleaseVersion(version, !!data.prerelease);
        if (wantBeta ? !prerelease : prerelease) return null;
        const asset = pickInstallAsset(data);
        const hasAsset = !!asset?.browser_download_url;
        return {
          version,
          tag: String(data.tag_name ?? `v${version}`),
          name: typeof data.name === 'string' ? data.name : version,
          publishedAt: typeof data.published_at === 'string' ? data.published_at : null,
          prerelease,
          draft: !!data.draft,
          url: data.html_url ?? 'https://github.com/Anixapp-Community/anixapp/releases',
          hasAsset,
          platformLabel,
          assetLabel: getUpdateAssetLabel(),
          channel: wantBeta ? 'beta' : 'stable',
          source: 'github',
          downloadUrl: hasAsset ? asset.browser_download_url : null,
          isCurrent: version === current,
          isNewer: current ? isNewerAppVersion(version, current) : false,
          isOlder: current ? isNewerAppVersion(current, version) : false,
        };
      })
      .filter((r) => r && !r.draft);
  } catch (err) {
    logger.warn('update', `listAppReleases: ${err?.message ?? err}`);
    throw err;
  }
});

async function fetchInstallerUrl(versionOrNull) {
  const data = versionOrNull
    ? await fetchGitHubReleaseByTag(versionOrNull)
    : await fetchLatestGitHubRelease();
  return pickInstallAssetUrl(data);
}

function sanitizeInstallerBaseName(name) {
  const base = path.basename(String(name || '').replace(/\\/g, '/'))
    .replace(/[<>:"|?*\u0000-\u001f]/g, '_')
    .trim();
  if (!base || base === '.' || base === '..') return '';
  return base;
}

function installerExtensionOk(name) {
  return /\.(exe|msi|dmg|AppImage|deb|rpm|pacman|flatpak|pkg\.tar\.zst)$/i.test(name);
}

function parseContentDispositionFileName(header) {
  const value = String(header || '');
  const star = value.match(/filename\*\s*=\s*(?:UTF-8|utf-8)?''([^;]+)/i);
  if (star?.[1]) {
    try {
      return sanitizeInstallerBaseName(decodeURIComponent(star[1].trim().replace(/^"|"$/g, '')));
    } catch {
      /* ignore malformed filename* */
    }
  }
  const quoted = value.match(/filename\s*=\s*"([^"]+)"/i);
  if (quoted?.[1]) return sanitizeInstallerBaseName(quoted[1]);
  const plain = value.match(/filename\s*=\s*([^;]+)/i);
  if (plain?.[1]) return sanitizeInstallerBaseName(plain[1].trim().replace(/^"|"$/g, ''));
  return '';
}

function fallbackInstallerName(versionOrNull) {
  const ver = String(versionOrNull || '').replace(/^v/i, '').replace(/[^\w.\-]+/g, '');
  if (process.platform === 'darwin') return ver ? `AnixApp-${ver}.dmg` : 'AnixApp.dmg';
  if (process.platform === 'linux') return ver ? `AnixApp-${ver}.AppImage` : 'AnixApp.AppImage';
  return ver ? `AnixApp-Setup-${ver}.exe` : 'AnixApp-Setup.exe';
}

/**
 * Beta downloads live at `.../beta/:id/download`. URL basename is `download`,
 * which Windows cannot spawn. Prefer Content-Disposition, then an explicit name.
 */
function chooseInstallerFileName({ downloadUrl, contentDisposition, versionOrNull, fileNameHint }) {
  const candidates = [
    parseContentDispositionFileName(contentDisposition),
    sanitizeInstallerBaseName(fileNameHint),
    sanitizeInstallerBaseName(path.basename(String(downloadUrl || '').split('?')[0] || '')),
  ];
  for (const name of candidates) {
    if (name && installerExtensionOk(name)) return name;
  }
  return fallbackInstallerName(versionOrNull);
}

async function downloadInstaller(versionOrNull, downloadUrlOverride, fileNameHint) {
  const https = require('https');
  const http = require('http');

  let file = null;
  let destPath = null;

  try {
    state.updateDownloadState = { state: 'downloading', received: 0, total: 0 };
    sendUpdateProgress({ targetVersion: versionOrNull ? String(versionOrNull).replace(/^v/i, '') : null });

    const downloadUrl = downloadUrlOverride
      ? String(downloadUrlOverride)
      : await fetchInstallerUrl(versionOrNull || null);
    const updatesDir = path.join(app.getPath('userData'), 'updates');
    if (!fs.existsSync(updatesDir)) fs.mkdirSync(updatesDir, { recursive: true });

    await new Promise((resolve, reject) => {
      const maxRedirects = 5;
      function doRequest(url, redirectsLeft) {
        const lib = String(url).startsWith('http://') ? http : https;
        const req = lib.get(
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

            const fileName = chooseInstallerFileName({
              downloadUrl: url,
              contentDisposition: res.headers['content-disposition'],
              versionOrNull,
              fileNameHint,
            });
            destPath = path.join(updatesDir, fileName);
            try {
              if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
            } catch (_) {}

            file = fs.createWriteStream(destPath);
            // Surface WriteStream errors — unhandled 'error' on a stream crashes the process
            file.on('error', (err) => {
              reject(new Error(`File write error: ${err.message}`));
            });

            const total = parseInt(res.headers['content-length'] || '0', 10) || 0;
            state.updateDownloadState.total = total;

            // Propagate response stream errors
            res.on('error', (err) => reject(new Error(`Response stream error: ${err.message}`)));

            res.on('data', (chunk) => {
              // file.write() can return false (backpressure) but never throws synchronously;
              // errors are emitted on the 'error' event above.
              file.write(chunk);
              state.updateDownloadState.received += chunk.length;
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

    state.pendingInstallerPath = destPath;
    state.updateDownloadState.state = 'ready';
    sendUpdateProgress({
      targetVersion: versionOrNull ? String(versionOrNull).replace(/^v/i, '') : null,
    });
  } catch (e) {
    console.error('Updater download error', e);
    state.updateDownloadState = { state: 'error', received: 0, total: 0 };
    sendUpdateProgress({ errorMessage: String(e) });

    // Clean up partial file
    if (file) { try { file.destroy(); } catch (_) {} }
    if (destPath) { try { if (fs.existsSync(destPath)) fs.unlinkSync(destPath); } catch (_) {} }
    state.pendingInstallerPath = null;
  }
}

ipcMain.handle('app:startUpdateDownload', async (_, versionOrOpts, maybeUrl) => {
  if (state.updateDownloadState.state === 'downloading') return;
  let target = null;
  let downloadUrl = null;
  let fileNameHint = null;
  if (versionOrOpts && typeof versionOrOpts === 'object') {
    target = versionOrOpts.version != null ? String(versionOrOpts.version).trim() : null;
    downloadUrl = versionOrOpts.downloadUrl != null ? String(versionOrOpts.downloadUrl).trim() : null;
    fileNameHint = versionOrOpts.fileName != null ? String(versionOrOpts.fileName).trim() : null;
  } else {
    target = versionOrOpts != null && String(versionOrOpts).trim() ? String(versionOrOpts).trim() : null;
    downloadUrl = maybeUrl != null && String(maybeUrl).trim() ? String(maybeUrl).trim() : null;
  }
  // downloadInstaller is a floating promise — catch here so unhandled rejection never crashes main.
  downloadInstaller(target, downloadUrl, fileNameHint).catch((e) => {
    console.error('Updater unexpected error', e);
    state.updateDownloadState = { state: 'error', received: 0, total: 0 };
    sendUpdateProgress({ errorMessage: String(e) });
  });
});

/** Возвращает тип установки для рендерера (используется для подписей кнопок). */
ipcMain.handle('app:getLinuxInstallType', () => getLinuxInstallType());

function spawnDetached(exePath, args) {
  const { spawn } = require('child_process');
  return new Promise((resolve, reject) => {
    const child = spawn(exePath, args, { detached: true, stdio: 'ignore', shell: false });
    child.once('error', reject);
    child.once('spawn', () => {
      child.unref();
      resolve();
    });
  });
}

ipcMain.handle('app:installUpdate', async () => {
  const { spawn } = require('child_process');
  if (!state.pendingInstallerPath || !fs.existsSync(state.pendingInstallerPath)) {
    sendUpdateProgress({ state: 'error', errorMessage: 'Файл установщика не найден. Скачайте сборку ещё раз.' });
    return;
  }

  try {
    // ── Windows ──────────────────────────────────────────────────────────
    if (process.platform === 'win32') {
      let exePath = state.pendingInstallerPath;
      // A file saved from `.../download` has no extension. CreateProcess returns ENOENT.
      if (!/\.exe$/i.test(exePath)) {
        const next = `${exePath}.exe`;
        fs.copyFileSync(exePath, next);
        exePath = next;
        state.pendingInstallerPath = next;
      }
      await spawnDetached(exePath, []);
      state.isQuitting = true;
      app.quit();
      return;
    }

    // ── macOS: открываем .dmg — пользователь перетаскивает AnixApp в «Программы» ──
    if (process.platform === 'darwin') {
      const err = await shell.openPath(state.pendingInstallerPath);
      if (err) {
        sendUpdateProgress({ state: 'error', errorMessage: `Не удалось открыть образ: ${err}` });
        return;
      }
      // Запущенное приложение нельзя заменить в «Программах» — закрываемся
      state.isQuitting = true;
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
        fs.chmodSync(state.pendingInstallerPath, 0o755);
        fs.copyFileSync(state.pendingInstallerPath, currentPath);
        const child = spawn(currentPath, [], { detached: true, stdio: 'ignore' });
        child.unref();
        state.isQuitting = true;
        app.quit();
        return;
      }

      // ── Arch / AUR: pkexec pacman -U (polkit диалог авторизации) ──────
      if (installType === 'pacman') {
        // Не detach — ждём пока пользователь введёт пароль и pkexec завершится.
        // Только после успешного выхода (code === 0) закрываем приложение.
        sendUpdateProgress({ state: 'installing' });
        const child = spawn('pkexec', ['pacman', '-U', '--noconfirm', state.pendingInstallerPath], {
          detached: false,
          stdio: 'ignore',
        });
        child.on('exit', (code) => {
          if (code === 0) {
            state.isQuitting = true;
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
          const child = spawn('pkexec', ['dpkg', '-i', state.pendingInstallerPath], {
            detached: false,
            stdio: 'ignore',
          });
          child.on('exit', (code) => {
            if (code === 0) {
              state.isQuitting = true;
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
          const err = await electronShell.openPath(state.pendingInstallerPath);
          if (err) {
            sendUpdateProgress({ state: 'error', errorMessage: `Не удалось открыть установщик: ${err}` });
            return;
          }
          // software center сам управляет установкой — просто закрываемся
          state.isQuitting = true;
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
            state.isQuitting = true;
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
}

module.exports = { register };
