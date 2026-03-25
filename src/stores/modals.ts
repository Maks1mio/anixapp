import { writable } from 'svelte/store';

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

export function openSettingsModal(tab?: string): void {
  settingsModalInitialTab.set(tab ?? null);
  settingsModalOpen.set(true);
}
export function closeSettingsModal(): void {
  settingsModalOpen.set(false);
  settingsModalInitialTab.set(null);
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
