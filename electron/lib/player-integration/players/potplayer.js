'use strict';

const { findPlayerExecutable } = require('../detect');
const { writeTempM3uPlaylist } = require('../../external-playlist');

/** @type {import('../types').ExternalPlayerInfo} */
const info = {
  id: 'potplayer',
  label: 'PotPlayer',
  description: 'Daum PotPlayer — плейлист .m3u с подписями серий.',
};

function detect() {
  const exePath = findPlayerExecutable('potplayer');
  if (!exePath) return null;
  return { ...info, path: exePath };
}

/**
 * PotPlayer: путь к .m3u (или URL). Стартовая серия — ротацией списка.
 * @param {import('../types').LaunchMedia} media
 * @returns {{ args: string[] }}
 */
function buildLaunchArgs(media) {
  const referer = media.referer || '';
  const userAgent = media.userAgent || '';
  const playlist = Array.isArray(media.playlist) ? media.playlist : [];
  const entries = playlist
    .map((e) => ({ title: String(e?.title || '').trim() || 'Серия', url: String(e?.url || '').trim() }))
    .filter((e) => /^https?:\/\//i.test(e.url));

  if (entries.length > 1) {
    let startIndex = Number.isFinite(media.startIndex) ? Math.max(0, media.startIndex) : 0;
    if (startIndex >= entries.length) startIndex = 0;
    if (media.url) {
      const byUrl = entries.findIndex((e) => e.url === media.url);
      if (byUrl >= 0) startIndex = byUrl;
    }
    const ordered = entries.slice(startIndex).concat(entries.slice(0, startIndex));
    const file = writeTempM3uPlaylist(ordered, {
      referer,
      userAgent,
      prefix: 'anixapp-episodes',
    });
    return { args: [file] };
  }

  const url = entries[0]?.url || media.url;
  if (!url || !/^https?:\/\//i.test(url)) {
    const err = new Error('invalid-url');
    err.code = 'invalid-url';
    throw err;
  }
  const file = writeTempM3uPlaylist(
    [{ title: media.title || 'Серия', url }],
    { referer, userAgent, prefix: 'anixapp-single' },
  );
  return { args: [file] };
}

module.exports = { info, detect, buildLaunchArgs };
