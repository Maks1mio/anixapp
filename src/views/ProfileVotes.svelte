<script lang="ts">
  import ReleaseCardV from "../components/ReleaseCardV.svelte";
  import { onMount, onDestroy } from 'svelte';
  import { navigate } from '../stores/navigation';
  import Tabs from '../components/Tabs.svelte';
  import type { ReleaseCardData } from '../types/release';

  interface Props {
    id?: number;
  }

  let { id }: Props = $props();

  const POSTER_BASE = 'https://s.anixmirai.com/posters';

  function buildPosterUrl(value: string | undefined): string | undefined {
    if (!value || typeof value !== 'string') return undefined;
    const v = value.trim();
    if (!v) return undefined;
    if (v.startsWith('http://') || v.startsWith('https://')) return v;
    const iid = v.endsWith('.jpg') || v.endsWith('.jpeg') || v.endsWith('.png') ? v : `${v}.jpg`;
    return `${POSTER_BASE}/${iid}`;
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

  let profileLogin = $state('Загрузка…');
  let profileAvatar = $state('');
  let resolvedId = $derived(id ?? 0);
  let titleSet = false;

  let items = $state<ReleaseCardData[]>([]);
  let currentPage = $state(0);
  let isLoading = $state(false);
  let hasMore = $state(true);
  let loadState = $state<'loading' | 'error' | 'empty' | 'ready'>('loading');
  let errorMsg = $state('');
  let showEnd = $state(false);
  let wrapEl: HTMLElement | undefined = $state();

  let scrollEl: HTMLElement | null = null;
  let scrollListener: (() => void) | null = null;
  let scrollAttached = false;


  function setProfile(login: string, avatar?: string) {
    if (titleSet) return;
    titleSet = true;
    profileLogin = login;
    if (avatar) profileAvatar = avatar;
  }

  async function getId(): Promise<number> {
    if (resolvedId) return resolvedId;
    const self = await window.anixApi?.profile.self?.() as any;
    const p = self?.profile;
    if (p?.login) setProfile(p.login, p.avatar);
    resolvedId = p?.id ?? 0;
    return resolvedId;
  }

  function attachInfiniteScroll() {
    if (scrollAttached) return;
    const el = wrapEl?.closest('.page__scroll') as HTMLElement | null;
    if (!el) return;
    scrollAttached = true;
    scrollEl = el;
    scrollListener = () => {
      if (!hasMore || isLoading) return;
      const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
      if (distance < 200) load(true);
    };
    el.addEventListener('scroll', scrollListener);
  }

  async function load(append: boolean) {
    if (isLoading || (!hasMore && append)) return;
    isLoading = true;
    if (!append) {
      loadState = 'loading';
      currentPage = 0;
      hasMore = true;
      items = [];
      showEnd = false;
    }
    const pageToLoad = currentPage;
    try {
      const uid = await getId();
      if (!uid) {
        loadState = 'empty';
        isLoading = false;
        return;
      }
      const data = await window.anixApi!.profile.getVotedReleases(uid, pageToLoad) as any;
      const content = (data?.content ?? []) as any[];
      if (!content.length) {
        if (!append) loadState = 'empty';
        showEnd = true;
        hasMore = false;
        isLoading = false;
        return;
      }
      items = append ? [...items, ...content.map(mapVoteToCardData)] : content.map(mapVoteToCardData);
      loadState = 'ready';
      currentPage += 1;
      isLoading = false;
      attachInfiniteScroll();
    } catch (err) {
      errorMsg = String(err);
      loadState = 'error';
      isLoading = false;
    }
  }

  function onLayoutChanged() {
    if (!wrapEl) return;
    scrollAttached = false;
    load(false);
  }

  onMount(async () => {
    if (id) {
      window.anixApi?.profile.info(id).then((d: any) => {
        const p = d?.profile;
        if (p?.login) setProfile(p.login, p.avatar);
      }).catch(() => {});
    }
    if (window.anixApi) await load(false);
    window.addEventListener('anix:cardLayoutChanged', onLayoutChanged);
  });

  onDestroy(() => {
    if (scrollEl && scrollListener) scrollEl.removeEventListener('scroll', scrollListener);
    window.removeEventListener('anix:cardLayoutChanged', onLayoutChanged);
  });
</script>

<div class="view view-search" bind:this={wrapEl}>
  <div class="search-page">
    <div class="view-header">
      <div class="profile-more__user">
        <div class="profile-more__avatar" style={profileAvatar ? `background-image:url('${profileAvatar}')` : ''}></div>
        <h1 class="view-header__title">{profileLogin}</h1>
      </div>
    </div>

    <div class="bookmarks__tabs">
      <button type="button" class="bookmarks__tab bookmarks__tab--active" data-tab="votes">Оценки</button>
      <button type="button" class="bookmarks__tab" data-tab="friends" onclick={() => navigate(id ? `/profile/${id}/friends` : '/profile/friends')}>Друзья</button>
    </div>

    <div class="search-page__results">
      {#if loadState === 'loading'}
        <div class="search-page__loading">Загрузка…</div>
      {:else if loadState === 'error'}
        <p class="search-page__error">Ошибка: {errorMsg}</p>
      {:else if loadState === 'empty'}
        <p class="search-page__empty">Ничего не найдено</p>
      {:else}
        <div class="search-page__results--wide">
          <div class="bookmarks__grid">
            {#each items as item (item.id)}
              <ReleaseCardV data={item} />
            {/each}
          </div>
        </div>
      {/if}

      {#if showEnd && loadState === 'ready'}
        <div class="search-page__end">это всё :)</div>
      {:else if isLoading && loadState === 'ready'}
        <div class="search-page__loading">Загрузка…</div>
      {/if}
    </div>
  </div>
</div>
