<script lang="ts">
  import { onMount } from 'svelte';
  import { flip } from 'svelte/animate';
  import { cubicOut } from 'svelte/easing';
  import { scale } from 'svelte/transition';
  import { navigateIndependentTab } from '../stores/navigation';
  import { sidebarPins, sidebarPinsLoading, releaseListStatusLabel, type SidebarPin } from '../stores/sidebar-pins';
  import { toCdnThumbnailUrl } from '../utils/posterUrl';
  interface Props {
    currentPath?: string;
  }

  let { currentPath = '/' }: Props = $props();

  let scrollEl: HTMLDivElement | null = $state(null);
  let topFadeOpacity = $state(0);
  let bottomFadeOpacity = $state(0);
  let hoveredPin = $state<SidebarPin | null>(null);
  let previewTop = $state(0);
  let previewVisible = $state(false);
  let hidePreviewTimer: ReturnType<typeof setTimeout> | null = null;
  let reducedMotion = $state(false);

  const pins = $derived($sidebarPins);
  const loading = $derived($sidebarPinsLoading);
  const visible = $derived(loading || pins.length > 0);

  function releasePath(id: number): string {
    return `/release/${id}`;
  }

  function isPinActive(id: number): boolean {
    const path = currentPath ?? '';
    return path === releasePath(id) || path.startsWith(`${releasePath(id)}/`);
  }

  function updateFades() {
    const el = scrollEl;
    if (!el) {
      topFadeOpacity = 0;
      bottomFadeOpacity = 0;
      return;
    }
    const { scrollTop, scrollHeight, clientHeight } = el;
    const maxScroll = Math.max(0, scrollHeight - clientHeight);
    const distanceToBottom = Math.max(0, maxScroll - scrollTop);
    const fadeRange = 28;

    topFadeOpacity = scrollTop <= 1 ? 0 : Math.min(1, scrollTop / fadeRange);
    bottomFadeOpacity = maxScroll <= 2 || distanceToBottom <= 1
      ? 0
      : Math.min(1, distanceToBottom / fadeRange);
  }

  function clearHidePreviewTimer() {
    if (hidePreviewTimer != null) {
      clearTimeout(hidePreviewTimer);
      hidePreviewTimer = null;
    }
  }

  function positionPreview(trigger: HTMLElement) {
    const rect = trigger.getBoundingClientRect();
    previewTop = rect.top + rect.height / 2;
  }

  function showPreview(pin: SidebarPin, trigger: HTMLElement) {
    clearHidePreviewTimer();
    hoveredPin = pin;
    positionPreview(trigger);
    previewVisible = true;
  }

  function scheduleHidePreview() {
    clearHidePreviewTimer();
    hidePreviewTimer = setTimeout(() => {
      previewVisible = false;
      hoveredPin = null;
      hidePreviewTimer = null;
    }, 120);
  }

  function pinMeta(pin: SidebarPin): string {
    const parts: string[] = [];
    if (pin.year) parts.push(pin.year);
    const ep = pin.episodesReleased ?? pin.episodesTotal;
    if (ep != null) parts.push(`${ep} эп.`);
    if (typeof pin.rating === 'number' && pin.rating > 0) parts.push(`${pin.rating.toFixed(1)} ★`);
    return parts.join(' · ');
  }

  function pinSubtitle(pin: SidebarPin): string | null {
    const en = pin.titleEn?.trim();
    if (!en || en === pin.titleRu || en === pin.title) return null;
    return en;
  }

  onMount(() => {
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const syncReducedMotion = () => {
      reducedMotion = motionQuery.matches;
    };
    syncReducedMotion();
    motionQuery.addEventListener('change', syncReducedMotion);

    return () => {
      motionQuery.removeEventListener('change', syncReducedMotion);
      clearHidePreviewTimer();
    };
  });

  // Элемент появляется только после загрузки пинов, поэтому ResizeObserver
  // подключается реактивно, а не один раз во время mount.
  $effect(() => {
    const el = scrollEl;
    if (!el) return;

    updateFades();
    const ro = new ResizeObserver(updateFades);
    ro.observe(el);
    return () => ro.disconnect();
  });

  $effect(() => {
    pins.length;
    loading;
    queueMicrotask(() => updateFades());
  });

  $effect(() => {
    if (!hoveredPin) return;
    if (pins.some((pin) => pin.id === hoveredPin?.id)) return;
    clearHidePreviewTimer();
    previewVisible = false;
    hoveredPin = null;
  });
</script>

{#if visible}
  <div class="sidebar-pins" aria-label="Избранное">
    <div
      class="sidebar-pins__fade sidebar-pins__fade--top"
      style:opacity={topFadeOpacity}
      aria-hidden="true"
    ></div>

    <div class="sidebar-pins__scroll" bind:this={scrollEl} onscroll={updateFades}>
      {#if loading && pins.length === 0}
        {#each Array(4) as _, i (i)}
          <div class="sidebar-pins__skel" aria-hidden="true"></div>
        {/each}
      {:else}
        {#each pins as pin, index (pin.id)}
          <button
            type="button"
            class="sidebar-pins__item"
            class:sidebar-pins__item--active={isPinActive(pin.id)}
            aria-label={pin.title}
            onclick={() => navigateIndependentTab('favorites', releasePath(pin.id))}
            onmouseenter={(e) => showPreview(pin, e.currentTarget as HTMLElement)}
            onmouseleave={scheduleHidePreview}
            onfocus={(e) => showPreview(pin, e.currentTarget as HTMLElement)}
            onblur={scheduleHidePreview}
            animate:flip={{
              duration: reducedMotion ? 0 : 280,
              easing: cubicOut,
            }}
            in:scale={{
              start: reducedMotion ? 1 : 0.62,
              opacity: reducedMotion ? 1 : 0,
              duration: reducedMotion ? 0 : 260,
              delay: reducedMotion ? 0 : Math.min(index * 14, 140),
              easing: cubicOut,
            }}
            out:scale={{
              start: reducedMotion ? 1 : 0.55,
              opacity: reducedMotion ? 1 : 0,
              duration: reducedMotion ? 0 : 180,
              easing: cubicOut,
            }}
          >
            {#if pin.poster}
              <img
                class="sidebar-pins__img"
                src={toCdnThumbnailUrl(pin.poster, 36)}
                alt=""
                width="26"
                height="26"
                loading="lazy"
                decoding="async"
              />
            {:else}
              <span class="sidebar-pins__fallback" aria-hidden="true">
                {pin.title.slice(0, 1).toUpperCase()}
              </span>
            {/if}
          </button>
        {/each}
      {/if}
    </div>

    <div
      class="sidebar-pins__fade sidebar-pins__fade--bottom"
      style:opacity={bottomFadeOpacity}
      aria-hidden="true"
    ></div>
  </div>
{/if}

{#if hoveredPin && previewVisible}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="sidebar-pins__preview"
    class:sidebar-pins__preview--visible={previewVisible}
    style:top="{previewTop}px"
    role="tooltip"
    onmouseenter={clearHidePreviewTimer}
    onmouseleave={scheduleHidePreview}
  >
    <div class="sidebar-pins__preview-card">
      <div class="sidebar-pins__preview-poster">
        {#if hoveredPin.poster}
          <img
            src={toCdnThumbnailUrl(hoveredPin.poster, 89, 133)}
            alt=""
            width="89"
            height="133"
            loading="lazy"
            decoding="async"
          />
    
        {:else}
          <span class="sidebar-pins__preview-poster-fallback">{hoveredPin.title.slice(0, 1)}</span>
        {/if}
      </div>
      <div class="sidebar-pins__preview-body">
        <p class="sidebar-pins__preview-title">{hoveredPin.title}</p>
        {#if pinSubtitle(hoveredPin)}
          <p class="sidebar-pins__preview-sub">{pinSubtitle(hoveredPin)}</p>
        {/if}
        {#if pinMeta(hoveredPin)}
          <p class="sidebar-pins__preview-meta">{pinMeta(hoveredPin)}</p>
        {/if}
        {#if hoveredPin.listStatus}
          <span class="sidebar-pins__preview-status">{releaseListStatusLabel(hoveredPin.listStatus)}</span>
        {/if}
        <span class="sidebar-pins__preview-hint">Избранное</span>
      </div>
    </div>
  </div>
{/if}
