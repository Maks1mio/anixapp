/**
 * Kodik / aniqit direct link resolution (Node fetch — для web-bridge и dev).
 */
const KODIK_PLAYER_ORIGIN = 'https://kodikplayer.com/';
const KODIK_VALID_SRC = /\/\/(get|cloud)\.(kodik-storage|solodcdn)\.com\/useruploads\/.*?\/.*?\/(240|360|480|720|1080)\.mp4:hls:manifest\.m3u8/;
const ANIXART_UA = 'AnixartApp/9.0 BETA 3-25021818 (Android 9; SDK 28; x86_64; ROG ASUS AI2201_B; ru)';

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
      if (!source?.src || KODIK_VALID_SRC.test(source.src)) continue;
      try {
        source.src = decryptKodikSrc(source.src);
      } catch {
        /* ignore */
      }
    }
  }
  return links;
}

async function fetchText(url, headers = {}) {
  const res = await fetch(url, {
    headers: { 'User-Agent': ANIXART_UA, ...headers },
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
    headers: { Referer: pageUrl, Accept: 'application/json', 'User-Agent': ANIXART_UA },
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

async function getKodikDirectLinks(embedUrl) {
  const pageUrl = await resolveKodikEmbedUrl(embedUrl);
  let videoInfo = parseKodikLinkFromUrl(pageUrl);

  if (!videoInfo?.hash || !videoInfo?.id || !videoInfo?.type) {
    try {
      const html = await fetchText(pageUrl, {
        Referer: KODIK_PLAYER_ORIGIN,
        Accept: 'text/html,application/xhtml+xml',
      });
      videoInfo = parseKodikEmbedHtml(html);
    } catch {
      /* ignore */
    }
  }

  try {
    return await fetchKodikFtorLinks(pageUrl, videoInfo || {});
  } catch {
    return null;
  }
}

async function getDirectVideoLink(embedUrl) {
  const EMPTY = { directUrl: null, quality: null, qualityMap: {} };
  if (!embedUrl || typeof embedUrl !== 'string') return EMPTY;

  const url = embedUrl.startsWith('http') ? embedUrl : `https:${embedUrl}`;
  const host = (url.match(/https?:\/\/([^/]+)/) || [])[1] || '';
  const toAbs = (src) => (!src ? null : src.startsWith('http') ? src : `https:${src}`);
  const PRIO = ['1080', '1080p', '720', '720p', '480', '480p', '360', '360p'];

  try {
    if (host.includes('kodik') || host.includes('aniqit') || host.includes('anixis') || host.includes('aniqart')) {
      const links = await getKodikDirectLinks(url);
      if (!links || typeof links !== 'object') return EMPTY;
      const stripHls = (u) => u
        ? u.replace(/:hls:manifest\.m3u8$/, '').replace(/:hls:hls\.m3u8$/, '')
        : u;
      const qualityMap = {};
      for (const [key, arr] of Object.entries(links)) {
        const src = toAbs(arr?.[0]?.src);
        if (src) qualityMap[key.replace('p', '')] = stripHls(src);
      }
      const best = PRIO.find((k) => qualityMap[k]) || Object.keys(qualityMap)[0];
      const directUrl = qualityMap[best] || null;
      return {
        directUrl,
        quality: best || null,
        qualityMap,
        downloadHeaders: directUrl ? { Referer: 'https://kodikplayer.com/' } : {},
      };
    }
  } catch (e) {
    console.error('[kodik-direct]', e?.message || e);
  }

  return EMPTY;
}

module.exports = { getDirectVideoLink, getKodikDirectLinks };
