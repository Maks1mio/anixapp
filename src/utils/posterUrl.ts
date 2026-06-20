const POSTER_BASE = 'https://s.anixmirai.com/posters';
const SCREENSHOT_BASE = 'https://s.anixmirai.com/screenshots';

const CDN_HOSTS = ['anixmirai.com', 'anixart.tv', 'anixsekai.com'];

export function isAnixartCdnUrl(url: string): boolean {
  if (!url?.trim()) return false;
  try {
    const host = new URL(url.trim()).hostname.replace(/^www\./, '');
    return CDN_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
  } catch {
    return false;
  }
}

/** Прокси через Electron main (Referer anixart.tv). Вне Electron — прямой URL. */
export function toCdnProxyUrl(url: string): string {
  const trimmed = url?.trim() ?? '';
  if (!trimmed) return '';
  if (trimmed.startsWith('anix-cdn://')) return trimmed;
  if (!isAnixartCdnUrl(trimmed)) return trimmed;
  if (typeof window !== 'undefined' && window.electron) {
    return `anix-cdn://asset/?u=${encodeURIComponent(trimmed)}`;
  }
  return trimmed;
}

/** Извлекает оригинальный HTTPS URL из anix-cdn:// или возвращает как есть */
export function fromCdnProxyUrl(url: string): string {
  if (!url.startsWith('anix-cdn://')) return url;
  try {
    const u = new URL(url).searchParams.get('u');
    return u ?? url;
  } catch {
    return url;
  }
}

/**
 * Публичный HTTPS URL для Discord Rich Presence (largeImageKey).
 * Discord не понимает anix-cdn:// и не шлёт Referer — используем mirror-хост CDN.
 */
export function toDiscordRpcImageUrl(raw: string | undefined | null): string | undefined {
  const proxied = resolveCdnAssetUrl(raw);
  if (!proxied) return undefined;

  let url = fromCdnProxyUrl(proxied);
  if (!url.startsWith('https://')) return undefined;

  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, '');
    if (!host.startsWith('mirror-') && !host.startsWith('mirror.')) {
      const parts = host.split('.');
      parsed.hostname = parts.length > 2
        ? `mirror-${parts[0]}.${parts.slice(1).join('.')}`
        : `mirror.${host}`;
      url = parsed.toString();
    }
  } catch {
    return undefined;
  }

  return url;
}

/** Любой CDN-ассет Anixart: полный URL, id постера, аватар, обложка, бейдж… */
export function resolveCdnAssetUrl(raw: string | undefined | null): string {
  if (!raw || typeof raw !== 'string') return '';
  const s = raw.trim();
  if (!s || s === 'null') return '';
  if (s.startsWith('anix-cdn://')) return s;
  if (s.startsWith('http://') || s.startsWith('https://')) return toCdnProxyUrl(s);
  return buildPosterUrl(s);
}

/** Собирает URL постера: id → anix-cdn://… или https://… */
export function buildPosterUrl(value: string | undefined): string {
  return buildCdnAssetUrl(POSTER_BASE, value);
}

/** Собирает URL скриншота: id → https://s.anixmirai.com/screenshots/{id}.jpg */
export function buildScreenshotUrl(value: string | undefined): string {
  return buildCdnAssetUrl(SCREENSHOT_BASE, value);
}

function buildCdnAssetUrl(base: string, value: string | undefined): string {
  if (!value || typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('anix-cdn://')) return trimmed;
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return toCdnProxyUrl(trimmed);
  }
  const id = trimmed.endsWith('.jpg') || trimmed.endsWith('.jpeg') || trimmed.endsWith('.png') || trimmed.endsWith('.webp')
    ? trimmed
    : `${trimmed}.jpg`;
  return toCdnProxyUrl(`${base}/${id}`);
}

/** Fetch JSON from Anixart CDN (badges Lottie) via Electron proxy — avoids CORS in dev. */
export async function fetchCdnJson(url: string): Promise<unknown | null> {
  const proxy = toCdnProxyUrl(url.trim());
  if (!proxy) return null;
  try {
    const res = await fetch(proxy, { cache: 'force-cache' });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/** Зеркало CDN как в Android Common.g(): s.anixmirai.com → mirror-s.anixmirai.com */
export function buildCdnMirrorUrl(url: string): string {
  const source = fromCdnProxyUrl(url?.trim() ?? '');
  if (!source) return '';
  try {
    const parsed = new URL(source);
    const parts = parsed.hostname.split('.');
    parsed.hostname = parts.length > 2
      ? `mirror-${parts[0]}.${parts.slice(1).join('.')}`
      : `mirror.${parsed.hostname}`;
    return toCdnProxyUrl(parsed.toString());
  } catch {
    return '';
  }
}
