import { formatAnixError, stripErrorPathSuffix } from '../native/anix-errors';

export type ContentLoadTone = 'warn' | 'danger';

export interface ContentLoadErrorInfo {
  headline: string;
  tone: ContentLoadTone;
  retryable: boolean;
}

const SERVER_UNAVAILABLE = 'Ошибка: сервера Anixart временно недоступен';
const SERVER_UNREACHABLE = 'Ошибка: нет связи с сервером Anixart';
const SERVER_TIMEOUT = 'Ошибка: сервер Anixart не ответил';
const LOAD_FAILED = 'Ошибка: не удалось загрузить';

function looksOffline(text: string): boolean {
  return /нет связи|нет соединения|потерян|network|fetch failed|econn|enotfound|etimedout|econnreset|offline|интернет/i.test(text);
}

function looksUnavailable(text: string): boolean {
  return /временно недоступен|502|503|500|пустой ответ|некорректный ответ|слишком много запросов/i.test(text);
}

function looksTimeout(text: string): boolean {
  return /не ответил|timeout|превышено время|504/i.test(text);
}

function looksAuth(text: string): boolean {
  return /авторизац|войдите|нужна авторизация/i.test(text);
}

function looksNotFound(text: string): boolean {
  return /не найдено|не найден|недоступна или удалена|удалена/i.test(text);
}

export function describeContentLoadError(err: unknown): ContentLoadErrorInfo {
  const formatted = stripErrorPathSuffix(formatAnixError(err));
  const offline = looksOffline(formatted);
  const unavailable = looksUnavailable(formatted);
  const timeout = looksTimeout(formatted);
  const auth = looksAuth(formatted);
  const notFound = looksNotFound(formatted);

  let headline = formatted;
  if (unavailable) headline = SERVER_UNAVAILABLE;
  else if (offline) headline = SERVER_UNREACHABLE;
  else if (timeout) headline = SERVER_TIMEOUT;
  else if (!formatted) headline = LOAD_FAILED;
  else if (!/^ошибка:/i.test(formatted)) headline = `Ошибка: ${formatted}`;

  return {
    headline,
    tone: offline ? 'danger' : 'warn',
    retryable: !auth && !notFound,
  };
}

export function headlineFromLoadError(err: unknown): string {
  return describeContentLoadError(err).headline;
}
