/** Журнал действий Fluo (совместим с lobby action log UI). */

export type FluoActionOrigin = 'local' | 'peer' | 'server' | 'system';

export type FluoActionEntry = {
  id: string;
  ts: number;
  origin: FluoActionOrigin;
  action: string;
  actor?: { login?: string; peerId?: string | null };
  detail?: Record<string, unknown>;
  note?: string;
  via?: string;
};

type Input = Omit<FluoActionEntry, 'id' | 'ts'> & { id?: string; ts?: number };

const MAX = 400;
const entries: FluoActionEntry[] = [];
let seq = 0;

export function logFluoAction(input: Input): void {
  const entry: FluoActionEntry = {
    id: input.id ?? `fluo-${Date.now()}-${++seq}`,
    ts: input.ts ?? Date.now(),
    origin: input.origin,
    action: input.action,
    actor: input.actor,
    detail: input.detail,
    note: input.note,
    via: input.via,
  };
  entries.push(entry);
  if (entries.length > MAX) entries.splice(0, entries.length - MAX);
  try {
    window.dispatchEvent(new CustomEvent('lobby:actionLogIngest', { detail: entry }));
  } catch {
    /* ignore */
  }
}

export function getFluoActionLog(): FluoActionEntry[] {
  return entries.slice();
}
