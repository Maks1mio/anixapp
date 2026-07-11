<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { navigate } from '../stores/navigation';
  import { resolveCdnAssetUrl } from '../utils/posterUrl';
  import { setDiscordContext, refreshDiscordPresence } from '../services/discord-presence';
  import Tabs from '../components/Tabs.svelte';

  interface Props {
    id?: number;
  }

  let { id }: Props = $props();

  function onProfileTabChange(tabId: string) {
    if (tabId === 'friends') return;
    navigate(id ? `/profile/${id}/votes` : '/profile/votes');
  }

  let profileLogin = $state('Загрузка…');
  let profileAvatar = $state('');
  let resolvedId = $derived(id ?? 0);
  let titleSet = false;
  let friendCount = $state<number | null>(null);

  const profileTabs = $derived([
    { id: 'votes', label: 'Оценки' },
    { id: 'friends', label: 'Друзья', badge: friendCount ?? undefined },
  ]);

  let friends = $state<any[]>([]);
  let recommendations = $state<any[]>([]);
  let isMyProfilePage = $state(!id);
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

  function setProfile(login: string, avatar?: string, isSelf = !id) {
    if (titleSet) return;
    titleSet = true;
    profileLogin = login;
    if (avatar) profileAvatar = avatar;
    setDiscordContext({
      profileLogin: login,
      profileAvatar: avatar ? resolveCdnAssetUrl(avatar) : undefined,
      profileIsSelf: isSelf,
    });
    refreshDiscordPresence();
  }

  async function getId(): Promise<number> {
    if (resolvedId) return resolvedId;
    const self = await window.anixApi?.profile.self?.() as any;
    const p = self?.profile;
    if (p?.login) setProfile(p.login, p.avatar);
    if (typeof p?.friend_count === 'number') friendCount = p.friend_count;
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
      friends = [];
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
      const data = await window.anixApi!.profile.getFriends(uid, pageToLoad) as any;
      const content = (data?.content ?? []) as any[];
      if (!content.length) {
        if (!append) loadState = 'empty';
        showEnd = true;
        hasMore = false;
        isLoading = false;
        return;
      }
      friends = append ? [...friends, ...content] : content;
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

  onMount(async () => {
    if (id) {
      window.anixApi?.profile.info(id).then((d: any) => {
        const p = d?.profile;
        if (p?.login) setProfile(p.login, p.avatar, !!d?.is_my_profile);
        if (typeof p?.friend_count === 'number') friendCount = p.friend_count;
        isMyProfilePage = !!d?.is_my_profile;
      }).catch(() => {});
    } else {
      isMyProfilePage = true;
      try {
        const rec = await window.anixApi?.profile.getFriendRecommendations?.() as { content?: any[] };
        recommendations = rec?.content ?? [];
      } catch { /* ignore */ }
    }
    if (window.anixApi) await load(false);
  });

  onDestroy(() => {
    if (scrollEl && scrollListener) scrollEl.removeEventListener('scroll', scrollListener);
  });
</script>

<div class="view view-search" bind:this={wrapEl}>
  <div class="search-page">
    <div class="view-header">
      <div class="profile-more__user">
        <div class="profile-more__avatar" style={profileAvatar ? `background-image:url('${resolveCdnAssetUrl(profileAvatar)}')` : ''}></div>
        <h1 class="view-header__title">{profileLogin}</h1>
      </div>
    </div>

    <Tabs tabs={profileTabs} activeId="friends" onChange={onProfileTabChange} />

    <div class="search-page__results">
      {#if isMyProfilePage && recommendations.length}
        <section class="profile-friends__recs">
          <h2 class="profile-friends__recs-title">Рекомендации</h2>
          <div class="search-page__profiles">
            {#each recommendations as fr}
              <button
                type="button"
                class="search-page__profile"
                onclick={() => navigate(`/profile/${fr.id}`)}
              >
                <div
                  class="search-page__profile-avatar"
                  style={fr.avatar ? `background-image:url('${resolveCdnAssetUrl(fr.avatar)}')` : ''}
                ></div>
                <div class="search-page__profile-info">
                  <span class="search-page__profile-name">{fr.login || ''}</span>
                </div>
              </button>
            {/each}
          </div>
        </section>
      {/if}

      {#if loadState === 'loading'}
        <div class="search-page__loading">Загрузка…</div>
      {:else if loadState === 'error'}
        <p class="search-page__error">Ошибка: {errorMsg}</p>
      {:else if loadState === 'empty'}
        <p class="search-page__empty">Ничего не найдено</p>
      {:else}
        <div class="search-page__profiles">
          {#each friends as fr}
            <button
              type="button"
              class="search-page__profile"
              onclick={() => navigate(`/profile/${fr.id}`)}
            >
              <div
                class="search-page__profile-avatar"
                style={fr.avatar ? `background-image:url('${resolveCdnAssetUrl(fr.avatar)}')` : ''}
              ></div>
              <div class="search-page__profile-info">
                <span class="search-page__profile-name">{fr.login || ''}</span>
                {#if fr.friend_count != null}
                  <span class="search-page__profile-status">{fr.friend_count} друзей</span>
                {/if}
              </div>
              {#if fr.is_online}
                <span class="search-page__profile-online"></span>
              {/if}
            </button>
          {/each}
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
