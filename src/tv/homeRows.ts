import {
  HOME_TAB_DEFS,
  getHomeTabFilterArgs,
  type HomeTabId,
} from '../data/homeTabs';
import type { ReleaseCardData } from '../types/release';
import { mapReleaseRawToCard } from '../utils/release-card';
import { mapHistoryRawToReleaseCard } from '../utils/historyCard';
import {
  getMyTabLabel,
  isHomeCustomTabConfigured,
  loadHomeCustomTab,
  toFilterRequest,
} from '../utils/homeCustomTab';

export const TV_HOME_ROW_LIMIT = 16;
export const TV_CONTINUE_WATCHING_ROW_ID = 'continue-watching';

export type TvHomeRowStatus = 'loading' | 'ready' | 'empty' | 'error';
export type TvHomeRowKind = 'filter' | 'history';

export interface TvHomeRowDef {
  id: string;
  tabId?: HomeTabId;
  label: string;
  filterArgs?: Record<string, unknown>;
  kind?: TvHomeRowKind;
}

export interface TvHomeRowState extends TvHomeRowDef {
  items: ReleaseCardData[];
  status: TvHomeRowStatus;
}

export async function buildTvHomeRowDefs(authenticated = false): Promise<TvHomeRowDef[]> {
  const defs: TvHomeRowDef[] = [];

  if (authenticated) {
    defs.push({
      id: TV_CONTINUE_WATCHING_ROW_ID,
      label: 'Продолжить просмотр',
      kind: 'history',
    });
  }

  const customTab = await loadHomeCustomTab();

  if (isHomeCustomTabConfigured(customTab) && customTab.filter) {
    defs.push({
      id: 'my',
      tabId: 'my',
      label: getMyTabLabel(customTab),
      filterArgs: toFilterRequest(customTab.filter),
    });
  }

  for (const tab of HOME_TAB_DEFS) {
    if (tab.id === 'my') continue;
    defs.push({
      id: tab.id,
      tabId: tab.id,
      label: tab.label,
      filterArgs: getHomeTabFilterArgs(tab.id),
    });
  }

  return defs;
}

export async function fetchTvHomeRowItems(
  filterArgs: Record<string, unknown>,
  limit = TV_HOME_ROW_LIMIT,
): Promise<ReleaseCardData[]> {
  await waitForAnixApi();
  const api = window.anixApi?.release?.filter;
  if (!api) throw new Error('release.filter unavailable');

  const res = (await api(0, filterArgs, true)) as { content?: unknown } | undefined;
  const content = Array.isArray(res?.content) ? res.content : [];
  const items: ReleaseCardData[] = [];

  for (const raw of content.slice(0, limit)) {
    if (!raw || typeof raw !== 'object') continue;
    try {
      items.push(mapReleaseRawToCard(raw as Record<string, unknown>, { preferLargePoster: true }));
    } catch (err) {
      if (import.meta.env.DEV) {
        console.warn('[tv-home] skip release card mapping', err);
      }
    }
  }

  return items;
}

export async function fetchTvContinueWatchingItems(
  limit = TV_HOME_ROW_LIMIT,
): Promise<ReleaseCardData[]> {
  await waitForAnixApi();
  const api = window.anixApi?.history?.all;
  if (!api) throw new Error('history.all unavailable');

  const res = (await api(0)) as
    | { content?: unknown[]; releases?: unknown[] }
    | undefined;
  const content = Array.isArray(res?.content)
    ? res.content
    : Array.isArray(res?.releases)
      ? res.releases
      : [];
  return content
    .slice(0, limit)
    .map((raw) => mapHistoryRawToReleaseCard(raw as Record<string, unknown>));
}

async function waitForAnixApi(timeoutMs = 12_000): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (window.anixApi?.release?.filter && window.anixApi?.history?.all) return;
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  throw new Error('Anix API not ready');
}

export function createTvHomeRowStates(defs: TvHomeRowDef[]): TvHomeRowState[] {
  return defs.map((def) => ({
    ...def,
    items: [],
    status: 'loading',
  }));
}

export async function loadTvHomeRowData(
  row: Pick<TvHomeRowDef, 'id' | 'kind' | 'filterArgs'>,
): Promise<Pick<TvHomeRowState, 'items' | 'status'>> {
  const maxAttempts = row.kind === 'history' ? 1 : 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const items = row.kind === 'history'
        ? await fetchTvContinueWatchingItems()
        : await fetchTvHomeRowItems(row.filterArgs ?? {});
      return {
        items,
        status: items.length > 0 ? 'ready' : 'empty',
      };
    } catch (err) {
      if (import.meta.env.DEV) {
        console.error(`[tv-home] row "${row.id}" attempt ${attempt}/${maxAttempts} failed`, err);
      }
      if (attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
        continue;
      }
      return { items: [], status: 'error' };
    }
  }

  return { items: [], status: 'error' };
}

export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (!items.length) return [];
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function worker() {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) return;
      results[index] = await fn(items[index], index);
    }
  }

  const workers = Array.from(
    { length: Math.min(Math.max(1, limit), items.length) },
    () => worker(),
  );
  await Promise.all(workers);
  return results;
}
