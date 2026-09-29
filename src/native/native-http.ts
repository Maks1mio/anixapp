/**
 * GET с настоящими заголовками для резолверов видео на Android.
 *
 * Патченый CapacitorHttp fetch/XHR для GET идёт через /_capacitor_http_interceptor_
 * и берёт заголовки у запроса WebView. Referer браузер задать не даёт
 * (запрещённый заголовок), поэтому Kodik/Sibnet/AniLibria получали Referer
 * https://localhost/ вместо страницы плеера — в отличие от Node fetch в Electron.
 * Плагин CapacitorHttp напрямую отправляет заголовки как есть.
 */
import { CapacitorHttp } from '@capacitor/core';

export type NativeHttpResponse = {
  ok: boolean;
  status: number;
  url: string;
  headers: Record<string, string>;
  text: string;
};

function isCapacitorNative(): boolean {
  return typeof window !== 'undefined'
    && !!(window as Window & { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.();
}

function lowerHeaders(h: Record<string, string> | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(h ?? {})) out[k.toLowerCase()] = String(v);
  return out;
}

export async function httpGet(
  url: string,
  opts: { headers?: Record<string, string>; timeoutMs?: number; followRedirects?: boolean } = {},
): Promise<NativeHttpResponse> {
  const timeout = opts.timeoutMs ?? 15_000;
  if (isCapacitorNative()) {
    const res = await CapacitorHttp.request({
      url,
      method: 'GET',
      headers: opts.headers ?? {},
      responseType: 'text',
      connectTimeout: timeout,
      readTimeout: timeout,
      disableRedirects: opts.followRedirects === false,
    });
    const text = typeof res.data === 'string' ? res.data : JSON.stringify(res.data ?? '');
    return {
      ok: res.status >= 200 && res.status < 300,
      status: res.status,
      url: res.url || url,
      headers: lowerHeaders(res.headers),
      text,
    };
  }
  const res = await fetch(url, {
    headers: opts.headers,
    redirect: opts.followRedirects === false ? 'manual' : 'follow',
    signal: AbortSignal.timeout(timeout),
  });
  const headers: Record<string, string> = {};
  res.headers.forEach((v, k) => { headers[k.toLowerCase()] = v; });
  return { ok: res.ok, status: res.status, url: res.url || url, headers, text: await res.text() };
}
