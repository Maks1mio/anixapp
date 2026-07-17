<script lang="ts">
  import CollectionCard from '../../../../components/CollectionCard.svelte';  import ReleaseCarouselNav from '../../../Release/components/ReleaseCarouselNav.svelte';
  import { mapCollectionCard } from '../../../../utils/collection';

  interface Props {
    items: Record<string, unknown>[];
  }
  let { items }: Props = $props();
  const cards = $derived(
    items
      .map((item) => {
        const mapped = mapCollectionCard(item);
        if (!mapped.id) return null;
        return { ...mapped, description: undefined };
      })
      .filter((item): item is NonNullable<typeof item> => item != null),
  );
</script>

<div class="profile-v2__collections">
  {#if cards.length > 0}
    <div class="profile-v2__collections-carousel overview-collections-week">
      <ReleaseCarouselNav
        measureKey={cards.length}
        navClass="overview-carousel__nav"
        scrollClass="overview-collections-week__scroll profile-v2__collections-scroll"
      >
        {#each cards as item (item.id)}
          <div class="overview-collections-week__item profile-v2__collections-item">
            <CollectionCard data={item} variant="grid" />
          </div>
        {/each}
      </ReleaseCarouselNav>
    </div>
  {/if}
</div>
