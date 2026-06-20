<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import Tabs from '../components/Tabs.svelte';
  import TopReleaseRow from '../components/TopReleaseRow.svelte';
  import { mapCardData } from './Release/_utils';
  import type { ReleaseCardData } from '../types/release';
  import {
    DEFAULT_POPULAR_TAB,
    getPopularTabFilterArgs,
    POPULAR_TAB_DEFS,
    type PopularTabId,
  } from '../data/popularTabs';

  let activeTab = $state<PopularTabId>(DEFAULT_POPULAR_TAB);
  let items = $state<ReleaseCardData[]>([]);
  let page = $state(0);
  let hasMore = $state(true);
  let isLoading = $state(false);
  let loadState = $state<'loading' | 'error' | 'empty' | 'ready'>('loading');
  let errorMsg = $state('');

  let wrapEl: HTMLElement | undefined = $state();
  let scrollEl: HTMLElement | null = null;
  let scrollListener: (() => void) | null = null;

  const tabs = POPULAR_TAB_DEFS.map((t) => ({ id: t.id, label: t.label }));

  async function loadPage() {
    if (!window.anixApi || isLoading || !hasMore) return;

    isLoading = true;
    const nextPage = page;
    if (nextPage === 0) loadState = 'loading';

    try {
      const data = await window.anixApi.release.filter(
        nextPage,
        getPopularTabFilterArgs(activeTab),
        true,
      ) as { content?: unknown[] };
      const content = (data?.content ?? []) as Record<string, unknown>[];
      if (!content.length) {
        hasMore = false;
        if (nextPage === 0) loadState = 'empty';
        return;
      }
      items = [...items, ...content.map(mapCardData)];
      page = nextPage + 1;
      loadState = 'ready';
      requestAnimationFrame(checkIfNeedsMore);
    } catch (err) {
      if (nextPage === 0) {
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
    const el = wrapEl?.closest('.page__scroll') as HTMLElement | null
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

  function resetAndLoad() {
    items = [];
    page = 0;
    hasMore = true;
    void loadPage();
  }

  function onTabChange(id: string) {
    if (id === activeTab) return;
    activeTab = id as PopularTabId;
    resetAndLoad();
  }

  onMount(() => {
    requestAnimationFrame(attachScroll);
    void loadPage();
  });

  onDestroy(detachScroll);
</script>

<div class="view view-popular discover-page" bind:this={wrapEl}>
  <div class="view-header">
    <h1 class="view-header__title">Популярное</h1>
    <p class="view-header__subtitle">Топ релизов по категориям</p>
  </div>

  <Tabs tabs={tabs} activeId={activeTab} rootClassName="releases-type" onChange={onTabChange} />

  {#if loadState === 'loading' && items.length === 0}
    <div class="discover-page__loading">Загрузка…</div>
  {:else if loadState === 'error'}
    <div class="discover-page__error">
      <p>{errorMsg || 'Не удалось загрузить список'}</p>
      <button type="button" class="discover-page__retry" onclick={resetAndLoad}>Повторить</button>
    </div>
  {:else if loadState === 'empty'}
    <div class="discover-page__empty">Ничего не найдено</div>
  {:else}
    <ol class="top-release-list">
      {#each items as item, index (item.id)}
        <li class="top-release-list__item">
          <TopReleaseRow rank={index + 1} data={item} />
        </li>
      {/each}
    </ol>
    {#if isLoading}
      <div class="discover-page__loading discover-page__loading--inline">Загрузка…</div>
    {/if}
  {/if}
</div>
