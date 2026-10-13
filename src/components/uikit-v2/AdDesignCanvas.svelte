<script lang="ts">
  import UiV2VpnCrtBanner from './UiV2VpnCrtBanner.svelte';
  import type { CrtAdVisual } from '../../services/ads-api';
  import type { CrtScreenStates } from '../../utils/crtScreen';
  import {
    AD_LAYER_META,
    layerOffsetKeys,
    measureAdLayers,
    type AdLayerBox,
    type AdLayerId,
    type VpnBannerOverlay,
    type VpnBannerStates,
  } from '../../utils/vpnSponsorBanner';

  type Props = {
    href?: string;
    imageUrl?: string | null;
    width?: string;
    height?: string;
    aspectRatio?: string;
    creative: CrtAdVisual;
    editHover?: boolean;
    selectedLayer?: AdLayerId | null;
    onSelectLayer?: (id: AdLayerId | null) => void;
    onCreativeChange?: (next: { crt: CrtScreenStates; overlay: VpnBannerStates }) => void;
    onOverlayPatch?: (patch: Partial<VpnBannerOverlay>) => void;
  };

  let {
    href = '',
    imageUrl = null,
    width = '100%',
    height = '',
    aspectRatio = '16 / 11',
    creative,
    editHover = $bindable(false),
    selectedLayer = $bindable<AdLayerId | null>('title'),
    onSelectLayer,
    onCreativeChange,
    onOverlayPatch,
  }: Props = $props();

  let stageEl: HTMLDivElement | null = $state(null);
  let stageW = $state(0);
  let stageH = $state(0);
  let dragging = $state(false);

  const overlay = $derived(
    editHover ? creative.overlay.hover : creative.overlay.rest,
  );

  const layers = $derived.by((): AdLayerBox[] => {
    if (stageW < 8 || stageH < 8) return [];
    return measureAdLayers(stageW, stageH, overlay);
  });

  let dragLayer: AdLayerId | null = null;
  let dragStartX = 0;
  let dragStartY = 0;
  let dragOrigDx = 0;
  let dragOrigDy = 0;

  $effect(() => {
    const el = stageEl;
    if (!el) return;
    const sync = () => {
      stageW = el.clientWidth;
      stageH = el.clientHeight;
    };
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  });

  function select(id: AdLayerId | null) {
    selectedLayer = id;
    onSelectLayer?.(id);
  }

  function onOverlayPointerDown(e: PointerEvent, id: AdLayerId) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    select(id);
    const keys = layerOffsetKeys(id);
    dragLayer = id;
    dragging = true;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    dragOrigDx = Number(overlay[keys.dx]) || 0;
    dragOrigDy = Number(overlay[keys.dy]) || 0;

    const onMove = (ev: PointerEvent) => {
      if (!dragLayer || stageW < 1 || stageH < 1) return;
      const dx = ((ev.clientX - dragStartX) / stageW) * 100;
      const dy = ((ev.clientY - dragStartY) / stageH) * 100;
      const k = layerOffsetKeys(dragLayer);
      const nextDx = Math.min(50, Math.max(-50, dragOrigDx + dx));
      const nextDy = Math.min(50, Math.max(-50, dragOrigDy + dy));
      onOverlayPatch?.({ [k.dx]: nextDx, [k.dy]: nextDy });
    };
    const onUp = () => {
      dragLayer = null;
      dragging = false;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  }

  function onStagePointerDown(e: PointerEvent) {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest('.ad-figma-bbox')) return;
    select(null);
  }
</script>

<div class="ad-figma">
  <aside class="ad-figma__layers" aria-label="Слои">
    <p class="ad-figma__layers-title">Layers</p>
    <ul class="ad-figma__layers-list">
      <li>
        <button
          type="button"
          class="ad-figma__layer ad-figma__layer--frame"
          class:ad-figma__layer--on={selectedLayer == null}
          onclick={() => select(null)}
        >
          <span class="ad-figma__layer-ico" aria-hidden="true">#</span>
          <span class="ad-figma__layer-name">Frame</span>
        </button>
      </li>
      {#each AD_LAYER_META as meta}
        {@const box = layers.find((l) => l.id === meta.id)}
        <li>
          <button
            type="button"
            class="ad-figma__layer"
            class:ad-figma__layer--on={selectedLayer === meta.id}
            class:ad-figma__layer--off={box && !box.visible}
            onclick={() => select(meta.id)}
          >
            <span class="ad-figma__layer-ico" aria-hidden="true">{meta.id === 'icon' ? '◇' : 'T'}</span>
            <span class="ad-figma__layer-name">{box?.label || meta.name}</span>
          </button>
        </li>
      {/each}
    </ul>
  </aside>

  <div
    class="ad-figma__stage"
    class:ad-figma__stage--dragging={dragging}
    bind:this={stageEl}
    onpointerdown={onStagePointerDown}
  >
    <UiV2VpnCrtBanner
      editable
      hideGear
      ignorePointerHover
      bind:editHover
      {href}
      {imageUrl}
      {width}
      {height}
      {aspectRatio}
      {creative}
      {onCreativeChange}
    />

    <div class="ad-figma__hit" aria-hidden="true">
      {#each layers.filter((l) => l.visible) as box (box.id)}
        <button
          type="button"
          class="ad-figma-bbox"
          class:ad-figma-bbox--on={selectedLayer === box.id}
          class:ad-figma-bbox--dim={selectedLayer != null && selectedLayer !== box.id}
          style:left="{box.x}px"
          style:top="{box.y}px"
          style:width="{box.w}px"
          style:height="{box.h}px"
          onpointerdown={(e) => onOverlayPointerDown(e, box.id)}
        >
          {#if selectedLayer === box.id}
            <span class="ad-figma-bbox__label">{Math.round(box.w)} × {Math.round(box.h)}</span>
            <span class="ad-figma-bbox__handle ad-figma-bbox__handle--tl"></span>
            <span class="ad-figma-bbox__handle ad-figma-bbox__handle--tr"></span>
            <span class="ad-figma-bbox__handle ad-figma-bbox__handle--bl"></span>
            <span class="ad-figma-bbox__handle ad-figma-bbox__handle--br"></span>
          {/if}
        </button>
      {/each}
    </div>
  </div>
</div>

<style lang="scss">
.ad-figma {
  display: grid;
  grid-template-columns: 11.5rem minmax(0, 1fr);
  gap: 0.75rem;
  width: 100%;
  align-items: stretch;
}

.ad-figma__layers {
  border: 1px solid var(--uiv2-border-subtle);
  border-radius: 10px;
  background: var(--uikit-v2-surface);
  overflow: hidden;
  min-height: 16rem;
}

.ad-figma__layers-title {
  margin: 0;
  padding: 0.55rem 0.7rem;
  font-size: 0.65rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--uiv2-fg-muted);
  border-bottom: 1px solid var(--uiv2-border-subtle);
}

.ad-figma__layers-list {
  list-style: none;
  margin: 0;
  padding: 0.25rem;
}

.ad-figma__layer {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  width: 100%;
  padding: 0.35rem 0.45rem;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--uikit-v2-text);
  font: inherit;
  font-size: 0.78rem;
  text-align: left;
  cursor: pointer;

  &:hover { background: var(--uiv2-hover-bg); }
  &--on { background: color-mix(in srgb, #3d8bfd 35%, transparent); }
  &--off { opacity: 0.4; }
  &--frame { font-weight: 600; }
}

.ad-figma__layer-ico {
  width: 1rem;
  text-align: center;
  color: var(--uiv2-fg-muted);
  font-size: 0.7rem;
}

.ad-figma__layer-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ad-figma__stage {
  position: relative;
  width: 100%;
  max-width: 28rem;
  margin: 0 auto;
  touch-action: none;

  &--dragging {
    cursor: grabbing;
    user-select: none;
  }
}

.ad-figma__hit {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 3;
}

.ad-figma-bbox {
  position: absolute;
  pointer-events: auto;
  margin: 0;
  padding: 0;
  border: 1px dashed color-mix(in srgb, #3d8bfd 70%, transparent);
  background: transparent;
  box-sizing: border-box;
  cursor: grab;
  appearance: none;

  &--dim { border-color: color-mix(in srgb, #3d8bfd 28%, transparent); }
  &--on {
    border-style: solid;
    border-width: 1.5px;
    border-color: #3d8bfd;
    z-index: 2;
  }

  &:active { cursor: grabbing; }
}

.ad-figma-bbox__label {
  position: absolute;
  left: 0;
  top: -1.15rem;
  padding: 0.1rem 0.3rem;
  border-radius: 4px;
  background: #3d8bfd;
  color: #fff;
  font-size: 0.62rem;
  font-weight: 600;
  white-space: nowrap;
  pointer-events: none;
}

.ad-figma-bbox__handle {
  position: absolute;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #fff;
  border: 1.5px solid #3d8bfd;
  pointer-events: none;

  &--tl { left: -4px; top: -4px; }
  &--tr { right: -4px; top: -4px; }
  &--bl { left: -4px; bottom: -4px; }
  &--br { right: -4px; bottom: -4px; }
}
</style>
