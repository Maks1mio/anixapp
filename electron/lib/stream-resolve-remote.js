'use strict';

/**
 * Resolve embed → direct URL via AnixBack (server-side Kodik/Sibnet/…).
 * Falls back to local resolver when anixback is unreachable.
 */

const config = require('./config-store');

const ANIXBACK_LOCAL_ORIGIN = 'http://localhost:8787';
const ANIXBACK_PROD_ORIGIN = 'https://api.anixapp.com';
const RESOLVE_TIMEOUT_MS = 28_000;

function isDev() {
  return process.env.NODE_ENV === 'development' || !!process.env.ELECTRON_START_URL;
}

function getAnixbackOrigin() {
  const raw = config.getRawConfig();
  const mode = raw.anixbackEndpoint;
  if (mode === 'local') return ANIXBACK_LOCAL_ORIGIN;
  if (mode === 'prod') return ANIXBACK_PROD_ORIGIN;
  return isDev() ? ANIXBACK_LOCAL_ORIGIN : ANIXBACK_PROD_ORIGIN;
}

/**
 * @param {string} embedUrl
 * @returns {Promise<{
 *   directUrl: string | null,
 *   quality: string | null,
 *   qualityMap: Record<string, string>,
 *   downloadHeaders: Record<string, string>,
 *   skip: unknown,
 *   error?: string | null,
 * } | null>}
 */
async function resolveViaAnixback(embedUrl) {
  const url = String(embedUrl || '').trim();
  if (!url) return null;

  const origin = getAnixbackOrigin();
  const endpoint = `${origin}/api/stream/resolve`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), RESOLVE_TIMEOUT_MS);

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ embedUrl: url }),
      signal: ctrl.signal,
    });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json || json.ok === false) {
      const code = json?.code || '';
      // Permanent Libria miss — don't fall back to local scrape of the same 404.
      if (code === 'libria-release-missing' || /удал[её]н|недоступен на AniLibria/i.test(String(json?.error || ''))) {
        return {
          directUrl: null,
          quality: null,
          qualityMap: {},
          downloadHeaders: {},
          skip: null,
          error: 'libria-release-missing',
        };
      }
      const err = json?.error || `HTTP ${res.status}`;
      throw new Error(err);
    }
    if (!json.directUrl) return null;
    return {
      directUrl: String(json.directUrl),
      quality: json.quality ?? null,
      qualityMap: json.qualityMap && typeof json.qualityMap === 'object' ? json.qualityMap : {},
      downloadHeaders:
        json.downloadHeaders && typeof json.downloadHeaders === 'object'
          ? json.downloadHeaders
          : {},
      skip: json.skip ?? null,
      error: null,
    };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = {
  getAnixbackOrigin,
  resolveViaAnixback,
};
