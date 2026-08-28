<script lang="ts">
  import { onMount } from 'svelte';
  import { iconStar } from '../icons';
  import type { ReleaseCardData } from '../../types/release';
  import { toPosterDisplayUrl } from '../../utils/posterUrl';
  import {
    syncTvHomeSpotlightFromDom,
    syncTvHomeSpotlightFromElement,
    tvHomeDescription,
    tvHomeGenres,
    tvHomePrimaryMetaParts,
    tvHomeSecondaryMetaParts,
    tvHomeSpotlightStore,
    tvHomeSpotlightSubtitle,
    tvHomeSpotlightTitle,
  } from '../../tv/homeSpotlight';

  const CARD_SEL = '.uiv2-anime-card:not(.tv-category-see-all)';

  let item = $state<ReleaseCardData | null>(null);

  function sync() {
    syncTvHomeSpotlightFromDom();
  }

  function onPointerOver(event: PointerEvent) {
    if (event.pointerType !== 'mouse') return;
    const card = (event.target as Element | null)?.closest(CARD_SEL);
    if (!card) return;
    syncTvHomeSpotlightFromElement(card);
  }

  function onPointerOut(event: PointerEvent) {
    if (event.pointerType !== 'mouse') return;
    const fromCard = (event.target as Element | null)?.closest(CARD_SEL);
    const toCard = (event.relatedTarget as Element | null)?.closest(CARD_SEL);
    if (fromCard && fromCard !== toCard) sync();
  }

  const title = $derived(item ? tvHomeSpotlightTitle(item) : '');
  const subtitle = $derived(item ? tvHomeSpotlightSubtitle(item) : null);
  const primaryMeta = $derived(item ? tvHomePrimaryMetaParts(item) : []);
  const secondaryMeta = $derived(item ? tvHomeSecondaryMetaParts(item) : []);
  const genres = $derived(item ? tvHomeGenres(item) : []);
  const description = $derived(item ? tvHomeDescription(item) : null);
  const posterUrl = $derived(
    item?.poster?.trim() ? toPosterDisplayUrl(item.poster, 'tvSpotlight') : '',
  );
  const rating = $derived(
    typeof item?.rating === 'number' && item.rating > 0
      ? item.rating.toFixed(1)
      : null,
  );
  const visible = $derived(!!item);

  onMount(() => {
    const unsub = tvHomeSpotlightStore.subscribe((next) => {
      item = next;
    });

    const observer = new MutationObserver(sync);
    observer.observe(document.body, {
      subtree: true,
      attributes: true,
      attributeFilter: ['data-tv-focus'],
    });

    document.addEventListener('focusin', sync, true);
    document.addEventListener('pointerover', onPointerOver, true);
    document.addEventListener('pointerout', onPointerOut, true);
    sync();

    return () => {
      unsub();
      observer.disconnect();
      document.removeEventListener('focusin', sync, true);
      document.removeEventListener('pointerover', onPointerOver, true);
      document.removeEventListener('pointerout', onPointerOut, true);
    };
  });
</script>

<section
  class="tv-home-spotlight"
  class:tv-home-spotlight--visible={visible}
  aria-live="polite"
  aria-label={visible ? title : 'Информация о релизе'}
>
  {#if item}
    <div class="tv-home-spotlight__content">
      {#if posterUrl}
        <div class="tv-home-spotlight__poster-wrap">
          <img
            class="tv-home-spotlight__poster"
            src={posterUrl}
            alt=""
            decoding="async"
          />
        </div>
      {/if}

      <div class="tv-home-spotlight__body">
        <div class="tv-home-spotlight__head">
          <h1 class="tv-home-spotlight__title">{title}</h1>

          {#if subtitle || rating}
            <div class="tv-home-spotlight__lead">
              {#if subtitle}
                <p class="tv-home-spotlight__subtitle">{subtitle}</p>
              {/if}
              {#if rating}
                <span class="tv-home-spotlight__rating" aria-label="Рейтинг {rating}">
                  <span class="tv-home-spotlight__rating-star" aria-hidden="true">{@html iconStar(14)}</span>
                  {rating}
                </span>
              {/if}
            </div>
          {/if}
        </div>

        {#if primaryMeta.length}
          <p class="tv-home-spotlight__meta-row">
            {#each primaryMeta as part, i (part)}
              <span class="tv-home-spotlight__meta-part">{part}</span>{#if i < primaryMeta.length - 1}<span class="tv-home-spotlight__meta-sep" aria-hidden="true">·</span>{/if}
            {/each}
          </p>
        {/if}

        {#if secondaryMeta.length}
          <p class="tv-home-spotlight__meta-row tv-home-spotlight__meta-row--soft">
            {#each secondaryMeta as part, i (part)}
              <span class="tv-home-spotlight__meta-part">{part}</span>{#if i < secondaryMeta.length - 1}<span class="tv-home-spotlight__meta-sep" aria-hidden="true">·</span>{/if}
            {/each}
          </p>
        {/if}

        {#if genres.length}
          <ul class="tv-home-spotlight__genres" aria-label="Жанры">
            {#each genres.slice(0, 6) as genre (genre)}
              <li class="tv-home-spotlight__genre">{genre}</li>
            {/each}
          </ul>
        {/if}

        {#if description}
          <p class="tv-home-spotlight__desc">{description}</p>
        {/if}
      </div>
    </div>
  {/if}
</section>
