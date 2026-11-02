<script lang="ts">
  import { navigate } from '../../stores/navigation';
  import { tvPosterThumbUrl } from '../../platform/tv';
  import type { CollectionCardData } from '../CollectionCard.svelte';

  interface Props {
    data: CollectionCardData;
  }

  let { data }: Props = $props();

  const image = $derived(data.image ? tvPosterThumbUrl(data.image) ?? data.image : '');
  const countLabel = $derived(
    typeof data.releaseCount === 'number' && data.releaseCount > 0
      ? `${data.releaseCount.toLocaleString('ru-RU')} тайтлов`
      : '',
  );
</script>

<button type="button" class="tv-collection-tile" onclick={() => navigate(`/collection/${data.id}`)}>
  <span class="tv-collection-tile__cover">
    {#if image}
      <img src={image} alt="" loading="lazy" decoding="async" />
    {/if}
    {#if countLabel}
      <span class="tv-collection-tile__count">{countLabel}</span>
    {/if}
  </span>
  <span class="tv-collection-tile__title">{data.title}</span>
</button>
