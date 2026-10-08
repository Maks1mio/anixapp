'use strict';

const fs = require('fs');
const path = require('path');
const { app } = require('electron');

function sanitizeExtinfTitle(title) {
  return String(title || 'Серия')
    .replace(/[\r\n]+/g, ' ')
    .replace(/,/g, ' ')
    .trim()
    .slice(0, 180) || 'Серия';
}

/**
 * @param {Array<{ title: string, url: string }>} entries
 * @param {{ referer?: string, userAgent?: string }} [opts]
 */
function buildM3uPlaylist(entries, opts = {}) {
  const lines = ['#EXTM3U'];
  for (const entry of entries) {
    const url = String(entry?.url || '').trim();
    if (!/^https?:\/\//i.test(url)) continue;
    if (opts.referer) lines.push(`#EXTVLCOPT:http-referrer=${opts.referer}`);
    if (opts.userAgent) lines.push(`#EXTVLCOPT:http-user-agent=${opts.userAgent}`);
    lines.push(`#EXTINF:-1,${sanitizeExtinfTitle(entry.title)}`);
    lines.push(url);
  }
  lines.push('');
  return lines.join('\n');
}

/**
 * Пишет временный .m3u и возвращает путь.
 * @param {Array<{ title: string, url: string }>} entries
 * @param {{ referer?: string, userAgent?: string, prefix?: string }} [opts]
 */
function writeTempM3uPlaylist(entries, opts = {}) {
  const body = buildM3uPlaylist(entries, opts);
  if (!body.includes('http')) throw new Error('empty-playlist');
  const dir = app.getPath('temp');
  const file = path.join(dir, `${opts.prefix || 'anixapp-playlist'}-${Date.now()}.m3u`);
  fs.writeFileSync(file, body, 'utf8');
  return file;
}

function episodePlaylistTitle(releaseTitle, position, episodeName) {
  const base = String(releaseTitle || '').trim() || 'AnixApp';
  const ep = Number(position);
  const epLabel = Number.isFinite(ep) ? `${ep} серия` : 'серия';
  const name = String(episodeName || '').trim();
  if (name && name !== epLabel && !/^\d+$/.test(name)) {
    return `${base} — ${epLabel} (${name})`;
  }
  return `${base} — ${epLabel}`;
}

module.exports = {
  buildM3uPlaylist,
  writeTempM3uPlaylist,
  episodePlaylistTitle,
  sanitizeExtinfTitle,
};
