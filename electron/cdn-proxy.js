'use strict';

const { protocol, nativeImage } = require('electron');

const ANIXART_SITE_ORIGIN = 'https://anixart.tv';
const ANIXART_SITE_REFERER = `${ANIXART_SITE_ORIGIN}/`;
const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

const ANIXART_CDN_HOSTS = ['anixmirai.com', 'anixart.tv', 'anixsekai.com'];

const CACHE_MAX = 256;
const CACHE_TTL_MS = 60 * 60 * 1000;
/** @type {Map<string, { buffer: Buffer, mimeType: string, ts: number }>} */
const cache = new Map();
/** @type {Map<string, { buffer: Buffer, mimeType: string, ts: number }>} */
const thumbnailCache = new Map();

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

function createThumbnail(buffer, width, height) {
  const image = nativeImage.createFromBuffer(buffer);
  if (image.isEmpty()) throw new Error('CDN image decode failed');

  const dimensions = image.getSize();
  const sourceRatio = dimensions.width / dimensions.height;
  const targetRatio = width / height;
  const cropWidth = sourceRatio > targetRatio
    ? Math.round(dimensions.height * targetRatio)
    : dimensions.width;
  const cropHeight = sourceRatio > targetRatio
    ? dimensions.height
    : Math.round(dimensions.width / targetRatio);
  const cropped = image.crop({
    x: Math.floor((dimensions.width - cropWidth) / 2),
    y: Math.floor((dimensions.height - cropHeight) / 2),
    width: cropWidth,
    height: cropHeight,
  });
  return cropped.resize({ width, height, quality: 'good' }).toPNG();
}

function getThumbnail(url, sourceBuffer, width, height) {
  const key = `${url}|${width}x${height}`;
  const cached = thumbnailCache.get(key);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached;

  const entry = {
    buffer: createThumbnail(sourceBuffer, width, height),
    mimeType: 'image/png',
    ts: Date.now(),
  };
  thumbnailCache.set(key, entry);
  while (thumbnailCache.size > CACHE_MAX) {
    const first = thumbnailCache.keys().next().value;
    if (first == null) break;
    thumbnailCache.delete(first);
  }
  return entry;
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
      const asset = await fetchCdnAsset(target);
      const requestedSize = Number.parseInt(reqUrl.searchParams.get('size') || '', 10);
      const requestedWidth = Number.parseInt(reqUrl.searchParams.get('w') || '', 10);
      const requestedHeight = Number.parseInt(reqUrl.searchParams.get('h') || '', 10);
      const width = requestedWidth || requestedSize;
      const height = requestedHeight || requestedSize;
      const hasValidDimensions = Number.isFinite(width) && Number.isFinite(height)
        && width >= 16 && width <= 512
        && height >= 16 && height <= 768;
      const output = hasValidDimensions
        ? getThumbnail(target, asset.buffer, width, height)
        : asset;
      return new Response(output.buffer, {
        status: 200,
        headers: {
          'Content-Type': output.mimeType,
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
