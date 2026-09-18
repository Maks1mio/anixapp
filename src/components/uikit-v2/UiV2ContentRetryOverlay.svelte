<script lang="ts">
  import { untrack } from 'svelte';
  import {
    describeContentLoadError,
    type ContentLoadTone,
  } from '../../utils/content-load-error';

  export type UiV2ContentRetryTone = ContentLoadTone;

  type Props = {
    message?: string;
    headline?: string;
    tone?: UiV2ContentRetryTone;
    retryable?: boolean;
    /** Без полноэкранной высоты — для песочницы UI Kit */
    compact?: boolean;
    class?: string;
    onRetry?: () => void | Promise<void>;
  };

  let {
    message = '',
    headline,
    tone,
    retryable,
    compact = false,
    class: className = '',
    onRetry,
  }: Props = $props();

  const info = $derived(describeContentLoadError(message || 'Не удалось загрузить'));
  const resolvedTone = $derived(tone ?? info.tone);
  const canRetry = $derived(retryable ?? info.retryable);
  const resolvedHeadline = $derived(
    headline || info.headline || 'Ошибка: не удалось загрузить',
  );

  const RETRY_DELAYS_MS = [1800, 3200, 5000, 8000, 12000];

  $effect(() => {
    if (!canRetry) return;

    let cancelled = false;
    let inFlight = false;
    let attempt = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const schedule = (delay: number) => {
      timer = setTimeout(() => {
        void tick();
      }, delay);
    };

    const tick = async () => {
      if (cancelled) return;
      const retry = untrack(() => onRetry);
      if (!retry) return;
      if (inFlight) {
        schedule(600);
        return;
      }
      inFlight = true;
      try {
        await retry();
      } catch {
        /* overlay stays until parent hides it */
      } finally {
        inFlight = false;
        if (!cancelled) {
          const delay = RETRY_DELAYS_MS[Math.min(attempt, RETRY_DELAYS_MS.length - 1)];
          attempt += 1;
          schedule(delay);
        }
      }
    };

    schedule(RETRY_DELAYS_MS[0]);

    return () => {
      cancelled = true;
      if (timer != null) clearTimeout(timer);
    };
  });
</script>

<div
  class="uiv2-content-retry {className}"
  class:uiv2-content-retry--compact={compact}
  class:uiv2-content-retry--warn={resolvedTone === 'warn'}
  class:uiv2-content-retry--danger={resolvedTone === 'danger'}
  role="status"
  aria-live="polite"
  aria-busy={canRetry}
>
  <div class="uiv2-content-retry__badge">
    <div class="uiv2-content-retry__knob" aria-hidden="true">
      {#if canRetry}
        <span class="uiv2-content-retry__spinner"></span>
      {:else}
        <span class="uiv2-content-retry__ring"></span>
      {/if}
    </div>
    <p class="uiv2-content-retry__text">{resolvedHeadline}</p>
  </div>
  {#if canRetry}
    <span class="uiv2-content-retry__sr">Повторная попытка загрузки</span>
  {/if}
</div>
