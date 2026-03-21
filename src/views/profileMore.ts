import { navigate } from '../stores/navigation';
import { renderReleaseCardsGrid } from '../components/grid';
import { renderTabsBar } from '../components/tabs';
import { getCardLayout } from '../prefs';
import type { ReleaseCardData } from '../types/release';

const POSTER_BASE = 'https://s.anixmirai.com/posters';

type ProfileMoreTab = 'votes' | 'friends';

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

function mapVoteToCardData(raw: any): ReleaseCardData {
  const p = raw.poster as Record<string, { url?: string }> | undefined;
  const posterRaw = p?.original?.url ?? p?.medium?.url ?? p?.small?.url
    ?? (typeof raw.poster === 'string' ? raw.poster : undefined)
    ?? (typeof raw.image === 'string' ? raw.image : undefined);
  const poster = posterRaw ? buildPosterUrl(posterRaw) : undefined;

  let listStatus: ReleaseCardData['listStatus'];
  switch (raw.profile_list_status) {
    case 1: listStatus = 'watching'; break;
    case 2: listStatus = 'planned'; break;
    case 3: listStatus = 'completed'; break;
    case 4: listStatus = 'on_hold'; break;
    case 5: listStatus = 'dropped'; break;
  }

  const genres = Array.isArray(raw.genres)
    ? raw.genres.map((g: any) => g?.name || g).filter(Boolean).join(', ')
    : (typeof raw.genres === 'string' ? raw.genres : undefined);

  return {
    id: raw.id,
    titleRu: raw.title_ru || raw.title,
    titleEn: raw.title_original,
    poster,
    rating: typeof raw.grade === 'number' ? raw.grade : undefined,
    voteCount: typeof raw.vote_count === 'number' ? raw.vote_count : undefined,
    episodesReleased: typeof raw.episodes_released === 'number' ? raw.episodes_released : undefined,
    episodesTotal: typeof raw.episodes_total === 'number' ? raw.episodes_total : undefined,
    year: raw.year ? String(raw.year) : undefined,
    status: (raw.status as any)?.name || (typeof raw.status === 'string' ? raw.status : undefined),
    genres,
    description: typeof raw.description === 'string' ? raw.description : undefined,
    isFavorite: !!raw.is_favorite,
    listStatus,
    myVote: typeof raw.my_vote === 'number' && raw.my_vote > 0 ? raw.my_vote : undefined,
  };
}

function renderProfileMore(userId: number | undefined, initialTab: ProfileMoreTab): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'view view-search';

  wrap.innerHTML = `
    <div class="search-page">
      <div class="view-header">
        <div class="profile-more__user">
          <div class="profile-more__avatar" data-profile-avatar></div>
          <h1 class="view-header__title"><span data-profile-login>Загрузка…</span></h1>
        </div>
      </div>
      <div class="search-page__results" id="profile-more-results"></div>
    </div>`;

  const viewHeader = wrap.querySelector('.view-header') as HTMLElement;
  const results = wrap.querySelector('#profile-more-results') as HTMLElement;
  const loginEl = wrap.querySelector('[data-profile-login]') as HTMLElement;
  const avatarEl = wrap.querySelector('[data-profile-avatar]') as HTMLElement;

  let currentTab: ProfileMoreTab = initialTab;
  let resolvedId = userId ?? 0;
  let titleSet = false;
  let friendCount: number | null = null;
  let isLoading = false;
  let hasMore = true;
  let currentPage = 0;
  let scrollAttached = false;

  const setProfile = (login: string, avatar?: string) => {
    if (titleSet) return;
    titleSet = true;
    loginEl.textContent = login;
    if (avatar && avatarEl) {
      avatarEl.style.backgroundImage = `url('${avatar.replace(/'/g, "\\'")}')`;
    }
  };

  const getId = async (): Promise<number> => {
    if (resolvedId) return resolvedId;
    const self = await window.anixApi?.profile.self?.();
    const p = self?.profile as any;
    if (p?.login) setProfile(p.login, p.avatar);
    if (typeof p?.friend_count === 'number') {
      friendCount = p.friend_count;
    }
    resolvedId = p?.id ?? 0;
    return resolvedId;
  };

  const tabsEl = renderTabsBar({
    tabs: [
      { id: 'votes', label: 'Оценки' },
      { id: 'friends', label: 'Друзья' },
    ],
    activeId: initialTab,
    onChange: (id) => applyTabChange(id as ProfileMoreTab),
  });
  viewHeader.insertAdjacentElement('afterend', tabsEl);

  const friendsTabBtn = tabsEl.querySelector<HTMLButtonElement>('[data-tab="friends"]');
  const updateFriendsTabLabel = () => {
    if (!friendsTabBtn) return;
    friendsTabBtn.innerHTML = friendCount != null
      ? `Друзья <span class="profile-more__friends-count">${friendCount}</span>`
      : 'Друзья';
  };
  updateFriendsTabLabel();

  function applyTabChange(tab: ProfileMoreTab) {
    if (currentTab === tab) return;
    currentTab = tab;
    currentPage = 0;
    hasMore = true;
    isLoading = false;
    scrollAttached = false;
    load(false);
  }

  const syncFriendCount = (count: number | null | undefined) => {
    friendCount = typeof count === 'number' && count >= 0 ? count : null;
    updateFriendsTabLabel();
  };

  function load(append: boolean) {
    if (isLoading || (!hasMore && append)) return;
    isLoading = true;

    if (!append) {
      results.innerHTML = '<div class="search-page__loading">Загрузка…</div>';
      currentPage = 0;
      hasMore = true;
    } else {
      const loader = document.createElement('div');
      loader.className = 'search-page__loading';
      loader.textContent = 'Загрузка…';
      results.appendChild(loader);
    }

    const pageToLoad = currentPage;

    getId().then(id => {
      if (!id) {
        results.innerHTML = '<p class="search-page__empty">Пользователь не найден</p>';
        isLoading = false;
        return;
      }

      const promise: Promise<any> = currentTab === 'votes'
        ? window.anixApi!.profile.getVotedReleases(id, pageToLoad)
        : window.anixApi!.profile.getFriends(id, pageToLoad);

      promise.then((data: any) => {
        const content = (data?.content ?? []) as any[];

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

        if (currentTab === 'votes') {
          renderVoteResults(content, append);
        } else {
          renderFriendResults(content, append);
        }

        currentPage += 1;
        isLoading = false;
        attachInfiniteScroll();
      }).catch((err: unknown) => {
        isLoading = false;
        results.innerHTML = `<p class="search-page__error">Ошибка: ${String(err)}</p>`;
      });
    });
  }

  function renderVoteResults(content: any[], append: boolean) {
    let container = results.querySelector<HTMLElement>('[data-tab-rel="votes"]');
    if (!container || !append) {
      container = document.createElement('div');
      container.dataset.tabRel = 'votes';
      container.className = 'search-page__results--wide';
      results.appendChild(container);
    }
    const layout = getCardLayout();
    const cardsData = content.map(mapVoteToCardData);
    const gridEl = renderReleaseCardsGrid({
      items: cardsData,
      layout,
      className: layout === 'mini' ? 'release-cards-grid' : '',
    });
    container.appendChild(gridEl);
  }

  function renderFriendResults(content: any[], append: boolean) {
    let list = results.querySelector<HTMLElement>('[data-tab-rel="friends"]');
    if (!list || !append) {
      list = document.createElement('div');
      list.dataset.tabRel = 'friends';
      list.className = 'search-page__profiles';
      results.appendChild(list);
    }
    const html = content.map((fr: any) => `
      <button type="button" class="search-page__profile" data-friend-id="${fr.id}">
        <div class="search-page__profile-avatar" ${fr.avatar ? `style="background-image:url('${esc(fr.avatar)}')"` : ''}></div>
        <div class="search-page__profile-info">
          <span class="search-page__profile-name">${esc(fr.login || '')}</span>
          ${fr.friend_count != null ? `<span class="search-page__profile-status">${fr.friend_count} друзей</span>` : ''}
        </div>
        ${fr.is_online ? '<span class="search-page__profile-online"></span>' : ''}
      </button>
    `).join('');
    list.insertAdjacentHTML('beforeend', html);
    list.querySelectorAll('[data-friend-id]:not([data-bound])').forEach(btn => {
      (btn as HTMLElement).dataset.bound = '1';
      btn.addEventListener('click', () => {
        const fid = btn.getAttribute('data-friend-id');
        if (fid) navigate(`/profile/${fid}`);
      });
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
      if (distance < 200) load(true);
    });
  }

  if (userId) {
    window.anixApi?.profile.info(userId).then(d => {
      const p = d?.profile as any;
      if (p?.login) setProfile(p.login, p.avatar);
      syncFriendCount(p?.friend_count);
    }).catch(() => {});
  }

  if (window.anixApi) {
    void load(false);
  }

  window.addEventListener('anix:cardLayoutChanged', () => {
    if (!wrap.isConnected) return;
    load(false);
  });

  return wrap;
}

export function renderProfileVotes(userId?: number): HTMLElement {
  return renderProfileMore(userId, 'votes');
}

export function renderProfileFriends(userId?: number): HTMLElement {
  return renderProfileMore(userId, 'friends');
}
