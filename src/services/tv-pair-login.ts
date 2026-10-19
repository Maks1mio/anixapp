/**
 * Вход на ТВ по QR через сервер (tv.anixapp.com):
 * ТВ создаёт пару → на телефоне открывают `/?ref=…` → телефон шлёт логин/пароль →
 * ТВ забирает их одним запросом и входит. Резерв — LAN-вход (`tv-lan-login`).
 *
 * Эндпоинты живут в бридже (`/__anix/pair/*`): в dev — Vite-плагин, в проде —
 * `scripts/tv-bridge-server.mjs` за nginx на tv.anixapp.com.
 */

export type TvPairCredentials = { login: string; password: string };

const PUBLIC_HOST = 'tv.anixapp.com';
const PAIR_TTL_FALLBACK_MS = 10 * 60 * 1000;

function isNativeApp(): boolean {
  if (typeof window === 'undefined') return false;
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return !!cap?.isNativePlatform?.();
}

/** База API пары: свой origin на tv.anixapp.com и в dev, публичный — из APK с локальным UI. */
function pairApiBase(): string {
  if (typeof window === 'undefined') return `https://${PUBLIC_HOST}`;
  if (isNativeApp()) return `https://${PUBLIC_HOST}`;
  const host = window.location.hostname;
  if (host === 'localhost' || host === '127.0.0.1' || host.endsWith('anixapp.com')) return '';
  return `https://${PUBLIC_HOST}`;
}

/** Ссылка для QR: публичная страница пары (в dev — текущий origin для отладки). */
export function tvPairPublicUrl(ref: string): string {
  const encoded = encodeURIComponent(ref);
  if (typeof window !== 'undefined' && !isNativeApp()) {
    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') {
      return `${window.location.origin}/?ref=${encoded}`;
    }
  }
  return `https://${PUBLIC_HOST}/?ref=${encoded}`;
}

async function pairFetch(path: string, init: RequestInit = {}): Promise<Record<string, unknown>> {
  const res = await fetch(`${pairApiBase()}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    signal: init.signal ?? AbortSignal.timeout(8000),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { ...data, httpOk: res.ok, httpStatus: res.status };
}

export async function startTvPairLogin(): Promise<
  { ref: string; url: string; expiresIn: number } | { error: string }
> {
  try {
    const data = await pairFetch('/__anix/pair/create', { method: 'POST', body: '{}' });
    const ref = String(data.ref ?? '').trim();
    if (!ref) return { error: String(data.error ?? 'pair_unavailable') };
    return {
      ref,
      url: tvPairPublicUrl(ref),
      expiresIn: Number(data.expiresIn) || PAIR_TTL_FALLBACK_MS,
    };
  } catch (err) {
    return { error: String((err as Error)?.message || err) };
  }
}

/** Опрос готовности пары. Возвращает функцию остановки. */
export function pollTvPairCredentials(
  ref: string,
  onCredentials: (creds: TvPairCredentials) => void,
  options: { intervalMs?: number; expiresIn?: number } = {},
): () => void {
  const interval = Math.max(800, options.intervalMs ?? 1500);
  const deadline = Date.now() + (options.expiresIn ?? PAIR_TTL_FALLBACK_MS);
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const stop = () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    timer = null;
  };

  const tick = async () => {
    if (stopped) return;
    if (Date.now() > deadline) {
      stop();
      return;
    }
    try {
      const data = await pairFetch(`/__anix/pair/status?ref=${encodeURIComponent(ref)}`);
      if (stopped) return;
      const status = String(data.status ?? '');
      if (status === 'ready') {
        const login = String(data.login ?? '').trim();
        const password = String(data.password ?? '');
        stop();
        if (login && password) onCredentials({ login, password });
        return;
      }
      if (status === 'expired') {
        stop();
        return;
      }
    } catch {
      /* сеть мигнула — пробуем на следующем тике */
    }
    timer = setTimeout(tick, interval);
  };

  timer = setTimeout(tick, interval);
  return stop;
}

/** Телефонная страница пары: отдать логин/пароль телевизору. */
export async function submitTvPairCredentials(
  ref: string,
  login: string,
  password: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const data = await pairFetch('/__anix/pair/submit', {
      method: 'POST',
      body: JSON.stringify({ ref, login, password }),
    });
    if (data.ok) return { ok: true };
    return { ok: false, error: String(data.error ?? 'pair_failed') };
  } catch (err) {
    return { ok: false, error: String((err as Error)?.message || err) };
  }
}
