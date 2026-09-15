import { channelAvatarUrl, channelSubscriberCount } from './feed-article';
import type { FeedChannel } from '../types/feed';

export type DirectoryPerson = {
  id: number;
  login: string;
  avatar: string;
  verified?: boolean;
};

export type DirectoryChannel = {
  id: number;
  title: string;
  avatar?: string | null;
  isBlog?: boolean;
  subscriberCount?: number;
};

export function pageableContent(raw: unknown): unknown[] {
  if (!raw || typeof raw !== 'object') return [];
  const content = (raw as { content?: unknown }).content;
  return Array.isArray(content) ? content : [];
}

function pageableNumber(raw: unknown, keys: string[]): number {
  if (!raw || typeof raw !== 'object') return 0;
  const rec = raw as Record<string, unknown>;
  for (const key of keys) {
    const n = Number(rec[key]);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 0;
}

export function pageableTotalPages(raw: unknown): number {
  return pageableNumber(raw, ['total_page_count', 'totalPageCount']);
}

export function pageableTotalCount(raw: unknown): number {
  return pageableNumber(raw, ['total_count', 'totalCount']);
}

export function pageableHasMore(
  raw: unknown,
  nextPage: number,
  loadedCount: number,
  pageItemCount: number,
  expectedTotal = 0,
): boolean {
  if (pageItemCount <= 0) return false;
  const totalCount = pageableTotalCount(raw);
  if (totalCount > loadedCount) return true;
  if (expectedTotal > loadedCount) return true;
  const totalPages = pageableTotalPages(raw);
  if (totalPages > nextPage + 1) return true;
  return pageItemCount >= 20;
}

export function normalizeDirectoryPeople(raw: unknown): DirectoryPerson[] {
  if (!Array.isArray(raw)) return [];
  const out: DirectoryPerson[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    const nested = rec.profile && typeof rec.profile === 'object'
      ? rec.profile as Record<string, unknown>
      : rec;
    const sid = Number(nested.id ?? nested['@id'] ?? rec.id ?? rec['@id'] ?? 0);
    if (!(sid > 0)) continue;
    out.push({
      id: sid,
      login: String(nested.login ?? rec.login ?? `Профиль #${sid}`),
      avatar: String(nested.avatar ?? rec.avatar ?? ''),
      verified: nested.is_verified === true || rec.is_verified === true,
    });
  }
  return out;
}

export function directoryChannelsFromFeed(list: FeedChannel[]): DirectoryChannel[] {
  return list.map((ch) => ({
    id: ch.id,
    title: ch.title || `Канал #${ch.id}`,
    avatar: channelAvatarUrl(ch.avatar),
    isBlog: !!ch.is_blog,
    subscriberCount: channelSubscriberCount(ch),
  }));
}

export function mergeUniquePeople(
  current: DirectoryPerson[],
  next: DirectoryPerson[],
): DirectoryPerson[] {
  const seen = new Set(current.map((p) => p.id));
  const extra = next.filter((p) => {
    if (seen.has(p.id)) return false;
    seen.add(p.id);
    return true;
  });
  return extra.length === 0 ? current : [...current, ...extra];
}

export function mergeUniqueChannels(
  current: DirectoryChannel[],
  next: DirectoryChannel[],
): DirectoryChannel[] {
  const seen = new Set(current.map((c) => c.id));
  const extra = next.filter((c) => {
    if (seen.has(c.id)) return false;
    seen.add(c.id);
    return true;
  });
  return extra.length === 0 ? current : [...current, ...extra];
}
