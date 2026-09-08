/** Закреплённые подписки в сайдбаре (localStorage). */

const STORAGE_KEY = 'anixapp.subscriptionPins';

function readPins(): number[] {
  if (typeof window === 'undefined' || !window.localStorage) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((v) => Number(v))
      .filter((n) => Number.isFinite(n) && n > 0);
  } catch {
    return [];
  }
}

function writePins(ids: number[]): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  } catch {
    /* quota */
  }
}

export function getSubscriptionPins(): number[] {
  return readPins();
}

export function isSubscriptionPinned(channelId: number): boolean {
  if (!(channelId > 0)) return false;
  return readPins().includes(channelId);
}

/** Добавить в начало списка закрепов или снять. Возвращает новый список id. */
export function toggleSubscriptionPin(channelId: number): number[] {
  if (!(channelId > 0)) return readPins();
  const cur = readPins();
  const next = cur.includes(channelId)
    ? cur.filter((id) => id !== channelId)
    : [channelId, ...cur];
  writePins(next);
  return next;
}
