import { writable } from 'svelte/store';

/** Статус сети/API для баннера в titlebar */
export type ConnectionKind = 'ok' | 'checking' | 'server' | 'net';

export const connectionKind = writable<ConnectionKind>('checking');

export function connectionKindFromOnline(): ConnectionKind {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'net';
  return 'server';
}

export function setConnectionOk() {
  connectionKind.set('ok');
}

export function setConnectionProblem() {
  connectionKind.set(connectionKindFromOnline());
}

export function setConnectionChecking() {
  connectionKind.set('checking');
}
