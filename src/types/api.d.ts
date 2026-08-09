// ── Structured API (window.anixApi) — grouped endpoints ──

export type OAuthSignInResult = {
  success: boolean;
  code?: number;
  cancelled?: boolean;
  error?: string;
  needsSignup?: boolean;
  email?: string | null;
  suggestedLogins?: string[] | null;
};

export type OAuthSignUpResult = {
  success: boolean;
  code?: number;
  error?: string;
  needsVerify?: boolean;
  hash?: string;
  codeTimestampExpires?: number;
  suggestedLogins?: string[] | null;
};

export type OAuthBindResult = {
  success: boolean;
  code?: number;
  cancelled?: boolean;
  error?: string;
};

export type AuthCodeResult = {
  success: boolean;
  code?: number;
  error?: string;
  needsVerify?: boolean;
  needsLogin?: boolean;
  hash?: string;
  codeTimestampExpires?: number;
  suggestedLogins?: string[] | null;
  available?: boolean;
};

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
    signInWithVk: () => Promise<OAuthSignInResult>;
    signInWithGoogle: () => Promise<OAuthSignInResult>;
    signInWithTelegram: () => Promise<OAuthSignInResult>;
    signInWithYandex: () => Promise<OAuthSignInResult>;
    signUp: (payload: { login: string; email: string; password: string }) => Promise<AuthCodeResult>;
    signUpVerify: (payload: {
      login: string;
      email: string;
      password: string;
      hash: string;
      code: number;
    }) => Promise<AuthCodeResult>;
    signUpResend: (payload: {
      login: string;
      email: string;
      password: string;
      hash: string;
    }) => Promise<AuthCodeResult>;
    checkLogin: (login: string) => Promise<AuthCodeResult>;
    restore: (data: string) => Promise<AuthCodeResult>;
    restoreVerify: (payload: {
      data: string;
      password: string;
      hash: string;
      code: number;
    }) => Promise<AuthCodeResult>;
    restoreResend: (payload: {
      data: string;
      password: string;
      hash: string;
    }) => Promise<AuthCodeResult>;
    completeOAuthSignUp: (payload: { login: string; email: string }) => Promise<OAuthSignUpResult>;
    clearOAuthPending: () => Promise<{ ok: boolean }>;
    submitOAuthUrl: (url: string) => Promise<{ success: boolean; code?: number; error?: string }>;
    cancelOAuth: () => Promise<{ ok: boolean }>;
    bindOAuthService: (provider: 'vk' | 'google' | 'telegram' | 'yandex') => Promise<OAuthBindResult>;
    unbindOAuthService: (provider: 'vk' | 'google' | 'telegram' | 'yandex') => Promise<OAuthBindResult>;
    logout: () => Promise<void>;
    getStatus: () => Promise<{ hasToken: boolean }>;
  };

  profile: {
    self: () => Promise<any>;
    info: (id: number) => Promise<{ profile?: unknown; is_my_profile?: boolean }>;
    getSocialPages: (profileId: number) => Promise<{
      code?: number;
      vk_page?: string;
      tg_page?: string;
      inst_page?: string;
      tt_page?: string;
      discord_page?: string;
    }>;
    getLoginHistory: (profileId: number, page?: number) => Promise<{
      code?: number;
      content?: Array<{
        id?: number;
        newLogin?: string;
        new_login?: string;
        timestamp?: number;
      }>;
    }>;
    getFriends: (profileId: number, page?: number) => Promise<any>;
    sendFriendRequest: (profileId: number) => Promise<{ friend_status?: number | null; code?: number }>;
    removeFriendRequest: (profileId: number) => Promise<{ friend_status?: number | null; code?: number }>;
    hideFriendRequest: (profileId: number) => Promise<{ code?: number }>;
    getFriendRequestsIn: (page?: number) => Promise<{ content?: unknown[]; total_count?: number }>;
    getFriendRequestsOut: (page?: number) => Promise<{ content?: unknown[]; total_count?: number }>;
    getFriendRecommendations: () => Promise<{ content?: unknown[] }>;
    getBookmarks: (profileId: number, type: number, page?: number, sort?: number, filterAnnounce?: number, filter?: number) => Promise<any>;
    getVotedReleases: (profileId: number, page?: number, sort?: number) => Promise<any>;
    getReleaseComments: (profileId: number, page?: number, sort?: number) => Promise<{ content?: Record<string, unknown>[] }>;
    getCollectionComments: (profileId: number, page?: number, sort?: number) => Promise<{ content?: Record<string, unknown>[] }>;
    getArticleComments: (profileId: number, page?: number, sort?: number) => Promise<{ content?: Record<string, unknown>[] }>;
    getFavoriteVideos: (profileId: number, page?: number) => Promise<{ content?: Record<string, unknown>[] }>;
  };

  release: {
    info: (id: number, extended?: boolean) => Promise<{ release?: unknown } & Record<string, unknown>>;
    filter: (page?: number, filterArgs?: Record<string, unknown>, extended?: boolean) => Promise<{ content?: unknown[] }>;
    random: (extended?: boolean) => Promise<{ release?: unknown }>;
    randomFavorite: (extended?: boolean) => Promise<{ release?: unknown }>;
    randomProfileList: (profileId: number, status: number, extended?: boolean) => Promise<{ release?: unknown }>;
    related: (relatedId: number, page?: number) => Promise<any>;
    getDubbers: (releaseId: number) => Promise<{
      types?: Array<{
        id: number;
        name: string;
        icon?: string;
        episode_count?: number;
        view_count?: number;
        pinned?: boolean;
        is_sub?: boolean;
        quality?: number;
      }>;
    }>;
    getDubberSources: (releaseId: number, dubberId: number) => Promise<{
      sources?: Array<{ id: number; name: string; episode_count?: number; quality?: number }>;
    }>;
    getEpisodes: (releaseId: number, dubberId: number, sourceId: number, sort?: number) => Promise<{ episodes?: Array<{ position: number; name: string; url: string; iframe: boolean; is_watched?: boolean }> }>;
    getEpisode: (releaseId: number, sourceId: number, episodePosition: number) => Promise<{ episode?: { position: number; name: string; url: string; iframe: boolean } }>;
    getEpisodeUpdates: (releaseId: number, page?: number) => Promise<{
      content?: Array<{
        last_episode_update_date?: number;
        last_episode_update_name?: string;
        last_episode_source_update_id?: number;
        last_episode_source_update_name?: string;
        last_episode_type_update_id?: number;
        lastEpisodeTypeUpdateName?: string;
      }>;
      total_count?: number;
      total_page_count?: number;
      current_page?: number;
    }>;
    getDirectVideoLink: (embedUrl: string) => Promise<{ directUrl: string | null; quality: string | null }>;
    getVideos: (releaseId: number) => Promise<{
      blocks?: Array<{ category?: { id: number; name: string }; videos?: unknown[] }>;
      streaming_platforms?: Array<{ id: number; name: string; icon?: string; url: string }>;
      last_videos?: unknown[];
    }>;
    getVideoInCategory: (releaseId: number, categoryId: number, page?: number) => Promise<{ content?: unknown[] }>;
    addFavorite: (releaseId: number) => Promise<void>;
    removeFavorite: (releaseId: number) => Promise<void>;
    setListStatus: (releaseId: number, statusId: number) => Promise<void>;
    clearListStatus: (releaseId: number, statusId: number) => Promise<void>;
    vote: (releaseId: number, vote: number) => Promise<{ code?: number; release?: unknown }>;
    deleteVote: (releaseId: number) => Promise<{ code?: number; release?: unknown }>;
    schedule: () => Promise<Record<string, unknown>>;
  };

  comments: {
    release: {
      list: (releaseId: number, page?: number, sort?: number) => Promise<{
        content?: Record<string, unknown>[];
        total_count?: number;
        total_elements?: number;
        last?: boolean;
      }>;
      get: (commentId: number) => Promise<Record<string, unknown>>;
      replies: (commentId: number, page?: number, sort?: number) => Promise<{
        content?: Record<string, unknown>[];
      }>;
      vote: (commentId: number, vote: number) => Promise<{ code?: number }>;
      add: (
        releaseId: number,
        body: {
          message: string;
          isSpoiler?: boolean;
          spoiler?: boolean;
          parentCommentId?: number | null;
          replyToProfileId?: number | null;
        },
      ) => Promise<{ comment?: Record<string, unknown>; code?: number }>;
      edit: (
        commentId: number,
        body: {
          message: string;
          isSpoiler?: boolean;
          spoiler?: boolean;
        },
      ) => Promise<{ code?: number }>;
      delete: (commentId: number) => Promise<{ code?: number }>;
    };
  };

  type: {
    all: () => Promise<{
      code?: number;
      types?: Array<{
        id: number;
        name: string;
        icon?: string | null;
        workers?: string;
        is_sub?: boolean;
        channel_id?: number | null;
        episodes_count?: number;
        view_count?: number;
        pinned?: boolean;
        quality?: number;
      }>;
    }>;
    pin: (releaseId: number, typeId: number) => Promise<{ code?: number }>;
    unpin: (releaseId: number, typeId: number) => Promise<{ code?: number }>;
  };

  feed: {
    latest: (page?: number) => Promise<{ content?: unknown[] }>;
  };

  discover: {
    recommendations: (page?: number, previousPage?: number) => Promise<{ content?: unknown[] }>;
    interesting: () => Promise<{ content?: unknown[] }>;
    watching: (page?: number) => Promise<{ content?: unknown[] }>;
    discussing: () => Promise<{ content?: unknown[] }>;
    commentsWeek: () => Promise<{ content?: unknown[] }>;
    collectionsWeek: (page?: number, previousPage?: number) => Promise<{ content?: unknown[] }>;
  };

  search: {
    releases: (query: string, page?: number, searchBy?: number) => Promise<any>;
    profiles: (query: string, page?: number) => Promise<any>;
    collections: (query: string, page?: number) => Promise<any>;
  };

  collection: {
    info: (id: number) => Promise<any>;
    all: (page?: number, options?: { sort?: number; where?: number; previousPage?: number }) => Promise<{ content?: unknown[]; last?: boolean; total_page_count?: number; current_page?: number }>;
    profileCollections: (profileId: number, page?: number) => Promise<{ content?: unknown[]; last?: boolean }>;
    favorites: (page?: number) => Promise<{ content?: unknown[]; total_count?: number }>;
    getReleases: (id: number, page?: number) => Promise<any>;
    getRandomRelease: (id: number) => Promise<any>;
    addFavorite: (id: number) => Promise<any>;
    removeFavorite: (id: number) => Promise<any>;
  };

  collectionMy: {
    create: (body: {
      title: string;
      description: string;
      releases: number[];
      is_private: boolean;
    }) => Promise<any>;
    edit: (
      id: number,
      body: {
        title: string;
        description: string;
        releases: number[];
        is_private: boolean;
      },
    ) => Promise<any>;
    editImage: (id: number, imageBase64: string, fileName?: string) => Promise<any>;
    releaseAdd: (id: number, releaseId: number) => Promise<any>;
    delete: (id: number) => Promise<any>;
  };

  channel: {
    info: (id: number) => Promise<{ channel?: unknown }>;
    getBlog?: (id: number) => Promise<{ channel?: unknown; blogInfo?: unknown }>;
  };

  notification: {
    all: (page?: number) => Promise<any>;
    count: () => Promise<any>;
    read: () => Promise<any>;
  };

  history: {
    all: (page?: number) => Promise<any>;
    delete: (releaseId: number) => Promise<void>;
    add: (releaseId: number, sourceId: number, episodePosition: number) => Promise<void>;
    markWatched: (releaseId: number, sourceId: number, episodePosition: number) => Promise<void>;
    unmarkWatched: (releaseId: number, sourceId: number, episodePosition: number) => Promise<void>;
  };

  favorites: {
    all: (page?: number, sort?: number, filterAnnounce?: number, filter?: number) => Promise<any>;
  };

  article: {
    info: (id: number) => Promise<{ article?: unknown }>;
  };

  home: {
    getCustomTab: () => Promise<{
      tabName: string;
      filter: Record<string, unknown> | null;
      activeTab: string | null;
    }>;
    setCustomTab: (data: {
      tabName: string;
      filter: Record<string, unknown> | null;
      activeTab?: string | null;
    }) => Promise<{ ok: boolean }>;
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
      isVkBound?: boolean;
      is_goolge_bound?: boolean;
      is_google_bound?: boolean;
      isGoogleBound?: boolean;
      is_telegram_bound?: boolean;
      isTelegramBound?: boolean;
      is_yandex_bound?: boolean;
      isYandexBound?: boolean;
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
    /** Present in Electron preload; absent in plain web builds */
    anixApi?: AnixApi;
  }
}

export {};
