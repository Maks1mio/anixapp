<script lang="ts">
  /** «Коллекции с релизом» (ReleaseCollectionsFragment): collection/all/release/{id}/{page}?sort= */
  import { onMount } from 'svelte';
  import CollectionCard from '../components/CollectionCard.svelte';
  import UiV2CollectionCardSkeleton from '../components/uikit-v2/UiV2CollectionCardSkeleton.svelte';
  import CollectionsSortSelect from '../components/collections/CollectionsSortSelect.svelte';
  import UiV2ContentRetryOverlay from '../components/uikit-v2/UiV2ContentRetryOverlay.svelte';
  import { headlineFromLoadError } from '../utils/content-load-error';
  import { mapCollectionCard } from '../utils/collection';
  import { resolveJacksonRefs } from '../utils/jackson-refs';
  import { infiniteScroll } from '../actions/infiniteScroll';
  import type { CollectionCardData } from '../components/CollectionCard.svelte';

  interface Props {
    releaseId: number;
  }

  let { releaseId }: Props = $props();

  let items = $state<CollectionCardData[]>([]);
  let page = $state(0);
  let hasMore = $state(true);
  let isLoading = $state(false);
  let loadState = $state<'loading' | 'error' | 'empty' | 'ready'>('loading');
  let errorMsg = $state('');
  let selectedSort = $state(1);
  let releaseTitle = $state('');
  /** Отбрасывает ответы, пришедшие после смены сортировки */
  let requestSeq = 0;

  function onSortChange(sort: number) {
    if (sort === selectedSort) return;
    selectedSort = sort;
    items = [];
    page = 0;
    hasMore = true;
    isLoading = false;
    loadState = 'loading';
    void loadPage();
  }

  async function loadPage() {
    const api = window.anixApi?.collection;
    if (!api?.releaseCollections || isLoading || !hasMore) return;
    isLoading = true;
    const seq = ++requestSeq;
    const requestPage = page;
    try {
      const data = resolveJacksonRefs(await api.releaseCollections(releaseId, requestPage, selectedSort));
      if (seq !== requestSeq) return;
      if (data?.code != null && data.code !== 0) throw new Error(`Ошибка API (код ${data.code})`);
      const content = (data?.content ?? []) as Record<string, unknown>[];
      if (!content.length) {
        hasMore = false;
        if (!items.length) loadState = 'empty';
        return;
      }
      const known = new Set(items.map((c) => c.id));
      items = [...items, ...content.map(mapCollectionCard).filter((c) => !known.has(c.id))];
      page = requestPage + 1;
      const totalPages = Number(data?.total_page_count);
      if (data?.last === true) hasMore = false;
      else if (Number.isFinite(totalPages) && totalPages > 0) hasMore = page < totalPages;
      else hasMore = content.length >= 25;
      loadState = 'ready';
    } catch (err) {
      if (seq !== requestSeq) return;
      hasMore = false;
      if (!items.length) {
        errorMsg = headlineFromLoadError(err);
        loadState = 'error';
      }
    } finally {
      if (seq === requestSeq) isLoading = false;
    }
  }

  function retry() {
    hasMore = true;
    loadState = 'loading';
    void loadPage();
  }

  onMount(() => {
    void loadPage();
    void window.anixApi?.release.info(releaseId, false)
      .then((data: any) => {
        const raw = data?.release ?? data;
        releaseTitle = String(raw?.title_ru || raw?.title_original || '');
      })
      .catch(() => {});
  });
</script>

<div class="view view-release-collections discover-page collections-page">
  <div class="view-header">
    <h1 class="view-header__title">Коллекции с релизом</h1>
    {#if releaseTitle}
      <p class="view-header__subtitle">{releaseTitle}</p>
    {/if}
  </div>

  <CollectionsSortSelect value={selectedSort} onChange={onSortChange} />

  {#if loadState === 'loading' && items.length === 0}
    <div class="collections-feed" aria-busy="true">
      <UiV2CollectionCardSkeleton count={6} />
    </div>
  {:else if loadState === 'error'}
    <UiV2ContentRetryOverlay message={errorMsg} onRetry={retry} />
  {:else if loadState === 'empty'}
    <div class="discover-page__empty">Этот релиз пока не добавили ни в одну коллекцию</div>
  {:else}
    <div class="collections-feed">
      {#each items as item (item.id)}
        <CollectionCard data={item} variant="grid" />
      {/each}
    </div>
    {#if hasMore}
      {#key items.length}
        <div aria-hidden="true" use:infiniteScroll={{ onLoad: () => void loadPage(), rootMargin: '400px' }}></div>
      {/key}
    {/if}
    {#if isLoading}
      <div class="collections-feed" aria-busy="true">
        <UiV2CollectionCardSkeleton count={2} />
      </div>
    {/if}
  {/if}
</div>
