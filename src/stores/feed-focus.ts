import { writable, get } from 'svelte/store';

/** Запись, которую нужно открыть в ленте (deep link / уведомление). */
export const feedArticleFocusId = writable<number | null>(null);

export function focusFeedArticle(articleId: number): void {
  const id = Number(articleId);
  if (!Number.isFinite(id) || id <= 0) return;
  feedArticleFocusId.set(id);
}

export function takeFeedArticleFocus(): number | null {
  const id = get(feedArticleFocusId);
  if (id == null || !(id > 0)) return null;
  feedArticleFocusId.set(null);
  return id;
}

/** Канал/блог, чью ленту нужно показать внутри /feed (вместо /channel/:id). */
export const feedChannelFocusId = writable<number | null>(null);

export function focusFeedChannel(channelId: number): void {
  const id = Number(channelId);
  if (!Number.isFinite(id) || id <= 0) return;
  feedChannelFocusId.set(id);
}

export function takeFeedChannelFocus(): number | null {
  const id = get(feedChannelFocusId);
  if (id == null || !(id > 0)) return null;
  feedChannelFocusId.set(null);
  return id;
}
