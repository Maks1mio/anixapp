<script lang="ts">
  import { untrack } from 'svelte';
  import {
    toCdnProxyUrl,
    toPosterDisplayUrl,
    fromCdnProxyUrl,
    type PosterThumbPreset,
  } from '../utils/posterUrl';

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

  let loaded = $state(false);
  let failed = $state(false);
  let imgSrc = $state('');
  let retryTimer = $state<ReturnType<typeof setTimeout> | null>(null);

  function proxiedSrc(raw: string, preferMirror: boolean): string {
    const trimmed = raw.trim();
    if (!trimmed) return '';
    const https = fromCdnProxyUrl(trimmed);
    const target = preferMirror ? (buildCdnMirrorHttps(https) || https) : https;
    if (thumb) return toPosterDisplayUrl(target, thumb);
    return toCdnProxyUrl(target);
  }

  /** Только HTTPS зеркала (без повторного anix-cdn), чтобы не плодить mirror-mirror-*. */
  function buildCdnMirrorHttps(url: string): string {
    const source = fromCdnProxyUrl(url?.trim() ?? '');
    if (!source) return '';
    try {
      const parsed = new URL(source.startsWith('http') ? source : `https://${source}`);
      const host = parsed.hostname.replace(/^www\./, '');
      if (host.startsWith('mirror-') || host.startsWith('mirror.')) return parsed.toString();
      const parts = host.split('.');
      parsed.hostname = parts.length > 2
        ? `mirror-${parts[0]}.${parts.slice(1).join('.')}`
        : `mirror.${host}`;
      return parsed.toString();
    } catch {
      return '';
    }
  }

  const normalizedSrc = $derived(proxiedSrc(src ?? '', false));
  const mirrorSrc = $derived(proxiedSrc(src ?? '', true));
  const showImage = $derived(Boolean(normalizedSrc) && Boolean(imgSrc));
  const showFallback = $derived(!normalizedSrc || (failed && !loaded));

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
      hostIdx = 0;
      round = 0;
      loaded = false;
      failed = false;
      imgSrc = candidates[0] || next;
      clearLoadTimer();
      if (next) armLoadTimer();
    });
  });

  $effect(() => {
    return () => clearRetryTimer();
  });

  /** Кандидаты хостов: основной → зеркало → оригинал (без переписывания в mirror). */
  const candidates = $derived.by(() => {
    const raw = fromCdnProxyUrl((src ?? '').trim());
    let direct = '';
    try {
      const u = new URL(raw);
      if (/^mirror-/.test(u.hostname) && /^mirror-s\./.test(u.hostname)) {
        u.hostname = u.hostname.replace(/^mirror-/, '');
        direct = u.toString();
      }
    } catch {
      /* ignore */
    }
    // Оригинал надёжнее зеркала: даём ему две попытки, зеркало — последним.
    // Только вне Electron: там anix-cdn:// добавляет нужный Referer, а прямой s.* без него отдаёт заглушку.
    const isElectron = typeof window !== 'undefined' && !!(window as unknown as { electron?: unknown }).electron;
    if (direct && !isElectron) return [direct, direct, normalizedSrc, mirrorSrc].filter(Boolean);
    const list = [normalizedSrc, mirrorSrc, raw].filter(Boolean);
    return list.filter((u, i) => list.indexOf(u) === i);
  });

  /** Если картинка не пришла за это время — считаем хост зависшим и идём дальше. */
  const LOAD_TIMEOUT_MS = 8000;
  const ROUND_DELAY_MS = [1500, 5000, 15000, 30000];
  let hostIdx = 0;
  let round = 0;
  let loadTimer: ReturnType<typeof setTimeout> | null = null;

  function clearLoadTimer() {
    if (loadTimer != null) {
      clearTimeout(loadTimer);
      loadTimer = null;
    }
  }

  function handleLoad() {
    clearLoadTimer();
    loaded = true;
    failed = false;
  }

  function withBust(baseUrl: string, n: number): string {
    try {
      const parsed = new URL(baseUrl, 'anix-cdn://asset/');
      parsed.searchParams.set('_retry', String(n));
      parsed.searchParams.set('_t', String(Date.now()));
      return parsed.toString();
    } catch {
      const sep = baseUrl.includes('?') ? '&' : '?';
      return `${baseUrl}${sep}_retry=${n}&_t=${Date.now()}`;
    }
  }

  function armLoadTimer() {
    clearLoadTimer();
    loadTimer = setTimeout(() => {
      loadTimer = null;
      if (!loaded) handleError();
    }, LOAD_TIMEOUT_MS);
  }

  function tryCandidate(delay: number) {
    clearRetryTimer();
    const list = candidates;
    if (!list.length) {
      failed = true;
      return;
    }
    retryTimer = setTimeout(() => {
      retryTimer = null;
      const base = list[hostIdx % list.length];
      imgSrc = round === 0 && hostIdx === 0 ? base : withBust(base, round * 10 + hostIdx);
      armLoadTimer();
    }, delay);
  }

  function handleError() {
    loaded = false;
    clearLoadTimer();
    const list = candidates;
    if (!list.length) {
      failed = true;
      return;
    }
    hostIdx += 1;
    if (hostIdx >= list.length) {
      // Прошли все хосты — следующий круг с растущей паузой. Заглушка видна, но попытки продолжаются.
      hostIdx = 0;
      round += 1;
      failed = true;
      const delay = ROUND_DELAY_MS[Math.min(round - 1, ROUND_DELAY_MS.length - 1)];
      tryCandidate(delay);
      return;
    }
    tryCandidate(150);
  }

  /** Сеть вернулась / приложение снова на экране — повторяем сразу, если картинка так и не загрузилась. */
  function kick() {
    if (loaded || !normalizedSrc) return;
    hostIdx = 0;
    tryCandidate(0);
  }

  $effect(() => {
    const onOnline = () => kick();
    const onVisible = () => {
      if (document.visibilityState === 'visible') kick();
    };
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVisible);
      clearLoadTimer();
    };
  });
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
    style:display={failed && !loaded ? 'none' : null}
  />
{/if}
{#if showFallback}
  <span class="poster-image__fallback {className}" aria-hidden="true"></span>
{/if}
