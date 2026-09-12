/**
 * Figma-like ad design document (scene graph).
 * Stored as JSONB `design: { rest, hover }` on the ad record.
 */

import { bannerIconSvg } from './vpnBannerIcons';
import { encodeSvgDataUrl } from './svgTint';
import { measureAdLayers, type VpnBannerOverlay } from './vpnSponsorBanner';

export type AdGradientStop = { color: string; position: number; opacity: number };

export type AdPaint =
  | { id: string; visible: boolean; type: 'solid'; color: string; opacity: number }
  | { id: string; visible: boolean; type: 'image'; src: string; opacity: number; scaleMode: 'fill' | 'fit' | 'crop' | 'tile' }
  | {
      id: string;
      visible: boolean;
      type: 'gradient';
      opacity: number;
      angle: number;
      stops: AdGradientStop[];
    };

export type AdStroke = {
  color: string;
  opacity: number;
  weight: number;
  align: 'inside' | 'center' | 'outside';
};

export type AdEffect =
  | { id: string; type: 'crt'; visible: boolean; params: Record<string, number | boolean | string> }
  | { id: string; type: 'blur'; visible: boolean; radius: number }
  | { id: string; type: 'noise'; visible: boolean; amount: number };

export type AdLayoutMode = 'none' | 'horizontal' | 'vertical';
export type AdPrimaryAlign = 'min' | 'center' | 'max' | 'space-between';
export type AdCounterAlign = 'min' | 'center' | 'max';
export type AdTextAlign = 'left' | 'center' | 'right';
export type AdVerticalAlign = 'top' | 'middle' | 'bottom';

export type AdNodeType = 'frame' | 'text' | 'image' | 'rectangle';

type AdNodeBase = {
  id: string;
  type: AdNodeType;
  name: string;
  parentId: string | null;
  visible: boolean;
  locked: boolean;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  opacity: number;
  effects: AdEffect[];
};

export type AdFrameNode = AdNodeBase & {
  type: 'frame';
  childIds: string[];
  layoutMode: AdLayoutMode;
  primaryAxisAlign: AdPrimaryAlign;
  counterAxisAlign: AdCounterAlign;
  itemSpacing: number;
  paddingTop: number;
  paddingRight: number;
  paddingBottom: number;
  paddingLeft: number;
  clipsContent: boolean;
  cornerRadius: number;
  fills: AdPaint[];
  strokes: AdStroke[];
};

export type AdTextNode = AdNodeBase & {
  type: 'text';
  characters: string;
  fontFamily: string;
  fontWeight: number;
  fontSize: number;
  lineHeight: number | 'auto';
  letterSpacing: number;
  textAlign: AdTextAlign;
  verticalAlign: AdVerticalAlign;
  fills: AdPaint[];
};

export type AdImageNode = AdNodeBase & {
  type: 'image';
  src: string;
  scaleMode: 'fill' | 'fit' | 'crop';
  cornerRadius: number;
  /** Fill color for SVG icons (data URL). */
  tint?: string;
  /** Lucide/banner icon id when this layer is a glyph. */
  iconId?: string;
  fills: AdPaint[];
};

export type AdRectNode = AdNodeBase & {
  type: 'rectangle';
  cornerRadius: number;
  fills: AdPaint[];
  strokes: AdStroke[];
};

export type AdNode = AdFrameNode | AdTextNode | AdImageNode | AdRectNode;

export type AdDesignDoc = {
  version: 2;
  width: number;
  height: number;
  rootId: string;
  nodes: Record<string, AdNode>;
};

export type AdDesignStates = {
  rest: AdDesignDoc;
  hover: AdDesignDoc;
};

function uid(prefix = 'n'): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export function createEffectId(): string {
  return uid('fx');
}

export function createPaintId(): string {
  return uid('pt');
}

export function solid(color: string, opacity = 1): AdPaint {
  return { id: createPaintId(), visible: true, type: 'solid', color, opacity };
}

/** Keep `input[type=color]` valid — 3/8-digit hex otherwise becomes black. */
export function sanitizeHexRgb(color: string, fallback = '#000000'): string {
  const h = String(color || '').replace('#', '').trim();
  if (/^[0-9a-f]{3}$/i.test(h)) {
    return `#${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}`.toLowerCase();
  }
  if (/^[0-9a-f]{6}([0-9a-f]{2})?$/i.test(h)) return `#${h.slice(0, 6).toLowerCase()}`;
  return fallback;
}

export function stopCssColor(stop: { color: string; opacity?: number }): string {
  const rgb = sanitizeHexRgb(stop.color);
  const a = Math.min(1, Math.max(0, stop.opacity ?? 1));
  const n = rgb.slice(1);
  const r = parseInt(n.slice(0, 2), 16);
  const g = parseInt(n.slice(2, 4), 16);
  const b = parseInt(n.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

export function linearPaint(opacity = 1, angle = 180, overlay = false): AdPaint {
  return {
    id: createPaintId(),
    visible: true,
    type: 'gradient',
    opacity,
    angle,
    stops: overlay
      ? [
          { color: '#000000', position: 0, opacity: 0 },
          { color: '#000000', position: 1, opacity: 0.72 },
        ]
      : [
          { color: '#000000', position: 0, opacity: 1 },
          { color: '#ffffff', position: 1, opacity: 1 },
        ],
  };
}

export function imagePaint(src: string, opacity = 1): AdPaint {
  return { id: createPaintId(), visible: true, type: 'image', src, opacity, scaleMode: 'fill' };
}

export function nodeFills(node: AdNode | null | undefined): AdPaint[] {
  if (!node) return [];
  if (node.type === 'frame' || node.type === 'text' || node.type === 'rectangle' || node.type === 'image') {
    return node.fills ?? [];
  }
  return [];
}

export function canHaveFills(node: AdNode | null | undefined): boolean {
  return Boolean(node && (node.type === 'frame' || node.type === 'text' || node.type === 'rectangle' || node.type === 'image'));
}

export function createEmptyDesignDoc(width = 640, height = 440): AdDesignDoc {
  const rootId = uid('frame');
  const root: AdFrameNode = {
    id: rootId,
    type: 'frame',
    name: 'Frame',
    parentId: null,
    visible: true,
    locked: false,
    x: 0,
    y: 0,
    w: width,
    h: height,
    rotation: 0,
    opacity: 1,
    childIds: [],
    layoutMode: 'none',
    primaryAxisAlign: 'min',
    counterAxisAlign: 'min',
    itemSpacing: 8,
    paddingTop: 0,
    paddingRight: 0,
    paddingBottom: 0,
    paddingLeft: 0,
    clipsContent: true,
    cornerRadius: 14,
    fills: [solid('#121218')],
    strokes: [{ color: '#595959', opacity: 1, weight: 1, align: 'inside' }],
    effects: [],
  };
  return { version: 2, width, height, rootId, nodes: { [rootId]: root } };
}

export function createEmptyDesignStates(): AdDesignStates {
  const rest = createEmptyDesignDoc();
  return { rest, hover: cloneDesignDoc(rest) };
}

export function cloneDesignDoc(doc: AdDesignDoc): AdDesignDoc {
  // Svelte 5 $state Proxies break structuredClone — JSON round-trip unwraps them.
  try {
    return sanitizeDesignDoc(JSON.parse(JSON.stringify(doc)) as unknown);
  } catch {
    return createEmptyDesignDoc(doc?.width, doc?.height);
  }
}

export function cloneDesignStates(states: AdDesignStates): AdDesignStates {
  return { rest: cloneDesignDoc(states.rest), hover: cloneDesignDoc(states.hover) };
}

export function getNode(doc: AdDesignDoc, id: string | null | undefined): AdNode | null {
  if (!id) return null;
  return doc.nodes[id] ?? null;
}

export function getRoot(doc: AdDesignDoc): AdFrameNode {
  const n = doc.nodes[doc.rootId];
  if (!n || n.type !== 'frame') throw new Error('invalid design root');
  return n;
}

export function listChildren(doc: AdDesignDoc, frameId: string): AdNode[] {
  const frame = getNode(doc, frameId);
  if (!frame || frame.type !== 'frame') return [];
  return frame.childIds.map((id) => doc.nodes[id]).filter(Boolean) as AdNode[];
}

/** Flatten tree depth-first for layers panel (root first). */
export function flattenLayers(doc: AdDesignDoc): Array<{ node: AdNode; depth: number }> {
  const out: Array<{ node: AdNode; depth: number }> = [];
  const walk = (id: string, depth: number) => {
    const node = doc.nodes[id];
    if (!node) return;
    out.push({ node, depth });
    if (node.type === 'frame') {
      for (const cid of [...node.childIds].reverse()) walk(cid, depth + 1);
    }
  };
  walk(doc.rootId, 0);
  return out;
}

export function updateNode(
  doc: AdDesignDoc,
  id: string,
  patch: Partial<AdNode>,
): AdDesignDoc {
  const cur = doc.nodes[id];
  if (!cur) return doc;
  const next = { ...cur, ...patch, id: cur.id, type: cur.type } as AdNode;
  return { ...doc, nodes: { ...doc.nodes, [id]: next } };
}

export function addChild(doc: AdDesignDoc, parentId: string, node: AdNode): AdDesignDoc {
  const parent = doc.nodes[parentId];
  if (!parent || parent.type !== 'frame') return doc;
  const child = { ...node, parentId };
  const frame: AdFrameNode = {
    ...parent,
    childIds: [...parent.childIds, child.id],
  };
  return {
    ...doc,
    nodes: { ...doc.nodes, [parentId]: frame, [child.id]: child },
  };
}

function isAncestorOf(doc: AdDesignDoc, ancestorId: string, nodeId: string): boolean {
  let cur: AdNode | null = getNode(doc, nodeId);
  while (cur) {
    if (cur.id === ancestorId) return true;
    cur = cur.parentId ? getNode(doc, cur.parentId) : null;
  }
  return false;
}

/**
 * Reorder / reparent like Figma layers. Display list is reverse(childIds):
 * top of the panel = front = last childId.
 */
export function moveNodeRelative(
  doc: AdDesignDoc,
  nodeId: string,
  targetId: string,
  place: 'before' | 'after' | 'inside',
): AdDesignDoc {
  if (nodeId === targetId || nodeId === doc.rootId) return doc;
  const node = getNode(doc, nodeId);
  const target = getNode(doc, targetId);
  if (!node || !target) return doc;
  if (isAncestorOf(doc, nodeId, targetId)) return doc;

  let parentId: string;
  let displayIds: string[];

  if (place === 'inside') {
    if (target.type !== 'frame') return doc;
    parentId = target.id;
    const frame = target;
    displayIds = [...frame.childIds].reverse().filter((id) => id !== nodeId);
    displayIds = [nodeId, ...displayIds];
  } else {
    if (!target.parentId) return doc;
    parentId = target.parentId;
    const parent = getNode(doc, parentId);
    if (!parent || parent.type !== 'frame') return doc;
    displayIds = [...parent.childIds].reverse().filter((id) => id !== nodeId);
    let idx = displayIds.indexOf(targetId);
    if (idx < 0) return doc;
    if (place === 'after') idx += 1;
    displayIds.splice(idx, 0, nodeId);
  }

  const childIds = [...displayIds].reverse();
  const nodes = { ...doc.nodes };
  if (node.parentId && node.parentId !== parentId && nodes[node.parentId]?.type === 'frame') {
    const old = nodes[node.parentId] as AdFrameNode;
    nodes[node.parentId] = { ...old, childIds: old.childIds.filter((c) => c !== nodeId) };
  }
  const parent = nodes[parentId];
  if (!parent || parent.type !== 'frame') return doc;
  nodes[parentId] = { ...parent, childIds };
  nodes[nodeId] = { ...node, parentId };
  return { ...doc, nodes };
}

/** Nudge one step in the layers list. `forward` = toward the top (drawn later). */
export function nudgeNodeZ(doc: AdDesignDoc, nodeId: string, forward: boolean): AdDesignDoc {
  const node = getNode(doc, nodeId);
  if (!node || !node.parentId || nodeId === doc.rootId) return doc;
  const parent = getNode(doc, node.parentId);
  if (!parent || parent.type !== 'frame') return doc;
  const display = [...parent.childIds].reverse();
  const from = display.indexOf(nodeId);
  if (from < 0) return doc;
  const to = forward ? from - 1 : from + 1;
  if (to < 0 || to >= display.length) return doc;
  const targetId = display[to]!;
  return moveNodeRelative(doc, nodeId, targetId, forward ? 'before' : 'after');
}

export function removeNode(doc: AdDesignDoc, id: string): AdDesignDoc {
  if (id === doc.rootId) return doc;
  const node = doc.nodes[id];
  if (!node) return doc;
  const nodes = { ...doc.nodes };
  const purge = (nid: string) => {
    const n = nodes[nid];
    if (!n) return;
    if (n.type === 'frame') n.childIds.forEach(purge);
    delete nodes[nid];
  };
  purge(id);
  if (node.parentId && nodes[node.parentId]?.type === 'frame') {
    const p = nodes[node.parentId] as AdFrameNode;
    nodes[node.parentId] = { ...p, childIds: p.childIds.filter((c) => c !== id) };
  }
  return { ...doc, nodes };
}

export function createTextNode(partial?: Partial<AdTextNode>): AdTextNode {
  return {
    id: uid('text'),
    type: 'text',
    name: 'Text',
    parentId: null,
    visible: true,
    locked: false,
    x: 40,
    y: 180,
    w: 560,
    h: 48,
    rotation: 0,
    opacity: 1,
    characters: 'Текст',
    fontFamily: 'IBM Plex Sans',
    fontWeight: 700,
    fontSize: 32,
    lineHeight: 'auto',
    letterSpacing: 0,
    textAlign: 'center',
    verticalAlign: 'middle',
    fills: [solid('#FFFFFF')],
    effects: [],
    ...partial,
  };
}

export function createImageNode(src: string, partial?: Partial<AdImageNode>): AdImageNode {
  return {
    id: uid('img'),
    type: 'image',
    name: 'Image',
    parentId: null,
    visible: true,
    locked: false,
    x: 40,
    y: 40,
    w: 200,
    h: 200,
    rotation: 0,
    opacity: 1,
    src,
    scaleMode: 'fill',
    cornerRadius: 0,
    effects: [],
    fills: [],
    ...partial,
  };
}

export function createRectNode(partial?: Partial<AdRectNode>): AdRectNode {
  return {
    id: uid('rect'),
    type: 'rectangle',
    name: 'Rectangle',
    parentId: null,
    visible: true,
    locked: false,
    x: 80,
    y: 80,
    w: 200,
    h: 120,
    rotation: 0,
    opacity: 1,
    cornerRadius: 8,
    fills: [solid('#3d8bfd', 0.35)],
    strokes: [],
    effects: [],
    ...partial,
  };
}

export function createFrameNode(partial?: Partial<AdFrameNode>): AdFrameNode {
  return {
    id: uid('frame'),
    type: 'frame',
    name: 'Frame',
    parentId: null,
    visible: true,
    locked: false,
    x: 60,
    y: 60,
    w: 280,
    h: 200,
    rotation: 0,
    opacity: 1,
    childIds: [],
    layoutMode: 'none',
    primaryAxisAlign: 'min',
    counterAxisAlign: 'min',
    itemSpacing: 8,
    paddingTop: 12,
    paddingRight: 12,
    paddingBottom: 12,
    paddingLeft: 12,
    clipsContent: true,
    cornerRadius: 8,
    fills: [solid('#1a1a22')],
    strokes: [{ color: '#595959', opacity: 1, weight: 1, align: 'inside' }],
    effects: [],
    ...partial,
  };
}

export function alignNode(
  doc: AdDesignDoc,
  id: string,
  mode: 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom',
): AdDesignDoc {
  const node = doc.nodes[id];
  if (!node || !node.parentId) return doc;
  const parent = doc.nodes[node.parentId];
  if (!parent) return doc;
  let x = node.x;
  let y = node.y;
  if (mode === 'left') x = 0;
  if (mode === 'hcenter') x = (parent.w - node.w) / 2;
  if (mode === 'right') x = parent.w - node.w;
  if (mode === 'top') y = 0;
  if (mode === 'vcenter') y = (parent.h - node.h) / 2;
  if (mode === 'bottom') y = parent.h - node.h;
  return updateNode(doc, id, { x, y });
}

function asNum(v: unknown, fb: number): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : fb;
}

function asStr(v: unknown, fb: string): string {
  return typeof v === 'string' ? v : fb;
}

function asBool(v: unknown, fb: boolean): boolean {
  return typeof v === 'boolean' ? v : fb;
}

function sanitizePaint(raw: unknown, index = 0): AdPaint {
  const p = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const id = asStr(p.id, `pt_${index}`);
  const visible = asBool(p.visible, true);
  const opacity = Math.min(1, Math.max(0, asNum(p.opacity, 1)));
  if (p.type === 'image') {
    return {
      id,
      visible,
      type: 'image',
      src: asStr(p.src, ''),
      opacity,
      scaleMode: (['fill', 'fit', 'crop', 'tile'] as const).includes(p.scaleMode as 'fill')
        ? (p.scaleMode as 'fill' | 'fit' | 'crop' | 'tile')
        : 'fill',
    };
  }
  if (p.type === 'gradient') {
    return {
      id,
      visible,
      type: 'gradient',
      opacity,
      angle: asNum(p.angle, 180),
      stops: Array.isArray(p.stops) && p.stops.length
        ? p.stops.map((s) => {
            const o = s && typeof s === 'object' ? (s as Record<string, unknown>) : {};
            return {
              color: sanitizeHexRgb(asStr(o.color, '#ffffff'), '#ffffff'),
              position: asNum(o.position, 0),
              opacity: Math.min(1, Math.max(0, asNum(o.opacity, 1))),
            };
          })
        : [
            { color: '#000000', position: 0, opacity: 1 },
            { color: '#ffffff', position: 1, opacity: 1 },
          ],
    };
  }
  return { id, visible, type: 'solid', color: asStr(p.color, '#ffffff'), opacity };
}

export function sanitizeEffects(raw: unknown): AdEffect[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((e, i) => {
    const x = e && typeof e === 'object' ? (e as Record<string, unknown>) : {};
    const t = asStr(x.type, 'blur');
    if (t === 'crt') {
      return {
        id: asStr(x.id, `fx_${i}`),
        type: 'crt' as const,
        visible: asBool(x.visible, true),
        params: x.params && typeof x.params === 'object' ? (x.params as Record<string, number | boolean | string>) : {},
      };
    }
    if (t === 'noise') {
      return {
        id: asStr(x.id, `fx_${i}`),
        type: 'noise' as const,
        visible: asBool(x.visible, true),
        amount: asNum(x.amount, 0.2),
      };
    }
    return {
      id: asStr(x.id, `fx_${i}`),
      type: 'blur' as const,
      visible: asBool(x.visible, true),
      radius: asNum(x.radius, 8),
    };
  });
}

export function nodeEffects(node: AdNode | null | undefined): AdEffect[] {
  return node?.effects ?? [];
}

function sanitizeNode(raw: unknown): AdNode | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const type = o.type;
  const base = {
    id: asStr(o.id, uid()),
    name: asStr(o.name, 'Layer'),
    parentId: o.parentId == null ? null : asStr(o.parentId, ''),
    visible: asBool(o.visible, true),
    locked: asBool(o.locked, false),
    x: asNum(o.x, 0),
    y: asNum(o.y, 0),
    w: Math.max(1, asNum(o.w, 100)),
    h: Math.max(1, asNum(o.h, 40)),
    rotation: asNum(o.rotation, 0),
    opacity: Math.min(1, Math.max(0, asNum(o.opacity, 1))),
    effects: sanitizeEffects(o.effects),
  };
  if (type === 'text') {
    return {
      ...base,
      type: 'text',
      characters: asStr(o.characters, ''),
      fontFamily: asStr(o.fontFamily, 'IBM Plex Sans'),
      fontWeight: asNum(o.fontWeight, 400),
      fontSize: asNum(o.fontSize, 16),
      lineHeight: o.lineHeight === 'auto' ? 'auto' : asNum(o.lineHeight, 0) || 'auto',
      letterSpacing: asNum(o.letterSpacing, 0),
      textAlign: (['left', 'center', 'right'] as const).includes(o.textAlign as 'left')
        ? (o.textAlign as AdTextAlign)
        : 'left',
      verticalAlign: (['top', 'middle', 'bottom'] as const).includes(o.verticalAlign as 'top')
        ? (o.verticalAlign as AdVerticalAlign)
        : 'top',
      fills: Array.isArray(o.fills) && o.fills.length ? o.fills.map((p, i) => sanitizePaint(p, i)) : [solid('#fff')],
    };
  }
  if (type === 'image') {
    return {
      ...base,
      type: 'image',
      src: asStr(o.src, ''),
      scaleMode: (['fill', 'fit', 'crop'] as const).includes(o.scaleMode as 'fill')
        ? (o.scaleMode as 'fill' | 'fit' | 'crop')
        : 'fill',
      cornerRadius: asNum(o.cornerRadius, 0),
      tint: typeof o.tint === 'string' && /^#/.test(o.tint) ? o.tint : undefined,
      iconId: typeof o.iconId === 'string' && o.iconId ? o.iconId : undefined,
      fills: Array.isArray(o.fills) ? o.fills.map((p, i) => sanitizePaint(p, i)) : [],
    };
  }
  if (type === 'rectangle') {
    return {
      ...base,
      type: 'rectangle',
      cornerRadius: asNum(o.cornerRadius, 0),
      fills: Array.isArray(o.fills) ? o.fills.map((p, i) => sanitizePaint(p, i)) : [solid('#888')],
      strokes: Array.isArray(o.strokes)
        ? o.strokes.map((s) => {
            const x = s && typeof s === 'object' ? (s as Record<string, unknown>) : {};
            return {
              color: asStr(x.color, '#000'),
              opacity: asNum(x.opacity, 1),
              weight: asNum(x.weight, 1),
              align: 'inside' as const,
            };
          })
        : [],
    };
  }
  if (type === 'frame') {
    return {
      ...base,
      type: 'frame',
      childIds: Array.isArray(o.childIds) ? o.childIds.map((c) => String(c)) : [],
      layoutMode: (['none', 'horizontal', 'vertical'] as const).includes(o.layoutMode as 'none')
        ? (o.layoutMode as AdLayoutMode)
        : 'none',
      primaryAxisAlign: 'min',
      counterAxisAlign: 'min',
      itemSpacing: asNum(o.itemSpacing, 8),
      paddingTop: asNum(o.paddingTop, 0),
      paddingRight: asNum(o.paddingRight, 0),
      paddingBottom: asNum(o.paddingBottom, 0),
      paddingLeft: asNum(o.paddingLeft, 0),
      clipsContent: asBool(o.clipsContent, true),
      cornerRadius: asNum(o.cornerRadius, 0),
      fills: Array.isArray(o.fills) ? o.fills.map((p, i) => sanitizePaint(p, i)) : [solid('#121218')],
      strokes: Array.isArray(o.strokes)
        ? o.strokes.map((s) => {
            const x = s && typeof s === 'object' ? (s as Record<string, unknown>) : {};
            return {
              color: asStr(x.color, '#595959'),
              opacity: asNum(x.opacity, 1),
              weight: asNum(x.weight, 1),
              align: 'inside' as const,
            };
          })
        : [],
    };
  }
  return null;
}

export function sanitizeDesignDoc(raw: unknown): AdDesignDoc {
  if (!raw || typeof raw !== 'object') return createEmptyDesignDoc();
  const o = raw as Record<string, unknown>;
  if (Number(o.version) !== 2 || typeof o.nodes !== 'object' || !o.nodes) {
    return createEmptyDesignDoc();
  }
  const nodesIn = o.nodes as Record<string, unknown>;
  const nodes: Record<string, AdNode> = {};
  for (const [id, val] of Object.entries(nodesIn)) {
    const n = sanitizeNode(val);
    if (n) nodes[id] = { ...n, id };
  }
  let rootId = asStr(o.rootId, '');
  if (!nodes[rootId] || nodes[rootId]!.type !== 'frame') {
    const empty = createEmptyDesignDoc();
    return empty;
  }
  const width = Math.max(64, asNum(o.width, (nodes[rootId] as AdFrameNode).w));
  const height = Math.max(64, asNum(o.height, (nodes[rootId] as AdFrameNode).h));
  return { version: 2, width, height, rootId, nodes };
}

export function sanitizeDesignStates(raw: unknown): AdDesignStates {
  if (!raw || typeof raw !== 'object') return createEmptyDesignStates();
  const o = raw as { rest?: unknown; hover?: unknown };
  const rest = sanitizeDesignDoc(o.rest);
  const hover = o.hover ? sanitizeDesignDoc(o.hover) : cloneDesignDoc(rest);
  return { rest, hover };
}

export function isDesignStates(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object') return false;
  const o = raw as { rest?: { version?: number } };
  return o.rest?.version === 2;
}

/** True when design is only an empty root frame (Figma blank). */
export function designLooksEmpty(doc: AdDesignDoc): boolean {
  try {
    const root = getRoot(doc);
    return !root.childIds.length;
  } catch {
    return true;
  }
}

/** True when ad has a cover URL but design has no image layer/fill. */
export function designMissingCover(doc: AdDesignDoc, imageUrl?: string | null): boolean {
  if (!String(imageUrl ?? '').trim()) return false;
  return !Object.values(doc.nodes).some((n) => {
    if (n.type === 'image' && String(n.src || '').trim()) return true;
    if (n.type === 'frame' && n.fills?.some((f) => f.type === 'image' && String(f.src || '').trim())) {
      return true;
    }
    return false;
  });
}

export function iconToDataUrl(iconId: string, size: number, color = '#ffffff'): string {
  const svg = bannerIconSvg(iconId || 'wifi-off', Math.max(24, Math.round(size)), color);
  return encodeSvgDataUrl(svg);
}

function crtEffectFromParams(
  params?: Record<string, number | boolean | string> | null,
): AdEffect {
  return {
    id: 'crt_main',
    type: 'crt',
    visible: true,
    params: { ...(params ?? {}) },
  };
}

/**
 * Convert legacy VPN overlay (+ cover + CRT) into a Figma design doc
 * that matches the public CRT banner layout.
 */
export function legacyOverlayToDesign(
  overlay: {
    kicker?: string;
    title?: string;
    body?: string;
    cta?: string;
    textX?: number;
    textY?: number;
    textScale?: number;
    icon?: string;
    iconDX?: number;
    iconDY?: number;
    kickerDX?: number;
    kickerDY?: number;
    titleDX?: number;
    titleDY?: number;
    bodyDX?: number;
    bodyDY?: number;
    ctaDX?: number;
    ctaDY?: number;
  },
  coverImage?: string | null,
  width = 640,
  height = 440,
  crtParams?: Record<string, number | boolean | string> | null,
): AdDesignDoc {
  let doc = createEmptyDesignDoc(width, height);
  const root = getRoot(doc);
  doc = updateNode(doc, root.id, {
    fills: [solid('#050506')],
    effects: [crtEffectFromParams(crtParams)],
    clipsContent: true,
    cornerRadius: 14,
  });

  if (coverImage) {
    doc = addChild(
      doc,
      root.id,
      createImageNode(coverImage, {
        name: 'Background',
        x: 0,
        y: 0,
        w: width,
        h: height,
      }),
    );
  }

  // Prefer exact public-banner metrics when DOM/canvas APIs exist.
  let boxes: Array<{
    id: string;
    x: number;
    y: number;
    w: number;
    h: number;
    visible: boolean;
  }> = [];
  if (typeof document !== 'undefined') {
    try {
      boxes = measureAdLayers(width, height, overlay as VpnBannerOverlay);
    } catch {
      boxes = [];
    }
  }

  const byId = (id: string) => boxes.find((b) => b.id === id);

  const iconBox = byId('icon');
  const iconSize = iconBox?.w || Math.min(width, height) * 0.22;
  const iconId = String(overlay.icon || 'wifi-off');
  doc = addChild(
    doc,
    root.id,
    createImageNode(iconToDataUrl(iconId, iconSize, '#ffffff'), {
        name: 'Icon',
        x: iconBox ? iconBox.x : width * 0.5 - iconSize / 2,
        y: iconBox ? iconBox.y : height * 0.14,
        w: iconSize,
        h: iconSize,
        scaleMode: 'fit',
        tint: '#ffffff',
        iconId,
      }),
  );

  const minSide = Math.min(width, height);
  const scale = Math.max(0.5, Math.min(1.8, Number(overlay.textScale || 100) / 100));
  const textMap: Array<{
    id: string;
    name: string;
    text: string;
    weight: number;
    size: number;
  }> = [
    { id: 'kicker', name: 'Kicker', text: overlay.kicker || '', weight: 600, size: minSide * 0.055 * scale },
    { id: 'title', name: 'Title', text: overlay.title || '', weight: 700, size: minSide * 0.078 * scale },
    { id: 'body', name: 'Body', text: overlay.body || '', weight: 500, size: minSide * 0.042 * scale },
    { id: 'cta', name: 'CTA', text: overlay.cta || '', weight: 500, size: minSide * 0.038 * scale },
  ];

  for (const row of textMap) {
    const text = row.text.trim();
    if (!text) continue;
    const box = byId(row.id);
    const fontSize = Math.max(10, Math.round(row.size));
    const node = createTextNode({
      name: row.name,
      characters: row.text,
      fontSize,
      fontWeight: row.weight,
      textAlign: 'center',
      verticalAlign: 'top',
      x: box && box.visible ? box.x : width * 0.08,
      y: box && box.visible ? box.y : height * 0.4,
      w: box && box.visible ? Math.max(40, box.w) : width * 0.84,
      h: box && box.visible ? Math.max(fontSize * 1.2, box.h) : fontSize * 1.4,
      fills: [solid('#ffffff')],
    });
    doc = addChild(doc, root.id, node);
  }

  return doc;
}
