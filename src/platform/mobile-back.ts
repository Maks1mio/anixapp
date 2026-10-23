/**
 * Системная кнопка «Назад» на телефоне (Capacitor App.backButton).
 * Обработчики — стек: последний зарегистрированный (верхний экран/шторка) получает нажатие первым
 * и возвращает true, если обработал его. Если никто не обработал — fallback из MobileLayout.
 */
type BackHandler = () => boolean;

const handlers: BackHandler[] = [];

export function pushBackHandler(fn: BackHandler): () => void {
  handlers.push(fn);
  return () => {
    const i = handlers.lastIndexOf(fn);
    if (i >= 0) handlers.splice(i, 1);
  };
}

export function dispatchBack(): boolean {
  for (let i = handlers.length - 1; i >= 0; i--) {
    if (handlers[i]()) return true;
  }
  return false;
}

/** Подписка на аппаратную кнопку; `fallback` — когда ни один экран не перехватил нажатие. */
export async function bindNativeBackButton(fallback: () => void): Promise<() => void> {
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  if (!cap?.isNativePlatform?.()) return () => {};
  try {
    const { App } = await import('@capacitor/app');
    const sub = await App.addListener('backButton', () => {
      if (!dispatchBack()) fallback();
    });
    return () => void sub.remove();
  } catch {
    return () => {};
  }
}

export async function minimizeNativeApp(): Promise<void> {
  try {
    const { App } = await import('@capacitor/app');
    await App.minimizeApp();
  } catch {}
}
