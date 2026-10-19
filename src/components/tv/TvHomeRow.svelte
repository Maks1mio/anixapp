<script lang="ts">
  import ReleaseCardUiV2 from '../ReleaseCardUiV2.svelte';
  import TvCategorySeeAllTile from './TvCategorySeeAllTile.svelte';
  import UiV2ReleaseCarousel from '../uikit-v2/UiV2ReleaseCarousel.svelte';
  import UiV2ReleaseCarouselSkeleton from '../uikit-v2/UiV2ReleaseCarouselSkeleton.svelte';
  import type { ReleaseCardData } from '../../types/release';
  import type { TvHomeRowStatus } from '../../tv/homeRows';

  interface Props {
    label: string;
    tabId?: string;
    items?: ReleaseCardData[];
    status?: TvHomeRowStatus;
    skeletonCount?: number;
    cardVariant?: 'default' | 'history';
    showSeeAll?: boolean;
    hydrate?: boolean;
    seeAllHref?: string;
    seeAllText?: string;
    /** Подпись справа от заголовка ряда (например, количество). */
    meta?: string;
    /** Плитка «Посмотреть всё» в начале ряда (главная) или в конце (закладки). */
    seeAllAt?: 'start' | 'end';
  }

  let {
    label,
    tabId,
    items = [],
    status = 'loading',
    skeletonCount = 5,
    cardVariant = 'default',
    showSeeAll = true,
    hydrate = true,
    seeAllHref,
    seeAllText,
    meta = '',
    seeAllAt = 'start',
  }: Props = $props();
</script>

<section class="tv-home-row" class:tv-home-row--shell={!hydrate} aria-label={label} data-tv-home-row data-tv-home-row-id={tabId ?? label}>
  <h2 class="tv-home-row__title">{label}{#if meta}<span class="tv-home-row__meta">{meta}</span>{/if}</h2>

  {#if !hydrate}
    <div class="tv-home-row__slot" aria-hidden="true"></div>
  {:else if status === 'loading'}
    <UiV2ReleaseCarouselSkeleton count={skeletonCount} class="tv-release-carousel" />
  {:else if status === 'error'}
    <p class="tv-home-row__status">Не удалось загрузить</p>
  {:else if status === 'empty' || items.length === 0}
    <p class="tv-home-row__status">Пока пусто</p>
  {:else}
    <UiV2ReleaseCarousel measureKey={`${tabId}-${items.length}`} class="tv-release-carousel">
      {#if tabId && showSeeAll && seeAllAt === 'start'}
        <div class="uiv2-carousel__item">
          <TvCategorySeeAllTile {label} {tabId} href={seeAllHref} text={seeAllText} />
        </div>
      {/if}
      {#each items as item (item.id)}
        <div class="uiv2-carousel__item" data-tv-release-id={item.id}>
          <ReleaseCardUiV2 data={item} variant="vertical" showMenu={false} {cardVariant} />
        </div>
      {/each}
      {#if tabId && showSeeAll && seeAllAt === 'end'}
        <div class="uiv2-carousel__item">
          <TvCategorySeeAllTile {label} {tabId} href={seeAllHref} text={seeAllText} />
        </div>
      {/if}
    </UiV2ReleaseCarousel>
  {/if}
</section>
