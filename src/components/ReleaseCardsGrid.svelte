<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { getCardLayout } from '../prefs';
  import type { ReleaseCardData } from '../types/release';
  import ReleaseCardV from './ReleaseCardV.svelte';
  import ReleaseCardH from './ReleaseCardH.svelte';

  export type GridLayoutMode = 'auto' | 'wide' | 'mini';

  /** Ширина контейнера списка, ниже — mini-сетка */
  const NARROW_CONTAINER_PX = 640;

  interface Props {
    items: ReleaseCardData[];
    layout?: GridLayoutMode;
    className?: string;
    variant?: 'default' | 'history';
    onDeleteFromHistory?: (id: number) => void;
  }

  let { items, layout = 'auto', className = '', variant = 'default', onDeleteFromHistory }: Props = $props();

  let rootEl = $state<HTMLDivElement | undefined>();
  let containerWidth = $state(typeof window !== 'undefined' ? window.innerWidth : 9999);

  function isNarrowContainer(): boolean {
    return containerWidth < NARROW_CONTAINER_PX;
  }

  function resolveLayout(mode: GridLayoutMode): 'mini' | 'wide' {
    if (isNarrowContainer()) return 'mini';
    if (mode === 'auto') return getCardLayout();
    return mode === 'mini' ? 'mini' : 'wide';
  }

  let effectiveLayout = $state(resolveLayout(layout));

  function syncLayout() {
    effectiveLayout = resolveLayout(layout);
  }

  $effect(() => {
    layout;
    containerWidth;
    syncLayout();
  });

  function handleLayoutChanged(e: Event) {
    const detail = (e as CustomEvent<{ layout: 'mini' | 'wide' }>).detail;
    if (layout === 'auto' && !isNarrowContainer()) {
      effectiveLayout = detail?.layout ?? getCardLayout();
    } else {
      syncLayout();
    }
  }

  $effect(() => {
    const el = rootEl;
    if (!el) return;
    const update = () => {
      containerWidth = el.clientWidth;
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  });

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

<div class={rootClass} bind:this={rootEl}>
  {#each items as item (item.id)}
    {#if effectiveLayout === 'mini'}
      <ReleaseCardV data={item} {variant} {onDeleteFromHistory} />
    {:else}
      <ReleaseCardH data={item} {variant} {onDeleteFromHistory} />
    {/if}
  {/each}
</div>
