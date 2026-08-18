/** Открыть плеер: Electron-окно или встроенная страница /watch в браузере. */
import { navigate } from '../stores/navigation';
import { isPlayerWindowOpen } from '../stores/modals';

export interface WatchLaunchParams {
  releaseId: string | number;
  sourceId: string | number;
  ep: string | number;
  title: string;
  sourceName: string;
  dubberId?: string | number;
  lobbyIdle?: boolean;
}

export function canOpenInAppPlayer(): boolean {
  return typeof window !== 'undefined' && (!!window.electron?.openPlayerWindow || !!window.anixApi);
}

export function openInAppPlayer(params: WatchLaunchParams): Promise<void> {
  const payload = {
    releaseId: String(params.releaseId),
    sourceId: String(params.sourceId),
    ep: String(params.ep),
    title: params.title,
    sourceName: params.sourceName,
    ...(params.dubberId != null && params.dubberId !== '' ? { dubberId: String(params.dubberId) } : {}),
  };

  if (window.electron?.openPlayerWindow) {
    return window.electron.openPlayerWindow({
      ...payload,
      ...(params.lobbyIdle ? { lobbyIdle: true } : {}),
    }).then(() => {
      isPlayerWindowOpen.set(true);
    });
  }

  const alreadyWatching = isEmbeddedWebPlayer();
  const qs = new URLSearchParams({
    ...payload,
    ...(params.lobbyIdle ? { lobbyIdle: '1' } : {}),
  });
  navigate(`/watch?${qs.toString()}`);
  if (alreadyWatching && !params.lobbyIdle) {
    window.dispatchEvent(new CustomEvent('player:changeContent', { detail: payload }));
  }
  return Promise.resolve();
}

export function isEmbeddedWebPlayer(): boolean {
  return typeof window !== 'undefined' && !window.electron && getPathIsWatch();
}

function getPathIsWatch(): boolean {
  try {
    const hash = window.location.hash || '';
    if (hash.startsWith('#/watch')) return true;
    return window.location.pathname === '/watch' || window.location.pathname.endsWith('/watch');
  } catch {
    return false;
  }
}
