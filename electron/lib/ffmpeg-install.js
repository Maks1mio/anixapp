'use strict';

/**
 * Поиск / установка FFmpeg для быстрой сборки HLS.
 * Без FFmpeg зашифрованные потоки и надёжный remux недоступны.
 */

const fs = require('fs');
const path = require('path');
const { spawn, execFile } = require('child_process');
const { promisify } = require('util');
const https = require('https');
const http = require('http');
const { app, shell } = require('electron');

const execFileAsync = promisify(execFile);

const GYAN_ESSENTIALS_PAGE = 'https://www.gyan.dev/ffmpeg/builds/';
const GYAN_ESSENTIALS_ZIP = 'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip';

function toolsDir() {
  return path.join(app.getPath('userData'), 'tools', 'ffmpeg');
}

function findFfmpegBinary(root) {
  if (!root || !fs.existsSync(root)) return null;
  const preferred = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const ent of entries) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) stack.push(full);
      else if (ent.isFile() && ent.name.toLowerCase() === preferred.toLowerCase()) {
        return full;
      }
    }
  }
  return null;
}

async function resolveSystemFfmpeg() {
  const tryCmd = process.platform === 'win32' ? 'where ffmpeg' : 'which ffmpeg';
  try {
    const { stdout } = await execFileAsync(tryCmd, { shell: true });
    const line = stdout.trim().split(/\r?\n/).map((s) => s.trim()).find(Boolean);
    if (line && fs.existsSync(line)) return line;
  } catch (_) {}
  return null;
}

async function resolveBundledFfmpeg() {
  try {
    const bundled = require('ffmpeg-static');
    if (typeof bundled === 'string' && fs.existsSync(bundled)) return bundled;
  } catch (_) {}
  return null;
}

async function getFfmpegStatus(cacheRef) {
  if (cacheRef && cacheRef.value !== undefined) {
    const p = cacheRef.value;
    return {
      available: !!p,
      path: p,
      source: p ? (cacheRef.source || 'cached') : 'missing',
      installDir: toolsDir(),
      downloadPage: GYAN_ESSENTIALS_PAGE,
    };
  }

  const portable = findFfmpegBinary(toolsDir());
  if (portable) {
    if (cacheRef) { cacheRef.value = portable; cacheRef.source = 'portable'; }
    return { available: true, path: portable, source: 'portable', installDir: toolsDir(), downloadPage: GYAN_ESSENTIALS_PAGE };
  }

  const bundled = await resolveBundledFfmpeg();
  if (bundled) {
    if (cacheRef) { cacheRef.value = bundled; cacheRef.source = 'bundled'; }
    return { available: true, path: bundled, source: 'bundled', installDir: toolsDir(), downloadPage: GYAN_ESSENTIALS_PAGE };
  }

  const system = await resolveSystemFfmpeg();
  if (system) {
    if (cacheRef) { cacheRef.value = system; cacheRef.source = 'system'; }
    return { available: true, path: system, source: 'system', installDir: toolsDir(), downloadPage: GYAN_ESSENTIALS_PAGE };
  }

  if (cacheRef) { cacheRef.value = null; cacheRef.source = 'missing'; }
  return { available: false, path: null, source: 'missing', installDir: toolsDir(), downloadPage: GYAN_ESSENTIALS_PAGE };
}

function downloadFile(url, destPath, onProgress) {
  return new Promise((resolve, reject) => {
    const follow = (target, left) => {
      const lib = target.startsWith('https') ? https : http;
      const req = lib.get(target, { headers: { 'User-Agent': 'AnixApp/ffmpeg-installer' } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          if (left <= 0) { reject(new Error('Слишком много редиректов при скачивании FFmpeg')); return; }
          follow(res.headers.location.startsWith('http') ? res.headers.location : new URL(res.headers.location, target).href, left - 1);
          return;
        }
        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`Не удалось скачать FFmpeg (HTTP ${res.statusCode})`));
          res.resume();
          return;
        }
        const total = parseInt(res.headers['content-length'] || '0', 10) || 0;
        let received = 0;
        fs.mkdirSync(path.dirname(destPath), { recursive: true });
        const ws = fs.createWriteStream(destPath);
        res.on('data', (chunk) => {
          received += chunk.length;
          if (onProgress) onProgress(received, total);
        });
        res.pipe(ws);
        ws.on('finish', () => resolve({ received, total }));
        ws.on('error', reject);
        res.on('error', reject);
      });
      req.on('error', reject);
    };
    follow(url, 8);
  });
}

async function extractZipWindows(zipPath, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  await execFileAsync('powershell.exe', [
    '-NoProfile', '-NonInteractive', '-Command',
    `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${destDir.replace(/'/g, "''")}' -Force`,
  ], { windowsHide: true, timeout: 120_000 });
}

/**
 * Скачивает portable FFmpeg (Windows essentials) в userData.
 * На других ОС открывает страницу установки.
 */
async function installFfmpeg(cacheRef, onProgress) {
  if (process.platform !== 'win32') {
    await shell.openExternal(GYAN_ESSENTIALS_PAGE);
    return {
      ok: false,
      openedPage: true,
      error: 'Автоустановка FFmpeg сейчас доступна только на Windows. Открыта страница загрузки — установите FFmpeg и добавьте в PATH.',
    };
  }

  const dir = toolsDir();
  fs.mkdirSync(dir, { recursive: true });
  const zipPath = path.join(dir, 'ffmpeg-essentials.zip');

  try {
    await downloadFile(GYAN_ESSENTIALS_ZIP, zipPath, onProgress);
    await extractZipWindows(zipPath, dir);
    try { fs.unlinkSync(zipPath); } catch (_) {}

    const bin = findFfmpegBinary(dir);
    if (!bin) {
      return { ok: false, error: 'Архив скачан, но ffmpeg.exe не найден. Откройте папку tools/ffmpeg и проверьте содержимое.' };
    }
    if (cacheRef) { cacheRef.value = bin; cacheRef.source = 'portable'; }
    return { ok: true, path: bin, source: 'portable' };
  } catch (err) {
    await shell.openExternal(GYAN_ESSENTIALS_PAGE).catch(() => {});
    return {
      ok: false,
      openedPage: true,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function openFfmpegDownloadPage() {
  return shell.openExternal(GYAN_ESSENTIALS_PAGE);
}

module.exports = {
  getFfmpegStatus,
  installFfmpeg,
  openFfmpegDownloadPage,
  toolsDir,
  GYAN_ESSENTIALS_PAGE,
};
