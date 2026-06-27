<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import CollectionCard from '../components/CollectionCard.svelte';
  import { iconArrowLeft } from '../components/icons';
  import { navigate } from '../stores/navigation';
  import { mapCollectionCard } from '../utils/collection';
  import { resolveJacksonRefs } from '../utils/jackson-refs';
  import { setDiscordContext, refreshDiscordPresence } from '../services/discord-presence';
  import type { CollectionCardData } from '../components/CollectionCard.svelte';

  interface Props { id?: number; }
  let { id }: Props = $props();

  let items = $state<CollectionCardData[]>([]);
  let page = $state(0);
  let hasMore = $state(true);
  let isLoading = $state(false);
  let loadState = $state<'loading' | 'error' | 'empty' | 'ready'>('loading');
  let errorMsg = $state('');
  let profileId = $state(0);
  let profileLogin = $state('');

  let wrapEl: HTMLElement | undefined = $state();
  let scrollEl: HTMLElement | null = null;
  let scrollListener: (() => void) | null = null;

  async function resolveProfileId(): Promise<number> {
    if (id) return id;
    const self = await window.anixApi?.profile.self?.() as { profile?: { id?: number; login?: string } };
    if (self?.profile?.login) profileLogin = self.profile.login;
    return self?.profile?.id ?? 0;
  }

  async function loadPage() {
    if (!window.anixApi?.collection?.profileCollections || isLoading || !hasMore || !profileId) return;

    isLoading = true;
    const nextPage = page;
    if (nextPage === 0 && items.length === 0) loadState = 'loading';

    try {
      const data = (await window.anixApi.collection.profileCollections(profileId, nextPage)) as {
        content?: unknown[];
        last?: boolean;
      };
      const resolved = resolveJacksonRefs(data);
      const content = (resolved?.content ?? []) as Record<string, unknown>[];
      if (!content.length) {
        hasMore = false;
        if (items.length === 0) loadState = 'empty';
        return;
      }
      items = [...items, ...content.map(mapCollectionCard)];
      page = nextPage + 1;
      if (data.last === true || content.length < 25) hasMore = false;
      loadState = 'ready';
      requestAnimationFrame(checkIfNeedsMore);
    } catch (err) {
      if (items.length === 0) {
        errorMsg = String(err);
        loadState = 'error';
      }
    } finally {
      isLoading = false;
    }
  }

  function checkIfNeedsMore() {
    if (!scrollEl || !hasMore || isLoading) return;
    const distance = scrollEl.scrollHeight - scrollEl.scrollTop - scrollEl.clientHeight;
    if (distance < 300) void loadPage();
  }

  function attachScroll() {
    const el = (wrapEl?.closest('.page__scroll') as HTMLElement | null)
      ?? document.getElementById('content');
    if (!el) return;
    scrollEl = el;
    scrollListener = () => checkIfNeedsMore();
    el.addEventListener('scroll', scrollListener);
  }

  function detachScroll() {
    if (scrollEl && scrollListener) scrollEl.removeEventListener('scroll', scrollListener);
    scrollEl = null;
    scrollListener = null;
  }

  onMount(async () => {
    profileId = await resolveProfileId();
    if (!profileId) {
      loadState = 'error';
      errorMsg = 'Не удалось определить профиль';
      return;
    }
    if (!profileLogin && id) {
      try {
        const info = await window.anixApi?.profile.info?.(id) as { profile?: { login?: string } };
        profileLogin = info?.profile?.login ?? '';
      } catch { /* ignore */ }
    }
    setDiscordContext({
      profileLogin: profileLogin || 'Профиль',
      profileIsSelf: !id,
    });
    refreshDiscordPresence();
    requestAnimationFrame(attachScroll);
    void loadPage();
  });

  onDestroy(detachScroll);
</script>

<div class="view view-profile-subpage profile-more discover-page collections-page" bind:this={wrapEl}>
  <button type="button" class="collections-back" onclick={() => navigate(id ? `/profile/${id}` : '/profile')}>
    {@html iconArrowLeft(18)}
    <span>Профиль</span>
  </button>

  <div class="view-header">
    <h1 class="view-header__title release-page__block-title">
      Коллекции{profileLogin ? ` — ${profileLogin}` : ''}
    </h1>
  </div>

  {#if loadState === 'loading' && items.length === 0}
    <div class="discover-page__loading">Загрузка…</div>
  {:else if loadState === 'error'}
    <div class="discover-page__error">
      <p>{errorMsg || 'Не удалось загрузить коллекции'}</p>
      <button
        type="button"
        class="discover-page__retry"
        onclick={() => {
          items = [];
          page = 0;
          hasMore = true;
          loadState = 'loading';
          void loadPage();
        }}
      >
        Повторить
      </button>
    </div>
  {:else if loadState === 'empty'}
    <div class="discover-page__empty">Коллекций пока нет</div>
  {:else}
    <div class="collections-feed">
      {#each items as item (item.id)}
          <CollectionCard data={item} variant="grid" />
      {/each}
    </div>
    {#if isLoading}
      <div class="discover-page__loading discover-page__loading--inline">Загрузка…</div>
    {/if}
  {/if}
</div>
