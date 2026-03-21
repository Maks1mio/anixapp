<script lang="ts">
  import { customScrollbar } from '../actions/customScrollbar';
  import type { Snippet } from 'svelte';

  interface Props {
    scrollId?: string;
    extraClass?: string;
    noPadding?: boolean;
    children?: Snippet;
  }

  let { scrollId = 'content', extraClass, noPadding = false, children }: Props = $props();

  const pageClass = $derived(
    ['page', !noPadding ? 'page--padded' : '', extraClass ?? '']
      .filter(Boolean)
      .join(' ')
  );
</script>

<div class={pageClass} use:customScrollbar>
  <div
    id={scrollId || undefined}
    class="page__scroll"
    data-page-scroll
  >
    {@render children?.()}
  </div>

  <div class="page__v-track">
    <div class="page__v-thumb"></div>
  </div>

  <div class="page__h-track">
    <div class="page__h-thumb"></div>
  </div>
</div>
