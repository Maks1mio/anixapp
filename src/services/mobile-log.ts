/**
 * Журнал Android-версии (раздел «Отладка»): ошибки приложения, сбои сети и события АниксПлеера.
 * Хранится локально (последние MAX записей), ничего никуда не отправляет.
 * В ссылках отрезаются параметры (?…#…) — там бывают токены; заголовки запросов не пишутся.
 */

export type LogLevel = 'info' | 'warn' | 'error';
export type LogChannel = 'app' | 'network' | 'player' | 'system';

export interface LogEntry {
  ts: number;
  level: LogLevel;
  channel: LogChannel;
  message: string;
}

const STORAGE_KEY = 'anixapp.mobileLog';
const MAX = 600;
const MAX_MSG = 1500;

let entries: LogEntry[] = [];
const listeners = new Set<(e: LogEntry[]) => void>();
let saveTimer: ReturnType<typeof setTimeout> | undefined;
let installed = false;

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const arr = raw ? (JSON.parse(raw) as LogEntry[]) : [];
    entries = Array.isArray(arr) ? arr.slice(-MAX) : [];
  } catch {
    entries = [];
  }
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(entries)); } catch { /* квота — не критично */ }
  }, 800);
}

/** Ссылка без параметров и фрагмента: токены и ключи остаются за кадром. */
export function safeUrl(url: string): string {
  try {
    const u = new URL(url, location.href);
    return `${u.origin}${u.pathname}`;
  } catch {
    return String(url).split(/[?#]/)[0];
  }
}

function stringify(v: unknown): string {
  if (v instanceof Error) return `${v.name}: ${v.message}${v.stack ? `\n${v.stack.split('\n').slice(1, 4).join('\n')}` : ''}`;
  if (typeof v === 'string') return v;
  try { return JSON.stringify(v); } catch { return String(v); }
}

export function mlog(channel: LogChannel, level: LogLevel, ...parts: unknown[]): void {
  const message = parts.map(stringify).join(' ')
    // на всякий случай — маскируем похожее на токены
    .replace(/((?:token|key|auth|password|sign)[^=:\s]*[=:]\s*)[^\s&,"']+/gi, '$1***')
    .slice(0, MAX_MSG);
  const e: LogEntry = { ts: Date.now(), level, channel, message };
  entries.push(e);
  if (entries.length > MAX) entries.splice(0, entries.length - MAX);
  scheduleSave();
  for (const l of listeners) l(entries);
}

export function getLog(): LogEntry[] {
  return entries;
}

export function clearLog(): void {
  entries = [];
  scheduleSave();
  for (const l of listeners) l(entries);
}

export function subscribeLog(cb: (e: LogEntry[]) => void): () => void {
  listeners.add(cb);
  cb(entries);
  return () => listeners.delete(cb);
}

function deviceLine(): string {
  const ua = navigator.userAgent;
  const android = /Android\s([\d.]+)/.exec(ua)?.[1] ?? '?';
  const webview = /Chrome\/([\d.]+)/.exec(ua)?.[1] ?? '?';
  return `AnixApp ${typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '?'} · Android ${android} · WebView ${webview} · `
    + `экран ${innerWidth}×${innerHeight} dp, ×${devicePixelRatio} · тема ${document.documentElement.dataset.mTheme ?? '?'}`;
}

/** Текст журнала для «Скопировать» / «Поделиться». */
export function exportLogText(filter?: (e: LogEntry) => boolean): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const fmt = (ts: number) => {
    const d = new Date(ts);
    return `${pad(d.getDate())}.${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  };
  const list = filter ? entries.filter(filter) : entries;
  return [deviceLine(), '', ...list.map((e) => `${fmt(e.ts)} [${e.level.toUpperCase()}] ${e.channel}: ${e.message}`)].join('\n');
}

/** Перехват console.warn/error, необработанных ошибок и сбоев fetch. Вызывается один раз на старте. */
export function installMobileLog(): void {
  if (installed) return;
  installed = true;
  load();

  for (const level of ['warn', 'error'] as const) {
    const orig = console[level].bind(console);
    console[level] = (...args: unknown[]) => {
      orig(...args);
      try { mlog('app', level, ...args); } catch { /* ignore */ }
    };
  }

  window.addEventListener('error', (ev) => {
    const where = ev.filename ? ` (${safeUrl(ev.filename)}:${ev.lineno})` : '';
    mlog('app', 'error', `Ошибка: ${ev.message}${where}`);
  });
  window.addEventListener('unhandledrejection', (ev) => {
    mlog('app', 'error', 'Необработанное отклонение промиса:', ev.reason);
  });

  const origFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const method = (init?.method || (typeof input === 'object' && 'method' in input ? input.method : 'GET') || 'GET').toUpperCase();
    const t0 = performance.now();
    try {
      const res = await origFetch(input, init);
      if (res.status >= 400) {
        mlog('network', res.status >= 500 ? 'error' : 'warn', `${method} ${safeUrl(url)} → ${res.status} (${Math.round(performance.now() - t0)} мс)`);
      }
      return res;
    } catch (e) {
      if ((e as Error)?.name !== 'AbortError') {
        mlog('network', 'error', `${method} ${safeUrl(url)} → сбой: ${(e as Error)?.message ?? e}`);
      }
      throw e;
    }
  };

  document.addEventListener('visibilitychange', () => {
    mlog('system', 'info', document.hidden ? 'Приложение свёрнуто' : 'Приложение открыто');
  });
  mlog('system', 'info', `Запуск: ${deviceLine()}`);
}
