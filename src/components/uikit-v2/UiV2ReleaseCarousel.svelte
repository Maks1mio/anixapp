<script lang="ts">
  import type { Snippet } from 'svelte';
  import ReleaseCarouselNav from '../../views/Release/components/ReleaseCarouselNav.svelte';
  import { uiv2CustomScroll } from '../../actions/uiv2CustomScroll';

  type Props = {
    children: Snippet;
    measureKey?: unknown;
    class?: string;
    initialScrollLeft?: number;
    onScrollLeftChange?: (left: number) => void;
    scrollbar?: boolean;
    wheelScroll?: boolean;
    /** Цвет fade по краям; по умолчанию фон страницы (--carousel-fade-color) */
    fadeColor?: string;
  };

  let {
    children,
    measureKey,
    class: className = '',
    initialScrollLeft = 0,
    onScrollLeftChange,
    scrollbar = true,
    wheelScroll = false,
    fadeColor,
  }: Props = $props();

  const fadeStyle = $derived(fadeColor ? `--carousel-fade-color: ${fadeColor}` : undefined);
</script>

{#snippet body()}
  <ReleaseCarouselNav
    {measureKey}
    navClass="uiv2-carousel__nav"
    scrollClass="uiv2-carousel__scroll"
    {initialScrollLeft}
    {onScrollLeftChange}
    mapWheel={wheelScroll}
  >
    {@render children()}
  </ReleaseCarouselNav>
{/snippet}

{#if scrollbar}
  <div
    class="uiv2-carousel uiv2-scroll-area uiv2-scroll-area--x {className}"
    style={fadeStyle}
    use:uiv2CustomScroll={{ axis: 'x', viewportSelector: '.uiv2-carousel__scroll' }}
  >
    {@render body()}
    <div class="uiv2-scroll-area__h-track" aria-hidden="true">
      <div class="uiv2-scroll-area__h-thumb"></div>
    </div>
  </div>
{:else}
  <div class="uiv2-carousel {className}" style={fadeStyle}>
    {@render body()}
  </div>
{/if}
