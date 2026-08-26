const POSTER_BASE = 'https://s.anixmirai.com/posters';
const SCREENSHOT_BASE = 'https://s.anixmirai.com/screenshots';
const COLLECTION_BASE = 'https://s.anixmirai.com/collections';

const CDN_HOSTS = ['anixmirai.com', 'anixart.tv', 'anixsekai.com', 'static.anixart.tv'];

export function isAnixartCdnUrl(url: string): boolean {
  const canonical = unwrapCdnUrl(url);
  if (!canonical?.trim()) return false;
  try {
    const host = new URL(canonical.trim()).hostname.replace(/^www\./, '');
    return CDN_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
  } catch {
    return false;
  }
}

/** Снимает anix-cdn://, /__cdn/?u= и вложенные обёртки — возвращает исходный https URL или путь. */
export function unwrapCdnUrl(raw: string): string {
  let s = raw?.trim() ?? '';
  if (!s) return '';

  for (let i = 0; i < 6; i += 1) {
    if (s.startsWith('anix-cdn://')) {
      s = fromCdnProxyUrl(s).trim();
      continue;
    }
    if (s.startsWith('/__cdn/?') || s.startsWith('/__cdn?')) {
      try {
        const inner = new URL(s, 'http://localhost').searchParams.get('u');
        if (inner) {
          s = inner.trim();
          continue;
        }
      } catch {
        break;
      }
    }
    const embedded = s.match(/\/__cdn\/\?u=([^&]+)/);
    if (embedded) {
      try {
        s = decodeURIComponent(embedded[1]).trim();
        continue;
      } catch {
        break;
      }
    }
    break;
  }

  return s;
}

/** Прокси через Electron main (Referer anixart.tv) или Vite /__cdn в браузере. */
export function toCdnProxyUrl(url: string): string {
  const trimmed = unwrapCdnUrl(url?.trim() ?? '');
  if (!trimmed) return '';
  if (trimmed.startsWith('anix-cdn://')) return trimmed;
  if (trimmed.startsWith('/__cdn/')) return trimmed;
  if (!isAnixartCdnUrl(trimmed)) return trimmed;
  if (typeof window !== 'undefined' && window.electron) {
    return `anix-cdn://asset/?u=${encodeURIComponent(trimmed)}`;
  }
  if (import.meta.env.DEV && typeof window !== 'undefined') {
    return `/__cdn/?u=${encodeURIComponent(trimmed)}`;
  }
  return trimmed;
}

/** Electron CDN-прокси отдаёт уже физически уменьшенную картинку нужного размера. */
export function toCdnThumbnailUrl(url: string, width: number, height = width): string {
  const proxied = toCdnProxyUrl(url);
  if (!proxied || !proxied.startsWith('anix-cdn://')) return proxied;

  try {
    const parsed = new URL(proxied);
    parsed.searchParams.delete('size');
    parsed.searchParams.set('w', String(Math.max(16, Math.min(640, Math.round(width)))));
    parsed.searchParams.set('h', String(Math.max(16, Math.min(960, Math.round(height)))));
    return parsed.toString();
  } catch {
    return proxied;
  }
}

/** Пресеты под CSS-размер постера (до учёта DPR / запаса резкости). */
export const POSTER_THUMB_PRESETS = {
  /** Вертикальная карточка / карусель (~160–180 CSS px) */
  cardVertical: { w: 200, h: 300 },
  /** Горизонтальная карточка / discuss (~176 CSS px) */
  cardHorizontal: { w: 220, h: 330 },
  /** Крупный постер на странице релиза */
  releaseHero: { w: 400, h: 600 },
  /** Обложка коллекции (~карточка 16:10) */
  collectionCover: { w: 420, h: 262 },
  /** «Просмотрено недавно» в профиле (~34–44 CSS px) */
  profileRecent: { w: 120, h: 180 },
  /** Мелкие превью в сайдбаре / slash */
  pin: { w: 96, h: 144 },
} as const;

export type PosterThumbPreset = keyof typeof POSTER_THUMB_PRESETS;

function displayDpr(): number {
  if (typeof window === 'undefined') return 1.5;
  const dpr = window.devicePixelRatio || 1;
  // Минимум 1.5× — иначе на 100% zoom intrinsic < rendered и картинка мылится
  return Math.min(2, Math.max(1.5, Math.round(dpr * 2) / 2));
}

/** URL постера, подогнанный под реальный размер области на экране. */
export function toPosterDisplayUrl(
  url: string | null | undefined,
  preset: PosterThumbPreset = 'cardVertical',
): string {
  const raw = (url ?? '').trim();
  if (!raw) return '';
  const { w, h } = POSTER_THUMB_PRESETS[preset];
  const dpr = displayDpr();
  return toCdnThumbnailUrl(raw, Math.round(w * dpr), Math.round(h * dpr));
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
  if (s.startsWith('/__cdn/')) return s;

  const canonical = unwrapCdnUrl(s);
  if (!canonical) return '';

  if (canonical.startsWith('anix-cdn://')) return canonical;
  if (canonical.startsWith('http://') || canonical.startsWith('https://')) {
    return toCdnProxyUrl(canonical);
  }
  return buildPosterUrl(canonical);
}

/** Собирает URL постера: id → anix-cdn://… или https://… */
export function buildPosterUrl(value: string | undefined): string {
  return buildCdnAssetUrl(POSTER_BASE, value);
}

/** Собирает URL скриншота: id → https://s.anixmirai.com/screenshots/{id}.jpg */
export function buildScreenshotUrl(value: string | undefined): string {
  return buildCdnAssetUrl(SCREENSHOT_BASE, value);
}

/** Собирает URL обложки коллекции: полный URL или hash → anix-cdn://… */
export function buildCollectionUrl(value: string | undefined): string {
  return buildCdnAssetUrl(COLLECTION_BASE, value);
}

function buildCdnAssetUrl(base: string, value: string | undefined): string {
  if (!value || typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('anix-cdn://') || trimmed.startsWith('/__cdn/')) return trimmed;

  const canonical = unwrapCdnUrl(trimmed);
  if (!canonical) return '';

  if (canonical.startsWith('http://') || canonical.startsWith('https://')) {
    return toCdnProxyUrl(canonical);
  }
  const id = canonical.endsWith('.jpg') || canonical.endsWith('.jpeg') || canonical.endsWith('.png') || canonical.endsWith('.webp')
    ? canonical
    : `${canonical}.jpg`;
  return toCdnProxyUrl(`${base}/${id}`);
}

/** Fetch JSON from Anixart CDN (badges Lottie). Electron: IPC (fetch не умеет anix-cdn://). */
export async function fetchCdnJson(url: string): Promise<unknown | null> {
  const httpsUrl = unwrapCdnUrl(url.trim());
  if (!httpsUrl) return null;

  const electronFetch = typeof window !== 'undefined' ? window.electron?.fetchCdnJson : undefined;
  if (electronFetch) {
    try {
      return await electronFetch(httpsUrl);
    } catch {
      return null;
    }
  }

  const proxy = toCdnProxyUrl(httpsUrl);
  if (!proxy || proxy.startsWith('anix-cdn://')) return null;
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
