/**
 * Rest/Hover as one Figma-like tree: same ids, interpolated playback.
 */
import {
  cloneDesignDoc,
  getNode,
  getRoot,
  type AdDesignDoc,
  type AdDesignStates,
  type AdEffect,
  type AdFrameNode,
  type AdNode,
  type AdPaint,
  type AdTextNode,
  nodeFills,
} from './adDesignDoc';
import {
  CRT_VPN_PRESET,
  mixCrtParams,
  sanitizeCrtParams,
  scaleCrtIntensity,
  type CrtScreenParams,
  type CrtScreenStates,
} from './crtScreen';

export const AD_HOVER_TAU_MS = 140;

export function easeInOutCubic(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

export function stepHoverT(current: number, target: number, dtMs: number, tau = AD_HOVER_TAU_MS): number {
  const dt = Math.min(48, Math.max(0, dtMs));
  let next = current + (target - current) * (1 - Math.exp(-dt / tau));
  if (Math.abs(target - next) < 0.002) return target;
  return next;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function cloneNode<T extends AdNode>(node: T): T {
  return JSON.parse(JSON.stringify(node)) as T;
}

function sameKind(a: AdNode, b: AdNode): boolean {
  return a.type === b.type;
}

/** Visual fields that may differ between Rest and Hover. Structure (id/parent/children) stays shared. */
export function copyVisualProps(from: AdNode, onto: AdNode): AdNode {
  const keep = {
    id: onto.id,
    type: onto.type,
    name: onto.name,
    parentId: onto.parentId,
    locked: onto.locked,
  };
  const next = { ...cloneNode(from), ...keep } as AdNode;
  if (onto.type === 'frame' && next.type === 'frame') {
    next.childIds = [...onto.childIds];
  }
  return next;
}

export function nodeOpacity(node: AdNode | null | undefined): number {
  if (!node || !node.visible) return 0;
  return Math.min(1, Math.max(0, node.opacity));
}

export function isLayerShown(node: AdNode | null | undefined): boolean {
  return nodeOpacity(node) > 0.02;
}

/** Hide with `visible`. Show restores opacity if it was zeroed by the old prototype. */
export function toggleLayerShown(node: AdNode): Partial<AdNode> {
  if (isLayerShown(node)) return { visible: false };
  return { visible: true, opacity: node.opacity > 0.02 ? node.opacity : 1 };
}

export function hoverDiffers(rest: AdNode | null, hover: AdNode | null): boolean {
  if (!rest || !hover) return Boolean(rest || hover);
  if (Math.abs(nodeOpacity(rest) - nodeOpacity(hover)) > 0.01) return true;
  if (Math.abs(rest.x - hover.x) > 0.2 || Math.abs(rest.y - hover.y) > 0.2) return true;
  if (Math.abs(rest.w - hover.w) > 0.2 || Math.abs(rest.h - hover.h) > 0.2) return true;
  if (Math.abs(rest.rotation - hover.rotation) > 0.2) return true;
  if (!visualEqual(rest.effects || [], hover.effects || [])) return true;
  if (!visualEqual(nodeFills(rest), nodeFills(hover))) return true;
  if (rest.type === 'text' && hover.type === 'text') {
    return rest.characters !== hover.characters
      || rest.fontSize !== hover.fontSize
      || rest.fontWeight !== hover.fontWeight;
  }
  if (rest.type === 'image' && hover.type === 'image') {
    return rest.src !== hover.src || (rest.tint || '') !== (hover.tint || '');
  }
  return false;
}

function matchScore(a: AdNode, b: AdNode): number {
  if (a.type !== b.type) return 0;
  let s = 1;
  if (a.name && a.name === b.name) s += 5;
  if (a.type === 'text' && b.type === 'text' && a.characters && a.characters === b.characters) s += 4;
  if (a.type === 'image' && b.type === 'image' && a.src && a.src === b.src) s += 4;
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  s += Math.max(0, 2 - Math.hypot(dx, dy) / 80);
  return s;
}

/**
 * Rewrite hover so it shares rest's ids and tree. Unmatched hover layers
 * are added to rest at opacity 0 (appear on hover). Unmatched rest layers
 * are copied into hover so they persist unless hidden.
 */
export function alignDesignPair(restIn: AdDesignDoc, hoverIn: AdDesignDoc): AdDesignStates {
  const rest = cloneDesignDoc(restIn);
  const hoverSrc = cloneDesignDoc(hoverIn);

  const restIds = Object.keys(rest.nodes);
  const hoverIds = Object.keys(hoverSrc.nodes);
  const usedHover = new Set<string>();
  const hoverToRest = new Map<string, string>();

  for (const id of restIds) {
    if (hoverSrc.nodes[id] && sameKind(rest.nodes[id]!, hoverSrc.nodes[id]!)) {
      hoverToRest.set(id, id);
      usedHover.add(id);
    }
  }

  for (const restId of restIds) {
    if ([...hoverToRest.values()].includes(restId)) continue;
    const rNode = rest.nodes[restId]!;
    let best: { id: string; score: number } | null = null;
    for (const hid of hoverIds) {
      if (usedHover.has(hid)) continue;
      const hNode = hoverSrc.nodes[hid]!;
      const score = matchScore(rNode, hNode);
      if (score < 2) continue;
      if (!best || score > best.score) best = { id: hid, score };
    }
    if (best) {
      hoverToRest.set(best.id, restId);
      usedHover.add(best.id);
    }
  }

  const newHover: Record<string, AdNode> = {};
  for (const restId of restIds) {
    const rNode = rest.nodes[restId]!;
    const hid = [...hoverToRest.entries()].find(([, rid]) => rid === restId)?.[0];
    const hNode = hid ? hoverSrc.nodes[hid] : null;
    if (hNode && sameKind(rNode, hNode)) {
      newHover[restId] = copyVisualProps(hNode, rNode);
    } else {
      newHover[restId] = cloneNode(rNode);
    }
  }

  for (const hid of hoverIds) {
    if (usedHover.has(hid)) continue;
    const hNode = hoverSrc.nodes[hid]!;
    if (hid === hoverSrc.rootId) continue;
    let newId = hid;
    if (rest.nodes[newId] || newHover[newId]) {
      newId = `${hid}_h`;
    }
    const mappedParent = hNode.parentId
      ? (hoverToRest.get(hNode.parentId) ?? (rest.nodes[hNode.parentId] ? hNode.parentId : rest.rootId))
      : rest.rootId;
    const parent = rest.nodes[mappedParent];
    if (!parent || parent.type !== 'frame') continue;

    const restCopy = cloneNode(hNode);
    restCopy.id = newId;
    restCopy.parentId = mappedParent;
    restCopy.opacity = 0;
    restCopy.visible = true;
    if (restCopy.type === 'frame') restCopy.childIds = [];

    const hoverCopy = cloneNode(hNode);
    hoverCopy.id = newId;
    hoverCopy.parentId = mappedParent;
    hoverCopy.visible = true;
    if (hoverCopy.opacity < 0.02) hoverCopy.opacity = 1;
    if (hoverCopy.type === 'frame') hoverCopy.childIds = [];

    rest.nodes[newId] = restCopy;
    newHover[newId] = hoverCopy;
    const frame = rest.nodes[mappedParent] as AdFrameNode;
    if (!frame.childIds.includes(newId)) {
      rest.nodes[mappedParent] = { ...frame, childIds: [...frame.childIds, newId] };
    }
  }

  for (const id of Object.keys(rest.nodes)) {
    const r = rest.nodes[id]!;
    const h = newHover[id];
    if (r.type === 'frame' && h?.type === 'frame') {
      h.childIds = [...r.childIds];
      h.parentId = r.parentId;
      h.name = r.name;
    } else if (h) {
      h.parentId = r.parentId;
      h.name = r.name;
    }
    syncPaintIds(r, h);
  }

  const hover: AdDesignDoc = {
    version: 2,
    width: rest.width,
    height: rest.height,
    rootId: rest.rootId,
    nodes: newHover,
  };
  return { rest, hover };
}

export function cloneDesignStatesAligned(states: AdDesignStates): AdDesignStates {
  return alignDesignPair(states.rest, states.hover);
}

function syncPaintIds(restNode: AdNode, hoverNode: AdNode | undefined) {
  const r = nodeFills(restNode);
  const h = hoverNode ? nodeFills(hoverNode) : [];
  if (!r.length && !h.length) return;
  const n = Math.max(r.length, h.length);
  for (let i = 0; i < n; i++) {
    const id = r[i]?.id || h[i]?.id || `pt_${i}`;
    if (r[i] && r[i]!.id !== id) r[i] = { ...r[i]!, id };
    if (h[i] && h[i]!.id !== id) h[i] = { ...h[i]!, id };
  }
  if (restNode.type === 'frame' || restNode.type === 'text' || restNode.type === 'rectangle' || restNode.type === 'image') {
    restNode.fills = r;
  }
  if (hoverNode && (hoverNode.type === 'frame' || hoverNode.type === 'text' || hoverNode.type === 'rectangle' || hoverNode.type === 'image')) {
    hoverNode.fills = h;
  }
}

export function mapBoth(
  states: AdDesignStates,
  fn: (doc: AdDesignDoc, variant: 'rest' | 'hover') => AdDesignDoc,
): AdDesignStates {
  return alignDesignPair(fn(states.rest, 'rest'), fn(states.hover, 'hover'));
}

/** Structural edit (add/remove/rename/lock) applied to both variants. */
export function applyStructure(
  states: AdDesignStates,
  fn: (doc: AdDesignDoc) => AdDesignDoc,
): AdDesignStates {
  return alignDesignPair(fn(cloneDesignDoc(states.rest)), fn(cloneDesignDoc(states.hover)));
}

export function patchVariantNode(
  states: AdDesignStates,
  variant: 'rest' | 'hover',
  id: string,
  patch: Partial<AdNode>,
): AdDesignStates {
  const doc = cloneDesignDoc(states[variant]);
  const cur = doc.nodes[id];
  if (!cur) return states;
  const next = { ...cur, ...patch, id: cur.id, type: cur.type } as AdNode;
  if (cur.type === 'frame' && next.type === 'frame' && !('childIds' in patch)) {
    next.childIds = [...cur.childIds];
  }
  const updated = { ...doc, nodes: { ...doc.nodes, [id]: next } };
  return variant === 'rest'
    ? alignDesignPair(updated, states.hover)
    : alignDesignPair(states.rest, updated);
}

const VARIANT_FOLLOW_SKIP = new Set([
  'visible',
  'opacity',
  'id',
  'type',
  'parentId',
  'childIds',
  'name',
  'locked',
  'fills',
]);

function visualEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) < 0.05;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

/**
 * Edit the active Rest/Hover side. Properties that still match on the other
 * side follow, so a new layer stays identical until you switch and change it.
 * `visible` / `opacity` never follow: hide on Hover leaves Rest shown.
 */
export function patchCurrentNode(
  states: AdDesignStates,
  variant: 'rest' | 'hover',
  id: string,
  patch: Partial<AdNode>,
): AdDesignStates {
  const other: 'rest' | 'hover' = variant === 'rest' ? 'hover' : 'rest';
  const cur = getNode(states[variant], id);
  const alt = getNode(states[other], id);
  let next = patchVariantNode(states, variant, id, patch);
  if (!cur || !alt) return next;
  const follow: Record<string, unknown> = {};
  for (const key of Object.keys(patch)) {
    if (VARIANT_FOLLOW_SKIP.has(key)) continue;
    const typed = key as keyof AdNode;
    if (visualEqual(alt[typed], cur[typed])) follow[key] = patch[typed];
  }
  if (Object.keys(follow).length === 0) return next;
  return patchVariantNode(next, other, id, follow as Partial<AdNode>);
}

function replaceNodeEffects(doc: AdDesignDoc, id: string, effects: AdEffect[]): AdDesignDoc {
  const cur = doc.nodes[id];
  if (!cur) return doc;
  return { ...doc, nodes: { ...doc.nodes, [id]: { ...cur, effects } as AdNode } };
}

/** Add an effect to both Rest and Hover (same id). CRT is added once per node. */
export function addNodeEffect(
  states: AdDesignStates,
  id: string,
  effect: AdEffect,
  hoverEffect?: AdEffect,
): AdDesignStates {
  const hoverFx = hoverEffect ?? effect;
  return mapBoth(states, (doc, which) => {
    const node = doc.nodes[id];
    if (!node) return doc;
    if ((node.effects ?? []).some((e) => e.id === effect.id || (effect.type === 'crt' && e.type === 'crt'))) {
      return doc;
    }
    const fx = which === 'hover' ? hoverFx : effect;
    return replaceNodeEffects(doc, id, [...(node.effects ?? []), JSON.parse(JSON.stringify(fx)) as AdEffect]);
  });
}

/** Remove an effect from both variants. */
export function removeNodeEffect(states: AdDesignStates, id: string, effectId: string): AdDesignStates {
  return mapBoth(states, (doc) => {
    const node = doc.nodes[id];
    if (!node) return doc;
    return replaceNodeEffects(doc, id, (node.effects ?? []).filter((e) => e.id !== effectId));
  });
}

/** Hide/show an effect on the active variant only (like the layer eye). */
export function setNodeEffectVisible(
  states: AdDesignStates,
  variant: 'rest' | 'hover',
  id: string,
  effectId: string,
  visible: boolean,
): AdDesignStates {
  const node = getNode(states[variant], id);
  if (!node) return states;
  const effects = (node.effects ?? []).map((e) => (e.id === effectId ? { ...e, visible } : e));
  return patchVariantNode(states, variant, id, { effects } as Partial<AdNode>);
}

/** Patch CRT params on the active variant; matching params on the other side follow. */
export function patchNodeEffectParams(
  states: AdDesignStates,
  variant: 'rest' | 'hover',
  id: string,
  effectId: string,
  paramsPatch: Record<string, number | boolean | string>,
): AdDesignStates {
  const other: 'rest' | 'hover' = variant === 'rest' ? 'hover' : 'rest';
  const cur = getNode(states[variant], id);
  const alt = getNode(states[other], id);
  const curFx = cur?.effects.find((e) => e.id === effectId);
  if (!cur || !curFx || curFx.type !== 'crt') return states;
  const nextParams = { ...curFx.params, ...paramsPatch };
  const nextEffects = cur.effects.map((e) => (e.id === effectId && e.type === 'crt' ? { ...e, params: nextParams } : e));
  let next = patchVariantNode(states, variant, id, { effects: nextEffects } as Partial<AdNode>);
  const altFx = alt?.effects.find((e) => e.id === effectId);
  if (!alt || !altFx || altFx.type !== 'crt') return next;
  const follow: Record<string, number | boolean | string> = {};
  for (const [key, value] of Object.entries(paramsPatch)) {
    if (visualEqual(altFx.params[key], curFx.params[key])) follow[key] = value;
  }
  if (Object.keys(follow).length === 0) return next;
  const altParams = { ...altFx.params, ...follow };
  const altEffects = alt.effects.map((e) => (e.id === effectId && e.type === 'crt' ? { ...e, params: altParams } : e));
  return patchVariantNode(next, other, id, { effects: altEffects } as Partial<AdNode>);
}

function crtParamsFromDoc(doc: AdDesignDoc): CrtScreenParams {
  const from = (node: AdNode | undefined): CrtScreenParams | null => {
    const fx = node?.effects?.find((e) => e.type === 'crt');
    return fx && fx.type === 'crt' ? sanitizeCrtParams(fx.params) : null;
  };
  const root = doc.nodes[doc.rootId];
  return from(root)
    ?? Object.values(doc.nodes).map(from).find((p): p is CrtScreenParams => Boolean(p))
    ?? { ...CRT_VPN_PRESET };
}

/** API-compat CRT blob derived from design effects (root first, then any layer). */
export function crtStatesFromDesign(states: AdDesignStates): CrtScreenStates {
  return {
    rest: crtParamsFromDoc(states.rest),
    hover: crtParamsFromDoc(states.hover),
  };
}

function replaceNodeFills(doc: AdDesignDoc, id: string, fills: AdPaint[]): AdDesignDoc {
  const cur = doc.nodes[id];
  if (!cur) return doc;
  if (cur.type !== 'frame' && cur.type !== 'text' && cur.type !== 'rectangle' && cur.type !== 'image') return doc;
  return { ...doc, nodes: { ...doc.nodes, [id]: { ...cur, fills } as AdNode } };
}

/** Add a fill on top of the stack in both Rest and Hover (same id). */
export function addNodeFill(states: AdDesignStates, id: string, paint: AdPaint): AdDesignStates {
  const clone = JSON.parse(JSON.stringify(paint)) as AdPaint;
  return mapBoth(states, (doc) => {
    const fills = [...nodeFills(doc.nodes[id])];
    if (fills.some((p) => p.id === clone.id)) return doc;
    return replaceNodeFills(doc, id, [JSON.parse(JSON.stringify(clone)) as AdPaint, ...fills]);
  });
}

/** Remove a fill from both variants. */
export function removeNodeFill(states: AdDesignStates, id: string, paintId: string): AdDesignStates {
  return mapBoth(states, (doc) => {
    const fills = nodeFills(doc.nodes[id]).filter((p) => p.id !== paintId);
    return replaceNodeFills(doc, id, fills);
  });
}

/** Hide/show a fill on the active variant only. */
export function setNodeFillVisible(
  states: AdDesignStates,
  variant: 'rest' | 'hover',
  id: string,
  paintId: string,
  visible: boolean,
): AdDesignStates {
  const fills = nodeFills(getNode(states[variant], id)).map((p) => (p.id === paintId ? { ...p, visible } : p));
  return patchVariantNode(states, variant, id, { fills } as Partial<AdNode>);
}

/** Patch fill fields on the active variant; matching fields on the other side follow. `visible` never follows. */
export function patchNodeFill(
  states: AdDesignStates,
  variant: 'rest' | 'hover',
  id: string,
  paintId: string,
  patch: Record<string, unknown>,
): AdDesignStates {
  const other: 'rest' | 'hover' = variant === 'rest' ? 'hover' : 'rest';
  const curFill = nodeFills(getNode(states[variant], id)).find((p) => p.id === paintId);
  const altFill = nodeFills(getNode(states[other], id)).find((p) => p.id === paintId);
  if (!curFill) return states;
  const nextFill = { ...curFill, ...patch, id: curFill.id } as AdPaint;
  const curFills = nodeFills(getNode(states[variant], id)).map((p) => (p.id === paintId ? nextFill : p));
  let next = patchVariantNode(states, variant, id, { fills: curFills } as Partial<AdNode>);
  if (!altFill) return next;
  const follow: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (key === 'visible' || key === 'id') continue;
    if (visualEqual((altFill as unknown as Record<string, unknown>)[key], (curFill as unknown as Record<string, unknown>)[key])) {
      follow[key] = value;
    }
  }
  if (Object.keys(follow).length === 0) return next;
  const altNext = { ...altFill, ...follow, id: altFill.id } as AdPaint;
  const altFills = nodeFills(getNode(next[other], id)).map((p) => (p.id === paintId ? altNext : p));
  return patchVariantNode(next, other, id, { fills: altFills } as Partial<AdNode>);
}

/** Reorder fills in both variants by moving a paint id to a new index (Figma: 0 = top). */
export function reorderNodeFills(
  states: AdDesignStates,
  id: string,
  fromIndex: number,
  toIndex: number,
): AdDesignStates {
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return states;
  return mapBoth(states, (doc) => {
    const fills = [...nodeFills(doc.nodes[id])];
    if (fromIndex >= fills.length) return doc;
    const [moved] = fills.splice(fromIndex, 1);
    if (!moved) return doc;
    const dest = Math.min(toIndex, fills.length);
    fills.splice(dest, 0, moved);
    return replaceNodeFills(doc, id, fills);
  });
}

/** Copy visual props from one variant onto the other (structure stays shared). */
export function copyNodeVisual(
  states: AdDesignStates,
  id: string,
  from: 'rest' | 'hover',
  to: 'rest' | 'hover',
): AdDesignStates {
  if (from === to) return states;
  const src = states[from].nodes[id];
  const dst = states[to].nodes[id];
  if (!src || !dst) return states;
  const doc = cloneDesignDoc(states[to]);
  doc.nodes[id] = copyVisualProps(src, dst);
  return to === 'rest'
    ? alignDesignPair(doc, cloneDesignDoc(states.hover))
    : alignDesignPair(cloneDesignDoc(states.rest), doc);
}

export function patchSharedMeta(
  states: AdDesignStates,
  id: string,
  patch: Pick<Partial<AdNode>, 'name' | 'locked'>,
): AdDesignStates {
  return mapBoth(states, (doc) => {
    const cur = doc.nodes[id];
    if (!cur) return doc;
    return { ...doc, nodes: { ...doc.nodes, [id]: { ...cur, ...patch, id: cur.id, type: cur.type } as AdNode } };
  });
}

export function resetNodeHover(states: AdDesignStates, id: string): AdDesignStates {
  return copyNodeVisual(states, id, 'rest', 'hover');
}

export function hideOnHover(states: AdDesignStates, id: string): AdDesignStates {
  const restNode = states.rest.nodes[id];
  if (!restNode) return states;
  let next = states;
  if (nodeOpacity(restNode) < 0.02) {
    next = patchVariantNode(next, 'rest', id, { visible: true, opacity: 1 });
  }
  return patchVariantNode(next, 'hover', id, { visible: true, opacity: 0 });
}

export function showOnlyOnHover(states: AdDesignStates, id: string): AdDesignStates {
  let next = patchVariantNode(states, 'rest', id, { visible: true, opacity: 0 });
  next = patchVariantNode(next, 'hover', id, { visible: true, opacity: 1 });
  return next;
}

function parseHex(color: string): [number, number, number] | null {
  const c = color.trim().replace('#', '');
  if (c.length === 3) {
    return [
      parseInt(c[0] + c[0], 16),
      parseInt(c[1] + c[1], 16),
      parseInt(c[2] + c[2], 16),
    ];
  }
  if (c.length >= 6) {
    return [parseInt(c.slice(0, 2), 16), parseInt(c.slice(2, 4), 16), parseInt(c.slice(4, 6), 16)];
  }
  return null;
}

export function lerpHex(a: string, b: string, t: number): string {
  const pa = parseHex(a);
  const pb = parseHex(b);
  if (!pa || !pb) return t < 0.5 ? a : b;
  const to = (n: number) => Math.round(n).toString(16).padStart(2, '0');
  return `#${to(lerp(pa[0], pb[0], t))}${to(lerp(pa[1], pb[1], t))}${to(lerp(pa[2], pb[2], t))}`;
}

export function mixPaint(a: AdPaint | undefined, b: AdPaint | undefined, t: number): AdPaint | undefined {
  if (!a && !b) return undefined;
  if (!a) return b;
  if (!b) return a;
  return mixOnePaint(a, b, t);
}

function mixOnePaint(a: AdPaint, b: AdPaint, t: number): AdPaint {
  const vis = lerp(a.visible !== false ? 1 : 0, b.visible !== false ? 1 : 0, t);
  const opacity = lerp(a.opacity, b.opacity, t) * vis;
  const visible = vis > 0.02;
  if (a.type === 'solid' && b.type === 'solid') {
    return { ...a, visible, opacity, color: lerpHex(a.color, b.color, t) };
  }
  if (a.type === 'gradient' && b.type === 'gradient') {
    const count = Math.max(a.stops.length, b.stops.length, 2);
    const stops = [];
    for (let i = 0; i < count; i++) {
      const sa = a.stops[Math.min(i, a.stops.length - 1)] ?? { color: '#000', position: 0 };
      const sb = b.stops[Math.min(i, b.stops.length - 1)] ?? sa;
      stops.push({ color: lerpHex(sa.color, sb.color, t), position: lerp(sa.position, sb.position, t) });
    }
    return {
      ...a,
      visible,
      opacity,
      angle: lerp(a.angle ?? 180, b.angle ?? 180, t),
      stops,
    };
  }
  if (a.type === 'image' && b.type === 'image') {
    const src = t < 0.5 ? a : b;
    return { ...src, visible, opacity };
  }
  const pick = t < 0.5 ? a : b;
  return { ...pick, visible, opacity };
}

export function mixPaints(a: AdPaint[] | undefined, b: AdPaint[] | undefined, t: number): AdPaint[] {
  const left = a ?? [];
  const right = b ?? [];
  const byId = new Map(right.map((p) => [p.id, p]));
  const used = new Set<string>();
  const out: AdPaint[] = [];
  for (const pa of left) {
    used.add(pa.id);
    const pb = byId.get(pa.id);
    out.push(mixOnePaint(pa, pb ?? { ...pa, visible: false }, t));
  }
  for (const pb of right) {
    if (used.has(pb.id)) continue;
    out.push(mixOnePaint({ ...pb, visible: false }, pb, t));
  }
  return out;
}

function mixOneEffect(a: AdEffect, b: AdEffect, t: number): AdEffect {
  if (a.type === 'crt' && b.type === 'crt') {
    const vis = lerp(a.visible ? 1 : 0, b.visible ? 1 : 0, t);
    const mixed = mixCrtParams(sanitizeCrtParams(a.params), sanitizeCrtParams(b.params), t);
    return {
      id: a.id,
      type: 'crt',
      visible: vis > 0.02,
      params: scaleCrtIntensity(mixed, vis),
    };
  }
  if (a.type === 'blur' && b.type === 'blur') {
    const vis = lerp(a.visible ? 1 : 0, b.visible ? 1 : 0, t);
    return { id: a.id, type: 'blur', visible: vis > 0.02, radius: lerp(a.radius, b.radius, t) };
  }
  if (a.type === 'noise' && b.type === 'noise') {
    const vis = lerp(a.visible ? 1 : 0, b.visible ? 1 : 0, t);
    return { id: a.id, type: 'noise', visible: vis > 0.02, amount: lerp(a.amount, b.amount, t) };
  }
  return t < 0.5 ? a : b;
}

export function mixEffects(a: AdEffect[] | undefined, b: AdEffect[] | undefined, t: number): AdEffect[] {
  const left = a ?? [];
  const right = b ?? [];
  const byId = new Map(right.map((e) => [e.id, e]));
  const used = new Set<string>();
  const out: AdEffect[] = [];
  for (const ea of left) {
    used.add(ea.id);
    const eb = byId.get(ea.id);
    out.push(mixOneEffect(ea, eb ?? { ...ea, visible: false }, t));
  }
  for (const eb of right) {
    if (used.has(eb.id)) continue;
    out.push(mixOneEffect({ ...eb, visible: false }, eb, t));
  }
  return out;
}

export function mixNodeVisual(a: AdNode, b: AdNode, t: number): AdNode {
  const k = Math.min(1, Math.max(0, t));
  const op = lerp(nodeOpacity(a), nodeOpacity(b), k);
  const base = {
    ...a,
    x: lerp(a.x, b.x, k),
    y: lerp(a.y, b.y, k),
    w: lerp(a.w, b.w, k),
    h: lerp(a.h, b.h, k),
    rotation: lerp(a.rotation, b.rotation, k),
    opacity: op,
    visible: op > 0.001,
    effects: mixEffects(a.effects, b.effects, k),
    fills: mixPaints(nodeFills(a), nodeFills(b), k),
  };
  if (a.type === 'text' && b.type === 'text') {
    const node: AdTextNode = {
      ...a,
      ...base,
      type: 'text',
      fontSize: lerp(a.fontSize, b.fontSize, k),
      letterSpacing: lerp(a.letterSpacing, b.letterSpacing, k),
      fontWeight: k < 0.5 ? a.fontWeight : b.fontWeight,
      characters: k < 0.5 ? a.characters : b.characters,
      fills: mixPaints(a.fills, b.fills, k),
    };
    return node;
  }
  if (a.type === 'image' && b.type === 'image') {
    return {
      ...a,
      ...base,
      type: 'image',
      src: k < 0.5 ? a.src : b.src,
      cornerRadius: lerp(a.cornerRadius, b.cornerRadius, k),
      tint: k < 0.5 ? a.tint : b.tint,
      fills: mixPaints(a.fills, b.fills, k),
    };
  }
  if (a.type === 'rectangle' && b.type === 'rectangle') {
    return {
      ...a,
      ...base,
      type: 'rectangle',
      cornerRadius: lerp(a.cornerRadius, b.cornerRadius, k),
      fills: mixPaints(a.fills, b.fills, k),
    };
  }
  if (a.type === 'frame' && b.type === 'frame') {
    return {
      ...a,
      ...base,
      type: 'frame',
      childIds: [...a.childIds],
      cornerRadius: lerp(a.cornerRadius, b.cornerRadius, k),
      fills: mixPaints(a.fills, b.fills, k),
    };
  }
  return { ...a, ...base } as AdNode;
}

export function mixedNode(states: AdDesignStates, id: string, t: number): AdNode | null {
  const a = getNode(states.rest, id);
  const b = getNode(states.hover, id) ?? a;
  if (!a) return b;
  if (!b) return a;
  return mixNodeVisual(a, b, t);
}

export function absBoxOf(doc: AdDesignDoc, id: string): { x: number; y: number; w: number; h: number } | null {
  const node = getNode(doc, id);
  if (!node) return null;
  let x = node.x;
  let y = node.y;
  let p = node.parentId ? getNode(doc, node.parentId) : null;
  while (p) {
    x += p.x;
    y += p.y;
    p = p.parentId ? getNode(doc, p.parentId) : null;
  }
  return { x, y, w: node.w, h: node.h };
}

export function ensureCrtOnRoot(doc: AdDesignDoc, params: Record<string, number | boolean | string>): AdDesignDoc {
  const root = getRoot(doc);
  const effects = [...(root.effects || [])];
  const idx = effects.findIndex((e) => e.type === 'crt');
  const fx = {
    id: idx >= 0 && effects[idx]!.type === 'crt' ? effects[idx]!.id : 'crt_main',
    type: 'crt' as const,
    visible: true,
    params: { ...params },
  };
  if (idx >= 0) effects[idx] = fx;
  else effects.push(fx);
  return {
    ...doc,
    nodes: { ...doc.nodes, [root.id]: { ...root, effects } },
  };
}

export function setCoverImage(states: AdDesignStates, src: string): AdDesignStates {
  const patchDoc = (doc: AdDesignDoc): AdDesignDoc => {
    const root = getRoot(doc);
    const bg = Object.values(doc.nodes).find(
      (n) => n.type === 'image' && (n.name === 'Background' || n.parentId === root.id),
    );
    if (bg && bg.type === 'image') {
      return { ...doc, nodes: { ...doc.nodes, [bg.id]: { ...bg, src } } };
    }
    const imgId = `img_cover`;
    let id = imgId;
    let n = 0;
    while (doc.nodes[id]) {
      n += 1;
      id = `${imgId}_${n}`;
    }
    const image = {
      id,
      type: 'image' as const,
      name: 'Background',
      parentId: root.id,
      visible: true,
      locked: false,
      x: 0,
      y: 0,
      w: doc.width,
      h: doc.height,
      rotation: 0,
      opacity: 1,
      src,
      scaleMode: 'fill' as const,
      cornerRadius: 0,
      effects: [],
      fills: [],
    };
    return {
      ...doc,
      nodes: {
        ...doc.nodes,
        [id]: image,
        [root.id]: { ...root, childIds: [id, ...root.childIds] },
      },
    };
  };
  return alignDesignPair(patchDoc(states.rest), patchDoc(states.hover));
}

export const ARTBOARD_PRESETS: Array<{ id: string; label: string; w: number; h: number }> = [
  { id: 'banner', label: '16:11', w: 640, h: 440 },
  { id: 'hd', label: '16:9', w: 640, h: 360 },
  { id: 'ultrawide', label: '21:9', w: 840, h: 360 },
  { id: 'tv', label: '4:3', w: 640, h: 480 },
  { id: 'square', label: '1:1', w: 480, h: 480 },
  { id: 'leader', label: '728×90', w: 728, h: 90 },
  { id: 'mpu', label: '300×250', w: 300, h: 250 },
  { id: 'billboard', label: '970×250', w: 970, h: 250 },
];

function resizeDocArtboard(doc: AdDesignDoc, width: number, height: number): AdDesignDoc {
  const w = Math.max(64, Math.round(width));
  const h = Math.max(64, Math.round(height));
  const root = getRoot(doc);
  const oldW = doc.width;
  const oldH = doc.height;
  const nodes = { ...doc.nodes };
  nodes[root.id] = { ...root, x: 0, y: 0, w, h };
  for (const node of Object.values(nodes)) {
    if (node.id === root.id) continue;
    if (node.type !== 'image') continue;
    const fullBleed =
      Math.abs(node.x) < 1
      && Math.abs(node.y) < 1
      && Math.abs(node.w - oldW) < 2
      && Math.abs(node.h - oldH) < 2;
    if (fullBleed || node.name === 'Background') {
      nodes[node.id] = { ...node, x: 0, y: 0, w, h };
    }
  }
  return { ...doc, width: w, height: h, nodes };
}

/** Resize the working Frame (artboard) on both Rest and Hover. */
export function resizeArtboard(states: AdDesignStates, width: number, height: number): AdDesignStates {
  return alignDesignPair(
    resizeDocArtboard(cloneDesignDoc(states.rest), width, height),
    resizeDocArtboard(cloneDesignDoc(states.hover), width, height),
  );
}
