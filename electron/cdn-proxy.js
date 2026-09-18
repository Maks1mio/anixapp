'use strict';

const { protocol, nativeImage } = require('electron');
const { fetchAnixartProxy, getProxyAppKey } = require('./lib/anixart-proxy-auth');

const ANIXART_SITE_ORIGIN = 'https://anixart.tv';
const ANIXART_SITE_REFERER = `${ANIXART_SITE_ORIGIN}/`;
const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

const ANIXART_CDN_HOSTS = ['anixmirai.com', 'anixart.tv', 'anixsekai.com'];

const CACHE_MAX = 256;
const CACHE_TTL_MS = 60 * 60 * 1000;
/** Сколько раз пробовать зеркало / origin / relay при полном провале. */
const CDN_FETCH_ATTEMPTS = 6;
const CDN_FETCH_BASE_MS = 280;
/** После сбоя прямого CDN — не долбить заблокированный хост (zapret/DPI). */
const CDN_ROUTE_TTL_MS = 15 * 60 * 1000;
/** Пустышка hotlink-защиты / оборванный ответ — как в Android CdnBridge. */
const CDN_DUMMY_MIN_BYTES = 400;
const CDN_MIRROR_TIMEOUT_MS = 8_000;
const CDN_ORIGIN_TIMEOUT_MS = 5_000;
/** @type {Map<string, { buffer: Buffer, mimeType: string, ts: number }>} */
const cache = new Map();
/** @type {Map<string, { buffer: Buffer, mimeType: string, ts: number }>} */
const thumbnailCache = new Map();
/** @type {'auto' | 'mirror' | 'direct' | 'relay'} */
let cdnRoute = 'auto';
let cdnRouteUntil = 0;
/** @type {{ info?: Function, warn?: Function, error?: Function } | null} */
let cdnLogger = null;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getHttpFetcher() {
  try {
    const { session } = require('electron');
    if (typeof session?.defaultSession?.fetch === 'function') {
      return session.defaultSession.fetch.bind(session.defaultSession);
    }
  } catch {
    /* renderer-less / tests */
  }
  return fetch;
}

/**
 * Chromium session.fetch падает на просроченном LE (CERT_DATE / ERR_FAILED).
 * Node https с rejectUnauthorized:false для CDN — как рабочий /__cdn в Vite.
 */
function nodeCdnGet(url, headers, timeoutMs, redirectsLeft = 5) {
  return new Promise((resolve, reject) => {
    let parsed;
    try {
      parsed = new URL(url);
    } catch (err) {
      reject(err);
      return;
    }
    const lib = parsed.protocol === 'http:' ? require('http') : require('https');
    const req = lib.get(url, {
      headers,
      timeout: timeoutMs,
      rejectUnauthorized: false,
    }, (res) => {
      const loc = res.headers.location;
      if (res.statusCode >= 300 && res.statusCode < 400 && loc && redirectsLeft > 0) {
        res.resume();
        const next = new URL(loc, url).toString();
        nodeCdnGet(next, headers, timeoutMs, redirectsLeft - 1).then(resolve, reject);
        return;
      }
      if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
        res.resume();
        reject(new Error(`CDN HTTP ${res.statusCode} for ${url}`));
        return;
      }
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          mimeType: String(res.headers['content-type'] || '').split(';')[0].trim() || guessMime(url),
          buffer: Buffer.concat(chunks),
        });
      });
      res.on('error', reject);
    });
    req.on('timeout', () => {
      req.destroy();
      const err = new Error(`timeout after ${timeoutMs}ms`);
      err.name = 'TimeoutError';
      reject(err);
    });
    req.on('error', reject);
  });
}

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
  // JPEG: меньше PNG при постерах, качество достаточно для превью
  return cropped.resize({ width, height, quality: 'better' }).toJPEG(88);
}

function getThumbnail(url, sourceBuffer, width, height) {
  const key = `${url}|${width}x${height}|jpg88`;
  const cached = thumbnailCache.get(key);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached;

  const entry = {
    buffer: createThumbnail(sourceBuffer, width, height),
    mimeType: 'image/jpeg',
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

function cacheEntry(url, buffer, mimeType) {
  const entry = { buffer, mimeType, ts: Date.now() };
  cache.set(url, entry);
  trimCache();
  return entry;
}

function isDummyCdnBody(buffer) {
  return !buffer || buffer.length < CDN_DUMMY_MIN_BYTES;
}

function isTimeoutErr(err) {
  const name = err && typeof err === 'object' ? String(err.name || '') : '';
  const msg = String(err?.message || err || '');
  return name === 'TimeoutError' || name === 'AbortError' || /timeout|aborted|abort/i.test(msg);
}

function readPersistedCdnRoute() {
  try {
    const { getRawConfig } = require('./lib/config-store');
    const r = getRawConfig()?.cdnRoute;
    // relay больше не sticky: бэкап часто висит, а прямой CDN у нас живой.
    if (r === 'mirror' || r === 'direct') return r;
  } catch {
    /* app not ready */
  }
  return 'auto';
}

function persistCdnRoute(route) {
  if (route === 'relay') {
    cdnRoute = 'auto';
    cdnRouteUntil = 0;
    return;
  }
  if (route !== 'mirror' && route !== 'direct') return;
  const changed = cdnRoute !== route;
  cdnRoute = route;
  cdnRouteUntil = Date.now() + CDN_ROUTE_TTL_MS;
  if (!changed) return;
  try {
    const { saveConfig } = require('./lib/config-store');
    saveConfig({ cdnRoute: route });
  } catch {
    /* ignore */
  }
  cdnLogger?.info?.('cdn', `using ${route} route`);
}

function currentCdnRoute() {
  if ((cdnRoute === 'mirror' || cdnRoute === 'direct' || cdnRoute === 'relay')
    && Date.now() < cdnRouteUntil) {
    return cdnRoute;
  }
  const persisted = readPersistedCdnRoute();
  cdnRoute = persisted;
  if (persisted !== 'auto') cdnRouteUntil = Date.now() + CDN_ROUTE_TTL_MS;
  return persisted;
}

let originBlockedUntil = 0;
let mirrorBlockedUntil = 0;

/**
 * Server-side CDN relay via AnixApp backup API.
 * Client only talks to api.anixapp.com — avoids zapret/WinDivert breaking s3.anixmirai.com TLS.
 */
async function fetchCdnAssetViaRelay(url) {
  if (!getProxyAppKey()) {
    throw new Error('CDN relay unavailable: proxy key not set');
  }
  const path = `/cdn-asset?u=${encodeURIComponent(url)}`;
  const response = await fetchAnixartProxy(path, {
    method: 'GET',
    redirect: 'follow',
    signal: AbortSignal.timeout(20_000),
    headers: {
      Accept: 'image/*,application/octet-stream,*/*',
    },
  });
  if (!response.ok) {
    throw new Error(`CDN relay HTTP ${response.status}`);
  }
  const mimeType = response.headers.get('content-type')?.split(';')[0]?.trim() || guessMime(url);
  if (/json|html|text\/plain/i.test(mimeType)) {
    throw new Error(`CDN relay returned ${mimeType}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  if (isDummyCdnBody(buffer)) throw new Error('Empty CDN relay body');
  return cacheEntry(url, buffer, mimeType);
}

async function fetchCdnAssetDirect(url, _httpFetch, headers, timeoutMs) {
  const response = await nodeCdnGet(url, headers, timeoutMs);
  if (isDummyCdnBody(response.buffer)) {
    throw new Error(`CDN dummy/empty body (${response.buffer.length}b) for ${url}`);
  }
  return cacheEntry(url, response.buffer, response.mimeType || guessMime(url));
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

  const httpFetch = getHttpFetcher();
  const mirror = buildMirrorUrl(url);
  const hasMirror = Boolean(mirror && mirror !== url);
  let lastError = null;

  const loadDirect = (target, timeoutMs) => fetchCdnAssetDirect(target, httpFetch, headers, timeoutMs);

  for (let attempt = 0; attempt < CDN_FETCH_ATTEMPTS; attempt += 1) {
    if (attempt > 0) {
      await sleep(Math.min(4_000, CDN_FETCH_BASE_MS * 2 ** (attempt - 1)));
    }

    const route = currentCdnRoute();
    /** @type {Promise<{ via: 'mirror' | 'direct' | 'relay', value: { buffer: Buffer, mimeType: string, ts: number } }>[]} */
    const raced = [];

    const originBlocked = Date.now() < originBlockedUntil;
    const mirrorBlocked = Date.now() < mirrorBlockedUntil;

    const pushRelay = () => {
      if (!getProxyAppKey()) return;
      raced.push(fetchCdnAssetViaRelay(url).then((value) => ({ via: 'relay', value })));
    };
    const pushMirror = () => {
      if (!hasMirror || mirrorBlocked) return;
      raced.push(
        loadDirect(mirror, CDN_MIRROR_TIMEOUT_MS)
          .then((value) => {
            mirrorBlockedUntil = 0;
            return { via: 'mirror', value };
          })
          .catch((err) => {
            if (isTimeoutErr(err)) mirrorBlockedUntil = Date.now() + CDN_ROUTE_TTL_MS;
            throw err;
          }),
      );
    };
    const pushOrigin = () => {
      if (originBlocked) return;
      raced.push(
        loadDirect(url, CDN_ORIGIN_TIMEOUT_MS)
          .then((value) => {
            originBlockedUntil = 0;
            return { via: 'direct', value };
          })
          .catch((err) => {
            if (isTimeoutErr(err)) originBlockedUntil = Date.now() + CDN_ROUTE_TTL_MS;
            throw err;
          }),
      );
    };

    // Прямой CDN — основной путь. Зеркало/relay не стартуем параллельно:
    // у части сетей они висят и забивают пул, из‑за этого обложки остаются пустыми.
    if (route === 'mirror' && !mirrorBlocked) {
      pushMirror();
      pushOrigin();
    } else {
      pushOrigin();
    }
    if (originBlocked || route === 'mirror') {
      pushRelay();
      if (route !== 'mirror') pushMirror();
    }

    if (!raced.length) {
      originBlockedUntil = 0;
      mirrorBlockedUntil = 0;
      pushOrigin();
      pushRelay();
      pushMirror();
    }

    try {
      const winner = await Promise.any(raced);
      persistCdnRoute(winner.via);
      return winner.value;
    } catch (err) {
      const nested = err && typeof err === 'object' && Array.isArray(err.errors) ? err.errors : null;
      lastError = nested?.[0] instanceof Error
        ? nested[0]
        : err instanceof Error
          ? err
          : new Error(String(err));
    }

    if (route !== 'auto') {
      cdnRoute = 'auto';
      cdnRouteUntil = 0;
    }
  }

  throw lastError || new Error(`CDN fetch failed for ${url}`);
}

/** JSON с CDN (Lottie-бейджи) — для IPC, без renderer fetch(anix-cdn://). */
async function fetchCdnJson(url) {
  if (!isAnixartCdnUrl(url)) {
    throw new Error('Forbidden CDN host');
  }
  const asset = await fetchCdnAsset(url);
  return JSON.parse(asset.buffer.toString('utf8'));
}

const REMOTE_IMAGE_MAX_BYTES = 48 * 1024 * 1024;

/**
 * Любой http(s) image для renderer (Anime4K и т.п.) — без CORS, из main process.
 * @returns {{ mimeType: string, data: Uint8Array }}
 */
async function fetchRemoteImage(url) {
  const target = typeof url === 'string' ? url.trim() : '';
  if (!target || !/^https?:\/\//i.test(target)) {
    throw new Error('Invalid image URL');
  }

  let buffer;
  let mimeType;

  if (isAnixartCdnUrl(target)) {
    const asset = await fetchCdnAsset(target);
    buffer = asset.buffer;
    mimeType = asset.mimeType;
  } else {
    let origin = ANIXART_SITE_ORIGIN;
    try {
      origin = new URL(target).origin;
    } catch {
      /* keep default */
    }
    const headers = {
      'User-Agent': BROWSER_UA,
      Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
      'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
      Referer: `${origin}/`,
    };
    const { session } = require('electron');
    const fetcher = typeof session?.defaultSession?.fetch === 'function'
      ? session.defaultSession.fetch.bind(session.defaultSession)
      : fetch;
    const response = await fetcher(target, { headers, redirect: 'follow' });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    buffer = Buffer.from(await response.arrayBuffer());
    mimeType = response.headers.get('content-type')?.split(';')[0]?.trim() || guessMime(target);
  }

  if (!buffer?.length) throw new Error('Empty image');
  if (buffer.length > REMOTE_IMAGE_MAX_BYTES) throw new Error('Image too large');

  return {
    mimeType: mimeType || 'image/jpeg',
    data: new Uint8Array(buffer),
  };
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
        bypassCSP: true,
      },
    },
  ]);
}

function setupCdnProtocol(logger) {
  cdnLogger = logger || null;
  cdnRoute = readPersistedCdnRoute();
  if (cdnRoute !== 'auto') cdnRouteUntil = Date.now() + CDN_ROUTE_TTL_MS;
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
        && width >= 16 && width <= 640
        && height >= 16 && height <= 960;
      const mime = String(asset.mimeType || '').toLowerCase();
      const canThumb = hasValidDimensions
        && !mime.includes('webp')
        && !mime.includes('gif')
        && !mime.includes('svg')
        && !mime.includes('video')
        && !mime.includes('avif')
        && !/\.(webp|gif|svg|mp4|webm|avif)(\?|$)/i.test(target);

      let output = asset;
      if (canThumb) {
        try {
          output = getThumbnail(target, asset.buffer, width, height);
        } catch (thumbErr) {
          // nativeImage часто не декодирует webp/avif — отдаём оригинал вместо 502
          if (logger) {
            logger.warn?.('cdn', `thumb skipped: ${thumbErr?.message ?? thumbErr}`);
          }
          output = asset;
        }
      }
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
  fetchCdnJson,
  fetchRemoteImage,
  isAnixartCdnUrl,
  ANIXART_CDN_HOSTS,
  ANIXART_SITE_ORIGIN,
  ANIXART_SITE_REFERER,
  BROWSER_UA,
};
