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
  };

  let {
    children,
    measureKey,
    class: className = '',
    initialScrollLeft = 0,
    onScrollLeftChange,
  }: Props = $props();
</script>

<div
  class="uiv2-carousel uiv2-scroll-area uiv2-scroll-area--x {className}"
  use:uiv2CustomScroll={{ axis: 'x', viewportSelector: '.uiv2-carousel__scroll' }}
>
  <ReleaseCarouselNav
    {measureKey}
    navClass="uiv2-carousel__nav"
    scrollClass="uiv2-carousel__scroll"
    {initialScrollLeft}
    {onScrollLeftChange}
  >
    {@render children()}
  </ReleaseCarouselNav>

  <div class="uiv2-scroll-area__h-track" aria-hidden="true">
    <div class="uiv2-scroll-area__h-thumb"></div>
  </div>
</div>
