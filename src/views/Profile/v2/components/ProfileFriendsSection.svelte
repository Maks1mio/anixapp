<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { handleUserProfileClick } from '../../../../stores/user-profile';
  import { posterUrl } from '../../_utils';
  import UserBadge from '../../../../components/UserBadge.svelte';
  import { resolveBadgeName, resolveProfileBadgeUrl } from '../../../../utils/badge';

  interface Props {
    profileId: number;
    isMyProfile?: boolean;
    totalCount?: number;
    hideTitle?: boolean;
  }

  let { profileId, isMyProfile = false, totalCount = 0, hideTitle = false }: Props = $props();

  let rootEl = $state<HTMLElement | undefined>();
  let friends = $state<Record<string, unknown>[]>([]);
  let recommendations = $state<Record<string, unknown>[]>([]);
  let currentPage = $state(0);
  let isLoading = $state(false);
  let hasMore = $state(true);
  let loadState = $state<'loading' | 'error' | 'empty' | 'ready'>('loading');
  let errorMsg = $state('');

  let scrollEl: HTMLElement | null = null;
  let scrollListener: (() => void) | null = null;

  async function load(append: boolean) {
    if (!profileId || !window.anixApi?.profile || isLoading || (!hasMore && append)) return;
    isLoading = true;
    if (!append) {
      loadState = 'loading';
      currentPage = 0;
      hasMore = true;
      friends = [];
    }
    const pageToLoad = currentPage;
    try {
      const data = await window.anixApi.profile.getFriends(profileId, pageToLoad) as {
        content?: Record<string, unknown>[];
      };
      const content = data?.content ?? [];
      if (!content.length) {
        if (!append) loadState = 'empty';
        hasMore = false;
        isLoading = false;
        return;
      }
      friends = append ? [...friends, ...content] : content;
      loadState = 'ready';
      currentPage += 1;
      hasMore = content.length >= 20;
      isLoading = false;
      attachInfiniteScroll();
    } catch (err) {
      errorMsg = String(err);
      loadState = 'error';
      isLoading = false;
    }
  }

  function attachInfiniteScroll() {
    if (scrollListener) return;
    const el = rootEl?.closest('[data-profile-main-scroll], .page__scroll') as HTMLElement | null;
    if (!el) return;
    scrollEl = el;
    scrollListener = () => {
      if (!hasMore || isLoading) return;
      const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
      if (distance < 200) void load(true);
    };
    el.addEventListener('scroll', scrollListener);
  }

  onMount(async () => {
    if (isMyProfile) {
      try {
        const rec = await window.anixApi?.profile.getFriendRecommendations?.() as { content?: Record<string, unknown>[] };
        recommendations = rec?.content ?? [];
      } catch { /* ignore */ }
    }
    await load(false);
    attachInfiniteScroll();
  });

  onDestroy(() => {
    if (scrollEl && scrollListener) scrollEl.removeEventListener('scroll', scrollListener);
  });
</script>

<div class="profile-v2__friends-section" bind:this={rootEl}>
  {#if isMyProfile && recommendations.length > 0}
    <section class="profile-friends__recs">
      <h3 class="profile-friends__recs-title">Рекомендации</h3>
      <div class="search-page__profiles">
        {#each recommendations as fr}
          {@const badgeUrl = resolveProfileBadgeUrl(fr)}
          <button
            type="button"
            class="search-page__profile"
            onclick={(event) => handleUserProfileClick(Number(fr.id), event)}
          >
            <div
              class="search-page__profile-avatar"
              style={fr.avatar ? `background-image:url('${posterUrl(String(fr.avatar))}')` : ''}
            ></div>
            <div class="search-page__profile-info">
              <span class="search-page__profile-name-row">
                <span class="search-page__profile-name">{fr.login || ''}</span>
                <UserBadge url={badgeUrl} name={resolveBadgeName(fr.badge)} size="sm" />
              </span>
            </div>
          </button>
        {/each}
      </div>
    </section>
  {/if}

  {#if loadState === 'loading' && friends.length === 0}
    <p class="profile-v2__friends-state">Загрузка друзей…</p>
  {:else if loadState === 'error'}
    <p class="profile-v2__friends-state profile-v2__friends-state--error">{errorMsg}</p>
  {:else if loadState === 'empty'}
    <p class="profile-v2__friends-state">Список друзей пуст</p>
  {:else}
    {#if !hideTitle}
      <div class="profile-v2__friends-head">
        <h3 class="profile-v2__section-title">
          Друзья
          {#if totalCount > 0}
            <span class="profile-v2__friends-count">{totalCount}</span>
          {/if}
        </h3>
      </div>
    {/if}
    <div class="profile__friends-grid">
      {#each friends as fr}
        {@const badgeUrl = resolveProfileBadgeUrl(fr)}
        <button
          type="button"
          class="profile__friend-card"
          onclick={(event) => handleUserProfileClick(Number(fr.id), event)}
        >
          <div
            class="profile__friend-av"
            style={fr.avatar ? `background-image:url('${posterUrl(String(fr.avatar))}')` : ''}
          ></div>
          {#if fr.is_online}
            <span class="profile__friend-online"></span>
          {/if}
          <span class="profile__friend-name-row">
            <span class="profile__friend-name">{fr.login || ''}</span>
            <UserBadge url={badgeUrl} name={resolveBadgeName(fr.badge)} size="xs" />
          </span>
          {#if fr.friend_count != null}
            <span class="profile__friend-sub">{fr.friend_count} др.</span>
          {/if}
        </button>
      {/each}
    </div>
    {#if isLoading && friends.length > 0}
      <p class="profile-v2__friends-state">Загрузка…</p>
    {/if}
  {/if}
</div>
