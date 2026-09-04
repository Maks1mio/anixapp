/**
 * Минимальные stubs: старый lobby WS заменён на Fluo.
 * sendPlayerViewActive оставлен для Discord/viewer UI без серверного эффекта.
 */

export function sendPlayerViewActive(_active: boolean): void {
  /* Fluo: viewer_state опционален; no-op */
}

export function isConnected(): boolean {
  return false;
}

export type LobbyCommandAction = 'play' | 'pause' | 'seek' | 'changeEpisode';
