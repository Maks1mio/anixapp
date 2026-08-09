<script lang="ts">
  import { iconInfo, iconMoreHorizontal, iconStar } from '../icons';
  import UiV2RoundButton from './UiV2RoundButton.svelte';

  export type UiV2AnimeCardVariant = 'vertical' | 'horizontal';

  type Props = {
    variant?: UiV2AnimeCardVariant;
    title: string;
    posterUrl?: string | null;
    /** Число серий или готовая строка («6 эп.») */
    episodes?: number | string | null;
    year?: number | string | null;
    rating?: number | string | null;
    ratingCount?: number | string | null;
    country?: string | null;
    genres?: string[];
    description?: string | null;
    moreLabel?: string;
    infoLabel?: string;
    class?: string;
    onclick?: (e: MouseEvent) => void;
    onMore?: (e: MouseEvent) => void;
    onInfo?: (e: MouseEvent) => void;
  };

  let {
    variant = 'vertical',
    title,
    posterUrl = null,
    episodes = null,
    year = null,
    rating = null,
    ratingCount = null,
    country = null,
    genres = [],
    description = null,
    moreLabel = 'Ещё',
    infoLabel = 'Информация',
    class: className = '',
    onclick,
    onMore,
    onInfo,
  }: Props = $props();

  function episodesLabel(value: number | string | null | undefined): string | null {
    if (value == null || value === '') return null;
    if (typeof value === 'string') {
      return /эп/i.test(value) ? value : `${value} эп.`;
    }
    return `${value} эп.`;
  }

  function ratingLabel(value: number | string | null | undefined): string | null {
    if (value == null || value === '') return null;
    if (typeof value === 'number') {
      return Number.isInteger(value) ? value.toFixed(1) : String(Math.round(value * 100) / 100);
    }
    return String(value);
  }

  const ep = $derived(episodesLabel(episodes));
  const rate = $derived(ratingLabel(rating));

  const verticalMetaParts = $derived(
    [
      ep,
      year != null && year !== '' ? String(year) : null,
      rate,
    ].filter(Boolean) as string[],
  );

  const horizontalMeta = $derived(
    [ep, year != null && year !== '' ? String(year) : null, country ? String(country) : null]
      .filter(Boolean)
      .join(' · '),
  );

  function onCardKeydown(e: KeyboardEvent) {
    if (!onclick) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onclick(e as unknown as MouseEvent);
    }
  }

  function stopMore(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    onMore?.(e);
  }

  function stopInfo(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    onInfo?.(e);
  }
</script>

{#if variant === 'vertical'}
  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <div
    class="uiv2-anime-card uiv2-anime-card--vertical {className}"
    role={onclick ? 'button' : 'group'}
    tabindex={onclick ? 0 : undefined}
    aria-label={onclick ? title : undefined}
    onclick={onclick}
    onkeydown={onCardKeydown}
  >
    <div class="uiv2-anime-card__poster">
      {#if posterUrl}
        <img src={posterUrl} alt="" loading="lazy" decoding="async" />
      {:else}
        <span class="uiv2-anime-card__poster-fallback" aria-hidden="true"></span>
      {/if}
      {#if onMore}
        <span class="uiv2-anime-card__more-slot">
          <UiV2RoundButton
            size="sm"
            label={moreLabel}
            class="uiv2-anime-card__more"
            onclick={stopMore}
          >
            {@html iconMoreHorizontal(16)}
          </UiV2RoundButton>
        </span>
      {/if}
    </div>
    <div class="uiv2-anime-card__body">
      <h3 class="uiv2-anime-card__title">{title}</h3>
      {#if verticalMetaParts.length}
        <p class="uiv2-anime-card__meta">
          {#each verticalMetaParts as part, i (part)}
            {#if i > 0}<span aria-hidden="true"> · </span>{/if}
            {#if part === rate}
              <span>{part}</span>
              <span class="uiv2-anime-card__meta-star" aria-hidden="true"> ★</span>
            {:else}
              {part}
            {/if}
          {/each}
        </p>
      {/if}
    </div>
  </div>
{:else}
  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <div
    class="uiv2-anime-card uiv2-anime-card--horizontal {className}"
    role={onclick ? 'button' : 'group'}
    tabindex={onclick ? 0 : undefined}
    aria-label={onclick ? title : undefined}
    onclick={onclick}
    onkeydown={onCardKeydown}
  >
    <div class="uiv2-anime-card__poster uiv2-anime-card__poster--h">
      {#if posterUrl}
        <img src={posterUrl} alt="" loading="lazy" decoding="async" />
      {:else}
        <span class="uiv2-anime-card__poster-fallback" aria-hidden="true"></span>
      {/if}
    </div>

    <div class="uiv2-anime-card__content">
      <div class="uiv2-anime-card__title-row">
        <h3 class="uiv2-anime-card__title uiv2-anime-card__title--h">{title}</h3>
        {#if onMore}
          <UiV2RoundButton
            size="sm"
            label={moreLabel}
            class="uiv2-anime-card__more uiv2-anime-card__more--plain"
            onclick={stopMore}
          >
            {@html iconMoreHorizontal(16)}
          </UiV2RoundButton>
        {/if}
      </div>

      {#if onInfo}
        <button
          type="button"
          class="uiv2-anime-card__info"
          aria-label={infoLabel}
          onclick={stopInfo}
        >
          {@html iconInfo(15)}
        </button>
      {/if}

      <div class="uiv2-anime-card__stats">
        {#if rate}
          <span class="uiv2-anime-card__rating">
            <span class="uiv2-anime-card__rating-value">{rate}</span>
            <span class="uiv2-anime-card__rating-star" aria-hidden="true">{@html iconStar(12)}</span>
            {#if ratingCount != null && ratingCount !== ''}
              <span class="uiv2-anime-card__rating-count">{ratingCount}</span>
            {/if}
          </span>
        {/if}
        {#if horizontalMeta}
          <span class="uiv2-anime-card__meta uiv2-anime-card__meta--inline">{horizontalMeta}</span>
        {/if}
      </div>

      {#if genres.length}
        <ul class="uiv2-anime-card__tags">
          {#each genres as genre (genre)}
            <li class="uiv2-anime-card__tag">{genre}</li>
          {/each}
        </ul>
      {/if}

      {#if description}
        <p class="uiv2-anime-card__desc">{description}</p>
      {/if}
    </div>
  </div>
{/if}
