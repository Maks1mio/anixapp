<script lang="ts">
  import RecommendedReleaseCard from '../RecommendedReleaseCard.svelte';
  import ReleaseCarouselNav from '../../views/Release/components/ReleaseCarouselNav.svelte';
  import type { ReleaseCardData } from '../../types/release';

  interface Props {
    items: ReleaseCardData[];
  }

  let { items }: Props = $props();
</script>

{#if items.length > 0}
  <div class="overview-carousel">
    <ReleaseCarouselNav measureKey={items.length} navClass="overview-carousel__nav" scrollClass="overview-carousel__scroll">
      {#each items as item (item.id)}
        <RecommendedReleaseCard data={item} />
      {/each}
    </ReleaseCarouselNav>
  </div>
{/if}
