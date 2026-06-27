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
  state: 'idle' | 'downloading' | 'ready' | 'error' | 'installing' | 'install-error';
  percent: number;
  received: number;
  total: number;
  filePath?: string;
  errorMessage?: string;
  /** Тип установки на Linux: 'appimage' | 'pacman' | 'deb' | 'flatpak' | null */
  installType?: string | null;
}

export interface DevBridgeStatus {
  available: boolean;
  enabled: boolean;
  port: number;
  token: string | null;
  hasAuth: boolean;
  login: string | null;
  running: boolean;
  baseUrl: string;
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
        anixapi: string;
        /** @deprecated use anixapi */
        anixartjs: string;
      }>;
      window: ElectronWindowAPI;
      openPlayerWindow: (params: { releaseId: string; sourceId: string; ep: string; title: string; sourceName: string; dubberId?: string }) => Promise<void>;
      closePlayerWindow: () => void;
      togglePlayerFullScreen: () => Promise<boolean>;
      togglePlayerAlwaysOnTop: () => Promise<boolean>;
      isPlayerOpen: () => Promise<boolean>;
      openExternal: (url: string) => void;
      downloadEpisodes?: (payload: {
        title?: string;
        items: Array<{
          url: string;
          filename: string;
          headers?: Record<string, string>;
        }>;
      }) => Promise<{
        ok: boolean;
        cancelled?: boolean;
        downloaded: number;
        errors?: Array<{ filename?: string; error: string }>;
      }>;
      queueEpisodeDownloads?: (payload: {
        items: Array<{
          url: string;
          filename: string;
          folder?: string;
          headers?: Record<string, string>;
        }>;
      }) => Promise<{
        ok: boolean;
        error?: string;
        items: Array<{ id: string; filename: string }>;
      }>;
      getDownloadSettings?: () => Promise<{ directory: string; defaultDirectory: string }>;
      pickDownloadDirectory?: () => Promise<{ ok: boolean; directory?: string }>;
      openDownloadDirectory?: (dir?: string) => Promise<void>;
      showDownloadFile?: (filePath: string) => void;
      openDownloadFile?: (filePath: string) => void;
      listDownloadLibrary?: () => Promise<Array<{
        id: string;
        name: string;
        files: Array<{ name: string; path: string; size: number; modifiedAt: number }>;
      }>>;
      checkDownloadFiles?: (payload: {
        items: Array<{ folder?: string; filename: string }>;
      }) => Promise<Array<{ folder?: string; filename: string; exists: boolean; path: string | null }>>;
      syncPlayerState: (playback: LobbyPlaybackPayload) => void;
      sendPlayerState: (playback: LobbyPlaybackPayload) => void;
      startUpdateDownload?: () => Promise<void>;
      checkForUpdate?: (currentVersion: string) => Promise<{
        version: string;
        url: string;
        body: string | null;
      } | null>;
      installUpdate?: () => Promise<void>;
      getLinuxInstallType?: () => Promise<string | null>;
      getDeviceId: () => Promise<string>;
      adminGetSession?: () => Promise<{ token: string | null; userId: number | null }>;
      adminSaveSession?: (payload: { token: string; userId: number }) => Promise<boolean>;
      adminClearSession?: () => Promise<boolean>;
      getAnixbackEndpoint?: () => Promise<'local' | 'prod' | null>;
      setAnixbackEndpoint?: (mode: 'local' | 'prod') => Promise<boolean>;
      /** AnixBack proxy for geo-blocked release info (GET /api/anixart/release/:id). */
      fetchReleaseGeoBypass?: (releaseId: number) => Promise<unknown>;
      getSettings?: () => Promise<AppSettings>;
      saveSettings?: (settings: Partial<AppSettings>) => Promise<void>;
      /** Dev-only local HTTP bridge to Anixart API (see Settings → Разработчик). */
      getDevBridgeStatus?: () => Promise<DevBridgeStatus>;
      setDevBridgeEnabled?: (enabled: boolean) => Promise<DevBridgeStatus>;
      regenerateDevBridgeToken?: () => Promise<DevBridgeStatus>;
      resolveHeroBackdrop?: (hints: {
        titleOriginal?: string;
        titleRu?: string;
        titleAlt?: string;
        year?: string | number;
      }) => Promise<string | null>;
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
      // Upscale Preview Tool
      openUpscaleTool?: () => Promise<void>;
      saveToolScreenshot?: (dataUrl: string, filename: string) => Promise<void>;
      minimizeToolWindow?: () => void;
      toggleMaximizeToolWindow?: () => void;
      closeToolWindow?: () => void;
      onToolWindowState?: (cb: (state: { isMaximized: boolean }) => void) => void;
      // Overview video editor
      openOverviewVideoEditor?: (payload: Record<string, unknown>) => Promise<void>;
      getOverviewEditorPayload?: () => Promise<Record<string, unknown> | null>;
      overviewEditorDone?: () => void;
    };
  }
}

export interface AppSettings {
  minimizeToTray: boolean;
  adaptiveAcceleration?: boolean;
  upscaleEnabled?: boolean;
  upscaleMode?: number;
  playerDebugOverlay?: boolean;
  uiZoom?: number;
  discordRpcEnabled?: boolean;
  discordRpcShowBrowsing?: boolean;
  discordRpcShowWatching?: boolean;
  discordRpcShowProgress?: boolean;
  discordRpcShowDubber?: boolean;
  discordRpcShowImages?: boolean;
  discordRpcShowParty?: boolean;
  discordRpcPageHome?: boolean;
  discordRpcPageOverview?: boolean;
  discordRpcPagePopular?: boolean;
  discordRpcPageCollections?: boolean;
  discordRpcPageMyCollections?: boolean;
  discordRpcPageCollection?: boolean;
  discordRpcPageCollectionEdit?: boolean;
  discordRpcPageRelease?: boolean;
  discordRpcPageReleaseComments?: boolean;
  discordRpcPageReleaseRelated?: boolean;
  discordRpcPageProfile?: boolean;
  discordRpcPageProfileFriends?: boolean;
  discordRpcPageProfileVotes?: boolean;
  discordRpcPageBookmarks?: boolean;
  discordRpcPageSearch?: boolean;
  discordRpcPageDownloads?: boolean;
  discordRpcPageAnnouncement?: boolean;
  discordRpcPageOther?: boolean;
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
