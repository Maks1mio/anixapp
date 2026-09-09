/** История открытых каналов / блогов / постов в сайдбаре ленты (localStorage). */

import type { FeedArticle, FeedChannel } from '../types/feed';
import { articlePreviewText, channelAvatarUrl } from './feed-article';

const STORAGE_KEY = 'anixapp.feedBrowseHistory';
const COLLAPSE_KEY = 'anixapp.feedSideCollapse';
const MAX_ITEMS = 24;

export type FeedBrowseHistoryItem =
  | {
      kind: 'channel';
      id: number;
      title: string;
      avatar?: string | null;
      is_blog?: boolean;
      at: number;
    }
  | {
      kind: 'post';
      id: number;
      title: string;
      avatar?: string | null;
      is_blog?: boolean;
      channelId?: number;
      at: number;
    };

export type FeedSideCollapseState = {
  feed: boolean;
  history: boolean;
};

function itemKey(item: FeedBrowseHistoryItem): string {
  return `${item.kind}:${item.id}`;
}

function readList(): FeedBrowseHistoryItem[] {
  if (typeof window === 'undefined' || !window.localStorage) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const out: FeedBrowseHistoryItem[] = [];
    for (const row of parsed) {
      if (!row || typeof row !== 'object') continue;
      const kind = (row as { kind?: unknown }).kind;
      const id = Number((row as { id?: unknown }).id);
      if (!(id > 0)) continue;
      const title = String((row as { title?: unknown }).title ?? '').trim() || (
        kind === 'post' ? `Пост #${id}` : `Канал #${id}`
      );
      const avatar = (row as { avatar?: unknown }).avatar;
      const is_blog = !!(row as { is_blog?: unknown }).is_blog;
      const at = Number((row as { at?: unknown }).at) || Date.now();
      if (kind === 'post') {
        const channelId = Number((row as { channelId?: unknown }).channelId);
        out.push({
          kind: 'post',
          id,
          title,
          avatar: typeof avatar === 'string' ? avatar : null,
          is_blog,
          channelId: channelId > 0 ? channelId : undefined,
          at,
        });
        continue;
      }
      if (kind === 'channel') {
        out.push({
          kind: 'channel',
          id,
          title,
          avatar: typeof avatar === 'string' ? avatar : null,
          is_blog,
          at,
        });
      }
    }
    return out.slice(0, MAX_ITEMS);
  } catch {
    return [];
  }
}

function writeList(items: FeedBrowseHistoryItem[]): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, MAX_ITEMS)));
  } catch {
    /* quota */
  }
}

function upsert(item: FeedBrowseHistoryItem): FeedBrowseHistoryItem[] {
  const key = itemKey(item);
  const next = [item, ...readList().filter((x) => itemKey(x) !== key)].slice(0, MAX_ITEMS);
  writeList(next);
  return next;
}

export function getFeedBrowseHistory(): FeedBrowseHistoryItem[] {
  return readList();
}

/** Канал/блог в историю (для непросмотренных подписок — вызывающий фильтрует). */
export function pushFeedBrowseChannel(channel: FeedChannel | null | undefined): FeedBrowseHistoryItem[] {
  const id = Number(channel?.id ?? 0);
  if (!(id > 0)) return readList();
  return upsert({
    kind: 'channel',
    id,
    title: channel?.title?.trim() || `Канал #${id}`,
    avatar: channelAvatarUrl(channel?.avatar) || channel?.avatar || null,
    is_blog: !!channel?.is_blog,
    at: Date.now(),
  });
}

export function pushFeedBrowsePost(article: FeedArticle | null | undefined): FeedBrowseHistoryItem[] {
  const id = Number(article?.id ?? 0);
  if (!(id > 0)) return readList();
  const preview = articlePreviewText(article)?.trim();
  const channelTitle = article?.channel?.title?.trim();
  const title =
    (preview && preview.slice(0, 56))
    || (channelTitle ? `Пост · ${channelTitle}` : `Пост #${id}`);
  const channelId = Number(article?.channel?.id ?? 0);
  return upsert({
    kind: 'post',
    id,
    title,
    avatar: channelAvatarUrl(article?.channel?.avatar) || article?.channel?.avatar || null,
    is_blog: !!article?.channel?.is_blog,
    channelId: channelId > 0 ? channelId : undefined,
    at: Date.now(),
  });
}

/** Убрать канал из истории (после подписки). */
export function removeFeedBrowseChannel(channelId: number): FeedBrowseHistoryItem[] {
  if (!(channelId > 0)) return readList();
  const next = readList().filter(
    (x) => !(x.kind === 'channel' && x.id === channelId),
  );
  writeList(next);
  return next;
}

export function getFeedSideCollapse(): FeedSideCollapseState {
  if (typeof window === 'undefined' || !window.localStorage) {
    return { feed: false, history: false };
  }
  try {
    const raw = window.localStorage.getItem(COLLAPSE_KEY);
    if (!raw) return { feed: false, history: false };
    const parsed = JSON.parse(raw) as Partial<FeedSideCollapseState>;
    return {
      feed: !!parsed.feed,
      history: !!parsed.history,
    };
  } catch {
    return { feed: false, history: false };
  }
}

export function setFeedSideCollapse(next: FeedSideCollapseState): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(COLLAPSE_KEY, JSON.stringify(next));
  } catch {
    /* quota */
  }
}
