'use strict';

const { findPlayerExecutable } = require('../detect');

/** @type {import('../types').ExternalPlayerInfo} */
const info = {
  id: 'quicktime',
  label: 'QuickTime Player',
  description: 'QuickTime (macOS) — только текущая серия, без плейлиста.',
};

const BUNDLE_ID = 'com.apple.QuickTimePlayerX';

function detect() {
  if (process.platform !== 'darwin') return null;
  const exePath = findPlayerExecutable('quicktime');
  if (!exePath) return null;
  return { ...info, path: exePath };
}

/**
 * У QuickTime нет CLI и плейлистов .m3u: открываем ссылку на текущую серию
 * через `open -b`. Referer/User-Agent передать нельзя.
 * @param {import('../types').LaunchMedia} media
 * @returns {{ args: string[], executable: string }}
 */
function buildLaunchArgs(media) {
  const playlist = Array.isArray(media.playlist) ? media.playlist : [];
  const urls = playlist
    .map((e) => String(e?.url || '').trim())
    .filter((u) => /^https?:\/\//i.test(u));
  let startIndex = Number.isFinite(media.startIndex) ? Math.max(0, media.startIndex) : 0;
  if (startIndex >= urls.length) startIndex = 0;

  const url = /^https?:\/\//i.test(media.url || '') ? media.url : urls[startIndex];
  if (!url) {
    const err = new Error('invalid-url');
    err.code = 'invalid-url';
    throw err;
  }
  return { executable: '/usr/bin/open', args: ['-b', BUNDLE_ID, url] };
}

module.exports = { info, detect, buildLaunchArgs };
