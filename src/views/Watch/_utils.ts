import { KodikParser } from 'anixapi';

export function isHlsUrl(url: string): boolean {
  return /\.m3u8/i.test(url) || url.includes(':hls:manifest');
}

export function stripKodikQueryParams(url: string): string {
  try {
    const u = new URL(url);
    if (/kodikplayer\.com|kodik\.info|aniqit\.com|anixis\.com|aniqart\.com/i.test(u.hostname)) {
      return u.origin + u.pathname;
    }
    return url;
  } catch {
    return url;
  }
}

export function fmtTime(t: number): string {
  if (!isFinite(t) || isNaN(t)) return '0:00';
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function lobbyActionText(type: string): string {
  switch (type) {
    case 'play':          return 'продолжил просмотр';
    case 'pause':         return 'поставил на паузу';
    case 'seek':          return 'перемотал';
    case 'changeEpisode': return 'сменил серию/озвучку';
    case 'joined':        return 'присоединился к просмотру';
    case 'left':          return 'покинул комнату';
    case 'proposal':      return 'предложил другое аниме';
    default:              return type;
  }
}

/** Dubbers that are permanently closed and should never appear in any picker */
const DUBBER_BLACKLIST = /sovet.?romantica|\bsr\b/i;
export function isDubberBlacklisted(name: string): boolean {
  return DUBBER_BLACKLIST.test(name);
}

/** Quality label priorities when auto-selecting default */
const QUALITY_PRIORITY = ['1080', '1080p', '720', '720p', '480', '480p', '360', '360p'];

export async function resolveEpisodeUrl(
  episodeUrl: string,
  iframe: boolean,
): Promise<{ playUrl: string; useVideo: boolean; qualityMap: Record<string, string>; currentQuality: string }> {
  let url = episodeUrl.startsWith('http') ? episodeUrl : `https:${episodeUrl}`;
  url = stripKodikQueryParams(url);
  const host = (url.match(/https?:\/\/([^/]+)/) || [])[1] || '';
  const isAniqit   = /aniqit\.com|anixis\.com|aniqart\.com/i.test(host);
  const isKodik    = /kodikplayer\.com|kodik\.info/i.test(host);
  const isSibnet   = /sibnet\.ru/i.test(host);
  const isLibria   = /aniliberty\.top|anilibria\.tv|libria\.fun/i.test(host);
  const isEmbedPage = isAniqit || isKodik;
  const needsDirectFetch = isSibnet || isLibria;

  if (isAniqit) {
    try { const u = new URL(url); url = u.origin + u.pathname; } catch {}
  }

  let playUrl       = url;
  let useVideo      = !iframe;
  let qualityMap: Record<string, string> = {};
  let currentQuality = '';

  if (isEmbedPage) {
    try {
      const links = await KodikParser.getDirectLinks(url);
      if (links && typeof links === 'object') {
        const rawLinks = links as Record<string, { src: string }[]>;

        // Build quality map: label → direct URL
        for (const [key, arr] of Object.entries(rawLinks)) {
          const src = arr?.[0]?.src;
          if (src) {
            const raw = src.startsWith('http') ? src : `https:${src}`;
            qualityMap[key] = stripKodikQueryParams(raw);
          }
        }

        // Pick default quality (prefer 720, then 1080, then 480, etc.)
        const best =
          QUALITY_PRIORITY.find(k => qualityMap[k]) ||
          Object.keys(qualityMap)[0];

        if (best) {
          playUrl        = qualityMap[best];
          currentQuality = best;
          useVideo       = true;
        }
      }
    } catch {}
    if (!useVideo) { playUrl = url; useVideo = false; }
  }

  if ((needsDirectFetch || (!useVideo && !isEmbedPage)) && (window as any).anixApi?.release?.getDirectVideoLink) {
    try {
      const res = await (window as any).anixApi.release.getDirectVideoLink(url);
      const directUrl: string | null = res?.directUrl ?? null;
      const remoteMap: Record<string, string> = res?.qualityMap ?? {};

      if (directUrl) {
        const raw = directUrl.startsWith('http') ? directUrl : `https:${directUrl}`;

        // Merge remote quality map (Libria returns multiple qualities)
        if (Object.keys(remoteMap).length > 0) {
          for (const [k, v] of Object.entries(remoteMap)) {
            qualityMap[k] = (v as string).startsWith('http') ? (v as string) : `https:${v}`;
          }
          const best = QUALITY_PRIORITY.find(k => qualityMap[k]) || Object.keys(qualityMap)[0];
          currentQuality = best || '';
          playUrl  = currentQuality ? qualityMap[currentQuality] : stripKodikQueryParams(raw);
        } else {
          playUrl = stripKodikQueryParams(raw);
          if (isSibnet) {
            qualityMap     = { '720': playUrl };
            currentQuality = '720';
          }
        }
        useVideo = true;
      }
    } catch {}
  }

  if (!useVideo && iframe) { playUrl = url; useVideo = false; }
  return { playUrl, useVideo, qualityMap, currentQuality };
}

/**
 * Calls resolveEpisodeUrl with automatic fast retry.
 * Retries immediately if the URL could not be resolved (useVideo=false or empty playUrl).
 */
export async function resolveEpisodeUrlWithRetry(
  episodeUrl: string,
  iframe: boolean,
  maxAttempts = 4,
): Promise<Awaited<ReturnType<typeof resolveEpisodeUrl>>> {
  let lastResult = { playUrl: '', useVideo: false, qualityMap: {} as Record<string, string>, currentQuality: '' };
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const result = await resolveEpisodeUrl(episodeUrl, iframe);
      if (result.useVideo && result.playUrl) return result;
      lastResult = result;
    } catch {
      // swallow, retry
    }
    // Tiny delay between retries to avoid hammering the server
    if (i < maxAttempts - 1) await new Promise<void>(r => setTimeout(r, 300));
  }
  return lastResult;
}
