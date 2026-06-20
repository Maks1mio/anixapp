<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import CollectionCard from '../components/CollectionCard.svelte';
  import CollectionsHeaderActions from '../components/collections/CollectionsHeaderActions.svelte';
  import CollectionsSortSelect from '../components/collections/CollectionsSortSelect.svelte';
  import { iconSearch } from '../components/icons';
  import { navigate } from '../stores/navigation';
  import {
    defaultCollectionListSort,
    initialCollectionListPage,
    initialCollectionPreviousPage,
    mapCollectionCard,
  } from '../utils/collection';
  import type { CollectionCardData } from '../components/CollectionCard.svelte';

  interface Props {
    week?: boolean;
  }

  let { week = false }: Props = $props();

  let items = $state<CollectionCardData[]>([]);
  let page = $state(0);
  let previousPage = $state(-1);
  let hasMore = $state(true);
  let isLoading = $state(false);
  let loadState = $state<'loading' | 'error' | 'empty' | 'ready'>('loading');
  let errorMsg = $state('');
  let selectedSort = $state(defaultCollectionListSort());

  let wrapEl: HTMLElement | undefined = $state();
  let scrollEl: HTMLElement | null = null;
  let scrollListener: (() => void) | null = null;

  const listSort = $derived(week ? 4 : selectedSort);
  const listWhere = $derived(week ? 2 : 1);
  const pageTitle = $derived(week ? 'Коллекции недели' : 'Коллекции');
  const pageSubtitle = $derived(
    week ? 'Лучшие подборки за неделю' : 'Пользовательские коллекции релизов',
  );

  function resetList() {
    items = [];
    page = initialCollectionListPage(listSort);
    previousPage = initialCollectionPreviousPage();
    hasMore = true;
    loadState = 'loading';
  }

  function onSortChange(sort: number) {
    if (sort === selectedSort) return;
    selectedSort = sort;
    resetList();
    void loadPage();
  }

  async function loadPage() {
    if (!window.anixApi?.collection?.all || isLoading || !hasMore) return;

    isLoading = true;
    const nextPage = page;
    if (nextPage === initialCollectionListPage(listSort) && previousPage === initialCollectionPreviousPage() && items.length === 0) {
      loadState = 'loading';
    }

    try {
      const requestPage = page;
      const requestPreviousPage = previousPage;
      const data = (await window.anixApi.collection.all(requestPage, {
        sort: listSort,
        where: listWhere,
        previousPage: requestPreviousPage,
      })) as {
        content?: unknown[];
        last?: boolean;
        total_page_count?: number;
        current_page?: number;
        code?: number;
      };
      const content = (data?.content ?? []) as Record<string, unknown>[];
      if (data?.code != null && data.code !== 0) {
        hasMore = false;
        if (items.length === 0) {
          errorMsg = `Ошибка API (код ${data.code})`;
          loadState = 'error';
        }
        return;
      }
      if (!content.length) {
        hasMore = false;
        if (items.length === 0) loadState = 'empty';
        return;
      }
      items = [...items, ...content.map(mapCollectionCard)];
      previousPage = requestPage;
      page = requestPage + 1;
      const totalPages = typeof data.total_page_count === 'number' ? data.total_page_count : null;
      const currentPage = typeof data.current_page === 'number' ? data.current_page : requestPage;
      if (data.last === true) {
        hasMore = false;
      } else if (totalPages != null) {
        hasMore = currentPage + 1 < totalPages;
      } else {
        hasMore = content.length >= 25;
      }
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

  onMount(() => {
    page = initialCollectionListPage(listSort);
    previousPage = initialCollectionPreviousPage();
    requestAnimationFrame(attachScroll);
    void loadPage();
  });

  onDestroy(detachScroll);
</script>

<div class="view view-collections-list discover-page collections-page" bind:this={wrapEl}>
  <div class="view-header">
    <div class="collections-page__toolbar">
      <div>
        <h1 class="view-header__title">{pageTitle}</h1>
        <p class="view-header__subtitle">{pageSubtitle}</p>
      </div>
      {#if !week}
        <button
          type="button"
          class="collections-page__search"
          aria-label="Поиск коллекций"
          onclick={() => navigate('/search?tab=collections')}
        >
          {@html iconSearch(20)}
        </button>
      {/if}
    </div>
  </div>

  {#if !week}
    <CollectionsHeaderActions />
    <CollectionsSortSelect value={selectedSort} onChange={onSortChange} />
  {/if}

  {#if loadState === 'loading' && items.length === 0}
    <div class="discover-page__loading">Загрузка…</div>
  {:else if loadState === 'error'}
    <div class="discover-page__error">
      <p>{errorMsg || 'Не удалось загрузить коллекции'}</p>
      <button
        type="button"
        class="discover-page__retry"
        onclick={() => {
          resetList();
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
        <CollectionCard data={item} variant="cover" />
      {/each}
    </div>
    {#if isLoading}
      <div class="discover-page__loading discover-page__loading--inline">Загрузка…</div>
    {/if}
  {/if}
</div>
