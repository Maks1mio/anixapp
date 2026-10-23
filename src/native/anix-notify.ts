/**
 * Системные уведомления на телефоне: методы notify / requestNotifications / takeLaunchDeepLink
 * нативного плагина AnixPlayer (канал «Уведомления Anixart») и событие notificationTap.
 * Ссылка уведомления — JSON того же вида, что и desktop-событие anix:deepLink ({ type, id }).
 */
type NotifyPlugin = {
  notify?: (o: { id: string; title: string; body: string; deepLink?: string }) => Promise<{ shown: boolean }>;
  requestNotifications?: () => Promise<{ granted: boolean }>;
  takeLaunchDeepLink?: () => Promise<{ deepLink?: string | null }>;
  // Capacitor отдаёт хэндл сразу или промис — в зависимости от версии моста
  addListener?: (event: string, cb: (data: { deepLink?: string }) => void) => { remove: () => void } | Promise<{ remove: () => void }>;
};

function plugin(): NotifyPlugin | undefined {
  return (window as unknown as { Capacitor?: { Plugins?: { AnixPlayer?: NotifyPlugin } } }).Capacitor?.Plugins?.AnixPlayer;
}

/** Есть нативные уведомления (APK с методом notify). */
export function hasNativeNotify(): boolean {
  return typeof plugin()?.notify === 'function';
}

export async function nativeNotify(payload: {
  id: string;
  title: string;
  body: string;
  deepLink?: { type: string; id: number };
}): Promise<boolean> {
  try {
    const res = await plugin()?.notify?.({
      id: payload.id,
      title: payload.title,
      body: payload.body,
      deepLink: payload.deepLink ? JSON.stringify(payload.deepLink) : undefined,
    });
    return !!res?.shown;
  } catch {
    return false;
  }
}

export async function requestNativeNotifyPermission(): Promise<boolean> {
  try {
    return !!(await plugin()?.requestNotifications?.())?.granted;
  } catch {
    return false;
  }
}

function parseLink(raw: string | null | undefined): { type: string; id: number } | null {
  if (!raw) return null;
  try {
    const d = JSON.parse(raw) as { type?: unknown; id?: unknown };
    return typeof d?.type === 'string' ? { type: d.type, id: Number(d.id) || 0 } : null;
  } catch {
    return null;
  }
}

/**
 * Нажатие на уведомление: при открытом приложении — событие плагина, при холодном старте — ссылка из интента.
 * onTap(null) — у уведомления нет адресата (открыть список уведомлений).
 */
export function bindNotificationTaps(onTap: (link: { type: string; id: number } | null) => void): () => void {
  const p = plugin();
  if (!p?.addListener) return () => {};
  let sub: { remove: () => void } | null = null;
  let stopped = false;
  void Promise.resolve(p.addListener('notificationTap', (data) => onTap(parseLink(data?.deepLink))))
    .then((s) => {
      if (stopped) s.remove();
      else sub = s;
    })
    .catch(() => {});
  if (typeof p.takeLaunchDeepLink === 'function') {
    void Promise.resolve(p.takeLaunchDeepLink()).then((res) => {
      if (res?.deepLink) onTap(parseLink(res.deepLink));
    }).catch(() => {});
  }
  return () => {
    stopped = true;
    sub?.remove();
  };
}
