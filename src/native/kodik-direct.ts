/**
 * Резолвер прямой ссылки Kodik для Capacitor / browser-bridge.
 * Тот же протокол, что electron/kodik-direct.js — без Node Buffer.
 */

const KODIK_PLAYER_ORIGIN = 'https://kodikplayer.com/';
const KODIK_PLAIN_SRC = /(?:kodik-storage|solodcdn)\.com\//i;
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
const PRIO = ['1080', '1080p', '720', '720p', '480', '480p', '360', '360p'];

const EMPTY = Object.freeze({
  directUrl: null as string | null,
  quality: null as string | null,
  qualityMap: {} as Record<string, string>,
  downloadHeaders: {} as Record<string, string>,
  skip: null as unknown,
});

function isCapacitor(): boolean {
  return typeof window !== 'undefined'
    && !!(window as Window & { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.();
}

function normalizeKodikEmbedUrl(embedUrl: string): string {
  let url = embedUrl.startsWith('http') ? embedUrl : `https:${embedUrl}`;
  try {
    const u = new URL(url);
    url = u.origin + u.pathname;
  } catch { /* keep */ }
  return url;
}

function decryptKodikSrc(src: string): string {
  const zCode = 'Z'.charCodeAt(0);
  const decryptedBase64 = src.replace(/[a-zA-Z]/g, (ch) => {
    let code = ch.charCodeAt(0);
    code += 18;
    return String.fromCharCode((code <= zCode ? 90 : 122) >= code ? code : code - 26);
  });
  const binary = atob(decryptedBase64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder('utf-8').decode(bytes);
}

function parseKodikLinkFromUrl(pageUrl: string) {
  const m = pageUrl.match(/\/(seria|video|movie|anime)\/(\d+)\/([0-9a-f]+)\//i);
  if (!m) return null;
  return { type: m[1], id: m[2], hash: m[3] };
}

function parseKodikEmbedHtml(html: string) {
  return {
    hash: html.match(/\w+\.hash\s=\s'([^']+)';/is)?.[1],
    id: html.match(/\w+\.id\s=\s'([^']+)';/is)?.[1],
    type: html.match(/\w+\.type\s=\s'([^']+)';/is)?.[1],
  };
}

function parseClock(raw: string): number {
  const parts = String(raw || '').trim().split(':').map((n) => Number.parseInt(n, 10));
  if (parts.some((n) => !Number.isFinite(n))) return NaN;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] ?? NaN;
}

function parseKodikSkipButton(html: string): unknown {
  const m = String(html || '').match(/parseSkipButton\(\s*"([^"]*)"\s*,\s*"[^"]*"\s*\)/);
  if (!m) return null;
  const ranges = m[1].split(',').map((part) => {
    const bits = part.split('-');
    if (bits.length < 2) return null;
    const start = parseClock(bits[0]);
    const end = parseClock(bits[1]);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end - start < 2) return null;
    return { start, end };
  }).filter(Boolean) as { start: number; end: number }[];
  if (ranges.length >= 2) return { opening: ranges[0], ending: ranges[1] };
  if (ranges.length === 1) {
    return ranges[0].start >= 600
      ? { opening: null, ending: ranges[0] }
      : { opening: ranges[0], ending: null };
  }
  return null;
}

function decryptKodikLinks(links: Record<string, Array<{ src?: string }> | undefined>) {
  for (const sources of Object.values(links)) {
    if (!Array.isArray(sources)) continue;
    for (const source of sources) {
      if (!source?.src || KODIK_PLAIN_SRC.test(source.src) || /^https?:\/\//i.test(source.src) || source.src.startsWith('//')) {
        continue;
      }
      try {
        source.src = decryptKodikSrc(source.src);
      } catch { /* ignore */ }
    }
  }
  return links;
}

function preferPlayableKodikUrl(url: string): string {
  const abs = url.startsWith('http') ? url : url.startsWith('//') ? `https:${url}` : url;
  if (/:hls:/i.test(abs)) return abs;
  try {
    const parsed = new URL(abs);
    if (/solodcdn|kodik-storage|zerocdn|animedia|kodik-cdn/i.test(parsed.hostname)
      && /\.mp4$/i.test(parsed.pathname)) {
      parsed.pathname += ':hls:manifest.m3u8';
      return parsed.href;
    }
  } catch { /* keep */ }
  return abs;
}

async function fetchText(url: string, headers: Record<string, string> = {}): Promise<string> {
  const res = await fetch(url, {
    headers: { 'User-Agent': BROWSER_UA, ...headers },
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

async function fetchKodikFtorLinks(pageUrl: string, videoInfo: { type?: string; hash?: string; id?: string }) {
  const { type, hash, id } = videoInfo;
  if (!type || !hash || !id) return null;
  const ftorUrl = `https://kodikplayer.com/ftor?${new URLSearchParams({ type, hash, id }).toString()}`;
  const res = await fetch(ftorUrl, {
    headers: { Referer: pageUrl, Accept: 'application/json', 'User-Agent': BROWSER_UA },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const payload = await res.json() as { links?: Record<string, Array<{ src?: string }>> };
  if (!payload?.links || typeof payload.links !== 'object') return null;
  return decryptKodikLinks(payload.links);
}

async function resolveKodikEmbedUrl(embedUrl: string): Promise<string> {
  const url = normalizeKodikEmbedUrl(embedUrl);
  const host = (() => { try { return new URL(url).hostname; } catch { return ''; } })();
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

async function loadKodikPlayer(embedUrl: string) {
  const pageUrl = await resolveKodikEmbedUrl(embedUrl);
  let videoInfo = parseKodikLinkFromUrl(pageUrl);
  const html = await fetchText(pageUrl, {
    Referer: KODIK_PLAYER_ORIGIN,
    Accept: 'text/html,application/xhtml+xml',
  }).catch(() => '');
  const skip = parseKodikSkipButton(html);
  if (!videoInfo?.hash || !videoInfo?.id || !videoInfo?.type) {
    videoInfo = parseKodikEmbedHtml(html);
  }
  let links = null as ReturnType<typeof decryptKodikLinks> | null;
  try {
    links = await fetchKodikFtorLinks(pageUrl, videoInfo || {});
  } catch {
    links = null;
  }
  return { links, skip };
}

export async function getDirectVideoLink(embedUrl: string) {
  if (!embedUrl || typeof embedUrl !== 'string') return { ...EMPTY };
  const url = embedUrl.startsWith('http') ? embedUrl : `https:${embedUrl}`;
  const host = (() => { try { return new URL(url).hostname; } catch { return ''; } })();
  const toAbs = (src?: string) => (!src ? null : src.startsWith('http') ? src : `https:${src}`);

  try {
    if (host.includes('kodik') || host.includes('aniqit') || host.includes('anixis') || host.includes('aniqart')) {
      const { links, skip } = await loadKodikPlayer(url);
      if (!links || typeof links !== 'object') return { ...EMPTY, skip: skip || null };
      const qualityMap: Record<string, string> = {};
      for (const [key, arr] of Object.entries(links)) {
        const src = toAbs(arr?.[0]?.src);
        if (src) qualityMap[key.replace('p', '')] = preferPlayableKodikUrl(src);
      }
      const best = PRIO.find((k) => qualityMap[k]) || Object.keys(qualityMap)[0];
      const directUrl = best ? qualityMap[best] : null;
      const dlHeaders = directUrl
        ? { Referer: 'https://kodikplayer.com/', 'User-Agent': BROWSER_UA }
        : {};
      // На TV не пробиваем CDN заранее — это +4–6 с к старту. Играем сразу.
      if (!directUrl && !isCapacitor()) return { ...EMPTY, skip: skip || null };
      return {
        directUrl,
        quality: directUrl ? best : null,
        qualityMap: directUrl ? qualityMap : {},
        skip: skip || null,
        downloadHeaders: directUrl ? dlHeaders : {},
      };
    }
  } catch (err) {
    console.error('[kodik-direct]', err);
  }

  return { ...EMPTY };
}
