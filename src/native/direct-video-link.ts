/**
 * Прямые ссылки Sibnet и AniLibria для Android (browser-bridge).
 * Порт соответствующих частей electron/lib/direct-video-link.js; запросы — через
 * httpGet, чтобы Referer доходил до сайта (см. native-http.ts).
 */
import { httpGet } from './native-http';
import { diagUrl, playDiag } from '../utils/play-diag';

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
const PRIO = ['2160', '1440', '1080', '720', '480', '360', '240'];

export type DirectVideoResult = {
  directUrl: string | null;
  quality: string | null;
  qualityMap: Record<string, string>;
  downloadHeaders: Record<string, string>;
  skip: unknown;
};

function empty(skip: unknown = null): DirectVideoResult {
  return { directUrl: null, quality: null, qualityMap: {}, downloadHeaders: {}, skip };
}

function toAbs(src: string): string {
  if (src.startsWith('http')) return src;
  return `https:${src.startsWith('//') ? src : `//${src.replace(/^\/+/, '')}`}`;
}

function isSibnetHtmlEmbed(url: string): boolean {
  return /sibnet\.ru/i.test(url) && /shell\.php|videoid=/i.test(url) && !/\.mp4(\?|$)/i.test(url);
}

function isLibriaHtmlEmbed(url: string): boolean {
  if (!/aniliberty|anilibria|libria\.fun/i.test(url)) return false;
  if (/\.m3u8(\?|$)/i.test(url) || /cache\.libria\.fun/i.test(url)) return false;
  return /iframe\.php|\/public\//i.test(url);
}

function resultFromMap(map: Record<string, string>, headers: Record<string, string>, skip: unknown): DirectVideoResult {
  const cleaned: Record<string, string> = {};
  for (const [k, v] of Object.entries(map)) {
    if (!v) continue;
    const abs = toAbs(v);
    if (isSibnetHtmlEmbed(abs) || isLibriaHtmlEmbed(abs)) continue;
    cleaned[k.replace(/p$/, '')] = abs;
  }
  const best = PRIO.find((k) => cleaned[k]) || Object.keys(cleaned)[0];
  if (!best) return empty(skip);
  return { directUrl: cleaned[best], quality: best, qualityMap: cleaned, downloadHeaders: headers, skip };
}

// ── Sibnet ──────────────────────────────────────────────────────────────────

function extractSibnetSrcPath(html: string): string | null {
  if (!html || /видео удалено|ролик удал[её]н|видео не найдено|video (is )?deleted|video not found/i.test(html)) {
    return null;
  }
  const patterns = [
    /player\.src\(\[\s*\{\s*src:\s*"(\/[^"]+)"/i,
    /src:\s*"(\/v\/[^"]+\.mp4[^"]*)"/i,
    /src:\s*"(\/shell\.php\?[^"]+)"/i,
    /src:\s*"(\/[^"]+)"/i,
    /src:\s*'(\/[^']+)'/i,
  ];
  for (const re of patterns) {
    const m = re.exec(html);
    if (m?.[1]) return m[1];
  }
  return null;
}

async function followSibnetLocation(videoUrl: string, embedUrl: string, hops = 0): Promise<string | null> {
  if (hops > 5) return null;
  const res = await httpGet(videoUrl, {
    followRedirects: false,
    timeoutMs: 10_000,
    headers: { Referer: embedUrl, 'User-Agent': BROWSER_UA, Accept: '*/*', Range: 'bytes=0-0' },
  });
  const loc = res.headers.location;
  if (loc && res.status >= 300 && res.status < 400) {
    let next = loc.replace(/:443/g, '');
    if (next.startsWith('//')) next = `https:${next}`;
    else if (next.startsWith('/')) next = `https://video.sibnet.ru${next}`;
    if (next === videoUrl) return next;
    return (await followSibnetLocation(next, embedUrl, hops + 1)) || next;
  }
  const ct = (res.headers['content-type'] || '').toLowerCase();
  return /video\/|octet-stream|mp4|mpegurl/.test(ct) || res.status === 206 ? videoUrl : null;
}

async function getSibnetDirectLink(embedUrl: string): Promise<DirectVideoResult> {
  const page = await httpGet(embedUrl, {
    headers: {
      'User-Agent': BROWSER_UA,
      Referer: 'https://sibnet.ru/',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8',
    },
  });
  const srcPath = page.ok ? extractSibnetSrcPath(page.text) : null;
  playDiag('sibnet:page', { status: page.status, src: srcPath ? 'найден' : 'нет' });
  if (!srcPath) return empty();
  const videoUrl = srcPath.startsWith('http') ? srcPath : `https://video.sibnet.ru${srcPath}`;
  const direct = (await followSibnetLocation(videoUrl, embedUrl).catch(() => null))
    || (/\.mp4(\?|$)/i.test(videoUrl) ? videoUrl : null);
  playDiag('sibnet:direct', { url: diagUrl(direct) });
  if (!direct || isSibnetHtmlEmbed(direct)) return empty();
  return {
    directUrl: direct,
    quality: '720',
    qualityMap: { '720': direct },
    downloadHeaders: { Referer: embedUrl, 'User-Agent': BROWSER_UA },
    skip: null,
  };
}

// ── AniLibria ───────────────────────────────────────────────────────────────

function parseLibriaFileField(raw: string): Record<string, string> | null {
  const cleaned = String(raw).replace(/\\\//g, '/');
  const map: Record<string, string> = {};
  const qualRe = /\[(\d+)p\]([^,[]+)/g;
  let m: RegExpExecArray | null;
  while ((m = qualRe.exec(cleaned)) !== null) {
    const src = m[2].trim();
    if (src) map[m[1]] = toAbs(src);
  }
  if (Object.keys(map).length) return map;
  if (cleaned && !cleaned.startsWith('[') && /\.(mp4|mkv|webm|m3u8)(\?|$)/i.test(cleaned)) {
    return { '720': toAbs(cleaned) };
  }
  return null;
}

async function scrapeLibriaIframe(embedUrl: string, epNum: number): Promise<Record<string, string> | null> {
  try {
    const res = await httpGet(embedUrl, {
      headers: { Accept: 'text/html,application/xhtml+xml', Referer: embedUrl.split('?')[0], 'User-Agent': BROWSER_UA },
    });
    if (!res.ok) return null;
    const html = res.text;
    const block = new RegExp(`"s${epNum}"[^]*?"file":"(.*?)"`, 's').exec(html);
    if (block?.[1]) {
      const parsed = parseLibriaFileField(block[1]);
      if (parsed) return parsed;
    }
    const files = [...html.matchAll(/"file"\s*:\s*"((?:\\.|[^"\\])*)"/g)].map((x) => x[1]);
    if (files.length) return parseLibriaFileField(files[epNum - 1] || files[0]);
  } catch { /* следующий кандидат */ }
  return null;
}

async function getLibriaDirectLink(url: string, host: string): Promise<DirectVideoResult> {
  const parsed = new URL(url);
  const releaseId = parsed.searchParams.get('id');
  const epOrdinal = parsed.searchParams.get('ep');
  if (!releaseId || !epOrdinal) return empty();
  const epNum = parseInt(epOrdinal, 10);
  const headers = { Referer: 'https://anilibria.top/', 'User-Agent': BROWSER_UA };

  const qs = `id=${encodeURIComponent(releaseId)}&ep=${encodeURIComponent(epOrdinal)}`;
  const candidates = [...new Set([
    url,
    `https://anixart.libria.fun/public/iframe.php?${qs}`,
    `https://anilibria.top/public/iframe.php?${qs}`,
    `https://aniliberty.top/public/iframe.php?${qs}`,
  ])];
  const apiBases = host.includes('aniliberty') || host.includes('libria.fun')
    ? ['https://aniliberty.top/api/v1/anime/releases', 'https://anilibria.top/api/v1/anime/releases']
    : ['https://anilibria.top/api/v1/anime/releases', 'https://aniliberty.top/api/v1/anime/releases'];

  const [directMap, apiBody] = await Promise.all([
    (async () => {
      for (const c of candidates) {
        const map = await scrapeLibriaIframe(c, epNum);
        if (map && Object.keys(map).length) return map;
      }
      return null;
    })(),
    (async () => {
      for (const base of apiBases) {
        try {
          const r = await httpGet(`${base}/${releaseId}`, { headers: { Accept: 'application/json', 'User-Agent': BROWSER_UA } });
          if (r.ok) return JSON.parse(r.text) as { episodes?: Array<Record<string, unknown>> };
        } catch { /* следующий хост */ }
      }
      return null;
    })(),
  ]);

  const ep = (apiBody?.episodes || []).find((e) => String(e.ordinal) === String(epNum));
  const skip = ep && (ep.opening || ep.ending) ? { opening: ep.opening ?? null, ending: ep.ending ?? null } : null;
  playDiag('libria:direct', { iframe: directMap ? 'найден' : 'нет', api: ep ? 'серия найдена' : 'нет' });
  if (directMap && Object.keys(directMap).length) return resultFromMap(directMap, headers, skip);
  if (!ep) return empty(skip);
  const map: Record<string, string> = {};
  if (typeof ep.hls_1080 === 'string') map['1080'] = ep.hls_1080;
  if (typeof ep.hls_720 === 'string') map['720'] = ep.hls_720;
  if (typeof ep.hls_480 === 'string') map['480'] = ep.hls_480;
  return resultFromMap(map, headers, skip);
}

/** Не Kodik: Sibnet и AniLibria; остальное — iframe, как было. */
export async function getOtherDirectVideoLink(embedUrl: string): Promise<DirectVideoResult | null> {
  const url = embedUrl.startsWith('http') ? embedUrl : `https:${embedUrl}`;
  let host = '';
  try { host = new URL(url).hostname.toLowerCase(); } catch { return null; }
  try {
    if (host.includes('sibnet')) return await getSibnetDirectLink(url);
    if (host.includes('aniliberty') || host.includes('anilibria') || host.includes('libria')) {
      return await getLibriaDirectLink(url, host);
    }
  } catch (err) {
    playDiag('direct:error', { host, error: String((err as Error)?.message || err) });
    return empty();
  }
  return null;
}
