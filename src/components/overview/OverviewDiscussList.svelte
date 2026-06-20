<script lang="ts">
  import { navigate } from '../../stores/navigation';
  import { iconMessageCircle, iconStar } from '../icons';
  import PosterImage from '../PosterImage.svelte';
  import {
    episodesLabel,
    formatCommentPerDay,
    type OverviewDiscussItem,
  } from '../../utils/overview';

  interface Props {
    items: OverviewDiscussItem[];
  }

  let { items }: Props = $props();

  function openRelease(id?: number) {
    if (id) navigate(`/release/${id}`);
  }
</script>

{#if items.length > 0}
  <div class="overview-discuss-list">
    {#each items as item (item.id)}
      <button type="button" class="overview-discuss-row" onclick={() => openRelease(item.id)}>
        <div class="overview-discuss-row__poster">
          {#if item.poster}
            <PosterImage src={item.poster} alt="" />
          {:else}
            <div class="overview-discuss-row__poster-placeholder"></div>
          {/if}
        </div>

        <div class="overview-discuss-row__body">
          <div class="overview-discuss-row__title">{item.titleRu || item.titleEn || 'Без названия'}</div>
          <div class="overview-discuss-row__meta">
            <span>{episodesLabel(item.episodesReleased, item.episodesTotal)}</span>
            {#if item.rating != null}
              <span class="overview-discuss-row__dot">•</span>
              <span class="overview-discuss-row__rating">
                {item.rating.toFixed(1)}
                {@html iconStar(14, true)}
              </span>
            {/if}
          </div>
          <div class="overview-discuss-row__comments">
            <span class="overview-discuss-row__comments-icon">{@html iconMessageCircle(16)}</span>
            <span>{formatCommentPerDay(item.commentPerDayCount)}</span>
          </div>
        </div>
      </button>
    {/each}
  </div>
{/if}
