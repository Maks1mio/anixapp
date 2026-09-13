import { AnixApiError, AnixartError, HttpError } from 'anixapi';

const HTTP_LABELS: Record<number, string> = {
  400: 'Некорректный запрос',
  401: 'Нужна авторизация',
  403: 'Доступ запрещён',
  404: 'Не найдено',
  429: 'Слишком много запросов — подождите и повторите',
  500: 'Ошибка сервера Anixart',
  502: 'Сервер Anixart временно недоступен',
  503: 'Сервер Anixart временно недоступен',
  504: 'Сервер Anixart не ответил вовремя',
};

/** Anixart 10.0. В anixapi по умолчанию всё ещё 9.0 — передаём явно. */
export const ANIXART_UA =
  'AnixartApp/10.0-26090418 (Android 14; SDK 34; x86_64; ROG ASUS AI2201_B; ru)';

type AnixErr = {
  name?: string;
  message?: string;
  status?: number;
  httpStatus?: number;
  path?: string;
  code?: number;
  codeName?: string;
};

function asErr(err: unknown): AnixErr | null {
  if (err == null) return null;
  if (typeof err === 'string') return { message: err };
  if (typeof err === 'object') return err as AnixErr;
  return { message: String(err) };
}

function withPath(text: string, path: string): string {
  return path ? `${text} (${path})` : text;
}

function isHttpLike(err: AnixErr, raw: string, orig: unknown): boolean {
  if (orig instanceof HttpError || err.name === 'HttpError') return true;
  return /\[AnixApi\]|HTTP \d{3}|network error|empty response|invalid JSON/i.test(raw);
}

function isAnixartLike(err: AnixErr, orig: unknown): boolean {
  return (
    orig instanceof AnixartError
    || orig instanceof AnixApiError
    || err.name === 'AnixartError'
    || err.name === 'AnixApiError'
  );
}

/** Понятное сообщение из HttpError / AnixartError / обычного Error. */
export function formatAnixError(err: unknown): string {
  const parsed = asErr(err);
  if (!parsed) return 'Неизвестная ошибка API';

  const name = parsed.name || '';
  const raw = parsed.message ? String(parsed.message) : String(err);
  const status = typeof parsed.status === 'number'
    ? parsed.status
    : (typeof parsed.httpStatus === 'number' ? parsed.httpStatus : null);
  const path = typeof parsed.path === 'string' ? parsed.path : '';

  if (name === 'TimeoutError') return 'Превышено время ожидания ответа сервера';
  if (name === 'AbortError') return 'Запрос отменён';

  if (isAnixartLike(parsed, err)) {
    if (status === 401 || /token is required/i.test(raw)) {
      return 'Нужна авторизация — войдите в аккаунт';
    }
    const code = typeof parsed.code === 'number' ? parsed.code : null;
    if (code === 401) return 'Нужна авторизация';
    if (code === 402) return 'Аккаунт заблокирован';
    if (code === 403) return 'Аккаунт заблокирован навсегда';
    if (code === 1) return withPath('Непредвиденная ошибка сервера Anixart', path);

    const parts = ['Ошибка Anixart'];
    if (code != null) parts.push(`код ${code}`);
    const codeName = typeof parsed.codeName === 'string' ? parsed.codeName : '';
    if (codeName && !codeName.startsWith('UnknownCode')) parts.push(codeName);
    if (path) parts.push(path);
    if (parts.length === 1 && raw && !raw.startsWith('[AnixApi]')) return raw;
    return parts.join(' · ');
  }

  if (isHttpLike(parsed, raw, err)) {
    if (status === 0 || /network error/i.test(raw) || /fetch failed/i.test(raw)) {
      return withPath('Нет связи с сервером Anixart', path);
    }
    if (/empty response/i.test(raw)) {
      return withPath('Пустой ответ сервера Anixart', path);
    }
    if (/invalid JSON/i.test(raw)) {
      return withPath('Сервер вернул некорректный ответ', path);
    }
    if (status != null && status >= 400) {
      return withPath(HTTP_LABELS[status] || `Ошибка HTTP ${status}`, path);
    }
  }

  return raw;
}

export function enrichAnixError(err: unknown): unknown {
  if (!err || typeof err !== 'object') return err;
  const friendly = formatAnixError(err);
  const current = (err as { message?: string }).message;
  if (!friendly || current === friendly) return err;
  try {
    Object.defineProperty(err, 'message', { value: friendly, writable: true, configurable: true });
  } catch {
    (err as { message: string }).message = friendly;
  }
  return err;
}

type CallClient = {
  call?: (request: unknown) => Promise<unknown>;
};

export function attachAnixErrorMessages<T extends CallClient>(client: T): T {
  if (!client || typeof client.call !== 'function') return client;
  const original = client.call.bind(client);
  client.call = async (request: unknown) => {
    try {
      return await original(request);
    } catch (err) {
      throw enrichAnixError(err);
    }
  };
  return client;
}
