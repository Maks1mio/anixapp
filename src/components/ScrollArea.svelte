<script lang="ts">
  import { customScrollbar } from '../actions/customScrollbar';
  import type { Snippet } from 'svelte';

  interface Props {
    extraClass?: string;
    scrollId?: string;
    children?: Snippet;
  }

  let { extraClass, scrollId, children }: Props = $props();

  const rootClass = $derived(
    ['page', 'page--scroll-area', extraClass ?? ''].filter(Boolean).join(' '),
  );
</script>

<div class={rootClass} use:customScrollbar>
  <div id={scrollId || undefined} class="page__scroll" data-page-scroll>
    {@render children?.()}
  </div>

  <div class="page__v-track">
    <div class="page__v-thumb"></div>
  </div>

  <div class="page__h-track">
    <div class="page__h-thumb"></div>
  </div>
</div>
