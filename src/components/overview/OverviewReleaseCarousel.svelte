<script lang="ts">
  import UiV2ReleaseCarousel from '../uikit-v2/UiV2ReleaseCarousel.svelte';
  import ReleaseCardUiV2 from '../ReleaseCardUiV2.svelte';
  import type { ReleaseCardData } from '../../types/release';

  interface Props {
    items: ReleaseCardData[];
    sectionId?: 'recommendations' | 'watching';
    initialScrollLeft?: number;
    onScrollLeftChange?: (left: number) => void;
  }

  let { items, initialScrollLeft = 0, onScrollLeftChange }: Props = $props();
</script>

{#if items.length > 0}
  <UiV2ReleaseCarousel measureKey={items.length} {initialScrollLeft} {onScrollLeftChange}>
    {#each items as item (item.id)}
      <div class="uiv2-carousel__item">
        <ReleaseCardUiV2 data={item} variant="vertical" />
      </div>
    {/each}
  </UiV2ReleaseCarousel>
{/if}
