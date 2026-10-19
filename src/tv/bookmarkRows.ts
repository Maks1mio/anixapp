import type { ReleaseCardData } from '../types/release';
import { mapReleaseRawToCard } from '../utils/release-card';
import { mapHistoryRawToReleaseCard } from '../utils/historyCard';
import { getBookmarksSort } from '../constants/bookmarkSort';

/** Списки TV-закладок — те же, что вкладки на ПК (без коллекций). */
export type TvBookmarkListId =
  | 'history'
  | 'watching'
  | 'planned'
  | 'completed'
  | 'on_hold'
  | 'dropped'
  | 'favorites'
  | 'votes';

export interface TvBookmarkListDef {
  id: TvBookmarkListId;
  label: string;
  /** profile.getBookmarks type для статусных списков. */
  type?: number;
}

export const TV_BOOKMARK_LISTS: TvBookmarkListDef[] = [
  { id: 'history', label: 'Продолжить просмотр' },
  { id: 'watching', label: 'Смотрю', type: 1 },
  { id: 'planned', label: 'В планах', type: 2 },
  { id: 'favorites', label: 'Избранное' },
  { id: 'completed', label: 'Просмотрено', type: 3 },
  { id: 'on_hold', label: 'Отложено', type: 4 },
  { id: 'dropped', label: 'Брошено', type: 5 },
  { id: 'votes', label: 'Мои оценки' },
];

export const TV_BOOKMARK_ROW_LIMIT = 12;

export function tvBookmarkListDef(id: string): TvBookmarkListDef | null {
  return TV_BOOKMARK_LISTS.find((def) => def.id === id) ?? null;
}

export interface TvBookmarkPage {
  items: ReleaseCardData[];
  total: number;
  /** Страница пустая — дальше не грузим. */
  done: boolean;
}

let selfProfileId: number | null = null;

async function ensureSelfProfileId(): Promise<number | null> {
  if (selfProfileId != null) return selfProfileId;
  const res = (await window.anixApi?.profile?.self?.()) as { profile?: { id?: number } } | null | undefined;
  const id = Number(res?.profile?.id);
  selfProfileId = Number.isFinite(id) && id > 0 ? id : null;
  return selfProfileId;
}

/** Сброс при смене аккаунта. */
export function resetTvBookmarkProfile(): void {
  selfProfileId = null;
}

function readContent(data: Record<string, unknown> | null | undefined): Record<string, unknown>[] {
  const raw = data?.content ?? data?.releases ?? [];
  return Array.isArray(raw) ? (raw as Record<string, unknown>[]) : [];
}

function readTotal(data: Record<string, unknown> | null | undefined, fallback: number): number {
  if (typeof data?.total_count === 'number') return data.total_count;
  if (typeof data?.total === 'number') return data.total;
  return fallback;
}

function mapListItem(raw: Record<string, unknown>): ReleaseCardData {
  const releaseRaw = raw.release && typeof raw.release === 'object'
    ? (raw.release as Record<string, unknown>)
    : raw;
  const voteRaw = raw.my_vote ?? raw.vote ?? releaseRaw.my_vote;
  const myVote = typeof voteRaw === 'number' && voteRaw > 0 ? voteRaw : undefined;
  return { ...mapReleaseRawToCard(releaseRaw), myVote };
}

export async function fetchTvBookmarkPage(id: TvBookmarkListId, page: number): Promise<TvBookmarkPage> {
  const api = window.anixApi;
  if (!api) throw new Error('API недоступно');

  let data: Record<string, unknown> | null = null;
  let history = false;

  if (id === 'history') {
    data = (await api.history.all(page)) as Record<string, unknown>;
    history = true;
  } else if (id === 'favorites') {
    data = (await api.favorites.all(page, getBookmarksSort(), 0, 0)) as Record<string, unknown>;
  } else {
    const profileId = await ensureSelfProfileId();
    if (profileId == null) return { items: [], total: 0, done: true };
    if (id === 'votes') {
      data = (await api.profile.getVotedReleases(profileId, page, 1)) as Record<string, unknown>;
    } else {
      const def = tvBookmarkListDef(id);
      if (def?.type == null) return { items: [], total: 0, done: true };
      data = (await api.profile.getBookmarks(profileId, def.type, page, getBookmarksSort(), 0, 0)) as Record<string, unknown>;
    }
  }

  const content = readContent(data);
  const items: ReleaseCardData[] = [];
  for (const raw of content) {
    if (!raw || typeof raw !== 'object') continue;
    try {
      items.push(history ? mapHistoryRawToReleaseCard(raw) : mapListItem(raw));
    } catch { /* пропускаем битую запись */ }
  }
  return { items, total: readTotal(data, items.length), done: content.length === 0 || data?.last === true };
}
