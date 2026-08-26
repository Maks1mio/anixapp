import type { DubberItem } from '../views/Watch/_types';

export type DubbersCacheEntry = {
  updateId: number | null;
  dubbers: DubberItem[];
  fetchedAt: number;
};

/** In-memory cache of all dubbers per release; invalidated when episode update id changes. */
const byRelease = new Map<number, DubbersCacheEntry>();

export function getCachedDubbers(
  releaseId: number,
  updateId: number | null,
): DubberItem[] | null {
  const hit = byRelease.get(releaseId);
  if (!hit || hit.dubbers.length === 0) return null;
  if ((hit.updateId ?? null) !== (updateId ?? null)) return null;
  return hit.dubbers;
}

export function setCachedDubbers(
  releaseId: number,
  updateId: number | null,
  dubbers: DubberItem[],
): void {
  byRelease.set(releaseId, {
    updateId: updateId ?? null,
    dubbers: [...dubbers],
    fetchedAt: Date.now(),
  });
}

export function patchCachedDubbers(
  releaseId: number,
  patch: (list: DubberItem[]) => DubberItem[],
): DubberItem[] | null {
  const hit = byRelease.get(releaseId);
  if (!hit) return null;
  const next = patch(hit.dubbers);
  hit.dubbers = next;
  hit.fetchedAt = Date.now();
  return next;
}

export function invalidateDubbersCache(releaseId?: number): void {
  if (releaseId != null && Number.isFinite(releaseId) && releaseId > 0) {
    byRelease.delete(releaseId);
    return;
  }
  byRelease.clear();
}
