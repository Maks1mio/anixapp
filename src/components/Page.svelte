<script lang="ts">
  import { uiv2CustomScroll } from '../actions/uiv2CustomScroll';
  import type { Snippet } from 'svelte';

  interface Props {
    scrollId?: string;
    extraClass?: string;
    noPadding?: boolean;
    children?: Snippet;
  }

  let { scrollId = 'content', extraClass, noPadding = false, children }: Props = $props();

  const pageClass = $derived(
    [
      'page',
      'uiv2-scroll-area',
      'uiv2-scroll-area--y',
      !noPadding ? 'page--padded' : '',
      extraClass ?? '',
    ]
      .filter(Boolean)
      .join(' '),
  );
</script>

<div
  class={pageClass}
  use:uiv2CustomScroll={{ axis: 'y', viewportSelector: '.page__scroll' }}
>
  <div
    id={scrollId || undefined}
    class="page__scroll uiv2-scroll-area__viewport"
    data-page-scroll
    data-uiv2-scroll
  >
    {@render children?.()}
  </div>

  <div class="uiv2-scroll-area__v-track" aria-hidden="true">
    <div class="uiv2-scroll-area__v-thumb"></div>
  </div>
</div>
