<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import TvPage from '../components/tv/TvPage.svelte';
  import ReleaseCardUiV2 from '../components/ReleaseCardUiV2.svelte';
  import ReleaseCardsGridSkeleton from '../components/ReleaseCardsGridSkeleton.svelte';
  import {
    getHomeTabFilterArgs,
    HOME_TAB_DEFS,
    isHomeTabId,
    type HomeTabId,
  } from '../data/homeTabs';
  import type { ReleaseCardData } from '../types/release';
  import { mapReleaseRawToCard } from '../utils/release-card';
  import {
    getMyTabLabel,
    isHomeCustomTabConfigured,
    loadHomeCustomTab,
    toFilterRequest,
  } from '../utils/homeCustomTab';

  interface Props {
    tabId: string;
  }

  let { tabId }: Props = $props();

  let title = $state('');
  let items = $state<ReleaseCardData[]>([]);
  let page = $state(0);
  let hasMore = $state(true);
  let isLoading = $state(false);
  let loadState = $state<'loading' | 'error' | 'empty' | 'ready'>('loading');
  let errorMsg = $state('');

  let wrapEl: HTMLElement | undefined = $state();
  let scrollEl: HTMLElement | null = null;
  let scrollListener: (() => void) | null = null;

  function getFilterArgs(resolvedTab: HomeTabId): Record<string, unknown> | null {
    if (resolvedTab === 'my') return null;
    return getHomeTabFilterArgs(resolvedTab);
  }

  async function resolveTab(): Promise<{ id: HomeTabId; label: string; filter: Record<string, unknown> | null } | null> {
    if (!isHomeTabId(tabId)) return null;

    if (tabId === 'my') {
      const custom = await loadHomeCustomTab();
      if (!isHomeCustomTabConfigured(custom) || !custom.filter) return null;
      return {
        id: 'my',
        label: getMyTabLabel(custom),
        filter: toFilterRequest(custom.filter),
      };
    }

    const def = HOME_TAB_DEFS.find((t) => t.id === tabId);
    return {
      id: tabId,
      label: def?.label ?? tabId,
      filter: getFilterArgs(tabId),
    };
  }

  async function loadPage() {
    if (!window.anixApi || isLoading || !hasMore) return;

    isLoading = true;
    const nextPage = page;
    if (nextPage === 0) loadState = 'loading';

    try {
      const tab = await resolveTab();
      if (!tab?.filter) {
        loadState = 'empty';
        hasMore = false;
        return;
      }

      title = tab.label;
      const data = (await window.anixApi.release.filter(nextPage, tab.filter, true)) as {
        content?: unknown[];
      };
      const content = (data?.content ?? []) as Record<string, unknown>[];
      if (!content.length) {
        hasMore = false;
        if (nextPage === 0) loadState = 'empty';
        return;
      }

      items = [
        ...items,
        ...content.map((raw) => mapReleaseRawToCard(raw)),
      ];
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
    if (distance < 400) void loadPage();
  }

  function attachScroll() {
    const el = wrapEl?.closest('.page__scroll') as HTMLElement | null
      ?? document.getElementById('content');
    if (!el) return;
    scrollEl = el;
    scrollListener = () => checkIfNeedsMore();
    el.addEventListener('scroll', scrollListener, { passive: true });
  }

  function detachScroll() {
    if (scrollEl && scrollListener) {
      scrollEl.removeEventListener('scroll', scrollListener);
    }
    scrollEl = null;
    scrollListener = null;
  }

  onMount(() => {
    void (async () => {
      const tab = await resolveTab();
      if (!tab) {
        loadState = 'empty';
        return;
      }
      title = tab.label;
      requestAnimationFrame(attachScroll);
      void loadPage();
    })();
  });

  onDestroy(detachScroll);
</script>

<TvPage title={title || 'Категория'}>
  <div class="tv-category-page" bind:this={wrapEl}>
    {#if loadState === 'loading' && items.length === 0}
      <ReleaseCardsGridSkeleton count={12} layout="mini" className="tv-category-page__grid" />
    {:else if loadState === 'error'}
      <p class="tv-page__status">Ошибка: {errorMsg}</p>
    {:else if loadState === 'empty'}
      <p class="tv-page__status">Здесь пока ничего нет.</p>
    {:else}
      <div class="tv-category-page__grid" role="list">
        {#each items as item (item.id)}
          <div class="tv-category-page__item" role="listitem">
            <ReleaseCardUiV2 data={item} variant="vertical" showMenu={false} />
          </div>
        {/each}
      </div>
      {#if isLoading}
        <p class="tv-category-page__loading" aria-live="polite">Загрузка…</p>
      {/if}
    {/if}
  </div>
</TvPage>
