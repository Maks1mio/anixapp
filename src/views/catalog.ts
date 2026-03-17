import { renderReleaseCardsGrid } from '../components/grid';
import { getCardLayout } from '../prefs';
import type { ReleaseCardData } from '../types/release';

const POSTER_BASE = 'https://s.anixmirai.com/posters';

/** API отдаёт poster как ID — собираем URL: s.anixmirai.com/posters/{id}.jpg */
function buildPosterUrl(value: string | undefined): string | undefined {
  if (!value || typeof value !== 'string') return undefined;
  const v = value.trim();
  if (!v) return undefined;
  if (v.startsWith('http://') || v.startsWith('https://')) return v;
  const id = v.endsWith('.jpg') || v.endsWith('.jpeg') || v.endsWith('.png') ? v : `${v}.jpg`;
  return `${POSTER_BASE}/${id}`;
}

function mapReleaseToCardData(raw: Record<string, unknown>): ReleaseCardData {
  const p = raw.poster as Record<string, { url?: string }> | undefined;
  const posterRaw = p?.original?.url ?? p?.medium?.url ?? p?.small?.url
    ?? (typeof raw.poster === 'string' ? raw.poster : undefined)
    ?? (typeof raw.image === 'string' ? raw.image : undefined);
  const poster = posterRaw ? buildPosterUrl(posterRaw) : undefined;
  const grade = typeof raw.grade === 'number' ? raw.grade : undefined;
  const statusObj = raw.status as { name?: string } | undefined;
  const categoryObj = raw.category as { name?: string } | undefined;
  const profileListStatus = typeof raw.profile_list_status === 'number' ? raw.profile_list_status : undefined;
  let listStatus: ReleaseCardData['listStatus'];
  switch (profileListStatus) {
    case 1:
      listStatus = 'watching';
      break;
    case 2:
      listStatus = 'planned';
      break;
    case 3:
      listStatus = 'completed';
      break;
    case 4:
      listStatus = 'on_hold';
      break;
    case 5:
      listStatus = 'dropped';
      break;
    default:
      listStatus = undefined;
  }
  return {
    id: raw.id as number | undefined,
    titleRu: (raw.title_ru ?? raw.titleRu) as string | undefined,
    titleEn: (raw.title_original ?? raw.titleEn) as string | undefined,
    titleAlt: (raw.title_alt as string) || undefined,
    description: (raw.description as string) || undefined,
    poster: poster || undefined,
    rating: grade,
    voteCount: typeof raw.vote_count === 'number' ? raw.vote_count : undefined,
    episodesReleased: typeof raw.episodes_released === 'number' ? raw.episodes_released : undefined,
    episodesTotal: typeof raw.episodes_total === 'number' ? raw.episodes_total : undefined,
    year: typeof raw.year === 'string' ? raw.year : (typeof raw.year === 'number' ? String(raw.year) : undefined),
    country: (raw.country as string) || undefined,
    genres: (raw.genres as string) || undefined,
    status: statusObj?.name,
    studio: (raw.studio as string) || undefined,
    category: categoryObj?.name,
    releaseDate: (raw.release_date as string) || undefined,
    isFavorite: !!(raw.is_favorite),
    listStatus,
  };
}

export function renderCatalog(): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'view view-catalog';

  wrap.innerHTML = `
    <div class="view-header">
      <h1 class="view-header__title">Каталог</h1>
      <p class="view-header__subtitle">Релизы с описанием и рейтингом</p>
    </div>
    <div class="catalog-list" id="catalog-list">
      <div class="catalog-loading">Загрузка…</div>
    </div>
  `;

  const listEl = wrap.querySelector('#catalog-list') as HTMLElement;
  const layout = getCardLayout();

  if (!window.anixApi) {
    listEl.innerHTML = '<p class="feed-error">API доступно только в Electron.</p>';
    return wrap;
  }

  window.anixApi.discover.recommendations(0)
    .then((data) => {
      console.log('[Anix API] getDiscoverRecommendations', data);
      const content = (data?.content ?? []) as Record<string, unknown>[];
      if (content.length > 0) {
        listEl.innerHTML = '';
        const cardsData = content.map((raw) => mapReleaseToCardData(raw));
        const gridEl = renderReleaseCardsGrid({ items: cardsData, layout, className: 'catalog-list' });
        listEl.appendChild(gridEl);
        return;
      }
      return api.getLatestFeed(1).then(async (feedData) => {
        console.log('[Anix API] getLatestFeed', feedData);
        const feedContent = (feedData?.content ?? []) as Array<{ release?: { id?: number } }>;
        const ids = feedContent.map((a) => a.release?.id).filter((id): id is number => typeof id === 'number');
        if (ids.length === 0) {
          listEl.innerHTML = '<p class="feed-empty">Нет записей в ленте.</p>';
          return;
        }
        listEl.innerHTML = '<div class="catalog-loading">Загрузка…</div>';
        const results = await Promise.all(
          ids.slice(0, 15).map((id) =>
            api.getReleaseById(id, true).then((r) => {
              console.log('[Anix API] getReleaseById', id, r);
              return (r?.release as Record<string, unknown>) ?? null;
            })
          )
        );
        const cards: ReleaseCardData[] = results.filter(Boolean).map((raw) => mapReleaseToCardData(raw!));
        listEl.innerHTML = '';
        const gridEl = renderReleaseCardsGrid({ items: cards, layout, className: 'catalog-list' });
        listEl.appendChild(gridEl);
      });
    })
    .catch((err) => {
      listEl.innerHTML = `<p class="feed-error">Ошибка: ${String(err)}</p>`;
    });

  return wrap;
}
