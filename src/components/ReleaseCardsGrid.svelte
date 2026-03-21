<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { getCardLayout } from '../prefs';
  import type { ReleaseCardData } from '../types/release';
  import ReleaseCardV from './ReleaseCardV.svelte';
  import ReleaseCardH from './ReleaseCardH.svelte';

  export type GridLayoutMode = 'auto' | 'wide' | 'mini';

  interface Props {
    items: ReleaseCardData[];
    layout?: GridLayoutMode;
    className?: string;
  }

  let { items, layout = 'auto', className = '' }: Props = $props();

  function resolveLayout(mode: GridLayoutMode): 'mini' | 'wide' {
    if (mode === 'auto') return getCardLayout();
    return mode === 'mini' ? 'mini' : 'wide';
  }

  let effectiveLayout = $state(resolveLayout(layout));

  function handleLayoutChanged(e: Event) {
    const detail = (e as CustomEvent<{ layout: 'mini' | 'wide' }>).detail;
    if (layout === 'auto') {
      effectiveLayout = detail?.layout ?? getCardLayout();
    }
  }

  onMount(() => {
    window.addEventListener('anix:cardLayoutChanged', handleLayoutChanged);
  });

  onDestroy(() => {
    window.removeEventListener('anix:cardLayoutChanged', handleLayoutChanged);
  });

  const rootClass = $derived(
    [
      'release-cards-grid-root',
      effectiveLayout === 'mini' ? 'release-cards-grid' : 'release-cards-grid-root--wide',
      className,
    ]
      .filter(Boolean)
      .join(' ')
  );
</script>

<div class={rootClass}>
  {#each items as item (item.id)}
    {#if effectiveLayout === 'mini'}
      <ReleaseCardV data={item} />
    {:else}
      <ReleaseCardH data={item} />
    {/if}
  {/each}
</div>
