/** Сигнал об изменении списка избранных релизов (для сайдбара и др.). */
export function notifyFavoritesChanged(): void {
  window.dispatchEvent(new CustomEvent('anix:favoritesChanged'));
}
