/** Server-side Kodik resolve + CDN proxy for tv.anixapp.com (anixback). */
export const TV_BRIDGE_ORIGIN =
  (import.meta.env.VITE_TV_BRIDGE_ORIGIN as string | undefined)?.replace(/\/$/, '')
  || 'https://api.anixapp.com';

export function tvBridgeInvokeUrl(): string {
  return `${TV_BRIDGE_ORIGIN}/tv/invoke`;
}

export function tvBridgeMediaUrl(playUrl: string, referer?: string, cookie?: string): string {
  let out = `${TV_BRIDGE_ORIGIN}/tv/media?u=${encodeURIComponent(playUrl)}`;
  const ref = referer?.trim();
  if (ref) out += `&ref=${encodeURIComponent(ref)}`;
  if (cookie) out += `&ck=${encodeURIComponent(cookie)}`;
  return out;
}
