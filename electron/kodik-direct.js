/**
 * Kodik / aniqit direct link resolution (Node fetch — для web-bridge и dev).
 */
const { parseKodikSkipButton } = require('./lib/skip-marks');

const KODIK_PLAYER_ORIGIN = 'https://kodikplayer.com/';
/** Уже расшифрованный URL — не трогаем (solodcdn /s/m/, useruploads, cloud и т.п.). */
const KODIK_PLAIN_SRC = /(?:kodik-storage|solodcdn)\.com\//i;
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

function normalizeKodikEmbedUrl(embedUrl) {
  let url = embedUrl.startsWith('http') ? embedUrl : `https:${embedUrl}`;
  try {
    const u = new URL(url);
    url = u.origin + u.pathname;
  } catch {
    /* keep */
  }
  return url;
}

function decryptKodikSrc(src) {
  const zCharCode = 'Z'.charCodeAt(0);
  const decryptedBase64 = src.replace(/[a-zA-Z]/g, (e) => {
    let eCharCode = e.charCodeAt(0);
    return String.fromCharCode(
      (eCharCode <= zCharCode ? 90 : 122) >= (eCharCode = eCharCode + 18) ? eCharCode : eCharCode - 26,
    );
  });
  return Buffer.from(decryptedBase64, 'base64').toString('utf8');
}

function parseKodikLinkFromUrl(pageUrl) {
  const m = pageUrl.match(/\/(seria|video|movie|anime)\/(\d+)\/([0-9a-f]+)\//i);
  if (!m) return null;
  return { type: m[1], id: m[2], hash: m[3] };
}

function parseKodikEmbedHtml(html) {
  const hash = html.match(/\w+\.hash\s=\s'([^']+)';/is)?.[1];
  const id = html.match(/\w+\.id\s=\s'([^']+)';/is)?.[1];
  const type = html.match(/\w+\.type\s=\s'([^']+)';/is)?.[1];
  return { hash, id, type };
}

function decryptKodikLinks(links) {
  if (!links || typeof links !== 'object') return null;
  for (const [, sources] of Object.entries(links)) {
    if (!Array.isArray(sources)) continue;
    for (const source of sources) {
      if (!source?.src || KODIK_PLAIN_SRC.test(source.src) || /^https?:\/\//i.test(source.src) || source.src.startsWith('//')) {
        continue;
      }
      try {
        source.src = decryptKodikSrc(source.src);
      } catch {
        /* ignore */
      }
    }
  }
  return links;
}

/** /s/m/ на solodcdn часто отдаёт 500 как progressive MP4 — оставляем HLS. */
function preferPlayableKodikUrl(url) {
  if (!url) return url;
  const abs = url.startsWith('http') ? url : url.startsWith('//') ? `https:${url}` : url;
  if (/\/s\/m\//i.test(abs) && !/:hls:/i.test(abs) && /\.mp4$/i.test(abs)) {
    return `${abs}:hls:manifest.m3u8`;
  }
  if (/\/s\/m\//i.test(abs)) return abs;
  return abs
    .replace(/:hls:manifest\.m3u8$/i, '')
    .replace(/:hls:hls\.m3u8$/i, '');
}

async function fetchText(url, headers = {}) {
  const res = await fetch(url, {
    headers: { 'User-Agent': BROWSER_UA, ...headers },
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

async function fetchKodikFtorLinks(pageUrl, videoInfo) {
  const { type, hash, id } = videoInfo;
  if (!type || !hash || !id) return null;

  const ftorUrl = `https://kodikplayer.com/ftor?${new URLSearchParams({ type, hash, id }).toString()}`;
  const res = await fetch(ftorUrl, {
    headers: { Referer: pageUrl, Accept: 'application/json', 'User-Agent': BROWSER_UA },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const payload = await res.json();
  if (!payload?.links || typeof payload.links !== 'object') return null;
  return decryptKodikLinks(payload.links);
}

async function resolveKodikEmbedUrl(embedUrl) {
  let url = normalizeKodikEmbedUrl(embedUrl);
  const host = (url.match(/https?:\/\/([^/]+)/) || [])[1] || '';
  if (host.includes('kodik')) return url;

  if (host.includes('aniqit') || host.includes('anixis') || host.includes('aniqart')) {
    const html = await fetchText(url, {
      Referer: KODIK_PLAYER_ORIGIN,
      Accept: 'text/html,application/xhtml+xml',
    });
    const m = html.match(/https?:\\\/\\\/(?:[^\\/]+\.)?kodikplayer\.com\\\/seria\\\/[^"']+/i)
      ?? html.match(/(?:https:)?\/\/[^"'\s]*kodikplayer\.com\/seria\/[^"'\s]+/i);
    if (m) {
      let kodikUrl = m[0].replace(/\\/g, '');
      if (kodikUrl.startsWith('//')) kodikUrl = `https:${kodikUrl}`;
      return normalizeKodikEmbedUrl(kodikUrl);
    }
  }
  return url;
}

async function loadKodikPlayer(embedUrl) {
  const pageUrl = await resolveKodikEmbedUrl(embedUrl);
  let videoInfo = parseKodikLinkFromUrl(pageUrl);
  const htmlPromise = fetchText(pageUrl, {
    Referer: KODIK_PLAYER_ORIGIN,
    Accept: 'text/html,application/xhtml+xml',
  }).catch(() => '');
  const ftorEarly = (videoInfo?.hash && videoInfo?.id && videoInfo?.type)
    ? fetchKodikFtorLinks(pageUrl, videoInfo).catch(() => null)
    : Promise.resolve(null);

  const html = await htmlPromise;
  const skip = parseKodikSkipButton(html);
  if (!videoInfo?.hash || !videoInfo?.id || !videoInfo?.type) {
    videoInfo = parseKodikEmbedHtml(html);
  }
  let links = await ftorEarly;
  if (!links) {
    try {
      links = await fetchKodikFtorLinks(pageUrl, videoInfo || {});
    } catch {
      links = null;
    }
  }
  return { links, skip };
}

async function getKodikDirectLinks(embedUrl) {
  const { links } = await loadKodikPlayer(embedUrl);
  return links;
}

async function getDirectVideoLink(embedUrl) {
  const EMPTY = { directUrl: null, quality: null, qualityMap: {}, skip: null };
  if (!embedUrl || typeof embedUrl !== 'string') return EMPTY;

  const url = embedUrl.startsWith('http') ? embedUrl : `https:${embedUrl}`;
  const host = (url.match(/https?:\/\/([^/]+)/) || [])[1] || '';
  const toAbs = (src) => (!src ? null : src.startsWith('http') ? src : `https:${src}`);
  const PRIO = ['1080', '1080p', '720', '720p', '480', '480p', '360', '360p'];

  try {
    if (host.includes('kodik') || host.includes('aniqit') || host.includes('anixis') || host.includes('aniqart')) {
      const { links, skip } = await loadKodikPlayer(url);
      if (!links || typeof links !== 'object') return { ...EMPTY, skip: skip || null };
      const qualityMap = {};
      for (const [key, arr] of Object.entries(links)) {
        const src = toAbs(arr?.[0]?.src);
        if (src) qualityMap[key.replace('p', '')] = preferPlayableKodikUrl(src);
      }
      const best = PRIO.find((k) => qualityMap[k]) || Object.keys(qualityMap)[0];
      const directUrl = qualityMap[best] || null;
      return {
        directUrl,
        quality: best || null,
        qualityMap,
        skip: skip || null,
        downloadHeaders: directUrl
          ? { Referer: 'https://kodikplayer.com/', 'User-Agent': BROWSER_UA }
          : {},
      };
    }
  } catch (e) {
    console.error('[kodik-direct]', e?.message || e);
  }

  return EMPTY;
}

module.exports = { getDirectVideoLink, getKodikDirectLinks };
