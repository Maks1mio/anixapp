<script lang="ts">
  import { iconChevronLeft, iconChevronRight } from '../icons';
  import type { UiV2FeedPostMedia } from './UiV2FeedPost.svelte';
  import { openFeedMediaLightbox } from '../../utils/feed-media-lightbox';

  type Props = {
    items: UiV2FeedPostMedia[];
  };

  let { items }: Props = $props();

  let scroller = $state<HTMLDivElement | null>(null);
  let canPrev = $state(false);
  let canNext = $state(false);

  const useGallery = $derived(items.length >= 2 && items.length <= 4);
  const useCarousel = $derived(items.length >= 5);

  function updateScrollState() {
    const el = scroller;
    if (!el) {
      canPrev = false;
      canNext = false;
      return;
    }
    canPrev = el.scrollLeft > 6;
    canNext = el.scrollLeft + el.clientWidth < el.scrollWidth - 6;
  }

  function scrollCarousel(dir: -1 | 1, e: MouseEvent) {
    e.stopPropagation();
    const el = scroller;
    if (!el) return;
    const slide = el.querySelector<HTMLElement>('.uiv2-feed-post__carousel-slide');
    const gap = 8;
    const step = (slide?.offsetWidth ?? el.clientWidth * 0.9) + gap;
    el.scrollBy({ left: dir * step, behavior: 'smooth' });
  }

  function showGifBadge(item: UiV2FeedPostMedia): boolean {
    return item.kind === 'gif';
  }

  function previewAt(index: number, e: MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    openFeedMediaLightbox(items, index, e.currentTarget as HTMLElement);
  }

  $effect(() => {
    items;
    scroller;
    queueMicrotask(updateScrollState);
  });
</script>

{#snippet mediaNode(item: UiV2FeedPostMedia, className = '')}
  {#if item.kind === 'video'}
    <!-- svelte-ignore a11y_media_has_caption -->
    <video
      class={className}
      src={item.url}
      muted
      playsinline
      loop
      autoplay
      preload="metadata"
    ></video>
  {:else}
    <img class={className} src={item.url} alt="" loading="lazy" decoding="async" />
  {/if}
{/snippet}

{#if items.length === 0}
  <!-- no media -->
{:else if items.length === 1}
  {@const item = items[0]}
  <button
    type="button"
    class="uiv2-feed-post__media uiv2-feed-post__media--single"
    data-post-action
    aria-label="Открыть изображение"
    onclick={(e) => previewAt(0, e)}
  >
    {#if item.kind === 'video'}
      <!-- svelte-ignore a11y_media_has_caption -->
      <video
        class="uiv2-feed-post__media-blur"
        src={item.url}
        muted
        playsinline
        loop
        autoplay
        preload="metadata"
        aria-hidden="true"
        tabindex="-1"
      ></video>
    {:else}
      <img
        class="uiv2-feed-post__media-blur"
        src={item.url}
        alt=""
        aria-hidden="true"
        loading="lazy"
        decoding="async"
      />
    {/if}
    {@render mediaNode(item, 'uiv2-feed-post__media-img')}
    {#if showGifBadge(item)}
      <span class="uiv2-feed-post__media-badge">GIF</span>
    {/if}
  </button>
{:else if useGallery}
  <div
    class="uiv2-feed-post__gallery uiv2-feed-post__gallery--{items.length}"
    role="group"
    aria-label="Изображения записи"
    data-post-action
  >
    {#each items as item, i (item.url + i)}
      <button
        type="button"
        class="uiv2-feed-post__gallery-cell"
        aria-label={`Открыть изображение ${i + 1}`}
        onclick={(e) => previewAt(i, e)}
      >
        {@render mediaNode(item, 'uiv2-feed-post__gallery-img')}
        {#if showGifBadge(item)}
          <span class="uiv2-feed-post__media-badge">GIF</span>
        {/if}
      </button>
    {/each}
  </div>
{:else}
  <div class="uiv2-feed-post__carousel-wrap" data-post-action>
    <div
      class="uiv2-feed-post__carousel"
      bind:this={scroller}
      onscroll={updateScrollState}
    >
      {#each items as item, i (item.url + i)}
        <button
          type="button"
          class="uiv2-feed-post__carousel-slide"
          aria-label={`Открыть изображение ${i + 1}`}
          onclick={(e) => previewAt(i, e)}
        >
          {@render mediaNode(item, 'uiv2-feed-post__carousel-img')}
          {#if showGifBadge(item)}
            <span class="uiv2-feed-post__media-badge">GIF</span>
          {/if}
        </button>
      {/each}
    </div>

    {#if useCarousel && (canPrev || canNext)}
      <div class="uiv2-feed-post__carousel-nav-row">
        <button
          type="button"
          class="uiv2-feed-post__carousel-nav"
          aria-label="Предыдущее фото"
          disabled={!canPrev}
          onclick={(e) => scrollCarousel(-1, e)}
        >
          {@html iconChevronLeft(18)}
        </button>
        <button
          type="button"
          class="uiv2-feed-post__carousel-nav"
          aria-label="Следующее фото"
          disabled={!canNext}
          onclick={(e) => scrollCarousel(1, e)}
        >
          {@html iconChevronRight(18)}
        </button>
      </div>
    {/if}
  </div>
{/if}

<svelte:window onresize={updateScrollState} />
