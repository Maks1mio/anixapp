import { get, writable } from 'svelte/store';

export interface LobbyCurrentPlayback {
  releaseId: string;
  sourceId: string;
  ep: string;
  dubberId?: string;
  title: string;
  sourceName: string;
  paused: boolean;
  currentTime: number;
}

/** Текущий playback активного лобби (null = нет лобби или нет playback). */
export const lobbyCurrentPlayback = writable<LobbyCurrentPlayback | null>(null);

/** true = окно плеера сейчас открыто. */
export const isPlayerWindowOpen = writable(false);

/** peerId участников с открытым отдельным окном плеера (с сервера по WS). */
export const lobbyWatchingPeerIds = writable<string[]>([]);

export const settingsModalOpen = writable(false);
export const settingsModalInitialTab = writable<string | null>(null);
export const lobbyModalOpen = writable(false);
export const lobbyModalInitialCode = writable<string | null>(null);
export const notificationsModalOpen = writable(false);
export const watchModalOpen = writable(false);
export const watchModalReleaseId = writable<number>(0);
export const watchModalReleaseTitle = writable<string>('');

export interface WatchModalCachedState {
  releaseId: number;
  modalView: 'variants' | 'episodes' | 'updates';
  variantFilter: 'all' | 'voice' | 'sub';
  selectedDubberId: number | null;
  selectedSourceId: number | null;
  searchInput: string;
  selectedEpisodePos: number | null;
}

const watchModalStateCache = new Map<number, WatchModalCachedState>();
export const settingsModalLastTab = writable<string | null>(null);

export function openSettingsModal(tab?: string): void {
  const cached = get(settingsModalLastTab);
  settingsModalInitialTab.set(tab ?? cached ?? null);
  settingsModalOpen.set(true);
}
export function closeSettingsModal(): void {
  settingsModalOpen.set(false);
  settingsModalInitialTab.set(null);
}

export function saveWatchModalState(state: WatchModalCachedState): void {
  watchModalStateCache.set(state.releaseId, state);
}

export function getWatchModalState(releaseId: number): WatchModalCachedState | null {
  return watchModalStateCache.get(releaseId) ?? null;
}

export function clearWatchModalState(releaseId?: number): void {
  if (releaseId != null) watchModalStateCache.delete(releaseId);
  else watchModalStateCache.clear();
}

export function openLobbyModal(roomCode?: string): void {
  lobbyModalInitialCode.set(roomCode ?? null);
  lobbyModalOpen.set(true);
}
export function closeLobbyModal(): void {
  lobbyModalOpen.set(false);
  lobbyModalInitialCode.set(null);
}

export function openNotificationsModal(): void {
  notificationsModalOpen.set(true);
}
export function closeNotificationsModal(): void {
  notificationsModalOpen.set(false);
}

export function openWatchModal(releaseId: number, releaseTitle: string): void {
  watchModalReleaseId.set(releaseId);
  watchModalReleaseTitle.set(releaseTitle);
  watchModalOpen.set(true);
}
export function closeWatchModal(): void {
  watchModalOpen.set(false);
}

export const profileModalOpen = writable(false);
export const profileModalUserId = writable<number | null>(null);

export function openProfileModal(userId?: number): void {
  const id = userId ?? Number((window as { __anixProfile?: { id?: number } }).__anixProfile?.id ?? 0);
  if (!id) return;
  profileModalUserId.set(id);
  profileModalOpen.set(true);
}

export function closeProfileModal(): void {
  profileModalOpen.set(false);
  profileModalUserId.set(null);
}
