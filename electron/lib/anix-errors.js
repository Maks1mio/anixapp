'use strict';

let HttpError;
let AnixartError;
let AnixApiError;
try {
  ({ HttpError, AnixartError, AnixApiError } = require('anixapi'));
} catch {
  /* anixapi без классов ошибок — дальше duck-typing */
}

function isA(err, Ctor) {
  return typeof Ctor === 'function' && err instanceof Ctor;
}

const HTTP_LABELS = {
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

function errName(err) {
  return err && typeof err.name === 'string' ? err.name : '';
}

function errStatus(err) {
  if (!err || typeof err !== 'object') return null;
  if (typeof err.status === 'number') return err.status;
  if (typeof err.httpStatus === 'number') return err.httpStatus;
  return null;
}

function errPath(err) {
  return err && typeof err.path === 'string' && err.path ? err.path : '';
}

function withPath(text, path) {
  return path ? `${text} (${path})` : text;
}

function isHttpLike(err, raw) {
  const name = errName(err);
  if (name === 'HttpError' || isA(err, HttpError)) return true;
  return /\[AnixApi\]|HTTP \d{3}|network error|empty response|invalid JSON/i.test(raw);
}

function isAnixartLike(err) {
  const name = errName(err);
  return (
    isA(err, AnixartError)
    || isA(err, AnixApiError)
    || name === 'AnixartError'
    || name === 'AnixApiError'
  );
}

function formatAnixError(err) {
  if (err == null) return 'Неизвестная ошибка API';
  if (typeof err === 'string' && err.trim()) {
    return formatAnixError({ name: '', message: err.trim() });
  }

  const name = errName(err);
  const raw = err && err.message ? String(err.message) : String(err);
  const status = errStatus(err);
  const path = errPath(err);

  if (name === 'TimeoutError') return 'Превышено время ожидания ответа сервера';
  if (name === 'AbortError') return 'Запрос отменён';

  if (isAnixartLike(err)) {
    if (status === 401 || /token is required/i.test(raw)) {
      return 'Нужна авторизация — войдите в аккаунт';
    }
    const code = typeof err.code === 'number' ? err.code : null;
    if (code === 401) return 'Нужна авторизация';
    if (code === 402) return 'Аккаунт заблокирован';
    if (code === 403) return 'Аккаунт заблокирован навсегда';
    if (code === 1) return withPath('Непредвиденная ошибка сервера Anixart', path);

    const parts = ['Ошибка Anixart'];
    if (code != null) parts.push(`код ${code}`);
    const codeName = typeof err.codeName === 'string' ? err.codeName : '';
    if (codeName && !codeName.startsWith('UnknownCode')) parts.push(codeName);
    if (path) parts.push(path);
    if (parts.length === 1 && raw && !raw.startsWith('[AnixApi]')) return raw;
    return parts.join(' · ');
  }

  if (isHttpLike(err, raw)) {
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

function enrichAnixError(err) {
  if (!err || typeof err !== 'object') return err;
  const friendly = formatAnixError(err);
  if (!friendly || err.message === friendly) return err;
  try {
    Object.defineProperty(err, 'message', { value: friendly, writable: true, configurable: true });
  } catch {
    err.message = friendly;
  }
  return err;
}

function attachAnixErrorMessages(client) {
  if (!client || typeof client.call !== 'function') return client;
  const original = client.call.bind(client);
  client.call = async (request) => {
    try {
      return await original(request);
    } catch (err) {
      throw enrichAnixError(err);
    }
  };
  return client;
}

function anixErrorLogMeta(err) {
  if (!err || typeof err !== 'object') return {};
  if (isA(err, HttpError) || errName(err) === 'HttpError') {
    return { kind: 'HttpError', status: errStatus(err), path: errPath(err) || undefined };
  }
  if (isAnixartLike(err)) {
    return {
      kind: errName(err) || 'AnixartError',
      code: typeof err.code === 'number' ? err.code : undefined,
      codeName: err.codeName || undefined,
      path: errPath(err) || undefined,
      httpStatus: errStatus(err) ?? undefined,
    };
  }
  return {};
}

module.exports = {
  formatAnixError,
  enrichAnixError,
  attachAnixErrorMessages,
  anixErrorLogMeta,
};
