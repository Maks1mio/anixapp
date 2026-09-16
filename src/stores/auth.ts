import { get, writable } from 'svelte/store';

export type AppScreen = 'offline' | 'login' | 'main';

/** Стартуем в main — проблемы сети показываем баннером в titlebar, не fullscreen. */
export const appScreen = writable<AppScreen>('main');

/** Есть сохранённый токен Anixart */
export const isAuthenticated = writable(false);

/**
 * false, пока getStatus не завершился.
 * До этого isAuthenticated=false не значит «гость» — страницы не должны рисовать «нужен вход».
 */
export const authReady = writable(false);

/** Модалка входа поверх приложения (гость открыл защищённый раздел) */
export const loginPromptOpen = writable(false);

export async function syncAuthStatus(): Promise<boolean> {
  if (typeof window === 'undefined' || !window.anixApi?.auth?.getStatus) {
    isAuthenticated.set(false);
    return false;
  }
  try {
    const { hasToken } = await window.anixApi.auth.getStatus();
    const ok = !!hasToken;
    isAuthenticated.set(ok);
    return ok;
  } catch {
    // Плохое соединение / сбой IPC — не считаем «гость» и не триггерим окно входа
    return get(isAuthenticated);
  }
}

/** Первый boot: узнать токен и разрешить монтирование маршрутов. */
export async function resolveAuth(): Promise<{ known: boolean; hasToken: boolean }> {
  let known = false;
  let hasToken = false;
  try {
    if (typeof window === 'undefined' || !window.anixApi?.auth?.getStatus) {
      isAuthenticated.set(false);
      known = true;
      hasToken = false;
    } else {
      const status = await window.anixApi.auth.getStatus();
      hasToken = !!status?.hasToken;
      isAuthenticated.set(hasToken);
      known = true;
    }
  } catch {
    known = false;
    hasToken = get(isAuthenticated);
  } finally {
    authReady.set(true);
  }
  return { known, hasToken };
}

export function openLoginPrompt(): void {
  loginPromptOpen.set(true);
}

export function closeLoginPrompt(): void {
  loginPromptOpen.set(false);
}

/** true — можно продолжать; false — показан логин (или сессия ещё не известна) */
export function requireAuth(): boolean {
  if (!get(authReady)) return false;
  if (get(isAuthenticated)) return true;
  openLoginPrompt();
  return false;
}

/** Разделы, которым нужен аккаунт (гости смотрят главную/каталог/релизы) */
export function pathRequiresAuth(path: string): boolean {
  const p = (path.split('?')[0] || '/').replace(/\/+$/, '') || '/';
  if (p === '/bookmarks') return true;
  if (p === '/notifications') return true;
  if (
    p === '/collections/my'
    || p === '/collections/create'
    || p === '/collections/pick-release'
    || p.startsWith('/collections/edit/')
  ) {
    return true;
  }
  if (/^\/profile\/(votes|friends|lists|comments|videos|collections)$/.test(p)) return true;
  return false;
}

/** После входа/выхода — обновить профиль в UI */
export function notifyAuthChanged(): void {
  window.dispatchEvent(new CustomEvent('anix:authChanged'));
}

/**
 * Смена / выход из аккаунта: синхронизация + полная перезагрузка,
 * чтобы все экраны подтянули данные нового профиля.
 */
export async function applyAccountSessionChange(): Promise<void> {
  await syncAuthStatus();
  notifyAuthChanged();
  try {
    window.location.reload();
  } catch {
    /* ignore */
  }
}
