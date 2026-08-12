<script lang="ts">
  import type { Snippet } from 'svelte';
  import {
    uiv2CustomScroll,
    type Uiv2ScrollAxis,
  } from '../../actions/uiv2CustomScroll';

  type Props = {
    axis?: Uiv2ScrollAxis;
    scrollId?: string;
    class?: string;
    viewportClass?: string;
    /** Внутренний padding viewport (CSS value) */
    padding?: string;
    children?: Snippet;
  };

  let {
    axis = 'y',
    scrollId,
    class: className = '',
    viewportClass = '',
    padding,
    children,
  }: Props = $props();

  const rootClass = $derived(
    [
      'uiv2-scroll-area',
      axis === 'y' ? 'uiv2-scroll-area--y' : '',
      axis === 'x' ? 'uiv2-scroll-area--x' : '',
      axis === 'both' ? 'uiv2-scroll-area--y uiv2-scroll-area--x' : '',
      className,
    ]
      .filter(Boolean)
      .join(' '),
  );

  const viewportStyle = $derived(padding ? `padding:${padding};` : undefined);
</script>

<div
  class={rootClass}
  use:uiv2CustomScroll={{ axis }}
>
  <div
    id={scrollId || undefined}
    class="uiv2-scroll-area__viewport {viewportClass}"
    style={viewportStyle}
    data-uiv2-scroll
    data-page-scroll
  >
    {@render children?.()}
  </div>

  {#if axis === 'y' || axis === 'both'}
    <div class="uiv2-scroll-area__v-track" aria-hidden="true">
      <div class="uiv2-scroll-area__v-thumb"></div>
    </div>
  {/if}

  {#if axis === 'x' || axis === 'both'}
    <div class="uiv2-scroll-area__h-track" aria-hidden="true">
      <div class="uiv2-scroll-area__h-thumb"></div>
    </div>
  {/if}
</div>
