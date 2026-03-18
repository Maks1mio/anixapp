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

// Участники и события активности от главного окна → плеер
ipcRenderer.on('lobby:activityFeed', (_, data) => {
  window.dispatchEvent(new CustomEvent('lobby:activityFeed', { detail: data }));
});

ipcRenderer.on('lobby:participantsList', (_, participants) => {
  window.dispatchEvent(new CustomEvent('lobby:participantsList', { detail: participants }));
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

contextBridge.exposeInMainWorld('electron', {
  getAppVersion: () => ipcRenderer.invoke('app:getVersion'),
  getDeviceId: () => ipcRenderer.invoke('app:getDeviceId'),
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close: () => ipcRenderer.send('window:close'),
  },
  openPlayerWindow: (params) => ipcRenderer.invoke('player:openWindow', params),
  closePlayerWindow: () => ipcRenderer.send('player:close'),
  togglePlayerFullScreen: () => ipcRenderer.invoke('player:toggleFullScreen'),
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
  syncPlayerState: (playback) => ipcRenderer.send('player:syncState', playback),
  sendPlayerState: (playback) => ipcRenderer.send('player:stateChanged', playback),
  startUpdateDownload: () => ipcRenderer.invoke('app:startUpdateDownload'),
  installUpdate: () => ipcRenderer.invoke('app:installUpdate'),
  getSettings: () => ipcRenderer.invoke('app:getSettings'),
  saveSettings: (settings) => ipcRenderer.invoke('app:saveSettings', settings),
  // Lobby proposal IPC
  sendProposalToPlayer: (data) => ipcRenderer.send('lobby:proposalToPlayer', data),
  sendLobbyVote: (proposalId, accept) => ipcRenderer.send('lobby:voteFromPlayer', proposalId, accept),
  // Участники и события активности → плеер
  sendActivityToPlayer: (data) => ipcRenderer.send('lobby:activityToPlayer', data),
  sendParticipantsToPlayer: (participants) => ipcRenderer.send('lobby:participantsToPlayer', participants),
  // Discord Rich Presence update from renderer
  discordUpdate: (data) => ipcRenderer.send('discord:update', data),
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
    logout: () => ipcRenderer.invoke('anix:logout'),
    getStatus: () => ipcRenderer.invoke('anix:getAuthStatus'),
  },

  profile: {
    self: () => ipcRenderer.invoke('anix:selfProfile'),
    info: (id) => ipcRenderer.invoke('anix:profileById', id),
    getFriends: (profileId, page = 0) => ipcRenderer.invoke('anix:friends', profileId, page),
    getBookmarks: (profileId, type, page = 0) => ipcRenderer.invoke('anix:getBookmarks', profileId, type, page),
    getVotedReleases: (profileId, page = 0) => ipcRenderer.invoke('anix:votedReleases', profileId, page),
  },

  release: {
    info: (id, extended = true) => ipcRenderer.invoke('anix:releaseById', id, extended),
    filter: (page = 0, filterArgs = {}, extended = true) => ipcRenderer.invoke('anix:filterReleases', page, filterArgs, extended),
    random: (extended = true) => ipcRenderer.invoke('anix:randomRelease', extended),
    related: (releaseId, page = 0) => ipcRenderer.invoke('anix:relatedReleases', releaseId, page),
    getDubbers: (releaseId) => ipcRenderer.invoke('anix:getDubbers', releaseId),
    getDubberSources: (releaseId, dubberId) => ipcRenderer.invoke('anix:getDubberSources', releaseId, dubberId),
    getEpisodes: (releaseId, dubberId, sourceId, sort = 1) => ipcRenderer.invoke('anix:getEpisodes', releaseId, dubberId, sourceId, sort),
    getEpisode: (releaseId, sourceId, episodePosition) => ipcRenderer.invoke('anix:getEpisode', releaseId, sourceId, episodePosition),
    getDirectVideoLink: (embedUrl) => ipcRenderer.invoke('anix:getDirectVideoLink', embedUrl),
    getVideos: (releaseId) => ipcRenderer.invoke('anix:getVideos', releaseId),
    getVideoInCategory: (releaseId, categoryId, page = 1) => ipcRenderer.invoke('anix:getVideoInCategory', releaseId, categoryId, page),
    addFavorite: (releaseId) => ipcRenderer.invoke('anix:addToFavorites', releaseId),
    removeFavorite: (releaseId) => ipcRenderer.invoke('anix:removeFromFavorites', releaseId),
    setListStatus: (releaseId, statusId) => ipcRenderer.invoke('anix:setListStatus', releaseId, statusId),
    clearListStatus: (releaseId, statusId) => ipcRenderer.invoke('anix:clearListStatus', releaseId, statusId),
  },

  feed: {
    latest: (page = 1) => ipcRenderer.invoke('anix:latestFeed', page),
  },

  discover: {
    recommendations: (page = 0) => ipcRenderer.invoke('anix:discoverRecommendations', page),
  },

  search: {
    releases: (query, page = 0) => ipcRenderer.invoke('anix:searchReleases', query, page),
    profiles: (query, page = 0) => ipcRenderer.invoke('anix:searchProfiles', query, page),
    collections: (query, page = 0) => ipcRenderer.invoke('anix:searchCollections', query, page),
  },

  collection: {
    info: (id) => ipcRenderer.invoke('anix:collectionById', id),
    all: (page = 1, sort = 2) => ipcRenderer.invoke('anix:collectionsAll', page, sort),
    getReleases: (id, page = 0) => ipcRenderer.invoke('anix:collectionReleases', id, page),
    getRandomRelease: (id) => ipcRenderer.invoke('anix:collectionRandomRelease', id),
    addFavorite: (id) => ipcRenderer.invoke('anix:addCollectionFavorite', id),
    removeFavorite: (id) => ipcRenderer.invoke('anix:removeCollectionFavorite', id),
  },

  channel: {
    info: (id) => ipcRenderer.invoke('anix:channelById', id),
    getBlog: (id) => ipcRenderer.invoke('anix:channelBlog', id),
  },

  notification: {
    all: (page = 0) => ipcRenderer.invoke('anix:notificationsAll', page),
    count: () => ipcRenderer.invoke('anix:notificationsCount'),
  },

  history: {
    all: (page = 0) => ipcRenderer.invoke('anix:history', page),
    add: (releaseId, sourceId, episodePosition) => ipcRenderer.invoke('anix:addToHistory', releaseId, sourceId, episodePosition),
    markWatched: (releaseId, sourceId, episodePosition) => ipcRenderer.invoke('anix:markEpisodeAsWatched', releaseId, sourceId, episodePosition),
    unmarkWatched: (releaseId, sourceId, episodePosition) => ipcRenderer.invoke('anix:unmarkEpisodeAsWatched', releaseId, sourceId, episodePosition),
  },

  favorites: {
    all: (page = 0) => ipcRenderer.invoke('anix:favorites', page),
  },

  article: {
    info: (id) => ipcRenderer.invoke('anix:articleById', id),
  },
});
