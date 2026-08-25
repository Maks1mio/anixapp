<script lang="ts">
  import { onDestroy } from 'svelte';
  import { isHlsUrl } from '../_utils';
  import { detachHls, swapMediaSource } from '../core/hls-engine';

  interface Props {
    visible: boolean;
    url: string;
    nextEp: number;
    /** 0–100, заливка как на зелёной кнопке пропуска */
    countdownPct?: number;
    mediaReady?: boolean;
    /** Интерфейс плеера виден — плашка выше контролов */
    chromeUp?: boolean;
    bufferAt?: number;
    playAt?: number;
    onready?: () => void;
    onselect?: () => void;
  }

  let {
    visible = false,
    url = '',
    nextEp,
    countdownPct = 0,
    mediaReady = false,
    chromeUp = true,
    bufferAt = 6 * 60,
    playAt = 6 * 60 + 20,
    onready,
    onselect,
  }: Props = $props();

  let videoEl = $state<HTMLVideoElement | null>(null);
  let loadGen = 0;
  let armedUrl = '';
  let readyTimer: ReturnType<typeof setTimeout> | null = null;

  const fillPct = $derived(Math.min(100, Math.max(0, countdownPct)));

  function clearReadyTimer() {
    if (readyTimer) {
      clearTimeout(readyTimer);
      readyTimer = null;
    }
  }

  function tearDown() {
    clearReadyTimer();
    const v = videoEl;
    if (!v) return;
    try { v.pause(); } catch { /* ignore */ }
    detachHls(v);
    try { v.removeAttribute('src'); v.load(); } catch { /* ignore */ }
  }

  function seekWhenReady(v: HTMLVideoElement, t: number) {
    const apply = () => {
      try {
        if (Number.isFinite(v.duration) && v.duration > 0) {
          v.currentTime = Math.min(t, Math.max(0, v.duration - 1));
        } else {
          v.currentTime = t;
        }
      } catch { /* ignore */ }
    };
    if (v.readyState >= 1) apply();
    else v.addEventListener('loadedmetadata', apply, { once: true });
  }

  $effect(() => {
    const src = url;
    const v = videoEl;
    if (!src || !v) return;
    if (src === armedUrl) return;
    armedUrl = src;
    const gen = ++loadGen;
    clearReadyTimer();

    v.muted = true;
    v.defaultMuted = true;
    v.volume = 0;
    v.playsInline = true;

    const markReady = () => {
      if (gen !== loadGen) return;
      clearReadyTimer();
      seekWhenReady(v, bufferAt);
      try { v.pause(); } catch { /* ignore */ }
      onready?.();
    };

    readyTimer = setTimeout(() => {
      if (gen !== loadGen) return;
      onready?.();
    }, 8000);

    if (isHlsUrl(src)) {
      const result = swapMediaSource(v, src, { forceNew: true, onReady: markReady });
      if (!result.isHls) {
        const onCan = () => {
          v.removeEventListener('canplay', onCan);
          markReady();
        };
        v.addEventListener('canplay', onCan);
      }
    } else {
      detachHls(v);
      v.src = src;
      const onCan = () => {
        v.removeEventListener('canplay', onCan);
        markReady();
      };
      v.addEventListener('canplay', onCan);
      v.load();
    }
  });

  $effect(() => {
    const v = videoEl;
    if (!v || !url) return;
    if (visible) {
      seekWhenReady(v, playAt);
      v.muted = true;
      void v.play().catch(() => {});
    } else {
      try { v.pause(); } catch { /* ignore */ }
      if (armedUrl) seekWhenReady(v, bufferAt);
    }
  });

  onDestroy(() => {
    loadGen++;
    tearDown();
  });
</script>

{#if url || visible}
  <div
    class="next-ep-preview"
    class:next-ep-preview--visible={visible}
    aria-hidden={!visible}
  >
    <button
      type="button"
      class="next-ep-preview__card"
      class:next-ep-preview__card--shown={visible}
      class:next-ep-preview__card--chrome-up={visible && chromeUp}
      class:next-ep-preview__card--chrome-down={visible && !chromeUp}
      disabled={!visible}
      tabindex={visible ? 0 : -1}
      onclick={(e) => {
        e.stopPropagation();
        onselect?.();
      }}
      onpointerdown={(e) => e.stopPropagation()}
      aria-label={`Следующая ${nextEp} серия`}
    >
      {#if url}
        <video
          bind:this={videoEl}
          class="next-ep-preview__video"
          class:next-ep-preview__video--ready={mediaReady}
          muted
          playsinline
          preload="auto"
          disablepictureinpicture
        ></video>
      {/if}
      {#if visible}
        <div class="next-ep-preview__scrim" aria-hidden="true"></div>
        <div
          class="next-ep-preview__cta"
          style:--cta-pct="{fillPct}"
          aria-hidden="true"
        >
          <span class="next-ep-preview__cta-fill"></span>
          <span class="next-ep-preview__cta-label">
            Следующая {nextEp} серия
            <span class="next-ep-preview__arrow">→</span>
          </span>
        </div>
      {/if}
    </button>
  </div>
{/if}

<style>
  .next-ep-preview {
    position: absolute;
    inset: 0;
    z-index: 12;
    pointer-events: none;
  }

  .next-ep-preview__card {
    --card-ease: cubic-bezier(0.22, 1, 0.36, 1);
    position: absolute;
    right: clamp(1rem, 3vw, 1.75rem);
    left: auto;
    bottom: clamp(1.15rem, 3.2vh, 2rem);
    width: min(42vw, 24rem);
    aspect-ratio: 16 / 9;
    max-height: min(28vh, 14.5rem);
    margin: 0;
    padding: 0;
    border: 0;
    border-radius: 1.35rem;
    overflow: hidden;
    cursor: pointer;
    background: #141414;
    opacity: 0;
    transform: translate3d(0, 14px, 0) scale(0.94);
    pointer-events: none;
    box-shadow: none;
    will-change: transform, bottom, opacity, box-shadow;
    transition:
      opacity 0.42s var(--card-ease),
      transform 0.55s var(--card-ease),
      bottom 0.55s var(--card-ease),
      box-shadow 0.4s ease,
      filter 0.35s ease;
  }

  .next-ep-preview__card--shown {
    opacity: 1;
    transform: translate3d(0, 0, 0) scale(1);
    pointer-events: auto;
    box-shadow:
      0 0 0 1px color-mix(in srgb, #fff 12%, transparent),
      0 16px 40px color-mix(in srgb, #000 50%, transparent);
  }

  .next-ep-preview__card--chrome-down {
    bottom: clamp(1.15rem, 3.2vh, 2rem);
  }

  .next-ep-preview__card--chrome-up {
    bottom: clamp(6.75rem, 15vh, 10rem);
  }

  .next-ep-preview__card--shown:hover {
    transform: translate3d(0, -7px, 0) scale(1.045);
    box-shadow:
      0 0 0 1px color-mix(in srgb, #fff 18%, transparent),
      0 22px 48px color-mix(in srgb, #000 55%, transparent),
      0 0 28px color-mix(in srgb, #66c942 18%, transparent);
    filter: brightness(1.04);
  }

  .next-ep-preview__card--shown:hover .next-ep-preview__cta {
    transform: translateY(-1px) scale(1.03);
    box-shadow:
      0 2px 10px color-mix(in srgb, #000 40%, transparent),
      0 0 16px color-mix(in srgb, #66c942 28%, transparent);
  }

  .next-ep-preview__card--shown:hover .next-ep-preview__video--ready {
    transform: scale(1.04);
  }

  .next-ep-preview__card--shown:active {
    transform: translate3d(0, -3px, 0) scale(1.02);
    transition-duration: 0.18s;
  }

  .next-ep-preview__card:not(.next-ep-preview__card--shown) {
    position: fixed;
    left: -9999px;
    right: auto;
    top: 0;
    bottom: auto;
    width: 160px;
    height: 90px;
    max-height: none;
    opacity: 0;
    transform: none;
    will-change: auto;
  }

  .next-ep-preview__card:focus-visible {
    outline: 2px solid color-mix(in srgb, #fff 70%, transparent);
    outline-offset: 3px;
  }

  .next-ep-preview__video {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    background: #000;
    opacity: 0;
    transform: scale(1);
    transition:
      opacity 0.35s ease,
      transform 0.55s cubic-bezier(0.22, 1, 0.36, 1);
  }

  .next-ep-preview__video--ready {
    opacity: 1;
  }

  .next-ep-preview__scrim {
    position: absolute;
    inset: 0;
    background: linear-gradient(
      180deg,
      transparent 48%,
      color-mix(in srgb, #000 50%, transparent) 78%,
      color-mix(in srgb, #000 68%, transparent) 100%
    );
    pointer-events: none;
    animation: next-ep-fade-in 0.35s ease both;
  }

  .next-ep-preview__cta {
    position: absolute;
    right: 0.7rem;
    bottom: 0.65rem;
    isolation: isolate;
    overflow: hidden;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 2.1rem;
    padding: 0 0.95rem;
    border-radius: 999px;
    background: color-mix(in srgb, #66c942 42%, transparent);
    color: #fff;
    font-size: clamp(0.78rem, 1.5vw, 0.9rem);
    font-weight: 650;
    letter-spacing: -0.01em;
    box-shadow: 0 1px 4px color-mix(in srgb, #000 35%, transparent);
    transform: translateY(0) scale(1);
    transition:
      transform 0.45s cubic-bezier(0.22, 1, 0.36, 1),
      box-shadow 0.35s ease;
    animation: next-ep-fade-in 0.4s ease 0.08s both;
  }

  /* Мягкий край прогресса вместо жёсткой линии */
  .next-ep-preview__cta-fill {
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 0;
    background: linear-gradient(
      90deg,
      #4fa82e 0%,
      #66c942 max(0%, calc(var(--cta-pct) * 1% - 22px)),
      color-mix(in srgb, #66c942 72%, #9be07a) calc(var(--cta-pct) * 1%),
      color-mix(in srgb, #66c942 28%, transparent) calc(var(--cta-pct) * 1% + 18px),
      transparent calc(var(--cta-pct) * 1% + 36px)
    );
    transition: background 0.12s linear;
  }

  .next-ep-preview__cta-label {
    position: relative;
    z-index: 1;
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    white-space: nowrap;
    text-shadow: 0 1px 6px color-mix(in srgb, #000 40%, transparent);
  }

  .next-ep-preview__arrow {
    font-size: 1.1em;
    line-height: 1;
    transition: transform 0.4s cubic-bezier(0.22, 1, 0.36, 1);
  }

  .next-ep-preview__card--shown:hover .next-ep-preview__arrow {
    transform: translateX(3px);
  }

  @keyframes next-ep-fade-in {
    from { opacity: 0; transform: translateY(4px); }
    to { opacity: 1; transform: translateY(0); }
  }

  @media (max-width: 720px) {
    .next-ep-preview__card--shown,
    .next-ep-preview__card {
      width: min(78vw, 20rem);
      right: 0.75rem;
      border-radius: 1.1rem;
    }

    .next-ep-preview__card--chrome-up {
      bottom: clamp(7.25rem, 17vh, 10.5rem);
    }

    .next-ep-preview__card--chrome-down {
      bottom: clamp(1rem, 2.8vh, 1.75rem);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .next-ep-preview__card,
    .next-ep-preview__cta,
    .next-ep-preview__video,
    .next-ep-preview__arrow {
      transition-duration: 0.01ms !important;
    }
  }
</style>
