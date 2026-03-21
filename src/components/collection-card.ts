import { navigate } from '../stores/navigation';
import { iconBookmark, iconFlag } from './icons';

function esc(s: string): string {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

export interface CollectionCardData {
  id: number;
  title: string;
  image?: string;
  description?: string;
  releaseCount?: number;
  notesCount?: number;
  bookmarksCount?: number;
  /** Количество добавлений в избранное (favorites_count из API) */
  favoritesCount?: number;
  /** Коллекция добавлена в закладки текущего пользователя */
  isFavorite?: boolean;
}

export function renderCollectionCard(data: CollectionCardData): HTMLElement {
  const card = document.createElement('article');
  card.className = 'collection-card';

  const href = `/collection/${data.id}`;
  card.innerHTML = `
    <span class="collection-card__page collection-card__page--back-2" aria-hidden="true"></span>
    <span class="collection-card__page collection-card__page--back-1" aria-hidden="true"></span>
    <a href="${href}" class="collection-card__link">
      <div class="collection-card__poster">
        ${data.image
          ? `<img src="${esc(data.image)}" alt="" loading="lazy" />`
          : '<div class="collection-card__poster-placeholder"></div>'}
        <div class="collection-card__badges">
          ${
            typeof data.notesCount === 'number'
              ? `<div class="collection-card__badge">
                   <span class="collection-card__badge-icon">💬</span>
                   <span class="collection-card__badge-text">${data.notesCount}</span>
                 </div>`
              : ''
          }
          ${
            typeof data.bookmarksCount === 'number'
              ? `<div class="collection-card__badge">
                   <span class="collection-card__badge-icon">${iconBookmark(14)}</span>
                   <span class="collection-card__badge-text">${data.bookmarksCount}</span>
                 </div>`
              : ''
          }
          ${
            typeof data.favoritesCount === 'number'
              ? `<div class="collection-card__badge collection-card__badge--favorites${data.isFavorite ? ' collection-card__badge--in-bookmarks' : ''}">
                   <span class="collection-card__badge-icon">${iconFlag(14, !!data.isFavorite)}</span>
                   <span class="collection-card__badge-text">${data.favoritesCount}</span>
                 </div>`
              : data.isFavorite
                ? `<div class="collection-card__badge collection-card__badge--favorites collection-card__badge--in-bookmarks">
                     <span class="collection-card__badge-icon">${iconFlag(14, true)}</span>
                     <span class="collection-card__badge-text">В закладках</span>
                   </div>`
                : ''
          }
        </div>
      </div>
      <div class="collection-card__footer">
        <h3 class="collection-card__title">${esc(data.title)}</h3>
        ${data.description ? `<p class="collection-card__desc">${esc(data.description)}</p>` : ''}
        ${
          typeof data.releaseCount === 'number'
            ? `<span class="collection-card__meta">${data.releaseCount} релизов</span>`
            : ''
        }
      </div>
    </a>
  `;

  const link = card.querySelector('.collection-card__link') as HTMLAnchorElement | null;
  if (link) {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      navigate(href);
    });
  }

  return card;
}

