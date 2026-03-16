import { navigate } from '../app';
import { renderReleaseCardHorizontal } from '../components/release-card-h';
import { renderReleaseCardVertical } from '../components/release-card-v';
import { renderSearchFranchise } from '../components/search-franchise';
import { renderCollectionCard } from '../components/collection-card';
import { getCardLayout } from '../prefs';
import { addSearchHistory } from '../utils/search-history';
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

function esc(s: string): string {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function mapReleaseToCardData(raw: Record<string, unknown>): ReleaseCardData {
  const p = raw.poster as Record<string, { url?: string }> | undefined;
  const posterRaw = p?.original?.url ?? p?.medium?.url ?? p?.small?.url
    ?? (typeof raw.poster === 'string' ? raw.poster : undefined)
    ?? (typeof raw.image === 'string' ? raw.image : undefined);
  const poster = posterRaw ? buildPosterUrl(posterRaw) : undefined;
  const grade = typeof raw.grade === 'number' ? raw.grade : undefined;
  const profileListStatus = typeof raw.profile_list_status === 'number' ? raw.profile_list_status : undefined;
  let listStatus: ReleaseCardData['listStatus'];
  switch (profileListStatus) {
    case 1: listStatus = 'watching'; break;
    case 2: listStatus = 'planned'; break;
    case 3: listStatus = 'completed'; break;
    case 4: listStatus = 'on_hold'; break;
    case 5: listStatus = 'dropped'; break;
    default: listStatus = undefined;
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
    status: (raw.status as { name?: string })?.name,
    studio: (raw.studio as string) || undefined,
    category: (raw.category as { name?: string })?.name,
    releaseDate: (raw.release_date as string) || undefined,
    isFavorite: !!(raw.is_favorite),
    listStatus,
  };
}

type SearchTab = 'releases' | 'profiles' | 'collections';

const TAB_LABELS: Record<SearchTab, string> = {
  releases: 'Релизы',
  profiles: 'Пользователи',
  collections: 'Коллекции',
};

export function renderSearch(initialQuery = '', initialTab: SearchTab = 'releases'): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'view view-search';

  const pageTitle = initialQuery ? `Поиск: ${initialQuery}` : 'Поиск';
  const pageSubtitle = TAB_LABELS[initialTab];

  wrap.innerHTML = `
    <div class="search-page">
      <div class="view-header">
        <h1 class="view-header__title">${esc(pageTitle)}</h1>
        <p class="view-header__subtitle">${esc(pageSubtitle)}</p>
      </div>
      <div class="search-page__results" id="search-results">
        <p class="search-page__hint">Введите запрос в поле выше и нажмите Enter</p>
      </div>
    </div>
  `;

  const results = wrap.querySelector('#search-results') as HTMLElement;

  let currentTab: SearchTab = initialTab;
  let currentQuery = initialQuery;
  let currentPage = 0;
  let isLoading = false;
  let hasMore = true;
  let scrollAttached = false;

  function performSearch(append: boolean) {
    if (!window.anix || !currentQuery.trim()) return;
    if (isLoading || !hasMore) return;
    if (!append) addSearchHistory(currentQuery.trim());
    isLoading = true;

    if (!append) {
      results.innerHTML = '<div class="search-page__loading">Поиск…</div>';
      const header = wrap.querySelector('.view-header');
      if (header) {
        const titleEl = header.querySelector('.view-header__title');
        const subEl = header.querySelector('.view-header__subtitle');
        if (titleEl) titleEl.textContent = currentQuery ? `Поиск: ${currentQuery}` : 'Поиск';
        if (subEl) subEl.textContent = TAB_LABELS[currentTab];
      }
      currentPage = 0;
      hasMore = true;
    } else {
      const loader = document.createElement('div');
      loader.className = 'search-page__loading';
      loader.textContent = 'Загрузка…';
      results.appendChild(loader);
    }

    const q = currentQuery.trim();
    let promise: Promise<any>;

    const pageToLoad = currentPage;
    if (currentTab === 'releases') {
      promise = window.anix.searchReleases(q, pageToLoad);
    } else if (currentTab === 'profiles') {
      promise = window.anix.searchProfiles(q, pageToLoad);
    } else {
      promise = window.anix.searchCollections(q, pageToLoad);
    }

    promise.then((data: any) => {
      console.log(`[Anix API] search.${currentTab} page=${pageToLoad}`, data);
      let contentSource: any = data?.content ?? data;
      // Некоторые методы поиска AnixartJS возвращают объект с полем releases или collections
      if (contentSource && !Array.isArray(contentSource)) {
        if (Array.isArray(contentSource.releases)) contentSource = contentSource.releases;
        else if (Array.isArray(contentSource.collections)) contentSource = contentSource.collections;
      }
      const content = (Array.isArray(contentSource) ? contentSource : []) as any[];

      if (!content.length) {
        if (!append) {
          results.innerHTML = '<p class="search-page__empty">Ничего не найдено</p>';
        } else {
          const lastLoader = results.querySelector('.search-page__loading:last-child');
          if (lastLoader) lastLoader.remove();
          if (!results.querySelector('.search-page__end')) {
            const end = document.createElement('div');
            end.className = 'search-page__end';
            end.textContent = 'это всё :)';
            results.appendChild(end);
          }
        }
        hasMore = false;
        isLoading = false;
        return;
      }

      if (!append) {
        results.innerHTML = '';
      } else {
        const lastLoader = results.querySelector('.search-page__loading:last-child');
        if (lastLoader) lastLoader.remove();
      }

      if (currentTab === 'releases') {
        if (!append && data && data.related) {
          renderRelatedFranchise(data.related, content);
        }
        renderReleaseResults(content, append);
      } else if (currentTab === 'profiles') {
        renderProfileResults(content, append);
      } else {
        renderCollectionResults(content, append);
      }

      currentPage += 1;
      if (content.length === 0) {
        hasMore = false;
      }
      isLoading = false;

      attachInfiniteScroll();
    }).catch((err: unknown) => {
      isLoading = false;
      results.innerHTML = `<p class="search-page__error">Ошибка: ${String(err)}</p>`;
    });
  }

  function renderRelatedFranchise(related: any, releases: any[]) {
    const images: string[] = Array.isArray(related.images) ? related.images : [];
    const count: number | undefined = typeof related.release_count === 'number' ? related.release_count : undefined;
    const name: string = related.name_ru || related.name || '';
    const relatedId: number | undefined = typeof related.id === 'number' ? related.id : undefined;
    const first = releases[0];
    const firstId = first && typeof first.id === 'number' ? first.id : undefined;

    const card = renderSearchFranchise({
      images,
      name,
      releaseCount: count,
      relatedId,
      firstReleaseId: firstId,
    });

    if (card) results.appendChild(card);
  }

  function renderReleaseResults(content: any[], append: boolean) {
    const layout = getCardLayout();
    let wrap = results.querySelector<HTMLElement>('[data-search-rel="releases"]');
    if (!wrap || !append) {
      wrap = document.createElement('div');
      wrap.dataset.searchRel = 'releases';
      wrap.className = layout === 'mini' ? 'release-cards-grid' : 'search-page__results--wide';
      if (!append) {
        // при новом поиске заменяем контейнер
        const old = results.querySelector('[data-search-rel=\"releases\"]');
        if (old && old.parentElement === results) old.remove();
      }
      results.appendChild(wrap);
    }

    content.forEach((raw: any) => {
      const cardData = mapReleaseToCardData(raw);
      const card = layout === 'mini'
        ? renderReleaseCardVertical(cardData)
        : renderReleaseCardHorizontal(cardData);
      wrap.appendChild(card);
    });
  }

  function renderProfileResults(content: any[], append: boolean) {
    let list = results.querySelector<HTMLElement>('[data-search-rel="profiles"]');
    if (!list || !append) {
      list = document.createElement('div');
      list.dataset.searchRel = 'profiles';
      list.className = 'search-page__profiles';
      if (!append) {
        const old = results.querySelector('[data-search-rel=\"profiles\"]');
        if (old && old.parentElement === results) old.remove();
      }
      results.appendChild(list);
    }

    const html = content.map((p: any) => `
      <button type="button" class="search-page__profile" data-profile-id="${p.id}">
        <div class="search-page__profile-avatar" ${p.avatar ? `style="background-image:url('${esc(p.avatar)}')"` : ''}></div>
        <div class="search-page__profile-info">
          <span class="search-page__profile-name">${esc(p.login || '')}</span>
          ${p.status ? `<span class="search-page__profile-status">${esc(p.status)}</span>` : ''}
        </div>
        ${p.is_online ? '<span class="search-page__profile-online"></span>' : ''}
      </button>
    `).join('');

    list.insertAdjacentHTML('beforeend', html);
    list.querySelectorAll('[data-profile-id]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-profile-id');
        if (id) navigate(`/profile/${id}`);
      });
    });
  }

  function renderCollectionResults(content: any[], append: boolean) {
    let list = results.querySelector<HTMLElement>('[data-search-rel="collections"]');
    if (!list || !append) {
      list = document.createElement('div');
      list.dataset.searchRel = 'collections';
      list.className = 'search-page__collections search-page__collections-grid';
      if (!append) {
        const old = results.querySelector('[data-search-rel="collections"]');
        if (old && old.parentElement === results) old.remove();
      }
      results.appendChild(list);
    }

    content.forEach((c: any) => {
      const card = renderCollectionCard({
        id: c.id,
        title: c.title || c.name || 'Без названия',
        image: c.image || c.poster,
        description: c.description || undefined,
        releaseCount: c.release_count,
        notesCount: c.notes_count,
        bookmarksCount: c.bookmarks_count,
        favoritesCount: c.favorites_count,
        isFavorite: !!c.is_favorite,
      });
      list!.appendChild(card);
    });
  }

  function attachInfiniteScroll() {
    if (scrollAttached) return;
    const scrollEl = wrap.closest('.page__scroll') as HTMLElement | null;
    if (!scrollEl) return;
    scrollAttached = true;
    scrollEl.addEventListener('scroll', () => {
      if (!hasMore || isLoading) return;
      const distance = scrollEl.scrollHeight - scrollEl.scrollTop - scrollEl.clientHeight;
      if (distance < 200) {
        performSearch(true);
      }
    });
  }

  if (initialQuery) {
    currentQuery = initialQuery;
    performSearch(false);
  }

  return wrap;
}
