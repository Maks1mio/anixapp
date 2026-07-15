import { tick } from 'svelte';
import { getPath, getSearchParams } from '../router';
import { rendererLogger } from '../services/logger';

/** Значимые query-параметры для ключа состояния экрана */
const STATE_QUERY_KEYS = ['tab', 'q', 'by', 'week', 'sort'] as const;

export interface ViewStateEntry<T = unknown> {
  data: T;
  scrollTop: number;
  savedAt: number;
}

const MAX_ENTRIES = 32;
const cache = new Map<string, ViewStateEntry>();

/** Активный экран регистрирует свой ключ — captureActiveScroll() сохранит scroll по нему */
let activeScrollKeyGetter: (() => string) | null = null;
let scrollRestorePending = false;

function summarizeViewData(data: unknown): Record<string, unknown> | undefined {
  if (data == null || typeof data !== 'object') return undefined;
  const d = data as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  if (d.activeTab != null) out.tab = d.activeTab;
  if (d.currentTab != null) out.tab = d.currentTab;
  if (d.currentQuery != null) out.query = d.currentQuery;
  if (typeof d.page === 'number') out.page = d.page;
  if (typeof d.nextPage === 'number') out.nextPage = d.nextPage;
  if (typeof d.hasMore === 'boolean') out.hasMore = d.hasMore;
  for (const [k, v] of Object.entries(d)) {
    if (Array.isArray(v)) out[`${k}Len`] = v.length;
  }
  return Object.keys(out).length ? out : undefined;
}

function logViewState(action: string, key: string, extra?: Record<string, unknown>): void {
  rendererLogger.info('view-state', action, { key, path: getPath(), ...extra });
}

function touchKey(key: string, entry: ViewStateEntry) {
  cache.delete(key);
  cache.set(key, entry);
  while (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest == null) break;
    cache.delete(oldest);
  }
}

/** Ключ маршрута с учётом значимых query-параметров */
export function buildViewStateKey(path?: string, extra?: Record<string, string | number | boolean | null | undefined>): string {
  const basePath = path ?? getPath();
  const params = getSearchParams();
  const parts: string[] = [basePath];
  for (const key of STATE_QUERY_KEYS) {
    const v = params.get(key);
    if (v) parts.push(`${key}=${v}`);
  }
  if (extra) {
    for (const [k, v] of Object.entries(extra)) {
      if (v != null && v !== '') parts.push(`${k}=${String(v)}`);
    }
  }
  return parts.join('|');
}

export function saveViewState<T>(key: string, data: T, scrollTop = 0): void {
  touchKey(key, { data, scrollTop, savedAt: Date.now() });
}

/** Залогировать восстановление снимка (вызывать из экрана при cache hit) */
export function logViewStateRestore(key: string, scrollTop: number, data: unknown): void {
  logViewState('restore', key, {
    scrollTop,
    liveScroll: readScrollTop(),
    ...summarizeViewData(data),
  });
}

/** Залогировать промах кэша */
export function logViewStateMiss(key: string, reason?: string): void {
  logViewState('cache-miss', key, reason ? { reason } : undefined);
}

export function getViewState<T>(key: string): ViewStateEntry<T> | null {
  const entry = cache.get(key);
  if (!entry) return null;
  touchKey(key, entry);
  return entry as ViewStateEntry<T>;
}

export function removeViewState(key: string): void {
  cache.delete(key);
}

export function invalidateViewStatePrefix(prefix: string): void {
  for (const key of [...cache.keys()]) {
    if (key === prefix || key.startsWith(`${prefix}|`)) cache.delete(key);
  }
}

export function getScrollContainer(): HTMLElement | null {
  return document.getElementById('content')
    ?? document.querySelector<HTMLElement>('[data-page-scroll]');
}

export function readScrollTop(): number {
  return getScrollContainer()?.scrollTop ?? 0;
}

/** Экран с кэшем вызывает в onMount; возвращает функцию отписки для onDestroy */
export function registerActiveScrollKey(getter: () => string): () => void {
  activeScrollKeyGetter = getter;
  logViewState('register-key', getter());
  return () => {
    if (activeScrollKeyGetter === getter) {
      logViewState('unregister-key', getter());
      activeScrollKeyGetter = null;
    }
  };
}

/** Сохранить scroll уходящего экрана (до сброса DOM) */
export function captureActiveScroll(): void {
  const key = activeScrollKeyGetter?.() ?? buildViewStateKey();
  const scrollTop = readScrollTop();
  captureScrollForKey(key);
  logViewState('capture-scroll', key, { scrollTop, hasActiveKey: !!activeScrollKeyGetter });
}

/** Сохранить полный снимок экрана перед навигацией (вызывать из anix:beforeNavigate) */
export function flushActiveViewState<T>(data: T): void {
  const key = activeScrollKeyGetter?.();
  if (!key) {
    logViewState('flush-skip', buildViewStateKey(), { reason: 'no-active-key' });
    return;
  }
  saveViewStateWithScroll(key, data);
  logViewState('flush', key, {
    scrollTop: cache.get(key)?.scrollTop ?? 0,
    liveScroll: readScrollTop(),
    ...summarizeViewData(data),
  });
}

/** Обновить scrollTop для существующего или пустого снимка */
export function captureScrollForKey(key: string, data?: unknown): void {
  const scrollTop = readScrollTop();
  const prev = cache.get(key);
  if (data !== undefined) {
    saveViewState(key, data, scrollTop);
    return;
  }
  if (prev) {
    touchKey(key, { ...prev, scrollTop });
  } else {
    touchKey(key, { data: null, scrollTop, savedAt: Date.now() });
  }
}

export function resetScrollTop(): void {
  const el = getScrollContainer();
  if (el) el.scrollTop = 0;
}

export function isScrollRestorePending(): boolean {
  return scrollRestorePending;
}

/** Вызвать до отрисовки, чтобы отложенный сброс scroll не сработал раньше восстановления */
export function beginScrollRestore(): void {
  scrollRestorePending = true;
}

export function endScrollRestore(): void {
  scrollRestorePending = false;
}

function hasCachedScrollForPath(path: string): boolean {
  for (const [key, entry] of cache) {
    if (!entry.scrollTop || entry.scrollTop <= 0) continue;
    if (key === path || key.startsWith(`${path}|`)) return true;
  }
  return false;
}

/** Сбросить scroll на новом маршруте, если экран не восстанавливает позицию сам */
export function resetScrollAfterRouteChange(): void {
  const destPath = getPath();
  void (async () => {
    await tick();
    await new Promise((r) => requestAnimationFrame(r));
    if (scrollRestorePending) {
      logViewState('reset-skip', destPath, { reason: 'restore-pending' });
      return;
    }
    if (hasCachedScrollForPath(destPath)) {
      logViewState('reset-skip', destPath, { reason: 'cached-scroll' });
      return;
    }
    logViewState('reset-top', destPath, { liveScroll: readScrollTop() });
    resetScrollTop();
  })();
}

/** Восстановить scrollTop после отрисовки списка (ждёт подгрузку контента при infinite scroll) */
export async function restoreScrollTop(
  scrollTop: number,
  options: { maxWaitMs?: number } = {},
): Promise<void> {
  if (!scrollTop || scrollTop <= 0) {
    scrollRestorePending = false;
    return;
  }
  scrollRestorePending = true;
  const maxWaitMs = options.maxWaitMs ?? 8000;
  logViewState('restore-scroll-start', getPath(), { target: scrollTop, maxWaitMs });

  try {
    await tick();
    const el = getScrollContainer();
    if (!el) {
      logViewState('restore-scroll-abort', getPath(), { reason: 'no-scroll-container' });
      return;
    }

    await new Promise<void>((resolve) => {
      const deadline = Date.now() + maxWaitMs;
      let settled = false;

      const finish = () => {
        if (settled) return;
        settled = true;
        ro.disconnect();
        clearTimeout(timeoutId);
        const maxScroll = Math.max(0, el.scrollHeight - el.clientHeight);
        logViewState('restore-scroll-done', getPath(), {
          target: scrollTop,
          applied: el.scrollTop,
          scrollHeight: el.scrollHeight,
          clientHeight: el.clientHeight,
          maxScroll,
          reached: maxScroll >= scrollTop - 48,
        });
        resolve();
      };

      const apply = () => {
        const maxScroll = Math.max(0, el.scrollHeight - el.clientHeight);
        const target = Math.min(scrollTop, maxScroll);
        el.scrollTop = target;
        if (maxScroll >= scrollTop - 48 || Date.now() >= deadline) {
          requestAnimationFrame(() => {
            el.scrollTop = target;
            finish();
          });
        }
      };

      const ro = new ResizeObserver(() => apply());
      ro.observe(el);

      const timeoutId = setTimeout(() => {
        apply();
        finish();
      }, maxWaitMs);

      apply();
    });
  } finally {
    scrollRestorePending = false;
  }
}

export function saveViewStateWithScroll<T>(key: string, data: T): void {
  const live = readScrollTop();
  const prev = cache.get(key);
  const prevScroll = prev?.scrollTop ?? 0;
  const scrollTop = live > 0 ? live : prevScroll;
  saveViewState(key, data, scrollTop);
  logViewState('save', key, {
    scrollTop,
    liveScroll: live,
    fromPrev: live <= 0 && prevScroll > 0,
    ...summarizeViewData(data),
  });
}

/** Сохранить только данные; scroll берётся из кэша (flush/capture), не из DOM при onDestroy */
export function saveViewStateData<T>(key: string, data: T): void {
  const prev = cache.get(key);
  const scrollTop = prev?.scrollTop ?? readScrollTop();
  saveViewState(key, data, scrollTop);
  logViewState('save-data', key, {
    scrollTop,
    keptScroll: !!prev?.scrollTop,
    ...summarizeViewData(data),
  });
}
