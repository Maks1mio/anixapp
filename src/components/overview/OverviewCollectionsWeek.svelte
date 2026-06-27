<script lang="ts">
  import CollectionCard from '../CollectionCard.svelte';
  import ReleaseCarouselNav from '../../views/Release/components/ReleaseCarouselNav.svelte';
  import type { CollectionCardData } from '../CollectionCard.svelte';

  interface Props {
    items: CollectionCardData[];
  }

  let { items }: Props = $props();
</script>

{#if items.length > 0}
  <div class="overview-collections-week">
    <ReleaseCarouselNav measureKey={items.length} navClass="overview-carousel__nav" scrollClass="overview-collections-week__scroll">
      {#each items as item (item.id)}
        <div class="overview-collections-week__item">
          <CollectionCard data={item} variant="grid" />
        </div>
      {/each}
    </ReleaseCarouselNav>
  </div>
{/if}
