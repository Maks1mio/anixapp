import { invalidateViewStatePrefix } from '../stores/view-state';

/** Сигнал об изменении списка избранных релизов (для сайдбара и др.). */
export function notifyFavoritesChanged(): void {
  window.dispatchEvent(new CustomEvent('anix:favoritesChanged'));
  notifyBookmarksChanged({ kind: 'favorites' });
}

/** Сигнал об изменении статуса в списках (смотрю / планы / …). */
export function notifyListStatusChanged(detail?: {
  releaseId?: number;
  statusId?: number | string | null;
}): void {
  notifyBookmarksChanged({ kind: 'list', ...detail });
}

/** История просмотра (после play / удаления). */
export function notifyHistoryChanged(detail?: { releaseId?: number }): void {
  notifyBookmarksChanged({ kind: 'history', ...detail });
}

/** Оценки релизов. */
export function notifyVotesChanged(detail?: { releaseId?: number }): void {
  notifyBookmarksChanged({ kind: 'votes', ...detail });
}

export type BookmarksChangeKind = 'favorites' | 'list' | 'collections' | 'history' | 'votes';

/** Общий сигнал для страницы закладок: сбросить кэш и перезагрузить. */
export function notifyBookmarksChanged(detail?: {
  kind?: BookmarksChangeKind;
  releaseId?: number;
  statusId?: number | string | null;
}): void {
  // Ключ кэша включает ?tab=… (например /bookmarks|tab=favorites) —
  // сбрасываем все варианты, а не только голый /bookmarks.
  invalidateViewStatePrefix('/bookmarks');
  window.dispatchEvent(new CustomEvent('anix:bookmarksChanged', { detail: detail ?? {} }));
}

/** Слушать изменения из любого окна (плеер) и сбрасывать кэш закладок. */
export function initBookmarksChangeSync(): () => void {
  const onChanged = () => invalidateViewStatePrefix('/bookmarks');
  window.addEventListener('anix:bookmarksChanged', onChanged);
  return () => window.removeEventListener('anix:bookmarksChanged', onChanged);
}
