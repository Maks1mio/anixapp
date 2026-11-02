<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import TvPage from '../components/tv/TvPage.svelte';
  import TvCollectionTile from '../components/tv/TvCollectionTile.svelte';
  import UiV2ContentRetryOverlay from '../components/uikit-v2/UiV2ContentRetryOverlay.svelte';
  import type { CollectionCardData } from '../components/CollectionCard.svelte';
  import {
    COLLECTION_SORT_OPTIONS,
    initialCollectionListPage,
    initialCollectionPreviousPage,
    mapCollectionCard,
  } from '../utils/collection';
  import { headlineFromLoadError } from '../utils/content-load-error';

  let sort = $state(4);
  let items = $state<CollectionCardData[]>([]);
  let page = initialCollectionListPage(4);
  let previousPage = initialCollectionPreviousPage();
  let hasMore = true;
  let isLoading = $state(false);
  let loadState = $state<'loading' | 'error' | 'empty' | 'ready'>('loading');
  let errorMsg = $state('');
  let seq = 0;

  let wrapEl = $state<HTMLElement | undefined>();
  let scrollEl: HTMLElement | null = null;

  async function loadPage() {
    if (!window.anixApi?.collection?.all || isLoading || !hasMore) return;
    const mySeq = seq;
    const requestPage = page;
    isLoading = true;
    if (items.length === 0) loadState = 'loading';
    try {
      const data = await window.anixApi.collection.all(requestPage, {
        sort,
        where: 1,
        previousPage,
      }) as { content?: unknown[]; last?: boolean; total_page_count?: number; current_page?: number; code?: number };
      if (mySeq !== seq) return;
      if (data?.code != null && data.code !== 0) throw new Error(`Ошибка API (код ${data.code})`);
      const content = (data?.content ?? []) as Record<string, unknown>[];
      const seen = new Set(items.map((item) => item.id));
      const fresh = content.map(mapCollectionCard).filter((item) => item.id > 0 && !seen.has(item.id));
      items = [...items, ...fresh];
      previousPage = requestPage;
      page = requestPage + 1;
      const totalPages = typeof data.total_page_count === 'number' ? data.total_page_count : null;
      const currentPage = typeof data.current_page === 'number' ? data.current_page : requestPage;
      hasMore = content.length > 0 && data.last !== true && (totalPages == null || currentPage + 1 < totalPages);
      loadState = items.length ? 'ready' : 'empty';
      requestAnimationFrame(checkIfNeedsMore);
    } catch (err) {
      if (mySeq !== seq) return;
      if (items.length === 0) {
        errorMsg = headlineFromLoadError(err);
        loadState = 'error';
      } else {
        hasMore = false;
      }
    } finally {
      if (mySeq === seq) isLoading = false;
    }
  }

  function selectSort(next: number) {
    if (next === sort && loadState !== 'error') return;
    seq += 1;
    sort = next;
    items = [];
    page = initialCollectionListPage(next);
    previousPage = initialCollectionPreviousPage();
    hasMore = true;
    isLoading = false;
    scrollEl?.scrollTo({ top: 0 });
    void loadPage();
  }

  function checkIfNeedsMore() {
    if (!scrollEl || !hasMore || isLoading) return;
    if (scrollEl.scrollHeight - scrollEl.scrollTop - scrollEl.clientHeight < 600) void loadPage();
  }

  const onScroll = () => checkIfNeedsMore();

  onMount(() => {
    requestAnimationFrame(() => {
      scrollEl = wrapEl?.closest('.tv-route-layer') as HTMLElement | null;
      scrollEl?.addEventListener('scroll', onScroll, { passive: true });
    });
    void loadPage();
  });

  onDestroy(() => scrollEl?.removeEventListener('scroll', onScroll));
</script>

<TvPage title="Коллекции" subtitle="Подборки релизов от зрителей">
  <div class="tv-collections" bind:this={wrapEl}>
    <div class="tv-chips" role="tablist" aria-label="Сортировка">
      {#each COLLECTION_SORT_OPTIONS as option (option.value)}
        <button
          type="button"
          class="tv-chip"
          class:tv-chip--active={option.value === sort}
          role="tab"
          aria-selected={option.value === sort}
          onclick={() => selectSort(option.value)}
        >
          {option.label}
        </button>
      {/each}
    </div>

    {#if loadState === 'loading' && items.length === 0}
      <div class="tv-collections__grid" aria-hidden="true">
        {#each Array(8) as _, i (i)}
          <div class="tv-collection-tile tv-collection-tile--skeleton"><span class="tv-collection-tile__cover"></span></div>
        {/each}
      </div>
    {:else if loadState === 'error'}
      <UiV2ContentRetryOverlay message={errorMsg} onRetry={() => selectSort(sort)} />
    {:else if loadState === 'empty'}
      <p class="tv-page__status">Коллекций пока нет.</p>
    {:else}
      <div class="tv-collections__grid" role="list">
        {#each items as item (item.id)}
          <div role="listitem"><TvCollectionTile data={item} /></div>
        {/each}
      </div>
      {#if isLoading}
        <p class="tv-category-page__loading" aria-live="polite">Загрузка…</p>
      {/if}
    {/if}
  </div>
</TvPage>
