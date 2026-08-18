/**
 * Журнал совместного просмотра: локальные действия, сервер и другие участники.
 */

export type LobbyActionOrigin = 'local' | 'peer' | 'server' | 'system';

export type LobbyActionPlaybackSnap = {
  releaseId?: string;
  sourceId?: string;
  ep?: string;
  paused?: boolean;
  t?: number;
  title?: string;
  sourceName?: string;
  dubberId?: string;
};

export type LobbyActionEntry = {
  id: string;
  ts: number;
  origin: LobbyActionOrigin;
  action: string;
  actor?: { login?: string; peerId?: string | null };
  playback?: LobbyActionPlaybackSnap;
  via?: 'ws' | 'p2p' | 'ipc' | 'http' | 'player';
  detail?: Record<string, unknown>;
  note?: string;
};

export type LobbyActionInput = Omit<LobbyActionEntry, 'id' | 'ts'> & {
  ts?: number;
  id?: string;
};

const MAX_ENTRIES = 800;
const entries: LobbyActionEntry[] = [];
const listeners = new Set<(list: LobbyActionEntry[]) => void>();
const seenIds = new Set<string>();
let seq = 0;

function notify(): void {
  const snapshot = entries.slice();
  listeners.forEach((fn) => {
    try { fn(snapshot); } catch { /* ignore */ }
  });
}

function roundTime(t: unknown): number | undefined {
  if (typeof t !== 'number' || !Number.isFinite(t)) return undefined;
  return Math.round(t * 10) / 10;
}

export function snapshotPlayback(p?: {
  releaseId?: string;
  sourceId?: string;
  ep?: string | number;
  paused?: boolean;
  currentTime?: number;
  title?: string;
  sourceName?: string;
  dubberId?: string;
} | null): LobbyActionPlaybackSnap | undefined {
  if (!p) return undefined;
  const snap: LobbyActionPlaybackSnap = {};
  if (p.releaseId != null && p.releaseId !== '') snap.releaseId = String(p.releaseId);
  if (p.sourceId != null && p.sourceId !== '') snap.sourceId = String(p.sourceId);
  if (p.ep != null && p.ep !== '') snap.ep = String(p.ep);
  if (typeof p.paused === 'boolean') snap.paused = p.paused;
  const t = roundTime(p.currentTime);
  if (t !== undefined) snap.t = t;
  if (p.title) snap.title = p.title;
  if (p.sourceName) snap.sourceName = p.sourceName;
  if (p.dubberId) snap.dubberId = String(p.dubberId);
  return Object.keys(snap).length ? snap : undefined;
}

function append(entry: LobbyActionEntry): boolean {
  if (seenIds.has(entry.id)) return false;
  seenIds.add(entry.id);
  entries.push(entry);
  if (entries.length > MAX_ENTRIES) {
    const removed = entries.splice(0, entries.length - MAX_ENTRIES);
    for (const r of removed) seenIds.delete(r.id);
  }
  notify();
  return true;
}

function actionLabel(action: string): string {
  const map: Record<string, string> = {
    'player.play': '▶ play',
    'player.pause': '⏸ pause',
    'player.seek': '⏩ seek',
    'player.changeEpisode': '⏭ серия',
    'player.quality': '⚙ качество',
    'player.applySync': '↻ sync в плеере',
    'player.applySync.ignored': '↻ sync пропущен',
    'player.sync_ready': '✓ готов',
    'sync.play': '→ sync play',
    'sync.pause': '→ sync pause',
    'sync.seek': '→ sync seek',
    'sync.changeEpisode': '→ sync серия',
    'sync.buffering_start': '⏳ буферизация',
    'room.join': 'вход в комнату',
    'room.leave': 'выход',
    'chat.send': '💬 чат',
    'vote.accept': '✓ голос за',
    'vote.reject': '✗ голос против',
    'ws.open': 'WS подключён',
    'ws.close': 'WS закрыт',
    'ws.joined': 'WS joined',
    'ws.sync_pause': '⏸ сервер: пауза всех',
    'ws.sync_resume': '▶ сервер: продолжить',
    'ws.participant_joined': '+ участник',
    'ws.participant_left': '− участник',
    'ws.send.sync_ready': '→ sync_ready',
    'ws.send.buffering_start': '→ buffering_start',
  };
  if (map[action]) return map[action];
  if (action.startsWith('sync.queued.')) return `⏳ в очереди: ${action.slice(12)}`;
  if (action.startsWith('p2p.')) return `P2P ${action.slice(4)}`;
  if (action.startsWith('apply.remote.')) return `← ${action.slice(13)}`;
  if (action.startsWith('ws.playback.')) return `← ${action.slice(12)}`;
  return action;
}

function playbackShort(pb?: LobbyActionPlaybackSnap): string {
  if (!pb) return '';
  const bits: string[] = [];
  if (pb.ep) bits.push(`ep ${pb.ep}`);
  if (pb.t != null) bits.push(`${pb.t}s`);
  if (typeof pb.paused === 'boolean') bits.push(pb.paused ? 'pause' : 'play');
  return bits.join(' · ');
}

export function originLabel(origin: LobbyActionOrigin, actor?: LobbyActionEntry['actor']): string {
  if (origin === 'local') return 'Вы';
  if (origin === 'server') return 'Сервер';
  if (origin === 'system') return 'Система';
  return actor?.login?.trim() || actor?.peerId || 'Участник';
}

/** Одна строка для UI и lobby.txt */
export function formatLobbyActionLine(e: LobbyActionEntry): string {
  const d = new Date(e.ts);
  const ts = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}.${String(d.getMilliseconds()).padStart(3, '0')}`;
  const who = originLabel(e.origin, e.actor);
  const label = actionLabel(e.action);
  const pb = playbackShort(e.playback);
  const extra = [pb, e.via ? `via ${e.via}` : '', e.note || ''].filter(Boolean).join(' · ');
  return extra
    ? `${ts} | ${who} | ${label} | ${extra}`
    : `${ts} | ${who} | ${label}`;
}

export function formatLobbyActionLogText(): string {
  return [
    'AnixApp — журнал совместного просмотра',
    `экспорт: ${new Date().toISOString()}`,
    `записей: ${entries.length}`,
    '---',
    ...entries.map(formatLobbyActionLine),
    '',
  ].join('\n');
}

function shouldSkipDuplicate(entry: LobbyActionEntry): boolean {
  const prev = entries[entries.length - 1];
  if (!prev) return false;
  if (prev.action !== entry.action) return false;
  if (prev.origin !== entry.origin) return false;
  const sameActor = (prev.actor?.peerId ?? '') === (entry.actor?.peerId ?? '');
  if (!sameActor) return false;
  const p1 = prev.playback;
  const p2 = entry.playback;
  if (!p1 && !p2) return entry.ts - prev.ts < 450;
  if (!p1 || !p2) return false;
  return (
    p1.ep === p2.ep
    && p1.paused === p2.paused
    && p1.t === p2.t
    && entry.ts - prev.ts < 450
  );
}

function persistLobbyLine(line: string): void {
  try {
    (window as any).electron?.logLobbyLine?.(line);
  } catch { /* ignore */ }
}

export function logLobbyAction(input: LobbyActionInput): LobbyActionEntry | null {
  seq += 1;
  const entry: LobbyActionEntry = {
    id: input.id ?? `la-${Date.now()}-${seq}-${Math.random().toString(36).slice(2, 7)}`,
    ts: input.ts ?? Date.now(),
    origin: input.origin,
    action: input.action,
    actor: input.actor,
    playback: input.playback,
    via: input.via,
    detail: input.detail,
    note: input.note,
  };
  if (shouldSkipDuplicate(entry)) return null;
  if (!append(entry)) return null;

  const line = formatLobbyActionLine(entry);
  persistLobbyLine(line);

  try {
    if (
      typeof window !== 'undefined'
      && window.electron?.sendLobbyActionLogToPlayer
      && !window.location.pathname.endsWith('player.html')
    ) {
      window.electron.sendLobbyActionLogToPlayer(entry);
    }
  } catch { /* ignore */ }

  return entry;
}

export function ingestLobbyActionLog(raw: unknown): void {
  const e = raw as LobbyActionEntry | null;
  if (!e || typeof e !== 'object' || !e.id || !e.action) return;
  append({
    id: String(e.id),
    ts: typeof e.ts === 'number' ? e.ts : Date.now(),
    origin: e.origin === 'peer' || e.origin === 'server' || e.origin === 'system' ? e.origin : 'local',
    action: String(e.action),
    actor: e.actor,
    playback: e.playback,
    via: e.via,
    detail: e.detail,
    note: e.note,
  });
}

export function subscribeLobbyActionLog(fn: (list: LobbyActionEntry[]) => void): () => void {
  listeners.add(fn);
  fn(entries.slice());
  return () => { listeners.delete(fn); };
}

export function getLobbyActionLog(): LobbyActionEntry[] {
  return entries.slice();
}

export async function downloadLobbyActionLog(): Promise<void> {
  const api = window.electron as { logGetLobbyPath?: () => Promise<string | null> } | undefined;
  const diskPath = await api?.logGetLobbyPath?.().catch(() => null);
  const text = diskPath
    ? `# Файл на диске: ${diskPath}\n\n${formatLobbyActionLogText()}`
    : formatLobbyActionLogText();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `anixapp-lobby-${stamp}.txt`;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export async function copyLobbyLogsFolderPath(): Promise<{ ok: boolean; path: string; copied: boolean }> {
  const api = window.electron as {
    logGetSessionDir?: () => Promise<string | null>;
    logGetLobbyPath?: () => Promise<string | null>;
    logGetFolderPath?: () => Promise<string | null>;
  } | undefined;

  const sessionDir = await api?.logGetSessionDir?.().catch(() => null);
  const lobbyFile = await api?.logGetLobbyPath?.().catch(() => null);
  const folder = sessionDir || lobbyFile || await api?.logGetFolderPath?.().catch(() => null);

  if (folder) {
    try {
      await navigator.clipboard.writeText(folder);
      return { ok: true, path: folder, copied: true };
    } catch {
      return { ok: true, path: folder, copied: false };
    }
  }
  const fallback = 'В браузере нет папки логов — нажмите «Скачать журнал».';
  try {
    await navigator.clipboard.writeText(fallback);
    return { ok: false, path: fallback, copied: true };
  } catch {
    return { ok: false, path: fallback, copied: false };
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('lobby:actionLogIngest', ((e: CustomEvent) => {
    ingestLobbyActionLog(e.detail);
  }) as EventListener);
}
