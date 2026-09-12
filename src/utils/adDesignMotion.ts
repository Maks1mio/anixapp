/**
 * Rest/Hover as one Figma-like tree: same ids, interpolated playback.
 */
import {
  cloneDesignDoc,
  getNode,
  getRoot,
  type AdDesignDoc,
  type AdDesignStates,
  type AdFrameNode,
  type AdNode,
  type AdPaint,
  type AdTextNode,
} from './adDesignDoc';

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

export function hoverDiffers(rest: AdNode | null, hover: AdNode | null): boolean {
  if (!rest || !hover) return Boolean(rest || hover);
  if (Math.abs(nodeOpacity(rest) - nodeOpacity(hover)) > 0.01) return true;
  if (Math.abs(rest.x - hover.x) > 0.2 || Math.abs(rest.y - hover.y) > 0.2) return true;
  if (Math.abs(rest.w - hover.w) > 0.2 || Math.abs(rest.h - hover.h) > 0.2) return true;
  if (Math.abs(rest.rotation - hover.rotation) > 0.2) return true;
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
  if (a.type === 'solid' && b.type === 'solid') {
    return { type: 'solid', color: lerpHex(a.color, b.color, t), opacity: lerp(a.opacity, b.opacity, t) };
  }
  if (a.type === b.type) {
    return t < 0.5 ? a : b;
  }
  return t < 0.5 ? a : b;
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
      fills: [mixPaint(a.fills[0], b.fills[0], k) ?? a.fills[0]!],
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
    };
  }
  if (a.type === 'rectangle' && b.type === 'rectangle') {
    return {
      ...a,
      ...base,
      type: 'rectangle',
      cornerRadius: lerp(a.cornerRadius, b.cornerRadius, k),
      fills: [mixPaint(a.fills[0], b.fills[0], k) ?? a.fills[0]!].filter(Boolean) as AdPaint[],
    };
  }
  if (a.type === 'frame' && b.type === 'frame') {
    return {
      ...a,
      ...base,
      type: 'frame',
      childIds: [...a.childIds],
      cornerRadius: lerp(a.cornerRadius, b.cornerRadius, k),
      fills: [mixPaint(a.fills[0], b.fills[0], k) ?? a.fills[0]!].filter(Boolean) as AdPaint[],
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
