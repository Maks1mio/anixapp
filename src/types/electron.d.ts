export interface ElectronWindowAPI {
  minimize: () => void;
  maximize: () => void;
  close: () => void;
}

export type LobbyWaitingOverlayPayload =
  | null
  | {
      mode: 'peer' | 'localBuffering' | 'selfJoin';
      login?: string;
      avatar?: string | null;
      peerId?: string | null;
    };

export interface LobbyPlaybackPayload {
  releaseId: string;
  sourceId: string;
  ep: string;
  dubberId?: string;
  title: string;
  sourceName: string;
  paused: boolean;
  currentTime: number;
}

export interface AppUpdateProgress {
  state: 'idle' | 'downloading' | 'ready' | 'error';
  percent: number;
  received: number;
  total: number;
  filePath?: string;
  errorMessage?: string;
  /** Тип установки на Linux: 'appimage' | 'pacman' | 'deb' | 'flatpak' | null */
  installType?: string | null;
}

declare global {
  interface Window {
    electron?: {
      getAppVersion: () => Promise<string>;
      getVersions: () => Promise<{
        app: string;
        electron: string;
        chrome: string;
        node: string;
        anixartjs: string;
      }>;
      window: ElectronWindowAPI;
      openPlayerWindow: (params: { releaseId: string; sourceId: string; ep: string; title: string; sourceName: string; dubberId?: string }) => Promise<void>;
      closePlayerWindow: () => void;
      togglePlayerFullScreen: () => Promise<boolean>;
      togglePlayerAlwaysOnTop: () => Promise<boolean>;
      isPlayerOpen: () => Promise<boolean>;
      openExternal: (url: string) => void;
      syncPlayerState: (playback: LobbyPlaybackPayload) => void;
      sendPlayerState: (playback: LobbyPlaybackPayload) => void;
      startUpdateDownload?: () => Promise<void>;
      installUpdate?: () => Promise<void>;
      getLinuxInstallType?: () => Promise<string | null>;
      getDeviceId: () => Promise<string>;
      getSettings?: () => Promise<{ minimizeToTray: boolean; adaptiveAcceleration?: boolean; upscaleEnabled?: boolean; upscaleMode?: number; playerDebugOverlay?: boolean }>;
      saveSettings?: (settings: { minimizeToTray?: boolean; adaptiveAcceleration?: boolean; upscaleEnabled?: boolean; upscaleMode?: number; playerDebugOverlay?: boolean }) => Promise<void>;
      sendUpscaleSettings?: (settings: { upscaleEnabled: boolean; upscaleMode: number }) => void;
      // Lobby proposal IPC
      sendProposalToPlayer?: (data: Record<string, unknown>) => void;
      sendLobbyVote?: (proposalId: string, accept: boolean) => void;
      // Lobby participant & activity feed → player window
      sendActivityToPlayer?: (data: Record<string, unknown>) => void;
      sendParticipantsToPlayer?: (participants: unknown[]) => void;
      /** Окно плеера → главное: началась смена качества/озвучки в лобби */
      lobbyNotifyBufferingStart?: () => void;
      /** Окно плеера → главное: плеер готов после sync (sync_ready на сервер) */
      lobbyPlayerSynced?: () => void;
      /** Главное → плеер: оверлей «ожидаем пользователя» */
      sendLobbyWaitingOverlayToPlayer?: (payload: LobbyWaitingOverlayPayload | null) => void;
      // Discord Rich Presence
      discordUpdate?: (data: DiscordUpdatePayload) => void;
      // Theme editor
      openThemeEditor?: (opts: { themeId?: string; isNew?: boolean }) => Promise<void>;
      themeEditorSaved?: (themeId: string) => void;
      themeEditorLiveUpdate?: (vars: Record<string, string>) => void;
      themeEditorDeleted?: (themeId: string) => void;
    };
  }
}

export interface DiscordUpdatePayload {
  type: 'watching' | 'browsing' | 'release' | 'page' | 'profile' | 'partyInfo' | 'posterUrl';
  // watching
  title?: string;
  ep?: string;
  sourceName?: string;
  dubberName?: string;
  paused?: boolean;
  currentTime?: number;
  duration?: number;
  // release / watching
  posterUrl?: string;
  // partyInfo
  partyId?: string | null;
  partySize?: number;
  partyMax?: number;
  joinSecret?: string;
  // page
  details?: string;
  state?: string;
  // profile
  username?: string;
  avatarUrl?: string;
  isSelf?: boolean;
}

export {};
