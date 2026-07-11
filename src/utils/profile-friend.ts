export type FriendAction = 'send' | 'remove' | 'none';

export interface FriendButtonState {
  action: FriendAction;
  label: string;
  disabled: boolean;
}

const PINNED_TAB_IDS = ['stats', 'votes', 'collections', 'comments', 'videos'] as const;

export function resolvePinnedTab(
  pinnedSectionId: unknown,
  availableTabIds: string[],
): string {
  const pinned = Number(pinnedSectionId ?? 0);
  const preferred = PINNED_TAB_IDS[pinned] ?? 'stats';
  if (availableTabIds.includes(preferred)) return preferred;
  return availableTabIds[0] ?? 'stats';
}

export function resolveFriendButtonState(
  profileId: number,
  selfId: number,
  friendStatus: number | null | undefined,
  options?: { requestsDisallowed?: boolean; isBlocked?: boolean },
): FriendButtonState {
  if (options?.isBlocked) {
    return { action: 'none', label: 'Пользователь заблокирован', disabled: true };
  }
  if (options?.requestsDisallowed && friendStatus !== 2) {
    return { action: 'none', label: 'Заявки отключены', disabled: true };
  }
  if (friendStatus === 2) {
    return { action: 'remove', label: 'Удалить из друзей', disabled: false };
  }
  if (friendStatus == null) {
    return { action: 'send', label: 'Добавить в друзья', disabled: false };
  }

  const viewerIsSmaller = selfId < profileId;
  const viewerSent =
    (friendStatus === 0 && viewerIsSmaller)
    || (friendStatus === 1 && !viewerIsSmaller);

  if (viewerSent) {
    return { action: 'remove', label: 'Отменить заявку', disabled: false };
  }
  return { action: 'send', label: 'Принять заявку', disabled: false };
}
