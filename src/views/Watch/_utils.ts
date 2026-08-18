import { setEmbedMediaContext } from './core/hls-media-context';
import { normalizeSkipMarks, type SkipMarks } from './_skipMarks';

export function isVideoEmbedPageUrl(url: string): boolean {
  return /kodikplayer\.com|kodik\.info|aniqit\.com|anixis\.com|aniqart\.com/i.test(url)
    && /\/(seria|video|movie|anime)\/\d+\/[0-9a-f]+\//i.test(url);
}

export function isSocialEmbedUrl(url: string): boolean {
  return /youtube\.com|youtu\.be|youtube-nocookie\.com/i.test(url)
    || /vk\.com\/video_ext|vkvideo\.ru\/video_ext/i.test(url)
    || /rutube\.ru\/play\/embed/i.test(url)
    || /ok\.ru\/videoembed/i.test(url)
    || /my\.mail\.ru\/video\/embed/i.test(url)
    || /myvi\.(tv|top)\/embed/i.test(url)
    || /secvideo1\.online\/embed/i.test(url)
    || (/studiomir\.club/i.test(url) && /tsmplayer|\/embed/i.test(url))
    || /sovetromantica\.com\/embed/i.test(url);
}

export function isSibnetHtmlEmbed(url: string): boolean {
  return /sibnet\.ru/i.test(url) && /shell\.php/i.test(url) && /videoid=/i.test(url) && !/video_pid=/i.test(url);
}

/** Sibnet embed в iframe бесполезен: мёртвый ролик + CORS на счётчике. */
export function allowsIframeFallback(url: string): boolean {
  if (!url) return false;
  if (/sibnet\.ru/i.test(url)) return false;
  return true;
}

export function userPlaybackError(url: string): string {
  if (/sibnet\.ru/i.test(url)) return 'Видео на Sibnet недоступно';
  return 'Не удалось загрузить видео';
}

/** HTML-страница плеера — нельзя ставить в <video src>. */
export function isUnplayableVideoSrc(url: string): boolean {
  if (!url) return true;
  if (url.startsWith('/') || url.startsWith('anix-local:')) return false;
  return isVideoEmbedPageUrl(url) || isSocialEmbedUrl(url) || isSibnetHtmlEmbed(url);
}

function inBrowserWithoutElectron(): boolean {
  return typeof window !== 'undefined' && !(window as any).electron;
}

function canUseViteMediaProxy(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (!import.meta.env.DEV) return false;
    const { hostname, port } = window.location;
    return (hostname === '127.0.0.1' || hostname === 'localhost') && port === '5173';
  } catch {
    return false;
  }
}

function hostNeedsMediaProxy(host: string): boolean {
  const h = host.replace(/^www\./, '').toLowerCase();
  return /okcdn|vkvd|vkuservideo|mycdn|userapi|sibnet|solodcdn|kodik|rutube|libria|anilib|collaps|studiomir/i.test(h);
}

/** CDN/HLS через same-origin прокси (браузер LAN + Electron dev), иначе CORS / Referer. */
export function toCorsSafePlayUrl(url: string, referer?: string): string {
  const useProxy = inBrowserWithoutElectron() || canUseViteMediaProxy();
  if (!url || !useProxy) return url;
  if (url.startsWith('/') || url.startsWith('anix-local:') || url.includes('/__anix/media')) return url;
  if (isUnplayableVideoSrc(url)) return url;
  try {
    const parsed = new URL(url.startsWith('http') ? url : `https:${url}`);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return url;
    if (!hostNeedsMediaProxy(parsed.hostname)) return url;
    let out = `/__anix/media?u=${encodeURIComponent(parsed.href)}`;
    const ref = referer?.trim();
    if (ref) out += `&ref=${encodeURIComponent(ref)}`;
    return out;
  } catch {
    return url;
  }
}

export function isHlsUrl(url: string): boolean {
  if (/\.m3u8/i.test(url) || url.includes(':hls:manifest')) return true;
  // VK / OK CDN: master/media playlist без расширения .m3u8
  if (/okcdn\.ru/i.test(url) && /\/video\/?(\?|$)/i.test(url)) return true;
  return false;
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
  if (!isFinite(t) || isNaN(t) || t < 0) return '0:00';
  const totalSec = Math.floor(t);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
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
const QUALITY_PRIORITY = ['2160', '2160p', '1440', '1440p', '1080', '1080p', '720', '720p', '480', '480p', '360', '360p', '240', '240p'];

export async function resolveEpisodeUrl(
  episodeUrl: string,
  iframe: boolean,
): Promise<{ playUrl: string; useVideo: boolean; qualityMap: Record<string, string>; currentQuality: string; skip: SkipMarks | null }> {
  let url = episodeUrl.startsWith('http') ? episodeUrl : `https:${episodeUrl}`;
  url = stripKodikQueryParams(url);
  const host = (url.match(/https?:\/\/([^/]+)/) || [])[1] || '';
  const isAniqit   = /aniqit\.com|anixis\.com|aniqart\.com/i.test(host);
  const isKodik    = /kodikplayer\.com|kodik\.info/i.test(host);
  const isSibnet   = /sibnet\.ru/i.test(host);
  const isLibria   = /aniliberty\.top|anilibria\.(tv|top)|libria\.fun/i.test(host);
  const isVk       = /vk\.com|vk\.ru|vkvideo/i.test(host);
  const isRutube   = /rutube\.ru/i.test(host);
  const isOk       = /ok\.ru|odnoklassniki/i.test(host);
  const isStudioMir = /studiomir\.club/i.test(host);
  const isYoutube  = /youtube\.com|youtu\.be/i.test(host);
  const isEmbedPage = isAniqit || isKodik;
  const needsDirectFetch = isSibnet || isLibria || isKodik || isAniqit || isVk || isRutube || isOk || isStudioMir;

  if (isAniqit) {
    try { const u = new URL(url); url = u.origin + u.pathname; } catch {}
  }

  let playUrl       = url;
  let useVideo      = !iframe && !isYoutube && !isSocialEmbedUrl(url) && !isSibnetHtmlEmbed(url);
  let qualityMap: Record<string, string> = {};
  let currentQuality = '';
  let embedReferer = url;
  let skip: SkipMarks | null = null;

  setEmbedMediaContext(url);

  if (needsDirectFetch && (window as any).anixApi?.release?.getDirectVideoLink) {
    try {
      const res = await (window as any).anixApi.release.getDirectVideoLink(url);
      const directUrl: string | null = res?.directUrl ?? null;
      const remoteMap: Record<string, string> = res?.qualityMap ?? {};
      const dlHeaders = (res?.downloadHeaders as Record<string, string> | undefined) ?? {};
      skip = normalizeSkipMarks(res?.skip);
      setEmbedMediaContext(url, dlHeaders);
      if (dlHeaders.Referer) embedReferer = dlHeaders.Referer;

      if (directUrl && !isUnplayableVideoSrc(directUrl)) {
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
            if (!rawEntry || isUnplayableVideoSrc(rawEntry)) continue;
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
        useVideo = !isUnplayableVideoSrc(playUrl);
      }
    } catch {}
  }

  if (useVideo && isUnplayableVideoSrc(playUrl)) {
    useVideo = false;
    playUrl = url;
  }

  if ((isEmbedPage || isSocialEmbedUrl(url) || isSibnetHtmlEmbed(url) || isYoutube) && !useVideo) {
    playUrl = url;
    useVideo = false;
  }

  if (useVideo) {
    playUrl = toCorsSafePlayUrl(playUrl, embedReferer);
    for (const k of Object.keys(qualityMap)) {
      qualityMap[k] = toCorsSafePlayUrl(qualityMap[k], embedReferer);
    }
  } else {
    setEmbedMediaContext(url);
  }

  if (!useVideo && iframe) { playUrl = url; useVideo = false; }
  return { playUrl, useVideo, qualityMap, currentQuality, skip };
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
  const abs = episodeUrl.startsWith('http') ? episodeUrl : `https:${episodeUrl}`;
  const iframeOnly = /youtube\.com|youtu\.be/i.test(abs);
  const retryableSocial = /vk\.com|vkvideo|rutube\.ru|ok\.ru|studiomir/i.test(abs);
  const attempts = iframeOnly ? 1 : maxAttempts;
  let lastResult = { playUrl: abs, useVideo: false, qualityMap: {} as Record<string, string>, currentQuality: '', skip: null as SkipMarks | null };
  for (let i = 0; i < attempts; i++) {
    try {
      const result = await resolveEpisodeUrl(episodeUrl, iframe);
      if (result.useVideo && result.playUrl) return result;
      lastResult = result;
      if (iframeOnly || (isSocialEmbedUrl(abs) && !retryableSocial)) {
        return result.playUrl ? result : lastResult;
      }
    } catch {
      // swallow, retry
    }
    if (i < attempts - 1) await new Promise<void>(r => setTimeout(r, 300));
  }
  return lastResult;
}

function unwrapMediaProxyUrl(url: string): string {
  try {
    const u = url.startsWith('/') ? new URL(url, 'http://local.invalid') : new URL(url);
    if (u.pathname === '/__anix/media' || u.pathname.endsWith('/__anix/media')) {
      const target = u.searchParams.get('u');
      if (target) return target;
    }
  } catch { /* keep */ }
  return url;
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
    if (direct?.directUrl && !isUnplayableVideoSrc(direct.directUrl)) {
      const stripped = direct.directUrl
        .replace(/:hls:manifest\.m3u8$/, '')
        .replace(/:hls:hls\.m3u8$/, '');
      url = stripped.startsWith('http') ? stripped : `https:${stripped}`;
      headers = (direct.downloadHeaders as Record<string, string>) ?? {};
    }
  } catch {}

  if (!url) {
    const resolved = await resolveEpisodeUrlWithRetry(embedUrl, iframe);
    url = unwrapMediaProxyUrl(resolved.playUrl);
    if (!url || isUnplayableVideoSrc(url)) return null;
  }

  url = unwrapMediaProxyUrl(url);
  if (isUnplayableVideoSrc(url) || url.includes('/__anix/media')) return null;

  url = url
    .replace(/:hls:manifest\.m3u8$/, '')
    .replace(/:hls:hls\.m3u8$/, '');

  return { url, headers };
}
