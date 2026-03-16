/**
 * Вертикальная мини-карточка релиза (для сетки).
 * Постер, бейдж статуса, опционное меню (три точки), название, мета-строка.
 */

import { navigate } from '../app';
import { iconCheck, iconFlag, iconStar } from './icons';
import { renderDotsMenu, type DotsMenuEntry } from './dots-menu';
import { ratingHue } from './release-card-h';
import type { ReleaseCardData } from '../types/release';

type ListStatusId = 'watching' | 'planned' | 'completed' | 'on_hold' | 'dropped';

const LIST_STATUSES = [
  { id: 'watching' as const, label: 'Смотрю' },
  { id: 'planned' as const, label: 'В планах' },
  { id: 'completed' as const, label: 'Просмотрено' },
  { id: 'dropped' as const, label: 'Брошено' },
  { id: 'on_hold' as const, label: 'Отложено' },
];

const STATUS_LABEL: Record<ListStatusId, string> = {
  watching: 'смотрю',
  planned: 'в планах',
  completed: 'просмотрено',
  dropped: 'брошено',
  on_hold: 'отложено',
};

const STATUS_COLOR: Record<ListStatusId, string> = {
  watching: 'rgba(56, 161, 105, 0.85)',
  planned: 'rgba(139, 92, 246, 0.85)',
  completed: 'rgba(59, 130, 246, 0.85)',
  on_hold: 'rgba(180, 143, 59, 0.85)',
  dropped: 'rgba(185, 68, 68, 0.85)',
};

function esc(s: string): string {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function escAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function renderReleaseCardVertical(data: ReleaseCardData): HTMLElement {
  const card = document.createElement('article');
  card.className = 'release-card-v';

  const id = data.id;
  const title = data.titleRu || data.titleEn || 'Без названия';
  const poster = data.poster || '';
  let currentStatusId: ListStatusId | null = (data.listStatus as ListStatusId | undefined) ?? null;
  const ratingValue = typeof data.rating === 'number' ? data.rating : null;
  let isFavorite = !!data.isFavorite;

  const menuEntries: DotsMenuEntry[] = [
    {
      id: 'favorite',
      label: isFavorite ? 'Убрать из избранного' : 'Добавить в избранное',
      icon: iconFlag(16, isFavorite),
    },
    { type: 'divider' },
    { type: 'label', text: 'СТАТУС' },
    { id: 'none', label: 'Не смотрю' },
    ...LIST_STATUSES.map((s) => ({
      id: s.id,
      label: s.label,
      icon: currentStatusId === s.id ? iconCheck(16) : undefined,
    })),
  ];

  // Мета-строка: эпизоды · рейтинг · год
  const metaParts: string[] = [];

  const epCount = data.episodesReleased ?? data.episodesTotal ?? null;
  if (epCount != null) metaParts.push(`${epCount} эп.`);

  if (data.year) metaParts.push(esc(data.year));
  if (data.status) metaParts.push(esc(data.status));

  // Рейтинг — отдельный span с цветом
  let ratingHtml = '';
  const hasRating = ratingValue != null && ratingValue > 0 && (data.voteCount ?? 0) > 0;
  if (hasRating) {
    const hue = ratingHue(ratingValue);
    const color = `hsl(${hue}, 95%, 52%)`;
    ratingHtml =
      `<span class="release-card-v__rating" style="color:${color}">` +
      `${ratingValue.toFixed(1)} ${iconStar(12, true)}</span>`;
  }

  // Индикатор избранного — маленький флажок рядом с метой
  let favoriteHtml = '';
  if (isFavorite) {
    favoriteHtml = `<span class="release-card-v__favorite">${iconFlag(12, true)}</span>`;
  }

  // Бейдж статуса (внизу постера)
  let badgeHtml = '';
  if (currentStatusId && STATUS_LABEL[currentStatusId]) {
    badgeHtml = `<div class="release-card-v__badge" style="background:${STATUS_COLOR[currentStatusId]}">${esc(STATUS_LABEL[currentStatusId])}</div>`;
  }

  // Если нет оценки, но есть дата релиза — добавим её в мету
  if (!hasRating && data.releaseDate) {
    metaParts.push(esc(data.releaseDate));
  }

  const metaStr = metaParts.join(' <span class="release-card-v__dot">·</span> ');

  card.innerHTML = `
    <a href="${id ? `/release/${id}` : '#'}" class="release-card-v__link">
      <div class="release-card-v__poster">
        ${poster ? `<img src="${escAttr(poster)}" alt="" loading="lazy" />` : '<div class="release-card-v__no-poster"></div>'}
        <span class="release-card-v__menu-slot"></span>
        ${badgeHtml}
      </div>
      <div class="release-card-v__body">
        <h3 class="release-card-v__title">${esc(title)}</h3>
        <p class="release-card-v__meta">${metaStr}${ratingHtml ? (metaStr ? ' <span class="release-card-v__dot">·</span> ' : '') + ratingHtml : ''}${favoriteHtml}</p>
      </div>
    </a>
  `;

  const link = card.querySelector('.release-card-v__link') as HTMLAnchorElement;
  if (id && link) {
    link.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target.closest('.dots-menu')) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      e.preventDefault();
      navigate(`/release/${id}`);
    });
  }

  const img = card.querySelector('.release-card-v__poster img') as HTMLImageElement | null;
  if (img) {
    img.addEventListener('error', () => {
      const p = card.querySelector('.release-card-v__poster');
      if (p) p.innerHTML = '<div class="release-card-v__no-poster"></div>';
    });
  }

  const menuSlot = card.querySelector<HTMLElement>('.release-card-v__menu-slot');
  if (menuSlot) {
    const menuWrap = renderDotsMenu({
      entries: menuEntries,
      iconSize: 18,
      onSelect(entryId) {
        const anix = (window as unknown as {
          anix?: {
            addToFavorites?: (id: number) => Promise<unknown>;
            removeFromFavorites?: (id: number) => Promise<unknown>;
            setListStatus?: (id: number, status: string) => Promise<unknown>;
            clearListStatus?: (id: number, status: string) => Promise<unknown>;
          };
        }).anix;
        if (!id || !anix) return;

        if (entryId === 'favorite' && anix.addToFavorites && anix.removeFromFavorites) {
          const next = !isFavorite;
          (next ? anix.addToFavorites(id) : anix.removeFromFavorites(id))
            .then(() => {
              isFavorite = next;
              const favEntry = menuEntries.find((e) => (e as { id?: string }).id === 'favorite') as { id: string; label: string; icon?: string } | undefined;
              if (favEntry) {
                favEntry.label = isFavorite ? 'Убрать из избранного' : 'Добавить в избранное';
                favEntry.icon = iconFlag(16, isFavorite);
              }
              const metaEl = card.querySelector('.release-card-v__meta') as HTMLElement | null;
              const favIconEl = card.querySelector('.release-card-v__favorite') as HTMLElement | null;
              if (metaEl) {
                if (isFavorite) {
                  if (!favIconEl) {
                    metaEl.insertAdjacentHTML('beforeend', `<span class="release-card-v__favorite">${iconFlag(12, true)}</span>`);
                  }
                } else if (favIconEl) {
                  favIconEl.remove();
                }
              }
            })
            .catch(() => {});
          return;
        }

        if (entryId === 'none' && currentStatusId && anix.clearListStatus) {
          const prev = currentStatusId;
          anix.clearListStatus(id, prev).then(() => {
            currentStatusId = null;
            const posterEl = card.querySelector('.release-card-v__poster');
            const badge = posterEl?.querySelector('.release-card-v__badge');
            if (badge) badge.remove();
            LIST_STATUSES.forEach((s) => {
              const entry = menuEntries.find((e) => (e as { id?: string }).id === s.id) as { id: string; label: string; icon?: string } | undefined;
              if (entry) {
                entry.label = s.label;
                entry.icon = undefined;
              }
            });
          }).catch(() => {});
          return;
        }

        if (LIST_STATUSES.some((s) => s.id === entryId) && anix.setListStatus) {
          const nextStatus = entryId as ListStatusId;
          anix.setListStatus(id, nextStatus).then(() => {
            currentStatusId = nextStatus;
            const posterEl = card.querySelector('.release-card-v__poster');
            if (posterEl) {
              let badge = posterEl.querySelector('.release-card-v__badge') as HTMLElement | null;
              if (!badge) {
                badge = document.createElement('div');
                badge.className = 'release-card-v__badge';
                posterEl.appendChild(badge);
              }
              badge.style.background = STATUS_COLOR[nextStatus];
              badge.textContent = STATUS_LABEL[nextStatus];
            }
            LIST_STATUSES.forEach((s) => {
              const entry = menuEntries.find((e) => (e as { id?: string }).id === s.id) as { id: string; label: string; icon?: string } | undefined;
              if (entry) {
                entry.label = s.label;
                entry.icon = s.id === nextStatus ? iconCheck(16) : undefined;
              }
            });
          }).catch(() => {});
        }
      },
    });
    menuSlot.appendChild(menuWrap);
  }

  return card;
}
