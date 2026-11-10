'use strict';

const { pathToFileURL } = require('url');
const { findPlayerExecutable } = require('../detect');
const { writeTempM3uPlaylist } = require('../../external-playlist');

/** @type {import('../types').ExternalPlayerInfo} */
const info = {
  id: 'iina',
  label: 'IINA',
  description: 'IINA (macOS) — плейлист .m3u с подписями серий.',
  platforms: ['darwin'],
  playlist: true,
  downloadUrl: 'https://iina.io/',
};

function detect() {
  if (process.platform !== 'darwin') return null;
  const exePath = findPlayerExecutable('iina');
  if (!exePath) return null;
  return { ...info, path: exePath };
}

/**
 * Схема iina://open открывает файл в уже запущенной IINA; iina-cli на каждый
 * вызов поднимает отдельный процесс. Опции mpv передаются параметрами mpv_*.
 * Кодируем через encodeURIComponent: IINA не превращает «+» обратно в пробел,
 * а в User-Agent пробелы есть.
 * @param {Record<string, string>} params
 * @returns {string}
 */
function buildIinaUrl(params) {
  const query = Object.entries(params)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&');
  return `iina://open?${query}`;
}

/**
 * Стартовая серия — ротацией списка: mpv_playlist-start через iina:// не применяется.
 * @param {import('../types').LaunchMedia} media
 * @returns {{ args: string[], executable: string }}
 */
function buildLaunchArgs(media) {
  const referer = media.referer || '';
  const userAgent = media.userAgent || '';
  const playlist = Array.isArray(media.playlist) ? media.playlist : [];
  const entries = playlist
    .map((e) => ({ title: String(e?.title || '').trim() || 'Серия', url: String(e?.url || '').trim() }))
    .filter((e) => /^https?:\/\//i.test(e.url));

  let ordered;
  if (entries.length > 1) {
    let startIndex = Number.isFinite(media.startIndex) ? Math.max(0, media.startIndex) : 0;
    if (startIndex >= entries.length) startIndex = 0;
    if (media.url) {
      const byUrl = entries.findIndex((e) => e.url === media.url);
      if (byUrl >= 0) startIndex = byUrl;
    }
    ordered = entries.slice(startIndex).concat(entries.slice(0, startIndex));
  } else {
    const url = entries[0]?.url || media.url;
    if (!url || !/^https?:\/\//i.test(url)) {
      const err = new Error('invalid-url');
      err.code = 'invalid-url';
      throw err;
    }
    ordered = [{ title: media.title || 'Серия', url }];
  }

  const file = writeTempM3uPlaylist(ordered, {
    referer,
    userAgent,
    prefix: ordered.length > 1 ? 'anixapp-episodes' : 'anixapp-single',
  });
  const url = buildIinaUrl({
    url: pathToFileURL(file).href,
    mpv_referrer: referer,
    'mpv_user-agent': userAgent,
    // Ссылки уже прямые; встроенный в IINA youtube-dl только задерживает старт.
    mpv_ytdl: 'no',
  });
  return { executable: '/usr/bin/open', args: [url] };
}

module.exports = { info, detect, buildLaunchArgs, buildIinaUrl };
