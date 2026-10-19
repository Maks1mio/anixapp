/**
 * Electron передаёт аргументы в main через contextBridge, а он не умеет
 * клонировать Svelte-прокси (`$state`) — падает с «An object could not be cloned».
 * В браузере прокси проходит молча, поэтому баг виден только в Electron.
 *
 * Для IPC-вызовов с объектами (например `release.filter(0, args)`) аргументы
 * нужно приводить к «сырым» объектам. Данные всегда JSON-совместимы.
 */
export function toIpcArgs<T>(value: T): T {
  if (value == null || typeof value !== 'object') return value;
  try {
    return JSON.parse(JSON.stringify(value)) as T;
  } catch {
    return value;
  }
}
