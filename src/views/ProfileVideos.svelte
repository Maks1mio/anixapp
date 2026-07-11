<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { navigate } from '../stores/navigation';
  import { posterUrl } from './Profile/_utils';
  import { buildPosterUrl } from '../utils/posterUrl';
  import { setDiscordContext, refreshDiscordPresence } from '../services/discord-presence';

  interface Props { id?: number; }
  let { id }: Props = $props();

  let profileLogin = $state('Загрузка…');
  let profileAvatar = $state('');
  let profileId = $state(0);
  let items = $state<Record<string, unknown>[]>([]);
  let page = $state(0);
  let hasMore = $state(true);
  let isLoading = $state(false);
  let loadState = $state<'loading' | 'error' | 'empty' | 'ready'>('loading');
  let errorMsg = $state('');
  let wrapEl: HTMLElement | undefined = $state();

  let scrollEl: HTMLElement | null = null;
  let scrollListener: (() => void) | null = null;

  async function resolveProfile() {
    if (id) {
      profileId = id;
      const info = await window.anixApi?.profile.info(id) as { profile?: { login?: string; avatar?: string } };
      profileLogin = info?.profile?.login ?? '';
      profileAvatar = info?.profile?.avatar ?? '';
      return;
    }
    const self = await window.anixApi?.profile.self?.() as { profile?: { id?: number; login?: string; avatar?: string } };
    profileId = self?.profile?.id ?? 0;
    profileLogin = self?.profile?.login ?? '';
    profileAvatar = self?.profile?.avatar ?? '';
  }

  async function load(append: boolean) {
    if (!window.anixApi || isLoading || (!hasMore && append) || !profileId) return;
    isLoading = true;
    if (!append) {
      loadState = 'loading';
      page = 0;
      hasMore = true;
      items = [];
    }
    const pageToLoad = page;
    try {
      const data = await window.anixApi.profile.getFavoriteVideos(profileId, pageToLoad) as {
        content?: Record<string, unknown>[];
        last?: boolean;
      };
      const content = data?.content ?? [];
      if (!content.length) {
        if (!append) loadState = 'empty';
        hasMore = false;
        return;
      }
      items = append ? [...items, ...content] : content;
      page = pageToLoad + 1;
      if (data.last === true || content.length < 25) hasMore = false;
      loadState = 'ready';
    } catch (err) {
      errorMsg = String(err);
      if (!append) loadState = 'error';
    } finally {
      isLoading = false;
    }
  }

  function attachScroll() {
    const el = wrapEl?.closest('.page__scroll') as HTMLElement | null;
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
    await resolveProfile();
    if (!profileId) {
      loadState = 'error';
      errorMsg = 'Не удалось определить профиль';
      return;
    }
    setDiscordContext({ profileLogin, profileAvatar, profileIsSelf: !id });
    refreshDiscordPresence();
    await load(false);
    attachScroll();
  });

  onDestroy(() => {
    if (scrollEl && scrollListener) scrollEl.removeEventListener('scroll', scrollListener);
  });
</script>

<div class="view view-profile view-profile--v2 view-profile-videos" bind:this={wrapEl}>
  <div class="profile-v2">
    <div class="view-header">
      <button type="button" class="view-header__back" onclick={() => navigate(id ? `/profile/${profileId}` : '/profile')}>
        ← Назад
      </button>
      <div class="profile-more__user">
        <div class="profile-more__avatar" style={profileAvatar ? `background-image:url('${buildPosterUrl(profileAvatar)}')` : ''}></div>
        <h1 class="view-header__title">{profileLogin}</h1>
      </div>
    </div>

    <h2 class="profile-v2__section-title">Видео</h2>

    {#if loadState === 'loading'}
      <div class="search-page__loading">Загрузка…</div>
    {:else if loadState === 'error'}
      <p class="profile-v2__error">{errorMsg}</p>
    {:else if loadState === 'empty'}
      <p class="profile-v2__empty">Видео нет</p>
    {:else}
      <div class="profile-v2__videos profile-v2__videos--grid">
        {#each items as item}
          {@const releaseId = item.release_id ?? (item.release as { id?: number } | undefined)?.id}
          <button
            type="button"
            class="profile-v2__video-card"
            onclick={() => releaseId && navigate(`/release/${releaseId}`)}
          >
            {#if item.image || item.preview}
              <div
                class="profile-v2__video-thumb"
                style="background-image:url('{posterUrl(String(item.image ?? item.preview))}')"
              ></div>
            {:else}
              <div class="profile-v2__video-thumb"></div>
            {/if}
            <span class="profile-v2__video-title">{item.title ?? item.name ?? 'Видео'}</span>
          </button>
        {/each}
      </div>
    {/if}
    {#if isLoading && loadState === 'ready'}
      <div class="search-page__loading">Загрузка…</div>
    {/if}
  </div>
</div>
