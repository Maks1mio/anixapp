const { contextBridge, ipcRenderer } = require('electron');

ipcRenderer.on('player:fullscreen', (_, isFullscreen) => {
  window.dispatchEvent(new CustomEvent('player-fullscreen', { detail: isFullscreen }));
});

ipcRenderer.on('player:applySync', (_, playback) => {
  window.dispatchEvent(new CustomEvent('player:applySync', { detail: playback }));
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

ipcRenderer.on('app:update-progress', (_, payload) => {
  window.dispatchEvent(new CustomEvent('app-update-progress', { detail: payload }));
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
  // Lobby proposal IPC
  sendProposalToPlayer: (data) => ipcRenderer.send('lobby:proposalToPlayer', data),
  sendLobbyVote: (proposalId, accept) => ipcRenderer.send('lobby:voteFromPlayer', proposalId, accept),
});

contextBridge.exposeInMainWorld('anix', {
  getAuthStatus: () => ipcRenderer.invoke('anix:getAuthStatus'),
  getBaseUrl: () => ipcRenderer.invoke('anix:getBaseUrl'),
  setBaseUrl: (baseUrl) => ipcRenderer.invoke('anix:setBaseUrl', baseUrl),
  getSelfProfile: () => ipcRenderer.invoke('anix:selfProfile'),
  login: (username, password) => ipcRenderer.invoke('anix:login', username, password),
  logout: () => ipcRenderer.invoke('anix:logout'),
  getReleaseById: (id, extended = true) => ipcRenderer.invoke('anix:releaseById', id, extended),
  getDubbers: (releaseId) => ipcRenderer.invoke('anix:getDubbers', releaseId),
  getDubberSources: (releaseId, dubberId) => ipcRenderer.invoke('anix:getDubberSources', releaseId, dubberId),
  getEpisodes: (releaseId, dubberId, sourceId, sort = 1) => ipcRenderer.invoke('anix:getEpisodes', releaseId, dubberId, sourceId, sort),
  getEpisode: (releaseId, sourceId, episodePosition) => ipcRenderer.invoke('anix:getEpisode', releaseId, sourceId, episodePosition),
  getDirectVideoLink: (embedUrl) => ipcRenderer.invoke('anix:getDirectVideoLink', embedUrl),
  getVideos: (releaseId) => ipcRenderer.invoke('anix:getVideos', releaseId),
  getVideoInCategory: (releaseId, categoryId, page = 1) => ipcRenderer.invoke('anix:getVideoInCategory', releaseId, categoryId, page),
  getRandomRelease: (extended = true) => ipcRenderer.invoke('anix:randomRelease', extended),
  getLatestFeed: (page = 1) => ipcRenderer.invoke('anix:latestFeed', page),
  getDiscoverRecommendations: (page = 0) => ipcRenderer.invoke('anix:discoverRecommendations', page),
  getArticleById: (id) => ipcRenderer.invoke('anix:articleById', id),
  getChannelById: (id) => ipcRenderer.invoke('anix:channelById', id),
  getProfileById: (id) => ipcRenderer.invoke('anix:profileById', id),
  getCollectionById: (id) => ipcRenderer.invoke('anix:collectionById', id),
  getCollectionReleases: (id, page = 0) => ipcRenderer.invoke('anix:collectionReleases', id, page),
  getCollectionRandomRelease: (id) => ipcRenderer.invoke('anix:collectionRandomRelease', id),
  addCollectionFavorite: (id) => ipcRenderer.invoke('anix:addCollectionFavorite', id),
  removeCollectionFavorite: (id) => ipcRenderer.invoke('anix:removeCollectionFavorite', id),
  getAllCollections: (page = 1, sort = 2) => ipcRenderer.invoke('anix:collectionsAll', page, sort),
  getFavorites: (page = 0) => ipcRenderer.invoke('anix:favorites', page),
  getBookmarks: (profileId, type, page = 0) => ipcRenderer.invoke('anix:getBookmarks', profileId, type, page),
  getRelatedReleases: (releaseId, page = 0) => ipcRenderer.invoke('anix:relatedReleases', releaseId, page),
  getNotifications: (page = 0) => ipcRenderer.invoke('anix:notificationsAll', page),
  getNotificationsCount: () => ipcRenderer.invoke('anix:notificationsCount'),
  getHistory: (page = 0) => ipcRenderer.invoke('anix:history', page),
  addToHistory: (releaseId, sourceId, episodePosition) => ipcRenderer.invoke('anix:addToHistory', releaseId, sourceId, episodePosition),
  getVotedReleases: (profileId, page = 0) => ipcRenderer.invoke('anix:votedReleases', profileId, page),
  getFriends: (profileId, page = 0) => ipcRenderer.invoke('anix:friends', profileId, page),
  searchReleases: (query, page = 0) => ipcRenderer.invoke('anix:searchReleases', query, page),
  searchProfiles: (query, page = 0) => ipcRenderer.invoke('anix:searchProfiles', query, page),
  searchCollections: (query, page = 0) => ipcRenderer.invoke('anix:searchCollections', query, page),
  addToFavorites: (releaseId) => ipcRenderer.invoke('anix:addToFavorites', releaseId),
  removeFromFavorites: (releaseId) => ipcRenderer.invoke('anix:removeFromFavorites', releaseId),
  setListStatus: (releaseId, statusId) => ipcRenderer.invoke('anix:setListStatus', releaseId, statusId),
  clearListStatus: (releaseId, statusId) => ipcRenderer.invoke('anix:clearListStatus', releaseId, statusId),
});
