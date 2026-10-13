/** Запуск плеера: отдельное окно в Electron, иначе маршрут /watch. */
import { navigate } from '../stores/navigation';
import { isPlayerWindowOpen } from '../stores/modals';
import { isTvMode } from '../platform/tv';

export interface WatchLaunchParams {
  releaseId: string | number;
  sourceId: string | number;
  ep: string | number;
  title: string;
  sourceName: string;
  dubberId?: string | number;
  dubberName?: string;
  lobbyIdle?: boolean;
  localFile?: string;
  externalUrl?: string;
  referer?: string;
  pageUrl?: string;
  cookies?: string;
  currentTime?: number;
  paused?: boolean;
  applyRoomPlayback?: boolean;
  /** Телефон: «Веб-плеер» — показать плеер источника (iframe) вместо прямого потока. */
  webPlayer?: boolean;
}

export function canOpenInAppPlayer(): boolean {
  return typeof window !== 'undefined' && (!!window.electron?.openPlayerWindow || !!window.anixApi);
}

export function isWatchRouteActive(): boolean {
  try {
    const hash = window.location.hash || '';
    if (hash.startsWith('#/watch')) return true;
    const path = window.location.pathname;
    return path === '/watch' || path.endsWith('/watch');
  } catch {
    return false;
  }
}

/** Плеер на маршруте /watch (в т.ч. встроенный web/TV). */
export function isEmbeddedWebPlayer(): boolean {
  return typeof window !== 'undefined' && isWatchRouteActive();
}

function toPlayerPayload(params: WatchLaunchParams) {
  return {
    releaseId: String(params.releaseId),
    sourceId: String(params.sourceId),
    ep: String(params.ep),
    title: params.title,
    sourceName: params.sourceName,
    ...(params.dubberId != null && params.dubberId !== '' ? { dubberId: String(params.dubberId) } : {}),
    ...(params.dubberName != null && params.dubberName !== '' ? { dubberName: String(params.dubberName) } : {}),
    ...(params.lobbyIdle ? { lobbyIdle: true } : {}),
    ...(params.localFile ? { localFile: params.localFile } : {}),
    ...(params.externalUrl ? { externalUrl: params.externalUrl } : {}),
    ...(params.referer ? { referer: params.referer } : {}),
    ...(params.pageUrl ? { pageUrl: params.pageUrl } : {}),
    ...(params.cookies ? { cookies: params.cookies } : {}),
    ...(typeof params.currentTime === 'number' ? { currentTime: params.currentTime } : {}),
    ...(params.paused != null ? { paused: params.paused } : {}),
    ...(params.applyRoomPlayback ? { applyRoomPlayback: true } : {}),
    ...(params.webPlayer ? { webPlayer: true } : {}),
  };
}

/** Открыть плеер внутри приложения (маршрут /watch), без отдельного окна. */
export function openInAppPlayer(params: WatchLaunchParams): Promise<void> {
  const payload = toPlayerPayload(params);
  const alreadyWatching = isWatchRouteActive();
  const qs = new URLSearchParams({
    releaseId: payload.releaseId,
    sourceId: payload.sourceId,
    ep: payload.ep,
    title: payload.title,
    sourceName: payload.sourceName,
    ...(payload.dubberId ? { dubberId: payload.dubberId } : {}),
    ...(payload.dubberName ? { dubberName: payload.dubberName } : {}),
    ...(params.lobbyIdle ? { lobbyIdle: '1' } : {}),
    ...(params.webPlayer ? { webplayer: '1' } : {}),
  });
  navigate(`/watch?${qs.toString()}`);
  if (alreadyWatching && !params.lobbyIdle) {
    window.dispatchEvent(new CustomEvent('player:changeContent', { detail: payload }));
  }
  return Promise.resolve();
}

/**
 * Desktop Electron → отдельное окно плеера.
 * TV / web без openPlayerWindow → встроенный /watch.
 */
export async function launchPlayer(params: WatchLaunchParams): Promise<void> {
  if (!isTvMode() && window.electron?.openPlayerWindow) {
    await window.electron.openPlayerWindow(toPlayerPayload(params));
    isPlayerWindowOpen.set(true);
    return;
  }
  await openInAppPlayer(params);
}
