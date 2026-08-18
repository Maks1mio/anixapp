'use strict';

/**
 * Единый резолвер прямой ссылки на медиа (Electron IPC + Vite web-bridge).
 * Никогда не возвращает HTML-эмбеды (shell.php?videoid, youtube, kodik /seria/).
 */

const { RutubeParser, VKVideoParser, OKParser } = require('anixapi');
const { getDirectVideoLink: getKodikDirectVideoLink } = require('../kodik-direct');

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

const EMPTY = Object.freeze({
  directUrl: null,
  quality: null,
  qualityMap: {},
  downloadHeaders: {},
});

const PRIO = ['2160', '2160p', '1440', '1440p', '1080', '1080p', '720', '720p', '480', '480p', '360', '360p', '240', '240p'];

/** Публичный ключ Studio MIR из Anixart Android (StudioMirParser). */
const STUDIOMIR_API_KEY = '80b2d3e9c4ff27eb2e924c4d38f7daec';
const STUDIOMIR_API = 'https://api.studiomir.club/api';

const OK_QUALITY_NAME = {
  ultra: '2160',
  quad: '1440',
  full: '1080',
  hd: '720',
  sd: '480',
  low: '360',
  lowest: '240',
};

const SIBNET_PAGE_HEADERS = {
  'User-Agent': BROWSER_UA,
  Referer: 'https://sibnet.ru/',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8',
};

function empty() {
  return { directUrl: null, quality: null, qualityMap: {}, downloadHeaders: {} };
}

function toAbs(src) {
  if (!src) return null;
  if (src.startsWith('http')) return src;
  if (src.startsWith('//')) return `https:${src}`;
  return `https:${src}`;
}

function hostOf(url) {
  try {
    return new URL(url).host.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function isSibnetHtmlEmbed(url) {
  if (!url || !/sibnet\.ru/i.test(url)) return false;
  if (/video_pid=/i.test(url)) return false;
  return /shell\.php/i.test(url) && /videoid=/i.test(url);
}

function isHtmlPlayerPage(url) {
  if (!url) return true;
  if (isSibnetHtmlEmbed(url)) return true;
  if (/\/(seria|video|movie|anime)\/\d+\/[0-9a-f]+\//i.test(url)
    && /kodikplayer\.com|kodik\.info|aniqit\.com|anixis\.com|aniqart\.com/i.test(url)) {
    return true;
  }
  if (/youtube\.com|youtu\.be/i.test(url)) return true;
  if (/vk\.com\/video_ext|vkvideo\.ru\/video_ext/i.test(url)) return true;
  if (/rutube\.ru\/play\/embed/i.test(url)) return true;
  if (/ok\.ru\/videoembed/i.test(url)) return true;
  if (/my\.mail\.ru\/video\/embed/i.test(url)) return true;
  if (/myvi\.(tv|top)\/embed/i.test(url)) return true;
  if (/secvideo1\.online\/embed/i.test(url)) return true;
  if (/studiomir\.club/i.test(url) && /tsmplayer|\/embed/i.test(url)) return true;
  if (/sovetromantica\.com\/embed/i.test(url)) return true;
  return false;
}

function pickBest(qualityMap) {
  const best = PRIO.find((k) => qualityMap[k] || qualityMap[k.replace(/p$/, '')])
    || Object.keys(qualityMap)[0];
  return best || null;
}

function resultFromMap(qualityMap, headers) {
  const cleaned = {};
  for (const [k, v] of Object.entries(qualityMap || {})) {
    const abs = toAbs(typeof v === 'string' ? v : v?.src);
    if (!abs || isHtmlPlayerPage(abs)) continue;
    cleaned[String(k).replace(/p$/, '')] = abs;
  }
  const best = pickBest(cleaned);
  const directUrl = best ? cleaned[best] : null;
  if (!directUrl) return empty();
  return {
    directUrl,
    quality: best,
    qualityMap: cleaned,
    downloadHeaders: headers || {},
  };
}

async function followSibnetLocation(videoUrl, embedUrl, hops = 0) {
  if (!videoUrl || hops > 5) return null;
  let res;
  try {
    res = await fetch(videoUrl, {
      method: 'GET',
      redirect: 'manual',
      headers: {
        Referer: embedUrl,
        'User-Agent': BROWSER_UA,
        Accept: '*/*',
        Range: 'bytes=0-0',
      },
    });
  } catch {
    return null;
  }
  try { await res.arrayBuffer(); } catch { /* drain */ }

  const loc = res.headers.get('location');
  if (loc) {
    let next = loc.replace(/:443/g, '');
    if (next.startsWith('//')) next = `https:${next}`;
    else if (next.startsWith('/')) next = `https://video.sibnet.ru${next}`;
    else if (!/^https?:/i.test(next)) next = `https:${next}`;
    if (next === videoUrl) return isHtmlPlayerPage(next) ? null : next;
    const deeper = await followSibnetLocation(next, embedUrl, hops + 1);
    return deeper || (isHtmlPlayerPage(next) ? null : next);
  }

  const ct = (res.headers.get('content-type') || '').toLowerCase();
  if (/video\/|octet-stream|mp4|mpegurl/i.test(ct)) return videoUrl;
  return null;
}

function isSibnetUnavailableHtml(html) {
  if (!html) return true;
  return /видео удалено|ролик удал[её]н|видео не найдено|видео не существует|удал[её]н пользователем|video (is )?deleted|video not found|access denied/i.test(html);
}

function extractSibnetSrcPath(html) {
  if (isSibnetUnavailableHtml(html)) return null;
  const patterns = [
    /player\.src\(\[\s*\{\s*src:\s*"(\/[^"]+)"/i,
    /src:\s*"(\/v\/[^"]+\.mp4[^"]*)"/i,
    /src:\s*"(\/shell\.php\?[^"]+)"/i,
    /src:\s*"(\/[^"]+)"/i,
    /src:\s*'(\/[^']+)'/i,
    /file\s*:\s*"(\/shell\.php[^"]+)"/i,
  ];
  for (const re of patterns) {
    const m = re.exec(html);
    if (m?.[1]) return m[1];
  }
  return null;
}

async function getSibnetDirectLink(embedUrl) {
  try {
    const pageRes = await fetch(embedUrl, { headers: SIBNET_PAGE_HEADERS, redirect: 'follow' });
    const html = await pageRes.text();
    const srcPath = extractSibnetSrcPath(html);
    if (!srcPath) return null;
    const videoUrl = srcPath.startsWith('http') ? srcPath : `https://video.sibnet.ru${srcPath}`;
    const followed = await followSibnetLocation(videoUrl, embedUrl);
    if (followed) return followed;
    if (!isSibnetHtmlEmbed(videoUrl) && /\.mp4(\?|$)/i.test(videoUrl)) return videoUrl;
  } catch { /* ignore */ }

  return null;
}

async function scrapeAnilibriaDirectFiles(embedUrl, epNum) {
  try {
    const res = await fetch(embedUrl, {
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        Referer: embedUrl.split('?')[0],
        'User-Agent': BROWSER_UA,
      },
    });
    const html = await res.text();
    const blockRe = new RegExp(`"s${epNum}"[^]*?"file":"(.*?)"`, 's');
    const blockMatch = blockRe.exec(html);
    if (!blockMatch) return null;

    const raw = blockMatch[1].replace(/\\\//g, '/');
    const qualityMap = {};
    const qualRe = /\[(\d+)p\]([^,\[]+)/g;
    let m;
    while ((m = qualRe.exec(raw)) !== null) {
      const src = m[2].trim();
      if (src) qualityMap[m[1]] = src.startsWith('http') ? src : `https:${src}`;
    }
    if (Object.keys(qualityMap).length) return qualityMap;

    if (raw && !/^\[/.test(raw)) {
      const single = raw.startsWith('http') ? raw : `https:${raw}`;
      if (/\.(mp4|mkv|webm)(\?|$)/i.test(single)) return { '720': single };
    }
  } catch { /* ignore */ }
  return null;
}

async function getLibriaDirectLink(url, host) {
  const parsed = new URL(url);
  const releaseId = parsed.searchParams.get('id');
  const epOrdinal = parsed.searchParams.get('ep');
  if (!releaseId || !epOrdinal) return empty();

  const apiBase = host.includes('aniliberty') || host.includes('libria.fun')
    ? 'https://aniliberty.top/api/v1/anime/releases'
    : 'https://aniliberty.top/api/v1/anime/releases';

  const headers = { Referer: url.split('?')[0], 'User-Agent': BROWSER_UA };
  const directMap = await scrapeAnilibriaDirectFiles(url, parseInt(epOrdinal, 10));
  if (directMap && Object.keys(directMap).length) {
    return resultFromMap(directMap, headers);
  }

  const apiResp = await fetch(`${apiBase}/${releaseId}`);
  if (!apiResp.ok) return empty();
  const body = await apiResp.json();
  if (!body?.episodes) return empty();
  const ep = body.episodes.find((e) => String(e.ordinal) === String(parseInt(epOrdinal, 10)));
  if (!ep) return empty();

  const qualityMap = {};
  if (ep.hls_1080) qualityMap['1080'] = toAbs(ep.hls_1080);
  if (ep.hls_720) qualityMap['720'] = toAbs(ep.hls_720);
  if (ep.hls_480) qualityMap['480'] = toAbs(ep.hls_480);
  return resultFromMap(qualityMap, headers);
}

function normalizeParserMap(links) {
  if (!links || typeof links !== 'object') return {};
  const qualityMap = {};
  for (const [key, val] of Object.entries(links)) {
    const src = typeof val === 'string' ? val : val?.src;
    const abs = toAbs(src);
    if (abs) qualityMap[String(key).replace(/p$/, '')] = abs;
  }
  return qualityMap;
}

async function getRutubeDirectLink(url) {
  const links = await RutubeParser.getDirectLinks(url);
  return resultFromMap(normalizeParserMap(links), {
    Referer: 'https://rutube.ru/',
    'User-Agent': BROWSER_UA,
  });
}

async function getVkDirectLink(url) {
  const links = await VKVideoParser.getDirectLinks(url);
  const headers = { Referer: url, 'User-Agent': BROWSER_UA };
  return resultFromMap(normalizeParserMap(links), headers);
}

const OK_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.45 Safari/537.36';

function decodeOkHtml(str) {
  return String(str || '')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\')
    .replace(/\\u0026/gi, '&')
    .replace(/\\&/g, '&')
    .replace(/\\\//g, '/');
}

function extractOkNamedQualities(html) {
  const m = html.match(/data-options="([^"]*)"/);
  if (!m) return {};
  const json = decodeOkHtml(m[1]);
  if (!json.includes('"provider":"UPLOADED_ODKL"') || json.includes('"is_live":true')) return {};
  const qualityMap = {};
  const re = /"name":"(\w+)"\s*,\s*"url":"(.*?)"/g;
  let match;
  while ((match = re.exec(json))) {
    const key = OK_QUALITY_NAME[match[1]];
    if (!key) continue;
    const abs = toAbs(decodeOkHtml(match[2]));
    if (!abs || !/^https?:/i.test(abs) || /disallowed/i.test(abs)) continue;
    qualityMap[key] = abs;
  }
  if (Object.keys(qualityMap).length) return qualityMap;

  const loose = /"name":"(\w+)"[\s\S]{0,240}?"url":"(.*?)"/g;
  while ((match = loose.exec(json))) {
    const key = OK_QUALITY_NAME[match[1]];
    if (!key || qualityMap[key]) continue;
    const abs = toAbs(decodeOkHtml(match[2]));
    if (!abs || !/^https?:/i.test(abs) || /disallowed/i.test(abs)) continue;
    qualityMap[key] = abs;
  }
  return qualityMap;
}

function extractOkHlsManifestUrl(html) {
  const idx = html.indexOf('video.m3u8');
  if (idx < 0) return null;
  const start = html.lastIndexOf('https:', idx);
  const end = html.indexOf('\\&quot;', idx);
  if (start < 0 || end <= start) return null;
  const raw = html.slice(start, end).replace(/\\u0026/gi, '&').replace(/\\&/g, '&');
  try { return new URL(raw).href; } catch { return raw || null; }
}

function pickStudioMirEpisode(episodes, epNum) {
  const list = (episodes || []).filter((e) => Number(e?.episode) === Number(epNum));
  if (!list.length) return null;
  return list.find((e) => e.type === 'TV')
    || list.find((e) => e.type !== 'TR')
    || list[0];
}

async function getStudioMirDirectLink(url) {
  let ani;
  let ep;
  try {
    const parsed = new URL(url);
    ani = parsed.searchParams.get('ani');
    ep = parsed.searchParams.get('ep');
  } catch {
    ani = (url.match(/[?&]ani=(\d+)/i) || [])[1];
    ep = (url.match(/[?&]ep=(\d+)/i) || [])[1];
  }
  if (!ani || !ep) return empty();

  const headers = {
    Referer: url,
    'User-Agent': BROWSER_UA,
  };
  const apiUrl = `${STUDIOMIR_API}?ani=${encodeURIComponent(ani)}&apikey=${STUDIOMIR_API_KEY}`;
  const res = await fetch(apiUrl, {
    headers: { 'User-Agent': BROWSER_UA, Accept: 'application/json', Referer: 'https://api.studiomir.club/' },
  });
  if (!res.ok) return empty();
  const body = await res.json();
  const tsm = body?.[0]?.players?.tsm;
  const episode = pickStudioMirEpisode(tsm, ep);
  if (!episode) return empty();

  const qualityMap = {};
  const hls = episode.hls || {};
  if (hls['2160p']) qualityMap['2160'] = toAbs(hls['2160p']);
  if (hls['1080p']) qualityMap['1080'] = toAbs(hls['1080p']);
  if (hls['720p']) qualityMap['720'] = toAbs(hls['720p']);
  if (!Object.keys(qualityMap).length && episode.url) {
    qualityMap['720'] = toAbs(episode.url);
  }
  return resultFromMap(qualityMap, headers);
}

async function getOkDirectLink(url) {
  const headers = { Referer: url, 'User-Agent': OK_UA };
  try {
    const page = await fetch(url, { headers: { 'User-Agent': OK_UA, Referer: 'https://ok.ru/' } });
    const html = await page.text();
    const named = extractOkNamedQualities(html);
    if (Object.keys(named).length) return resultFromMap(named, headers);
    const hlsUrl = extractOkHlsManifestUrl(html);
    if (hlsUrl) return resultFromMap({ '1080': hlsUrl }, headers);
  } catch { /* fallback below */ }

  const links = await OKParser.getDirectLinks(url);
  return resultFromMap(normalizeParserMap(links), headers);
}

async function getDirectVideoLink(embedUrl) {
  if (!embedUrl || typeof embedUrl !== 'string') return empty();
  const url = embedUrl.startsWith('http') ? embedUrl : `https:${embedUrl}`;
  const host = hostOf(url);

  try {
    if (host.includes('kodik') || host.includes('aniqit') || host.includes('anixis') || host.includes('aniqart')) {
      return await getKodikDirectVideoLink(url);
    }

    if (host.includes('sibnet')) {
      const direct = await getSibnetDirectLink(url);
      if (!direct || isHtmlPlayerPage(direct)) return empty();
      return {
        directUrl: direct,
        quality: '720',
        qualityMap: { '720': direct },
        downloadHeaders: { Referer: url, 'User-Agent': BROWSER_UA },
      };
    }

    if (host.includes('aniliberty') || host.includes('anilibria') || host.includes('libria')) {
      return await getLibriaDirectLink(url, host);
    }

    if (host.includes('rutube')) {
      return await getRutubeDirectLink(url);
    }

    if (host.includes('vk.com') || host.includes('vk.ru') || host.includes('vkvideo')) {
      return await getVkDirectLink(url);
    }

    if (host.includes('ok.ru') || host.includes('odnoklassniki')) {
      return await getOkDirectLink(url);
    }

    if (host.includes('studiomir')) {
      return await getStudioMirDirectLink(url);
    }
  } catch (e) {
    console.error('getDirectVideoLink error:', e?.message || e);
  }

  return empty();
}

module.exports = {
  getDirectVideoLink,
  getSibnetDirectLink,
  isHtmlPlayerPage,
  isSibnetHtmlEmbed,
  EMPTY,
};
