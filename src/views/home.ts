import { navigate } from '../app';
import { renderReleaseCardsGrid } from '../components/grid';
import { getCardLayout } from '../prefs';
import type { ReleaseCardData } from '../types/release';
import { buildPosterUrl } from '../utils/posterUrl';
import { renderTabsBar } from '../components/tabs';

type HomeTabId = 'latest' | 'ongoing' | 'announced' | 'completed' | 'movies';

const HOME_TABS: { id: HomeTabId; label: string }[] = [
  { id: 'latest', label: 'Последние' },
  { id: 'ongoing', label: 'Онгоинги' },
  { id: 'announced', label: 'Анонсы' },
  { id: 'completed', label: 'Завершенные' },
  { id: 'movies', label: 'Фильмы' },
];

function mapReleaseToCardData(raw: Record<string, unknown>): ReleaseCardData {
  const p = raw.poster as Record<string, { url?: string }> | undefined;
  const posterRaw =
    p?.original?.url ?? p?.medium?.url ?? p?.small?.url
    ?? (typeof raw.poster === 'string' ? raw.poster : undefined)
    ?? (typeof raw.image === 'string' ? raw.image : undefined);
  const posterStr = typeof posterRaw === 'string' ? posterRaw : undefined;
  const poster = posterStr ? buildPosterUrl(posterStr) || undefined : undefined;
  const grade = typeof raw.grade === 'number' ? raw.grade : (typeof raw.rating === 'number' ? raw.rating : undefined);
  const statusObj = raw.status as { name?: string } | undefined;
  const categoryObj = raw.category as { name?: string } | undefined;
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
    status: statusObj?.name,
    studio: (raw.studio as string) || undefined,
    category: categoryObj?.name,
    releaseDate: (raw.release_date as string) || undefined,
    isFavorite: !!(raw.is_favorite),
    listStatus,
  };
}

export function renderHome(): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'view view-home';

  wrap.innerHTML = `
    <div class="home-content">
      <div class="home-list" id="home-list">
        <div class="home-list__loading">Загрузка…</div>
      </div>
    </div>
  `;

  const listEl = wrap.querySelector('#home-list') as HTMLElement;

  const randomBtn = document.createElement('button');
  randomBtn.type = 'button';
  randomBtn.id = 'home-random';
  randomBtn.className = 'btn btn-secondary home-toolbar__random';
  randomBtn.textContent = 'Случайный релиз';

  const tabsEl = renderTabsBar({
    tabs: HOME_TABS.map((t) => ({ id: t.id, label: t.label })),
    activeId: 'latest',
    onChange: (id) => {
      setActiveTab(id as HomeTabId);
    },
    rootClassName: 'bookmarks__tabs releases-type',
    rightActions: randomBtn,
  });

  wrap.insertBefore(tabsEl, wrap.firstChild);

  let currentTab: HomeTabId = 'latest';
  let page = 0;
  let hasMore = true;
  let isLoading = false;
  let allContent: Record<string, unknown>[] = [];

  function setActiveTab(tabId: HomeTabId) {
    currentTab = tabId;
    page = 0;
    hasMore = true;
    allContent = [];
    listEl.innerHTML = '<div class="home-list__loading">Загрузка…</div>';
    loadPage();
  }

  function renderCurrentTab() {
    const layoutNow = getCardLayout();
    listEl.innerHTML = '';

    if (!allContent.length) {
      listEl.innerHTML = '<p class="home-list__empty">Здесь пока ничего нет.</p>';
      return;
    }

    const cardsData = allContent.map((raw) => mapReleaseToCardData(raw));
    // Используем тот же класс сетки, что и в /bookmarks,
    // чтобы отступы и поведение были полностью одинаковыми.
    const gridEl = renderReleaseCardsGrid({
      items: cardsData,
      layout: layoutNow,
      className: 'bookmarks__grid',
    });
    listEl.appendChild(gridEl);
  }

  function loadMoreIfNeeded() {
    const scrollEl = wrap.closest('.page__scroll') as HTMLElement | null
      ?? document.getElementById('content');
    if (!scrollEl || !hasMore || isLoading) return;
    requestAnimationFrame(() => {
      if (!hasMore || isLoading) return;
      const distance = scrollEl.scrollHeight - scrollEl.scrollTop - scrollEl.clientHeight;
      if (distance < 300) {
        loadPage();
      }
    });
  }

  function attachScrollListener() {
    const scrollEl = wrap.closest('.page__scroll') as HTMLElement | null
      ?? document.getElementById('content');
    if (!scrollEl) return;
    scrollEl.addEventListener('scroll', () => {
      if (!wrap.isConnected || !hasMore || isLoading) return;
      const distance = scrollEl.scrollHeight - scrollEl.scrollTop - scrollEl.clientHeight;
      if (distance < 300) {
        loadPage();
      }
    });
  }
  requestAnimationFrame(attachScrollListener);

  function loadPage() {
    if (!window.anixApi || isLoading || !hasMore) return;
    isLoading = true;
    const nextPage = page;

    if (nextPage === 0) {
      listEl.innerHTML = '<div class="home-list__loading">Загрузка…</div>';
    }

    // Параметры фильтра как в AniDesk Home.svelte
    const filterArgs: { sort: number; status_id: number | null; category_id: number | null } = {
      sort: 0,
      status_id: null,
      category_id: null,
    };

    switch (currentTab) {
      case 'latest':
        filterArgs.sort = 0;
        filterArgs.status_id = null;
        filterArgs.category_id = null;
        break;
      case 'ongoing':
        filterArgs.status_id = 2;
        filterArgs.category_id = null;
        break;
      case 'announced':
        filterArgs.status_id = 3;
        filterArgs.category_id = null;
        break;
      case 'completed':
        filterArgs.status_id = 1;
        filterArgs.category_id = null;
        break;
      case 'movies':
        filterArgs.category_id = 2;
        filterArgs.status_id = null;
        break;
      default:
        break;
    }

    window.anixApi.release.filter(nextPage, filterArgs, true)
      .then((data: any) => {
        const content = (data?.content ?? []) as Record<string, unknown>[];
        if (!content.length) {
          hasMore = false;
          if (nextPage === 0 && !allContent.length) {
            listEl.innerHTML = '<p class="home-list__empty">Здесь пока ничего нет.</p>';
          }
          return;
        }
        allContent = allContent.concat(content);
        page = nextPage + 1;
        renderCurrentTab();
        loadMoreIfNeeded();
      })
      .catch((err: unknown) => {
        if (!allContent.length) {
          listEl.innerHTML = `<p class="home-list__error">Ошибка: ${String(err)}</p>`;
        }
      })
      .finally(() => {
        isLoading = false;
      });
  }

  randomBtn?.addEventListener('click', async () => {
    if (!window.anixApi) return;
    try {
      const data = await window.anixApi.release.random(true);
      const release = data?.release as { id?: number } | undefined;
      if (release?.id) navigate(`/release/${release.id}`);
    } catch {
      // ignore
    }
  });

  setActiveTab('latest');
  loadPage();

  return wrap;
}
