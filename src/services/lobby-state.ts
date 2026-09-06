/**
 * Совместимый фасад комнаты: старые импорты lobby-state → Fluo sync.
 */

import {
  getFluoRoomId,
  getFluoRoomCode,
  getFluoParticipants,
  getFluoMyPeerId,
  getFluoHostPeerId,
  getLastFluoPlayback,
  leaveFluo,
  setFluoRoom,
  sendFluoChat,
  proposeFluoAnimeChange,
  voteFluoProposal,
  sendFluoSyncReady,
  notifyFluoLocalBuffering,
  isFluoBarrier,
  pushFluoCommand,
  sendFluoPreviewFrame,
  catchUpFluoPlayback,
  computeFluoPosition,
  kickFluoParticipant,
  transferFluoHost,
  getFluoRoomSettings,
  isFluoChatEnabled,
  canLocalFluoCommand,
  type FluoProfilePayload,
} from '../fluo/sync';
import type { FluoContent, FluoParticipant, FluoClockState, FluoRoomSettings } from '../fluo/types';

export type LobbyCommandAction = 'play' | 'pause' | 'seek' | 'changeEpisode';

export type LobbyPlayback = FluoContent & {
  paused: boolean;
  currentTime: number;
  duration?: number;
  seq?: number;
};

export type LobbyParticipant = FluoParticipant;

export function getCurrentRoomId(): string | null {
  return getFluoRoomId();
}

export function getCurrentRoomCode(): string | null {
  return getFluoRoomCode();
}

export function getCurrentParticipants(): LobbyParticipant[] {
  return getFluoParticipants();
}

export function getLobbyMyPeerId(): string | null {
  return getFluoMyPeerId();
}

export function getLobbyHostPeerId(): string | null {
  return getFluoHostPeerId();
}

export function kickLobbyParticipant(targetPeerId: string): void {
  kickFluoParticipant(targetPeerId);
}

export function transferLobbyHost(targetPeerId: string): void {
  transferFluoHost(targetPeerId);
}

export function getLastPlayback(): LobbyPlayback | null {
  const p = getLastFluoPlayback();
  return p ? { ...p } : null;
}

export function setLobbyParticipants(list: LobbyParticipant[]): void {
  window.dispatchEvent(new CustomEvent('lobby:participantsChanged', { detail: { participants: list } }));
}

export function setLobbyRoom(
  id: string | null,
  options?: {
    myPeerId?: string;
    participants?: LobbyParticipant[];
    playback?: LobbyPlayback | null;
    /** Настоящие серверные часы (t0 + mediaOrigin) — обязательно при join. */
    clock?: FluoClockState | null;
    roomCode?: string;
    isCreator?: boolean;
    hostPeerId?: string | null;
    settings?: import('../fluo/types').FluoRoomSettings | null;
  },
): void {
  let clock: FluoClockState | null = options?.clock ?? null;
  // Не подменять серверный clock фейковым t0=Date.now() — иначе новичок не догонит.
  if (!clock && options?.playback && options.playback.releaseId) {
    clock = {
      content: {
        releaseId: String(options.playback.releaseId),
        sourceId: String(options.playback.sourceId ?? ''),
        ep: String(options.playback.ep ?? ''),
        dubberId: options.playback.dubberId != null ? String(options.playback.dubberId) : undefined,
        title: String(options.playback.title ?? ''),
        sourceName: String(options.playback.sourceName ?? ''),
        posterUrl: options.playback.posterUrl,
      },
      paused: options.playback.paused !== false,
      mediaOrigin: typeof options.playback.currentTime === 'number' ? options.playback.currentTime : 0,
      t0: Date.now(),
      rate: 1,
      seq: 1,
    };
  }
  setFluoRoom(id, {
    myPeerId: options?.myPeerId,
    participants: options?.participants,
    roomCode: options?.roomCode,
    clock,
    hostPeerId: options?.hostPeerId ?? (options?.isCreator ? options?.myPeerId : null),
    isCreator: options?.isCreator,
    settings: options?.settings ?? undefined,
  });
}

export function leaveLobby(): void {
  leaveFluo();
}

export function pushCommand(action: LobbyCommandAction, playback: LobbyPlayback): void {
  pushFluoCommand(action, playback);
}

export function pushLobbyPreview(dataUrl: string, duration?: number): void {
  sendFluoPreviewFrame(dataUrl, duration);
}

export function proposeAnimeChange(playback: Partial<LobbyPlayback>): void {
  proposeFluoAnimeChange(playback);
}

export function voteOnProposal(proposalId: string, accept: boolean): void {
  voteFluoProposal(proposalId, accept);
}

export function sendLobbyChat(payload: { text: string; login?: string; avatar?: string | null }): void {
  sendFluoChat(payload);
}

export function notifyLobbyBufferingStart(): void {
  notifyFluoLocalBuffering(true);
}

export function notifyLobbyBufferingEnd(): void {
  notifyFluoLocalBuffering(false);
}

export function isLobbyAwaitingPlayerSync(): boolean {
  return isFluoBarrier();
}

export function isLobbySyncBlocked(): boolean {
  return isFluoBarrier();
}

export function pushLobbySyncStateToPlayer(): void {
  const state = { blocked: isFluoBarrier(), awaiting: isFluoBarrier() };
  window.dispatchEvent(new CustomEvent('lobby:syncState', { detail: state }));
  try {
    (window as { electron?: { sendLobbySyncStateToPlayer?: (s: { blocked: boolean; awaiting: boolean }) => void } })
      .electron?.sendLobbySyncStateToPlayer?.(state);
  } catch {
    /* ignore */
  }
}

export function notifyFluoPlayerSynced(currentTime?: number): void {
  sendFluoSyncReady(currentTime);
  window.dispatchEvent(new CustomEvent('lobby:playerSynced', { detail: { currentTime } }));
}

export function catchUpLobbyPlayback(): void {
  catchUpFluoPlayback(true);
}

export { computeFluoPosition };

export function getPendingProposalId(): string | null {
  return null;
}

export function getLobbyLog(): unknown[] {
  return [];
}

export type { FluoProfilePayload, FluoClockState, FluoRoomSettings };

export function getLobbyRoomSettings(): FluoRoomSettings {
  return getFluoRoomSettings();
}

export function isLobbyChatEnabled(): boolean {
  return isFluoChatEnabled();
}

export function canLobbyLocalCommand(
  action: 'play' | 'pause' | 'seek' | 'changeEpisode',
  playback?: { releaseId?: string } | null,
): boolean {
  return canLocalFluoCommand(action, playback);
}
