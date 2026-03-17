export interface AnixApi {
  getAuthStatus: () => Promise<{ hasToken: boolean }>;
  getBaseUrl: () => Promise<string>;
  setBaseUrl: (baseUrl: string) => Promise<void>;
  login: (username: string, password: string) => Promise<{ success: boolean; code?: number }>;
  logout: () => Promise<void>;
  getSelfProfile: () => Promise<any>;
  getReleaseById: (id: number, extended?: boolean) => Promise<{ release?: unknown }>;
  getDubbers: (releaseId: number) => Promise<{ types?: Array<{ id: number; name: string; icon?: string; episode_count: number; view_count: number }> }>;
  getDubberSources: (releaseId: number, dubberId: number) => Promise<{ sources?: Array<{ id: number; name: string; episode_count: number }> }>;
  getEpisodes: (releaseId: number, dubberId: number, sourceId: number, sort?: number) => Promise<{ episodes?: Array<{ position: number; name: string; url: string; iframe: boolean; is_watched?: boolean }> }>;
  getEpisode: (releaseId: number, sourceId: number, episodePosition: number) => Promise<{ episode?: { position: number; name: string; url: string; iframe: boolean } }>;
  getDirectVideoLink: (embedUrl: string) => Promise<{ directUrl: string | null; quality: string | null }>;
  getVideos: (releaseId: number) => Promise<{ blocks?: Array<{ id: number; title: string; image: string; url: string; category?: { id: number; name: string } }> }>;
  getVideoInCategory: (releaseId: number, categoryId: number, page?: number) => Promise<{ content?: Array<{ id: number; title: string; image: string; url: string }> }>;
  getRandomRelease: (extended?: boolean) => Promise<{ release?: unknown }>;
  getLatestFeed: (page?: number) => Promise<{ content?: unknown[] }>;
  getDiscoverRecommendations: (page?: number) => Promise<{ content?: unknown[] }>;
  getArticleById: (id: number) => Promise<{ article?: unknown }>;
  getChannelById: (id: number) => Promise<{ channel?: unknown }>;
  getProfileById: (id: number) => Promise<{ profile?: unknown }>;
  getCollectionById: (id: number) => Promise<any>;
  getCollectionReleases: (id: number, page?: number) => Promise<any>;
  getCollectionRandomRelease: (id: number) => Promise<any>;
  addCollectionFavorite: (id: number) => Promise<any>;
  removeCollectionFavorite: (id: number) => Promise<any>;
  getAllCollections: (page?: number, sort?: number) => Promise<{ content?: unknown[] }>;
  getFavorites: (page?: number) => Promise<any>;
  getBookmarks: (profileId: number, type: number, page?: number) => Promise<any>;
  getRelatedReleases: (releaseId: number, page?: number) => Promise<any>;
  getNotifications: (page?: number) => Promise<any>;
  getNotificationsCount: () => Promise<any>;
  getHistory: (page?: number) => Promise<any>;
  addToHistory: (releaseId: number, sourceId: number, episodePosition: number) => Promise<void>;
  markEpisodeAsWatched: (releaseId: number, sourceId: number, episodePosition: number) => Promise<void>;
  unmarkEpisodeAsWatched: (releaseId: number, sourceId: number, episodePosition: number) => Promise<void>;
  getVotedReleases: (profileId: number, page?: number) => Promise<any>;
  getFriends: (profileId: number, page?: number) => Promise<any>;
  searchReleases: (query: string, page?: number) => Promise<any>;
  searchProfiles: (query: string, page?: number) => Promise<any>;
  searchCollections: (query: string, page?: number) => Promise<any>;
  addToFavorites: (releaseId: number) => Promise<void>;
  removeFromFavorites: (releaseId: number) => Promise<void>;
  setListStatus: (releaseId: number, statusId: number) => Promise<void>;
  clearListStatus: (releaseId: number, statusId: number) => Promise<void>;
}

declare global {
  interface Window {
    anix: AnixApi;
  }
}

export {};
