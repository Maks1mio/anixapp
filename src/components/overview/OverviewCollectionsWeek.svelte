<script lang="ts">
  import UiV2ReleaseCarousel from '../uikit-v2/UiV2ReleaseCarousel.svelte';
  import CollectionCard, { type CollectionCardData } from '../CollectionCard.svelte';

  interface Props {
    items: CollectionCardData[];
  }

  let { items }: Props = $props();
</script>

{#if items.length > 0}
  <div class="overview-collections-week">
    <UiV2ReleaseCarousel measureKey={items.length}>
      {#each items as item (item.id)}
        <div class="overview-collections-week__item">
          <CollectionCard data={item} variant="cover" />
        </div>
      {/each}
    </UiV2ReleaseCarousel>
  </div>
{/if}
