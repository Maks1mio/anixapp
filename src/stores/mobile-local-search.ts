/**
 * Поиск по списку страницы из верхней панели мобильной версии (поле в панели, результаты на странице):
 * сейчас — коллекции пользователя (/profile/:id/collections).
 */
import { writable } from 'svelte/store';

/** Поле открыто (до нажатия в панели — обычная кнопка поиска) */
export const localSearchOpen = writable(false);
export const localSearchQuery = writable('');

export function closeLocalSearch(): void {
  localSearchOpen.set(false);
  localSearchQuery.set('');
}
export const localSearchLabel = writable('Поиск');
