<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import TvPage from '../components/tv/TvPage.svelte';
  import ReleaseCardUiV2 from '../components/ReleaseCardUiV2.svelte';
  import ReleaseCardsGridSkeleton from '../components/ReleaseCardsGridSkeleton.svelte';
  import UiV2ContentRetryOverlay from '../components/uikit-v2/UiV2ContentRetryOverlay.svelte';
  import { headlineFromLoadError } from '../utils/content-load-error';
  import { fetchTvBookmarkPage, tvBookmarkListDef } from '../tv/bookmarkRows';
  import type { ReleaseCardData } from '../types/release';

  interface Props {
    listId: string;
  }

  let { listId }: Props = $props();

  const def = $derived(tvBookmarkListDef(listId));

  let items = $state<ReleaseCardData[]>([]);
  let total = $state(0);
  let page = $state(0);
  let hasMore = $state(true);
  let isLoading = $state(false);
  let loadState = $state<'loading' | 'error' | 'empty' | 'ready'>('loading');
  let errorMsg = $state('');

  let wrapEl: HTMLElement | undefined = $state();
  let scrollEl: HTMLElement | null = null;
  let scrollListener: (() => void) | null = null;

  const subtitle = $derived(total > 0 ? `${total.toLocaleString('ru-RU')} тайтлов` : '');

  async function loadPage() {
    if (!def || isLoading || !hasMore) return;
    isLoading = true;
    const nextPage = page;
    if (nextPage === 0 && loadState !== 'error') loadState = 'loading';
    try {
      const res = await fetchTvBookmarkPage(def.id, nextPage);
      if (nextPage === 0) total = res.total;
      const seen = new Set(items.map((item) => item.id));
      const fresh = res.items.filter((item) => !seen.has(item.id));
      items = [...items, ...fresh];
      page = nextPage + 1;
      hasMore = !res.done && res.items.length > 0;
      loadState = items.length ? 'ready' : 'empty';
      requestAnimationFrame(checkIfNeedsMore);
    } catch (err) {
      if (nextPage === 0) {
        errorMsg = headlineFromLoadError(err);
        loadState = 'error';
      }
    } finally {
      isLoading = false;
    }
  }

  function retry() {
    hasMore = true;
    void loadPage();
  }

  /** Фокус пульта у конца сетки — подгружаем следующую страницу. */
  function checkIfNeedsMore() {
    if (!scrollEl || !hasMore || isLoading) return;
    const distance = scrollEl.scrollHeight - scrollEl.scrollTop - scrollEl.clientHeight;
    if (distance < 600) void loadPage();
  }

  function attachScroll() {
    // На TV прокручивается слой маршрута (keep-alive), а не #content.
    const el = (wrapEl?.closest('.tv-route-layer') ?? wrapEl?.closest('.page__scroll')) as HTMLElement | null;
    if (!el) return;
    scrollEl = el;
    scrollListener = () => checkIfNeedsMore();
    el.addEventListener('scroll', scrollListener, { passive: true });
  }

  function detachScroll() {
    if (scrollEl && scrollListener) scrollEl.removeEventListener('scroll', scrollListener);
    scrollEl = null;
    scrollListener = null;
  }

  onMount(() => {
    if (!def) {
      loadState = 'empty';
      return;
    }
    requestAnimationFrame(attachScroll);
    void loadPage();

    const onChanged = () => {
      items = [];
      page = 0;
      hasMore = true;
      void loadPage();
    };
    window.addEventListener('anix:bookmarksChanged', onChanged);
    return () => window.removeEventListener('anix:bookmarksChanged', onChanged);
  });

  onDestroy(detachScroll);
</script>

<TvPage title={def?.label ?? 'Закладки'} {subtitle}>
  <div class="tv-category-page" bind:this={wrapEl}>
    {#if loadState === 'loading' && items.length === 0}
      <ReleaseCardsGridSkeleton count={12} layout="mini" className="tv-category-page__grid" />
    {:else if loadState === 'error'}
      <UiV2ContentRetryOverlay message={errorMsg} onRetry={retry} />
    {:else if loadState === 'empty'}
      <p class="tv-page__status">В этом списке пока ничего нет.</p>
    {:else}
      <div class="tv-category-page__grid" role="list">
        {#each items as item (item.id)}
          <div class="tv-category-page__item" role="listitem">
            <ReleaseCardUiV2
              data={item}
              variant="vertical"
              showMenu={false}
              cardVariant={def?.id === 'history' ? 'history' : 'default'}
            />
          </div>
        {/each}
      </div>
      {#if isLoading}
        <p class="tv-category-page__loading" aria-live="polite">Загрузка…</p>
      {/if}
    {/if}
  </div>
</TvPage>
