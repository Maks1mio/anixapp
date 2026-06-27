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
    state.updateDownloadState = { state: 'downloading', received: 0, total: 0 };
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
    sendUpdateProgress();
  } catch (e) {
    console.error('Updater download error', e);
    state.updateDownloadState = { state: 'error', received: 0, total: 0 };
    sendUpdateProgress({ errorMessage: String(e) });

    // Clean up partial file
    if (file) { try { file.destroy(); } catch (_) {} }
    if (destPath) { try { if (fs.existsSync(destPath)) fs.unlinkSync(destPath); } catch (_) {} }
  }
}

ipcMain.handle('app:startUpdateDownload', async () => {
  if (state.updateDownloadState.state === 'downloading') return;
  // downloadInstaller is a floating promise — catch here so unhandled rejection never crashes main.
  downloadInstaller().catch((e) => {
    console.error('Updater unexpected error', e);
    state.updateDownloadState = { state: 'error', received: 0, total: 0 };
    sendUpdateProgress({ errorMessage: String(e) });
  });
});

/** Возвращает тип установки для рендерера (используется для подписей кнопок). */
ipcMain.handle('app:getLinuxInstallType', () => getLinuxInstallType());

ipcMain.handle('app:installUpdate', async () => {
  const { spawn } = require('child_process');
  if (!state.pendingInstallerPath || !fs.existsSync(state.pendingInstallerPath)) return;

  try {
    // ── Windows ──────────────────────────────────────────────────────────
    if (process.platform === 'win32') {
      const child = spawn(state.pendingInstallerPath, [], { detached: true, stdio: 'ignore', shell: false });
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
        fs.chmodSync(state.pendingInstallerPath, 0o755);
        fs.copyFileSync(state.pendingInstallerPath, currentPath);
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
        const child = spawn('pkexec', ['pacman', '-U', '--noconfirm', state.pendingInstallerPath], {
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
          const child = spawn('pkexec', ['dpkg', '-i', state.pendingInstallerPath], {
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
          const err = await electronShell.openPath(state.pendingInstallerPath);
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
}

module.exports = { register };
