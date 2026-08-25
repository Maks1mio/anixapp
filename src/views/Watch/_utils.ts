import { setEmbedMediaContext, getEmbedCookie } from './core/hls-media-context';
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
    || /(?:secvideo1|csst|sstrge)\.online\/embed/i.test(url)
    || (/studiomir\.club/i.test(url) && /tsmplayer|\/embed/i.test(url))
    || /sovetromantica\.com\/embed/i.test(url);
}

export function isSibnetHtmlEmbed(url: string): boolean {
  return /sibnet\.ru/i.test(url) && /shell\.php/i.test(url) && /videoid=/i.test(url) && !/video_pid=/i.test(url);
}

/** HTML iframe AniLibria — нельзя ставить в <video> / качать как файл. */
export function isLibriaHtmlEmbed(url: string): boolean {
  if (!url) return false;
  if (!/aniliberty|anilibria|libria\.fun/i.test(url)) return false;
  if (/\.m3u8(\?|$)/i.test(url) || /cache\.libria\.fun/i.test(url)) return false;
  return /iframe\.php/i.test(url) || /\/public\/iframe/i.test(url);
}

/** Sibnet embed в iframe бесполезен: мёртвый ролик + CORS на счётчике. */
export function allowsIframeFallback(url: string): boolean {
  if (!url) return false;
  if (/sibnet\.ru/i.test(url)) return false;
  return true;
}

export function userPlaybackError(url: string): string {
  if (/sibnet\.ru/i.test(url)) return 'Видео на Sibnet недоступно';
  if (/kodikplayer|kodik\.info|solodcdn|kodikcdn/i.test(url)) {
    return 'CDN Kodik недоступен с вашей сети — попробуйте другую озвучку или VPN';
  }
  if (isLibriaHtmlEmbed(url) || /libria\.fun|anilibria/i.test(url)) {
    return 'Релиз недоступен на AniLibria — попробуйте другой источник (например Kodik)';
  }
  return 'Не удалось загрузить видео';
}

/** HTML-страница плеера — нельзя ставить в <video src>. */
export function isUnplayableVideoSrc(url: string): boolean {
  if (!url) return true;
  if (url.startsWith('/') || url.startsWith('anix-local:')) return false;
  return isVideoEmbedPageUrl(url)
    || isSocialEmbedUrl(url)
    || isSibnetHtmlEmbed(url)
    || isLibriaHtmlEmbed(url);
}

function inBrowserWithoutElectron(): boolean {
  return typeof window !== 'undefined' && !(window as any).electron;
}

function canUseViteMediaProxy(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (!import.meta.env.DEV) return false;
    const { hostname, port } = window.location;
    if (port !== '5173') return false;
    if (hostname === '127.0.0.1' || hostname === 'localhost') return true;
    return /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(hostname);
  } catch {
    return false;
  }
}

function hostNeedsMediaProxy(host: string): boolean {
  const h = host.replace(/^www\./, '').toLowerCase();
  return /okcdn|vkvd|vkuservideo|mycdn|userapi|sibnet|solodcdn|kodik|rutube|libria|anilib|collaps|studiomir|animedia|zerocdn|imgsmail|mail\.ru|myvi|secvideo1|csst\.online|sstrge|sovetromantica/i.test(h);
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
    const cookie = getEmbedCookie();
    if (cookie) out += `&ck=${encodeURIComponent(cookie)}`;
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

/** В APK показываются все озвучки, включая SovetRomantica. */
export function isDubberBlacklisted(_name: string): boolean {
  return false;
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
  const isMailRu   = /my\.mail\.ru/i.test(host);
  const isMyvi     = /myvi\.(tv|top)/i.test(host);
  const isAllvideo = /(?:secvideo1|csst|sstrge)\.online/i.test(host);
  const isSovetRomantica = /sovetromantica\.com/i.test(host);
  const isYoutube  = /youtube\.com|youtu\.be/i.test(host);
  const isEmbedPage = isAniqit || isKodik;
  const needsDirectFetch = isSibnet || isLibria || isKodik || isAniqit || isVk || isRutube || isOk || isStudioMir
    || isMailRu || isMyvi || isAllvideo || isSovetRomantica;

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
          const abs = u.startsWith('http') ? u : `https:${u}`;
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
  const retryableSocial = /vk\.com|vkvideo|rutube\.ru|ok\.ru|studiomir|mail\.ru|myvi\.|secvideo1|csst\.online|sstrge|sovetromantica/i.test(abs);
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
): Promise<{ url: string; headers: Record<string, string>; skip: SkipMarks | null } | null> {
  const embedUrl = episodeUrl.startsWith('http') ? episodeUrl : `https:${episodeUrl}`;
  const isLibriaEmbed = isLibriaHtmlEmbed(embedUrl)
    || /aniliberty|anilibria|libria\.fun/i.test(embedUrl);

  let url = '';
  let headers: Record<string, string> = {};
  let skip: SkipMarks | null = null;

  try {
    const direct = await window.anixApi?.release?.getDirectVideoLink(embedUrl);
    if (direct?.directUrl && !isUnplayableVideoSrc(direct.directUrl)) {
      const stripped = direct.directUrl
        .replace(/:hls:manifest\.m3u8$/, '')
        .replace(/:hls:hls\.m3u8$/, '');
      url = stripped.startsWith('http') ? stripped : `https:${stripped}`;
      headers = (direct.downloadHeaders as Record<string, string>) ?? {};
      skip = normalizeSkipMarks(direct?.skip);
    }
  } catch {}

  // AniLibria: никогда не качаем iframe.php — только HLS с cache.libria.fun
  if (!url && isLibriaEmbed) return null;

  if (!url) {
    const resolved = await resolveEpisodeUrlWithRetry(embedUrl, iframe);
    url = unwrapMediaProxyUrl(resolved.playUrl);
    skip = resolved.skip ?? skip;
    if (!url || isUnplayableVideoSrc(url)) return null;
  }

  url = unwrapMediaProxyUrl(url);
  if (isUnplayableVideoSrc(url) || url.includes('/__anix/media')) return null;

  url = url
    .replace(/:hls:manifest\.m3u8$/, '')
    .replace(/:hls:hls\.m3u8$/, '');

  return { url, headers, skip };
}
