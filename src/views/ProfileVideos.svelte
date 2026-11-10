<script lang="ts">
  import UiV2BackBar from '../components/uikit-v2/UiV2BackBar.svelte';
  import { onMount, onDestroy } from 'svelte';
  import { navigate, goBack } from '../stores/navigation';
  import { normalizeVideo, type ReleaseVideoItem } from './Release/_videoUtils';
  import VideoList from '../components/video/VideoList.svelte';
  import { resolveJacksonRefsByKey } from '../utils/jackson-refs';
  import { buildPosterUrl } from '../utils/posterUrl';
  import { setDiscordContext, refreshDiscordPresence } from '../services/discord-presence';
  import UiV2ContentRetryOverlay from '../components/uikit-v2/UiV2ContentRetryOverlay.svelte';
  import { headlineFromLoadError } from '../utils/content-load-error';

  interface Props {
    id?: number;
    /** Внутри модалки профиля на ПК: без своей шапки */
    embedded?: boolean;
  }
  let { id, embedded = false }: Props = $props();

  let profileLogin = $state('Загрузка…');
  let profileAvatar = $state('');
  let profileId = $state(0);
  let items = $state<ReleaseVideoItem[]>([]);
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
      if (loadState !== 'error') loadState = 'loading';
      page = 0;
      hasMore = true;
      items = [];
    }
    const pageToLoad = page;
    try {
      // Повторный релиз / автор / хостинг приходят ссылкой @id (у каждого класса своя нумерация)
      const data = resolveJacksonRefsByKey(
        await window.anixApi.profile.getFavoriteVideos(profileId, pageToLoad) as {
          content?: Record<string, unknown>[];
          last?: boolean;
        },
        ['release', 'profile', 'category', 'hosting'],
      );
      const content = data?.content ?? [];
      if (!content.length) {
        if (!append) loadState = 'empty';
        hasMore = false;
        return;
      }
      const mapped = content.map(normalizeVideo);
      items = append ? [...items, ...mapped] : mapped;
      page = pageToLoad + 1;
      if (data.last === true || content.length < 25) hasMore = false;
      loadState = 'ready';
    } catch (err) {
      errorMsg = headlineFromLoadError(err);
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
    {#if !embedded}
      <header class="profile-subpage__head">
        <UiV2BackBar
          segments={[{ label: 'Видео', active: true }, { label: profileLogin }]}
          avatarUrl={profileAvatar ? buildPosterUrl(profileAvatar) : ''}
          onBack={goBack}
        />
      </header>
    {/if}

    {#if loadState === 'loading'}
      <div class="search-page__loading">Загрузка…</div>
    {:else if loadState === 'error'}
      <UiV2ContentRetryOverlay message={errorMsg} onRetry={() => void load(false)} />
    {:else if loadState === 'empty'}
      <p class="profile-v2__empty">Видео нет</p>
    {:else}
      <VideoList videos={items} />
    {/if}
    {#if isLoading && loadState === 'ready'}
      <div class="search-page__loading">Загрузка…</div>
    {/if}
  </div>
</div>
