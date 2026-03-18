import type { ReleaseCardData } from '../types/release';
import { renderReleaseCardHorizontal } from './release-card-h';
import { renderReleaseCardVertical } from './release-card-v';
import { getCardLayout } from '../prefs';

export type GridLayoutMode = 'auto' | 'wide' | 'mini';

export interface ReleaseCardsGridOptions {
  /**
   * Список релизов в нормализованном формате.
   */
  items: ReleaseCardData[];
  /**
   * Режим раскладки:
   * - 'auto' — читать из prefs (wide/mini)
   * - 'wide' — горизонтальные карточки (список)
   * - 'mini' — вертикальные карточки (сетка)
   */
  layout?: GridLayoutMode;
  /**
   * Дополнительный CSS‑класс для корневого элемента.
   */
  className?: string;
}

export function renderReleaseCardsGrid(options: ReleaseCardsGridOptions): HTMLElement {
  const { items, layout = 'auto', className } = options;

  const root = document.createElement('div');
  root.className = 'release-cards-grid-root';
  if (className) {
    root.classList.add(className);
  }

  const effectiveLayout = layout === 'auto' ? getCardLayout() : (layout === 'mini' ? 'mini' : 'wide');

  if (effectiveLayout === 'mini') {
    root.classList.add('release-cards-grid');
  } else {
    root.classList.add('release-cards-grid-root--wide');
  }

  items.forEach((data) => {
    const card = effectiveLayout === 'mini'
      ? renderReleaseCardVertical(data)
      : renderReleaseCardHorizontal(data);
    root.appendChild(card);
  });

  return root;
}

