import { openProfilePanel } from './profile-panel';

/** `/profile` или `/profile/:id` — полноэкранной страницы больше нет. */
export function isProfilePagePath(path: string): boolean {
  const pathname = path.split('?')[0] ?? path;
  return pathname === '/profile' || /^\/profile\/\d+$/.test(pathname);
}

/** Открыть правую панель, если путь — старый полноэкранный профиль. */
export function openProfileFromPath(path: string): boolean {
  const pathname = path.split('?')[0] ?? path;
  if (pathname === '/profile') {
    openProfilePanel();
    return true;
  }
  const match = pathname.match(/^\/profile\/(\d+)$/);
  if (!match) return false;
  const id = Number(match[1]);
  if (!Number.isFinite(id) || id <= 0) return false;
  openProfilePanel(id);
  return true;
}

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
