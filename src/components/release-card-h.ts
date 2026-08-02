import { navigate } from '../stores/navigation';
import { requireAuth } from '../stores/auth';
import { iconCheck, iconFlag, iconInfo, iconStar } from './icons';
import { renderDotsMenu, type DotsMenuEntry } from './dots-menu';
import type { ReleaseCardData } from '../types/release';
import { notifyFavoritesChanged } from '../utils/favorites-events';
import { applyReleaseListStatus } from '../utils/release-list-status';
import type { ReleaseListStatusId } from '../utils/release-list-status';

const LIST_STATUSES = [
  { id: 'watching', label: 'Смотрю' },
  { id: 'planned', label: 'В планах' },
  { id: 'completed', label: 'Просмотрено' },
  { id: 'dropped', label: 'Брошено' },
  { id: 'on_hold', label: 'Отложено' },
] as const;

type ListStatusId = (typeof LIST_STATUSES)[number]['id'];

const STATUS_LABEL_BY_ID: Record<ListStatusId, string> = {
  watching: 'Смотрю',
  planned: 'В планах',
  completed: 'Просмотрено',
  dropped: 'Брошено',
  on_hold: 'Отложено',
};

const DESC_MAX_LENGTH = 200;

function escapeHtml(s: string): string {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

function truncate(str: string, max: number): string {
  if (str.length <= max) return str;
  return str.slice(0, max).trim() + '...';
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function formatVoteCount(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
  return String(n);
}

/** Обрез круга: 0 → красный (0°), 5 → золотой (~48°). Экспорт для UI Kit слайдера. */
export function ratingHue(r: number): number {
  const clamped = Math.max(0, Math.min(5, r));
  return (clamped / 5) * 48;
}

export function renderReleaseCardHorizontal(data: ReleaseCardData): HTMLElement {
  const card = document.createElement('article');
  card.className = 'release-card-h';

  const id = data.id;
  const title = data.titleRu || data.titleEn || 'Без названия';
  const poster = data.poster || '';
  let currentStatusId: ListStatusId | null = (data.listStatus as ListStatusId | undefined) ?? null;
  const ratingValue = typeof data.rating === 'number' ? data.rating : null;
  const voteCount = data.voteCount;
  const epReleased = data.episodesReleased ?? null;
  const epTotal = data.episodesTotal ?? null;

  const metaParts: string[] = [];

  const hasRating = ratingValue != null && ratingValue > 0 && (voteCount ?? 0) > 0;

  if (hasRating) {
    const hue = ratingHue(ratingValue);
    const bg = `hsl(${hue}, 95%, 52%)`;
    const textColor = hue >= 28 ? '#0b0b0b' : '#f5f5f5';
    const votesLabel = voteCount != null ? formatVoteCount(voteCount) : '';
    const ratingLabel = ratingValue.toFixed(2);
    const ratingChip = `<span class="release-card-h__rating-chip" style="background:${bg};color:${textColor}">${escapeHtml(
      ratingLabel,
    )} ${iconStar(14, true)}${
      votesLabel
        ? `<span class="release-card-h__rating-chip-votes">${escapeHtml(votesLabel)}</span>`
        : ''
    }</span>`;
    metaParts.push(ratingChip);
  }

  if (data.isFavorite) {
    metaParts.push(`<span class="release-card-h__favorite">${iconFlag(16, true)}</span>`);
  }

  const epCount = epReleased ?? epTotal;
  if (epCount != null) metaParts.push(`${epCount} эп.`);

  // Если нет оценки, но есть дата релиза — покажем её как мету вместо "0.0"
  if (!hasRating && data.releaseDate) {
    metaParts.push(escapeHtml(data.releaseDate));
  }

  const infoParts: string[] = [];
  if (data.year) infoParts.push(escapeHtml(data.year));
  if (data.country) infoParts.push(escapeHtml(data.country));
  if (data.status) {
    const statusText = String(data.status);
    // Не показываем статусы "Вышел" / "Выходит" в мета-информации карточки.
    if (!/^\s*вышел\s*$/i.test(statusText) && !/^\s*выходит\s*$/i.test(statusText)) {
      infoParts.push(escapeHtml(statusText));
    }
  }
  const infoStr = infoParts.length
    ? infoParts.join(' <span class="release-card-h__meta-dot">·</span> ')
    : '';
  if (infoStr) metaParts.push(infoStr);

  const metaHtml = metaParts.join(' <span class="release-card-h__meta-dot">·</span> ') || '—';

  // Личная оценка пользователя — в той же строке, что и мета карточки
  const myVote = typeof data.myVote === 'number' && data.myVote > 0 ? data.myVote : null;
  const myVoteMetaHtml = myVote != null
    ? `<span class="release-card-h__my-vote">
        <span class="release-card-h__my-vote-label">Ваша оценка</span>
        <span class="release-card-h__my-vote-stars">${Array.from({length: 5}, (_, i) =>
          `<span class="release-card-h__star${i < myVote ? '--on' : '--off'}">★</span>`
        ).join('')}</span>
      </span>`
    : '';
  const genreTags =
    data.genres
      ?.split(',')
      .map((g) => g.trim())
      .filter(Boolean)
      .slice(0, 5) ?? [];
  const genresHtml =
    genreTags.length > 0
      ? `<div class="release-card-h__genres">${genreTags.map((g) => `<span class="release-card-h__tag">${escapeHtml(g)}</span>`).join('')}</div>`
      : '';
  const desc = data.description ? truncate(data.description, DESC_MAX_LENGTH) : '';

  const titleTooltipLines: string[] = [];
  if (data.titleRu) titleTooltipLines.push(`Русское: ${escapeHtml(data.titleRu)}`);
  if (data.titleEn) titleTooltipLines.push(`Оригинал: ${escapeHtml(data.titleEn)}`);
  if (data.titleAlt) titleTooltipLines.push(`Альт: ${escapeHtml(data.titleAlt)}`);
  const hasTitleTooltip = titleTooltipLines.length > 0;
  const titleTooltipHtml = hasTitleTooltip
    ? `<span class="release-card-h__title-info tooltip-trigger" role="button" tabindex="0" aria-label="Названия">
        ${iconInfo(14)}
        <span class="tooltip tooltip--animated">${titleTooltipLines.join('<br>')}</span>
      </span>`
    : '';

  let isFavorite = !!data.isFavorite;

  const menuEntries: DotsMenuEntry[] = [
    {
      id: 'favorite',
      label: isFavorite ? 'Убрать из избранного' : 'Добавить в избранное',
      icon: iconFlag(16, isFavorite),
    },
    { type: 'divider' },
    { type: 'label', text: 'СТАТУС' },
    { id: 'none', label: 'Не в списке' },
    ...LIST_STATUSES.map((s) => ({
      id: s.id,
      label: s.label,
      icon: currentStatusId && currentStatusId === s.id ? iconCheck(16) : undefined,
    })),
  ];

  const statusLabel = currentStatusId ? STATUS_LABEL_BY_ID[currentStatusId] : null;

  if (currentStatusId) {
    card.classList.add('release-card-h--status', `release-card-h--status-${currentStatusId}`);
  }

  card.innerHTML = `
    <a href="${id ? `/release/${id}` : '#'}" class="release-card-h__link">
      <div class="release-card-h__poster">
        ${poster ? `<img src="${escapeAttr(poster)}" alt="" loading="lazy" />` : '<div class="release-card-h__no-poster"></div>'}
        ${statusLabel ? `<div class="release-card-h__status-badge">${escapeHtml(statusLabel)}</div>` : ''}
      </div>
      <div class="release-card-h__body">
        <div class="release-card-h__title-row">
          <h3 class="release-card-h__title">${escapeHtml(title)}</h3>
          ${titleTooltipHtml}
          <span class="release-card-h__menu-slot"></span>
        </div>
        <p class="release-card-h__meta">${metaHtml}${myVoteMetaHtml ? ` <span class="release-card-h__meta-dot">·</span> ${myVoteMetaHtml}` : ''}</p>
        ${genresHtml}
        ${desc ? `<p class="release-card-h__desc">${escapeHtml(desc)}</p>` : ''}
      </div>
    </a>
  `;

  const link = card.querySelector('.release-card-h__link') as HTMLAnchorElement;
  const img = card.querySelector('.release-card-h__poster img') as HTMLImageElement | null;
  if (img) {
    img.addEventListener('error', () => {
      const posterEl = card.querySelector('.release-card-h__poster');
      if (posterEl) {
        posterEl.innerHTML = '<div class="release-card-h__no-poster"></div>';
      }
    });
  }

  if (id) {
    link.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target.closest('.tooltip-trigger') || target.closest('.dots-menu')) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      e.preventDefault();
      navigate(`/release/${id}`);
    });
  }

  const menuSlot = card.querySelector<HTMLElement>('.release-card-h__menu-slot');
  if (menuSlot) {
    const menuWrap = renderDotsMenu({
      entries: menuEntries,
      onSelect(entryId) {
        if (!requireAuth()) return;
        const api = window.anixApi;
        if (!id || !api) return;

        if (entryId === 'favorite') {
          const next = !isFavorite;
          (next ? api.release.addFavorite(id) : api.release.removeFavorite(id))
            .then(() => {
              isFavorite = next;
              notifyFavoritesChanged();
              const favEntry = menuEntries.find((e) => (e as any).id === 'favorite') as {
                id: string;
                label: string;
                icon?: string;
              } | undefined;
              if (favEntry) {
                favEntry.label = isFavorite ? 'Убрать из избранного' : 'Добавить в избранное';
                favEntry.icon = iconFlag(16, isFavorite);
              }
              const metaEl = card.querySelector('.release-card-h__meta') as HTMLElement | null;
              if (metaEl) {
                const favIconEl = metaEl.querySelector('.release-card-h__favorite');
                if (isFavorite) {
                  if (!favIconEl) {
                    const firstDot = metaEl.querySelector('.release-card-h__meta-dot');
                    if (firstDot) {
                      firstDot.insertAdjacentHTML(
                        'beforebegin',
                        `<span class="release-card-h__favorite">${iconFlag(16, true)}</span> <span class="release-card-h__meta-dot">·</span> `,
                      );
                    } else {
                      metaEl.insertAdjacentHTML(
                        'beforeend',
                        `<span class="release-card-h__favorite">${iconFlag(16, true)}</span>`,
                      );
                    }
                  }
                } else if (favIconEl) {
                  const nextDot = favIconEl.nextElementSibling;
                  favIconEl.remove();
                  if (nextDot && nextDot.classList.contains('release-card-h__meta-dot')) {
                    nextDot.remove();
                  }
                }
              }
            })
            .catch(() => {});
          return;
        }

        if (entryId === 'none' && currentStatusId) {
          const prev = currentStatusId;
          applyReleaseListStatus(id, null, prev)
            .then(() => {
              currentStatusId = null;
              card.classList.remove(
                'release-card-h--status-watching',
                'release-card-h--status-planned',
                'release-card-h--status-completed',
                'release-card-h--status-dropped',
                'release-card-h--status-on_hold',
                'release-card-h--status',
              );
              const badge = card.querySelector('.release-card-h__status-badge') as HTMLElement | null;
              if (badge) badge.remove();
              LIST_STATUSES.forEach((s) => {
                const entry = menuEntries.find((e) => (e as any).id === s.id) as {
                  id: string;
                  label: string;
                  icon?: string;
                } | undefined;
                if (entry) {
                  entry.label = s.label;
                  entry.icon = undefined;
                }
              });
            })
            .catch(() => {});
          return;
        }

        if (LIST_STATUSES.some((s) => s.id === entryId)) {
          const nextStatus = entryId as ListStatusId;
          const prev = currentStatusId;
          applyReleaseListStatus(id, nextStatus as ReleaseListStatusId, prev)
            .then(() => {
              currentStatusId = nextStatus;
              card.classList.remove(
                'release-card-h--status',
                'release-card-h--status-watching',
                'release-card-h--status-planned',
                'release-card-h--status-completed',
                'release-card-h--status-on_hold',
                'release-card-h--status-dropped',
              );
              card.classList.add('release-card-h--status', `release-card-h--status-${nextStatus}`);
              const posterEl = card.querySelector('.release-card-h__poster') as HTMLElement | null;
              if (posterEl) {
                let badge = posterEl.querySelector('.release-card-h__status-badge') as HTMLElement | null;
                if (!badge) {
                  badge = document.createElement('div');
                  badge.className = 'release-card-h__status-badge';
                  posterEl.appendChild(badge);
                }
                badge.textContent = STATUS_LABEL_BY_ID[nextStatus];
              }
              LIST_STATUSES.forEach((s) => {
                const entry = menuEntries.find((e) => (e as any).id === s.id) as {
                  id: string;
                  label: string;
                  icon?: string;
                } | undefined;
                if (entry) {
                  entry.label = s.label;
                  entry.icon = s.id === nextStatus ? iconCheck(16) : undefined;
                }
              });
            })
            .catch(() => {});
        }
      },
    });
    menuSlot.appendChild(menuWrap);
  }

  return card;
}
