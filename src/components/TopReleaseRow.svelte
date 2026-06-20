<script lang="ts">
  import { navigate } from '../stores/navigation';
  import PosterImage from './PosterImage.svelte';
  import { iconStar } from './icons';
  import type { ReleaseCardData } from '../types/release';
  import { episodesLabel } from '../utils/overview';

  interface Props {
    rank: number;
    data: ReleaseCardData;
  }

  let { rank, data }: Props = $props();

  const id = $derived(data.id);
  const title = $derived(data.titleRu || data.titleEn || 'Без названия');
  const poster = $derived(data.poster || '');
  const rating = $derived(typeof data.rating === 'number' && data.rating > 0 ? data.rating : null);
  const epLabel = $derived(episodesLabel(data.episodesReleased, data.episodesTotal));

  function openRelease(e: MouseEvent) {
    if (!id) return;
    e.preventDefault();
    navigate(`/release/${id}`);
  }
</script>

<a
  class="top-release-row"
  href={id ? `/release/${id}` : '#'}
  onclick={openRelease}
>
  <span class="top-release-row__rank">{rank}</span>
  <div class="top-release-row__poster">
    {#if poster}
      <PosterImage src={poster} alt="" />
    {:else}
      <div class="top-release-row__no-poster"></div>
    {/if}
  </div>
  <div class="top-release-row__body">
    <h3 class="top-release-row__title">{title}</h3>
    {#if data.description}
      <p class="top-release-row__desc">{data.description}</p>
    {/if}
    <div class="top-release-row__meta">
      {#if rating != null}
        <span class="top-release-row__rating">
          <span class="top-release-row__rating-icon">{@html iconStar(14)}</span>
          {rating.toFixed(1)}
        </span>
      {/if}
      {#if epLabel}
        <span class="top-release-row__episodes">{epLabel}</span>
      {/if}
    </div>
  </div>
</a>
