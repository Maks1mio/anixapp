export function isVideoEmbedPageUrl(url: string): boolean {
  return /kodikplayer\.com|kodik\.info|aniqit\.com|anixis\.com|aniqart\.com/i.test(url)
    && /\/(seria|video|movie|anime)\/\d+\/[0-9a-f]+\//i.test(url);
}

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
  const needsDirectFetch = isSibnet || isLibria || isKodik || isAniqit;

  if (isAniqit) {
    try { const u = new URL(url); url = u.origin + u.pathname; } catch {}
  }

  let playUrl       = url;
  let useVideo      = !iframe;
  let qualityMap: Record<string, string> = {};
  let currentQuality = '';

  // Kodik/aniqit — только через main process (иначе /ftor с localhost → 500)
  if (needsDirectFetch && (window as any).anixApi?.release?.getDirectVideoLink) {
    try {
      const res = await (window as any).anixApi.release.getDirectVideoLink(url);
      const directUrl: string | null = res?.directUrl ?? null;
      const remoteMap: Record<string, string> = res?.qualityMap ?? {};

      if (directUrl) {
        // /s/m/ на solodcdn: progressive MP4 часто 500 — оставляем HLS; иначе снимаем :hls: суффикс.
        const toPlayable = (u: string) => {
          if (/\/s\/m\//i.test(u)) {
            if (!/:hls:/i.test(u) && /\.mp4$/i.test(u)) return `${u}:hls:manifest.m3u8`;
            return u;
          }
          return u.replace(/:hls:manifest\.m3u8$/i, '').replace(/:hls:hls\.m3u8$/i, '');
        };
        const raw = directUrl.startsWith('http') ? directUrl : `https:${directUrl}`;

        if (Object.keys(remoteMap).length > 0) {
          for (const [k, v] of Object.entries(remoteMap)) {
            const rawEntry = typeof v === 'string' ? v : String(v ?? '');
            if (!rawEntry) continue;
            const abs = rawEntry.startsWith('http') ? rawEntry : `https:${rawEntry}`;
            qualityMap[k.replace(/p$/, '')] = stripKodikQueryParams(toPlayable(abs));
          }
          const best = QUALITY_PRIORITY.find(k => qualityMap[k] || qualityMap[k + 'p']) || Object.keys(qualityMap)[0];
          currentQuality = best || '';
          playUrl = currentQuality ? qualityMap[currentQuality] : stripKodikQueryParams(toPlayable(raw));
        } else {
          playUrl = stripKodikQueryParams(toPlayable(raw));
          if (isSibnet) {
            qualityMap = { '720': playUrl };
            currentQuality = '720';
          }
        }
        useVideo = true;
      }
    } catch {}
  }

  if (isEmbedPage && !useVideo) {
    playUrl = url;
    useVideo = false;
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

/** URL и заголовки для скачивания (как у плеера + прямой MP4 если есть) */
export async function resolveDownloadUrl(
  episodeUrl: string,
  iframe: boolean,
): Promise<{ url: string; headers: Record<string, string> } | null> {
  const embedUrl = episodeUrl.startsWith('http') ? episodeUrl : `https:${episodeUrl}`;

  let url = '';
  let headers: Record<string, string> = {};

  try {
    const direct = await window.anixApi?.release?.getDirectVideoLink(embedUrl);
    if (direct?.directUrl) {
      const stripped = direct.directUrl
        .replace(/:hls:manifest\.m3u8$/, '')
        .replace(/:hls:hls\.m3u8$/, '');
      url = stripped.startsWith('http') ? stripped : `https:${stripped}`;
      headers = (direct.downloadHeaders as Record<string, string>) ?? {};
    }
  } catch {}

  if (!url) {
    const resolved = await resolveEpisodeUrlWithRetry(embedUrl, iframe);
    url = resolved.playUrl;
    if (!url || isVideoEmbedPageUrl(url)) return null;
  }

  if (isVideoEmbedPageUrl(url)) return null;

  url = url
    .replace(/:hls:manifest\.m3u8$/, '')
    .replace(/:hls:hls\.m3u8$/, '');

  return { url, headers };
}
