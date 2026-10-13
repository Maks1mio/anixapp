import Hls from 'hls.js';
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

/**
 * Capacitor (CapacitorHttp) подменяет XHR своим интерцептором: `responseURL` приходит как
 * `https://localhost/_capacitor_http_interceptor_?u=<реальный URL>`, и hls.js резолвит относительные сегменты
 * плейлиста от localhost (404). Возвращаем реальный URL в ответ загрузчика.
 */
function unwrapInterceptorUrl(url: unknown): string | null {
  if (typeof url !== 'string' || !url.includes('_capacitor_http_interceptor_')) return null;
  try {
    const u = new URL(url).searchParams.get('u');
    return u && /^https?:/i.test(u) ? u : null;
  } catch {
    return null;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const BaseLoader = (Hls as any).DefaultConfig.loader as new (config: unknown) => any;

class CapacitorSafeLoader extends BaseLoader {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  load(context: any, config: any, callbacks: any): void {
    const onSuccess = callbacks.onSuccess;
    super.load(context, config, {
      ...callbacks,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      onSuccess: (response: any, stats: any, ctx: any, details: any) => {
        const real = unwrapInterceptorUrl(response?.url);
        onSuccess(real ? { ...response, url: real } : response, stats, ctx, details);
      },
    });
  }
}

export function buildHlsConfig(): Partial<HlsConfig> {
  return {
    ...(typeof document !== 'undefined' && document.documentElement.classList.contains('mobile-mode')
      ? { loader: CapacitorSafeLoader as unknown as HlsConfig['loader'] }
      : {}),
    // Unstable CDNs / proxy: longer timeouts + deep forward buffer so a slow
    // fragment doesn't freeze playback. Keep maxBufferHole near default so we
    // don't jump the playhead through empty ranges (black frames / fake skips).
    enableWorker: true,
    lowLatencyMode: false,
    startFragPrefetch: true,
    maxBufferLength: 60,
    maxMaxBufferLength: 120,
    maxBufferSize: 100 * 1000 * 1000,
    backBufferLength: 30,
    maxBufferHole: 0.2,
    nudgeMaxRetry: 3,
    highBufferWatchdogPeriod: 3,
    manifestLoadingTimeOut: 20_000,
    manifestLoadingMaxRetry: 6,
    manifestLoadingRetryDelay: 800,
    manifestLoadingMaxRetryTimeout: 12_000,
    levelLoadingTimeOut: 20_000,
    levelLoadingMaxRetry: 6,
    levelLoadingRetryDelay: 800,
    levelLoadingMaxRetryTimeout: 12_000,
    fragLoadingTimeOut: 60_000,
    fragLoadingMaxRetry: 10,
    fragLoadingRetryDelay: 400,
    fragLoadingMaxRetryTimeout: 20_000,
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
