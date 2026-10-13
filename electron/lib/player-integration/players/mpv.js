'use strict';

const { findPlayerExecutable } = require('../detect');
const { writeTempM3uPlaylist } = require('../../external-playlist');

/** @type {import('../types').ExternalPlayerInfo} */
const info = {
  id: 'mpv',
  label: 'mpv',
  description: 'mpv — быстрый плейлист с referer/user-agent.',
};

function detect() {
  const exePath = findPlayerExecutable('mpv');
  if (!exePath) return null;
  return { ...info, path: exePath };
}

/**
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
    const file = writeTempM3uPlaylist(entries, {
      referer,
      userAgent,
      prefix: 'anixapp-episodes',
    });
    return {
      args: [
        ...(referer ? [`--referrer=${referer}`] : []),
        ...(userAgent ? [`--user-agent=${userAgent}`] : []),
        `--playlist=${file}`,
        `--playlist-start=${startIndex}`,
      ],
    };
  }

  const url = entries[0]?.url || media.url;
  if (!url || !/^https?:\/\//i.test(url)) {
    const err = new Error('invalid-url');
    err.code = 'invalid-url';
    throw err;
  }
  const args = [];
  if (referer) args.push(`--referrer=${referer}`);
  if (userAgent) args.push(`--user-agent=${userAgent}`);
  if (media.title) args.push(`--force-media-title=${media.title}`);
  args.push(url);
  return { args };
}

module.exports = { info, detect, buildLaunchArgs };
