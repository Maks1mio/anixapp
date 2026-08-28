import {
  HOME_TAB_DEFS,
  getHomeTabFilterArgs,
  type HomeTabId,
} from '../data/homeTabs';
import type { ReleaseCardData } from '../types/release';
import { mapReleaseRawToCard } from '../utils/release-card';
import {
  getMyTabLabel,
  isHomeCustomTabConfigured,
  loadHomeCustomTab,
  toFilterRequest,
} from '../utils/homeCustomTab';

export const TV_HOME_ROW_LIMIT = 16;

export type TvHomeRowStatus = 'loading' | 'ready' | 'empty' | 'error';

export interface TvHomeRowDef {
  id: string;
  tabId?: HomeTabId;
  label: string;
  filterArgs: Record<string, unknown>;
}

export interface TvHomeRowState extends TvHomeRowDef {
  items: ReleaseCardData[];
  status: TvHomeRowStatus;
}

export async function buildTvHomeRowDefs(): Promise<TvHomeRowDef[]> {
  const defs: TvHomeRowDef[] = [];
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
  const res = (await window.anixApi?.release?.filter(0, filterArgs, true)) as
    | { content?: unknown[] }
    | undefined;
  return (res?.content ?? [])
    .slice(0, limit)
    .map((raw) => mapReleaseRawToCard(raw as Record<string, unknown>, { preferLargePoster: true }));
}

export function createTvHomeRowStates(defs: TvHomeRowDef[]): TvHomeRowState[] {
  return defs.map((def) => ({
    ...def,
    items: [],
    status: 'loading',
  }));
}
