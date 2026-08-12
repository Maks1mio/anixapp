/**
 * Browser dev API — тот же window.anixApi, что в Electron preload,
 * но через Vite middleware /__anix/invoke.
 */
import type { AnixApi } from '../types/api';

const INVOKE_URL = '/__anix/invoke';

async function invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
  const res = await fetch(INVOKE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ channel, args }),
  });
  const json = await res.json() as { ok?: boolean; data?: T; error?: string };
  if (!res.ok || json.ok === false) {
    throw new Error(json.error || `API error ${res.status}`);
  }
  return json.data as T;
}

function buildWebAnixApi(): AnixApi {
  return {
    client: {
      get baseUrl() { return '(use anixApi.client.getBaseUrl())'; },
      get token() { return '(use anixApi.client.getAuthStatus())'; },
      getBaseUrl: () => invoke('anix:getBaseUrl'),
      setBaseUrl: (baseUrl) => invoke('anix:setBaseUrl', baseUrl),
      pingBaseUrl: (baseUrl) => invoke('anix:pingBaseUrl', baseUrl),
      getAuthStatus: () => invoke('anix:getAuthStatus'),
      checkConnection: () => invoke('anix:checkConnection'),
      testOffline: () => invoke('anix:testOffline'),
    },

    auth: {
      signIn: (username, password) => invoke('anix:login', username, password),
      signInWithVk: () => invoke('anix:loginVk'),
      signInWithGoogle: () => invoke('anix:loginGoogle'),
      signInWithTelegram: () => invoke('anix:loginTelegram'),
      signInWithYandex: () => invoke('anix:loginYandex'),
      signUp: (payload) => invoke('anix:signUp', payload),
      signUpVerify: (payload) => invoke('anix:signUpVerify', payload),
      signUpResend: (payload) => invoke('anix:signUpResend', payload),
      checkLogin: (login) => invoke('anix:checkLogin', login),
      restore: (data) => invoke('anix:restore', data),
      restoreVerify: (payload) => invoke('anix:restoreVerify', payload),
      restoreResend: (payload) => invoke('anix:restoreResend', payload),
      completeOAuthSignUp: (payload) => invoke('anix:oauthCompleteSignUp', payload),
      clearOAuthPending: () => invoke('anix:oauthClearPending'),
      submitOAuthUrl: (url: string) => invoke('anix:oauthSubmitUrl', url),
      cancelOAuth: () => invoke('anix:oauthCancel'),
      bindOAuthService: (provider: string) => invoke('anix:bindOAuthService', provider),
      unbindOAuthService: (provider: string) => invoke('anix:unbindOAuthService', provider),
      logout: () => invoke('anix:logout'),
      getStatus: () => invoke('anix:getAuthStatus'),
    },

    profile: {
      self: () => invoke('anix:selfProfile'),
      info: (id) => invoke('anix:profileById', id),
      getSocialPages: (profileId) => invoke('anix:profileSocial', profileId),
      getLoginHistory: (profileId, page = 0) => invoke('anix:loginHistory', profileId, page),
      getFriends: (profileId, page = 0) => invoke('anix:friends', profileId, page),
      sendFriendRequest: (profileId) => invoke('anix:friendRequestSend', profileId),
      removeFriendRequest: (profileId) => invoke('anix:friendRequestRemove', profileId),
      hideFriendRequest: (profileId) => invoke('anix:friendRequestHide', profileId),
      getFriendRequestsIn: (page = 0) => invoke('anix:friendRequestsIn', page),
      getFriendRequestsOut: (page = 0) => invoke('anix:friendRequestsOut', page),
      getFriendRecommendations: () => invoke('anix:friendRecommendations'),
      getBookmarks: (profileId, type, page = 0, sort = 1, filterAnnounce = 0, filter = 0) =>
        invoke('anix:getBookmarks', profileId, type, page, sort, filterAnnounce, filter),
      getVotedReleases: (profileId, page = 0, sort = 1) =>
        invoke('anix:votedReleases', profileId, page, sort),
      getReleaseComments: (profileId, page = 0, sort = 1) =>
        invoke('anix:profileReleaseComments', profileId, page, sort),
      getCollectionComments: (profileId, page = 0, sort = 1) =>
        invoke('anix:profileCollectionComments', profileId, page, sort),
      getArticleComments: (profileId, page = 0, sort = 1) =>
        invoke('anix:profileArticleComments', profileId, page, sort),
      getFavoriteVideos: (profileId, page = 0) =>
        invoke('anix:profileFavoriteVideos', profileId, page),
    },

    release: {
      info: (id, extended = true) => invoke('anix:releaseById', id, extended),
      filter: (page = 0, filterArgs = {}, extended = true) =>
        invoke('anix:filterReleases', page, filterArgs, extended),
      random: (extended = true) => invoke('anix:randomRelease', extended),
      randomFavorite: (extended = true) => invoke('anix:randomFavorite', extended),
      randomProfileList: (profileId, status, extended = true) =>
        invoke('anix:randomProfileList', profileId, status, extended),
      related: (relatedId, page = 0) => invoke('anix:relatedReleases', relatedId, page),
      getDubbers: (releaseId) => invoke('anix:getDubbers', releaseId),
      getDubberSources: (releaseId, dubberId) => invoke('anix:getDubberSources', releaseId, dubberId),
      getEpisodes: (releaseId, dubberId, sourceId, sort = 1) =>
        invoke('anix:getEpisodes', releaseId, dubberId, sourceId, sort),
      getEpisode: (releaseId, sourceId, episodePosition) =>
        invoke('anix:getEpisode', releaseId, sourceId, episodePosition),
      getEpisodeUpdates: (releaseId, page = 0) => invoke('anix:getEpisodeUpdates', releaseId, page),
      getDirectVideoLink: (embedUrl) => invoke('anix:getDirectVideoLink', embedUrl),
      getVideos: (releaseId) => invoke('anix:getVideos', releaseId),
      getVideoInCategory: (releaseId, categoryId, page = 1) =>
        invoke('anix:getVideoInCategory', releaseId, categoryId, page),
      addFavorite: (releaseId) => invoke('anix:addToFavorites', releaseId),
      removeFavorite: (releaseId) => invoke('anix:removeFromFavorites', releaseId),
      setListStatus: (releaseId, statusId) => invoke('anix:setListStatus', releaseId, statusId),
      clearListStatus: (releaseId, statusId) => invoke('anix:clearListStatus', releaseId, statusId),
      vote: (releaseId, vote) => invoke('anix:releaseVote', releaseId, vote),
      deleteVote: (releaseId) => invoke('anix:releaseDeleteVote', releaseId),
      schedule: () => invoke('anix:schedule'),
    },

    comments: {
      release: {
        list: (releaseId, page = 0, sort = 1) => invoke('anix:releaseComments', releaseId, page, sort),
        get: (commentId) => invoke('anix:releaseCommentById', commentId),
        replies: (commentId, page = 0, sort = 2) =>
          invoke('anix:releaseCommentReplies', commentId, page, sort),
        vote: (commentId, vote) => invoke('anix:releaseCommentVote', commentId, vote),
        votes: (commentId, page = 0, sort = 2) =>
          invoke('anix:releaseCommentVotes', commentId, page, sort),
        add: (releaseId, body) => invoke('anix:releaseCommentAdd', releaseId, body),
        edit: (commentId, body) => invoke('anix:releaseCommentEdit', commentId, body),
        delete: (commentId) => invoke('anix:releaseCommentDelete', commentId),
      },
    },

    type: {
      all: () => invoke('anix:typeAll'),
      pin: (releaseId, typeId) => invoke('anix:typePin', releaseId, typeId),
      unpin: (releaseId, typeId) => invoke('anix:typeUnpin', releaseId, typeId),
    },

    feed: {
      latest: (page = 1) => invoke('anix:latestFeed', page),
    },

    discover: {
      recommendations: (page = -1, previousPage = -1) =>
        invoke('anix:discoverRecommendations', page, previousPage),
      interesting: () => invoke('anix:discoverInteresting'),
      watching: (page = 0) => invoke('anix:discoverWatching', page),
      discussing: () => invoke('anix:discoverDiscussing'),
      commentsWeek: () => invoke('anix:discoverCommentsWeek'),
      collectionsWeek: (page = -1, previousPage = 0) =>
        invoke('anix:discoverCollectionsWeek', page, previousPage),
    },

    search: {
      releases: (query, page = 0, searchBy = 0) => invoke('anix:searchReleases', query, page, searchBy),
      profiles: (query, page = 0) => invoke('anix:searchProfiles', query, page),
      collections: (query, page = 0) => invoke('anix:searchCollections', query, page),
    },

    collection: {
      info: (id) => invoke('anix:collectionById', id),
      all: (page = 0, options = {}) => invoke('anix:collectionsAll', page, options),
      profileCollections: (profileId, page = 0) =>
        invoke('anix:collectionProfileCollections', profileId, page),
      favorites: (page = 0) => invoke('anix:collectionFavorites', page),
      getReleases: (id, page = 0) => invoke('anix:collectionReleases', id, page),
      getRandomRelease: (id) => invoke('anix:collectionRandomRelease', id),
      addFavorite: (id) => invoke('anix:addCollectionFavorite', id),
      removeFavorite: (id) => invoke('anix:removeCollectionFavorite', id),
    },

    collectionMy: {
      create: (body) => invoke('anix:collectionMyCreate', body),
      edit: (id, body) => invoke('anix:collectionMyEdit', id, body),
      editImage: (id, imageBase64, fileName) =>
        invoke('anix:collectionMyEditImage', id, imageBase64, fileName),
      releaseAdd: (id, releaseId) => invoke('anix:collectionMyReleaseAdd', id, releaseId),
      delete: (id) => invoke('anix:collectionMyDelete', id),
    },

    channel: {
      info: (id) => invoke('anix:channelById', id),
      getBlog: (id) => invoke('anix:channelBlog', id),
      uploadCover: (channelId, imageBase64, fileName) =>
        invoke('anix:channelUploadCover', channelId, imageBase64, fileName),
      deleteCover: (channelId) => invoke('anix:channelDeleteCover', channelId),
      createBlog: () => invoke('anix:channelCreateBlog'),
    },

    notification: {
      all: (page = 0) => invoke('anix:notificationsAll', page),
      count: () => invoke('anix:notificationsCount'),
      read: () => invoke('anix:notificationsRead'),
    },

    history: {
      all: (page = 0) => invoke('anix:history', page),
      delete: (releaseId) => invoke('anix:deleteFromHistory', releaseId),
      add: (releaseId, sourceId, episodePosition) =>
        invoke('anix:addToHistory', releaseId, sourceId, episodePosition),
      markWatched: (releaseId, sourceId, episodePosition) =>
        invoke('anix:markEpisodeAsWatched', releaseId, sourceId, episodePosition),
      unmarkWatched: (releaseId, sourceId, episodePosition) =>
        invoke('anix:unmarkEpisodeAsWatched', releaseId, sourceId, episodePosition),
    },

    favorites: {
      all: (page = 0, sort = 1, filterAnnounce = 0, filter = 0) =>
        invoke('anix:favorites', page, sort, filterAnnounce, filter),
    },

    article: {
      info: (id) => invoke('anix:articleById', id),
    },

    home: {
      getCustomTab: () => invoke('anix:homeCustomTabGet'),
      setCustomTab: (data) => invoke('anix:homeCustomTabSet', data),
    },

    settings: {
      getProfileSettings: () => invoke('anix:getProfileSettings'),
      setStatus: (status) => invoke('anix:setStatus', status),
      getSocial: () => invoke('anix:getSocial'),
      setSocial: (data) => invoke('anix:setSocial', data),
      setPrivacyStats: (state) => invoke('anix:setPrivacyStats', state),
      setPrivacyCounts: (state) => invoke('anix:setPrivacyCounts', state),
      setPrivacySocial: (state) => invoke('anix:setPrivacySocial', state),
      setPrivacyFriendRequests: (state) => invoke('anix:setPrivacyFriendRequests', state),
      getLoginInfo: () => invoke('anix:getLoginInfo'),
      changeLogin: (newLogin) => invoke('anix:changeLogin', newLogin),
      getBadges: (page = 0) => invoke('anix:getBadges', page),
      setBadge: (id) => invoke('anix:setBadge', id),
      removeBadge: () => invoke('anix:removeBadge'),
      selectTheme: (id) => invoke('anix:selectTheme', id),
      setAvatar: (imageBase64, fileName) => invoke('anix:setAvatar', imageBase64, fileName),
      deleteAvatar: () => invoke('anix:deleteAvatar'),
    },
  };
}

/** Подключает window.anixApi в браузере (только dev с Vite plugin). */
export async function initWebAnixApi(): Promise<boolean> {
  if (typeof window === 'undefined' || window.anixApi || window.electron) return false;

  try {
    const health = await fetch('/__anix/health');
    if (!health.ok) return false;
    window.anixApi = buildWebAnixApi();
    return true;
  } catch {
    return false;
  }
}

export function isWebAnixApi(): boolean {
  return typeof window !== 'undefined' && !!window.anixApi && !window.electron;
}
