<script lang="ts">
  import RecommendedReleaseCard from '../RecommendedReleaseCard.svelte';
  import ReleaseCarouselNav from '../../views/Release/components/ReleaseCarouselNav.svelte';
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
  <div class="overview-carousel">
    <ReleaseCarouselNav
      measureKey={items.length}
      navClass="overview-carousel__nav"
      scrollClass="overview-carousel__scroll"
      {initialScrollLeft}
      {onScrollLeftChange}
    >
      {#each items as item (item.id)}
        <RecommendedReleaseCard data={item} />
      {/each}
    </ReleaseCarouselNav>
  </div>
{/if}
