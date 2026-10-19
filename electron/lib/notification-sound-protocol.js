'use strict';

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { net, protocol } = require('electron');
const { isPathInside } = require('./safe-path');

const SOUND_NAME_RE = /^[a-z0-9][a-z0-9._-]*\.wav$/i;

function getSoundsDir(electronDir) {
  return path.join(electronDir, 'assets', 'sounds');
}

/** URL для рендерера: один каталог electron/assets/sounds. */
function soundAssetUrl(fileName) {
  const base = path.basename(String(fileName || ''));
  if (!SOUND_NAME_RE.test(base)) return null;
  return `anix-sound://local/${encodeURIComponent(base)}`;
}

function registerNotificationSoundScheme() {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: 'anix-sound',
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
        stream: true,
        bypassCSP: true,
      },
    },
  ]);
}

/**
 * @param {string} electronDir
 * @param {{ error?: (tag: string, msg: string) => void } | null} logger
 */
function setupNotificationSoundProtocol(electronDir, logger) {
  const soundsDir = path.resolve(getSoundsDir(electronDir));

  protocol.handle('anix-sound', async (request) => {
    try {
      const reqUrl = new URL(request.url);
      const name = path.basename(decodeURIComponent(reqUrl.pathname || ''));
      if (!SOUND_NAME_RE.test(name)) {
        return new Response('Bad Request', { status: 400 });
      }
      const filePath = path.resolve(soundsDir, name);
      if (!isPathInside(soundsDir, filePath) || !fs.existsSync(filePath)) {
        return new Response('Not Found', { status: 404 });
      }
      const res = await net.fetch(pathToFileURL(filePath).href);
      const headers = new Headers(res.headers);
      headers.set('Content-Type', 'audio/wav');
      return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
    } catch (err) {
      if (logger) logger.error('anix-sound', err?.message ?? err);
      return new Response('Internal Error', { status: 500 });
    }
  });
}

module.exports = {
  getSoundsDir,
  soundAssetUrl,
  registerNotificationSoundScheme,
  setupNotificationSoundProtocol,
};
