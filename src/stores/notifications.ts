import { get, writable } from 'svelte/store';
import { isAuthenticated } from './auth';

/** Unread notification count from `notification/count`. */
export const notificationUnreadCount = writable(0);

let refreshInFlight: Promise<number> | null = null;

export async function refreshNotificationUnreadCount(): Promise<number> {
  if (!get(isAuthenticated) || !window.anixApi?.notification?.count) {
    notificationUnreadCount.set(0);
    return 0;
  }
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    try {
      const data = await window.anixApi!.notification.count();
      const n = typeof data?.count === 'number' ? data.count : 0;
      const count = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
      notificationUnreadCount.set(count);
      return count;
    } catch {
      return get(notificationUnreadCount);
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

/** Mark all as read on the server and clear the badge. */
export async function markNotificationsRead(): Promise<void> {
  try {
    await window.anixApi?.notification?.read?.();
  } catch {
    // still clear local badge so UI matches user intent after opening the list
  }
  notificationUnreadCount.set(0);
}

/**
 * Fetch every page of `notification/all`.
 * Caps pages as a safety guard against broken total_page_count.
 */
export async function fetchAllNotifications(maxPages = 50): Promise<any[]> {
  const api = window.anixApi?.notification;
  if (!api?.all) return [];

  const first = await api.all(0);
  const page0 = Array.isArray(first?.content) ? first.content : [];
  const totalPagesRaw = typeof first?.total_page_count === 'number' ? first.total_page_count : 1;
  const totalPages = Math.max(1, Math.min(maxPages, Math.floor(totalPagesRaw) || 1));

  if (totalPages <= 1) return page0;

  const rest: any[] = [];
  for (let page = 1; page < totalPages; page++) {
    try {
      const data = await api.all(page);
      const chunk = Array.isArray(data?.content) ? data.content : [];
      rest.push(...chunk);
    } catch {
      break;
    }
  }
  return [...page0, ...rest];
}
