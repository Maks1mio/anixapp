import { getPopularTabFilterArgs, type PopularTabId } from '../data/popularTabs';
import { mapCardData } from '../views/Release/_utils';
import { toIpcArgs } from '../utils/ipc-args';
import type { TvReleaseGridPage } from '../components/tv/TvReleaseGrid.svelte';

/** Страница топа (POST /filter, sort=3) — ряды `Popular.tv` и полный список. */
export async function fetchTvPopularPage(tab: PopularTabId, page: number): Promise<TvReleaseGridPage> {
  const api = window.anixApi;
  if (!api) throw new Error('API недоступно');
  const data = (await api.release.filter(page, toIpcArgs(getPopularTabFilterArgs(tab)), true)) as {
    content?: unknown[];
  };
  const content = (data?.content ?? []).filter(
    (raw): raw is Record<string, unknown> => !!raw && typeof raw === 'object',
  );
  return { items: content.map((raw) => mapCardData(raw)), done: content.length === 0 };
}
