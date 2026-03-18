export interface ElectronWindowAPI {
  minimize: () => void;
  maximize: () => void;
  close: () => void;
}

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
      openExternal: (url: string) => void;
      syncPlayerState: (playback: LobbyPlaybackPayload) => void;
      sendPlayerState: (playback: LobbyPlaybackPayload) => void;
      startUpdateDownload?: () => Promise<void>;
      installUpdate?: () => Promise<void>;
      getDeviceId: () => Promise<string>;
      getSettings?: () => Promise<{ minimizeToTray: boolean; adaptiveAcceleration?: boolean }>;
      saveSettings?: (settings: { minimizeToTray?: boolean; adaptiveAcceleration?: boolean }) => Promise<void>;
      // Lobby proposal IPC
      sendProposalToPlayer?: (data: Record<string, unknown>) => void;
      sendLobbyVote?: (proposalId: string, accept: boolean) => void;
      // Lobby participant & activity feed → player window
      sendActivityToPlayer?: (data: Record<string, unknown>) => void;
      sendParticipantsToPlayer?: (participants: unknown[]) => void;
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
