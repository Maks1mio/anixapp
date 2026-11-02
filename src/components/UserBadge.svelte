<script lang="ts">
  import { onDestroy } from 'svelte';
  import { fetchCdnJson, toCdnProxyUrl } from '../utils/posterUrl';
  import { badgeNameByUrl, isLottieBadgeUrl, loadProfileBadgeName, rememberBadgeName } from '../utils/badge';
  import BadgeTip from './BadgeTip.svelte';

  type Size = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

  type Props = {
    url?: string | null;
    name?: string | null;
    size?: Size;
    class?: string;
    /** Подсказка с крупным превью и названием при наведении (по умолчанию да). */
    showTooltip?: boolean;
    /** Владелец значка: если API не прислал имя, подтянем его из профиля при наведении. */
    profileId?: number | null;
  };

  let {
    url = null,
    name = null,
    size = 'sm',
    class: className = '',
    showTooltip = true,
    profileId = null,
  }: Props = $props();

  let lottieEl = $state<HTMLElement | undefined>();
  let anim: { destroy?: () => void } | null = null;

  const src = $derived(url?.trim() ? url.trim() : '');
  const isLottie = $derived(!!src && isLottieBadgeUrl(src));
  // API often omits the name (comments, feed): fall back to a name seen with the same image.
  let loadedName = $state('');
  const resolvedName = $derived(name?.trim() || loadedName || badgeNameByUrl(src) || (src ? 'Значок Anixart' : ''));
  const title = $derived(showTooltip ? resolvedName : '');

  $effect(() => {
    void src;
    loadedName = '';
  });

  function onHover() {
    if (!src || name?.trim() || loadedName || badgeNameByUrl(src)) return;
    const id = Number(profileId ?? 0);
    if (!(id > 0)) return;
    const forSrc = src;
    void loadProfileBadgeName(id, forSrc).then((n) => {
      if (n && forSrc === src) loadedName = n;
    });
  }

  $effect(() => {
    if (src && name?.trim()) rememberBadgeName(src, name);
  });

  function destroyAnim() {
    if (anim?.destroy) anim.destroy();
    anim = null;
  }

  async function loadLottie(badgeUrl: string, target: HTMLElement) {
    try {
      const json = await fetchCdnJson(badgeUrl);
      if (!json || typeof json !== 'object') return;
      const mod: any = await import('lottie-web/build/player/lottie_light');
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

{#snippet badgeEl()}
  {#if isLottie}
    <span
      class="user-badge user-badge--{size} user-badge--lottie {className}"
      aria-label={resolvedName || 'Значок'}
      bind:this={lottieEl}
    ></span>
  {:else}
    <img
      class="user-badge user-badge--{size} {className}"
      src={toCdnProxyUrl(src)}
      alt={resolvedName || ''}
      loading="lazy"
      decoding="async"
    />
  {/if}
{/snippet}

{#if src}
  {#if title}
    <BadgeTip name={resolvedName} url={src} onhover={onHover}>{@render badgeEl()}</BadgeTip>
  {:else}
    {@render badgeEl()}
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

  .user-badge--xl {
    width: 4.5rem;
    height: 4.5rem;
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
