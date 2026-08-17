<script lang="ts">
  import { untrack } from 'svelte';
  import {
    toCdnProxyUrl,
    toPosterDisplayUrl,
    buildCdnMirrorUrl,
    fromCdnProxyUrl,
    type PosterThumbPreset,
  } from '../utils/posterUrl';

  const MAX_RETRIES = 2;
  const RETRY_MS = [800, 2000];

  interface Props {
    src?: string | null;
    alt?: string;
    class?: string;
    loading?: 'lazy' | 'eager';
    /** Если задан — Electron отдаёт физически уменьшенный постер под область */
    thumb?: PosterThumbPreset | null;
  }

  let {
    src = '',
    alt = '',
    class: className = '',
    loading = 'lazy',
    thumb = null,
  }: Props = $props();

  let attempt = $state(0);
  let useMirror = $state(false);
  let loaded = $state(false);
  let failed = $state(false);
  let imgSrc = $state('');
  let retryTimer = $state<ReturnType<typeof setTimeout> | null>(null);

  const normalizedSrc = $derived(
    thumb
      ? toPosterDisplayUrl(src?.trim() ?? '', thumb)
      : toCdnProxyUrl(src?.trim() ?? ''),
  );
  const mirrorSrc = $derived(buildCdnMirrorUrl(fromCdnProxyUrl(src?.trim() ?? '')));
  const showImage = $derived(Boolean(normalizedSrc) && !failed && Boolean(imgSrc));
  const showFallback = $derived(!normalizedSrc || failed);

  function clearRetryTimer() {
    if (retryTimer != null) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
  }

  $effect(() => {
    const next = normalizedSrc;
    untrack(() => {
      clearRetryTimer();
      attempt = 0;
      useMirror = false;
      loaded = false;
      failed = false;
      imgSrc = next;
    });
  });

  $effect(() => {
    return () => clearRetryTimer();
  });

  function handleLoad() {
    loaded = true;
  }

  function scheduleRetry(baseUrl: string, nextAttempt: number) {
    const delay = RETRY_MS[nextAttempt - 1] ?? 3000;
    const cleanBase = baseUrl.split('?')[0];
    clearRetryTimer();
    retryTimer = setTimeout(() => {
      retryTimer = null;
      if (!normalizedSrc) return;
      imgSrc = `${cleanBase}?_retry=${nextAttempt}&_t=${Date.now()}`;
    }, delay);
  }

  function handleError() {
    loaded = false;

    const base = useMirror ? mirrorSrc : normalizedSrc;
    if (!base) {
      failed = true;
      return;
    }

    if (attempt < MAX_RETRIES) {
      const nextAttempt = attempt + 1;
      attempt = nextAttempt;
      scheduleRetry(base, nextAttempt);
      return;
    }

    if (!useMirror && mirrorSrc && mirrorSrc !== normalizedSrc) {
      useMirror = true;
      attempt = 0;
      imgSrc = mirrorSrc;
      return;
    }

    failed = true;
  }
</script>

{#if showImage}
  <img
    class={className}
    class:poster-image--loaded={loaded}
    src={imgSrc}
    {alt}
    {loading}
    decoding="async"
    onload={handleLoad}
    onerror={handleError}
  />
{:else if showFallback}
  <span class="poster-image__fallback {className}" aria-hidden="true"></span>
{/if}
