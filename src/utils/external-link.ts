import { get, writable } from 'svelte/store';
import { navigate } from '../stores/navigation';

/** URL, по которому ждём подтверждение перед открытием во внешнем браузере. */
export const pendingExternalUrl = writable<string | null>(null);

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

/** Показать модалку (внешние) или перейти внутри приложения (относительные). */
export function requestOpenExternal(raw: string | null | undefined): void {
  const href = normalizeLinkHref(raw);
  if (!href) return;
  if (href.startsWith('/')) {
    navigate(href);
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
