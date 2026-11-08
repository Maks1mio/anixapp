<script lang="ts">
  /** Результаты поиска по фильтру (POST /filter/{page}), как FilteredFragment в Anixart. */
  import { onDestroy, onMount } from 'svelte';
  import DiscoverHero from '../components/DiscoverHero.svelte';
  import ReleaseCardsGrid from '../components/ReleaseCardsGrid.svelte';
  import ReleaseCardsGridSkeleton from '../components/ReleaseCardsGridSkeleton.svelte';
  import ReleaseFilterPanel from '../components/ReleaseFilterPanel.svelte';
  import UiV2Button from '../components/uikit-v2/UiV2Button.svelte';
  import UiV2ContentRetryOverlay from '../components/uikit-v2/UiV2ContentRetryOverlay.svelte';
  import { iconFilm, iconSlidersHorizontal } from '../components/icons';
  import type { ReleaseCardData } from '../types/release';
  import { headlineFromLoadError } from '../utils/content-load-error';
  import { toFilterRequest, type CustomFilterStorage } from '../utils/homeCustomTab';
  import { toIpcArgs } from '../utils/ipc-args';
  import { mapReleaseRawToCard } from '../utils/release-card';
  import { describeFilter, loadSearchFilter, saveSearchFilter } from '../utils/searchFilter';

  let filter = $state<CustomFilterStorage>(loadSearchFilter());
  let panelOpen = $state(false);
  let items = $state<ReleaseCardData[]>([]);
  let page = 0;
  let hasMore = true;
  let isLoading = $state(false);
  let loadState = $state<'loading' | 'ready' | 'empty' | 'error'>('loading');
  let errorMsg = $state('');
  /** Ответ на старый фильтр не должен попасть в новый список. */
  let requestSeq = 0;
  let wrapEl = $state<HTMLElement | undefined>();
  let scrollEl: HTMLElement | null = null;

  const summary = $derived(describeFilter(filter));

  async function loadPage() {
    if (isLoading || !hasMore || !window.anixApi) return;
    const seq = ++requestSeq;
    isLoading = true;
    const current = page;
    if (current === 0) loadState = 'loading';
    try {
      const data = await window.anixApi.release.filter(current, toIpcArgs(toFilterRequest(filter)), true) as { content?: Record<string, unknown>[] };
      if (seq !== requestSeq) return;
      const content = data?.content ?? [];
      if (!content.length) {
        hasMore = false;
        if (current === 0) loadState = 'empty';
        return;
      }
      items = [...items, ...content.map((row) => mapReleaseRawToCard(row))];
      page = current + 1;
      loadState = 'ready';
      requestAnimationFrame(checkIfNeedsMore);
    } catch (err) {
      if (seq === requestSeq && current === 0) {
        errorMsg = headlineFromLoadError(err);
        loadState = 'error';
      }
    } finally {
      if (seq === requestSeq) isLoading = false;
    }
  }

  function checkIfNeedsMore() {
    if (!scrollEl || !hasMore || isLoading) return;
    if (scrollEl.scrollHeight - scrollEl.scrollTop - scrollEl.clientHeight < 300) void loadPage();
  }

  function restart() {
    requestSeq += 1;
    isLoading = false;
    items = [];
    page = 0;
    hasMore = true;
    if (scrollEl) scrollEl.scrollTop = 0;
    void loadPage();
  }

  function applyFilter(next: CustomFilterStorage) {
    saveSearchFilter(next);
    filter = next;
    panelOpen = false;
    restart();
  }

  onMount(() => {
    scrollEl = wrapEl?.closest<HTMLElement>('.page__scroll') ?? document.getElementById('content');
    scrollEl?.addEventListener('scroll', checkIfNeedsMore, { passive: true });
    void loadPage();
  });

  onDestroy(() => {
    requestSeq += 1;
    scrollEl?.removeEventListener('scroll', checkIfNeedsMore);
  });
</script>

{#snippet editButton()}
  <UiV2Button label="Изменить" size="sm" variant="chrome" onclick={() => { panelOpen = true; }}>
    {#snippet icon()}{@html iconSlidersHorizontal(16)}{/snippet}
  </UiV2Button>
{/snippet}

<div class="view view-filtered discover-page" bind:this={wrapEl}>
  <DiscoverHero title="Результаты фильтра" subtitle={summary || 'Все релизы'} actions={editButton} />

  {#if loadState === 'loading'}
    <div class="bookmarks__grid"><ReleaseCardsGridSkeleton /></div>
  {:else if loadState === 'error'}
    <UiV2ContentRetryOverlay message={errorMsg} onRetry={restart} />
  {:else if loadState === 'empty'}
    <div class="discover-empty">
      <span class="discover-empty__icon" aria-hidden="true">{@html iconFilm(26)}</span>
      <p class="discover-empty__title">Ничего не найдено</p>
      <p class="discover-empty__text">Попробуйте убрать часть условий</p>
      <UiV2Button label="Изменить фильтр" size="sm" onclick={() => { panelOpen = true; }} />
    </div>
  {:else}
    <div class="bookmarks__grid"><ReleaseCardsGrid {items} /></div>
    {#if isLoading}
      <div class="bookmarks__grid"><ReleaseCardsGridSkeleton count={4} /></div>
    {/if}
  {/if}
</div>

{#if panelOpen}
  <ReleaseFilterPanel
    title="Фильтр"
    initial={filter}
    applyLabel="Показать"
    onApply={applyFilter}
    onClose={() => { panelOpen = false; }}
  />
{/if}
