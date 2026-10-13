/**
 * Доступ к API Anixart на телефоне: прямые хосты + резервный прокси AnixApp с автопереключением.
 *
 * Диагноз бага «соединение с API не проходит»: в localStorage (`anixapp.native.config`) оставался
 * baseUrl = https://api.anixapp.com/anixart-api. Прокси принимает только запросы с заголовком
 * `x-anixapp-proxy-key`, а мобильный клиент его не слал → 403 на каждый запрос, при том что прямые хосты
 * (api-s.anixsekai.com, api.anixart.app, api.anixart.tv) отвечали 200. Автопереключения не было.
 */
export const PROXY_URL = 'https://api.anixapp.com/anixart-api';
export const DIRECT_HOSTS = [
  'https://api-s.anixsekai.com',
  'https://api.anixart.app',
  'https://api.anixart.tv',
] as const;

declare const __ANIXART_PROXY_KEY__: string | undefined;

/** Ключ резервного прокси (подставляется на сборке из ANIXART_PROXY_APP_KEY, только в мобильном бандле). */
export function proxyKey(): string {
  try {
    return typeof __ANIXART_PROXY_KEY__ === 'string' ? __ANIXART_PROXY_KEY__.trim() : '';
  } catch {
    return '';
  }
}

export function isProxyUrl(url: string | null | undefined): boolean {
  return !!url && String(url).replace(/\/$/, '').startsWith(PROXY_URL);
}

let fetchPatched = false;

/** Добавляет `x-anixapp-proxy-key` к запросам на резервный прокси (идемпотентно). */
export function installProxyKeyFetch(): void {
  const key = proxyKey();
  if (fetchPatched || !key || typeof window === 'undefined' || typeof window.fetch !== 'function') return;
  fetchPatched = true;
  const original = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url;
    if (!isProxyUrl(url)) return original(input, init);
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    headers.set('x-anixapp-proxy-key', key);
    return original(input, { ...init, headers });
  };
}

/** Кандидаты для переключения: сначала текущий, потом остальные; прокси — только если есть ключ. */
export function candidateBases(current: string): string[] {
  const cur = String(current || '').replace(/\/$/, '');
  const list: string[] = [...DIRECT_HOSTS];
  if (proxyKey()) list.push(PROXY_URL);
  const rest = list.filter((b) => b !== cur);
  // Без ключа прокси бесполезен: если сохранён он, пробуем прямые хосты
  return cur && (!isProxyUrl(cur) || proxyKey()) ? [cur, ...rest] : rest;
}

/**
 * Переключаемся только при сбое доставки: сеть/таймаут (status 0), 408/429/5xx.
 * 403 — осмысленный ответ сервера (нужна авторизация и т.п.), его на прямых хостах не трогаем;
 * только у резервного прокси 403 означает «нет/неверный ключ» — тогда уходим на прямые хосты.
 */
function shouldFailover(err: unknown, base: string): boolean {
  const e = err as { status?: number } | null;
  const status = Number(e?.status ?? 0);
  if (status === 0) return true;
  if (status === 403) return isProxyUrl(base);
  return status === 408 || status === 429 || status >= 500;
}

type AnyClient = { call?: (request: any) => Promise<any>; baseUrl?: string };

/**
 * Оборачивает client.call: при сетевой ошибке / 403 / 5xx перебирает остальные базы и запоминает рабочую.
 * Запросы с явным customBaseUrl (проверка конкретного адреса) не переключаются.
 */
export function attachApiFailover<T extends AnyClient>(client: T, onSwitch: (base: string) => void): T {
  if (typeof client.call !== 'function') return client;
  const original = client.call.bind(client);
  let inFailover = false;
  client.call = async (request: any) => {
    const explicit = request?.customBaseUrl;
    if (explicit || inFailover) return original(request);
    try {
      return await original(request);
    } catch (err) {
      const current = String(client.baseUrl ?? '');
      if (!shouldFailover(err, current)) throw err;
      let lastErr = err;
      inFailover = true;
      try {
        for (const base of candidateBases(current).filter((b) => b !== current.replace(/\/$/, ''))) {
          try {
            const res = await original({ ...request, customBaseUrl: base });
            client.baseUrl = base;
            onSwitch(base);
            return res;
          } catch (e) {
            lastErr = e;
            if (!shouldFailover(e, base)) throw e;
          }
        }
      } finally {
        inFailover = false;
      }
      throw lastErr;
    }
  };
  return client;
}
