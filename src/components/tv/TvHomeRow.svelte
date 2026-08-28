<script lang="ts">
  import ReleaseCardUiV2 from '../ReleaseCardUiV2.svelte';
  import TvCategorySeeAllTile from './TvCategorySeeAllTile.svelte';
  import UiV2ReleaseCarousel from '../uikit-v2/UiV2ReleaseCarousel.svelte';
  import UiV2ReleaseCarouselSkeleton from '../uikit-v2/UiV2ReleaseCarouselSkeleton.svelte';
  import type { ReleaseCardData } from '../../types/release';
  import type { TvHomeRowStatus } from '../../tv/homeRows';
  import { registerTvHomeRelease } from '../../tv/homeSpotlight';

  interface Props {
    label: string;
    tabId?: string;
    items?: ReleaseCardData[];
    status?: TvHomeRowStatus;
    skeletonCount?: number;
  }

  let {
    label,
    tabId,
    items = [],
    status = 'loading',
    skeletonCount = 10,
  }: Props = $props();

  $effect(() => {
    for (const item of items) registerTvHomeRelease(item);
  });
</script>

<section class="tv-home-row" aria-label={label} data-tv-home-row>
  <h2 class="tv-home-row__title">{label}</h2>

  {#if status === 'loading'}
    <UiV2ReleaseCarouselSkeleton count={skeletonCount} class="tv-release-carousel" />
  {:else if status === 'error'}
    <p class="tv-home-row__status">Не удалось загрузить</p>
  {:else if status === 'empty' || items.length === 0}
    <p class="tv-home-row__status">Пока пусто</p>
  {:else}
    <UiV2ReleaseCarousel measureKey={`${tabId}-${items.length}`} class="tv-release-carousel">
      {#if tabId}
        <div class="uiv2-carousel__item">
          <TvCategorySeeAllTile {label} {tabId} />
        </div>
      {/if}
      {#each items as item (item.id)}
        <div class="uiv2-carousel__item" data-tv-release-id={item.id}>
          <ReleaseCardUiV2 data={item} variant="vertical" showMenu={false} showTvOpenHint />
        </div>
      {/each}
    </UiV2ReleaseCarousel>
  {/if}
</section>
