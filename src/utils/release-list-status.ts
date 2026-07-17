import { notifyListStatusChanged } from './favorites-events';

export type ReleaseListStatusId =
  | 'watching'
  | 'planned'
  | 'completed'
  | 'on_hold'
  | 'dropped';

/**
 * Ставит один статус списка. При смене категории тайтл убирается из остальных
 * списков (на стороне IPC), иначе он остаётся в старой вкладке закладок.
 */
export async function applyReleaseListStatus(
  releaseId: number,
  nextStatus: ReleaseListStatusId | null,
  prevStatus: ReleaseListStatusId | null = null,
): Promise<void> {
  const api = window.anixApi?.release;
  if (!api || !releaseId) return;

  if (!nextStatus) {
    if (!prevStatus) return;
    await api.clearListStatus(releaseId, prevStatus as unknown as number);
  } else {
    await api.setListStatus(releaseId, nextStatus as unknown as number);
  }

  notifyListStatusChanged({ releaseId, statusId: nextStatus });
}
