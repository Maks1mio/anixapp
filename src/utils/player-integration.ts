/**
 * Клиентская обёртка над Electron player-integration:
 * список установленных плееров (VLC, mpv, PotPlayer, …) и предпочтение пользователя.
 */

export type ExternalPlayerId = 'vlc' | 'mpv' | 'potplayer' | 'iina' | 'quicktime';

export interface ExternalPlayerOption {
  id: ExternalPlayerId;
  label: string;
  description: string;
  installed: boolean;
  path?: string | null;
  /** Плейлист серий (false — только текущая серия). */
  playlist: boolean;
  downloadUrl: string | null;
  note: string | null;
}

/**
 * Собирать ли плейлист серий для плеера — признак playlist из адаптера
 * (QuickTime открывает только одну серию). Плеер выбирается как в main:
 * указанный, если установлен, иначе первый установленный.
 */
export async function externalPlayerUsesPlaylist(id: string | null | undefined): Promise<boolean> {
  try {
    const { installed } = await listExternalPlayers();
    const player = installed.find((p) => p.id === id) ?? installed[0];
    return player ? player.playlist : true;
  } catch {
    return true;
  }
}

const PREF_KEY = 'anix:externalPlayerId';

/** Сохранённый выбор не сверяем со списком: если плеера нет, main возьмёт первый установленный. */
export function getPreferredExternalPlayerId(): ExternalPlayerId | null {
  try {
    const v = localStorage.getItem(PREF_KEY);
    if (v) return v as ExternalPlayerId;
  } catch { /* ignore */ }
  return null;
}

export function setPreferredExternalPlayerId(id: ExternalPlayerId | null): void {
  try {
    if (!id) localStorage.removeItem(PREF_KEY);
    else localStorage.setItem(PREF_KEY, id);
  } catch { /* ignore */ }
}

export async function listExternalPlayers(opts?: { fresh?: boolean }): Promise<{
  players: ExternalPlayerOption[];
  installed: ExternalPlayerOption[];
}> {
  const api = window.electron?.listExternalPlayers;
  if (!api) {
    return { players: [], installed: [] };
  }
  const res = await api(opts?.fresh ? { fresh: true } : undefined);
  const players = (res?.players || []).map((p) => ({
    id: p.id as ExternalPlayerId,
    label: p.label,
    description: p.description,
    installed: !!p.installed,
    path: p.path ?? null,
    playlist: p.playlist !== false,
    downloadUrl: p.downloadUrl ?? null,
    note: p.note ?? null,
  }));
  return {
    players,
    installed: players.filter((p) => p.installed),
  };
}
