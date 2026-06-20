<script lang="ts">
  import { toCdnProxyUrl } from '../utils/posterUrl';

  const MAX_RETRIES = 2;
  const RETRY_MS = [1200, 3000];

  interface Props {
    src?: string | null;
    label?: string;
    class?: string;
  }

  let { src = '', label = '?', class: className = '' }: Props = $props();

  let attempt = $state(0);
  let loaded = $state(false);
  let failed = $state(false);
  let imgSrc = $state('');
  let retryTimer = $state<ReturnType<typeof setTimeout> | null>(null);
  let imgEl = $state<HTMLImageElement | null>(null);

  const normalizedSrc = $derived(toCdnProxyUrl(src?.trim() ?? ''));
  const fallbackLetter = $derived((label || '?').charAt(0).toUpperCase() || '?');
  const showImage = $derived(Boolean(normalizedSrc) && !failed);
  const showSkeleton = $derived(showImage && !loaded);
  const showFallback = $derived(!normalizedSrc || failed);

  function clearRetryTimer() {
    if (retryTimer != null) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
  }

  function resetForSrc(nextSrc: string) {
    clearRetryTimer();
    attempt = 0;
    loaded = false;
    failed = false;
    imgSrc = nextSrc;
  }

  $effect(() => {
    resetForSrc(normalizedSrc);
    return () => clearRetryTimer();
  });

  $effect(() => {
    imgSrc;
    const img = imgEl;
    if (!img || !imgSrc) return;
    if (img.complete && img.naturalWidth > 0) {
      loaded = true;
    }
  });

  function handleLoad() {
    loaded = true;
  }

  function handleError() {
    loaded = false;
    if (attempt >= MAX_RETRIES) {
      failed = true;
      return;
    }

    const delay = RETRY_MS[attempt] ?? 5000;
    const base = normalizedSrc;
    const nextAttempt = attempt + 1;
    attempt = nextAttempt;

    clearRetryTimer();
    retryTimer = setTimeout(() => {
      retryTimer = null;
      if (normalizedSrc !== base) return;
      const sep = base.includes('?') ? '&' : '?';
      imgSrc = `${base}${sep}_retry=${nextAttempt}&_t=${Date.now()}`;
    }, delay);
  }
</script>

<span class="user-avatar {className}">
  {#if showSkeleton}
    <span class="user-avatar__skeleton" aria-hidden="true"></span>
  {/if}

  {#if showImage}
    <img
      bind:this={imgEl}
      class:user-avatar__img--loaded={loaded}
      src={imgSrc}
      alt=""
      loading="lazy"
      decoding="async"
      onload={handleLoad}
      onerror={handleError}
    />
  {/if}

  {#if showFallback}
    <span class="user-avatar__fallback">{fallbackLetter}</span>
  {/if}
</span>
