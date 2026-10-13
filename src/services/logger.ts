/** Logging system removed — no-op stubs. */

export const rendererLogger = {
  debug: (_ch: string, _msg: string, _data?: unknown) => {},
  info: (_ch: string, _msg: string, _data?: unknown) => {},
  warn: (_ch: string, _msg: string, _data?: unknown) => {},
  error: (_ch: string, _msg: string, _data?: unknown) => {},
};

export async function logApi<T>(_name: string, fn: () => Promise<T>): Promise<T> {
  return fn();
}

export function initRendererLogging(): void {
  /* no-op */
}
