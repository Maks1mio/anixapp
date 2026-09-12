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
    updateNode,
    type AdDesignDoc,
    type AdFrameNode,
    type AdNode,
    type AdTextNode,
  } from '../../utils/adDesignDoc';
  import { composeAdDesign, designHasCrt } from '../../utils/composeAdDesign';
  import {
    CRT_SLIDER_FIELDS,
    CRT_VPN_PRESET,
    CrtScreenRenderer,
    cloneCrtParams,
    formatCrtValue,
    isCrtScreenSupported,
    sanitizeCrtParams,
    type CrtScreenParams,
    type CrtSliderKey,
  } from '../../utils/crtScreen';
  import { fileToDataUrl } from '../../services/ads-api';

  type Tool = 'select' | 'frame' | 'rect' | 'text' | 'image' | 'hand';

  type Props = {
    doc: AdDesignDoc;
    onDocChange: (next: AdDesignDoc) => void;
    /** Live CRT params (same as public iframe). */
    crt?: CrtScreenParams;
    onCrtChange?: (next: CrtScreenParams) => void;
  };

  let { doc, onDocChange, crt = CRT_VPN_PRESET, onCrtChange }: Props = $props();

  let tool = $state<Tool>('select');
  let selectedId = $state<string | null>(null);
  let zoom = $state(1);
  let stageEl: HTMLDivElement | null = $state(null);
  let fileInput: HTMLInputElement | null = $state(null);
  let previewCanvas: HTMLCanvasElement | null = $state(null);

  // Work on a plain snapshot so mutations never touch $state Proxies mid-edit.
  const plainDoc = $derived(cloneDesignDoc(doc));
  const selected = $derived(getNode(plainDoc, selectedId));
  const layers = $derived(flattenLayers(plainDoc));
  const root = $derived(getRoot(plainDoc));
  const liveCrt = $derived(sanitizeCrtParams(crt));

  $effect(() => {
    // Keep selection on root when opening / switching Rest↔Hover
    const id = plainDoc.rootId;
    if (!selectedId || !plainDoc.nodes[selectedId]) selectedId = id;
  });

  // Public-parity preview: compose design → CRT (same pipeline as ads-embed).
  $effect(() => {
    const canvas = previewCanvas;
    if (!canvas) return;

    let dead = false;
    let raf = 0;
    let renderer: CrtScreenRenderer | null = null;
    let source: HTMLCanvasElement | null = null;
    let lastCompose = 0;
    let composeBusy = false;

    try {
      if (isCrtScreenSupported()) renderer = new CrtScreenRenderer(canvas);
    } catch {
      renderer = null;
    }

    const loop = (timeMs: number) => {
      raf = 0;
      if (dead) return;
      const docSnap = cloneDesignDoc(plainDoc);
      const crtSnap = cloneCrtParams(liveCrt);
      const w = Math.max(1, docSnap.width);
      const h = Math.max(1, docSnap.height);
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const useCrt = designHasCrt(docSnap) && !!renderer;

      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;

      if (useCrt && renderer) {
        renderer.resize(w, h, dpr);
        if (!source) source = document.createElement('canvas');
        const sw = Math.max(1, Math.round(w * dpr));
        const sh = Math.max(1, Math.round(h * dpr));
        if (source.width !== sw || source.height !== sh) {
          source.width = sw;
          source.height = sh;
        }
        if (!composeBusy && timeMs - lastCompose > 24) {
          composeBusy = true;
          const ctx = source.getContext('2d', { alpha: true });
          if (ctx) {
            void composeAdDesign(ctx, docSnap, sw, sh).then(() => {
              if (!dead && renderer && source) renderer.setSource(source);
              lastCompose = timeMs;
              composeBusy = false;
            });
          } else {
            composeBusy = false;
          }
        }
        renderer.setParams(crtSnap);
        renderer.render(timeMs);
      } else {
        canvas.width = Math.max(1, Math.round(w * dpr));
        canvas.height = Math.max(1, Math.round(h * dpr));
        const ctx = canvas.getContext('2d');
        if (ctx && !composeBusy && timeMs - lastCompose > 24) {
          composeBusy = true;
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          void composeAdDesign(ctx, docSnap, w, h).then(() => {
            lastCompose = timeMs;
            composeBusy = false;
          });
        }
      }

      if (!dead) raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    return () => {
      dead = true;
      if (raf) cancelAnimationFrame(raf);
      renderer?.destroy();
    };
  });

  let drag: null | {
    mode: 'move' | 'resize';
    id: string;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    origW: number;
    origH: number;
    handle?: string;
  } = null;

  function commit(next: AdDesignDoc) {
    // Always plain object — never pass $state Proxies up.
    onDocChange(cloneDesignDoc(next));
  }

  function select(id: string | null) {
    selectedId = id;
  }

  function patchSelected(patch: Partial<AdNode>) {
    if (!selectedId) return;
    commit(updateNode(plainDoc, selectedId, patch));
  }

  function addText() {
    const node = createTextNode({
      x: root.w / 2 - 160,
      y: root.h / 2 - 24,
      w: 320,
      h: 48,
      characters: 'Новый текст',
    });
    const next = addChild(plainDoc, root.id, node);
    commit(next);
    selectedId = node.id;
    tool = 'select';
  }

  function addRect() {
    const node = createRectNode({ x: 80, y: 80 });
    commit(addChild(plainDoc, root.id, node));
    selectedId = node.id;
    tool = 'select';
  }

  function addFrame() {
    const node = createFrameNode({ x: 60, y: 60 });
    commit(addChild(plainDoc, root.id, node));
    selectedId = node.id;
    tool = 'select';
  }

  async function addImageFromFile(file: File) {
    const src = await fileToDataUrl(file);
    const node = createImageNode(src, {
      name: file.name || 'Image',
      x: 40,
      y: 40,
      w: Math.min(320, root.w - 80),
      h: Math.min(220, root.h - 80),
    });
    // Also set as frame fill if empty canvas except bg
    commit(addChild(plainDoc, root.id, node));
    selectedId = node.id;
    tool = 'select';
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
        commit(updateNode(plainDoc, selectedId, { src, name: file.name || selected.name }));
        return;
      }
      if (selected.type === 'frame' || selected.type === 'rectangle') {
        const fills = [{ type: 'image' as const, src, opacity: 1, scaleMode: 'fill' as const }];
        commit(updateNode(plainDoc, selectedId, { fills } as Partial<AdNode>));
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
    if (!selectedId || selectedId === plainDoc.rootId) return;
    commit(removeNode(plainDoc, selectedId));
    selectedId = plainDoc.rootId;
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Delete' || e.key === 'Backspace') {
      const t = e.target as HTMLElement;
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable) return;
      e.preventDefault();
      deleteSelected();
    }
  }

  function onNodePointerDown(e: PointerEvent, id: string) {
    if (tool !== 'select' && tool !== 'hand') return;
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const node = getNode(plainDoc, id);
    if (!node || node.locked) return;
    select(id);
    drag = {
      mode: 'move',
      id,
      startX: e.clientX,
      startY: e.clientY,
      origX: node.x,
      origY: node.y,
      origW: node.w,
      origH: node.h,
    };
    const onMove = (ev: PointerEvent) => {
      if (!drag || drag.mode !== 'move') return;
      const dx = (ev.clientX - drag.startX) / zoom;
      const dy = (ev.clientY - drag.startY) / zoom;
      commit(updateNode(plainDoc, drag.id, { x: drag.origX + dx, y: drag.origY + dy }));
    };
    const onUp = () => {
      drag = null;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  function onResizeDown(e: PointerEvent, id: string, handle: string) {
    e.preventDefault();
    e.stopPropagation();
    const node = getNode(plainDoc, id);
    if (!node) return;
    select(id);
    drag = {
      mode: 'resize',
      id,
      handle,
      startX: e.clientX,
      startY: e.clientY,
      origX: node.x,
      origY: node.y,
      origW: node.w,
      origH: node.h,
    };
    const onMove = (ev: PointerEvent) => {
      if (!drag || drag.mode !== 'resize') return;
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
      commit(updateNode(plainDoc, drag.id, { x, y, w, h }));
    };
    const onUp = () => {
      drag = null;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  function absBox(node: AdNode): { x: number; y: number; w: number; h: number } {
    let x = node.x;
    let y = node.y;
    let p = node.parentId ? getNode(plainDoc, node.parentId) : null;
    while (p) {
      x += p.x;
      y += p.y;
      p = p.parentId ? getNode(plainDoc, p.parentId) : null;
    }
    return { x, y, w: node.w, h: node.h };
  }

  function layerIcon(type: AdNode['type']): string {
    if (type === 'frame') return '#';
    if (type === 'text') return 'T';
    if (type === 'image') return '◻';
    return '▭';
  }

  function setTextField<K extends keyof AdTextNode>(key: K, value: AdTextNode[K]) {
    if (!selected || selected.type !== 'text') return;
    patchSelected({ [key]: value } as Partial<AdNode>);
  }

  function setFrameField(patch: Partial<AdFrameNode>) {
    if (!selected || selected.type !== 'frame') return;
    patchSelected(patch as Partial<AdNode>);
  }

  function solidColor(): string {
    if (!selected) return '#ffffff';
    if (selected.type === 'text' || selected.type === 'frame' || selected.type === 'rectangle') {
      const f = selected.fills[0];
      if (f && f.type === 'solid') return f.color;
    }
    return '#ffffff';
  }

  function setSolidColor(color: string) {
    if (!selected) return;
    if (selected.type === 'text' || selected.type === 'frame' || selected.type === 'rectangle') {
      patchSelected({ fills: [solid(color)] } as Partial<AdNode>);
    }
  }

  function toggleCrtEffect() {
    if (!selected || selected.type !== 'frame') return;
    const effects = [...(selected.effects || [])];
    const idx = effects.findIndex((e) => e.type === 'crt');
    if (idx >= 0) {
      effects.splice(idx, 1);
    } else {
      effects.push({
        id: `crt_${Date.now()}`,
        type: 'crt',
        visible: true,
        params: { ...liveCrt },
      });
    }
    setFrameField({ effects });
  }

  function patchCrtParam(key: string, value: number | boolean) {
    const next = sanitizeCrtParams({ ...liveCrt, [key]: value });
    onCrtChange?.(next);
    if (!selected || selected.type !== 'frame') return;
    const effects = (selected.effects || []).map((e) => {
      if (e.type !== 'crt') return e;
      return { ...e, params: { ...e.params, [key]: value } };
    });
    if (effects.some((e) => e.type === 'crt')) setFrameField({ effects });
  }

  const crtEffect = $derived(
    selected?.type === 'frame' ? selected.effects.find((e) => e.type === 'crt') : null,
  );
</script>

<svelte:window onkeydown={onKey} />

<div class="figma">
  <header class="figma__toolbar" aria-label="Инструменты">
    <div class="figma__tools">
      <button type="button" class="figma__tool" class:figma__tool--on={tool === 'select'} onclick={() => (tool = 'select')} title="Select">↖</button>
      <button type="button" class="figma__tool" class:figma__tool--on={tool === 'frame'} onclick={addFrame} title="Frame">#</button>
      <button type="button" class="figma__tool" class:figma__tool--on={tool === 'rect'} onclick={addRect} title="Rectangle">▭</button>
      <button type="button" class="figma__tool" class:figma__tool--on={tool === 'text'} onclick={addText} title="Text">T</button>
      <button type="button" class="figma__tool" class:figma__tool--on={tool === 'image'} onclick={() => fileInput?.click()} title="Image">🖼</button>
      <input bind:this={fileInput} type="file" accept="image/*" hidden onchange={onPickImage} />
    </div>
    <div class="figma__zoom">
      <button type="button" class="figma__tool" onclick={() => (zoom = Math.max(0.25, zoom - 0.1))}>−</button>
      <span>{Math.round(zoom * 100)}%</span>
      <button type="button" class="figma__tool" onclick={() => (zoom = Math.min(3, zoom + 0.1))}>+</button>
    </div>
  </header>

  <div class="figma__body">
    <aside class="figma__layers">
      <div class="figma__panel-head">
        <span>Layers</span>
      </div>
      <ul class="figma__layer-list">
        {#each layers as { node, depth } (node.id)}
          <li>
            <button
              type="button"
              class="figma__layer"
              class:figma__layer--on={selectedId === node.id}
              style:padding-left="{0.55 + depth * 0.75}rem"
              onclick={() => select(node.id)}
            >
              <span class="figma__layer-ico">{layerIcon(node.type)}</span>
              <span class="figma__layer-name">{node.name || node.type}</span>
              {#if !node.visible}<span class="figma__layer-meta">скрыт</span>{/if}
            </button>
          </li>
        {/each}
      </ul>
    </aside>

    <div
      class="figma__stage-wrap"
      bind:this={stageEl}
      ondragover={(e) => e.preventDefault()}
      ondrop={onDrop}
      onpointerdown={() => select(null)}
    >
      <div
        class="figma__artboard"
        style:width="{plainDoc.width * zoom}px"
        style:height="{plainDoc.height * zoom}px"
        style:transform="scale(1)"
      >
        <div class="figma__world" style:width="{plainDoc.width}px" style:height="{plainDoc.height}px" style:transform="scale({zoom})" style:transform-origin="top left">
          <canvas
            class="figma__crt"
            bind:this={previewCanvas}
            width={plainDoc.width}
            height={plainDoc.height}
            aria-hidden="true"
          ></canvas>
          <div
            class="figma__root"
            class:figma__root--on={selectedId === root.id || selectedId == null}
            style:border-radius="{root.cornerRadius}px"
            onpointerdown={(e) => {
              e.stopPropagation();
              select(root.id);
            }}
          ></div>

          {#each layers as { node } (node.id)}
            {@const box = absBox(node)}
            {#if node.visible && node.id !== plainDoc.rootId}
              <div
                class="figma__node figma__node--ghost"
                class:figma__node--text={node.type === 'text'}
                class:figma__node--img={node.type === 'image'}
                class:figma__node--frame={node.type === 'frame'}
                class:figma__node--rect={node.type === 'rectangle'}
                class:figma__node--on={selectedId === node.id}
                style:left="{box.x}px"
                style:top="{box.y}px"
                style:width="{box.w}px"
                style:height="{box.h}px"
                style:opacity={1}
                style:border-radius="{node.type === 'text' ? 0 : 'cornerRadius' in node ? node.cornerRadius : 0}px"
                onpointerdown={(e) => onNodePointerDown(e, node.id)}
              >
                {#if node.type === 'text'}
                  <div class="figma__text figma__text--ghost">{node.characters}</div>
                {/if}
              </div>
            {/if}
          {/each}

          {#if selected && selectedId}
            {@const box = absBox(selected)}
            <div
              class="figma__bbox"
              style:left="{box.x}px"
              style:top="{box.y}px"
              style:width="{box.w}px"
              style:height="{box.h}px"
            >
              <span class="figma__bbox-label">{Math.round(box.w)} × {Math.round(box.h)}</span>
              {#each ['nw', 'ne', 'sw', 'se'] as h}
                <span
                  class="figma__handle figma__handle--{h}"
                  onpointerdown={(e) => onResizeDown(e, selectedId!, h)}
                ></span>
              {/each}
            </div>
          {/if}
        </div>
      </div>
    </div>

    <aside class="figma__inspector">
      <div class="figma__panel-head">
        <span>{selected ? (selected.type === 'frame' ? 'Frame' : selected.type === 'text' ? 'Text' : selected.type === 'image' ? 'Image' : 'Rectangle') : 'Frame'}</span>
      </div>

      {#if selected}
        <section class="figma__sec">
          <div class="figma__sec-title">Position</div>
          <div class="figma__align">
            <button type="button" title="Left" onclick={() => selectedId && commit(alignNode(plainDoc, selectedId, 'left'))}>⫷</button>
            <button type="button" title="Center H" onclick={() => selectedId && commit(alignNode(plainDoc, selectedId, 'hcenter'))}>☰</button>
            <button type="button" title="Right" onclick={() => selectedId && commit(alignNode(plainDoc, selectedId, 'right'))}>⫸</button>
            <button type="button" title="Top" onclick={() => selectedId && commit(alignNode(plainDoc, selectedId, 'top'))}>⬆</button>
            <button type="button" title="Center V" onclick={() => selectedId && commit(alignNode(plainDoc, selectedId, 'vcenter'))}>⬍</button>
            <button type="button" title="Bottom" onclick={() => selectedId && commit(alignNode(plainDoc, selectedId, 'bottom'))}>⬇</button>
          </div>
          <div class="figma__row2">
            <label>X <input type="number" step="0.1" value={selected.x.toFixed(2)} oninput={(e) => patchSelected({ x: Number(e.currentTarget.value) })} /></label>
            <label>Y <input type="number" step="0.1" value={selected.y.toFixed(2)} oninput={(e) => patchSelected({ y: Number(e.currentTarget.value) })} /></label>
          </div>
          <div class="figma__row2">
            <label>W <input type="number" step="0.1" value={selected.w.toFixed(2)} oninput={(e) => patchSelected({ w: Math.max(1, Number(e.currentTarget.value)) })} /></label>
            <label>H <input type="number" step="0.1" value={selected.h.toFixed(2)} oninput={(e) => patchSelected({ h: Math.max(1, Number(e.currentTarget.value)) })} /></label>
          </div>
          <div class="figma__row2">
            <label>° <input type="number" step="1" value={selected.rotation} oninput={(e) => patchSelected({ rotation: Number(e.currentTarget.value) })} /></label>
            <label>% <input type="number" step="1" min="0" max="100" value={Math.round(selected.opacity * 100)} oninput={(e) => patchSelected({ opacity: Number(e.currentTarget.value) / 100 })} /></label>
          </div>
        </section>

        {#if selected.type === 'frame'}
          <section class="figma__sec">
            <div class="figma__sec-title">Auto layout</div>
            <div class="figma__seg">
              <button type="button" class:on={selected.layoutMode === 'none'} onclick={() => setFrameField({ layoutMode: 'none' })}>Free</button>
              <button type="button" class:on={selected.layoutMode === 'horizontal'} onclick={() => setFrameField({ layoutMode: 'horizontal' })}>Horizontal</button>
              <button type="button" class:on={selected.layoutMode === 'vertical'} onclick={() => setFrameField({ layoutMode: 'vertical' })}>Vertical</button>
            </div>
            <div class="figma__row2">
              <label>Gap <input type="number" value={selected.itemSpacing} oninput={(e) => setFrameField({ itemSpacing: Number(e.currentTarget.value) })} /></label>
              <label>Radius <input type="number" value={selected.cornerRadius} oninput={(e) => setFrameField({ cornerRadius: Number(e.currentTarget.value) })} /></label>
            </div>
            <div class="figma__row2">
              <label>Pad H <input type="number" value={selected.paddingLeft} oninput={(e) => setFrameField({ paddingLeft: Number(e.currentTarget.value), paddingRight: Number(e.currentTarget.value) })} /></label>
              <label>Pad V <input type="number" value={selected.paddingTop} oninput={(e) => setFrameField({ paddingTop: Number(e.currentTarget.value), paddingBottom: Number(e.currentTarget.value) })} /></label>
            </div>
            <label class="figma__check"><input type="checkbox" checked={selected.clipsContent} onchange={(e) => setFrameField({ clipsContent: e.currentTarget.checked })} /> Clip content</label>
          </section>
        {/if}

        {#if selected.type === 'text'}
          <section class="figma__sec">
            <div class="figma__sec-title">Typography</div>
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
            <div class="figma__row2">
              <label>LH <input type="text" value={selected.lineHeight === 'auto' ? 'Auto' : selected.lineHeight} oninput={(e) => {
                const v = e.currentTarget.value;
                setTextField('lineHeight', v.toLowerCase() === 'auto' ? 'auto' : Number(v) || 'auto');
              }} /></label>
              <label>LS <input type="number" value={selected.letterSpacing} oninput={(e) => setTextField('letterSpacing', Number(e.currentTarget.value))} /></label>
            </div>
            <div class="figma__seg">
              <button type="button" class:on={selected.textAlign === 'left'} onclick={() => setTextField('textAlign', 'left')}>L</button>
              <button type="button" class:on={selected.textAlign === 'center'} onclick={() => setTextField('textAlign', 'center')}>C</button>
              <button type="button" class:on={selected.textAlign === 'right'} onclick={() => setTextField('textAlign', 'right')}>R</button>
            </div>
            <label class="figma__full">Content
              <textarea rows="3" value={selected.characters} oninput={(e) => setTextField('characters', e.currentTarget.value)}></textarea>
            </label>
          </section>
        {/if}

        <section class="figma__sec">
          <div class="figma__sec-title">Fill</div>
          <div class="figma__fill">
            <input type="color" value={solidColor()} oninput={(e) => setSolidColor(e.currentTarget.value)} />
            <input type="text" value={solidColor()} oninput={(e) => setSolidColor(e.currentTarget.value)} />
            <button type="button" class="figma__mini" onclick={() => fileInput?.click()}>Image…</button>
          </div>
        </section>

        {#if selected.type === 'frame'}
          <section class="figma__sec">
            <div class="figma__sec-title">
              Effects
              <button type="button" class="figma__mini" onclick={toggleCrtEffect}>{crtEffect ? '− CRT' : '+ CRT Screen'}</button>
            </div>
            {#if crtEffect && crtEffect.type === 'crt'}
              <p class="figma__hint">CRT Screen — как в публичном iframe</p>
              {#each CRT_SLIDER_FIELDS as field}
                <label class="figma__slider">
                  <span>{field.label}</span>
                  <input
                    type="range"
                    min={field.min}
                    max={field.max}
                    step={field.step}
                    value={Number(liveCrt[field.key as CrtSliderKey] ?? 0)}
                    oninput={(e) => patchCrtParam(field.key, Number(e.currentTarget.value))}
                  />
                  <span>{formatCrtValue(field.key as CrtSliderKey, Number(liveCrt[field.key as CrtSliderKey] ?? 0), field.unit)}</span>
                </label>
              {/each}
            {/if}
          </section>
        {/if}

        <section class="figma__sec">
          <label class="figma__check"><input type="checkbox" checked={selected.visible} onchange={(e) => patchSelected({ visible: e.currentTarget.checked })} /> Visible</label>
          <label class="figma__check"><input type="checkbox" checked={selected.locked} onchange={(e) => patchSelected({ locked: e.currentTarget.checked })} /> Locked</label>
          <label class="figma__full">Name <input type="text" value={selected.name} oninput={(e) => patchSelected({ name: e.currentTarget.value })} /></label>
          {#if selectedId !== plainDoc.rootId}
            <button type="button" class="figma__danger" onclick={deleteSelected}>Удалить слой</button>
          {/if}
        </section>
      {:else}
        <p class="figma__hint">Выберите слой или добавьте объект с тулбара. Картинку можно перетащить на полотно.</p>
      {/if}
    </aside>
  </div>
</div>

<style lang="scss">
.figma {
  --figma-bg: #2c2c2c;
  --figma-panel: #2c2c2c;
  --figma-input: #3a3a3a;
  --figma-border: #444;
  --figma-blue: #0d99ff;
  --figma-text: #f5f5f5;
  --figma-muted: #a0a0a0;
  display: flex;
  flex-direction: column;
  height: min(78vh, 820px);
  min-height: 520px;
  border: 1px solid var(--figma-border);
  border-radius: 12px;
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
  padding: 0.35rem 0.6rem;
  background: #2c2c2c;
  border-bottom: 1px solid #222;
}

.figma__tools,
.figma__zoom {
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
  padding: 0.15rem;
  border-radius: 8px;
  background: #383838;
}

.figma__tool {
  width: 2rem;
  height: 2rem;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: #ddd;
  cursor: pointer;
  &--on,
  &:hover {
    background: var(--figma-blue);
    color: #fff;
  }
}

.figma__body {
  display: grid;
  grid-template-columns: 14rem minmax(0, 1fr) 16rem;
  min-height: 0;
  flex: 1;
}

.figma__layers,
.figma__inspector {
  background: var(--figma-panel);
  border-right: 1px solid #222;
  overflow: auto;
  min-height: 0;
}

.figma__inspector {
  border-right: 0;
  border-left: 1px solid #222;
}

.figma__panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.55rem 0.7rem;
  font-weight: 600;
  border-bottom: 1px solid #222;
}

.figma__layer-list {
  list-style: none;
  margin: 0;
  padding: 0.25rem;
}

.figma__layer {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  width: 100%;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  padding: 0.3rem 0.4rem;
  &--on {
    background: #0c6dd8;
  }
  &:hover:not(&--on) {
    background: #3a3a3a;
  }
}

.figma__layer-ico {
  width: 1rem;
  opacity: 0.8;
  text-align: center;
}

.figma__layer-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.figma__layer-meta {
  margin-left: auto;
  color: var(--figma-muted);
  font-size: 10px;
}

.figma__stage-wrap {
  position: relative;
  overflow: auto;
  background:
    linear-gradient(45deg, #252525 25%, transparent 25%) 0 0 / 16px 16px,
    linear-gradient(-45deg, #252525 25%, transparent 25%) 0 0 / 16px 16px,
    #1e1e1e;
  display: grid;
  place-items: center;
  padding: 2rem;
}

.figma__artboard {
  position: relative;
  box-shadow: 0 0 0 1px #111, 0 12px 40px rgba(0, 0, 0, 0.45);
}

.figma__world {
  position: relative;
  background: #0a0a0c;
}

.figma__crt {
  position: absolute;
  inset: 0;
  z-index: 0;
  width: 100%;
  height: 100%;
  display: block;
  border-radius: inherit;
  pointer-events: none;
}

.figma__root {
  position: absolute;
  inset: 0;
  z-index: 1;
  pointer-events: auto;
  background: transparent;
  border: 1px solid transparent;
  &--on {
    outline: 1px solid var(--figma-blue);
  }
}

.figma__node {
  position: absolute;
  z-index: 2;
  box-sizing: border-box;
  cursor: grab;
  overflow: hidden;
  pointer-events: auto;
  &--ghost {
    background: transparent !important;
    border: 1px dashed transparent;
  }
  &--ghost:hover {
    border-color: rgba(10, 132, 255, 0.45);
  }
  &--on {
    z-index: 5;
    border-color: var(--figma-blue) !important;
  }
  &--text {
    display: flex;
    align-items: center;
    justify-content: center;
  }
}

.figma__text {
  width: 100%;
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.25;
  pointer-events: none;
  &--ghost {
    color: transparent;
    user-select: none;
  }
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
  &--nw {
    left: -4px;
    top: -4px;
    cursor: nwse-resize;
  }
  &--ne {
    right: -4px;
    top: -4px;
    cursor: nesw-resize;
  }
  &--sw {
    left: -4px;
    bottom: -4px;
    cursor: nesw-resize;
  }
  &--se {
    right: -4px;
    bottom: -4px;
    cursor: nwse-resize;
  }
}

.figma__sec {
  padding: 0.65rem 0.7rem;
  border-bottom: 1px solid #222;
  display: grid;
  gap: 0.45rem;
}

.figma__sec-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-weight: 600;
  color: #ddd;
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
  input,
  select {
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
  input,
  select,
  textarea {
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
    border: 0;
    border-radius: 4px;
    background: var(--figma-input);
    color: #ccc;
    padding: 0.35rem;
    cursor: pointer;
    &.on,
    &:hover {
      background: var(--figma-blue);
      color: #fff;
    }
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
  input {
    width: 100%;
  }
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
