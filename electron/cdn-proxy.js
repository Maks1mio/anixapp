'use strict';

const { protocol } = require('electron');

const ANIXART_SITE_ORIGIN = 'https://anixart.tv';
const ANIXART_SITE_REFERER = `${ANIXART_SITE_ORIGIN}/`;
const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

const ANIXART_CDN_HOSTS = ['anixmirai.com', 'anixart.tv', 'anixsekai.com'];

const CACHE_MAX = 256;
const CACHE_TTL_MS = 60 * 60 * 1000;
/** @type {Map<string, { buffer: Buffer, mimeType: string, ts: number }>} */
const cache = new Map();

function hostMatchesList(host, list) {
  return list.some((h) => host === h || host.endsWith('.' + h));
}

function isAnixartCdnUrl(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    return hostMatchesList(host, ANIXART_CDN_HOSTS);
  } catch {
    return false;
  }
}

function buildMirrorUrl(url) {
  try {
    const parsed = new URL(url);
    const parts = parsed.hostname.split('.');
    parsed.hostname = parts.length > 2
      ? `mirror-${parts[0]}.${parts.slice(1).join('.')}`
      : `mirror.${parsed.hostname}`;
    return parsed.toString();
  } catch {
    return url;
  }
}

function guessMime(url) {
  const lower = url.toLowerCase();
  if (lower.endsWith('.json')) return 'application/json';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.svg')) return 'image/svg+xml';
  return 'image/jpeg';
}

function trimCache() {
  while (cache.size > CACHE_MAX) {
    const first = cache.keys().next().value;
    if (first == null) break;
    cache.delete(first);
  }
}

async function fetchCdnAsset(url) {
  const cached = cache.get(url);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return cached;
  }

  const headers = {
    Referer: ANIXART_SITE_REFERER,
    Origin: ANIXART_SITE_ORIGIN,
    'User-Agent': BROWSER_UA,
    Accept: 'application/json,text/json,image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
    'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
  };

  let response = await fetch(url, { headers, redirect: 'follow' });
  if (!response.ok) {
    const mirror = buildMirrorUrl(url);
    if (mirror !== url) {
      response = await fetch(mirror, { headers, redirect: 'follow' });
    }
  }
  if (!response.ok) {
    throw new Error(`CDN HTTP ${response.status} for ${url}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const mimeType = response.headers.get('content-type')?.split(';')[0]?.trim() || guessMime(url);
  const entry = { buffer, mimeType, ts: Date.now() };
  cache.set(url, entry);
  trimCache();
  return entry;
}

function registerCdnScheme() {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: 'anix-cdn',
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
        stream: true,
      },
    },
  ]);
}

function setupCdnProtocol(logger) {
  protocol.handle('anix-cdn', async (request) => {
    try {
      const reqUrl = new URL(request.url);
      const target = reqUrl.searchParams.get('u');
      if (!target || !isAnixartCdnUrl(target)) {
        return new Response('Forbidden', { status: 403 });
      }
      const { buffer, mimeType } = await fetchCdnAsset(target);
      return new Response(buffer, {
        status: 200,
        headers: {
          'Content-Type': mimeType,
          'Cache-Control': 'private, max-age=3600',
        },
      });
    } catch (err) {
      if (logger) {
        logger.error('cdn', `proxy failed: ${err?.message ?? err}`);
      }
      return new Response('Bad Gateway', { status: 502 });
    }
  });
}

module.exports = {
  registerCdnScheme,
  setupCdnProtocol,
  isAnixartCdnUrl,
  ANIXART_CDN_HOSTS,
  ANIXART_SITE_ORIGIN,
  ANIXART_SITE_REFERER,
  BROWSER_UA,
};
