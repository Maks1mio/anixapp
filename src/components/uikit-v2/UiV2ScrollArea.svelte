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
    /** Гасить края маской, когда за ними есть контент (только axis y) */
    fade?: boolean;
    onscroll?: (e: Event) => void;
    children?: Snippet;
  };

  let {
    axis = 'y',
    scrollId,
    class: className = '',
    viewportClass = '',
    padding,
    fade = false,
    onscroll,
    children,
  }: Props = $props();

  const rootClass = $derived(
    [
      'uiv2-scroll-area',
      axis === 'y' ? 'uiv2-scroll-area--y' : '',
      axis === 'x' ? 'uiv2-scroll-area--x' : '',
      axis === 'both' ? 'uiv2-scroll-area--y uiv2-scroll-area--x' : '',
      fade ? 'uiv2-scroll-area--fade' : '',
      fade && canUp ? 'uiv2-scroll-area--can-up' : '',
      fade && canDown ? 'uiv2-scroll-area--can-down' : '',
      className,
    ]
      .filter(Boolean)
      .join(' '),
  );

  let viewportEl = $state<HTMLDivElement | null>(null);
  let canUp = $state(false);
  let canDown = $state(false);

  function updateFade() {
    const el = viewportEl;
    if (!el) return;
    canUp = el.scrollTop > 1;
    canDown = el.scrollTop + el.clientHeight < el.scrollHeight - 1;
  }

  function handleScroll(e: Event) {
    if (fade) updateFade();
    onscroll?.(e);
  }

  $effect(() => {
    const el = viewportEl;
    if (!fade || !el) return;
    updateFade();
    const ro = new ResizeObserver(updateFade);
    ro.observe(el);
    const mo = new MutationObserver(updateFade);
    mo.observe(el, { childList: true, subtree: true, characterData: true });
    return () => {
      ro.disconnect();
      mo.disconnect();
    };
  });

  const viewportStyle = $derived(padding ? `padding:${padding};` : undefined);
</script>

<div
  class={rootClass}
  use:uiv2CustomScroll={{ axis }}
>
  <div
    bind:this={viewportEl}
    id={scrollId || undefined}
    class="uiv2-scroll-area__viewport {viewportClass}"
    style={viewportStyle}
    data-uiv2-scroll
    data-page-scroll
    onscroll={handleScroll}
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
