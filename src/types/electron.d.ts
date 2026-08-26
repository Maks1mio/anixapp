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
      consumePendingDeepLink?: () => { type?: string; id?: number; url?: string; title?: string; referer?: string; pageUrl?: string; cookies?: string } | null;
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
      openPlayerWindow: (params: { releaseId: string; sourceId: string; ep: string; title: string; sourceName: string; dubberId?: string; localFile?: string; externalUrl?: string; referer?: string; pageUrl?: string; cookies?: string; lobbyIdle?: boolean; currentTime?: number; paused?: boolean; applyRoomPlayback?: boolean }) => Promise<void>;
      closePlayerWindow: () => void;
      togglePlayerFullScreen: () => Promise<boolean>;
      togglePlayerAlwaysOnTop: () => Promise<boolean>;
      isPlayerOpen: () => Promise<boolean>;
      openExternal: (url: string) => void;
      setExtraVideoHosts?: (hosts: string[]) => Promise<string[]>;
      addExtraVideoHosts?: (hosts: string[]) => Promise<string[]>;
      /** JSON с Anixart CDN (Lottie-бейджи) через main — без fetch(anix-cdn://) */
      fetchCdnJson?: (url: string) => Promise<unknown | null>;
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
          releaseId?: number;
          sourceId?: number;
          dubberId?: number;
          episodePosition?: number;
          releaseTitle?: string;
          dubberName?: string;
          sourceName?: string;
          skip?: {
            opening?: { start: number; end: number } | null;
            ending?: { start: number; end: number } | null;
          } | null;
        }>;
      }) => Promise<{
        ok: boolean;
        error?: string;
        items: Array<{ id: string; filename: string }>;
      }>;
      getDownloadSettings?: () => Promise<{
        directory: string;
        defaultDirectory: string;
        organizeByTitle: boolean;
        allAtOnce: boolean;
        autoClearFinished: boolean;
      }>;
      saveDownloadSettings?: (payload: {
        organizeByTitle?: boolean;
        allAtOnce?: boolean;
        autoClearFinished?: boolean;
      }) => Promise<{
        ok: boolean;
        directory?: string;
        defaultDirectory?: string;
        organizeByTitle?: boolean;
        allAtOnce?: boolean;
        autoClearFinished?: boolean;
      }>;
      resetDownloadDirectory?: () => Promise<{
        ok: boolean;
        directory?: string;
        defaultDirectory?: string;
        organizeByTitle?: boolean;
        allAtOnce?: boolean;
        autoClearFinished?: boolean;
      }>;
      getFfmpegStatus?: () => Promise<{
        available: boolean;
        path: string | null;
        source: string;
        installDir?: string;
        downloadPage?: string;
      }>;
      installFfmpeg?: () => Promise<{
        ok: boolean;
        path?: string;
        source?: string;
        openedPage?: boolean;
        error?: string;
      }>;
      openFfmpegPage?: () => Promise<{ ok: boolean }>;
      pickDownloadDirectory?: () => Promise<{ ok: boolean; directory?: string }>;
      openDownloadDirectory?: (dir?: string) => Promise<void>;
      showDownloadFile?: (filePath: string) => void;
      openDownloadFile?: (filePath: string) => void;
      listDownloadLibrary?: () => Promise<Array<{
        id: string;
        name: string;
        releaseId?: number | null;
        sourceId?: number | null;
        dubberId?: number | null;
        releaseTitle?: string;
        dubberName?: string;
        sourceName?: string;
        files: Array<{
          name: string;
          path: string;
          size: number;
          modifiedAt: number;
          episodePosition?: number | null;
          dubberName?: string;
          sourceName?: string;
          dubberId?: number | null;
          sourceId?: number | null;
        }>;
      }>>;
      listDownloadsByRelease?: (releaseId: number) => Promise<Array<{
        episodePosition: number | null;
        path: string;
        name: string;
        size: number;
        dubberName: string;
        sourceName: string;
        dubberId?: number | null;
        sourceId?: number | null;
        folder: string;
      }>>;
      readDownloadSkipMarks?: (filePath: string) => Promise<{
        opening?: { start: number; end: number } | null;
        ending?: { start: number; end: number } | null;
      } | null>;
      saveDownloadSkipMarks?: (payload: {
        filePath: string;
        skip: {
          opening?: { start: number; end: number } | null;
          ending?: { start: number; end: number } | null;
        } | null;
      }) => Promise<{ ok: boolean }>;
      deleteDownloadFile?: (filePath: string) => Promise<{ ok: boolean; error?: string }>;
      deleteDownloadGroup?: (groupName: string) => Promise<{ ok: boolean; error?: string }>;
      pauseDownload?: (id: string) => Promise<{ ok: boolean }>;
      pauseAllDownloads?: () => Promise<{ ok: boolean; paused?: number }>;
      resumeDownload?: (id: string) => Promise<{ ok: boolean; error?: string }>;
      resumeAllDownloads?: () => Promise<{ ok: boolean; resumed?: number; error?: string }>;
      isDownloadResumeBlocked?: () => Promise<{ blocked: boolean }>;
      setDownloadStreamingHold?: (blocked: boolean) => Promise<{ ok: boolean; blocked: boolean }>;
      reorderDownloads?: (payload: { orderedIds: string[] }) => Promise<{ ok: boolean }>;
      checkDownloadFiles?: (payload: {
        items: Array<{ folder?: string; filename: string }>;
      }) => Promise<Array<{ folder?: string; filename: string; exists: boolean; path: string | null }>>;
      cancelDownload?: (id: string) => Promise<{ ok: boolean }>;
      cancelAllDownloads?: () => Promise<{ ok: boolean; cancelled?: number }>;
      getActiveDownloadQueue?: () => Promise<Array<{
        id: string;
        filename: string;
        received: number;
        total: number;
        status: string;
        error?: string;
        filePath?: string;
        releaseId?: number;
        sourceId?: number;
        dubberId?: number;
        episodePosition?: number;
        releaseTitle?: string;
        folder?: string;
        dubberName?: string;
        sourceName?: string;
      }>>;
      removeDownloadEntry?: (id: string) => Promise<{ ok: boolean }>;
      playDownloadInApp?: (payload: {
        filePath: string;
        title?: string;
        releaseId?: number;
        sourceId?: number;
        dubberId?: number;
        episodePosition?: number;
        sourceName?: string;
        dubberName?: string;
        allowPartial?: boolean;
        status?: string;
      }) => Promise<{ ok: boolean; error?: string }>;
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
      sendUpscaleSettings?: (settings: {
        upscaleEnabled: boolean;
        upscaleMode: number;
        upscaleType?: string;
        upscaleIntensity?: string;
        upscaleTargetRes?: string;
      }) => void;
      sendPlayerHotkeys?: (hotkeys: PlayerHotkeysSettings) => void;
      // Lobby proposal IPC
      sendProposalToPlayer?: (data: Record<string, unknown>) => void;
      sendLobbyVote?: (proposalId: string, accept: boolean) => void;
      // Lobby participant & activity feed → player window
      sendActivityToPlayer?: (data: Record<string, unknown>) => void;
      sendParticipantsToPlayer?: (participants: unknown[]) => void;
      sendLobbySessionToPlayer?: (session: {
        inLobby: boolean;
        roomId: string | null;
        roomCode: string | null;
        participants: unknown[];
      }) => void;
      sendLobbyChatToPlayer?: (msg: Record<string, unknown>) => void;
      sendLobbyChooserErrorToPlayer?: (msg: string) => void;
      lobbyCreateFromPlayer?: (playback?: Record<string, unknown> | null) => void;
      lobbyJoinFromPlayer?: (code: string) => void;
      lobbyLeaveFromPlayer?: () => void;
      lobbyChatFromPlayer?: (text: string) => void;
      lobbyRequestSession?: () => void;
      /** Окно плеера → главное: началась смена качества/озвучки в лобби */
      lobbyNotifyBufferingStart?: () => void;
      /** Окно плеера → главное: плеер готов после sync (sync_ready на сервер) */
      lobbyPlayerSynced?: (currentTime?: number) => void;
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
      openAdminPanelWindow?: () => Promise<void>;
      isAdminPanelWindow?: () => Promise<boolean>;
      // Logging (diagnostics)
      logRenderer?: (entry: { level?: string; ch?: string; msg?: string; data?: unknown }) => Promise<void>;
      logGetSessions?: () => Promise<Array<{ id: string; ts: string }>>;
      logGetSessionLog?: (sessionId: string, file: string, limit?: number) => Promise<Array<Record<string, unknown>>>;
      logGetSystemInfo?: () => Promise<Record<string, unknown>>;
      logCollectZip?: () => Promise<{ ok: boolean; path?: string; error?: string }>;
      logOpenZip?: (path: string) => Promise<void>;
      logOpenFolder?: () => Promise<void>;
      logGetFolderPath?: () => Promise<string | null>;
      logGetSessionDir?: () => Promise<string | null>;
      logGetLobbyPath?: () => Promise<string | null>;
      logLobbyLine?: (line: string) => Promise<void>;
      sendLobbyActionLogToPlayer?: (entry: Record<string, unknown>) => void;
    };
  }
}

export interface PlayerHotkeysSettings {
  seekBackCode?: string;
  seekForwardCode?: string;
  playPauseCode?: string;
  volumeUpCode?: string;
  volumeDownCode?: string;
  fullscreenCode?: string;
  alwaysOnTopCode?: string;
  seekSeconds?: number;
  ctrlWheelSpeed?: boolean;
}

export interface AppSettings {
  minimizeToTray: boolean;
  adaptiveAcceleration?: boolean;
  upscaleEnabled?: boolean;
  upscaleMode?: number;
  upscaleType?: string;
  upscaleIntensity?: string;
  upscaleTargetRes?: string;
  /** Виртуальный объёмный звук / EQ */
  audioSurround?: string;
  /** Полосы графического эквалайзера (дБ) */
  audioEqGains?: Record<string, number>;
  audioEqLevel?: number;
  playerDebugOverlay?: boolean;
  /** Cap stream quality by player window size (default off). */
  adaptiveQualityByWindow?: boolean;
  playerHotkeys?: PlayerHotkeysSettings;
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
