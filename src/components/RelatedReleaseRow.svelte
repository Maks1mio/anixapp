<script lang="ts">
  import { navigate } from '../stores/navigation';
  import { iconStar } from './icons';
  import type { ReleaseCardData } from '../types/release';

  interface Props {
    data: ReleaseCardData;
    current?: boolean;
  }

  let { data, current = false }: Props = $props();

  const title = $derived(data.titleRu || data.titleEn || 'Без названия');
  const hasRating = $derived((data.voteCount ?? 0) > 50 && data.rating != null);
  const ratingText = $derived(
    data.rating != null ? (Math.round(data.rating * 10) / 10).toFixed(1) : '',
  );

  function openRelease() {
    if (current || !data.id) return;
    navigate(`/release/${data.id}`);
  }
</script>

<button
  type="button"
  class="related-release-row"
  class:related-release-row--current={current}
  disabled={current}
  onclick={openRelease}
>
  <div class="related-release-row__poster">
    {#if data.poster}
      <img src={data.poster} alt="" loading="lazy" decoding="async" />
    {/if}
  </div>

  <div class="related-release-row__body">
    <span class="related-release-row__title">{title}</span>
    <div class="related-release-row__meta">
      {#if data.year}
        <span class="related-release-row__year">{data.year} год</span>
      {/if}
      {#if hasRating}
        <span class="related-release-row__dot" aria-hidden="true">•</span>
        <span class="related-release-row__grade">
          {ratingText}
          <span class="related-release-row__star" aria-hidden="true">{@html iconStar(13, true)}</span>
        </span>
      {/if}
      {#if data.category}
        <span class="related-release-row__category">{data.category}</span>
      {/if}
    </div>
  </div>

  {#if current}
    <div class="related-release-row__here" aria-label="Вы здесь">
      <span class="related-release-row__here-line" aria-hidden="true"></span>
      <span class="related-release-row__here-label">Вы<br />здесь</span>
    </div>
  {/if}
</button>
