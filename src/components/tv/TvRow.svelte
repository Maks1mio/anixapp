<script lang="ts">
  import type { Snippet } from 'svelte';
  import UiV2ReleaseCarousel from '../uikit-v2/UiV2ReleaseCarousel.svelte';
  import UiV2ReleaseCarouselSkeleton from '../uikit-v2/UiV2ReleaseCarouselSkeleton.svelte';
  import type { TvHomeRowStatus } from '../../tv/homeRows';

  /**
   * Горизонтальный ряд TV для произвольных плиток (коллекции, люди, действия).
   * Разметка как у `TvHomeRow` — та же навигация D-pad по рядам `[data-tv-home-row]`.
   */
  interface Props {
    id: string;
    label: string;
    meta?: string;
    status?: TvHomeRowStatus;
    /** Ширина плитки: `wide` — 16:9 (коллекции), `compact` — аватары и кнопки. */
    size?: 'wide' | 'compact';
    count?: number;
    emptyText?: string;
    children?: Snippet;
  }

  let {
    id,
    label,
    meta = '',
    status = 'ready',
    size = 'wide',
    count = 0,
    emptyText = 'Пока пусто',
    children,
  }: Props = $props();
</script>

<section
  class="tv-home-row tv-row tv-row--{size}"
  aria-label={label}
  data-tv-home-row
  data-tv-home-row-id={id}
>
  <h2 class="tv-home-row__title">{label}{#if meta}<span class="tv-home-row__meta">{meta}</span>{/if}</h2>

  {#if status === 'loading'}
    <UiV2ReleaseCarouselSkeleton count={5} class="tv-release-carousel" />
  {:else if status === 'error'}
    <p class="tv-home-row__status">Не удалось загрузить</p>
  {:else if status === 'empty'}
    <p class="tv-home-row__status">{emptyText}</p>
  {:else}
    <UiV2ReleaseCarousel measureKey={`${id}-${count}`} class="tv-release-carousel tv-row__carousel">
      {@render children?.()}
    </UiV2ReleaseCarousel>
  {/if}
</section>
