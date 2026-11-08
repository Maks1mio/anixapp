/** Связь верхней панели мобильной версии с поиском по вкладке закладок: поле в панели, результаты на странице. */
import { writable } from 'svelte/store';

export const bookmarksSearchOpen = writable(false);
export const bookmarksSearchQuery = writable('');
/** Подпись поля: «Поиск в «Смотрю»». */
export const bookmarksSearchLabel = writable('Поиск в закладках');

export function closeBookmarksSearch(): void {
  bookmarksSearchOpen.set(false);
  bookmarksSearchQuery.set('');
}
