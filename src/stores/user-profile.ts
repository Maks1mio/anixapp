import { openProfilePanel } from './profile-panel';

/** Открыть профиль в правой панели (как расписание). */
export function openUserProfileModal(userId?: number): void {
  openProfilePanel(userId);
}

export function handleUserProfileClick(userId: number | undefined | null, event?: MouseEvent): void {
  const id = Number(userId);
  if (!Number.isFinite(id) || id <= 0) return;
  event?.preventDefault();
  event?.stopPropagation();
  openProfilePanel(id);
}
