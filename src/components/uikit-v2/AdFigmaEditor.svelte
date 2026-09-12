<script lang="ts">
  import {
    addChild,
    alignNode,
    cloneDesignDoc,
    createFrameNode,
    createImageNode,
    createRectNode,
    createTextNode,
    flattenLayers,
    getNode,
    getRoot,
    removeNode,
    solid,
    type AdDesignDoc,
    type AdDesignStates,
    type AdFrameNode,
    type AdNode,
    type AdTextNode,
  } from '../../utils/adDesignDoc';
  import {
    absBoxOf,
    applyStructure,
    cloneDesignStatesAligned,
    copyNodeVisual,
    easeInOutCubic,
    hoverDiffers,
    mixedNode,
    nodeOpacity,
    patchCurrentNode,
    patchSharedMeta,
    resizeArtboard,
    stepHoverT,
    ARTBOARD_PRESETS,
  } from '../../utils/adDesignMotion';
  import { composeAdDesign } from '../../utils/composeAdDesign';
  import {
    CRT_SLIDER_FIELDS,
    CrtScreenRenderer,
    cloneCrtParams,
    cloneCrtStates,
    formatCrtValue,
    isCrtScreenSupported,
    mixCrtParams,
    sanitizeCrtParams,
    sanitizeCrtStates,
    type CrtScreenParams,
    type CrtScreenStates,
    type CrtSliderKey,
  } from '../../utils/crtScreen';
  import { fileToDataUrl } from '../../services/ads-api';
  import { isSvgDataUrl, parseSvgDataUrlColor, tintSvgDataUrl } from '../../utils/svgTint';
  import EditorIcon from './editor/EditorIcon.svelte';
  import { editorIcons } from './editor/editorIconRaw';

  type Tool = 'select' | 'hand';
  type Variant = 'rest' | 'hover';

  type Props = {
    states: AdDesignStates;
    onStatesChange: (next: AdDesignStates) => void;
    crt: CrtScreenStates;
    onCrtChange: (next: CrtScreenStates) => void;
  };

  let { states, onStatesChange, crt, onCrtChange }: Props = $props();

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
  let spaceDown = $state(false);
  let panning = $state(false);
  let pointerHover = false;
  let hoverT = 0;
  let dragBase: AdDesignStates | null = null;

  let dragStates: AdDesignStates | null = $state(null);
  const view = $derived(dragStates ?? cloneDesignStatesAligned(states));
  const crtStates = $derived(sanitizeCrtStates(crt));
  const restDoc = $derived(view.rest);
  const hoverDoc = $derived(view.hover);
  const activeDoc = $derived(variant === 'hover' ? hoverDoc : restDoc);
  const selected = $derived(getNode(activeDoc, selectedId));
  const selectedRest = $derived(getNode(restDoc, selectedId));
  const selectedHover = $derived(getNode(hoverDoc, selectedId));
  const layers = $derived(flattenLayers(restDoc));
  const root = $derived(getRoot(restDoc));

  const box = {
    view: view as AdDesignStates,
    crt: crtStates as CrtScreenStates,
    variant: 'rest' as Variant,
    livePreview: false,
    zoom: 1,
    pointerHover: false,
  };

  $effect(() => {
    box.view = view;
    box.crt = crtStates;
    box.variant = variant;
    box.livePreview = livePreview;
    box.zoom = zoom;
  });

  $effect(() => {
    const id = restDoc.rootId;
    if (!selectedId || !restDoc.nodes[selectedId]) selectedId = id;
  });

  $effect(() => {
    const canvas = previewCanvas;
    if (!canvas) return;
    let dead = false;
    let raf = 0;
    let renderer: CrtScreenRenderer | null = null;
    let source: HTMLCanvasElement | null = null;
    let lastCompose = 0;
    let composeBusy = false;
    let lastTime = 0;
    try {
      if (isCrtScreenSupported()) renderer = new CrtScreenRenderer(canvas);
    } catch {
      renderer = null;
    }

    const loop = (timeMs: number) => {
      raf = 0;
      if (dead) return;
      const dt = lastTime ? Math.min(48, Math.max(0, timeMs - lastTime)) : 16;
      lastTime = timeMs;
      const target = box.livePreview
        ? (pointerHover || box.pointerHover ? 1 : 0)
        : box.variant === 'hover' ? 1 : 0;
      hoverT = stepHoverT(hoverT, target, dt);
      const eased = easeInOutCubic(hoverT);
      const rest = cloneDesignDoc(box.view.rest);
      const hover = cloneDesignDoc(box.view.hover);
      const w = Math.max(1, rest.width);
      const h = Math.max(1, rest.height);
      const displayW = Math.max(1, w * box.zoom);
      const displayH = Math.max(1, h * box.zoom);
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.style.width = `${displayW}px`;
      canvas.style.height = `${displayH}px`;

      const crtLive = mixCrtParams(box.crt.rest, box.crt.hover, eased);
      if (renderer) {
        renderer.resize(displayW, displayH, dpr);
        if (!source) source = document.createElement('canvas');
        const sw = Math.max(1, Math.round(displayW * dpr));
        const sh = Math.max(1, Math.round(displayH * dpr));
        if (source.width !== sw || source.height !== sh) {
          source.width = sw;
          source.height = sh;
        }
        if (!composeBusy && timeMs - lastCompose > 24) {
          composeBusy = true;
          const ctx = source.getContext('2d', { alpha: true });
          if (ctx) {
            void composeAdDesign(ctx, rest, sw, sh, hover, eased).then(() => {
              if (!dead && renderer && source) renderer.setSource(source);
              lastCompose = timeMs;
              composeBusy = false;
            });
          } else composeBusy = false;
        }
        renderer.setParams(crtLive);
        renderer.render(timeMs);
      } else {
        canvas.width = Math.max(1, Math.round(displayW * dpr));
        canvas.height = Math.max(1, Math.round(displayH * dpr));
        const ctx = canvas.getContext('2d');
        if (ctx && !composeBusy && timeMs - lastCompose > 24) {
          composeBusy = true;
          void composeAdDesign(ctx, rest, canvas.width, canvas.height, hover, eased).then(() => {
            lastCompose = timeMs;
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
      renderer?.destroy();
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
      if (selected.type === 'image') {
        commitVariant(selectedId, { src, name: file.name || selected.name });
        return;
      }
      if (selected.type === 'frame' || selected.type === 'rectangle') {
        commitVariant(selectedId, { fills: [{ type: 'image', src, opacity: 1, scaleMode: 'fill' }] } as Partial<AdNode>);
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
    commitVariant(id, { visible: !node.visible });
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

  function canTintSelected(): boolean {
    if (!selected) return false;
    if (selected.type === 'text' || selected.type === 'frame' || selected.type === 'rectangle') return true;
    return selected.type === 'image' && isSvgDataUrl(selected.src);
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
    if (selected.type === 'text' || selected.type === 'frame' || selected.type === 'rectangle') {
      commitVariant(selectedId, { fills: [solid(hex)] } as Partial<AdNode>);
      return;
    }
    if (selected.type === 'image' && isSvgDataUrl(selected.src)) {
      commitVariant(selectedId, {
        tint: hex,
        src: tintSvgDataUrl(selected.src, hex),
      } as Partial<AdNode>);
    }
  }

  function liveCrt(): CrtScreenParams {
    return variant === 'hover' ? crtStates.hover : crtStates.rest;
  }

  function patchCrtParam(key: string, value: number | boolean) {
    const next = cloneCrtStates(crtStates);
    const which = variant === 'hover' ? 'hover' : 'rest';
    next[which] = sanitizeCrtParams({ ...next[which], [key]: value });
    onCrtChange(next);
  }

  function copyCrtRestToHover() {
    onCrtChange({ rest: cloneCrtParams(crtStates.rest), hover: cloneCrtParams(crtStates.rest) });
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
      <input bind:this={fileInput} type="file" accept="image/*" hidden onchange={onPickImage} />
    </div>

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
  </header>

  <div class="figma__body">
    <aside class="figma__layers">
      <div class="figma__panel-head">
        <span>Layers</span>
        <span class="figma__panel-sub">{variant}</span>
      </div>
      <ul class="figma__layer-list">
        {#each layers as { node, depth } (node.id)}
          {@const restN = restDoc.nodes[node.id]}
          {@const hoverN = hoverDoc.nodes[node.id]}
          {@const live = variant === 'hover' ? hoverN : restN}
          <li>
            <div
              class="figma__layer"
              class:figma__layer--on={selectedId === node.id}
              class:figma__layer--ghost={live && nodeOpacity(live) < 0.02}
              style:padding-left="{0.45 + depth * 0.7}rem"
            >
              <button type="button" class="figma__layer-main" onclick={() => select(node.id)}>
                <span class="figma__layer-ico"><EditorIcon svg={layerIconSvg(node.type)} size={16} /></span>
                <span class="figma__layer-name">{node.name || node.type}</span>
                {#if hoverDiffers(restN ?? null, hoverN ?? null)}
                  <span class="figma__dot" title="Rest и Hover различаются"></span>
                {/if}
              </button>
              <button
                type="button"
                class="figma__eye"
                class:figma__eye--off={live && !live.visible}
                title={live && !live.visible ? 'Показать' : 'Скрыть'}
                onclick={() => toggleVisible(node.id)}
              ><EditorIcon svg={live && !live.visible ? editorIcons.show : editorIcons.hide} size={16} /></button>
              <button
                type="button"
                class="figma__lock"
                class:figma__lock--on={node.locked}
                title={node.locked ? 'Разблокировать' : 'Заблокировать'}
                onclick={() => toggleLocked(node.id)}
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
        <span>{selected ? (selected.type === 'frame' ? 'Frame' : selected.type === 'text' ? 'Text' : selected.type === 'image' ? 'Image' : 'Rectangle') : 'Frame'} · {variant}</span>
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
              <label>W <input type="number" step="0.1" value={selected.w.toFixed(2)} oninput={(e) => commitVariant(selectedId!, { w: Math.max(1, Number(e.currentTarget.value)) })} /></label>
              <label>H <input type="number" step="0.1" value={selected.h.toFixed(2)} oninput={(e) => commitVariant(selectedId!, { h: Math.max(1, Number(e.currentTarget.value)) })} /></label>
            </div>
          {/if}
          <div class="figma__row2">
            <label><span class="figma__field-ico"><EditorIcon svg={editorIcons.rotation} size={16} /></span> <input type="number" step="1" value={selected.rotation} oninput={(e) => commitVariant(selectedId!, { rotation: Number(e.currentTarget.value) })} /></label>
            <label><span class="figma__field-ico"><EditorIcon svg={editorIcons.opacity} size={16} /></span> <input type="number" step="1" min="0" max="100" value={Math.round(selected.opacity * 100)} oninput={(e) => commitVariant(selectedId!, { opacity: Number(e.currentTarget.value) / 100 })} /></label>
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

        <section class="figma__sec">
          <div class="figma__sec-title">
            <span class="figma__sec-title-row">
              <EditorIcon svg={editorIcons.styleFill} size={18} />
              Fill · {variant}
            </span>
          </div>
          {#if canTintSelected()}
            <div class="figma__fill">
              <input type="color" value={solidColor()} oninput={(e) => setSolidColor(e.currentTarget.value)} />
              <input type="text" value={solidColor()} oninput={(e) => setSolidColor(e.currentTarget.value)} />
              <button type="button" class="figma__mini" onclick={() => fileInput?.click()}>Image…</button>
            </div>
          {:else}
            <div class="figma__fill">
              <button type="button" class="figma__mini" onclick={() => fileInput?.click()}>Image…</button>
            </div>
          {/if}
        </section>

        {#if selected.type === 'frame' && selectedId === restDoc.rootId}
          <section class="figma__sec">
            <div class="figma__sec-title">
              CRT Screen · {variant}
              <button type="button" class="figma__mini" onclick={copyCrtRestToHover}>Rest → Hover</button>
            </div>
            <p class="figma__hint-inline">Тот же шейдер, что в публичном iframe. Rest/Hover смешиваются при наведении.</p>
            {#each CRT_SLIDER_FIELDS as field}
              <label class="figma__slider">
                <span>{field.label}</span>
                <input
                  type="range"
                  min={field.min}
                  max={field.max}
                  step={field.step}
                  value={Number(liveCrt()[field.key as CrtSliderKey] ?? 0)}
                  oninput={(e) => patchCrtParam(field.key, Number(e.currentTarget.value))}
                />
                <span>{formatCrtValue(field.key as CrtSliderKey, Number(liveCrt()[field.key as CrtSliderKey] ?? 0), field.unit)}</span>
              </label>
            {/each}
          </section>
        {/if}

        <section class="figma__sec">
          <label class="figma__check"><input type="checkbox" checked={selected.visible} onchange={(e) => commitVariant(selectedId!, { visible: e.currentTarget.checked })} /> Visible</label>
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
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.3rem 0.55rem;
  background: #2c2c2c;
  border-bottom: 1px solid #1a1a1a;
  flex-shrink: 0;
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
  &--on { background: #0c6dd8; }
  &--ghost { opacity: 0.45; }
  &:hover:not(&--on) { background: #3a3a3a; }
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

.figma__fill {
  display: grid;
  grid-template-columns: 2rem 1fr auto;
  gap: 0.35rem;
  align-items: center;
  input[type='text'] {
    border: 0;
    border-radius: 4px;
    background: var(--figma-input);
    color: inherit;
    padding: 0.35rem;
    font: inherit;
  }
  input[type='color'] {
    width: 2rem;
    height: 2rem;
    border: 0;
    background: transparent;
    padding: 0;
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
