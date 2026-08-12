<script lang="ts">
  import { onDestroy } from 'svelte';
  import { fetchCdnJson, toCdnProxyUrl } from '../utils/posterUrl';
  import { isLottieBadgeUrl } from '../utils/badge';

  type Size = 'xs' | 'sm' | 'md' | 'lg';

  type Props = {
    url?: string | null;
    name?: string | null;
    size?: Size;
    class?: string;
    /** Показывать нативный title при наведении (по умолчанию да). */
    showTooltip?: boolean;
  };

  let {
    url = null,
    name = null,
    size = 'sm',
    class: className = '',
    showTooltip = true,
  }: Props = $props();

  let lottieEl = $state<HTMLElement | undefined>();
  let anim: { destroy?: () => void } | null = null;

  const src = $derived(url?.trim() ? url.trim() : '');
  const isLottie = $derived(!!src && isLottieBadgeUrl(src));
  const title = $derived(showTooltip ? (name?.trim() || '') : '');

  function destroyAnim() {
    if (anim?.destroy) anim.destroy();
    anim = null;
  }

  async function loadLottie(badgeUrl: string, target: HTMLElement) {
    try {
      const json = await fetchCdnJson(badgeUrl);
      if (!json || typeof json !== 'object') return;
      const mod: any = await import('lottie-web');
      const lottie = mod?.default ?? mod;
      if (!lottie?.loadAnimation) return;
      destroyAnim();
      anim = lottie.loadAnimation({
        container: target,
        renderer: 'svg',
        loop: true,
        autoplay: true,
        animationData: json,
        rendererSettings: { preserveAspectRatio: 'xMidYMid meet' },
      });
    } catch {
      /* ignore */
    }
  }

  $effect(() => {
    destroyAnim();
    if (isLottie && lottieEl && src) {
      void loadLottie(src, lottieEl);
    }
  });

  onDestroy(() => destroyAnim());
</script>

{#if src}
  {#if isLottie}
    <span
      class="user-badge user-badge--{size} user-badge--lottie {className}"
      title={title || undefined}
      aria-label={title || 'Значок'}
      bind:this={lottieEl}
    ></span>
  {:else}
    <img
      class="user-badge user-badge--{size} {className}"
      src={toCdnProxyUrl(src)}
      alt={title || ''}
      title={title || undefined}
      loading="lazy"
      decoding="async"
    />
  {/if}
{/if}

<style>
  .user-badge {
    display: inline-block;
    flex-shrink: 0;
    object-fit: contain;
    vertical-align: middle;
    line-height: 0;
  }

  .user-badge--xs {
    width: 0.85rem;
    height: 0.85rem;
  }

  .user-badge--sm {
    width: 1rem;
    height: 1rem;
  }

  .user-badge--md {
    width: 1.35rem;
    height: 1.35rem;
  }

  .user-badge--lg {
    width: 2.4rem;
    height: 2.4rem;
  }

  .user-badge--lottie {
    overflow: hidden;
  }

  .user-badge--lottie :global(svg) {
    display: block;
    width: 100%;
    height: 100%;
  }
</style>
