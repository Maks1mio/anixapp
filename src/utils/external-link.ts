import { get, writable } from 'svelte/store';
import { navigate } from '../stores/navigation';

/** URL, по которому ждём подтверждение перед открытием во внешнем браузере. */
export const pendingExternalUrl = writable<string | null>(null);

/** Хосты официального сайта / шеринга Anixart — открываем внутри приложения. */
const ANIXART_APP_HOSTS = new Set([
  'anixart-app.com',
  'www.anixart-app.com',
  'anixart.io',
  'www.anixart.io',
  'anixart.tv',
  'www.anixart.tv',
]);

/** Нормализует внешний http(s) URL. Внутренние пути (`/…`) возвращает как есть. */
export function normalizeLinkHref(raw: string | null | undefined): string | null {
  const value = String(raw ?? '').trim();
  if (!value) return null;
  if (value.startsWith('/') && !value.startsWith('//')) return value;
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.href;
  } catch {
    return null;
  }
}

/** Хост для текста предупреждения (без www.). */
export function externalLinkHost(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./i, '');
  } catch {
    return url;
  }
}

function stripHostWww(host: string): string {
  return host.trim().toLowerCase().replace(/^www\./i, '');
}

/**
 * Ссылка на контент Anixart → внутренний путь приложения.
 * Неизвестные страницы сайта (rules/terms/…) возвращают `null` — открываются снаружи.
 */
export function mapAnixartAppUrlToInternalPath(raw: string | null | undefined): string | null {
  const href = normalizeLinkHref(raw);
  if (!href || href.startsWith('/')) return null;

  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }

  const host = stripHostWww(url.hostname);
  if (![...ANIXART_APP_HOSTS].some((h) => stripHostWww(h) === host)) {
    return null;
  }

  // Поддержка hash-роутинга сайта: https://anixart-app.com/#/article/1
  let pathname = url.pathname || '/';
  if (url.hash.startsWith('#/')) {
    const hashPath = url.hash.slice(1).split('?')[0] || '/';
    pathname = hashPath.startsWith('/') ? hashPath : `/${hashPath}`;
  }

  const path = pathname.replace(/\/+$/, '') || '/';

  const article = path.match(/^\/article\/(\d+)$/i);
  if (article) return `/article/${article[1]}`;

  const release = path.match(/^\/release\/(\d+)$/i);
  if (release) return `/release/${release[1]}`;

  const collection = path.match(/^\/collection\/(\d+)$/i);
  if (collection) return `/collection/${collection[1]}`;

  const channelArticle = path.match(/^\/channel\/(\d+)\/article\/(\d+)$/i);
  if (channelArticle) return `/article/${channelArticle[2]}`;

  const channel = path.match(/^\/channel\/(\d+)$/i);
  if (channel) return `/channel/${channel[1]}`;

  const profile = path.match(/^\/profile\/(\d+)$/i);
  if (profile) return `/profile/${profile[1]}`;

  return null;
}

/** Показать модалку (внешние) или перейти внутри приложения (относительные / Anixart). */
export function requestOpenExternal(raw: string | null | undefined): void {
  const href = normalizeLinkHref(raw);
  if (!href) return;
  if (href.startsWith('/')) {
    navigate(href);
    return;
  }
  const internal = mapAnixartAppUrlToInternalPath(href);
  if (internal) {
    navigate(internal);
    return;
  }
  pendingExternalUrl.set(href);
}

export function cancelExternalLink(): void {
  pendingExternalUrl.set(null);
}

/** Открыть подтверждённую ссылку в системном браузере. */
export async function confirmExternalLink(): Promise<void> {
  const url = get(pendingExternalUrl);
  pendingExternalUrl.set(null);
  if (!url) return;
  await openExternalInBrowser(url);
}

export async function openExternalInBrowser(url: string): Promise<void> {
  const safe = normalizeLinkHref(url);
  if (!safe || safe.startsWith('/')) return;
  if (window.electron?.openExternal) {
    await Promise.resolve(window.electron.openExternal(safe));
    return;
  }
  window.open(safe, '_blank', 'noopener,noreferrer');
}
