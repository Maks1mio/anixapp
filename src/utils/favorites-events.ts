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

/** Общий сигнал для страницы закладок: сбросить кэш и перезагрузить. */
export function notifyBookmarksChanged(detail?: {
  kind?: 'favorites' | 'list' | 'collections';
  releaseId?: number;
  statusId?: number | string | null;
}): void {
  // Ключ кэша включает ?tab=… (например /bookmarks|tab=favorites) —
  // сбрасываем все варианты, а не только голый /bookmarks.
  invalidateViewStatePrefix('/bookmarks');
  window.dispatchEvent(new CustomEvent('anix:bookmarksChanged', { detail: detail ?? {} }));
}
