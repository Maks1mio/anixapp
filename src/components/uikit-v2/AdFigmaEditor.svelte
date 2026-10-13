<script lang="ts">
  import {
    addChild,
    alignNode,
    cloneDesignDoc,
    createEffectId,
    createFrameNode,
    createImageNode,
    createRectNode,
    createTextNode,
    flattenLayers,
    getNode,
    getRoot,
    iconToDataUrl,
    imagePaint,
    linearPaint,
    moveNodeRelative,
    nodeFills,
    nudgeNodeZ,
    removeNode,
    sanitizeHexRgb,
    solid,
    stopCssColor,
    type AdDesignDoc,
    type AdDesignStates,
    type AdEffect,
    type AdFrameNode,
    type AdNode,
    type AdPaint,
    type AdTextNode,
    effectHasParams,
  } from '../../utils/adDesignDoc';
  import {
    absBoxOf,
    addNodeEffect,
    addNodeFill,
    applyStructure,
    cloneDesignStatesAligned,
    copyNodeVisual,
    hoverDiffers,
    isLayerShown,
    mixedNode,
    nodeOpacity,
    patchCurrentNode,
    patchNodeEffectParams,
    patchNodeFill,
    patchSharedMeta,
    patchVariantNode,
    removeNodeEffect,
    removeNodeFill,
    reorderNodeFills,
    resizeArtboard,
    setCoverImage,
    setNodeEffectVisible,
    setNodeFillVisible,
    stepHoverT,
    toggleLayerShown,
    ARTBOARD_PRESETS,
  } from '../../utils/adDesignMotion';
  import { composeAdDesign } from '../../utils/composeAdDesign';
  import { layerHasAnimatedFx } from '../../utils/adLayerShaders';
  import {
    AD_SHADER_CATALOG,
    defaultShaderParams,
    isAdShaderType,
    shaderCatalogItem,
    type ShaderField,
  } from '../../utils/adLayerShaderCatalog';
  import {
    CRT_INSPECTOR_FIELDS,
    CRT_VPN_PRESET,
    formatCrtValue,
    sanitizeCrtParams,
    type CrtSliderKey,
  } from '../../utils/crtScreen';
  import { fileToDataUrl, resolveAdImageUrl } from '../../services/ads-api';
  import { isSvgDataUrl, parseSvgDataUrlColor, tintSvgDataUrl } from '../../utils/svgTint';
  import { bannerIconSvg, VPN_BANNER_ICONS } from '../../utils/vpnBannerIcons';
  import EditorIcon from './editor/EditorIcon.svelte';
  import { editorIcons } from './editor/editorIconRaw';

  type Tool = 'select' | 'hand';
  type Variant = 'rest' | 'hover';

  type Props = {
    states: AdDesignStates;
    onStatesChange: (next: AdDesignStates) => void;
    title?: string;
    onTitleChange?: (title: string) => void;
    error?: string;
    busy?: boolean;
    onClose?: () => void;
    onSave?: () => void;
  };

  let {
    states,
    onStatesChange,
    title = '',
    onTitleChange,
    error = '',
    busy = false,
    onClose,
    onSave,
  }: Props = $props();

  let tool = $state<Tool>('select');
  let variant = $state<Variant>('rest');
  let livePreview = $state(false);
  let onion = $state(true);
  let selectedId = $state<string | null>(null);
  let zoom = $state(1);
  let panX = $state(0);
  let panY = $state(0);
  let aspectLock = $state(true);
  let didFit = $state(false);
  let stageEl: HTMLDivElement | null = $state(null);
  let fileInput: HTMLInputElement | null = $state(null);
  let previewCanvas: HTMLCanvasElement | null = $state(null);
  let addFxOpen = $state(false);
  let addFillOpen = $state(false);
  let expandedFillId = $state<string | null>(null);
  let fillDragIndex = $state<number | null>(null);
  let layerDragId = $state<string | null>(null);
  let layerDrop = $state<{ id: string; place: 'before' | 'after' | 'inside' } | null>(null);
  let fillFileInput: HTMLInputElement | null = $state(null);
  let pendingFillTarget = $state<'new' | string | null>(null);
  let iconQuery = $state('');
  let spaceDown = $state(false);
  let panning = $state(false);
  let pointerHover = false;
  let hoverT = 0;
  let dragBase: AdDesignStates | null = null;

  let dragStates: AdDesignStates | null = $state(null);
  const view = $derived(dragStates ?? cloneDesignStatesAligned(states));
  const restDoc = $derived(view.rest);
  const hoverDoc = $derived(view.hover);
  const activeDoc = $derived(variant === 'hover' ? hoverDoc : restDoc);
  const selected = $derived(getNode(activeDoc, selectedId));
  const selectedRest = $derived(getNode(restDoc, selectedId));
  const selectedHover = $derived(getNode(hoverDoc, selectedId));
  const layers = $derived(flattenLayers(restDoc));
  const root = $derived(getRoot(restDoc));
  const iconChoices = $derived(
    VPN_BANNER_ICONS.filter((ic) => {
      const q = iconQuery.trim().toLowerCase();
      if (!q) return true;
      return ic.id.includes(q) || ic.label.toLowerCase().includes(q);
    }),
  );
  const selectedIconId = $derived(selected?.type === 'image' ? selected.iconId ?? '' : '');

  const box = {
    view: { version: 2 as const, width: 1, height: 1, rootId: '', nodes: {} },
    variant: 'rest' as Variant,
    livePreview: false,
    zoom: 1,
    pointerHover: false,
    fxAnimated: false,
  };

  $effect(() => {
    box.view = view;
    box.variant = variant;
    box.livePreview = livePreview;
    box.zoom = zoom;
    box.fxAnimated = Object.values(view.rest.nodes).some((n) => layerHasAnimatedFx(n.effects))
      || Object.values(view.hover.nodes).some((n) => layerHasAnimatedFx(n.effects));
  });

  $effect(() => {
    selectedId;
    addFxOpen = false;
    addFillOpen = false;
  });

  $effect(() => {
    const id = restDoc.rootId;
    if (!selectedId || !restDoc.nodes[selectedId]) selectedId = id;
  });

  $effect(() => {
    const canvas = previewCanvas;
    if (!canvas) return;
    const probe = canvas.getContext('2d', { alpha: true });
    if (!probe) {
      const next = document.createElement('canvas');
      next.className = canvas.className;
      next.setAttribute('aria-hidden', 'true');
      canvas.replaceWith(next);
      previewCanvas = next;
      return;
    }
    let dead = false;
    let raf = 0;
    let lastCompose = '';
    let composeBusy = false;
    let lastTime = 0;
    let frozenFxTime = 0;
    let lastViewRef: AdDesignStates | null = null;

    const loop = (timeMs: number) => {
      raf = 0;
      if (dead) return;
      const dt = lastTime ? Math.min(48, Math.max(0, timeMs - lastTime)) : 16;
      lastTime = timeMs;
      const target = box.livePreview
        ? (pointerHover || box.pointerHover ? 1 : 0)
        : box.variant === 'hover' ? 1 : 0;
      hoverT = stepHoverT(hoverT, target, dt);
      const springing = Math.abs(hoverT - target) > 0.003;
      const animateFx = box.livePreview || springing || box.fxAnimated;
      if (animateFx) frozenFxTime += dt;
      const fxTime = frozenFxTime;
      const rest = box.view.rest;
      const hover = box.view.hover;
      const w = Math.max(1, rest.width);
      const h = Math.max(1, rest.height);
      const displayW = Math.max(1, w * box.zoom);
      const displayH = Math.max(1, h * box.zoom);
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.style.width = `${displayW}px`;
      canvas.style.height = `${displayH}px`;
      const pxW = Math.max(1, Math.round(displayW * dpr));
      const pxH = Math.max(1, Math.round(displayH * dpr));
      if (canvas.width !== pxW) canvas.width = pxW;
      if (canvas.height !== pxH) canvas.height = pxH;

      const sig = `${Math.round(fxTime)}|${hoverT.toFixed(3)}|${pxW}x${pxH}`;
      if (!composeBusy && (box.view !== lastViewRef || sig !== lastCompose)) {
        lastViewRef = box.view;
        lastCompose = sig;
        const ctx = canvas.getContext('2d', { alpha: true });
        if (ctx) {
          composeBusy = true;
          void composeAdDesign(ctx, rest, pxW, pxH, hover, hoverT, fxTime).then(() => {
            composeBusy = false;
          });
        }
      }
      if (!dead) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    void document.fonts?.ready?.catch(() => {});
    return () => {
      dead = true;
      if (raf) cancelAnimationFrame(raf);
    };
  });

  $effect(() => {
    const r = getRoot(states.rest);
    if (Math.abs(r.w - states.rest.width) > 0.6 || Math.abs(r.h - states.rest.height) > 0.6) {
      onStatesChange(resizeArtboard(states, r.w, r.h));
    }
  });

  $effect(() => {
    const el = stageEl;
    if (!el) return;
    const handler = (e: WheelEvent) => onWheel(e);
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  });

  $effect(() => {
    const el = stageEl;
    if (!el || didFit) return;
    const fit = () => {
      applyFit(el);
      didFit = true;
    };
    fit();
    const ro = new ResizeObserver(() => {
      if (!didFit) fit();
    });
    ro.observe(el);
    return () => ro.disconnect();
  });

  function commit(next: AdDesignStates) {
    dragStates = null;
    onStatesChange(cloneDesignStatesAligned(next));
  }

  function applyFit(el: HTMLDivElement) {
    const pad = 96;
    const zw = (el.clientWidth - pad) / Math.max(1, restDoc.width);
    const zh = (el.clientHeight - pad) / Math.max(1, restDoc.height);
    zoom = Math.min(2.2, Math.max(0.15, Math.min(zw, zh)));
    panX = (el.clientWidth - restDoc.width * zoom) / 2;
    panY = (el.clientHeight - restDoc.height * zoom) / 2;
  }

  function commitVariant(id: string, patch: Partial<AdNode>, which: Variant = variant) {
    commit(patchCurrentNode(view, which, id, patch));
  }

  function alignSelected(mode: 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom') {
    if (!selectedId || selectedId === restDoc.rootId) return;
    const nextDoc = alignNode(cloneDesignDoc(activeDoc), selectedId, mode);
    const node = getNode(nextDoc, selectedId);
    if (!node) return;
    commitVariant(selectedId, { x: node.x, y: node.y });
  }

  function applyArtboardPreset(width: number, height: number) {
    commit(resizeArtboard(view, width, height));
  }

  function setArtboardWidth(width: number) {
    const w = Math.max(64, Number(width) || restDoc.width);
    if (aspectLock && restDoc.width > 0) {
      const h = w * (restDoc.height / restDoc.width);
      commit(resizeArtboard(view, w, h));
      return;
    }
    commit(resizeArtboard(view, w, restDoc.height));
  }

  function setArtboardHeight(height: number) {
    const h = Math.max(64, Number(height) || restDoc.height);
    if (aspectLock && restDoc.height > 0) {
      const w = h * (restDoc.width / restDoc.height);
      commit(resizeArtboard(view, w, h));
      return;
    }
    commit(resizeArtboard(view, restDoc.width, h));
  }

  function zoomBy(factor: number) {
    const el = stageEl;
    const next = Math.min(4, Math.max(0.12, zoom * factor));
    if (!el) {
      zoom = next;
      return;
    }
    const mx = el.clientWidth / 2;
    const my = el.clientHeight / 2;
    const wx = (mx - panX) / zoom;
    const wy = (my - panY) / zoom;
    panX = mx - wx * next;
    panY = my - wy * next;
    zoom = next;
  }

  function fitToView() {
    const el = stageEl;
    if (!el) return;
    applyFit(el);
  }

  function onWheel(e: WheelEvent) {
    const el = stageEl;
    if (!el) return;
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      const rect = el.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const wx = (mx - panX) / zoom;
      const wy = (my - panY) / zoom;
      const factor = e.deltaY > 0 ? 0.92 : 1.08;
      const next = Math.min(4, Math.max(0.12, zoom * factor));
      panX = mx - wx * next;
      panY = my - wy * next;
      zoom = next;
      return;
    }
    if (e.shiftKey) {
      panX -= e.deltaY;
      panY -= e.deltaX;
      return;
    }
    panX -= e.deltaX;
    panY -= e.deltaY;
  }

  function select(id: string | null) {
    selectedId = id;
  }

  function addNode(node: AdNode) {
    const parentId = selected?.type === 'frame' ? selected.id : root.id;
    commit(applyStructure(view, (doc) => addChild(doc, parentId, { ...node, id: node.id })));
    selectedId = node.id;
    tool = 'select';
  }

  function addText() {
    addNode(createTextNode({
      x: root.w / 2 - 160,
      y: root.h / 2 - 24,
      w: 320,
      h: 48,
      characters: 'Текст',
    }));
  }

  function addRect() {
    addNode(createRectNode({ x: 80, y: 80 }));
  }

  function addFrame() {
    addNode(createFrameNode({ x: 60, y: 60 }));
  }

  function addIconLayer() {
    const size = 96;
    const color = '#ffffff';
    const iconId = 'wifi-off';
    addNode(createImageNode(iconToDataUrl(iconId, size, color), {
      name: 'Icon',
      x: Math.round(root.w / 2 - size / 2),
      y: Math.round(root.h * 0.16),
      w: size,
      h: size,
      scaleMode: 'fit',
      tint: color,
      iconId,
    }));
  }

  function applyBannerIcon(iconId: string) {
    if (!selected || selected.type !== 'image' || !selectedId) {
      const size = 96;
      const color = '#ffffff';
      addNode(createImageNode(iconToDataUrl(iconId, size, color), {
        name: 'Icon',
        x: Math.round(root.w / 2 - size / 2),
        y: Math.round(root.h * 0.16),
        w: size,
        h: size,
        scaleMode: 'fit',
        tint: color,
        iconId,
      }));
      return;
    }
    const color = selected.tint || parseSvgDataUrlColor(selected.src) || '#ffffff';
    const size = Math.max(24, Math.round(Math.max(selected.w, selected.h)));
    commitVariant(selectedId, {
      src: iconToDataUrl(iconId, size, color),
      iconId,
      tint: color,
      scaleMode: 'fit',
      name: selected.name === 'Image' ? 'Icon' : selected.name,
    } as Partial<AdNode>);
  }

  async function addImageFromFile(file: File) {
    const src = await fileToDataUrl(file);
    addNode(createImageNode(src, {
      name: file.name || 'Image',
      x: 40,
      y: 40,
      w: Math.min(320, root.w - 80),
      h: Math.min(220, root.h - 80),
    }));
  }

  function onPickImage(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (file) void addImageFromFile(file);
  }

  function applyImageToSelected(file: File) {
    void fileToDataUrl(file).then((src) => {
      if (!selectedId || !selected) return;
      if (selectedId === restDoc.rootId || selected.type === 'frame' && selected.id === restDoc.rootId) {
        commit(setCoverImage(view, src));
        return;
      }
      if (selected.type === 'image') {
        commitVariant(selectedId, { src, name: file.name || selected.name, iconId: undefined } as Partial<AdNode>);
        return;
      }
      if (selected.type === 'frame' || selected.type === 'rectangle' || selected.type === 'text') {
        commit(addNodeFill(view, selectedId, imagePaint(src)));
        return;
      }
      void addImageFromFile(file);
    });
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer?.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    if (selected && (selected.type === 'frame' || selected.type === 'rectangle' || selected.type === 'image')) {
      applyImageToSelected(file);
    } else {
      void addImageFromFile(file);
    }
  }

  function deleteSelected() {
    if (!selectedId || selectedId === restDoc.rootId) return;
    commit(applyStructure(view, (doc) => removeNode(doc, selectedId!)));
    selectedId = restDoc.rootId;
  }

  function toggleVisible(id: string) {
    const node = getNode(activeDoc, id);
    if (!node) return;
    commitVariant(id, toggleLayerShown(node));
  }

  function toggleLocked(id: string) {
    const node = getNode(restDoc, id);
    if (!node) return;
    commit(patchSharedMeta(view, id, { locked: !node.locked }));
  }

  function onKey(e: KeyboardEvent) {
    const t = e.target as HTMLElement;
    const typing = t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable;
    if (e.code === 'Space' && !typing) {
      spaceDown = e.type === 'keydown';
      if (e.type === 'keydown') e.preventDefault();
      return;
    }
    if (e.type !== 'keydown') return;
    if (e.key === 'Escape') {
      livePreview = false;
      tool = 'select';
      select(restDoc.rootId);
      return;
    }
    if ((e.key === '1' || e.key === '2' || e.key === '3') && !typing) {
      if (e.key === '1') { variant = 'rest'; livePreview = false; }
      if (e.key === '2') { variant = 'hover'; livePreview = false; }
      if (e.key === '3') livePreview = !livePreview;
      return;
    }
    if (typing) return;
    if (e.key === '0') {
      e.preventDefault();
      fitToView();
      return;
    }
    if (e.key === 'v' || e.key === 'V') {
      tool = 'select';
      livePreview = false;
      return;
    }
    if (e.key === 'h' || e.key === 'H') {
      tool = 'hand';
      livePreview = false;
      return;
    }
    if (e.key === 'f' || e.key === 'F') {
      addFrame();
      return;
    }
    if (e.key === 'r' || e.key === 'R') {
      addRect();
      return;
    }
    if (e.key === 't' || e.key === 'T') {
      addText();
      return;
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      deleteSelected();
      return;
    }
    if ((e.key === ']' || e.key === '[') && selectedId && selectedId !== restDoc.rootId) {
      e.preventDefault();
      commit(applyStructure(view, (doc) => nudgeNodeZ(doc, selectedId!, e.key === ']')));
      return;
    }
    if (!selectedId || selectedId === restDoc.rootId || !selected) return;
    const step = e.shiftKey ? 10 : 1;
    if (e.key === 'ArrowLeft') { e.preventDefault(); commitVariant(selectedId, { x: selected.x - step }); }
    if (e.key === 'ArrowRight') { e.preventDefault(); commitVariant(selectedId, { x: selected.x + step }); }
    if (e.key === 'ArrowUp') { e.preventDefault(); commitVariant(selectedId, { y: selected.y - step }); }
    if (e.key === 'ArrowDown') { e.preventDefault(); commitVariant(selectedId, { y: selected.y + step }); }
  }

  let drag: null | {
    mode: 'move' | 'resize' | 'pan';
    id: string;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    origW: number;
    origH: number;
    scrollL: number;
    scrollT: number;
    handle?: string;
  } = null;

  function onStagePointerDown(e: PointerEvent) {
    if (e.button === 1 || tool === 'hand' || spaceDown) {
      e.preventDefault();
      panning = true;
      drag = {
        mode: 'pan',
        id: '',
        startX: e.clientX,
        startY: e.clientY,
        origX: panX,
        origY: panY,
        origW: 0, origH: 0,
        scrollL: 0,
        scrollT: 0,
      };
      const onMove = (ev: PointerEvent) => {
        if (!drag || drag.mode !== 'pan') return;
        panX = drag.origX + (ev.clientX - drag.startX);
        panY = drag.origY + (ev.clientY - drag.startY);
      };
      const onUp = () => {
        drag = null;
        panning = false;
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      return;
    }
    if (livePreview) return;
    select(root.id);
  }

  function onNodePointerDown(e: PointerEvent, id: string) {
    if (livePreview) return;
    if (tool !== 'select' || spaceDown) return;
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const node = getNode(activeDoc, id);
    if (!node || node.locked) return;
    select(id);
    dragBase = cloneDesignStatesAligned(view);
    dragStates = dragBase;
    drag = {
      mode: 'move',
      id,
      startX: e.clientX,
      startY: e.clientY,
      origX: node.x,
      origY: node.y,
      origW: node.w,
      origH: node.h,
      scrollL: 0,
      scrollT: 0,
    };
    const onMove = (ev: PointerEvent) => {
      if (!drag || drag.mode !== 'move' || !dragBase) return;
      const dx = (ev.clientX - drag.startX) / zoom;
      const dy = (ev.clientY - drag.startY) / zoom;
      dragStates = patchCurrentNode(dragBase, variant, drag.id, {
        x: drag.origX + dx,
        y: drag.origY + dy,
      });
    };
    const onUp = () => {
      if (dragStates) commit(dragStates);
      drag = null;
      dragBase = null;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  function onResizeDown(e: PointerEvent, id: string, handle: string) {
    if (livePreview) return;
    e.preventDefault();
    e.stopPropagation();
    const node = getNode(activeDoc, id);
    if (!node) return;
    select(id);
    const isArtboard = id === restDoc.rootId;
    dragBase = cloneDesignStatesAligned(view);
    dragStates = dragBase;
    drag = {
      mode: 'resize',
      id,
      handle,
      startX: e.clientX,
      startY: e.clientY,
      origX: isArtboard ? 0 : node.x,
      origY: isArtboard ? 0 : node.y,
      origW: isArtboard ? restDoc.width : node.w,
      origH: isArtboard ? restDoc.height : node.h,
      scrollL: panX,
      scrollT: panY,
    };
    const onMove = (ev: PointerEvent) => {
      if (!drag || drag.mode !== 'resize' || !dragBase) return;
      const dx = (ev.clientX - drag.startX) / zoom;
      const dy = (ev.clientY - drag.startY) / zoom;
      let x = drag.origX;
      let y = drag.origY;
      let w = drag.origW;
      let h = drag.origH;
      if (handle.includes('e')) w = Math.max(8, drag.origW + dx);
      if (handle.includes('s')) h = Math.max(8, drag.origH + dy);
      if (handle.includes('w')) {
        w = Math.max(8, drag.origW - dx);
        x = drag.origX + (drag.origW - w);
      }
      if (handle.includes('n')) {
        h = Math.max(8, drag.origH - dy);
        y = drag.origY + (drag.origH - h);
      }
      const lock = aspectLock || ev.shiftKey;
      if (lock && drag.origH > 0) {
        const ratio = drag.origW / drag.origH;
        if (handle === 'n' || handle === 's') {
          w = Math.max(8, h * ratio);
        } else {
          h = Math.max(8, w / ratio);
        }
        if (handle.includes('w')) x = drag.origX + (drag.origW - w);
        if (handle.includes('n')) y = drag.origY + (drag.origH - h);
      }
      if (drag.id === restDoc.rootId) {
        w = Math.max(64, w);
        h = Math.max(64, h);
        dragStates = resizeArtboard(dragBase, w, h);
        panX = drag.scrollL + (handle.includes('w') ? (drag.origW - w) * zoom : 0);
        panY = drag.scrollT + (handle.includes('n') ? (drag.origH - h) * zoom : 0);
        return;
      }
      dragStates = patchCurrentNode(dragBase, variant, drag.id, { x, y, w, h });
    };
    const onUp = () => {
      if (dragStates) commit(dragStates);
      drag = null;
      dragBase = null;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  function layerIconSvg(type: AdNode['type']): string {
    if (type === 'frame') return editorIcons.grid;
    if (type === 'text') return editorIcons.styleText;
    if (type === 'image') return editorIcons.styleFill;
    return editorIcons.opacity;
  }

  function setTextField<K extends keyof AdTextNode>(key: K, value: AdTextNode[K]) {
    if (!selected || selected.type !== 'text' || !selectedId) return;
    commitVariant(selectedId, { [key]: value } as Partial<AdNode>);
  }

  function setFrameField(patch: Partial<AdFrameNode>) {
    if (!selected || selected.type !== 'frame' || !selectedId) return;
    commitVariant(selectedId, patch as Partial<AdNode>);
  }

  function solidColor(): string {
    if (!selected) return '#ffffff';
    if (selected.type === 'image') {
      if (selected.tint) return selected.tint;
      return parseSvgDataUrlColor(selected.src) || '#ffffff';
    }
    if (selected.type === 'text' || selected.type === 'frame' || selected.type === 'rectangle') {
      const f = selected.fills[0];
      if (f && f.type === 'solid') return f.color;
    }
    return '#ffffff';
  }

  function setSolidColor(color: string) {
    if (!selected || !selectedId) return;
    const hex = color.trim();
    if (selected.type === 'image' && isSvgDataUrl(selected.src)) {
      const size = Math.max(24, Math.round(Math.max(selected.w, selected.h)));
      const src = selected.iconId
        ? iconToDataUrl(selected.iconId, size, hex)
        : tintSvgDataUrl(selected.src, hex);
      commitVariant(selectedId, {
        tint: hex,
        src,
      } as Partial<AdNode>);
    }
  }

  function selectedFillList(): AdPaint[] {
    return nodeFills(selected);
  }

  function fillLabel(p: AdPaint): string {
    if (p.type === 'solid') return p.color.replace('#', '').toUpperCase();
    if (p.type === 'gradient') return 'Linear';
    return 'Image';
  }

  function fillSwatchStyle(p: AdPaint): string {
    if (p.type === 'solid') return `background: ${p.color};`;
    if (p.type === 'gradient') {
      const stops = p.stops.map((s) => `${stopCssColor(s)} ${Math.round(s.position * 100)}%`).join(', ');
      return `background: linear-gradient(${p.angle ?? 180}deg, ${stops});`;
    }
    if (p.src) {
      const url = resolveAdImageUrl(p.src) || p.src;
      return `background: center / cover no-repeat url("${url.replace(/"/g, '%22')}");`;
    }
    return 'background: #555;';
  }

  function addFillSolid() {
    if (!selectedId) return;
    commit(addNodeFill(view, selectedId, solid('#FFFFFF')));
    addFillOpen = false;
  }

  function addFillLinear() {
    if (!selectedId || !selected) return;
    const overlay = selected.type === 'image'
      || selectedId === restDoc.rootId
      || selectedFillList().some((p) => p.type === 'image' && p.visible !== false);
    commit(addNodeFill(view, selectedId, linearPaint(1, 180, overlay)));
    addFillOpen = false;
  }

  function addFillImage() {
    pendingFillTarget = 'new';
    addFillOpen = false;
    fillFileInput?.click();
  }

  function onFillFile(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    const target = pendingFillTarget;
    pendingFillTarget = null;
    if (!file || !selectedId) return;
    void fileToDataUrl(file).then((src) => {
      if (!selectedId) return;
      if (target === 'new') {
        commit(addNodeFill(view, selectedId, imagePaint(src)));
        return;
      }
      if (target) commit(patchNodeFill(view, variant, selectedId, target, { src }));
    });
  }

  function patchFill(paintId: string, patch: Record<string, unknown>) {
    if (!selectedId) return;
    commit(patchNodeFill(view, variant, selectedId, paintId, patch));
  }

  function toggleFillVisible(paintId: string) {
    const p = selectedFillList().find((f) => f.id === paintId);
    if (!selectedId || !p) return;
    commit(setNodeFillVisible(view, variant, selectedId, paintId, p.visible === false));
  }

  function deleteFill(paintId: string) {
    if (!selectedId) return;
    commit(removeNodeFill(view, selectedId, paintId));
    if (expandedFillId === paintId) expandedFillId = null;
  }

  function onFillDragStart(index: number, e: DragEvent) {
    fillDragIndex = index;
    e.dataTransfer?.setData('text/plain', String(index));
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
  }

  function onFillDrop(index: number, e: DragEvent) {
    e.preventDefault();
    if (fillDragIndex == null || !selectedId) return;
    commit(reorderNodeFills(view, selectedId, fillDragIndex, index));
    fillDragIndex = null;
  }

  function layerDropPlace(e: DragEvent, el: HTMLElement, nodeId: string): 'before' | 'after' | 'inside' {
    const node = restDoc.nodes[nodeId];
    const r = el.getBoundingClientRect();
    const y = e.clientY - r.top;
    if (nodeId === restDoc.rootId) return 'inside';
    if (node?.type === 'frame' && y > r.height * 0.28 && y < r.height * 0.72) return 'inside';
    return y < r.height / 2 ? 'before' : 'after';
  }

  function onLayerDragStart(e: DragEvent, id: string) {
    if (id === restDoc.rootId) {
      e.preventDefault();
      return;
    }
    layerDragId = id;
    e.dataTransfer?.setData('text/plain', id);
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
  }

  function onLayerDragOver(e: DragEvent, id: string) {
    if (!layerDragId || layerDragId === id) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    const el = e.currentTarget as HTMLElement;
    layerDrop = { id, place: layerDropPlace(e, el, id) };
  }

  function onLayerDrop(e: DragEvent, targetId: string) {
    e.preventDefault();
    e.stopPropagation();
    const src = layerDragId || e.dataTransfer?.getData('text/plain');
    const el = e.currentTarget as HTMLElement;
    const place = layerDropPlace(e, el, targetId);
    layerDragId = null;
    layerDrop = null;
    if (!src || src === targetId) return;
    commit(applyStructure(view, (doc) => moveNodeRelative(doc, src, targetId, place)));
  }

  function onLayerDragEnd() {
    layerDragId = null;
    layerDrop = null;
  }

  function parseHexInput(raw: string): string | null {
    const v = raw.trim().replace('#', '');
    if (/^[0-9a-fA-F]{6}$/.test(v)) return `#${v.toUpperCase()}`;
    if (/^[0-9a-fA-F]{3}$/.test(v)) return `#${v[0]}${v[0]}${v[1]}${v[1]}${v[2]}${v[2]}`.toUpperCase();
    return null;
  }

  function liveCrtEffect(): Extract<AdEffect, { type: 'crt' }> | null {
    const fx = selected?.effects?.find((e) => e.type === 'crt');
    return fx && fx.type === 'crt' ? fx : null;
  }

  function liveCrtParams() {
    const fx = liveCrtEffect();
    return sanitizeCrtParams(fx?.params);
  }

  function patchCrtParam(key: string, value: number | boolean) {
    const fx = liveCrtEffect();
    if (!selectedId || !fx) return;
    commit(patchNodeEffectParams(view, variant, selectedId, fx.id, { [key]: value }));
  }

  function addCrtToSelected() {
    if (!selectedId || !selected) return;
    if (selected.effects?.some((e) => e.type === 'crt')) {
      addFxOpen = false;
      return;
    }
    const fx: AdEffect = {
      id: createEffectId(),
      type: 'crt',
      visible: true,
      params: { ...CRT_VPN_PRESET },
    };
    commit(addNodeEffect(view, selectedId, fx));
    addFxOpen = false;
  }

  function addShaderToSelected(type: (typeof AD_SHADER_CATALOG)[number]['type']) {
    if (!selectedId || !selected) return;
    if (selected.effects?.some((e) => e.type === type)) {
      addFxOpen = false;
      return;
    }
    const fx: AdEffect = {
      id: createEffectId(),
      type,
      visible: true,
      params: defaultShaderParams(type),
    };
    commit(addNodeEffect(view, selectedId, fx));
    addFxOpen = false;
  }

  function patchFxParam(effectId: string, key: string, value: number | boolean | string) {
    if (!selectedId) return;
    commit(patchNodeEffectParams(view, variant, selectedId, effectId, { [key]: value }));
  }

  function formatShaderValue(field: ShaderField, value: number | boolean | string): string {
    if (field.kind !== 'range') return String(value);
    const n = Number(value);
    const shown = field.step < 1 ? n.toFixed(2).replace(/\.?0+$/, '') : String(Math.round(n));
    return field.unit ? `${shown}${field.unit}` : shown;
  }

  function copyFxParams(effectId: string, from: Variant, to: Variant) {
    if (!selectedId || from === to) return;
    const srcNode = from === 'rest' ? selectedRest : selectedHover;
    const dstNode = to === 'rest' ? selectedRest : selectedHover;
    const srcFx = srcNode?.effects.find((e) => e.id === effectId);
    if (!srcFx || !effectHasParams(srcFx) || !dstNode) return;
    const nextEffects = dstNode.effects.map((e) => (
      e.id === srcFx.id && effectHasParams(e)
        ? { ...e, params: { ...srcFx.params } }
        : e
    ));
    commit(patchVariantNode(view, to, selectedId, { effects: nextEffects } as Partial<AdNode>));
  }

  function toggleEffectVisible(effectId: string) {
    const fx = selected?.effects?.find((e) => e.id === effectId);
    if (!selectedId || !fx) return;
    commit(setNodeEffectVisible(view, variant, selectedId, effectId, !fx.visible));
  }

  function deleteEffect(effectId: string) {
    if (!selectedId) return;
    commit(removeNodeEffect(view, selectedId, effectId));
  }

  function abs(doc: AdDesignDoc, id: string) {
    return absBoxOf(doc, id);
  }

  const mixedSel = $derived(selectedId ? mixedNode(view, selectedId, variant === 'hover' ? 1 : 0) : null);
</script>

<svelte:window
  onkeydown={onKey}
  onkeyup={onKey}
/>

<div class="figma">
  {#snippet effectCopyRow(effectId: string)}
    <div class="figma__fx-copy-row">
      <span class="figma__fx-editing">Правится {variant === 'hover' ? 'Hover' : 'Rest'}</span>
      <button type="button" class="figma__mini figma__fx-copy" onclick={() => copyFxParams(effectId, 'rest', 'hover')}>Rest → Hover</button>
      <button type="button" class="figma__mini figma__fx-copy" onclick={() => copyFxParams(effectId, 'hover', 'rest')}>Hover → Rest</button>
    </div>
  {/snippet}
  <header class="figma__toolbar" aria-label="Инструменты">
    <div class="figma__tools">
      <button type="button" class="figma__tool" class:figma__tool--on={tool === 'select' && !livePreview} onclick={() => { tool = 'select'; livePreview = false; }} title="Выбор (V)">
        <EditorIcon svg={editorIcons.selectTool} size={20} />
      </button>
      <button type="button" class="figma__tool" class:figma__tool--on={tool === 'hand' || spaceDown} onclick={() => (tool = 'hand')} title="Рука (H / Space)">
        <EditorIcon svg={editorIcons.hand} size={20} />
      </button>
      <span class="figma__sep"></span>
      <button type="button" class="figma__tool" onclick={addFrame} title="Frame (F)">
        <EditorIcon svg={editorIcons.grid} size={20} />
      </button>
      <button type="button" class="figma__tool" onclick={addRect} title="Rectangle (R)">
        <EditorIcon svg={editorIcons.opacity} size={20} />
      </button>
      <button type="button" class="figma__tool" onclick={addText} title="Text (T)">
        <EditorIcon svg={editorIcons.styleText} size={20} />
      </button>
      <button type="button" class="figma__tool" onclick={() => fileInput?.click()} title="Image">
        <EditorIcon svg={editorIcons.styleFill} size={20} />
      </button>
      <button type="button" class="figma__tool" onclick={addIconLayer} title="Icon">
        <span class="figma__tool-svg">{@html bannerIconSvg('star', 18)}</span>
      </button>
      <input bind:this={fileInput} type="file" accept="image/*" hidden onchange={onPickImage} />
      <input bind:this={fillFileInput} type="file" accept="image/*" hidden onchange={onFillFile} />
    </div>

    {#if onTitleChange}
      <label class="figma__title">
        <span class="figma__sr">Название рекламы</span>
        <input
          type="text"
          value={title}
          placeholder="Название рекламы"
          oninput={(e) => onTitleChange(e.currentTarget.value)}
        />
      </label>
    {/if}

    <div class="figma__toolbar-end">
      <div class="figma__variants" role="tablist" aria-label="Состояние">
        <button type="button" class="figma__var" class:figma__var--on={!livePreview && variant === 'rest'} onclick={() => { variant = 'rest'; livePreview = false; }}>Rest</button>
        <button type="button" class="figma__var" class:figma__var--on={!livePreview && variant === 'hover'} onclick={() => { variant = 'hover'; livePreview = false; }}>Hover</button>
        <button type="button" class="figma__var figma__var--play" class:figma__var--on={livePreview} onclick={() => { livePreview = !livePreview; }} title="Как в iframe — наведите на холст">
          <EditorIcon svg={editorIcons.view} size={16} /> Preview
        </button>
      </div>

      <div class="figma__zoom">
        <label class="figma__onion" title="Показать второй стейт контуром">
          <input type="checkbox" bind:checked={onion} /> Onion
        </label>
        <button type="button" class="figma__tool" onclick={() => zoomBy(0.9)} title="Уменьшить">
          <EditorIcon svg={editorIcons.remove} size={16} />
        </button>
        <button type="button" class="figma__zoom-val" onclick={fitToView} title="Вписать (0)">
          <EditorIcon svg={editorIcons.resizeFit} size={16} />
          {Math.round(zoom * 100)}%
        </button>
        <button type="button" class="figma__tool" onclick={() => zoomBy(1.1)} title="Увеличить">
          <EditorIcon svg={editorIcons.add} size={16} />
        </button>
      </div>

      {#if onClose || onSave}
        <div class="figma__actions">
          {#if onClose}
            <button type="button" class="figma__text-btn" onclick={onClose}>Закрыть редактор</button>
          {/if}
          {#if onSave}
          <button type="button" class="figma__save" disabled={busy} onclick={onSave} title="Сохранить">
            {busy ? 'Сохранение…' : 'Сохранить'}
          </button>
          {/if}
        </div>
      {/if}
    </div>
  </header>

  {#if error}
    <p class="figma__error" role="alert">{error}</p>
  {/if}

  <div class="figma__body">
    <aside class="figma__layers">
      <div class="figma__panel-head">
        <span>Layers</span>
        <span class="figma__panel-sub">{variant}</span>
      </div>
      <ul class="figma__layer-list" role="tree" aria-label="Слои">
        {#each layers as { node, depth } (node.id)}
          {@const restN = restDoc.nodes[node.id]}
          {@const hoverN = hoverDoc.nodes[node.id]}
          {@const live = variant === 'hover' ? hoverN : restN}
          <li>
            <!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
            <div
              class="figma__layer"
              class:figma__layer--on={selectedId === node.id}
              class:figma__layer--ghost={live && !isLayerShown(live)}
              class:figma__layer--drop-before={layerDrop?.id === node.id && layerDrop.place === 'before'}
              class:figma__layer--drop-after={layerDrop?.id === node.id && layerDrop.place === 'after'}
              class:figma__layer--drop-inside={layerDrop?.id === node.id && layerDrop.place === 'inside'}
              style:padding-left="{0.45 + depth * 0.7}rem"
              draggable={node.id !== restDoc.rootId}
              role="treeitem"
              aria-selected={selectedId === node.id}
              aria-level={depth + 1}
              tabindex="0"
              onkeydown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(node.id); }
              }}
              onclick={() => select(node.id)}
              ondragstart={(e) => onLayerDragStart(e, node.id)}
              ondragover={(e) => onLayerDragOver(e, node.id)}
              ondrop={(e) => onLayerDrop(e, node.id)}
              ondragend={onLayerDragEnd}
            >
              <span class="figma__layer-main">
                <span class="figma__layer-ico"><EditorIcon svg={layerIconSvg(node.type)} size={16} /></span>
                <span class="figma__layer-name">{node.name || node.type}</span>
                {#if hoverDiffers(restN ?? null, hoverN ?? null)}
                  <span class="figma__dot" title="Rest и Hover различаются"></span>
                {/if}
              </span>
              <button
                type="button"
                class="figma__eye"
                class:figma__eye--off={live && !isLayerShown(live)}
                title={live && !isLayerShown(live) ? 'Показать' : 'Скрыть'}
                onclick={(e) => { e.stopPropagation(); toggleVisible(node.id); }}
              ><EditorIcon svg={live && !isLayerShown(live) ? editorIcons.show : editorIcons.hide} size={16} /></button>
              <button
                type="button"
                class="figma__lock"
                class:figma__lock--on={node.locked}
                title={node.locked ? 'Разблокировать' : 'Заблокировать'}
                onclick={(e) => { e.stopPropagation(); toggleLocked(node.id); }}
              ><EditorIcon svg={node.locked ? editorIcons.lock : editorIcons.unlock} size={16} /></button>
            </div>
          </li>
        {/each}
      </ul>
    </aside>

    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="figma__stage-wrap"
      class:figma__stage-wrap--preview={livePreview}
      class:figma__stage-wrap--hand={tool === 'hand' || spaceDown}
      class:figma__stage-wrap--panning={panning}
      bind:this={stageEl}
      ondragover={(e) => e.preventDefault()}
      ondrop={onDrop}
      onpointerdown={onStagePointerDown}
      role="application"
      aria-label="Холст"
    >
      <div class="figma__world" style:transform="translate({panX}px, {panY}px)">
      <div
        class="figma__artboard"
        style:width="{restDoc.width * zoom}px"
        style:height="{restDoc.height * zoom}px"
        onpointerenter={() => { pointerHover = true; }}
        onpointerleave={() => { pointerHover = false; }}
      >
        <canvas class="figma__crt" bind:this={previewCanvas} aria-hidden="true"></canvas>
        <div
          class="figma__hits"
          style:width="{restDoc.width}px"
          style:height="{restDoc.height}px"
          style:transform="scale({zoom})"
        >
          {#if !livePreview}
            {#each layers as { node } (node.id)}
              {#if node.id !== restDoc.rootId}
                {@const liveBox = abs(activeDoc, node.id)}
                {@const otherBox = abs(variant === 'hover' ? restDoc : hoverDoc, node.id)}
                {#if onion && otherBox && hoverDiffers(restDoc.nodes[node.id] ?? null, hoverDoc.nodes[node.id] ?? null)}
                  <div
                    class="figma__onion-box"
                    class:figma__onion-box--hover={variant === 'rest'}
                    style:left="{otherBox.x}px"
                    style:top="{otherBox.y}px"
                    style:width="{otherBox.w}px"
                    style:height="{otherBox.h}px"
                  ></div>
                {/if}
                {#if liveBox && (variant === 'hover' ? nodeOpacity(hoverDoc.nodes[node.id]) : nodeOpacity(restDoc.nodes[node.id])) > 0.01}
                  <div
                    class="figma__node"
                    class:figma__node--on={selectedId === node.id}
                    style:left="{liveBox.x}px"
                    style:top="{liveBox.y}px"
                    style:width="{liveBox.w}px"
                    style:height="{liveBox.h}px"
                    onpointerdown={(e) => onNodePointerDown(e, node.id)}
                  ></div>
                {/if}
              {/if}
            {/each}

            {#if selected && selectedId && mixedSel}
              {@const boxSel = selectedId === restDoc.rootId
                ? { x: 0, y: 0, w: restDoc.width, h: restDoc.height }
                : abs(activeDoc, selectedId)}
              {#if boxSel}
                <div
                  class="figma__bbox"
                  style:left="{boxSel.x}px"
                  style:top="{boxSel.y}px"
                  style:width="{boxSel.w}px"
                  style:height="{boxSel.h}px"
                >
                  <span class="figma__bbox-label">{Math.round(boxSel.w)} × {Math.round(boxSel.h)}</span>
                  {#each ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as h}
                    <span
                      class="figma__handle figma__handle--{h}"
                      onpointerdown={(e) => onResizeDown(e, selectedId!, h)}
                    ></span>
                  {/each}
                </div>
              {/if}
            {/if}
          {/if}
        </div>
      </div>
      </div>
      {#if livePreview}
        <p class="figma__hint-live">Наведите курсор — анимация как в публичном iframe</p>
      {/if}
    </div>

    <aside class="figma__inspector">
      <div class="figma__panel-head">
        <span>{selected ? (selected.type === 'frame' ? 'Frame' : selected.type === 'text' ? 'Text' : selected.type === 'image' ? (selected.iconId || selected.name === 'Icon' ? 'Icon' : 'Image') : 'Rectangle') : 'Frame'} · {variant}</span>
      </div>

      {#if selected && selectedId && selectedRest && selectedHover}
        {#if selectedId !== restDoc.rootId && hoverDiffers(selectedRest, selectedHover)}
          <section class="figma__sec figma__sec--diff">
            <div class="figma__sec-title">Rest и Hover отличаются</div>
            <div class="figma__diff-actions">
              <button type="button" onclick={() => commit(copyNodeVisual(view, selectedId!, 'rest', 'hover'))}>Как Rest</button>
              <button type="button" onclick={() => commit(copyNodeVisual(view, selectedId!, 'hover', 'rest'))}>Как Hover</button>
            </div>
          </section>
        {/if}

        <section class="figma__sec">
          <div class="figma__sec-title">Position · {variant}</div>
          <div class="figma__align">
            <button type="button" title="Left" onclick={() => alignSelected('left')}>
              <EditorIcon svg={editorIcons.alignLeft} size={18} />
            </button>
            <button type="button" title="Center H" onclick={() => alignSelected('hcenter')}>
              <EditorIcon svg={editorIcons.alignCenterH} size={18} />
            </button>
            <button type="button" title="Right" onclick={() => alignSelected('right')}>
              <EditorIcon svg={editorIcons.alignRight} size={18} />
            </button>
            <button type="button" title="Top" onclick={() => alignSelected('top')}>
              <EditorIcon svg={editorIcons.alignTop} size={18} />
            </button>
            <button type="button" title="Center V" onclick={() => alignSelected('vcenter')}>
              <EditorIcon svg={editorIcons.alignMiddle} size={18} />
            </button>
            <button type="button" title="Bottom" onclick={() => alignSelected('bottom')}>
              <EditorIcon svg={editorIcons.alignBottom} size={18} />
            </button>
          </div>
          {#if selectedId === restDoc.rootId}
            <div class="figma__size">
              <label>W <input type="number" min="64" step="1" value={Math.round(restDoc.width)} oninput={(e) => setArtboardWidth(Number(e.currentTarget.value))} /></label>
              <button
                type="button"
                class="figma__lock-aspect"
                class:is-on={aspectLock}
                title={aspectLock ? 'Unlock aspect ratio' : 'Lock aspect ratio'}
                onclick={() => (aspectLock = !aspectLock)}
              >
                <EditorIcon svg={aspectLock ? editorIcons.lockAspect : editorIcons.unlockAspect} size={18} />
              </button>
              <label>H <input type="number" min="64" step="1" value={Math.round(restDoc.height)} oninput={(e) => setArtboardHeight(Number(e.currentTarget.value))} /></label>
            </div>
            <div class="figma__presets" role="group" aria-label="Размер Frame">
              {#each ARTBOARD_PRESETS as preset}
                <button
                  type="button"
                  class:is-on={restDoc.width === preset.w && restDoc.height === preset.h}
                  onclick={() => applyArtboardPreset(preset.w, preset.h)}
                >{preset.label}</button>
              {/each}
            </div>
          {:else}
            <div class="figma__row2">
              <label>X <input type="number" step="0.5" value={selected.x.toFixed(1)} oninput={(e) => commitVariant(selectedId!, { x: Number(e.currentTarget.value) })} /></label>
              <label>Y <input type="number" step="0.5" value={selected.y.toFixed(1)} oninput={(e) => commitVariant(selectedId!, { y: Number(e.currentTarget.value) })} /></label>
            </div>
            <div class="figma__row2">
              <label>W <input type="number" step="0.1" value={selected.w.toFixed(2)} oninput={(e) => commitVariant(selectedId!, { w: Math.max(1, Number(e.currentTarget.value)) })} /></label>
              <label>H <input type="number" step="0.1" value={selected.h.toFixed(2)} oninput={(e) => commitVariant(selectedId!, { h: Math.max(1, Number(e.currentTarget.value)) })} /></label>
            </div>
          {/if}
          <div class="figma__row2">
            <label title="Поворот"><span class="figma__field-ico"><EditorIcon svg={editorIcons.rotation} size={16} /></span> <input type="number" step="1" value={selected.rotation} oninput={(e) => commitVariant(selectedId!, { rotation: Number(e.currentTarget.value) })} /></label>
            <label title="Прозрачность, %"><span class="figma__field-ico"><EditorIcon svg={editorIcons.opacity} size={16} /></span> <input type="number" step="1" min="0" max="100" value={Math.round(selected.opacity * 100)} oninput={(e) => commitVariant(selectedId!, { opacity: Math.min(1, Math.max(0, Number(e.currentTarget.value) / 100)) })} /></label>
          </div>
        </section>

        {#if selected.type === 'frame'}
          <section class="figma__sec">
            <div class="figma__sec-title">Auto layout</div>
            <div class="figma__seg">
              <button type="button" class:is-on={selected.layoutMode === 'none'} onclick={() => setFrameField({ layoutMode: 'none' })} title="Free">
                <EditorIcon svg={editorIcons.layoutFree} size={18} />
              </button>
              <button type="button" class:is-on={selected.layoutMode === 'horizontal'} onclick={() => setFrameField({ layoutMode: 'horizontal' })} title="Horizontal">
                <EditorIcon svg={editorIcons.layoutH} size={18} />
              </button>
              <button type="button" class:is-on={selected.layoutMode === 'vertical'} onclick={() => setFrameField({ layoutMode: 'vertical' })} title="Vertical">
                <EditorIcon svg={editorIcons.layoutV} size={18} />
              </button>
            </div>
            <div class="figma__row2">
              <label>Gap <input type="number" value={selected.itemSpacing} oninput={(e) => setFrameField({ itemSpacing: Number(e.currentTarget.value) })} /></label>
              <label>Radius <input type="number" value={selected.cornerRadius} oninput={(e) => setFrameField({ cornerRadius: Number(e.currentTarget.value) })} /></label>
            </div>
            <label class="figma__check"><input type="checkbox" checked={selected.clipsContent} onchange={(e) => setFrameField({ clipsContent: e.currentTarget.checked })} /> Clip content</label>
          </section>
        {/if}

        {#if selected.type === 'text'}
          <section class="figma__sec">
            <div class="figma__sec-title">Typography · {variant}</div>
            <label class="figma__full">Font
              <select value={selected.fontFamily} onchange={(e) => setTextField('fontFamily', e.currentTarget.value)}>
                <option>IBM Plex Sans</option>
                <option>Inter</option>
                <option>Georgia</option>
                <option>monospace</option>
              </select>
            </label>
            <div class="figma__row2">
              <label>Weight
                <select value={String(selected.fontWeight)} onchange={(e) => setTextField('fontWeight', Number(e.currentTarget.value))}>
                  <option value="400">Regular</option>
                  <option value="500">Medium</option>
                  <option value="600">Semi Bold</option>
                  <option value="700">Bold</option>
                </select>
              </label>
              <label>Size <input type="number" value={selected.fontSize} oninput={(e) => setTextField('fontSize', Number(e.currentTarget.value))} /></label>
            </div>
            <div class="figma__seg">
              <button type="button" class:is-on={selected.textAlign === 'left'} onclick={() => setTextField('textAlign', 'left')} title="Left">
                <EditorIcon svg={editorIcons.textAlignLeft} size={18} />
              </button>
              <button type="button" class:is-on={selected.textAlign === 'center'} onclick={() => setTextField('textAlign', 'center')} title="Center">
                <EditorIcon svg={editorIcons.textAlignCenter} size={18} />
              </button>
              <button type="button" class:is-on={selected.textAlign === 'right'} onclick={() => setTextField('textAlign', 'right')} title="Right">
                <EditorIcon svg={editorIcons.textAlignRight} size={18} />
              </button>
            </div>
            <label class="figma__full">Content
              <textarea rows="3" value={selected.characters} oninput={(e) => setTextField('characters', e.currentTarget.value)}></textarea>
            </label>
          </section>
        {/if}

        {#if selected.type === 'image'}
          <section class="figma__sec">
            <div class="figma__sec-title">
              <span class="figma__sec-title-row">
                <span class="figma__tool-svg">{@html bannerIconSvg('star', 16)}</span>
                Icon
              </span>
            </div>
            <input
              class="figma__icon-search"
              type="search"
              placeholder="Найти иконку"
              value={iconQuery}
              oninput={(e) => (iconQuery = e.currentTarget.value)}
              aria-label="Найти иконку"
            />
            <div class="figma__icons" role="listbox" aria-label="Иконка слоя">
              {#each iconChoices as ic (ic.id)}
                <button
                  type="button"
                  class="figma__icon"
                  class:figma__icon--on={selectedIconId === ic.id}
                  role="option"
                  aria-selected={selectedIconId === ic.id}
                  title={ic.label}
                  onclick={() => applyBannerIcon(ic.id)}
                >
                  {@html bannerIconSvg(ic.id, 16)}
                </button>
              {/each}
            </div>
            {#if iconChoices.length === 0}
              <p class="figma__hint">Ничего не найдено</p>
            {/if}
          </section>
        {/if}

        <section class="figma__sec">
          <div class="figma__sec-title">
            <span class="figma__sec-title-row">
              <EditorIcon svg={editorIcons.styleFill} size={18} />
              Fill
            </span>
            <div class="figma__fx-add">
              <button
                type="button"
                class="figma__icon-btn"
                title="Добавить заливку"
                aria-expanded={addFillOpen}
                onclick={() => (addFillOpen = !addFillOpen)}
              >
                <EditorIcon svg={editorIcons.add} size={16} />
              </button>
              {#if addFillOpen}
                <div class="figma__fx-menu" role="menu">
                  <button type="button" role="menuitem" onclick={addFillSolid}>Solid</button>
                  <button type="button" role="menuitem" onclick={addFillLinear}>Linear</button>
                  <button type="button" role="menuitem" onclick={addFillImage}>Image</button>
                </div>
              {/if}
            </div>
          </div>

          {#if selected.type === 'image' && isSvgDataUrl(selected.src)}
            <div class="figma__fill-row figma__fill-row--tint">
              <span class="figma__swatch" style:background={solidColor()}>
                <input type="color" value={solidColor()} oninput={(e) => setSolidColor(e.currentTarget.value)} aria-label="Tint" />
              </span>
              <input class="figma__fill-hex" type="text" value={solidColor().replace('#', '')} onchange={(e) => {
                const hex = parseHexInput(e.currentTarget.value);
                if (hex) setSolidColor(hex);
              }} />
              <span class="figma__fill-kind">Tint</span>
            </div>
          {/if}

          <div class="figma__fill-stack" role="list">
          {#each selectedFillList() as paint, index (paint.id)}
            <div
              class="figma__fill-item"
              class:figma__fill-item--off={paint.visible === false}
              class:figma__fill-item--on={expandedFillId === paint.id}
              role="listitem"
            >
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <div
                class="figma__fill-row"
                ondragover={(e) => { e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'; }}
                ondrop={(e) => onFillDrop(index, e)}
              >
                <button
                  type="button"
                  class="figma__fill-grip"
                  title="Перетащить"
                  draggable="true"
                  ondragstart={(e) => onFillDragStart(index, e)}
                  ondragend={() => (fillDragIndex = null)}
                  aria-label="Перетащить заливку"
                ></button>
                <button
                  type="button"
                  class="figma__swatch"
                  style={fillSwatchStyle(paint)}
                  onclick={() => (expandedFillId = expandedFillId === paint.id ? null : paint.id)}
                  aria-label="Параметры заливки"
                >
                  {#if paint.type === 'solid'}
                    <input
                      type="color"
                      value={paint.color}
                      onclick={(e) => e.stopPropagation()}
                      oninput={(e) => patchFill(paint.id, { color: e.currentTarget.value })}
                    />
                  {/if}
                </button>
                {#if paint.type === 'solid'}
                  <input
                    class="figma__fill-hex"
                    type="text"
                    value={fillLabel(paint)}
                    onchange={(e) => {
                      const hex = parseHexInput(e.currentTarget.value);
                      if (hex) patchFill(paint.id, { color: hex });
                    }}
                  />
                {:else}
                  <button type="button" class="figma__fill-hex figma__fill-hex--btn" onclick={() => (expandedFillId = expandedFillId === paint.id ? null : paint.id)}>
                    {fillLabel(paint)}
                  </button>
                {/if}
                <label class="figma__fill-op">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="1"
                    value={Math.round(paint.opacity * 100)}
                    oninput={(e) => patchFill(paint.id, { opacity: Math.min(1, Math.max(0, Number(e.currentTarget.value) / 100)) })}
                  />
                  <span>%</span>
                </label>
                <button
                  type="button"
                  class="figma__eye"
                  class:figma__eye--off={paint.visible === false}
                  title={paint.visible === false ? 'Показать заливку' : 'Скрыть заливку'}
                  onclick={() => toggleFillVisible(paint.id)}
                ><EditorIcon svg={paint.visible === false ? editorIcons.show : editorIcons.hide} size={16} /></button>
                <button
                  type="button"
                  class="figma__lock"
                  title="Удалить заливку"
                  onclick={() => deleteFill(paint.id)}
                ><EditorIcon svg={editorIcons.remove} size={16} /></button>
              </div>

              {#if expandedFillId === paint.id && paint.type === 'gradient'}
                <div class="figma__fill-extra">
                  <label class="figma__slider">
                    <span>Angle</span>
                    <input type="range" min="0" max="360" step="1" value={paint.angle ?? 180} oninput={(e) => patchFill(paint.id, { angle: Number(e.currentTarget.value) })} />
                    <span>{Math.round(paint.angle ?? 180)}°</span>
                  </label>
                  {#each paint.stops as stop, si}
                    <div class="figma__fill-stop">
                      <span class="figma__swatch" style:background={stopCssColor(stop)}>
                        <input type="color" value={sanitizeHexRgb(stop.color)} oninput={(e) => {
                          const stops = paint.stops.map((s, i) => i === si ? { ...s, color: e.currentTarget.value } : s);
                          patchFill(paint.id, { stops });
                        }} />
                      </span>
                      <input
                        class="figma__fill-hex"
                        type="text"
                        value={sanitizeHexRgb(stop.color).replace('#', '').toUpperCase()}
                        onchange={(e) => {
                          const hex = parseHexInput(e.currentTarget.value);
                          if (!hex) return;
                          const stops = paint.stops.map((s, i) => i === si ? { ...s, color: hex } : s);
                          patchFill(paint.id, { stops });
                        }}
                      />
                      <label class="figma__fill-op" title="Позиция">
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="1"
                          value={Math.round(stop.position * 100)}
                          oninput={(e) => {
                            const stops = paint.stops.map((s, i) => i === si ? { ...s, position: Math.min(1, Math.max(0, Number(e.currentTarget.value) / 100)) } : s);
                            patchFill(paint.id, { stops });
                          }}
                        />
                        <span>%</span>
                      </label>
                      <label class="figma__fill-op" title="Прозрачность стопа">
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="1"
                          value={Math.round((stop.opacity ?? 1) * 100)}
                          oninput={(e) => {
                            const stops = paint.stops.map((s, i) => i === si ? { ...s, opacity: Math.min(1, Math.max(0, Number(e.currentTarget.value) / 100)) } : s);
                            patchFill(paint.id, { stops });
                          }}
                        />
                        <span>A</span>
                      </label>
                    </div>
                  {/each}
                </div>
              {/if}

              {#if expandedFillId === paint.id && paint.type === 'image'}
                <div class="figma__fill-extra">
                  <div class="figma__fill-img-actions">
                    <button type="button" class="figma__mini" onclick={() => { pendingFillTarget = paint.id; fillFileInput?.click(); }}>Replace…</button>
                    <select
                      value={paint.scaleMode}
                      onchange={(e) => patchFill(paint.id, { scaleMode: e.currentTarget.value })}
                    >
                      <option value="fill">Fill</option>
                      <option value="fit">Fit</option>
                      <option value="crop">Crop</option>
                      <option value="tile">Tile</option>
                    </select>
                  </div>
                </div>
              {/if}
            </div>
          {/each}
          </div>
        </section>

        <section class="figma__sec">
          <div class="figma__sec-title">
            <span class="figma__sec-title-row">
              <EditorIcon svg={editorIcons.styleEffect} size={18} />
              Effects
            </span>
            <div class="figma__fx-add">
              <button
                type="button"
                class="figma__icon-btn"
                title="Добавить эффект"
                aria-expanded={addFxOpen}
                onclick={() => (addFxOpen = !addFxOpen)}
              >
                <EditorIcon svg={editorIcons.add} size={16} />
              </button>
              {#if addFxOpen}
                <div class="figma__fx-menu" role="menu">
                  <button
                    type="button"
                    role="menuitem"
                    disabled={Boolean(liveCrtEffect())}
                    onclick={addCrtToSelected}
                  >
                    CRT Screen
                  </button>
                  {#each AD_SHADER_CATALOG as item}
                    <button
                      type="button"
                      role="menuitem"
                      disabled={Boolean(selected.effects?.some((e) => e.type === item.type))}
                      onclick={() => addShaderToSelected(item.type)}
                    >
                      {item.label}{#if item.animated}<span class="figma__fx-live">live</span>{/if}
                    </button>
                  {/each}
                </div>
              {/if}
            </div>
          </div>
          {#if !(selected.effects ?? []).length}
            <p class="figma__hint-inline">Эффект можно повесить на любой слой. Параметры правят только текущий стейт (Rest или Hover). Глаз скрывает в нём, минус удаляет в обоих.</p>
          {/if}
          {#each (selected.effects ?? []) as fx (fx.id)}
            {#if fx.type === 'crt'}
              {@const crt = liveCrtParams()}
              <div class="figma__fx" class:figma__fx--off={!fx.visible}>
                <div class="figma__fx-row">
                  <span class="figma__fx-ico"><EditorIcon svg={editorIcons.styleEffect} size={16} /></span>
                  <span class="figma__fx-name">CRT Screen <span class="figma__fx-var">· {variant === 'hover' ? 'Hover' : 'Rest'}</span></span>
                  <button
                    type="button"
                    class="figma__eye"
                    class:figma__eye--off={!fx.visible}
                    title={fx.visible ? 'Скрыть эффект' : 'Показать эффект'}
                    onclick={() => toggleEffectVisible(fx.id)}
                  ><EditorIcon svg={fx.visible ? editorIcons.hide : editorIcons.show} size={16} /></button>
                  <button
                    type="button"
                    class="figma__lock"
                    title="Удалить эффект"
                    onclick={() => deleteEffect(fx.id)}
                  ><EditorIcon svg={editorIcons.remove} size={16} /></button>
                </div>
                {@render effectCopyRow(fx.id)}
                {#each CRT_INSPECTOR_FIELDS as field}
                  {#if field.kind === 'range'}
                    <label class="figma__slider">
                      <span>{field.label}</span>
                      <input
                        type="range"
                        min={field.min}
                        max={field.max}
                        step={field.step}
                        value={Number(crt[field.key])}
                        oninput={(e) => patchCrtParam(field.key, Number(e.currentTarget.value))}
                      />
                      <span>{formatCrtValue(field.key as CrtSliderKey, Number(crt[field.key]), field.unit)}</span>
                    </label>
                  {:else if field.kind === 'select'}
                    <label class="figma__full">
                      {field.label}
                      <select
                        value={String(crt[field.key])}
                        onchange={(e) => patchCrtParam(field.key, Number(e.currentTarget.value))}
                      >
                        {#each field.options as opt}
                          <option value={String(opt.value)}>{opt.label}</option>
                        {/each}
                      </select>
                    </label>
                  {:else if field.kind === 'toggle'}
                    <label class="figma__check">
                      <input
                        type="checkbox"
                        checked={Boolean(crt.clipToCurve)}
                        onchange={(e) => patchCrtParam('clipToCurve', e.currentTarget.checked)}
                      />
                      {field.label}
                    </label>
                  {/if}
                {/each}
              </div>
            {:else if isAdShaderType(fx.type) && effectHasParams(fx)}
              {@const spec = shaderCatalogItem(fx.type)}
              {#if spec}
                <div class="figma__fx" class:figma__fx--off={!fx.visible}>
                  <div class="figma__fx-row">
                    <span class="figma__fx-ico"><EditorIcon svg={editorIcons.styleEffect} size={16} /></span>
                    <span class="figma__fx-name">{spec.label} <span class="figma__fx-var">· {variant === 'hover' ? 'Hover' : 'Rest'}</span></span>
                    <button
                      type="button"
                      class="figma__eye"
                      class:figma__eye--off={!fx.visible}
                      title={fx.visible ? 'Скрыть эффект' : 'Показать эффект'}
                      onclick={() => toggleEffectVisible(fx.id)}
                    ><EditorIcon svg={fx.visible ? editorIcons.hide : editorIcons.show} size={16} /></button>
                    <button
                      type="button"
                      class="figma__lock"
                      title="Удалить эффект"
                      onclick={() => deleteEffect(fx.id)}
                    ><EditorIcon svg={editorIcons.remove} size={16} /></button>
                  </div>
                  {@render effectCopyRow(fx.id)}
                  {#each spec.fields as field}
                    {#if field.kind === 'range'}
                      <label class="figma__slider">
                        <span>{field.label}</span>
                        <input
                          type="range"
                          min={field.min}
                          max={field.max}
                          step={field.step}
                          value={Number(fx.params[field.key] ?? spec.defaults[field.key] ?? 0)}
                          oninput={(e) => patchFxParam(fx.id, field.key, Number(e.currentTarget.value))}
                        />
                        <span>{formatShaderValue(field, fx.params[field.key] ?? spec.defaults[field.key] ?? 0)}</span>
                      </label>
                    {:else if field.kind === 'select'}
                      <label class="figma__full">
                        {field.label}
                        <select
                          value={String(fx.params[field.key] ?? spec.defaults[field.key] ?? 0)}
                          onchange={(e) => patchFxParam(fx.id, field.key, Number(e.currentTarget.value))}
                        >
                          {#each field.options as opt}
                            <option value={String(opt.value)}>{opt.label}</option>
                          {/each}
                        </select>
                      </label>
                    {:else if field.kind === 'toggle'}
                      <label class="figma__check">
                        <input
                          type="checkbox"
                          checked={fx.params[field.key] === 1 || fx.params[field.key] === true}
                          onchange={(e) => patchFxParam(fx.id, field.key, e.currentTarget.checked ? 1 : 0)}
                        />
                        {field.label}
                      </label>
                    {:else if field.kind === 'color'}
                      <label class="figma__full">
                        {field.label}
                        <input
                          type="color"
                          value={sanitizeHexRgb(String(fx.params[field.key] ?? spec.defaults[field.key] ?? '#ffffff'))}
                          oninput={(e) => patchFxParam(fx.id, field.key, e.currentTarget.value)}
                        />
                      </label>
                    {/if}
                  {/each}
                </div>
              {/if}
            {/if}
          {/each}
        </section>

        <section class="figma__sec">
          <label class="figma__check"><input type="checkbox" checked={isLayerShown(selected)} onchange={(e) => {
            if (!selectedId || !selected) return;
            if (e.currentTarget.checked) commitVariant(selectedId, { visible: true, opacity: selected.opacity > 0.02 ? selected.opacity : 1 });
            else commitVariant(selectedId, { visible: false });
          }} /> Visible</label>
          <label class="figma__check"><input type="checkbox" checked={selected.locked} onchange={(e) => commit(patchSharedMeta(view, selectedId!, { locked: e.currentTarget.checked }))} /> Locked</label>
          <label class="figma__full">Name <input type="text" value={selected.name} oninput={(e) => commit(patchSharedMeta(view, selectedId!, { name: e.currentTarget.value }))} /></label>
          {#if selectedId !== restDoc.rootId}
            <button type="button" class="figma__danger" onclick={deleteSelected}>Удалить слой</button>
          {/if}
        </section>
      {:else}
        <p class="figma__hint">Переключайте Rest и Hover сверху: правки идут в текущий стейт. Новый слой появляется в обоих. Глаз скрывает только выбранный стейт.</p>
      {/if}
    </aside>
  </div>
</div>

<style lang="scss">
.figma {
  --figma-bg: #1e1e1e;
  --figma-panel: #2c2c2c;
  --figma-input: #3c3c3c;
  --figma-border: #444;
  --figma-blue: #0d99ff;
  --figma-purple: #7b61ff;
  --figma-text: #f5f5f5;
  --figma-muted: #a0a0a0;
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  background: #1e1e1e;
  color: var(--figma-text);
  font-size: 11px;
}

.figma__toolbar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem;
  padding: 0.3rem 0.55rem;
  background: #2c2c2c;
  border-bottom: 1px solid #1a1a1a;
  flex-shrink: 0;
}

.figma__toolbar-end {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  margin-left: auto;
  flex-shrink: 0;
}

.figma__title {
  position: relative;
  flex: 1 1 12rem;
  min-width: 8rem;
  max-width: 22rem;
  display: flex;
  align-items: center;
  input {
    width: 100%;
    border: 0;
    border-radius: 6px;
    background: #383838;
    color: var(--figma-text);
    font: inherit;
    font-size: 12px;
    font-weight: 600;
    padding: 0.45rem 0.65rem;
    outline: none;
    &:focus {
      box-shadow: inset 0 0 0 1px var(--figma-blue);
    }
    &::placeholder {
      color: var(--figma-muted);
      font-weight: 500;
    }
  }
}

.figma__sr {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.figma__actions {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
}

.figma__text-btn,
.figma__save {
  border: 0;
  border-radius: 6px;
  font: inherit;
  font-weight: 600;
  padding: 0.4rem 0.75rem;
  cursor: pointer;
  flex-shrink: 0;
  white-space: nowrap;
}

.figma__text-btn {
  background: transparent;
  color: #ddd;
  &:hover { background: rgba(255, 255, 255, 0.08); }
}

.figma__save {
  min-width: 7.25rem;
  background: var(--figma-blue);
  color: #fff;
  &:hover:not(:disabled) { filter: brightness(1.08); }
  &:disabled { opacity: 0.55; cursor: default; }
}

.figma__error {
  margin: 0;
  padding: 0.4rem 0.75rem;
  background: #3d1f1f;
  color: #ffb4b4;
  border-bottom: 1px solid #1a1a1a;
  flex-shrink: 0;
}

.figma__tool-svg {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: inherit;
  :global(svg) {
    display: block;
  }
}

.figma__tools,
.figma__zoom,
.figma__variants {
  display: inline-flex;
  align-items: center;
  gap: 0.15rem;
  padding: 0.12rem;
  border-radius: 8px;
  background: #383838;
}

.figma__sep {
  width: 1px;
  height: 1.2rem;
  margin: 0 0.2rem;
  background: #555;
}

.figma__tool {
  width: 2.35rem;
  height: 2.35rem;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: #ddd;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  &--on,
  &:hover {
    background: var(--figma-blue);
    color: #fff;
  }
}

.figma__var {
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: #ccc;
  font: inherit;
  font-weight: 600;
  padding: 0.35rem 0.65rem;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  &--on {
    background: var(--figma-blue);
    color: #fff;
  }
  &--play.figma__var--on {
    background: #1bc47d;
  }
}

.figma__onion {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  color: var(--figma-muted);
  padding: 0 0.35rem;
  cursor: pointer;
}

.figma__zoom-val {
  min-width: 4.4rem;
  border: 0;
  background: transparent;
  color: #ddd;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.2rem;
}

.figma__body {
  display: grid;
  grid-template-columns: 13.5rem minmax(0, 1fr) 17rem;
  min-height: 0;
  flex: 1;
}

.figma__layers,
.figma__inspector {
  background: var(--figma-panel);
  border-right: 1px solid #1a1a1a;
  overflow: auto;
  min-height: 0;
}

.figma__inspector {
  border-right: 0;
  border-left: 1px solid #1a1a1a;
}

.figma__panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.55rem 0.7rem;
  font-weight: 600;
  border-bottom: 1px solid #1a1a1a;
}

.figma__panel-sub {
  color: var(--figma-muted);
  font-weight: 500;
  text-transform: capitalize;
}

.figma__layer-list {
  list-style: none;
  margin: 0;
  padding: 0.25rem;
}

.figma__layer {
  display: flex;
  align-items: center;
  gap: 0.15rem;
  width: 100%;
  border-radius: 4px;
  color: inherit;
  padding: 0.1rem 0.2rem 0.1rem 0;
  position: relative;
  cursor: grab;
  &--on { background: #0c6dd8; }
  &--ghost { opacity: 0.45; }
  &:hover:not(&--on) { background: #3a3a3a; }
  &--drop-before::before,
  &--drop-after::after {
    content: '';
    position: absolute;
    left: 0.35rem;
    right: 0.35rem;
    height: 2px;
    background: var(--figma-blue);
    pointer-events: none;
  }
  &--drop-before::before { top: 0; }
  &--drop-after::after { bottom: 0; }
  &--drop-inside {
    outline: 1px solid var(--figma-blue);
    outline-offset: -1px;
  }
}

.figma__layer-main {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  flex: 1;
  min-width: 0;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  padding: 0.18rem 0.2rem;
}

.figma__layer-ico { width: 1.15rem; display: inline-flex; opacity: 0.9; }
.figma__layer-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.figma__dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--figma-purple);
  flex-shrink: 0;
}
.figma__eye, .figma__lock {
  opacity: 0.55;
  padding: 0;
  width: 1.6rem;
  height: 1.6rem;
  border: 0;
  border-radius: 4px;
  background: transparent;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: inherit;
  cursor: pointer;
  flex-shrink: 0;
  &--off, &--on { opacity: 1; }
  &:hover { background: rgba(255, 255, 255, 0.12); opacity: 1; }
}

.figma__stage-wrap {
  position: relative;
  overflow: hidden;
  background:
    linear-gradient(45deg, #252525 25%, transparent 25%) 0 0 / 16px 16px,
    linear-gradient(-45deg, #252525 25%, transparent 25%) 0 0 / 16px 16px,
    #1e1e1e;
  touch-action: none;
  cursor: default;
  &--preview { cursor: default; }
  &--hand { cursor: grab; }
  &--panning { cursor: grabbing; }
}

.figma__world {
  position: absolute;
  left: 0;
  top: 0;
  will-change: transform;
}

.figma__artboard {
  position: relative;
  box-shadow: 0 0 0 1px #111, 0 18px 50px rgba(0, 0, 0, 0.5);
}

.figma__crt {
  display: block;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

.figma__hits {
  position: absolute;
  left: 0;
  top: 0;
  transform-origin: top left;
  pointer-events: none;
}

.figma__node {
  position: absolute;
  z-index: 2;
  box-sizing: border-box;
  cursor: grab;
  pointer-events: auto;
  border: 1px solid transparent;
  &:hover { border-color: rgba(13, 153, 255, 0.45); }
  &--on { border-color: var(--figma-blue); }
}

.figma__onion-box {
  position: absolute;
  z-index: 1;
  box-sizing: border-box;
  border: 1px dashed rgba(255, 176, 32, 0.7);
  pointer-events: none;
  &--hover { border-color: rgba(123, 97, 255, 0.85); }
}

.figma__bbox {
  position: absolute;
  z-index: 20;
  border: 1.5px solid var(--figma-blue);
  pointer-events: none;
  box-sizing: border-box;
}

.figma__bbox-label {
  position: absolute;
  left: 0;
  top: -1.2rem;
  padding: 0.1rem 0.3rem;
  border-radius: 3px;
  background: var(--figma-blue);
  color: #fff;
  font-size: 10px;
  font-weight: 600;
}

.figma__handle {
  position: absolute;
  width: 8px;
  height: 8px;
  background: #fff;
  border: 1.5px solid var(--figma-blue);
  pointer-events: auto;
  &--nw { left: -4px; top: -4px; cursor: nwse-resize; }
  &--ne { right: -4px; top: -4px; cursor: nesw-resize; }
  &--sw { left: -4px; bottom: -4px; cursor: nesw-resize; }
  &--se { right: -4px; bottom: -4px; cursor: nwse-resize; }
  &--n { left: 50%; top: -4px; margin-left: -4px; cursor: ns-resize; }
  &--s { left: 50%; bottom: -4px; margin-left: -4px; cursor: ns-resize; }
  &--e { right: -4px; top: 50%; margin-top: -4px; cursor: ew-resize; }
  &--w { left: -4px; top: 50%; margin-top: -4px; cursor: ew-resize; }
}

.figma__sec {
  padding: 0.65rem 0.7rem;
  border-bottom: 1px solid #1a1a1a;
  display: grid;
  gap: 0.4rem;
}

.figma__sec-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-weight: 600;
  color: #ddd;
}

.figma__sec-title-row {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
}

.figma__icon-search {
  width: 100%;
  border: 0;
  border-radius: 6px;
  background: var(--figma-input);
  color: inherit;
  font: inherit;
  padding: 0.35rem 0.5rem;
  outline: none;
  &:focus { box-shadow: inset 0 0 0 1px var(--figma-blue); }
}

.figma__icons {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
  max-height: 11.5rem;
  overflow: auto;
}

.figma__icon {
  width: 2rem;
  height: 2rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  border: 1px solid var(--figma-border);
  background: var(--figma-input);
  color: var(--figma-text);
  cursor: pointer;
  padding: 0;
  :global(svg) {
    width: 1rem;
    height: 1rem;
  }
  &:hover { border-color: #666; }
  &--on {
    border-color: var(--figma-blue);
    background: color-mix(in srgb, var(--figma-blue) 22%, var(--figma-input));
    color: #fff;
  }
}

.figma__size {
  display: grid;
  grid-template-columns: 1fr 1.75rem 1fr;
  gap: 0.25rem;
  align-items: end;
  label {
    display: grid;
    gap: 0.15rem;
    color: var(--figma-muted);
  }
  input {
    width: 100%;
    border: 0;
    border-radius: 4px;
    background: var(--figma-input);
    color: var(--figma-text);
    padding: 0.3rem 0.35rem;
    font: inherit;
  }
}

.figma__lock-aspect {
  width: 1.75rem;
  height: 1.75rem;
  margin-bottom: 0.05rem;
  border: 0;
  border-radius: 4px;
  background: var(--figma-input);
  color: #ccc;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  &.is-on, &:hover { background: var(--figma-blue); color: #fff; }
}

.figma__presets {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
  button {
    border: 0;
    border-radius: 4px;
    background: var(--figma-input);
    color: #ccc;
    font: inherit;
    padding: 0.28rem 0.4rem;
    cursor: pointer;
    &:hover,
    &:global(.is-on) { background: var(--figma-blue); color: #fff; }
  }
}

.figma__field-ico {
  display: inline-flex;
  color: var(--figma-muted);
  margin-right: 0.15rem;
}

.figma__hint-inline {
  margin: 0;
  color: var(--figma-muted);
  line-height: 1.35;
}

.figma__hint-live {
  position: absolute;
  left: 50%;
  bottom: 0.75rem;
  transform: translateX(-50%);
  margin: 0;
  padding: 0.3rem 0.55rem;
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.55);
  color: #ddd;
}

.figma__diff-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.3rem;
  button {
    border: 0;
    border-radius: 5px;
    background: var(--figma-input);
    color: #ddd;
    font: inherit;
    padding: 0.4rem 0.45rem;
    cursor: pointer;
    &:hover { background: var(--figma-blue); color: #fff; }
  }
}

.figma__sec--diff {
  background: rgba(123, 97, 255, 0.12);
}

.figma__row2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.35rem;
  label {
    display: grid;
    gap: 0.15rem;
    color: var(--figma-muted);
  }
  input, select {
    width: 100%;
    border: 0;
    border-radius: 4px;
    background: var(--figma-input);
    color: var(--figma-text);
    padding: 0.3rem 0.35rem;
    font: inherit;
  }
}

.figma__full {
  display: grid;
  gap: 0.2rem;
  color: var(--figma-muted);
  input, select, textarea {
    width: 100%;
    border: 0;
    border-radius: 4px;
    background: var(--figma-input);
    color: var(--figma-text);
    padding: 0.35rem;
    font: inherit;
  }
}

.figma__align,
.figma__seg {
  display: flex;
  gap: 0.2rem;
  button {
    flex: 1;
    min-height: 2.1rem;
    border: 0;
    border-radius: 4px;
    background: var(--figma-input);
    color: #ccc;
    padding: 0.28rem;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    &:hover,
    &:global(.is-on) { background: var(--figma-blue); color: #fff; }
  }
}

.figma__fill-stack {
  display: grid;
  gap: 0.28rem;
}

.figma__fill-item {
  display: grid;
  gap: 0.3rem;
  &--off { opacity: 0.45; }
  &--on .figma__fill-row { outline: 1px solid rgba(13, 153, 255, 0.45); }
}

.figma__fill-row {
  display: grid;
  grid-template-columns: 0.7rem 1.5rem minmax(0, 1fr) 3.1rem 1.5rem 1.5rem;
  gap: 0.2rem;
  align-items: center;
  min-height: 1.85rem;
  padding: 0.12rem 0.1rem 0.12rem 0.15rem;
  border-radius: 6px;
  background: var(--figma-input);
  &--tint {
    grid-template-columns: 1.5rem minmax(0, 1fr) auto;
  }
}

.figma__fill-grip {
  width: 0.7rem;
  height: 1.3rem;
  border: 0;
  padding: 0;
  cursor: grab;
  background:
    radial-gradient(circle, #8a8a8a 1.1px, transparent 1.2px) 0 0 / 4px 4px;
  opacity: 0.7;
  &:active { cursor: grabbing; }
}

.figma__swatch {
  position: relative;
  width: 1.5rem;
  height: 1.5rem;
  border: 0;
  border-radius: 4px;
  padding: 0;
  overflow: hidden;
  cursor: pointer;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.12);
  background-color: #2a2a2a;
  input[type='color'] {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    opacity: 0;
    cursor: pointer;
    border: 0;
    padding: 0;
  }
}

.figma__fill-hex {
  width: 100%;
  min-width: 0;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  padding: 0.15rem 0.2rem;
  text-transform: uppercase;
  &--btn {
    text-align: left;
    cursor: pointer;
    text-transform: none;
  }
}

.figma__fill-kind {
  color: var(--figma-muted);
  padding: 0 0.2rem;
}

.figma__fill-op {
  display: flex;
  align-items: center;
  gap: 0.1rem;
  color: var(--figma-muted);
  input {
    width: 2.1rem;
    border: 0;
    background: transparent;
    color: inherit;
    font: inherit;
    text-align: right;
    padding: 0;
  }
}

.figma__fill-extra {
  display: grid;
  gap: 0.35rem;
  padding: 0.15rem 0.2rem 0.35rem 1rem;
}

.figma__fill-stop {
  display: grid;
  grid-template-columns: 1.5rem minmax(0, 1fr) 2.7rem 2.5rem;
  gap: 0.2rem;
  align-items: center;
}

.figma__fill-img-actions {
  display: flex;
  gap: 0.35rem;
  align-items: center;
  select {
    flex: 1;
    border: 0;
    border-radius: 4px;
    background: var(--figma-input);
    color: inherit;
    font: inherit;
    padding: 0.28rem 0.35rem;
  }
}

.figma__mini {
  border: 0;
  border-radius: 4px;
  background: var(--figma-input);
  color: inherit;
  padding: 0.3rem 0.45rem;
  cursor: pointer;
  font: inherit;
}

.figma__check {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  color: #ccc;
}

.figma__hint {
  margin: 0;
  color: var(--figma-muted);
  line-height: 1.4;
  padding: 0.75rem;
}

.figma__icon-btn {
  width: 1.6rem;
  height: 1.6rem;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: inherit;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  &:hover { background: rgba(255, 255, 255, 0.12); }
}

.figma__fx-add {
  position: relative;
}

.figma__fx-menu {
  position: absolute;
  right: 0;
  top: calc(100% + 0.2rem);
  z-index: 8;
  min-width: 12rem;
  max-height: 18rem;
  overflow: auto;
  padding: 0.2rem;
  border-radius: 8px;
  background: #1f1f1f;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
  button {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.4rem;
    width: 100%;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--figma-text);
    font: inherit;
    text-align: left;
    padding: 0.4rem 0.5rem;
    cursor: pointer;
    &:hover:not(:disabled) { background: #0c6dd8; }
    &:disabled { opacity: 0.4; cursor: default; }
  }
}

.figma__fx-live {
  font-size: 9px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #7b61ff;
}

.figma__fx {
  display: grid;
  gap: 0.35rem;
  &--off { opacity: 0.55; }
}

.figma__fx-row {
  display: flex;
  align-items: center;
  gap: 0.2rem;
  min-height: 1.8rem;
  padding: 0.1rem 0.15rem 0.1rem 0.35rem;
  border-radius: 6px;
  background: var(--figma-input);
}

.figma__fx-ico {
  display: inline-flex;
  opacity: 0.85;
}

.figma__fx-name {
  flex: 1;
  min-width: 0;
  font-weight: 600;
}

.figma__fx-copy {
  justify-self: start;
}

.figma__fx-copy-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
  align-items: center;
}

.figma__fx-editing {
  color: var(--figma-muted);
  margin-right: auto;
}

.figma__fx-var {
  color: var(--figma-blue);
  font-weight: 500;
}

.figma__slider {
  display: grid;
  grid-template-columns: 5.5rem 1fr 2.5rem;
  gap: 0.35rem;
  align-items: center;
  color: var(--figma-muted);
  input { width: 100%; }
}

.figma__danger {
  border: 0;
  border-radius: 6px;
  background: #5c1f1f;
  color: #ffb4b4;
  padding: 0.45rem;
  cursor: pointer;
  font: inherit;
}
</style>
