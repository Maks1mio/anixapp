/**
 * Клиентская обёртка над Electron player-integration:
 * список установленных плееров (VLC, mpv, PotPlayer, …) и предпочтение пользователя.
 */

export type ExternalPlayerId = 'vlc' | 'mpv' | 'potplayer';

export interface ExternalPlayerOption {
  id: ExternalPlayerId;
  label: string;
  description: string;
  installed: boolean;
  path?: string | null;
}

const PREF_KEY = 'anix:externalPlayerId';
const KNOWN_IDS: ExternalPlayerId[] = ['vlc', 'mpv', 'potplayer'];

export function getPreferredExternalPlayerId(): ExternalPlayerId | null {
  try {
    const v = localStorage.getItem(PREF_KEY);
    if (KNOWN_IDS.includes(v as ExternalPlayerId)) return v as ExternalPlayerId;
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
  }));
  return {
    players,
    installed: players.filter((p) => p.installed),
  };
}
