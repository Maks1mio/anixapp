// ── Structured API (window.anixApi) — grouped endpoints ──
export interface AnixApi {
  client: {
    readonly baseUrl: string;
    readonly token: string;
    getBaseUrl: () => Promise<string>;
    setBaseUrl: (baseUrl: string) => Promise<void>;
    pingBaseUrl: (baseUrl: string) => Promise<any>;
    getAuthStatus: () => Promise<{ hasToken: boolean }>;
    checkConnection: () => Promise<boolean>;
    testOffline: () => Promise<void>;
  };

  auth: {
    signIn: (username: string, password: string) => Promise<{ success: boolean; code?: number }>;
    logout: () => Promise<void>;
    getStatus: () => Promise<{ hasToken: boolean }>;
  };

  profile: {
    self: () => Promise<any>;
    info: (id: number) => Promise<{ profile?: unknown }>;
    getFriends: (profileId: number, page?: number) => Promise<any>;
    getBookmarks: (profileId: number, type: number, page?: number) => Promise<any>;
    getVotedReleases: (profileId: number, page?: number) => Promise<any>;
  };

  release: {
    info: (id: number, extended?: boolean) => Promise<{ release?: unknown } & Record<string, unknown>>;
    filter: (page?: number, filterArgs?: Record<string, unknown>, extended?: boolean) => Promise<{ content?: unknown[] }>;
    random: (extended?: boolean) => Promise<{ release?: unknown }>;
    related: (releaseId: number, page?: number) => Promise<any>;
    getDubbers: (releaseId: number) => Promise<{ types?: Array<{ id: number; name: string; icon?: string; episode_count: number; view_count: number }> }>;
    getDubberSources: (releaseId: number, dubberId: number) => Promise<{ sources?: Array<{ id: number; name: string; episode_count: number }> }>;
    getEpisodes: (releaseId: number, dubberId: number, sourceId: number, sort?: number) => Promise<{ episodes?: Array<{ position: number; name: string; url: string; iframe: boolean; is_watched?: boolean }> }>;
    getEpisode: (releaseId: number, sourceId: number, episodePosition: number) => Promise<{ episode?: { position: number; name: string; url: string; iframe: boolean } }>;
    getDirectVideoLink: (embedUrl: string) => Promise<{ directUrl: string | null; quality: string | null }>;
    getVideos: (releaseId: number) => Promise<{ blocks?: Array<{ id: number; title: string; image: string; url: string; category?: { id: number; name: string } }> }>;
    getVideoInCategory: (releaseId: number, categoryId: number, page?: number) => Promise<{ content?: Array<{ id: number; title: string; image: string; url: string }> }>;
    addFavorite: (releaseId: number) => Promise<void>;
    removeFavorite: (releaseId: number) => Promise<void>;
    setListStatus: (releaseId: number, statusId: number) => Promise<void>;
    clearListStatus: (releaseId: number, statusId: number) => Promise<void>;
  };

  feed: {
    latest: (page?: number) => Promise<{ content?: unknown[] }>;
  };

  discover: {
    recommendations: (page?: number) => Promise<{ content?: unknown[] }>;
  };

  search: {
    releases: (query: string, page?: number) => Promise<any>;
    profiles: (query: string, page?: number) => Promise<any>;
    collections: (query: string, page?: number) => Promise<any>;
  };

  collection: {
    info: (id: number) => Promise<any>;
    all: (page?: number, sort?: number) => Promise<{ content?: unknown[] }>;
    getReleases: (id: number, page?: number) => Promise<any>;
    getRandomRelease: (id: number) => Promise<any>;
    addFavorite: (id: number) => Promise<any>;
    removeFavorite: (id: number) => Promise<any>;
  };

  channel: {
    info: (id: number) => Promise<{ channel?: unknown }>;
    getBlog?: (id: number) => Promise<{ channel?: unknown; blogInfo?: unknown }>;
  };

  notification: {
    all: (page?: number) => Promise<any>;
    count: () => Promise<any>;
  };

  history: {
    all: (page?: number) => Promise<any>;
    add: (releaseId: number, sourceId: number, episodePosition: number) => Promise<void>;
    markWatched: (releaseId: number, sourceId: number, episodePosition: number) => Promise<void>;
    unmarkWatched: (releaseId: number, sourceId: number, episodePosition: number) => Promise<void>;
  };

  favorites: {
    all: (page?: number) => Promise<any>;
  };

  article: {
    info: (id: number) => Promise<{ article?: unknown }>;
  };

  settings: {
    getProfileSettings: () => Promise<{
      code?: number;
      avatar: string;
      status: string;
      vkPage: string;
      tgPage: string;
      is_private: boolean;
      privacy_stats: number;
      privacy_counts: number;
      privacy_social: number;
      privacy_friend_requests: number;
      is_vk_bound: boolean;
      is_login_changed: boolean;
      is_change_login_banned: boolean;
      is_change_avatar_banned: boolean;
      channel_id: number;
    }>;
    setStatus: (status: string) => Promise<{ code?: number }>;
    getSocial: () => Promise<{
      code?: number;
      vk_page: string;
      tg_page: string;
      inst_page: string;
      tt_page: string;
      discord_page: string;
    }>;
    setSocial: (data: {
      vk_page: string;
      tg_page: string;
      inst_page: string;
      tt_page: string;
      discord_page: string;
    }) => Promise<{ code?: number }>;
    setPrivacyStats: (state: number) => Promise<{ code?: number }>;
    setPrivacyCounts: (state: number) => Promise<{ code?: number }>;
    setPrivacySocial: (state: number) => Promise<{ code?: number }>;
    setPrivacyFriendRequests: (state: number) => Promise<{ code?: number }>;
    getLoginInfo: () => Promise<{
      code?: number;
      login: string;
      avatar: string;
      is_change_avaliable: boolean;
      last_change_at: number;
      next_change_avaliable_at: number;
    }>;
    changeLogin: (newLogin: string) => Promise<{ code?: number }>;
  };
}

declare global {
  interface Window {
    anixApi: AnixApi;
  }
}

export {};
