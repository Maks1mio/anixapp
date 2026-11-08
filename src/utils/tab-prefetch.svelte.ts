/** Заранее загруженное содержимое соседних вкладок для перелистывания свайпом (TabPeek). */

/** Столько записей отрисовывать в панели за экраном: хватает на высоту экрана, больше — лишняя нагрузка. */
export const TAB_PEEK_ITEMS = 10;

/** Устаревшее содержимое обновляется, когда вкладка снова становится соседней. */
const STALE_MS = 60_000;

export function tabNeighbors(ids: readonly string[], activeId: string): { prev?: string; next?: string } {
  const i = ids.indexOf(activeId);
  if (i < 0) return {};
  return { prev: ids[i - 1], next: ids[i + 1] };
}

export function createTabPrefetch<T>(load: (id: string) => Promise<T>) {
  let data = $state.raw<Record<string, T>>({});
  const loadedAt = new Map<string, number>();
  const inflight = new Set<string>();
  /** Ответы запросов, начатых до clear(), отбрасываются. */
  let generation = 0;

  return {
    get(id: string): T | undefined {
      return data[id];
    },
    ensure(id: string) {
      const fresh = Date.now() - (loadedAt.get(id) ?? 0) < STALE_MS;
      if (fresh || inflight.has(id)) return;
      const gen = generation;
      inflight.add(id);
      load(id)
        .then((value) => {
          if (gen !== generation) return;
          loadedAt.set(id, Date.now());
          data = { ...data, [id]: value };
        })
        .catch(() => {
          // панель останется скелетоном, настоящая вкладка загрузит сама и покажет ошибку
        })
        .finally(() => {
          if (gen === generation) inflight.delete(id);
        });
    },
    clear() {
      generation += 1;
      data = {};
      loadedAt.clear();
      inflight.clear();
    },
  };
}
