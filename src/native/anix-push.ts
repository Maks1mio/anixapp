/**
 * Пуши на телефоне (плагин AnixPush): подписка на топик пользователя, как в официальном Anixart.
 * Показывает их нативный сервис, поэтому они приходят и при закрытом приложении.
 */
type PushPlugin = {
  sync: (o: { topic: string | null; enabled: boolean; showPreview: boolean }) => Promise<{ active: boolean; error?: string }>;
};

function plugin(): PushPlugin | undefined {
  return (window as unknown as { Capacitor?: { Plugins?: { AnixPush?: PushPlugin } } }).Capacitor?.Plugins?.AnixPush;
}

let active = false;

/** Подписка действует: уведомления показывает сервис, опросу дублировать их не нужно. */
export function isNativePushActive(): boolean {
  return active;
}

/** Вызывать при входе, смене аккаунта, выходе и изменении настроек уведомлений. */
export async function syncNativePush(options: { signedIn: boolean; enabled: boolean; showPreview: boolean }): Promise<void> {
  const p = plugin();
  if (!p) return;
  try {
    let topic: string | null = null;
    if (options.signedIn) {
      const res = await window.anixApi?.auth?.firebaseTopic?.();
      topic = res?.topicName || null;
      // Сервер не ответил: прежнюю подписку не снимаем, повторим при следующей синхронизации
      if (!topic) return;
    }
    const res = await p.sync({ topic, enabled: options.enabled, showPreview: options.showPreview });
    active = !!res?.active;
    if (res?.error) console.warn('[push] подписка не удалась:', res.error);
  } catch (err) {
    active = false;
    console.warn('[push] синхронизация не удалась:', err);
  }
}
