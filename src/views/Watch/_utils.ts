import { KodikParser } from 'anixartjs';

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

export async function resolveEpisodeUrl(
  episodeUrl: string,
  iframe: boolean,
): Promise<{ playUrl: string; useVideo: boolean }> {
  let url = episodeUrl.startsWith('http') ? episodeUrl : `https:${episodeUrl}`;
  url = stripKodikQueryParams(url);
  const host = (url.match(/https?:\/\/([^/]+)/) || [])[1] || '';
  const isAniqit  = /aniqit\.com|anixis\.com|aniqart\.com/i.test(host);
  const isKodik   = /kodikplayer\.com|kodik\.info/i.test(host);
  const isEmbedPage = isAniqit || isKodik;

  if (isAniqit) {
    try { const u = new URL(url); url = u.origin + u.pathname; } catch {}
  }

  let playUrl  = url;
  let useVideo = !iframe;

  if (isEmbedPage) {
    try {
      const links = await KodikParser.getDirectLinks(url);
      if (links && typeof links === 'object') {
        const pick = (q: string) =>
          (links as Record<string, { src: string }[]>)[q]?.[0]?.src;
        const src = pick('720') || pick('720p') || pick('1080') || pick('1080p') || pick('480') || pick('480p')
          || (Object.values(links)[0] as { src: string }[])?.[0]?.src;
        if (src) {
          const raw = src.startsWith('http') ? src : `https:${src}`;
          playUrl  = stripKodikQueryParams(raw);
          useVideo = true;
        }
      }
    } catch {}
    if (!useVideo) { playUrl = url; useVideo = false; }
  }

  if (!useVideo && !isEmbedPage && (window as any).anixApi?.release?.getDirectVideoLink) {
    try {
      const { directUrl } = await (window as any).anixApi.release.getDirectVideoLink(url);
      if (directUrl) {
        const raw = directUrl.startsWith('http') ? directUrl : `https:${directUrl}`;
        playUrl  = stripKodikQueryParams(raw);
        useVideo = true;
      }
    } catch {}
  }

  if (!useVideo && iframe) { playUrl = url; useVideo = false; }
  return { playUrl, useVideo };
}
