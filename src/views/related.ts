import { renderReleaseCardHorizontal } from '../components/release-card-h';
import type { ReleaseCardData } from '../types/release';

const POSTER_BASE = 'https://s.anixmirai.com/posters';

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
    listStatus: undefined,
  };
}

export function renderRelated(groupId: number): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'view view-related';

  wrap.innerHTML = `
    <div class="view-header">
      <h1 class="view-header__title">Связанные релизы</h1>
      <p class="view-header__subtitle">Франшиза и спин-оффы</p>
    </div>
    <div class="related__content">
      <div class="related__list" id="related-list">
        <div class="related__loading">Загрузка…</div>
      </div>
    </div>
  `;

  const list = wrap.querySelector('#related-list') as HTMLElement | null;
  if (!list) return wrap;

  if (!window.anix) {
    list.innerHTML = '<p class="related__error">API доступно только в приложении.</p>';
    return wrap;
  }

  let page = 0;
  let loading = false;
  let hasMore = true;

  const loadPage = () => {
    if (loading || !hasMore) return;
    loading = true;

    if (page === 0) {
      list.innerHTML = '<div class="related__loading">Загрузка…</div>';
    } else {
      const loader = document.createElement('div');
      loader.className = 'related__loading';
      loader.textContent = 'Загрузка…';
      list.appendChild(loader);
    }

    window.anix.getRelatedReleases(groupId, page).then((data: any) => {
      console.log('[Anix API] relatedReleases', groupId, page, data);
      const content = (data?.content ?? []) as any[];

      if (page === 0) {
        list.innerHTML = '';
      } else {
        const lastLoader = list.querySelector('.related__loading:last-child');
        if (lastLoader) lastLoader.remove();
      }

      if (!content.length) {
        if (page === 0) {
          list.innerHTML = '<p class="related__empty">Связанных релизов не найдено.</p>';
        }
        hasMore = false;
        loading = false;
        return;
      }

      content.forEach((raw) => {
        const data = mapReleaseToCardData(raw as Record<string, unknown>);
        const card = renderReleaseCardHorizontal(data);
        const item = document.createElement('div');
        item.className = 'related__item';
        item.appendChild(card);
        list.appendChild(item);
      });

      page += 1;
      hasMore = !!content.length;
      loading = false;
    }).catch((err: unknown) => {
      console.error('[Anix] relatedReleases error', err);
      list.innerHTML = `<p class="related__error">Ошибка загрузки: ${String(err)}</p>`;
      loading = false;
    });
  };

  loadPage();

  const scrollEl = wrap.closest('.page__scroll') as HTMLElement | null;
  if (scrollEl) {
    scrollEl.addEventListener('scroll', () => {
      if (!hasMore || loading) return;
      const distance = scrollEl.scrollHeight - scrollEl.scrollTop - scrollEl.clientHeight;
      if (distance < 200) {
        loadPage();
      }
    });
  }

  return wrap;
}

