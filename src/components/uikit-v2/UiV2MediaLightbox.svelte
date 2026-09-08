<script lang="ts">
  import { onMount } from 'svelte';
  import {
    closeFeedMediaLightbox,
    feedMediaLightbox,
    stepFeedMediaLightbox,
  } from '../../utils/feed-media-lightbox';
  import { toCdnProxyUrl, unwrapCdnUrl } from '../../utils/posterUrl';
  import { showToast } from '../../stores/toast';
  import { iconChevronLeft, iconChevronRight, iconCopy, iconDownload, iconX } from '../icons';

  const state = $derived($feedMediaLightbox);
  const item = $derived(state?.items[state.index] ?? null);
  const total = $derived(state?.items.length ?? 0);
  const canNav = $derived(total > 1);

  let overlayEl = $state<HTMLDivElement | null>(null);
  let stageEl = $state<HTMLElement | null>(null);
  let pointerStartX = $state<number | null>(null);
  let closing = $state(false);
  let openedKey = $state('');
  let downloadBusy = $state(false);
  let copyBusy = $state(false);

  function currentKey(next: typeof state): string {
    if (!next) return '';
    return `${next.items.map((i) => i.url).join('|')}#${next.origin?.left ?? ''}`;
  }

  function prefersReducedMotion(): boolean {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function shareableUrl(url: string): string {
    return unwrapCdnUrl(url) || url;
  }

  function fileNameFromUrl(url: string, mime = ''): string {
    const fallbackExt =
      mime.includes('gif') ? 'gif'
      : mime.includes('webp') ? 'webp'
      : mime.includes('png') ? 'png'
      : mime.includes('mp4') ? 'mp4'
      : mime.includes('webm') ? 'webm'
      : 'jpg';
    try {
      const path = new URL(shareableUrl(url), window.location.origin).pathname;
      const base = decodeURIComponent(path.split('/').pop() || 'image');
      if (/\.[a-z0-9]{2,5}$/i.test(base)) return base;
      return `${base || 'image'}.${fallbackExt}`;
    } catch {
      return `image.${fallbackExt}`;
    }
  }

  type OriginRect = {
    left: number;
    top: number;
    width: number;
    height: number;
    borderRadius?: string;
  };

  function mediaEl(stage: HTMLElement): HTMLElement | null {
    return stage.querySelector('img, video');
  }

  /** Фиксируем рамку и включаем cover — кадр обрезает, картинка не сплющивается. */
  function lockStageFrame(stage: HTMLElement, rect: DOMRect) {
    stage.style.position = 'fixed';
    stage.style.left = `${rect.left}px`;
    stage.style.top = `${rect.top}px`;
    stage.style.width = `${rect.width}px`;
    stage.style.height = `${rect.height}px`;
    stage.style.maxWidth = 'none';
    stage.style.maxHeight = 'none';
    stage.style.margin = '0';
    stage.style.zIndex = '3';
    const media = mediaEl(stage);
    if (media) {
      media.style.width = '100%';
      media.style.height = '100%';
      media.style.maxWidth = 'none';
      media.style.maxHeight = 'none';
      media.style.objectFit = 'cover';
    }
  }

  function frameKeyframes(from: OriginRect, to: OriginRect, fromOpacity: number, toOpacity: number) {
    return [
      {
        left: `${from.left}px`,
        top: `${from.top}px`,
        width: `${from.width}px`,
        height: `${from.height}px`,
        opacity: fromOpacity,
        borderRadius: from.borderRadius ?? '12px',
      },
      {
        left: `${to.left}px`,
        top: `${to.top}px`,
        width: `${to.width}px`,
        height: `${to.height}px`,
        opacity: toOpacity,
        borderRadius: to.borderRadius ?? '12px',
      },
    ];
  }

  function playOpen(origin: OriginRect) {
    const el = stageEl;
    if (!el || prefersReducedMotion()) return;
    const last = el.getBoundingClientRect();
    if (last.width < 4 || last.height < 4) return;
    lockStageFrame(el, last);
    const openTo: OriginRect = {
      left: last.left,
      top: last.top,
      width: last.width,
      height: last.height,
      borderRadius: '12px',
    };
    const anim = el.animate(frameKeyframes(origin, openTo, 0.92, 1), {
      duration: 340,
      easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
      fill: 'forwards',
    });
    void anim.finished
      .then(() => {
        el.style.cssText = '';
        const media = mediaEl(el);
        if (media) media.style.cssText = '';
      })
      .catch(() => {
        /* cancelled */
      });
  }

  async function closeWithMotion() {
    if (closing || !state) return;
    closing = true;
    const el = stageEl;
    const origin = state.origin;
    if (el && origin && !prefersReducedMotion()) {
      const last = el.getBoundingClientRect();
      lockStageFrame(el, last);
      const from: OriginRect = {
        left: last.left,
        top: last.top,
        width: last.width,
        height: last.height,
        borderRadius: '12px',
      };
      try {
        await el.animate(frameKeyframes(from, origin, 1, 0.45), {
          duration: 260,
          easing: 'cubic-bezier(0.4, 0, 1, 1)',
          fill: 'forwards',
        }).finished;
      } catch {
        /* ignore cancelled animation */
      }
    }
    closeFeedMediaLightbox();
    closing = false;
    openedKey = '';
  }

  function triggerBlobDownload(blob: Blob, name: string) {
    const href = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = href;
    a.download = name;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(href), 1500);
  }

  async function downloadCurrent() {
    if (!item || downloadBusy) return;
    downloadBusy = true;
    try {
      const fetchUrl = toCdnProxyUrl(item.url) || item.url;
      const res = await fetch(fetchUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      triggerBlobDownload(blob, fileNameFromUrl(item.url, blob.type));
      showToast('Файл сохранён');
    } catch {
      try {
        const a = document.createElement('a');
        a.href = item.url;
        a.download = fileNameFromUrl(item.url);
        a.rel = 'noopener';
        a.target = '_blank';
        document.body.appendChild(a);
        a.click();
        a.remove();
        showToast('Открываю файл для сохранения');
      } catch {
        showToast('Не удалось скачать', 'err');
      }
    } finally {
      downloadBusy = false;
    }
  }

  async function copyCurrentLink() {
    if (!item || copyBusy) return;
    copyBusy = true;
    try {
      await navigator.clipboard.writeText(shareableUrl(item.url));
      showToast('Ссылка скопирована');
    } catch {
      showToast('Не удалось скопировать ссылку', 'err');
    } finally {
      copyBusy = false;
    }
  }

  function onKey(e: KeyboardEvent) {
    if (!state) return;
    if (e.key === 'Escape' || e.key === 'Back' || e.key === 'BrowserBack') {
      e.preventDefault();
      e.stopImmediatePropagation();
      void closeWithMotion();
      return;
    }
    if (!canNav) return;
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      stepFeedMediaLightbox(-1);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      stepFeedMediaLightbox(1);
    }
  }

  function onPointerDown(e: PointerEvent) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    pointerStartX = e.clientX;
  }

  function onPointerUp(e: PointerEvent) {
    if (pointerStartX == null) return;
    const dx = e.clientX - pointerStartX;
    pointerStartX = null;
    if (!canNav || Math.abs(dx) < 56) return;
    stepFeedMediaLightbox(dx > 0 ? -1 : 1);
  }

  $effect(() => {
    const next = state;
    if (!next || closing) return;
    const key = currentKey(next);
    if (openedKey === key) return;
    openedKey = key;
    const origin = next.origin;
    queueMicrotask(() => {
      if (origin) playOpen(origin);
      overlayEl?.focus();
    });
  });

  onMount(() => {
    return () => {
      document.body.style.overflow = '';
    };
  });
</script>

<svelte:window onkeydowncapture={onKey} />

{#if state && item}
  <div
    bind:this={overlayEl}
    class="uiv2-media-lightbox"
    class:uiv2-media-lightbox--closing={closing}
    role="dialog"
    aria-modal="true"
    aria-label="Просмотр изображения"
    tabindex="-1"
  >
    <button
      type="button"
      class="uiv2-media-lightbox__backdrop"
      aria-label="Закрыть предпросмотр"
      onclick={() => void closeWithMotion()}
    ></button>

    <div class="uiv2-media-lightbox__toolbar">
      <button
        type="button"
        class="uiv2-media-lightbox__tool"
        aria-label="Скачать"
        title="Скачать"
        disabled={downloadBusy}
        onclick={() => void downloadCurrent()}
      >
        {@html iconDownload(18)}
      </button>
      <button
        type="button"
        class="uiv2-media-lightbox__tool"
        aria-label="Скопировать ссылку"
        title="Скопировать ссылку"
        disabled={copyBusy}
        onclick={() => void copyCurrentLink()}
      >
        {@html iconCopy(18)}
      </button>
      <button
        type="button"
        class="uiv2-media-lightbox__tool"
        aria-label="Закрыть"
        title="Закрыть"
        onclick={() => void closeWithMotion()}
      >
        {@html iconX(18)}
      </button>
    </div>

    {#if canNav}
      <button
        type="button"
        class="uiv2-media-lightbox__nav uiv2-media-lightbox__nav--prev"
        aria-label="Предыдущее"
        onclick={() => stepFeedMediaLightbox(-1)}
      >
        {@html iconChevronLeft(22)}
      </button>
      <button
        type="button"
        class="uiv2-media-lightbox__nav uiv2-media-lightbox__nav--next"
        aria-label="Следующее"
        onclick={() => stepFeedMediaLightbox(1)}
      >
        {@html iconChevronRight(22)}
      </button>
    {/if}

    <div
      bind:this={stageEl}
      class="uiv2-media-lightbox__stage"
      role="group"
      aria-label="Изображение"
      onpointerdown={onPointerDown}
      onpointerup={onPointerUp}
      onpointercancel={() => {
        pointerStartX = null;
      }}
    >
      {#if item.kind === 'video'}
        <!-- svelte-ignore a11y_media_has_caption -->
        <video src={item.url} controls playsinline autoplay></video>
      {:else}
        <img src={item.url} alt="" decoding="async" draggable="false" />
      {/if}
    </div>

    {#if canNav}
      <p class="uiv2-media-lightbox__count">{state.index + 1} / {total}</p>
    {/if}
  </div>
{/if}
