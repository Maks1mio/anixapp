/**
 * On-screen TV debug HUD: Web Vitals, fetch/XHR, resource load.
 * Start as early as possible so the first API calls are captured.
 */

export type MetricRating = 'good' | 'mid' | 'poor' | 'na';

export type DebugRequestRow = {
  id: number;
  t: number;
  method: string;
  label: string;
  status: number;
  ms: number;
  kind: 'api' | 'other';
  error?: string;
};

export type DebugMetricsSnapshot = {
  enabled: boolean;
  path: string;
  host: string;
  capacitor: boolean;
  uptimeS: number;
  lcpMs: number | null;
  lcpTag: string;
  cls: number;
  clsShifts: number;
  inpMs: number | null;
  inpName: string;
  fcpMs: number | null;
  ttfbMs: number | null;
  dclMs: number | null;
  loadMs: number | null;
  fps: number;
  heapUsedMb: number | null;
  heapLimitMb: number | null;
  resCount: number;
  transferKb: number;
  longTasks: number;
  longTaskMaxMs: number;
  mediaCount: number;
  mediaAvgMs: number;
  mediaLastMs: number;
  mediaErrors: number;
  imageCount: number;
  imageAvgMs: number;
  imageFail: number;
  requests: DebugRequestRow[];
};

const MAX_REQUESTS = 12;
const STORAGE_KEY = 'anixapp.tv.debugMetrics';

let started = false;
let nextId = 1;
let fpsRaf = 0;
let fpsFrames = 0;
let fpsStamp = 0;
let fpsValue = 0;

let lcpMs: number | null = null;
let lcpTag = '';
let cls = 0;
let clsShifts = 0;
let inpMs: number | null = null;
let inpName = '';
let fcpMs: number | null = null;
let longTasks = 0;
let longTaskMaxMs = 0;

let mediaCount = 0;
let mediaSumMs = 0;
let mediaLastMs = 0;
let mediaErrors = 0;
let imageCount = 0;
let imageSumMs = 0;
let imageFail = 0;

const requests: DebugRequestRow[] = [];
const seenResourceKeys = new Set<string>();

type PerfNav = PerformanceNavigationTiming;
type PerfMem = { usedJSHeapSize: number; jsHeapSizeLimit: number };

function isCapacitor(): boolean {
  return !!(window as Window & { Capacitor?: { isNativePlatform?: () => boolean } })
    .Capacitor?.isNativePlatform?.();
}

export function isDebugMetricsEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const q = new URLSearchParams(window.location.search).get('metrics');
    if (q === '0' || q === 'off') return false;
    if (q === '1' || q === 'on') return true;
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === '0') return false;
    if (stored === '1') return true;
  } catch {
    /* ignore */
  }
  return false;
}

export function setDebugMetricsEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0');
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent('anix:debugMetricsChanged', { detail: { enabled } }));
}

export function ratingMs(value: number | null, good: number, mid: number): MetricRating {
  if (value == null || !Number.isFinite(value)) return 'na';
  if (value <= good) return 'good';
  if (value <= mid) return 'mid';
  return 'poor';
}

export function ratingCls(value: number): MetricRating {
  if (value <= 0.1) return 'good';
  if (value <= 0.25) return 'mid';
  return 'poor';
}

export function formatMs(ms: number | null): string {
  if (ms == null || !Number.isFinite(ms)) return '—';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

export function formatCls(value: number): string {
  return value < 0.01 ? value.toFixed(3) : value.toFixed(2);
}

function shortPath(url: string): string {
  try {
    const u = new URL(url, window.location.origin);
    const text = `${u.pathname}${u.search}`;
    if (text.length <= 52) return text || u.host;
    return `${text.slice(0, 24)}…${text.slice(-20)}`;
  } catch {
    return url.length > 52 ? `${url.slice(0, 24)}…${url.slice(-20)}` : url;
  }
}

function classify(url: string): 'api' | 'media' | 'image' | 'asset' {
  const u = url.toLowerCase();
  if (
    u.includes('/__anix/invoke')
    || u.includes('/__anix/health')
    || u.includes('/__anixback')
    || u.includes('/api/')
  ) return 'api';
  if (u.includes('/__anix/media') || /\.(m3u8|m4s|mp4|webm|aac)(\?|$)/.test(u)) return 'media';
  if (
    /\.ts(\?|$)/.test(u)
    && !u.includes('/src/')
    && !u.includes('/@')
    && !u.includes('.svelte')
    && !u.includes('node_modules')
  ) return 'media';
  if (
    /\.(jpe?g|png|webp|avif|gif|bmp)(\?|$)/.test(u)
    || u.includes('/__cdn')
    || u.includes('poster')
  ) return 'image';
  return 'asset';
}

function parseInvokeChannel(input: RequestInfo | URL, init?: RequestInit): string | undefined {
  const body = init?.body;
  if (typeof body === 'string') {
    try {
      const parsed = JSON.parse(body) as { channel?: unknown };
      if (typeof parsed.channel === 'string') return parsed.channel;
    } catch {
      /* ignore */
    }
  }
  return undefined;
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

function requestMethod(input: RequestInfo | URL, init?: RequestInit): string {
  if (init?.method) return init.method.toUpperCase();
  if (typeof input !== 'string' && !(input instanceof URL) && input.method) {
    return input.method.toUpperCase();
  }
  return 'GET';
}

function pushRequest(row: Omit<DebugRequestRow, 'id' | 't'>): void {
  requests.unshift({
    id: nextId++,
    t: performance.now(),
    ...row,
  });
  if (requests.length > MAX_REQUESTS) requests.length = MAX_REQUESTS;
}

function recordNetwork(opts: {
  url: string;
  method: string;
  status: number;
  ms: number;
  channel?: string;
  error?: string;
}): void {
  const kind = classify(opts.url);
  const ms = Math.max(0, opts.ms);
  // Images / HLS: Resource Timing already aggregates these. Only surface failures.
  if (kind === 'media') {
    if (opts.status === 0 || opts.status >= 400) mediaErrors += 1;
    return;
  }
  if (kind === 'image') {
    if (opts.status === 0 || opts.status >= 400) imageFail += 1;
    return;
  }
  const interesting = kind === 'api' || opts.status === 0 || opts.status >= 400 || ms >= 800;
  if (!interesting) return;
  pushRequest({
    method: opts.method,
    label: opts.channel || shortPath(opts.url),
    status: opts.status,
    ms,
    kind: kind === 'api' ? 'api' : 'other',
    error: opts.error,
  });
}

function patchFetch(): void {
  const orig = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const startedAt = performance.now();
    const url = requestUrl(input);
    const method = requestMethod(input, init);
    const channel = parseInvokeChannel(input, init);
    try {
      const res = await orig(input, init);
      recordNetwork({ url, method, status: res.status, ms: performance.now() - startedAt, channel });
      return res;
    } catch (err) {
      recordNetwork({
        url,
        method,
        status: 0,
        ms: performance.now() - startedAt,
        channel,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  };
}

function patchXhr(): void {
  type DbgXhr = XMLHttpRequest & { __dbg?: { method: string; url: string; t: number } };
  const proto = XMLHttpRequest.prototype;
  const open = proto.open;
  const send = proto.send;
  proto.open = function (this: XMLHttpRequest, method: string, url: string | URL, async?: boolean, username?: string | null, password?: string | null) {
    (this as DbgXhr).__dbg = {
      method: String(method || 'GET').toUpperCase(),
      url: String(url),
      t: 0,
    };
    return open.call(this, method, url, async ?? true, username, password);
  };
  proto.send = function (this: XMLHttpRequest, body?: Document | XMLHttpRequestBodyInit | null) {
    const dbg = (this as DbgXhr).__dbg;
    if (dbg) dbg.t = performance.now();
    this.addEventListener('loadend', () => {
      if (!dbg) return;
      recordNetwork({
        url: dbg.url,
        method: dbg.method,
        status: this.status || 0,
        ms: performance.now() - dbg.t,
        error: this.status === 0 ? 'network' : undefined,
      });
    });
    return send.call(this, body);
  };
}

function observePaint(): void {
  if (typeof PerformanceObserver === 'undefined') return;

  try {
    const lcp = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const last = entries[entries.length - 1] as PerformanceEntry & { element?: Element };
      if (!last) return;
      lcpMs = last.startTime;
      lcpTag = last.element?.tagName?.toLowerCase() || 'element';
    });
    lcp.observe({ type: 'largest-contentful-paint', buffered: true } as PerformanceObserverInit);
  } catch {
    /* unsupported */
  }

  try {
    const paints = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.name === 'first-contentful-paint') fcpMs = entry.startTime;
      }
    });
    paints.observe({ type: 'paint', buffered: true } as PerformanceObserverInit);
  } catch {
    /* unsupported */
  }

  try {
    const shifts = new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as Array<PerformanceEntry & { value: number; hadRecentInput: boolean }>) {
        if (entry.hadRecentInput) continue;
        cls += entry.value;
        clsShifts += 1;
      }
    });
    shifts.observe({ type: 'layout-shift', buffered: true } as PerformanceObserverInit);
  } catch {
    /* unsupported */
  }

  try {
    const inp = new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as Array<PerformanceEntry & { duration: number; name: string; interactionId?: number }>) {
        if (entry.duration <= 0) continue;
        if (inpMs == null || entry.duration > inpMs) {
          inpMs = entry.duration;
          inpName = entry.name || 'event';
        }
      }
    });
    inp.observe({ type: 'event', buffered: true, durationThreshold: 16 } as PerformanceObserverInit);
  } catch {
    /* unsupported */
  }

  try {
    const tasks = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        longTasks += 1;
        if (entry.duration > longTaskMaxMs) longTaskMaxMs = entry.duration;
      }
    });
    tasks.observe({ type: 'longtask', buffered: true } as PerformanceObserverInit);
  } catch {
    /* unsupported */
  }

  try {
    const res = new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as PerformanceResourceTiming[]) {
        const key = `${entry.name}|${entry.startTime.toFixed(1)}`;
        if (seenResourceKeys.has(key)) continue;
        seenResourceKeys.add(key);
        const kind = classify(entry.name);
        const ms = entry.duration;
        if (kind === 'media') {
          mediaCount += 1;
          mediaSumMs += ms;
          mediaLastMs = ms;
          if (entry.transferSize === 0 && entry.decodedBodySize === 0) mediaErrors += 1;
        } else if (kind === 'image') {
          imageCount += 1;
          imageSumMs += ms;
        }
      }
    });
    res.observe({ type: 'resource', buffered: true } as PerformanceObserverInit);
  } catch {
    /* unsupported */
  }
}

function tickFps(now: number): void {
  if (!fpsStamp) fpsStamp = now;
  fpsFrames += 1;
  const elapsed = now - fpsStamp;
  if (elapsed >= 1000) {
    fpsValue = Math.round((fpsFrames * 1000) / elapsed);
    fpsFrames = 0;
    fpsStamp = now;
  }
  fpsRaf = window.requestAnimationFrame(tickFps);
}

function navTiming(): Pick<DebugMetricsSnapshot, 'ttfbMs' | 'dclMs' | 'loadMs'> {
  const nav = performance.getEntriesByType('navigation')[0] as PerfNav | undefined;
  if (!nav) return { ttfbMs: null, dclMs: null, loadMs: null };
  return {
    ttfbMs: nav.responseStart > 0 ? nav.responseStart - nav.startTime : null,
    dclMs: nav.domContentLoadedEventEnd > 0 ? nav.domContentLoadedEventEnd - nav.startTime : null,
    loadMs: nav.loadEventEnd > 0 ? nav.loadEventEnd - nav.startTime : null,
  };
}

function heap(): { used: number | null; limit: number | null } {
  const mem = (performance as Performance & { memory?: PerfMem }).memory;
  if (!mem) return { used: null, limit: null };
  return {
    used: mem.usedJSHeapSize / (1024 * 1024),
    limit: mem.jsHeapSizeLimit / (1024 * 1024),
  };
}

function resourceTotals(): { count: number; transferKb: number } {
  const entries = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
  let transfer = 0;
  for (const entry of entries) {
    if (entry.transferSize) transfer += entry.transferSize;
  }
  return { count: entries.length, transferKb: transfer / 1024 };
}

export function getDebugMetricsSnapshot(): DebugMetricsSnapshot {
  const nav = navTiming();
  const mem = heap();
  const res = resourceTotals();
  return {
    enabled: true,
    path: `${window.location.pathname}${window.location.search}`,
    host: window.location.host,
    capacitor: isCapacitor(),
    uptimeS: performance.now() / 1000,
    lcpMs,
    lcpTag,
    cls,
    clsShifts,
    inpMs,
    inpName,
    fcpMs,
    ttfbMs: nav.ttfbMs,
    dclMs: nav.dclMs,
    loadMs: nav.loadMs,
    fps: fpsValue,
    heapUsedMb: mem.used,
    heapLimitMb: mem.limit,
    resCount: res.count,
    transferKb: res.transferKb,
    longTasks,
    longTaskMaxMs,
    mediaCount,
    mediaAvgMs: mediaCount ? mediaSumMs / mediaCount : 0,
    mediaLastMs,
    mediaErrors,
    imageCount,
    imageAvgMs: imageCount ? imageSumMs / imageCount : 0,
    imageFail,
    requests: requests.slice(),
  };
}

export function startDebugMetrics(): void {
  if (started || typeof window === 'undefined' || !isDebugMetricsEnabled()) return;
  started = true;
  patchFetch();
  patchXhr();
  observePaint();
}

export function startDebugMetricsFps(): () => void {
  if (typeof window === 'undefined') return () => {};
  if (!fpsRaf) {
    fpsStamp = 0;
    fpsFrames = 0;
    fpsRaf = window.requestAnimationFrame(tickFps);
  }
  return () => {
    if (fpsRaf) window.cancelAnimationFrame(fpsRaf);
    fpsRaf = 0;
  };
}
