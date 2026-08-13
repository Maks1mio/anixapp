<script lang="ts">
  import ReleaseCardsGrid from '../components/ReleaseCardsGrid.svelte';
  import { onMount, onDestroy } from 'svelte';
  import type { ReleaseCardData } from '../types/release';
  import { mapReleaseRawToCard } from '../utils/release-card';

  let loadState = $state<'loading' | 'error' | 'empty' | 'ready'>('loading');
  let errorMsg = $state('');
  let items = $state<ReleaseCardData[]>([]);


  onMount(async () => {
    if (!window.anixApi) {
      errorMsg = 'API доступно только в Electron.';
      loadState = 'error';
      return;
    }

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
      errorMsg = String(err);
      loadState = 'error';
    }
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
      <p class="feed-error">Ошибка: {errorMsg}</p>
    {:else if loadState === 'empty'}
      <p class="feed-empty">Нет записей в каталоге.</p>
    {:else}
      <div class="bookmarks__grid">
        <ReleaseCardsGrid items={items} />
      </div>
    {/if}
  </div>
</div>
