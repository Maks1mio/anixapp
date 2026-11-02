<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import ReleaseCardUiV2 from '../ReleaseCardUiV2.svelte';
  import ReleaseCardsGridSkeleton from '../ReleaseCardsGridSkeleton.svelte';
  import UiV2ContentRetryOverlay from '../uikit-v2/UiV2ContentRetryOverlay.svelte';
  import { headlineFromLoadError } from '../../utils/content-load-error';
  import type { ReleaseCardData } from '../../types/release';

  export interface TvReleaseGridPage {
    items: ReleaseCardData[];
    /** Дальше страниц нет. */
    done: boolean;
  }

  /**
   * Сетка релизов TV с подгрузкой страниц по мере прокрутки (фокус пульта у края).
   * Прокручивается ближайший `[data-tv-scroll]` или слой маршрута keep-alive.
   */
  interface Props {
    fetchPage: (page: number) => Promise<TvReleaseGridPage>;
    emptyText?: string;
    cardVariant?: 'default' | 'history';
    /** Сменился ключ — список перезагружается с первой страницы. */
    reloadKey?: unknown;
    onLoaded?: (count: number) => void;
  }

  let {
    fetchPage,
    emptyText = 'Здесь пока ничего нет.',
    cardVariant = 'default',
    reloadKey = '',
    onLoaded,
  }: Props = $props();

  let items = $state<ReleaseCardData[]>([]);
  let page = 0;
  let hasMore = true;
  let isLoading = $state(false);
  let loadState = $state<'loading' | 'error' | 'empty' | 'ready'>('loading');
  let errorMsg = $state('');
  let seq = 0;

  let wrapEl = $state<HTMLElement | undefined>();
  let scrollEl: HTMLElement | null = null;

  async function loadPage() {
    if (isLoading || !hasMore) return;
    const mySeq = seq;
    const nextPage = page;
    isLoading = true;
    if (nextPage === 0) loadState = 'loading';
    try {
      const res = await fetchPage(nextPage);
      if (mySeq !== seq) return;
      const seen = new Set(items.map((item) => item.id));
      const fresh = res.items.filter((item) => !seen.has(item.id));
      items = [...items, ...fresh];
      page = nextPage + 1;
      hasMore = !res.done && res.items.length > 0;
      loadState = items.length ? 'ready' : 'empty';
      onLoaded?.(items.length);
      requestAnimationFrame(checkIfNeedsMore);
    } catch (err) {
      if (mySeq !== seq) return;
      if (nextPage === 0) {
        errorMsg = headlineFromLoadError(err);
        loadState = 'error';
      } else {
        hasMore = false;
      }
    } finally {
      if (mySeq === seq) isLoading = false;
    }
  }

  function reset() {
    seq += 1;
    items = [];
    page = 0;
    hasMore = true;
    isLoading = false;
    void loadPage();
  }

  function checkIfNeedsMore() {
    if (!scrollEl || !hasMore || isLoading) return;
    const distance = scrollEl.scrollHeight - scrollEl.scrollTop - scrollEl.clientHeight;
    if (distance < 600) void loadPage();
  }

  const onScroll = () => checkIfNeedsMore();

  function attachScroll() {
    const el = wrapEl?.closest('[data-tv-scroll], .tv-route-layer') as HTMLElement | null;
    if (!el) return;
    scrollEl = el;
    el.addEventListener('scroll', onScroll, { passive: true });
  }

  let mountedKey: unknown;

  $effect(() => {
    const key = reloadKey;
    if (mountedKey === undefined) {
      mountedKey = key;
      return;
    }
    if (key === mountedKey) return;
    mountedKey = key;
    reset();
  });

  onMount(() => {
    requestAnimationFrame(attachScroll);
    void loadPage();
  });

  onDestroy(() => {
    scrollEl?.removeEventListener('scroll', onScroll);
    scrollEl = null;
  });
</script>

<div class="tv-category-page" bind:this={wrapEl}>
  {#if loadState === 'loading' && items.length === 0}
    <ReleaseCardsGridSkeleton count={12} layout="mini" className="tv-category-page__grid" />
  {:else if loadState === 'error'}
    <UiV2ContentRetryOverlay message={errorMsg} onRetry={reset} />
  {:else if loadState === 'empty'}
    <p class="tv-page__status">{emptyText}</p>
  {:else}
    <div class="tv-category-page__grid" role="list">
      {#each items as item (item.id)}
        <div class="tv-category-page__item" role="listitem">
          <ReleaseCardUiV2 data={item} variant="vertical" showMenu={false} {cardVariant} />
        </div>
      {/each}
    </div>
    {#if isLoading}
      <p class="tv-category-page__loading" aria-live="polite">Загрузка…</p>
    {/if}
  {/if}
</div>
