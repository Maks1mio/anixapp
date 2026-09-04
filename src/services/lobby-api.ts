/**
 * Типы комнаты — совместимость; реализация в Fluo.
 */

export type {
  LobbyPlayback,
  LobbyParticipant,
} from './lobby-state';

export { isUsableFluoContent as isUsablePlayback } from '../fluo/types';

export interface LobbyRoom {
  roomId: string;
  code: string;
  myPeerId?: string;
  participants: import('./lobby-state').LobbyParticipant[];
  playback?: import('./lobby-state').LobbyPlayback | null;
}

/** @deprecated Fluo HTTP — см. fluo/sync */
export async function createRoom(): Promise<never> {
  throw new Error('Use createFluoRoom / createLobbyRoomAndOpenPlayer');
}

export async function joinRoom(): Promise<never> {
  throw new Error('Use joinFluoRoom / joinLobbyRoomAndOpenPlayer');
}

export async function getRoom(): Promise<never> {
  throw new Error('Deprecated lobby HTTP removed');
}

export async function updatePlayback(): Promise<void> {}
export async function postSignal(): Promise<void> {}
export async function getSignals(): Promise<Array<{ fromPeerId: string; type: string; payload: string }>> {
  return [];
}
export async function leaveRoom(): Promise<void> {}
