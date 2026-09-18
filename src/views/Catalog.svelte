<script lang="ts">
  import ReleaseCardsGrid from '../components/ReleaseCardsGrid.svelte';
  import UiV2ContentRetryOverlay from '../components/uikit-v2/UiV2ContentRetryOverlay.svelte';
  import { onMount } from 'svelte';
  import type { ReleaseCardData } from '../types/release';
  import { mapReleaseRawToCard } from '../utils/release-card';
  import { headlineFromLoadError } from '../utils/content-load-error';

  let loadState = $state<'loading' | 'error' | 'empty' | 'ready'>('loading');
  let errorMsg = $state('');
  let items = $state<ReleaseCardData[]>([]);

  async function loadCatalog() {
    if (!window.anixApi) {
      errorMsg = 'API доступно только в Electron.';
      loadState = 'error';
      return;
    }

    if (loadState !== 'error') loadState = 'loading';
    try {
      const data = await window.anixApi.discover.recommendations(0) as any;
      const content = (data?.content ?? []) as Record<string, unknown>[];
      if (content.length > 0) {
        items = content.map(mapReleaseRawToCard);
        loadState = 'ready';
        return;
      }
      loadState = 'empty';
    } catch (err) {
      errorMsg = headlineFromLoadError(err);
      loadState = 'error';
    }
  }

  onMount(() => {
    void loadCatalog();
  });
</script>

<div class="view view-catalog">
  <div class="view-header">
    <h1 class="view-header__title">Каталог</h1>
    <p class="view-header__subtitle">Релизы с описанием и рейтингом</p>
  </div>

  <div class="catalog-list">
    {#if loadState === 'loading'}
      <div class="catalog-loading">Загрузка…</div>
    {:else if loadState === 'error'}
      <UiV2ContentRetryOverlay message={errorMsg} onRetry={() => void loadCatalog()} />
    {:else if loadState === 'empty'}
      <p class="feed-empty">Нет записей в каталоге.</p>
    {:else}
      <div class="bookmarks__grid">
        <ReleaseCardsGrid items={items} />
      </div>
    {/if}
  </div>
</div>
