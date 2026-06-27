<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import CollectionCard from '../components/CollectionCard.svelte';
  import CollectionsHeaderActions from '../components/collections/CollectionsHeaderActions.svelte';
  import { iconArrowLeft } from '../components/icons';
  import { navigate } from '../stores/navigation';
  import { mapCollectionCard } from '../utils/collection';
  import { ensureProfileId } from '../utils/profile';
  import type { CollectionCardData } from '../components/CollectionCard.svelte';

  let items = $state<CollectionCardData[]>([]);
  let page = $state(0);
  let hasMore = $state(true);
  let isLoading = $state(false);
  let loadState = $state<'loading' | 'error' | 'empty' | 'ready'>('loading');
  let errorMsg = $state('');
  let profileId = $state<number | null>(null);

  let wrapEl: HTMLElement | undefined = $state();
  let scrollEl: HTMLElement | null = null;
  let scrollListener: (() => void) | null = null;

  async function loadPage() {
    if (!window.anixApi?.collection?.profileCollections || isLoading || !hasMore) return;
    if (typeof profileId !== 'number') return;

    isLoading = true;
    const nextPage = page;
    if (nextPage === 0 && items.length === 0) loadState = 'loading';

    try {
      const data = (await window.anixApi.collection.profileCollections(profileId, nextPage)) as {
        content?: unknown[];
        last?: boolean;
      };
      const content = (data?.content ?? []) as Record<string, unknown>[];
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
    profileId = await ensureProfileId();
    if (profileId == null) {
      loadState = 'error';
      errorMsg = 'Не удалось определить профиль';
      return;
    }
    requestAnimationFrame(attachScroll);
    void loadPage();
  });

  onDestroy(detachScroll);
</script>

<div class="view view-my-collections discover-page collections-page" bind:this={wrapEl}>
  <button type="button" class="collections-back" onclick={() => navigate('/collections')}>
    {@html iconArrowLeft(18)}
    <span>Коллекции</span>
  </button>

  <div class="view-header">
    <h1 class="view-header__title">Мои коллекции</h1>
  </div>

  <CollectionsHeaderActions showMyCollections={false} />

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
    <div class="discover-page__empty">Ой, а тут коллекций нет!</div>
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
