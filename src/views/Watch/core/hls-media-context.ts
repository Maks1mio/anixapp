import type { HlsConfig } from 'hls.js';

let embedReferer = '';
let embedSourceUrl = '';
let embedCookie = '';

export function setEmbedMediaContext(sourceEmbedUrl: string, headers?: Record<string, string>): void {
  embedSourceUrl = sourceEmbedUrl || '';
  const fromHeaders = headers?.Referer || headers?.referer;
  embedReferer = fromHeaders || sourceEmbedUrl || '';
  embedCookie = headers?.Cookie || headers?.cookie || '';
}

export function clearEmbedMediaContext(): void {
  embedReferer = '';
  embedSourceUrl = '';
  embedCookie = '';
}

export function getEmbedCookie(): string {
  return embedCookie;
}

function hostNeedsEmbedReferer(host: string): boolean {
  const h = host.toLowerCase();
  return /^vkvd/i.test(h)
    || h.includes('vkuservideo')
    || h.includes('okcdn')
    || h.includes('mycdn')
    || h.includes('userapi')
    || h.includes('rutube')
    || h.includes('sibnet')
    || h.includes('solodcdn')
    || h.includes('kodik')
    || h.includes('zerocdn')
    || h.includes('animedia')
    || h.includes('libria')
    || h.includes('anilib')
    || h.includes('studiomir')
    || h.includes('mail.ru')
    || h.includes('imgsmail')
    || h.includes('myvi')
    || /secvideo1|csst\.online|sstrge/.test(h)
    || h.includes('sovetromantica');
}

export function refererForMediaUrl(url: string): string | undefined {
  if (!embedReferer) return undefined;
  try {
    const host = new URL(url.startsWith('http') ? url : `https:${url}`).host;
    if (hostNeedsEmbedReferer(host)) return embedReferer;
  } catch { /* ignore */ }
  return undefined;
}

export function buildHlsConfig(): Partial<HlsConfig> {
  return {
    manifestLoadingTimeOut: 12_000,
    fragLoadingTimeOut: 12_000,
    xhrSetup: (xhr, url) => {
      const ref = refererForMediaUrl(url);
      if (!ref) return;
      try {
        xhr.setRequestHeader('Referer', ref);
      } catch { /* ignore */ }
    },
  };
}

export function getEmbedSourceUrl(): string {
  return embedSourceUrl;
}
