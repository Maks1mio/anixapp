'use strict';

const { rememberCookies } = require('./playback-cookies');

/** Локальный порт для расширения FetchAApp (только 127.0.0.1). */
const FETCHAAPP_PORT = 17321;

/** @type {{ host: string, referer: string, videoUrl: string }} */
let context = { host: '', referer: '', videoUrl: '' };

function sanitizeHttpUrl(raw) {
  if (!raw || typeof raw !== 'string') return '';
  let s = raw.trim();
  if (s.startsWith('//')) s = `https:${s}`;
  let u;
  try { u = new URL(s); } catch { return ''; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
  return u.href;
}

function setExternalPlayContext({ videoUrl, referer, cookies } = {}) {
  let host = '';
  try { host = new URL(videoUrl).hostname.replace(/^www\./, '').toLowerCase(); } catch { /* ignore */ }
  context = {
    host,
    referer: sanitizeHttpUrl(referer) || '',
    videoUrl: videoUrl || '',
  };
  if (cookies && videoUrl) rememberCookies(videoUrl, cookies);
}

function getExternalPlayContext() {
  return context;
}

function parsePlayPayload(input) {
  const url = sanitizeHttpUrl(input?.url || input?.externalUrl);
  if (!url) return null;
  return {
    type: 'play',
    url,
    title: String(input?.title || '').slice(0, 200),
    referer: sanitizeHttpUrl(input?.referer) || '',
    pageUrl: sanitizeHttpUrl(input?.pageUrl) || '',
    cookies: String(input?.cookies || '').slice(0, 8000),
  };
}

module.exports = {
  FETCHAAPP_PORT,
  sanitizeHttpUrl,
  setExternalPlayContext,
  getExternalPlayContext,
  parsePlayPayload,
};
