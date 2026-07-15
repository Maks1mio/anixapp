// src/services/logger.ts
type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

interface LogEntry {
  level: LogLevel;
  ch: string;
  msg: string;
  data?: unknown;
}

const queue: LogEntry[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function send(entry: LogEntry) {
  (window as any).electron?.logRenderer?.(entry).catch?.(() => {});
}

function flush() {
  flushTimer = null;
  if (!queue.length) return;
  const batch = queue.splice(0, queue.length);
  for (const e of batch) send(e);
}

function scheduleFlush() {
  if (flushTimer !== null) return;
  flushTimer = setTimeout(flush, 2000);
}

function log(level: LogLevel, ch: string, msg: string, data?: unknown) {
  const entry: LogEntry = { level, ch, msg, ...(data !== undefined ? { data } : {}) };
  if (level === 'ERROR' || level === 'WARN') {
    // Send immediately
    send(entry);
  } else {
    queue.push(entry);
    scheduleFlush();
  }
}

export const rendererLogger = {
  debug: (ch: string, msg: string, data?: unknown) => log('DEBUG', ch, msg, data),
  info:  (ch: string, msg: string, data?: unknown) => log('INFO',  ch, msg, data),
  warn:  (ch: string, msg: string, data?: unknown) => log('WARN',  ch, msg, data),
  error: (ch: string, msg: string, data?: unknown) => log('ERROR', ch, msg, data),
};

/**
 * Wrap any async call with automatic timing + error logging.
 * Usage: const data = await logApi('anixApi.release.info', () => window.anixApi.release.info(id))
 */
export async function logApi<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const t0 = performance.now();
  try {
    const result = await fn();
    log('DEBUG', 'api', `${name} ok`, { ms: Math.round(performance.now() - t0) });
    return result;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log('ERROR', 'api', `${name} error: ${msg}`, {
      ms: Math.round(performance.now() - t0),
      stack: err instanceof Error ? err.stack?.slice(0, 400) : undefined,
    });
    throw err;
  }
}

export function initRendererLogging() {
  // Intercept unhandled errors
  window.addEventListener('error', (ev) => {
    rendererLogger.error('window', ev.message || 'Unknown error', {
      filename: ev.filename,
      lineno: ev.lineno,
      colno: ev.colno,
      stack: (ev.error instanceof Error) ? ev.error.stack : undefined,
    });
  });

  window.addEventListener('unhandledrejection', (ev) => {
    const reason = ev.reason;
    const msg = reason instanceof Error ? reason.message : String(reason);
    rendererLogger.error('promise', `Unhandled rejection: ${msg}`, {
      stack: reason instanceof Error ? reason.stack : undefined,
    });
  });

  // Patch console.error and console.warn to forward to main
  const origError = console.error.bind(console);
  const origWarn  = console.warn.bind(console);

  console.error = (...args: unknown[]) => {
    origError(...args);
    const msg = args.map(a => (a instanceof Error ? `${a.message}` : String(a))).join(' ');
    const stack = args.find(a => a instanceof Error) instanceof Error
      ? (args.find(a => a instanceof Error) as Error).stack
      : undefined;
    rendererLogger.error('console', msg, stack ? { stack } : undefined);
  };

  console.warn = (...args: unknown[]) => {
    origWarn(...args);
    const msg = args.map(a => String(a)).join(' ');
    rendererLogger.warn('console', msg);
  };

  // Navigation
  window.addEventListener('anix:navigate', (ev: Event) => {
    const path = (ev as CustomEvent<string>).detail;
    rendererLogger.info('navigation', `→ ${path}`);
  });

  window.addEventListener('anix:beforeNavigate', (ev: Event) => {
    const to = (ev as CustomEvent<{ to?: string }>).detail?.to;
    rendererLogger.info('navigation', `before → ${to ?? '?'}`);
  });

  // Window focus/blur
  window.addEventListener('focus', () => rendererLogger.debug('window', 'focus'));
  window.addEventListener('blur',  () => rendererLogger.debug('window', 'blur'));

  // Online/offline
  window.addEventListener('online',  () => rendererLogger.info('network', 'online'));
  window.addEventListener('offline', () => rendererLogger.warn('network', 'offline'));

  // Page visibility (tab hidden/shown)
  document.addEventListener('visibilitychange', () => {
    rendererLogger.debug('window', `visibility: ${document.visibilityState}`);
  });

  // Anix app-level events
  window.addEventListener('anix:offline', (ev: Event) => {
    const d = (ev as CustomEvent).detail;
    rendererLogger.warn('anix', 'API offline', d);
  });

  // Video/media errors bubble up from HLS — capture them
  document.addEventListener('error', (ev) => {
    const target = ev.target as HTMLElement;
    if (target instanceof HTMLMediaElement) {
      const code = target.error?.code;
      const message = target.error?.message;
      rendererLogger.error('media', `MediaError code=${code}`, { message, src: (target as HTMLVideoElement).src?.slice(0, 200) });
    }
  }, true /* capture */);

  rendererLogger.info('app', 'renderer initialized', {
    userAgent: navigator.userAgent.slice(0, 120),
    href: location.href,
    screen: `${screen.width}×${screen.height}`,
    devicePixelRatio: window.devicePixelRatio,
  });
}
