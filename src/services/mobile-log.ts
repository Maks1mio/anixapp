/**
 * Журнал Android-версии (раздел «Отладка»): ошибки приложения, сбои сети и события АниксПлеера.
 * Хранится локально (последние MAX записей), ничего никуда не отправляет.
 * В ссылках отрезаются параметры (?…#…) — там бывают токены; заголовки запросов не пишутся.
 */

export type LogLevel = 'info' | 'warn' | 'error';
export type LogChannel = 'app' | 'network' | 'player' | 'download' | 'system';

export interface LogEntry {
  ts: number;
  level: LogLevel;
  channel: LogChannel;
  message: string;
}

const STORAGE_KEY = 'anixapp.mobileLog';
const VERBOSE_KEY = 'anixapp.mobileLogVerbose';

/** Подробный режим: пишутся все запросы к API (метод, путь, статус, время), не только ошибки. */
export function isVerboseLog(): boolean {
  try { return localStorage.getItem(VERBOSE_KEY) === '1'; } catch { return false; }
}

export function setVerboseLog(on: boolean): void {
  try { localStorage.setItem(VERBOSE_KEY, on ? '1' : '0'); } catch { /* ignore */ }
  mlog('system', 'info', on ? 'Подробный журнал включён' : 'Подробный журнал выключен');
}
const MAX = 600;
const MAX_MSG = 1500;

let entries: LogEntry[] = [];
const listeners = new Set<(e: LogEntry[]) => void>();
let saveTimer: ReturnType<typeof setTimeout> | undefined;
let installed = false;

type NativeEntry = { ts: number; level: LogLevel; channel: string; message: string };
type LogPlugin = {
  nativeLog?: (o: { level: LogLevel; channel: string; message: string }) => Promise<void>;
  nativeLogs?: () => Promise<{ entries?: NativeEntry[] }>;
  exitReasons?: () => Promise<{
    exits?: { ts: number; reason: string; description: string; importance: number }[];
    lastCrash?: { ts: number; trace: string };
  }>;
  addListener?: (ev: string, cb: (e: NativeEntry) => void) => Promise<unknown>;
};

function nativePlugin(): LogPlugin | undefined {
  return (window as unknown as { Capacitor?: { Plugins?: { AnixPlayer?: LogPlugin } } }).Capacitor?.Plugins?.AnixPlayer;
}

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

function push(e: LogEntry) {
  entries.push(e);
  if (entries.length > MAX) entries.splice(0, entries.length - MAX);
  scheduleSave();
  for (const l of listeners) l(entries);
}

export function mlog(channel: LogChannel, level: LogLevel, ...parts: unknown[]): void {
  const message = parts.map(stringify).join(' ')
    // на всякий случай — маскируем похожее на токены
    .replace(/((?:token|key|auth|password|sign)[^=:\s]*[=:]\s*)[^\s&,"']+/gi, '$1***')
    .slice(0, MAX_MSG);
  push({ ts: Date.now(), level, channel, message });
  // Дублируем в logcat (тег AnixApp/web): видно в adb logcat и отчётах об ошибках Android
  void nativePlugin()?.nativeLog?.({ level, channel, message }).catch(() => {});
}

const NATIVE_CHANNELS: Record<string, LogChannel> = { player: 'player', download: 'download', network: 'network', system: 'system' };

/** Запись из нативной части (уже в logcat) — только в журнал. */
function pushNative(e: NativeEntry) {
  push({ ts: e.ts || Date.now(), level: e.level, channel: NATIVE_CHANNELS[e.channel] ?? 'app', message: e.message });
}

const EXIT_TEXT: Record<string, [LogLevel, string]> = {
  crash: ['error', 'вылет (ошибка Java/Kotlin)'],
  crash_native: ['error', 'вылет в нативном коде'],
  anr: ['error', 'зависание — «Приложение не отвечает» (ANR)'],
  low_memory: ['warn', 'закрыто системой: не хватило памяти'],
  excessive_resource: ['warn', 'закрыто системой: слишком много ресурсов'],
  signaled: ['warn', 'процесс остановлен сигналом (обычно — системой)'],
  init_failure: ['error', 'ошибка запуска'],
  dependency_died: ['warn', 'завершилась зависимость (WebView или сервис)'],
  user_requested: ['info', 'остановлено пользователем (Остановить / смахнули)'],
  user_stopped: ['info', 'остановлено пользователем'],
  exit_self: ['info', 'приложение завершилось само'],
  permission_change: ['info', 'перезапуск после смены разрешений'],
};

/** При старте: что накопила нативная часть и почему процесс завершался в прошлые разы (Android 11+). */
async function collectNative() {
  const p = nativePlugin();
  if (!p) return;
  try {
    const { entries: list = [] } = (await p.nativeLogs?.()) ?? {};
    list.forEach(pushNative);
  } catch { /* старый APK без метода */ }
  try {
    const r = await p.exitReasons?.();
    const KEY = 'anixapp.lastExitTs';
    let seen = 0;
    try { seen = Number(localStorage.getItem(KEY)) || 0; } catch { /* ignore */ }
    const fresh = (r?.exits ?? []).filter((x) => x.ts > seen).sort((a, b) => a.ts - b.ts);
    for (const x of fresh) {
      const [level, text] = EXIT_TEXT[x.reason] ?? ['info', `завершение: ${x.reason}`];
      push({ ts: x.ts, level, channel: 'system', message: `Прошлый запуск: ${text}${x.description ? ` — ${x.description}` : ''}` });
    }
    const maxTs = Math.max(seen, ...fresh.map((x) => x.ts));
    try { localStorage.setItem(KEY, String(maxTs)); } catch { /* ignore */ }
    if (r?.lastCrash?.trace) {
      push({ ts: r.lastCrash.ts || Date.now(), level: 'error', channel: 'app', message: `Вылет приложения:
${r.lastCrash.trace}` });
    }
  } catch { /* ignore */ }
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
    + `экран ${innerWidth}×${innerHeight} dp, ×${devicePixelRatio}, ${innerWidth > innerHeight ? 'альбомная' : 'портретная'}`
    + (document.documentElement.dataset.mTheme ? ` · тема ${document.documentElement.dataset.mTheme}` : '');
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
    // Безвредное предупреждение браузера, не ошибка приложения
    if (/ResizeObserver loop/i.test(ev.message || '')) return;
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
      // 404 на корень API — штатная проверка доступности сервера, не ошибка
      const isPing = res.status === 404 && /^https?:\/\/[^/]+\/?$/.test(url.split(/[?#]/)[0]);
      const ms = Math.round(performance.now() - t0);
      if (res.status >= 400 && !isPing) {
        mlog('network', res.status >= 500 ? 'error' : 'warn', `${method} ${safeUrl(url)} → ${res.status} (${ms} мс)`);
      } else if (isVerboseLog()) {
        mlog('network', ms > 3000 ? 'warn' : 'info', `${method} ${safeUrl(url)} → ${res.status} (${ms} мс)${ms > 3000 ? ' — медленно' : ''}`);
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
    if (!document.hidden) void nativePlugin()?.nativeLogs?.().then((r) => (r?.entries ?? []).forEach(pushNative)).catch(() => {});
  });
  mlog('system', 'info', `Запуск: ${deviceLine()}`);

  // Переходы между экранами — только путь, без параметров
  let lastPath = location.pathname;
  const onNav = () => {
    if (location.pathname === lastPath) return;
    lastPath = location.pathname;
    mlog('app', 'info', `Экран: ${location.pathname}`);
  };
  for (const k of ['pushState', 'replaceState'] as const) {
    const orig = history[k].bind(history);
    history[k] = ((...a: Parameters<History['pushState']>) => { orig(...a); onNav(); }) as History['pushState'];
  }
  window.addEventListener('popstate', onNav);

  // Для диагностики через отладчик / adb: window.anixLog.text(), .errors(), .last(n)
  (window as unknown as { anixLog: unknown }).anixLog = {
    last: (n = 50) => entries.slice(-n),
    errors: () => entries.filter((e) => e.level !== 'info'),
    text: () => exportLogText(),
    verbose: setVerboseLog,
  };
  // addListener в Capacitor возвращает thenable без .catch — оборачиваем
  try {
    const sub = nativePlugin()?.addListener?.('nativeLog', pushNative);
    if (sub) void Promise.resolve(sub).catch(() => {});
  } catch { /* старый APK */ }
  void collectNative();
}
