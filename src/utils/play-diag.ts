/**
 * Диагностика цепочки воспроизведения на телефоне:
 * серия → прямая ссылка → источник плеера → медиазапрос → воспроизведение.
 *
 * Пишет в консоль строки «[AnixPlay] этап …» — в logcat они видны как
 * Capacitor/Console. URL сокращаются до хоста и пути (без query: там бывают
 * подписи и токены), заголовки и тела ответов не пишутся.
 */
import { isPhoneMode } from '../platform/phone';

export function diagUrl(url: string | null | undefined): string {
  if (!url) return '(пусто)';
  try {
    const u = new URL(url, 'https://localhost');
    const path = u.pathname.length > 80 ? `${u.pathname.slice(0, 77)}…` : u.pathname;
    return `${u.host}${path}`;
  } catch {
    return '(некорректный URL)';
  }
}

export function playDiag(stage: string, data: Record<string, unknown> = {}): void {
  if (!isPhoneMode()) return;
  const parts = Object.entries(data)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`);
  console.info(`[AnixPlay] ${stage}${parts.length ? ` ${parts.join(' ')}` : ''}`);
}
