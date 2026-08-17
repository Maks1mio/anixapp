<script lang="ts">
  import { onMount, onDestroy, untrack } from 'svelte';
  import { getCardLayout } from '../prefs';
  import UiV2AnimeCardSkeleton from './uikit-v2/UiV2AnimeCardSkeleton.svelte';
  import type { GridLayoutMode } from './ReleaseCardsGrid.svelte';

  interface Props {
    count?: number;
    layout?: GridLayoutMode;
    className?: string;
  }

  let { count = 10, layout = 'auto', className = '' }: Props = $props();

  function resolveLayout(mode: GridLayoutMode): 'mini' | 'wide' {
    if (mode === 'auto') return getCardLayout();
    return mode === 'mini' ? 'mini' : 'wide';
  }

  let effectiveLayout = $state(untrack(() => resolveLayout(layout)));

  function syncLayout() {
    effectiveLayout = resolveLayout(layout);
  }

  $effect(() => {
    layout;
    syncLayout();
  });

  function handleLayoutChanged(e: Event) {
    const detail = (e as CustomEvent<{ layout: 'mini' | 'wide' }>).detail;
    if (layout === 'auto') {
      effectiveLayout = detail?.layout ?? getCardLayout();
    } else {
      syncLayout();
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
      .join(' '),
  );
  const cardVariant = $derived(effectiveLayout === 'mini' ? 'vertical' : 'horizontal');
</script>

<div class={rootClass} aria-busy="true" aria-label="Загрузка списка">
  {#each Array.from({ length: count }) as _, i (i)}
    <UiV2AnimeCardSkeleton variant={cardVariant} />
  {/each}
</div>
