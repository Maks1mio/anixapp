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
  /** Версия, которую качаем (если выбрана вручную). */
  targetVersion?: string | null;
}

export interface AppReleaseInfo {
  version: string;
  tag: string;
  name: string;
  publishedAt: string | null;
  prerelease: boolean;
  draft: boolean;
  url: string;
  hasAsset: boolean;
  isCurrent: boolean;
  isNewer: boolean;
  isOlder: boolean;
  channel?: 'stable' | 'beta';
  source?: 'github' | 'anixback';
  downloadUrl?: string | null;
  id?: string;
  /** Платформа, для которой искали ассет (Linux / Windows / macOS) */
  platformLabel?: string;
  /** Ожидаемые расширения ассета */
  assetLabel?: string;
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
      platform?: string;
      consumePendingDeepLink?: () => { type?: string; id?: number; url?: string; title?: string; referer?: string; pageUrl?: string; cookies?: string } | null;
      /** macOS: разделы для меню «Переход» в строке меню. */
      setAppMenuNav?: (items: { id: string; label: string }[]) => void;
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
      openPlayerWindow: (params: {
        releaseId: string;
        sourceId: string;
        ep: string;
        title: string;
        sourceName: string;
        dubberId?: string;
        dubberName?: string;
        localFile?: string;
        externalUrl?: string;
        referer?: string;
        pageUrl?: string;
        cookies?: string;
        lobbyIdle?: boolean;
        currentTime?: number;
        paused?: boolean;
        applyRoomPlayback?: boolean;
        /** Веб-плеер: открыть HTML-плеер источника (Kodik) в отдельном окне. */
        sourceWeb?: boolean;
        /** Опциональный hint URL; свежая ссылка всё равно берётся в main. */
        sourceEmbedUrl?: string;
      }) => Promise<void>;
      closePlayerWindow: () => void;
      togglePlayerFullScreen: () => Promise<boolean>;
      togglePlayerAlwaysOnTop: () => Promise<boolean>;
      setPlayerWindowTitle?: (payload: { title?: string; episode?: string }) => void;
      isPlayerOpen: () => Promise<boolean>;
      openExternal: (url: string) => void;
      /** Установленные/известные сторонние плееры (player-integration). */
      listExternalPlayers?: (opts?: { fresh?: boolean }) => Promise<{
        players: Array<{
          id: string;
          label: string;
          description: string;
          installed: boolean;
          path?: string | null;
        }>;
        installedCount: number;
      }>;
      openExternalPlayer?: (
        urlOrOpts: string | {
          url: string;
          headers?: Record<string, string>;
          title?: string;
          /** Плейлист серий для VLC/mpv (.m3u с #EXTINF). */
          playlist?: Array<{ url: string; title: string }>;
          startIndex?: number;
          /** Предпочтительный плеер из player-integration (`vlc` | `mpv` | …). */
          playerId?: string;
        },
        headers?: Record<string, string>,
      ) => Promise<{ ok: boolean; reason?: string; player?: string; playlist?: number }>;
      /** Warp OS mouse cursor (Windows). Screen coordinates. */
      setCursorScreenPos?: (x: number, y: number) => Promise<boolean>;
      startTvLanLogin?: () => Promise<{ url: string | null; error?: string }>;
      stopTvLanLogin?: () => Promise<boolean>;
      onTvLanCredentials?: (cb: (detail: { login: string; password: string }) => void) => () => void;
      setExtraVideoHosts?: (hosts: string[]) => Promise<string[]>;
      addExtraVideoHosts?: (hosts: string[]) => Promise<string[]>;
      /** JSON с Anixart CDN (Lottie-бейджи) через main — без fetch(anix-cdn://) */
      fetchCdnJson?: (url: string) => Promise<unknown | null>;
      fetchRemoteImage?: (url: string) => Promise<{ mimeType: string; data: Uint8Array } | null>;
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
      getFfmpegInstallState?: () => Promise<{
        busy: boolean;
        received: number;
        total: number;
      }>;
      installFfmpeg?: () => Promise<{
        ok: boolean;
        busy?: boolean;
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
      sendFluoPreview?: (payload: { dataUrl: string; duration?: number }) => void;
      startUpdateDownload?: (
        versionOrOpts?: string | { version?: string; downloadUrl?: string },
        downloadUrl?: string,
      ) => Promise<void>;
      checkForUpdate?: (
        currentVersion: string,
        force?: boolean,
      ) => Promise<{
        version: string;
        url: string;
        body: string | null;
      } | null>;
      listAppReleases?: (
        currentVersion?: string,
        channel?: 'stable' | 'beta',
        force?: boolean,
      ) => Promise<AppReleaseInfo[]>;
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
        hostPeerId?: string | null;
        myPeerId?: string | null;
      }) => void;
      sendLobbyChatToPlayer?: (msg: Record<string, unknown>) => void;
      sendLobbyChatHistoryToPlayer?: (messages: unknown[]) => void;
      sendLobbyChooserErrorToPlayer?: (msg: string) => void;
      lobbyCreateFromPlayer?: (payload?: {
        playback?: Record<string, unknown> | null;
        options?: Record<string, unknown>;
      } | Record<string, unknown> | null) => void;
      lobbyJoinFromPlayer?: (code: string) => void;
      lobbyLeaveFromPlayer?: () => void;
      lobbyChatFromPlayer?: (text: string) => void;
      lobbyKickFromPlayer?: (peerId: string) => void;
      lobbyTransferHostFromPlayer?: (peerId: string) => void;
      lobbyRequestSession?: () => void;
      /** Окно плеера → главное: началась смена качества/озвучки в лобби */
      lobbyNotifyBufferingStart?: () => void;
      /** Окно плеера → главное: догнать живые часы комнаты (после смены качества) */
      lobbyRequestCatchUp?: () => void;
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
      openComposerWindow?: (payload: {
        channelId?: number | null;
        draftId?: string | null;
        repostArticle?: unknown;
        editArticle?: unknown;
        isSuggestion?: boolean;
        channels?: Array<{
          id: number;
          title: string;
          avatar?: string | null;
          is_blog?: boolean;
        }>;
      }) => Promise<void>;
      getComposerPayload?: () => Promise<{
        channelId?: number | null;
        draftId?: string | null;
        repostArticle?: unknown;
        editArticle?: unknown;
        isSuggestion?: boolean;
        channels?: Array<{
          id: number;
          title: string;
          avatar?: string | null;
          is_blog?: boolean;
        }>;
      } | null>;
      isComposerWindow?: () => Promise<boolean>;
      composerReadyToClose?: () => void;
      composerPublished?: (data: { articleId?: number; channelId?: number } | null) => void;
      composerDraftsChanged?: () => void;
      diagnosticsGet?: (opts?: {
        channel?: string;
        level?: string;
        limit?: number;
        sinceId?: string;
      }) => Promise<Array<Record<string, unknown>>>;
      diagnosticsStats?: () => Promise<{
        total: number;
        max: number;
        subscribers: number;
        byChannel: Record<string, number>;
        byLevel: Record<string, number>;
      }>;
      diagnosticsClear?: () => Promise<{ ok: boolean; count: number }>;
      diagnosticsSubscribe?: () => Promise<{ ok: boolean; count: number }>;
      diagnosticsUnsubscribe?: () => Promise<{ ok: boolean }>;
      diagnosticsExportZip?: () => Promise<{
        ok: boolean;
        canceled?: boolean;
        path?: string;
        count?: number;
        deviceSummary?: { os?: string; cpu?: string; ramGb?: number };
      }>;
      diagnosticsPaths?: () => Promise<{ dir: string; file: string; zipDefaultDir: string }>;
      diagnosticsOpenDir?: () => Promise<{ ok: boolean; path?: string }>;
      diagnosticsReveal?: (filePath: string) => Promise<{ ok: boolean }>;
      onDiagnosticsEntry?: (cb: (entry: Record<string, unknown>) => void) => () => void;
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
