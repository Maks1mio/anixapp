<script lang="ts">
  /**
   * Анимированная версия картинки (Anixart 11+: poster_animation, avatar_animation,
   * cover_animation…): короткое видео без звука по кругу поверх статичного изображения,
   * как LoopVideoView в Android. Пока видео не готово или не загрузилось, видна картинка.
   */
  import { resolveCdnAssetUrl } from '../utils/posterUrl';

  interface Props {
    src?: string | null;
    class?: string;
    /** Видео впервые готово к показу (длительность уже известна) */
    onReady?: (video: HTMLVideoElement) => void;
  }

  let { src, class: className = '', onReady }: Props = $props();

  const reducedMotion = typeof window !== 'undefined'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const raw = $derived(typeof src === 'string' ? src.trim() : '');
  const proxied = $derived(raw ? resolveCdnAssetUrl(raw) : '');
  /** Прокси CDN может не отдать видео — тогда пробуем прямую ссылку, потом сдаёмся. */
  let attempt = $state(0);
  let ready = $state(false);

  $effect(() => {
    void raw;
    attempt = 0;
    ready = false;
  });

  const videoSrc = $derived.by(() => {
    if (!raw || reducedMotion) return '';
    if (attempt === 0) return proxied || raw;
    if (attempt === 1 && proxied && proxied !== raw && /^https?:\/\//.test(raw)) return raw;
    return '';
  });

  function onCanPlay(e: Event) {
    if (ready) return;
    ready = true;
    onReady?.(e.currentTarget as HTMLVideoElement);
  }

  function onError() {
    ready = false;
    attempt += 1;
  }
</script>

{#if videoSrc}
  <video
    class="animated-media {className}"
    class:animated-media--ready={ready}
    src={videoSrc}
    autoplay
    muted
    loop
    playsinline
    disablepictureinpicture
    preload="auto"
    aria-hidden="true"
    tabindex="-1"
    oncanplay={onCanPlay}
    onerror={onError}
  ></video>
{/if}

<style>
  .animated-media {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: inherit;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.3s ease;
  }

  .animated-media--ready {
    opacity: 1;
  }
</style>
