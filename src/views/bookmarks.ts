import { renderReleaseCardsGrid } from '../components/grid';
import { getCardLayout } from '../prefs';
import type { ReleaseCardData } from '../types/release';
import { buildPosterUrl } from '../utils/posterUrl';
import { renderTabsBar } from '../components/tabs';

type TabId = 'favorites' | 'watching' | 'planned' | 'completed' | 'on_hold' | 'dropped';

const TABS: { id: TabId; label: string; type: number | null }[] = [
  { id: 'favorites', label: 'Избранное', type: null },
  { id: 'watching', label: 'Смотрю', type: 1 },
  { id: 'planned', label: 'В планах', type: 2 },
  { id: 'completed', label: 'Просмотрено', type: 3 },
  { id: 'on_hold', label: 'Отложено', type: 4 },
  { id: 'dropped', label: 'Брошено', type: 5 },
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
    category: (raw.category as { name?: string })?.name,
    releaseDate: (raw.release_date as string) || undefined,
    isFavorite: !!(raw.is_favorite),
    listStatus,
  };
}

export function renderBookmarks(): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'view view-bookmarks';

  wrap.innerHTML = `
    <div class="bookmarks__content">
      <div class="bookmarks__grid" id="bookmarks-grid">
        <div class="bookmarks__loading">Загрузка…</div>
      </div>
      <div class="bookmarks__more" id="bookmarks-more" hidden></div>
    </div>
  `;

  const grid = wrap.querySelector('#bookmarks-grid') as HTMLElement;
  const moreEl = wrap.querySelector('#bookmarks-more') as HTMLElement;
  if (!grid) return wrap;

  const tabsEl = renderTabsBar({
    tabs: TABS.map((t) => ({ id: t.id, label: t.label })),
    activeId: 'favorites',
    onChange: (id) => {
      loadTab(id as TabId);
    },
  });
  wrap.insertBefore(tabsEl, wrap.firstChild);

  const layout = getCardLayout();

  let currentTab: TabId = 'favorites';
  let nextPage = 1;
  let hasMore = true;
  let isLoadingMore = false;
  let cachedProfileId: number | null = null;

  function setLoading() {
    grid.innerHTML = '<div class="bookmarks__loading">Загрузка…</div>';
    if (moreEl) moreEl.hidden = true;
  }

  function setEmpty() {
    grid.innerHTML = '<p class="bookmarks__empty">Здесь пока ничего нет.</p>';
    if (moreEl) moreEl.hidden = true;
  }

  function setError(msg: string) {
    grid.innerHTML = `<p class="bookmarks__error">${msg}</p>`;
    if (moreEl) moreEl.hidden = true;
  }

  function renderCards(content: Record<string, unknown>[], append = false) {
    const cardsData = content.map((raw) => mapReleaseToCardData(raw));
    const gridEl = renderReleaseCardsGrid({
      items: cardsData,
      layout,
      className: 'bookmarks__grid',
    });
    if (!append) {
      grid.innerHTML = '';
    }
    grid.appendChild(gridEl);
  }

  function loadMore() {
    if (!window.anixApi || !hasMore || isLoadingMore) return;
    const tab = TABS.find((t) => t.id === currentTab)!;
    isLoadingMore = true;
    if (moreEl) {
      moreEl.hidden = false;
      moreEl.textContent = 'Загрузка…';
    }

    const onLoaded = (content: Record<string, unknown>[]) => {
      renderCards(content, true);
      hasMore = content.length > 0;
      nextPage += 1;
      if (moreEl) {
        moreEl.textContent = hasMore ? '' : 'это всё :)';
        moreEl.hidden = hasMore;
      }
      isLoadingMore = false;
      tryLoadMoreIfNeeded();
    };

    const onError = (err: unknown) => {
      if (moreEl) moreEl.hidden = true;
      isLoadingMore = false;
    };

    if (tab.id === 'favorites') {
      window.anixApi.favorites.all(nextPage).then((data: any) => {
        const content = (data?.content ?? data?.releases ?? []) as Record<string, unknown>[];
        onLoaded(content);
      }).catch(onError);
      return;
    }
    const profileId = cachedProfileId;
    if (typeof profileId !== 'number') {
      onError(null);
      return;
    }
    window.anixApi.profile.getBookmarks(profileId, tab.type!, nextPage).then((data: any) => {
      const content = (data?.content ?? data?.releases ?? []) as Record<string, unknown>[];
      onLoaded(content);
    }).catch(onError);
  }

  function loadTab(tabId: TabId) {
    currentTab = tabId;
    nextPage = 1;
    hasMore = true;

    if (!window.anixApi) {
      setError('API недоступно (только в Electron).');
      return;
    }

    setLoading();
    const tab = TABS.find((t) => t.id === tabId)!;

    if (tab.id === 'favorites') {
      window.anixApi.favorites
        .all(0)
        .then((data: any) => {
          const content = (data?.content ?? data?.releases ?? []) as Record<string, unknown>[];
          if (!content.length) {
            setEmpty();
            return;
          }
          renderCards(content);
          hasMore = content.length > 0;
          if (moreEl && hasMore) moreEl.hidden = true;
          if (moreEl && !hasMore) {
            moreEl.hidden = false;
            moreEl.textContent = 'это всё :)';
          }
          tryLoadMoreIfNeeded();
        })
        .catch((err) => setError(`Ошибка: ${String(err)}`));
      return;
    }

    window.anixApi.profile.self().then((selfRes: any) => {
      const profile = selfRes?.profile ?? selfRes;
      const profileId = profile?.id ?? (profile && (profile as { '@id'?: number })['@id']);
      if (typeof profileId !== 'number') {
        setError('Не удалось определить профиль.');
        return;
      }
      cachedProfileId = profileId;
      window.anixApi!.profile
        .getBookmarks(profileId, tab.type!, 0)
        .then((data: any) => {
          const content = (data?.content ?? data?.releases ?? []) as Record<string, unknown>[];
          if (!content.length) {
            setEmpty();
            return;
          }
          renderCards(content);
          hasMore = content.length > 0;
          if (moreEl && hasMore) moreEl.hidden = true;
          if (moreEl && !hasMore) {
            moreEl.hidden = false;
            moreEl.textContent = 'это всё :)';
          }
          tryLoadMoreIfNeeded();
        })
        .catch((err) => setError(`Ошибка: ${String(err)}`));
    }).catch(() => setError('Не удалось загрузить профиль.'));
  }

  // Контейнер скролла — #content (page__scroll); wrap может быть ещё не в DOM при первом вызове
  const getScrollEl = () =>
    (wrap.closest('.page__scroll') ?? document.getElementById('content')) as HTMLElement | null;

  function tryLoadMoreIfNeeded() {
    const scrollEl = getScrollEl();
    if (!scrollEl || !hasMore || isLoadingMore) return;
    requestAnimationFrame(() => {
      if (!hasMore || isLoadingMore) return;
      const el = getScrollEl();
      if (!el) return;
      const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
      if (distance < 300) loadMore();
      else if (el.scrollHeight <= el.clientHeight + 150) loadMore();
    });
  }

  function attachScrollListener() {
    const scrollEl = getScrollEl();
    if (!scrollEl) return;
    scrollEl.addEventListener('scroll', () => {
      if (!wrap.isConnected) return;
      if (!hasMore || isLoadingMore) return;
      const distance = scrollEl.scrollHeight - scrollEl.scrollTop - scrollEl.clientHeight;
      if (distance < 300) loadMore();
    });
  }
  requestAnimationFrame(attachScrollListener);

  loadTab('favorites');
  return wrap;
}
