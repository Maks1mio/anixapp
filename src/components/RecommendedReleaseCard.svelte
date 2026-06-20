<script lang="ts">
  import { navigate } from '../stores/navigation';
  import type { ReleaseCardData } from '../types/release';
  import PosterImage from './PosterImage.svelte';

  interface Props {
    data: ReleaseCardData;
  }

  let { data }: Props = $props();

  const id = $derived(data.id);
  const title = $derived(data.titleRu || data.titleEn || 'Без названия');
  const poster = $derived(data.poster || '');

  function openRelease(e: MouseEvent) {
    if (!id) return;
    e.preventDefault();
    navigate(`/release/${id}`);
  }
</script>

<a
  class="recommended-release-card"
  href={id ? `/release/${id}` : '#'}
  onclick={openRelease}
>
  <div class="recommended-release-card__poster">
    {#if poster}
      <PosterImage src={poster} alt="" />
    {:else}
      <div class="recommended-release-card__no-poster"></div>
    {/if}
  </div>
  <span class="recommended-release-card__title">{title}</span>
</a>
