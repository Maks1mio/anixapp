import { buildCollectionUrl, buildPosterUrl, resolveCdnAssetUrl } from './posterUrl';
import type { CollectionCardData } from '../components/CollectionCard.svelte';

export const COLLECTION_SORT_OPTIONS = [
  { value: 1, label: 'Лидеры рейтинга' },
  { value: 2, label: 'Популярные за год' },
  { value: 3, label: 'Популярные за сезон' },
  { value: 4, label: 'Популярные за неделю' },
  { value: 5, label: 'Недавно добавленные' },
  { value: 6, label: 'Случайные' },
] as const;

export const COLLECTION_TITLE_MAX = 60;
export const COLLECTION_DESCRIPTION_MAX = 5000;
export const COLLECTION_RELEASES_MAX = 100;

export const COLLECTION_EDITOR_DRAFT_KEY = 'collection-editor-draft';

export interface CollectionEditorDraft {
  title: string;
  description: string;
  isPrivate: boolean;
  releaseIds: number[];
  releases: Record<string, unknown>[];
  imagePreview?: string | null;
  imageBase64?: string | null;
  imageFileName?: string | null;
  editId?: number | null;
}

export function defaultCollectionListSort(): number {
  return 2 + Math.floor(Math.random() * 5);
}

export function getCollectionSortLabel(sort: number): string {
  return COLLECTION_SORT_OPTIONS.find((o) => o.value === sort)?.label ?? 'Недавно добавленные';
}

export function initialCollectionListPage(sort: number): number {
  return sort === 6 ? -1 : 0;
}

export function initialCollectionPreviousPage(): number {
  return -1;
}

function resolveCollectionImage(raw: Record<string, unknown>): string | undefined {
  const candidates = [raw.image, raw.image_url, raw.cover];
  for (const candidate of candidates) {
    if (typeof candidate !== 'string' || !candidate.trim()) continue;
    const url = candidate.includes('/collections/')
      ? resolveCdnAssetUrl(candidate)
      : buildCollectionUrl(candidate) || resolveCdnAssetUrl(candidate);
    if (url) return url;
  }

  const releases = raw.releases as Array<Record<string, unknown>> | undefined;
  const firstRelease = releases?.[0];
  if (firstRelease) {
    const poster = firstRelease.poster as Record<string, { url?: string }> | undefined;
    const releaseImage = poster?.original?.url
      ?? poster?.medium?.url
      ?? poster?.small?.url
      ?? (typeof firstRelease.image === 'string' ? firstRelease.image : undefined);
    if (releaseImage) {
      return buildPosterUrl(releaseImage) || resolveCdnAssetUrl(releaseImage) || undefined;
    }
  }

  return undefined;
}

export function mapCollectionCard(raw: Record<string, unknown>): CollectionCardData {
  const isDeleted = !!(raw.is_deleted ?? raw.delete ?? raw.isDeleted);
  const id = Number(raw.id ?? 0);
  return {
    id,
    title: String(raw.title ?? raw.name ?? 'Без названия'),
    image: isDeleted ? undefined : resolveCollectionImage(raw),
    description: (raw.description as string) || undefined,
    releaseCount: typeof raw.release_count === 'number' ? raw.release_count : undefined,
    notesCount:
      typeof raw.notes_count === 'number'
        ? raw.notes_count
        : typeof raw.comment_count === 'number'
          ? raw.comment_count
          : undefined,
    bookmarksCount: typeof raw.bookmarks_count === 'number' ? raw.bookmarks_count : undefined,
    favoritesCount: typeof raw.favorites_count === 'number' ? raw.favorites_count : undefined,
    isFavorite: !!(raw.is_favorite ?? raw.isFavorite),
    isPrivate: !!(raw.is_private ?? raw.isPrivate),
  };
}

/** @deprecated use defaultCollectionListSort */
export function randomCollectionListSort(): number {
  return defaultCollectionListSort();
}

export function loadCollectionEditorDraft(): CollectionEditorDraft | null {
  try {
    const raw = sessionStorage.getItem(COLLECTION_EDITOR_DRAFT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as CollectionEditorDraft;
  } catch {
    return null;
  }
}

export function saveCollectionEditorDraft(draft: CollectionEditorDraft): void {
  sessionStorage.setItem(COLLECTION_EDITOR_DRAFT_KEY, JSON.stringify(draft));
}

export function clearCollectionEditorDraft(): void {
  sessionStorage.removeItem(COLLECTION_EDITOR_DRAFT_KEY);
}

export const COLLECTION_CREATE_ERROR_MESSAGES: Record<number, string> = {
  2: 'Некорректное название',
  3: 'Некорректное описание',
  4: 'Некорректный список релизов',
  5: 'Достигнут лимит коллекций',
  6: 'Коллекция не найдена',
  7: 'Нет прав на редактирование',
  8: 'Коллекция удалена',
  9: 'Достигнут лимит релизов в коллекции',
};

export const COLLECTION_DELETE_ERROR_MESSAGES: Record<number, string> = {
  2: 'Коллекция не найдена',
  3: 'Нет прав на удаление',
};
