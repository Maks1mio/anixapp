const { contextBridge, ipcRenderer } = require('electron');

ipcRenderer.on('player:fullscreen', (_, isFullscreen) => {
  window.dispatchEvent(new CustomEvent('player-fullscreen', { detail: isFullscreen }));
});

ipcRenderer.on('player:applySync', (_, playback) => {
  window.dispatchEvent(new CustomEvent('player:applySync', { detail: playback }));
});

// Dynamic content change: main window → player window (no reload)
ipcRenderer.on('player:changeContent', (_, params) => {
  window.dispatchEvent(new CustomEvent('player:changeContent', { detail: params }));
});

ipcRenderer.on('lobby:playerStateChanged', (_, playback) => {
  window.dispatchEvent(new CustomEvent('lobby:playerStateChanged', { detail: playback }));
});

// Proposal events: main window → player window
ipcRenderer.on('lobby:proposal', (_, data) => {
  window.dispatchEvent(new CustomEvent('lobby:proposal', { detail: data }));
});

// Vote result from player → main window
ipcRenderer.on('lobby:voteFromPlayer', (_, data) => {
  window.dispatchEvent(new CustomEvent('lobby:voteFromPlayer', { detail: data }));
});

ipcRenderer.on('lobby:createFromPlayer', (_, playback) => {
  window.dispatchEvent(new CustomEvent('lobby:createFromPlayer', { detail: playback ?? null }));
});

ipcRenderer.on('lobby:joinFromPlayer', (_, code) => {
  window.dispatchEvent(new CustomEvent('lobby:joinFromPlayer', { detail: code }));
});

ipcRenderer.on('lobby:leaveFromPlayer', () => {
  window.dispatchEvent(new CustomEvent('lobby:leaveFromPlayer'));
});

ipcRenderer.on('lobby:chatFromPlayer', (_, text) => {
  window.dispatchEvent(new CustomEvent('lobby:chatFromPlayer', { detail: text }));
});
ipcRenderer.on('lobby:kickFromPlayer', (_, payload) => {
  window.dispatchEvent(new CustomEvent('lobby:kickFromPlayer', { detail: payload ?? null }));
});
ipcRenderer.on('lobby:transferHostFromPlayer', (_, payload) => {
  window.dispatchEvent(new CustomEvent('lobby:transferHostFromPlayer', { detail: payload ?? null }));
});

ipcRenderer.on('lobby:actionLogEntry', (_, entry) => {
  window.dispatchEvent(new CustomEvent('lobby:actionLogIngest', { detail: entry }));
});

ipcRenderer.on('lobby:requestSession', () => {
  window.dispatchEvent(new CustomEvent('lobby:requestSession'));
});

// Участники и события активности от главного окна → плеер
ipcRenderer.on('lobby:activityFeed', (_, data) => {
  window.dispatchEvent(new CustomEvent('lobby:activityFeed', { detail: data }));
});

ipcRenderer.on('lobby:participantsList', (_, participants) => {
  window.dispatchEvent(new CustomEvent('lobby:participantsList', { detail: participants }));
});

ipcRenderer.on('lobby:session', (_, session) => {
  window.dispatchEvent(new CustomEvent('lobby:session', { detail: session }));
});

ipcRenderer.on('lobby:chatToPlayer', (_, msg) => {
  window.dispatchEvent(new CustomEvent('lobby:chat', { detail: msg }));
});
ipcRenderer.on('lobby:chatHistoryToPlayer', (_, messages) => {
  window.dispatchEvent(new CustomEvent('lobby:chatHistory', { detail: { messages: messages ?? [] } }));
});

ipcRenderer.on('lobby:chooserErrorToPlayer', (_, msg) => {
  window.dispatchEvent(new CustomEvent('lobby:chooserError', { detail: msg }));
});

ipcRenderer.on('lobby:barrierSyncToPlayer', (_, payload) => {
  const detail = payload && typeof payload === 'object' && ('playback' in payload || 'reason' in payload)
    ? payload
    : { playback: payload ?? null };
  window.dispatchEvent(new CustomEvent('lobby:barrierSync', { detail }));
});
ipcRenderer.on('lobby:syncResumeToPlayer', () => {
  window.dispatchEvent(new CustomEvent('lobby:syncResume'));
});
ipcRenderer.on('lobby:syncStateToPlayer', (_, state) => {
  window.dispatchEvent(new CustomEvent('lobby:syncState', { detail: state ?? {} }));
});

ipcRenderer.on('app:update-progress', (_, payload) => {
  window.dispatchEvent(new CustomEvent('app-update-progress', { detail: payload }));
});

ipcRenderer.on('anix:offline', (_, payload) => {
  window.dispatchEvent(new CustomEvent('anix:offline', { detail: payload }));
});

// Discord RPC: join lobby via Discord party invite
ipcRenderer.on('discord:joinLobby', (_, payload) => {
  window.dispatchEvent(new CustomEvent('discord:joinLobby', { detail: payload }));
});

// Upscale settings sync from main window → player window
ipcRenderer.on('upscale:settingsChanged', (_, settings) => {
  window.dispatchEvent(new CustomEvent('anix:upscaleChanged', { detail: settings }));
});

// Player debug HUD toggle (настройки → отдельное окно плеера)
ipcRenderer.on('player:debugOverlay', (_, enabled) => {
  window.dispatchEvent(
    new CustomEvent('anix:playerDebugChanged', { detail: { playerDebugOverlay: !!enabled } }),
  );
});

ipcRenderer.on('player:adaptiveQuality', (_, enabled) => {
  window.dispatchEvent(
    new CustomEvent('anix:adaptiveQualityChanged', { detail: { adaptiveQualityByWindow: !!enabled } }),
  );
});

ipcRenderer.on('player:hotkeysChanged', (_, hotkeys) => {
  window.dispatchEvent(new CustomEvent('anix:playerHotkeysChanged', { detail: hotkeys }));
});

// Notify main window when player window is closed
ipcRenderer.on('player:closed', () => {
  window.dispatchEvent(new CustomEvent('player:windowClosed'));
});

ipcRenderer.on('bookmarks:changed', (_, detail) => {
  window.dispatchEvent(new CustomEvent('anix:bookmarksChanged', { detail: detail ?? {} }));
});

let pendingDeepLinkPayload = null;

ipcRenderer.on('anix:deepLink', (_, payload) => {
  pendingDeepLinkPayload = payload ?? null;
  window.dispatchEvent(new CustomEvent('anix:deepLink', { detail: payload }));
});

contextBridge.exposeInMainWorld('electron', {
  consumePendingDeepLink: () => {
    const payload = pendingDeepLinkPayload;
    pendingDeepLinkPayload = null;
    return payload;
  },
  getAppVersion: () => ipcRenderer.invoke('app:getVersion'),
  getVersions: () => ipcRenderer.invoke('app:getVersions'),
  getDeviceId: () => ipcRenderer.invoke('app:getDeviceId'),
  adminGetSession: () => ipcRenderer.invoke('admin:getSession'),
  adminSaveSession: (payload) => ipcRenderer.invoke('admin:saveSession', payload),
  adminClearSession: () => ipcRenderer.invoke('admin:clearSession'),
  getAnixbackEndpoint: () => ipcRenderer.invoke('anix:getAnixbackEndpoint'),
  setAnixbackEndpoint: (mode) => ipcRenderer.invoke('anix:setAnixbackEndpoint', mode),
  fetchReleaseGeoBypass: (releaseId) => ipcRenderer.invoke('anix:releaseInfoGeoBypass', releaseId),
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close: () => ipcRenderer.send('window:close'),
  },
  openPlayerWindow: (params) => ipcRenderer.invoke('player:openWindow', params),
  closePlayerWindow: () => ipcRenderer.send('player:close'),
  togglePlayerFullScreen: () => ipcRenderer.invoke('player:toggleFullScreen'),
  togglePlayerAlwaysOnTop: () => ipcRenderer.invoke('player:toggleAlwaysOnTop'),
  isPlayerOpen: () => ipcRenderer.invoke('player:isOpen'),
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
  startTvLanLogin: () => ipcRenderer.invoke('tvLan:start'),
  stopTvLanLogin: () => ipcRenderer.invoke('tvLan:stop'),
  onTvLanCredentials: (cb) => {
    const listener = (_event, detail) => cb(detail);
    ipcRenderer.on('tvLan:credentials', listener);
    return () => ipcRenderer.removeListener('tvLan:credentials', listener);
  },
  setExtraVideoHosts: (hosts) => ipcRenderer.invoke('video:setExtraHosts', hosts),
  addExtraVideoHosts: (hosts) => ipcRenderer.invoke('video:addExtraHosts', hosts),
  fetchCdnJson: (url) => ipcRenderer.invoke('cdn:fetchJson', url),
  downloadEpisodes: (payload) => ipcRenderer.invoke('episode-download:download', payload),
  queueEpisodeDownloads: (payload) => ipcRenderer.invoke('episode-download:queue', payload),
  getDownloadSettings: () => ipcRenderer.invoke('downloads:getSettings'),
  saveDownloadSettings: (payload) => ipcRenderer.invoke('downloads:saveSettings', payload),
  resetDownloadDirectory: () => ipcRenderer.invoke('downloads:resetDirectory'),
  getFfmpegStatus: () => ipcRenderer.invoke('downloads:getFfmpegStatus'),
  installFfmpeg: () => ipcRenderer.invoke('downloads:installFfmpeg'),
  openFfmpegPage: () => ipcRenderer.invoke('downloads:openFfmpegPage'),
  pickDownloadDirectory: () => ipcRenderer.invoke('downloads:pickDirectory'),
  openDownloadDirectory: (dir) => ipcRenderer.invoke('downloads:openDirectory', dir),
  showDownloadFile: (filePath) => ipcRenderer.invoke('downloads:showFile', filePath),
  openDownloadFile: (filePath) => ipcRenderer.invoke('downloads:openFile', filePath),
  listDownloadLibrary: () => ipcRenderer.invoke('downloads:listLibrary'),
  listDownloadsByRelease: (releaseId) => ipcRenderer.invoke('downloads:listByRelease', releaseId),
  readDownloadSkipMarks: (filePath) => ipcRenderer.invoke('downloads:readSkipMarks', filePath),
  saveDownloadSkipMarks: (payload) => ipcRenderer.invoke('downloads:saveSkipMarks', payload),
  deleteDownloadFile: (filePath) => ipcRenderer.invoke('downloads:deleteFile', filePath),
  deleteDownloadGroup: (groupName) => ipcRenderer.invoke('downloads:deleteGroup', groupName),
  pauseDownload: (id) => ipcRenderer.invoke('downloads:pause', id),
  pauseAllDownloads: () => ipcRenderer.invoke('downloads:pauseAll'),
  resumeDownload: (id) => ipcRenderer.invoke('downloads:resume', id),
  resumeAllDownloads: () => ipcRenderer.invoke('downloads:resumeAll'),
  isDownloadResumeBlocked: () => ipcRenderer.invoke('downloads:isResumeBlocked'),
  setDownloadStreamingHold: (blocked) => ipcRenderer.invoke('downloads:setStreamingHold', !!blocked),
  reorderDownloads: (payload) => ipcRenderer.invoke('downloads:reorder', payload),
  checkDownloadFiles: (payload) => ipcRenderer.invoke('downloads:checkFiles', payload),
  cancelDownload: (id) => ipcRenderer.invoke('downloads:cancel', id),
  cancelAllDownloads: () => ipcRenderer.invoke('downloads:cancelAll'),
  getActiveDownloadQueue: () => ipcRenderer.invoke('downloads:getActiveQueue'),
  removeDownloadEntry: (id) => ipcRenderer.invoke('downloads:removeEntry', id),
  playDownloadInApp: (payload) => ipcRenderer.invoke('downloads:playInApp', payload),
  syncPlayerState: (playback) => ipcRenderer.send('player:syncState', playback),
  sendPlayerState: (playback) => ipcRenderer.send('player:stateChanged', playback),
  sendFluoPreview: (payload) => ipcRenderer.send('fluo:previewFromPlayer', payload),
  startUpdateDownload: () => ipcRenderer.invoke('app:startUpdateDownload'),
  checkForUpdate: (currentVersion) => ipcRenderer.invoke('app:checkForUpdate', currentVersion),
  installUpdate: () => ipcRenderer.invoke('app:installUpdate'),
  getLinuxInstallType: () => ipcRenderer.invoke('app:getLinuxInstallType'),
  getSettings: () => ipcRenderer.invoke('app:getSettings'),
  saveSettings: (settings) => ipcRenderer.invoke('app:saveSettings', settings),
  getDevBridgeStatus: () => ipcRenderer.invoke('dev:getBridgeStatus'),
  setDevBridgeEnabled: (enabled) => ipcRenderer.invoke('dev:setBridgeEnabled', enabled),
  regenerateDevBridgeToken: () => ipcRenderer.invoke('dev:regenerateBridgeToken'),
  // Lobby proposal IPC
  sendProposalToPlayer: (data) => ipcRenderer.send('lobby:proposalToPlayer', data),
  sendLobbyVote: (proposalId, accept) => ipcRenderer.send('lobby:voteFromPlayer', proposalId, accept),
  // Участники и события активности → плеер
  sendActivityToPlayer: (data) => ipcRenderer.send('lobby:activityToPlayer', data),
  sendParticipantsToPlayer: (participants) => ipcRenderer.send('lobby:participantsToPlayer', participants),
  sendLobbySessionToPlayer: (session) => ipcRenderer.send('lobby:sessionToPlayer', session),
  sendLobbyChatToPlayer: (msg) => ipcRenderer.send('lobby:chatToPlayer', msg),
  sendLobbyChatHistoryToPlayer: (messages) => ipcRenderer.send('lobby:chatHistoryToPlayer', messages ?? []),
  sendLobbyChooserErrorToPlayer: (msg) => ipcRenderer.send('lobby:chooserErrorToPlayer', msg),
  lobbyCreateFromPlayer: (playback) => ipcRenderer.send('lobby:createFromPlayer', playback ?? null),
  lobbyJoinFromPlayer: (code) => ipcRenderer.send('lobby:joinFromPlayer', code),
  lobbyLeaveFromPlayer: () => ipcRenderer.send('lobby:leaveFromPlayer'),
  lobbyChatFromPlayer: (text) => ipcRenderer.send('lobby:chatFromPlayer', text),
  lobbyKickFromPlayer: (peerId) => ipcRenderer.send('lobby:kickFromPlayer', { peerId }),
  lobbyTransferHostFromPlayer: (peerId) => ipcRenderer.send('lobby:transferHostFromPlayer', { peerId }),
  lobbyRequestSession: () => ipcRenderer.send('lobby:requestSession'),
  lobbyNotifyBufferingStart: () => ipcRenderer.send('lobby:bufferingStartFromPlayer'),
  lobbyRequestCatchUp: () => ipcRenderer.send('lobby:requestCatchUpFromPlayer'),
  lobbyPlayerSynced: (currentTime) => ipcRenderer.send('lobby:playerSyncedFromPlayer', { currentTime }),
  sendLobbyWaitingOverlayToPlayer: (payload) => ipcRenderer.send('lobby:waitingOverlayToPlayer', payload),
  sendLobbyBarrierSyncToPlayer: (playback) => ipcRenderer.send('lobby:barrierSyncToPlayer', playback ?? null),
  sendLobbySyncResumeToPlayer: () => ipcRenderer.send('lobby:syncResumeToPlayer'),
  sendLobbySyncStateToPlayer: (state) => ipcRenderer.send('lobby:syncStateToPlayer', state),
  // Discord Rich Presence update from renderer
  discordUpdate: (data) => ipcRenderer.send('discord:update', data),
  // Theme editor
  openThemeEditor: (opts) => ipcRenderer.invoke('theme-editor:open', opts ?? {}),
  themeEditorSaved: (themeId) => ipcRenderer.send('theme-editor:saved', themeId),
  themeEditorLiveUpdate: (vars) => ipcRenderer.send('theme-editor:liveUpdate', vars),
  themeEditorDeleted: (themeId) => ipcRenderer.send('theme-editor:deleted', themeId),
  // Upscale settings sync to player window
  sendUpscaleSettings: (settings) => ipcRenderer.send('upscale:applySettings', settings),
  sendPlayerHotkeys: (hotkeys) => ipcRenderer.send('player:applyHotkeys', hotkeys),
  // Upscale Preview Tool
  openUpscaleTool: () => ipcRenderer.invoke('tool:openUpscale'),
  saveToolScreenshot: (dataUrl, filename) => ipcRenderer.invoke('tool:saveScreenshot', dataUrl, filename),
  // Window controls (frameless)
  minimizeToolWindow:      () => ipcRenderer.invoke('tool:minimize'),
  toggleMaximizeToolWindow:() => ipcRenderer.invoke('tool:toggleMaximize'),
  closeToolWindow:         () => ipcRenderer.invoke('tool:close'),
  onToolWindowState: (cb) => ipcRenderer.on('tool:windowState', (_, state) => cb(state)),
  openOverviewVideoEditor: (payload) => ipcRenderer.invoke('overview-editor:open', payload),
  getOverviewEditorPayload: () => ipcRenderer.invoke('overview-editor:getPayload'),
  overviewEditorDone: () => ipcRenderer.send('overview-editor:done'),
  openAdminPanelWindow: () => ipcRenderer.invoke('admin:openWindow'),
  isAdminPanelWindow: () => ipcRenderer.invoke('admin:isStandaloneWindow'),
  // Logging
  logRenderer:      (entry) => ipcRenderer.invoke('log:renderer', entry),
  logGetSessions:   ()      => ipcRenderer.invoke('log:getSessions'),
  logGetSessionLog: (sessionId, file, limit) => ipcRenderer.invoke('log:getSessionLog', sessionId, file, limit),
  logGetSystemInfo: ()      => ipcRenderer.invoke('log:getSystemInfo'),
  logCollectZip:    ()      => ipcRenderer.invoke('log:collectZip'),
  logOpenZip:       (p)     => ipcRenderer.invoke('log:openZip', p),
  logOpenFolder:    ()      => ipcRenderer.invoke('log:openFolder'),
  logGetFolderPath: ()      => ipcRenderer.invoke('log:getFolderPath'),
  logGetSessionDir: ()      => ipcRenderer.invoke('log:getSessionDir'),
  logGetLobbyPath:  ()      => ipcRenderer.invoke('log:getLobbyPath'),
  logLobbyLine:     (line)  => ipcRenderer.invoke('log:lobbyLine', line),
  sendLobbyActionLogToPlayer: (entry) => ipcRenderer.send('lobby:actionLogToPlayer', entry),
});

// Download progress events: main → renderer
ipcRenderer.on('episode-download:progress', (_, data) => {
  window.dispatchEvent(new CustomEvent('episode-download:progress', { detail: data }));
});

ipcRenderer.on('downloads:streaming-hold', (_, data) => {
  window.dispatchEvent(new CustomEvent('downloads:streaming-hold', { detail: data }));
});

ipcRenderer.on('downloads:ffmpeg-install-progress', (_, data) => {
  window.dispatchEvent(new CustomEvent('downloads:ffmpeg-install-progress', { detail: data }));
});

ipcRenderer.on('lobby:bufferingStartFromPlayer', () => {
  window.dispatchEvent(new CustomEvent('lobby:bufferingStartFromPlayer'));
});
ipcRenderer.on('lobby:requestCatchUpFromPlayer', () => {
  window.dispatchEvent(new CustomEvent('lobby:requestCatchUpFromPlayer'));
});
ipcRenderer.on('lobby:playerSyncedFromPlayer', (_, payload) => {
  window.dispatchEvent(new CustomEvent('lobby:playerSyncedFromPlayer', { detail: payload ?? null }));
});
ipcRenderer.on('fluo:previewFromPlayer', (_, payload) => {
  window.dispatchEvent(new CustomEvent('fluo:previewFromPlayer', { detail: payload ?? null }));
});
ipcRenderer.on('lobby:playerWaitingOverlay', (_, payload) => {
  window.dispatchEvent(new CustomEvent('lobby:playerWaitingOverlay', { detail: payload }));
});

// Main window receives notification when theme editor saves a theme
ipcRenderer.on('theme-editor:saved', (_, themeId) => {
  window.dispatchEvent(new CustomEvent('anix:themeEditorSaved', { detail: { themeId } }));
});

// Main window receives live theme vars from theme editor (for real-time preview)
ipcRenderer.on('theme-editor:liveUpdate', (_, vars) => {
  window.dispatchEvent(new CustomEvent('anix:themeEditorLiveUpdate', { detail: vars }));
});

// Main window receives notification when theme editor deletes a theme
ipcRenderer.on('theme-editor:deleted', (_, themeId) => {
  window.dispatchEvent(new CustomEvent('anix:themeEditorDeleted', { detail: { themeId } }));
});

ipcRenderer.on('overview-editor:done', () => {
  window.dispatchEvent(new CustomEvent('anix:overviewEditorDone'));
});

// ── Structured API (anixApi) — grouped endpoints like AniDesk ──
contextBridge.exposeInMainWorld('anixApi', {
  client: {
    get baseUrl() { return '(use anixApi.client.getBaseUrl())'; },
    get token() { return '(use anixApi.client.getAuthStatus())'; },
    getBaseUrl: () => ipcRenderer.invoke('anix:getBaseUrl'),
    setBaseUrl: (baseUrl) => ipcRenderer.invoke('anix:setBaseUrl', baseUrl),
    pingBaseUrl: (baseUrl) => ipcRenderer.invoke('anix:pingBaseUrl', baseUrl),
    getAuthStatus: () => ipcRenderer.invoke('anix:getAuthStatus'),
    checkConnection: () => ipcRenderer.invoke('anix:checkConnection'),
    testOffline: () => ipcRenderer.invoke('anix:testOffline'),
  },

  auth: {
    signIn: (username, password) => ipcRenderer.invoke('anix:login', username, password),
    signInWithVk: () => ipcRenderer.invoke('anix:loginVk'),
    signInWithGoogle: () => ipcRenderer.invoke('anix:loginGoogle'),
    signInWithTelegram: () => ipcRenderer.invoke('anix:loginTelegram'),
    signInWithYandex: () => ipcRenderer.invoke('anix:loginYandex'),
    signUp: (payload) => ipcRenderer.invoke('anix:signUp', payload),
    signUpVerify: (payload) => ipcRenderer.invoke('anix:signUpVerify', payload),
    signUpResend: (payload) => ipcRenderer.invoke('anix:signUpResend', payload),
    checkLogin: (login) => ipcRenderer.invoke('anix:checkLogin', login),
    restore: (data) => ipcRenderer.invoke('anix:restore', data),
    restoreVerify: (payload) => ipcRenderer.invoke('anix:restoreVerify', payload),
    restoreResend: (payload) => ipcRenderer.invoke('anix:restoreResend', payload),
    completeOAuthSignUp: (payload) => ipcRenderer.invoke('anix:oauthCompleteSignUp', payload),
    clearOAuthPending: () => ipcRenderer.invoke('anix:oauthClearPending'),
    submitOAuthUrl: (url) => ipcRenderer.invoke('anix:oauthSubmitUrl', url),
    cancelOAuth: () => ipcRenderer.invoke('anix:oauthCancel'),
    bindOAuthService: (provider) => ipcRenderer.invoke('anix:bindOAuthService', provider),
    unbindOAuthService: (provider) => ipcRenderer.invoke('anix:unbindOAuthService', provider),
    logout: () => ipcRenderer.invoke('anix:logout'),
    getStatus: () => ipcRenderer.invoke('anix:getAuthStatus'),
    listAccounts: () => ipcRenderer.invoke('anix:listAccounts'),
    switchAccount: (profileId) => ipcRenderer.invoke('anix:switchAccount', profileId),
    removeAccount: (profileId) => ipcRenderer.invoke('anix:removeAccount', profileId),
  },

  profile: {
    self: () => ipcRenderer.invoke('anix:selfProfile'),
    info: (id) => ipcRenderer.invoke('anix:profileById', id),
    getSocialPages: (profileId) => ipcRenderer.invoke('anix:profileSocial', profileId),
    getLoginHistory: (profileId, page = 0) => ipcRenderer.invoke('anix:loginHistory', profileId, page),
    getFriends: (profileId, page = 0) => ipcRenderer.invoke('anix:friends', profileId, page),
    sendFriendRequest: (profileId) => ipcRenderer.invoke('anix:friendRequestSend', profileId),
    removeFriendRequest: (profileId) => ipcRenderer.invoke('anix:friendRequestRemove', profileId),
    hideFriendRequest: (profileId) => ipcRenderer.invoke('anix:friendRequestHide', profileId),
    getFriendRequestsIn: (page = 0) => ipcRenderer.invoke('anix:friendRequestsIn', page),
    getFriendRequestsOut: (page = 0) => ipcRenderer.invoke('anix:friendRequestsOut', page),
    getFriendRecommendations: () => ipcRenderer.invoke('anix:friendRecommendations'),
    getBookmarks: (profileId, type, page = 0, sort = 1, filterAnnounce = 0, filter = 0) =>
      ipcRenderer.invoke('anix:getBookmarks', profileId, type, page, sort, filterAnnounce, filter),
    getVotedReleases: (profileId, page = 0, sort = 1) =>
      ipcRenderer.invoke('anix:votedReleases', profileId, page, sort),
    getReleaseComments: (profileId, page = 0, sort = 1) =>
      ipcRenderer.invoke('anix:profileReleaseComments', profileId, page, sort),
    getCollectionComments: (profileId, page = 0, sort = 1) =>
      ipcRenderer.invoke('anix:profileCollectionComments', profileId, page, sort),
    getArticleComments: (profileId, page = 0, sort = 1) =>
      ipcRenderer.invoke('anix:profileArticleComments', profileId, page, sort),
    getFavoriteVideos: (profileId, page = 0) =>
      ipcRenderer.invoke('anix:profileFavoriteVideos', profileId, page),
  },

  release: {
    info: (id, extended = true) => ipcRenderer.invoke('anix:releaseById', id, extended),
    filter: (page = 0, filterArgs = {}, extended = true) =>
      ipcRenderer.invoke('anix:filterReleases', page, JSON.parse(JSON.stringify(filterArgs)), extended),
    random: (extended = true) => ipcRenderer.invoke('anix:randomRelease', extended),
    randomFavorite: (extended = true) => ipcRenderer.invoke('anix:randomFavorite', extended),
    randomProfileList: (profileId, status, extended = true) =>
      ipcRenderer.invoke('anix:randomProfileList', profileId, status, extended),
    related: (relatedId, page = 0) => ipcRenderer.invoke('anix:relatedReleases', relatedId, page),
    getDubbers: (releaseId) => ipcRenderer.invoke('anix:getDubbers', releaseId),
    getDubberSources: (releaseId, dubberId) => ipcRenderer.invoke('anix:getDubberSources', releaseId, dubberId),
    getEpisodes: (releaseId, dubberId, sourceId, sort = 1) => ipcRenderer.invoke('anix:getEpisodes', releaseId, dubberId, sourceId, sort),
    getEpisode: (releaseId, sourceId, episodePosition) => ipcRenderer.invoke('anix:getEpisode', releaseId, sourceId, episodePosition),
    getEpisodeUpdates: (releaseId, page = 0) => ipcRenderer.invoke('anix:getEpisodeUpdates', releaseId, page),
    getDirectVideoLink: (embedUrl) => ipcRenderer.invoke('anix:getDirectVideoLink', embedUrl),
    getVideos: (releaseId) => ipcRenderer.invoke('anix:getVideos', releaseId),
    getVideoInCategory: (releaseId, categoryId, page = 1) => ipcRenderer.invoke('anix:getVideoInCategory', releaseId, categoryId, page),
    addFavorite: (releaseId) => ipcRenderer.invoke('anix:addToFavorites', releaseId),
    removeFavorite: (releaseId) => ipcRenderer.invoke('anix:removeFromFavorites', releaseId),
    setListStatus: (releaseId, statusId) => ipcRenderer.invoke('anix:setListStatus', releaseId, statusId),
    clearListStatus: (releaseId, statusId) => ipcRenderer.invoke('anix:clearListStatus', releaseId, statusId),
    vote: (releaseId, vote) => ipcRenderer.invoke('anix:releaseVote', releaseId, vote),
    deleteVote: (releaseId) => ipcRenderer.invoke('anix:releaseDeleteVote', releaseId),
    schedule: () => ipcRenderer.invoke('anix:schedule'),
  },

  comments: {
    release: {
      list: (releaseId, page = 0, sort = 1) =>
        ipcRenderer.invoke('anix:releaseComments', releaseId, page, sort),
      get: (commentId) => ipcRenderer.invoke('anix:releaseCommentById', commentId),
      replies: (commentId, page = 0, sort = 2) =>
        ipcRenderer.invoke('anix:releaseCommentReplies', commentId, page, sort),
      vote: (commentId, vote) => ipcRenderer.invoke('anix:releaseCommentVote', commentId, vote),
      votes: (commentId, page = 0, sort = 2) =>
        ipcRenderer.invoke('anix:releaseCommentVotes', commentId, page, sort),
      add: (releaseId, body) => ipcRenderer.invoke('anix:releaseCommentAdd', releaseId, body),
      edit: (commentId, body) => ipcRenderer.invoke('anix:releaseCommentEdit', commentId, body),
      delete: (commentId) => ipcRenderer.invoke('anix:releaseCommentDelete', commentId),
    },
  },

  type: {
    all: () => ipcRenderer.invoke('anix:typeAll'),
    pin: (releaseId, typeId) => ipcRenderer.invoke('anix:typePin', releaseId, typeId),
    unpin: (releaseId, typeId) => ipcRenderer.invoke('anix:typeUnpin', releaseId, typeId),
  },

  feed: {
    my: (page = 0, opts = {}) => ipcRenderer.invoke('anix:myFeed', page, opts),
    latest: (page = 0) => ipcRenderer.invoke('anix:latestFeed', page),
  },

  discover: {
    recommendations: (page = -1, previousPage = -1) =>
      ipcRenderer.invoke('anix:discoverRecommendations', page, previousPage),
    interesting: () => ipcRenderer.invoke('anix:discoverInteresting'),
    watching: (page = 0) => ipcRenderer.invoke('anix:discoverWatching', page),
    discussing: () => ipcRenderer.invoke('anix:discoverDiscussing'),
    commentsWeek: () => ipcRenderer.invoke('anix:discoverCommentsWeek'),
    collectionsWeek: (page = -1, previousPage = 0) =>
      ipcRenderer.invoke('anix:discoverCollectionsWeek', page, previousPage),
  },

  search: {
    releases: (query, page = 0, searchBy = 0) =>
      ipcRenderer.invoke('anix:searchReleases', query, page, searchBy),
    profiles: (query, page = 0) => ipcRenderer.invoke('anix:searchProfiles', query, page),
    collections: (query, page = 0) => ipcRenderer.invoke('anix:searchCollections', query, page),
    profileList: (status, query, page = 0, searchBy = 0) =>
      ipcRenderer.invoke('anix:searchProfileList', status, query, page, searchBy),
  },

  collection: {
    info: (id) => ipcRenderer.invoke('anix:collectionById', id),
    all: (page = 0, options = {}) => ipcRenderer.invoke('anix:collectionsAll', page, options),
    profileCollections: (profileId, page = 0) =>
      ipcRenderer.invoke('anix:collectionProfileCollections', profileId, page),
    favorites: (page = 0) => ipcRenderer.invoke('anix:collectionFavorites', page),
    getReleases: (id, page = 0) => ipcRenderer.invoke('anix:collectionReleases', id, page),
    getRandomRelease: (id) => ipcRenderer.invoke('anix:collectionRandomRelease', id),
    addFavorite: (id) => ipcRenderer.invoke('anix:addCollectionFavorite', id),
    removeFavorite: (id) => ipcRenderer.invoke('anix:removeCollectionFavorite', id),
  },

  collectionMy: {
    create: (body) => ipcRenderer.invoke('anix:collectionMyCreate', body),
    edit: (id, body) => ipcRenderer.invoke('anix:collectionMyEdit', id, body),
    editImage: (id, imageBase64, fileName) =>
      ipcRenderer.invoke('anix:collectionMyEditImage', id, imageBase64, fileName),
    releaseAdd: (id, releaseId) => ipcRenderer.invoke('anix:collectionMyReleaseAdd', id, releaseId),
    delete: (id) => ipcRenderer.invoke('anix:collectionMyDelete', id),
  },

  channel: {
    info: (id) => ipcRenderer.invoke('anix:channelById', id),
    getBlog: (id) => ipcRenderer.invoke('anix:channelBlog', id),
    articles: (channelId, page = 0) => ipcRenderer.invoke('anix:channelArticles', channelId, page),
    subscribe: (channelId) => ipcRenderer.invoke('anix:channelSubscribe', channelId),
    unsubscribe: (channelId) => ipcRenderer.invoke('anix:channelUnsubscribe', channelId),
    subscriptions: (page = 0) => ipcRenderer.invoke('anix:channelSubscriptions', page),
    editorAll: () => ipcRenderer.invoke('anix:channelEditorAll'),
    uploadCover: (channelId, imageBase64, fileName) =>
      ipcRenderer.invoke('anix:channelUploadCover', channelId, imageBase64, fileName),
    deleteCover: (channelId) => ipcRenderer.invoke('anix:channelDeleteCover', channelId),
    createBlog: () => ipcRenderer.invoke('anix:channelCreateBlog'),
  },

  notification: {
    all: (page = 0) => ipcRenderer.invoke('anix:notificationsAll', page),
    count: () => ipcRenderer.invoke('anix:notificationsCount'),
    read: () => ipcRenderer.invoke('anix:notificationsRead'),
  },

  history: {
    all: (page = 0) => ipcRenderer.invoke('anix:history', page),
    delete: (releaseId) => ipcRenderer.invoke('anix:deleteFromHistory', releaseId),
    add: (releaseId, sourceId, episodePosition) => ipcRenderer.invoke('anix:addToHistory', releaseId, sourceId, episodePosition),
    markWatched: (releaseId, sourceId, episodePosition) => ipcRenderer.invoke('anix:markEpisodeAsWatched', releaseId, sourceId, episodePosition),
    unmarkWatched: (releaseId, sourceId, episodePosition) => ipcRenderer.invoke('anix:unmarkEpisodeAsWatched', releaseId, sourceId, episodePosition),
  },

  favorites: {
    all: (page = 0, sort = 1, filterAnnounce = 0, filter = 0) =>
      ipcRenderer.invoke('anix:favorites', page, sort, filterAnnounce, filter),
  },

  article: {
    info: (id) => ipcRenderer.invoke('anix:articleById', id),
    vote: (id, vote) => ipcRenderer.invoke('anix:articleVote', id, vote),
    delete: (id) => ipcRenderer.invoke('anix:articleDelete', id),
    mute: (id) => ipcRenderer.invoke('anix:articleMute', id),
    unmute: (id) => ipcRenderer.invoke('anix:articleUnmute', id),
    setPinned: (id, isPinned) => ipcRenderer.invoke('anix:articlePin', id, isPinned),
  },

  report: {
    articleReasons: () => ipcRenderer.invoke('anix:reportArticleReasons'),
    submitArticle: (body) => ipcRenderer.invoke('anix:reportArticle', body),
  },

  home: {
    getCustomTab: () => ipcRenderer.invoke('anix:homeCustomTabGet'),
    setCustomTab: (data) => ipcRenderer.invoke('anix:homeCustomTabSet', JSON.parse(JSON.stringify(data))),
  },

  settings: {
    getProfileSettings: () => ipcRenderer.invoke('anix:getProfileSettings'),
    setStatus: (status) => ipcRenderer.invoke('anix:setStatus', status),
    getSocial: () => ipcRenderer.invoke('anix:getSocial'),
    setSocial: (data) => ipcRenderer.invoke('anix:setSocial', data),
    setPrivacyStats: (state) => ipcRenderer.invoke('anix:setPrivacyStats', state),
    setPrivacyCounts: (state) => ipcRenderer.invoke('anix:setPrivacyCounts', state),
    setPrivacySocial: (state) => ipcRenderer.invoke('anix:setPrivacySocial', state),
    setPrivacyFriendRequests: (state) => ipcRenderer.invoke('anix:setPrivacyFriendRequests', state),
    getLoginInfo: () => ipcRenderer.invoke('anix:getLoginInfo'),
    changeLogin: (newLogin) => ipcRenderer.invoke('anix:changeLogin', newLogin),
    getBadges: (page = 0) => ipcRenderer.invoke('anix:getBadges', page),
    setBadge: (id) => ipcRenderer.invoke('anix:setBadge', id),
    removeBadge: () => ipcRenderer.invoke('anix:removeBadge'),
    selectTheme: (id) => ipcRenderer.invoke('anix:selectTheme', id),
    setAvatar: (imageBase64, fileName) => ipcRenderer.invoke('anix:setAvatar', imageBase64, fileName),
    deleteAvatar: () => ipcRenderer.invoke('anix:deleteAvatar'),
  },
});
