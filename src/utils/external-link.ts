import { get, writable } from 'svelte/store';
import { navigate } from '../stores/navigation';
import { focusFeedChannel } from '../stores/feed-focus';

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

/**
 * Доверенные хосты: можно открыть во внешнем браузере после предупреждения.
 * Остальные http(s)-ссылки блокируются.
 */
const TRUSTED_EXTERNAL_HOSTS = [
  'anixart-app.com',
  'anixart.io',
  'anixart.tv',
  'github.com',
  'discord.gg',
  'discord.com',
  't.me',
  'telegram.me',
  'telegram.org',
  'boosty.to',
  'youtube.com',
  'youtu.be',
  'vk.com',
  'vk.ru',
  'ok.ru',
  'rutube.ru',
] as const;

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

/** Хост (или его родитель) в белом списке. */
export function isTrustedExternalHost(hostname: string): boolean {
  const host = stripHostWww(hostname);
  if (!host) return false;
  return TRUSTED_EXTERNAL_HOSTS.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
}

export function isTrustedExternalUrl(raw: string | null | undefined): boolean {
  const href = normalizeLinkHref(raw);
  if (!href || href.startsWith('/')) return false;
  try {
    return isTrustedExternalHost(new URL(href).hostname);
  } catch {
    return false;
  }
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
  if (channel) {
    focusFeedChannel(Number(channel[1]));
    return '/feed';
  }

  const profile = path.match(/^\/profile\/(\d+)$/i);
  if (profile) return `/profile/${profile[1]}`;

  return null;
}

export type RequestOpenExternalResult =
  | 'navigated'
  | 'confirm'
  | 'invalid';

/**
 * Единая точка входа для любых ссылок в приложении:
 * внутренние / Anixart → navigate;
 * доверенные внешние → открываем сразу в браузере;
 * остальные → модалка подтверждения с кнопкой «Открыть».
 */
export function requestOpenExternal(raw: string | null | undefined): RequestOpenExternalResult {
  const href = normalizeLinkHref(raw);
  if (!href) return 'invalid';
  if (href.startsWith('/')) {
    navigate(href);
    return 'navigated';
  }
  const internal = mapAnixartAppUrlToInternalPath(href);
  if (internal) {
    navigate(internal);
    return 'navigated';
  }
  if (isTrustedExternalUrl(href)) {
    void openExternalInBrowser(href);
    return 'navigated';
  }
  pendingExternalUrl.set(href);
  return 'confirm';
}

export function cancelExternalLink(): void {
  pendingExternalUrl.set(null);
}

/** Открыть ссылку из модалки подтверждения в системном браузере. */
export async function confirmExternalLink(): Promise<void> {
  const url = get(pendingExternalUrl);
  pendingExternalUrl.set(null);
  if (!url) return;
  await openExternalInBrowser(url);
}

/**
 * Низкоуровневый open без модалки. Только после явного действия пользователя
 * (клик по доверенной ссылке или подтверждение в модалке).
 */
export async function openExternalInBrowser(url: string): Promise<void> {
  const safe = normalizeLinkHref(url);
  if (!safe || safe.startsWith('/')) return;
  if (window.electron?.openExternal) {
    await Promise.resolve(window.electron.openExternal(safe));
    return;
  }
  window.open(safe, '_blank', 'noopener,noreferrer');
}

export { TRUSTED_EXTERNAL_HOSTS };
