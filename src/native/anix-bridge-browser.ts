/* eslint-disable @typescript-eslint/no-explicit-any */
import { Anixart, BookmarkSortType, BookmarkType, DefaultResult } from 'anixapi';
import { attachLegacyEndpoints } from './legacy-endpoints';
import { isTvMode } from '../platform/tv';
import { tvBridgeInvokeUrl } from '../constants/tv-bridge';

const CONFIG_KEY = 'anixapp.native.config';
const CUSTOM_TAB_KEY = 'anixapp.homeCustomFilters';
const DEFAULT_BASE_URL = 'https://api-s.anixsekai.com';

const LIST_STATUS_TO_TYPE: Record<string, number> = {
  watching: BookmarkType.Watching,
  planned: BookmarkType.InPlans,
  completed: BookmarkType.Completed,
  on_hold: BookmarkType.HoldOn,
  dropped: BookmarkType.Dropped,
};

type NativeConfig = {
  token: string | null;
  baseUrl: string;
  profileId: number | null;
  profileLogin: string | null;
  profileAvatar: string | null;
  profileRaw: Record<string, unknown> | null;
};

type Handler = (c: BridgeCtx, args: unknown[]) => Promise<unknown>;

type BridgeCtx = {
  getClient: () => any;
  createClient: (opts?: { baseUrl?: string; token?: string | null }) => any;
  loadConfig: () => NativeConfig;
  saveConfig: (partial: Partial<NativeConfig>) => void;
  resetClient: () => void;
};

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function toPositiveInt(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
}

function h(fn: (c: BridgeCtx, ...args: any[]) => unknown): Handler {
  return async (c, args) => fn(c, ...(args ?? []));
}

export function createBrowserAnixBridge() {
  let anixart: any = null;

  function loadConfig(): NativeConfig {
    const raw = readJson<Partial<NativeConfig>>(CONFIG_KEY, {});
    return {
      token: raw.token ?? null,
      baseUrl: raw.baseUrl || DEFAULT_BASE_URL,
      profileId: raw.profileId ?? null,
      profileLogin: raw.profileLogin ?? null,
      profileAvatar: raw.profileAvatar ?? null,
      profileRaw: raw.profileRaw ?? null,
    };
  }

  function saveConfig(partial: Partial<NativeConfig>) {
    const next = { ...loadConfig(), ...partial };
    localStorage.setItem(CONFIG_KEY, JSON.stringify(next));
    if ('token' in partial || 'baseUrl' in partial) anixart = null;
  }

  function createClient({ baseUrl, token }: { baseUrl?: string; token?: string | null } = {}) {
    const cfg = loadConfig();
    return attachLegacyEndpoints(new Anixart({
      baseUrl: baseUrl ?? cfg.baseUrl,
      token: token ?? cfg.token ?? undefined,
    }) as any);
  }

  function getClient() {
    if (!anixart) anixart = createClient();
    return anixart;
  }

  function resetClient() {
    anixart = null;
  }

  const ctx = (): BridgeCtx => ({
    getClient,
    createClient,
    loadConfig,
    saveConfig,
    resetClient,
  });

  const HANDLERS: Record<string, Handler> = {
    'anix:getAuthStatus': async (c) => ({ hasToken: !!c.loadConfig().token }),
    'anix:checkConnection': async (c) => {
      if (!c.loadConfig().token) return { ok: true };
      await c.getClient().endpoints.feed.latest(1);
      return { ok: true };
    },
    'anix:login': async (c, [username, password]) => {
      const { baseUrl } = c.loadConfig();
      const loginClient = c.createClient({ baseUrl, token: undefined });
      const res = await loginClient.endpoints.auth.signIn({ login: username, password });
      const profile = res?.profile;
      const profileToken = res?.profileToken;
      if (res?.code === DefaultResult.Ok && profileToken?.token) {
        c.saveConfig({
          token: profileToken.token,
          profileId: profile?.id ?? null,
          profileLogin: profile?.login ?? null,
          profileAvatar: profile?.avatar ?? null,
          profileRaw: profile || null,
        });
        c.resetClient();
        return { success: true };
      }
      return { success: false, code: res?.code };
    },
    'anix:signUp': async (c, [payload]) => {
      const login = String((payload as any)?.login || '').trim();
      const email = String((payload as any)?.email || '').trim();
      const password = String((payload as any)?.password || '');
      if (!login || !email || !password) return { success: false, error: 'fields_required' };
      const client = c.createClient({ token: undefined });
      const res = await client.endpoints.auth.signUp({ login, email, password });
      return { success: res?.code === DefaultResult.Ok, hash: res?.hash, code: res?.code };
    },
    'anix:signUpVerify': async (c, [payload]) => {
      const client = c.createClient({ token: undefined });
      return client.endpoints.auth.signUpVerify(payload);
    },
    'anix:signUpResend': async (c, [payload]) => {
      const client = c.createClient({ token: undefined });
      return client.endpoints.auth.signUpResend(payload);
    },
    'anix:checkLogin': async (c, [loginValue]) => c.getClient().endpoints.auth.checkLogin(loginValue),
    'anix:restore': async (c, [dataValue]) => {
      const client = c.createClient({ token: undefined });
      return client.endpoints.auth.restore(dataValue);
    },
    'anix:restoreVerify': async (c, [payload]) => {
      const client = c.createClient({ token: undefined });
      return client.endpoints.auth.restoreVerify(payload);
    },
    'anix:restoreResend': async (c, [payload]) => {
      const client = c.createClient({ token: undefined });
      return client.endpoints.auth.restoreResend(payload);
    },
    'anix:loginVk': async () => ({ success: false, error: 'oauth_electron_only' }),
    'anix:loginGoogle': async () => ({ success: false, error: 'oauth_electron_only' }),
    'anix:loginTelegram': async () => ({ success: false, error: 'oauth_electron_only' }),
    'anix:loginYandex': async () => ({ success: false, error: 'oauth_electron_only' }),
    'anix:bindOAuthService': async () => ({ success: false, error: 'oauth_electron_only' }),
    'anix:unbindOAuthService': h(async (c, provider) => c.getClient().endpoints.auth.unbindOAuth?.(provider)),
    'anix:oauthCompleteSignUp': async () => ({ success: false, error: 'oauth_electron_only' }),
    'anix:oauthClearPending': async () => ({ ok: true }),
    'anix:oauthSubmitUrl': async () => ({ success: false, error: 'oauth_electron_only' }),
    'anix:oauthCancel': async () => ({ ok: true }),
    'anix:logout': async (c) => {
      c.saveConfig({
        token: null,
        profileId: null,
        profileLogin: null,
        profileAvatar: null,
        profileRaw: null,
      });
      c.resetClient();
      return { ok: true };
    },
    'anix:getBaseUrl': async (c) => c.loadConfig().baseUrl,
    'anix:setBaseUrl': async (c, [baseUrl]) => {
      c.saveConfig({ baseUrl: String(baseUrl || DEFAULT_BASE_URL) });
      return { ok: true };
    },
    'anix:pingBaseUrl': async (_c, [baseUrl]) => {
      const url = String(baseUrl || DEFAULT_BASE_URL).replace(/\/$/, '');
      const res = await fetch(`${url}/`);
      return { ok: res.ok, status: res.status };
    },
    'anix:testOffline': async () => {
      throw new Error('TypeError: fetch failed (test)');
    },
    'anix:selfProfile': async (c) => {
      const config = c.loadConfig();
      const profileId = config.profileId || (config.profileRaw as any)?.id || null;
      if (profileId) {
        const data = await c.getClient().endpoints.profile.info(profileId);
        if (data && data.is_my_profile === false) {
          c.saveConfig({ profileId: null, profileLogin: null, profileAvatar: null, profileRaw: null });
          return { profile: null, session_mismatch: true };
        }
        if (data?.profile) return data;
      }
      if (config.profileRaw) return { code: 0, profile: config.profileRaw, is_my_profile: true };
      return null;
    },
    'anix:releaseById': h((c, id, extended = true) => {
      const releaseId = toPositiveInt(id);
      if (releaseId == null) return null;
      return c.getClient().endpoints.release.info(releaseId, extended);
    }),
    'anix:getVideos': h((c, releaseId) => {
      const id = toPositiveInt(releaseId);
      if (id == null) return { types: [] };
      return c.getClient().endpoints.release.getVideos(id);
    }),
    'anix:getVideoInCategory': h((c, releaseId, categoryId, page = 1) => {
      const id = toPositiveInt(releaseId);
      const cat = toPositiveInt(categoryId);
      if (id == null || cat == null) return { videos: [] };
      return c.getClient().endpoints.release.getVideoInCategory({ id, categoryId: cat, page });
    }),
    'anix:getDubbers': h((c, releaseId) => {
      const id = toPositiveInt(releaseId);
      if (id == null) return { types: [] };
      return c.getClient().endpoints.release.getDubbers(id);
    }),
    'anix:typeAll': h((c) => c.getClient().endpoints.type.types()),
    'anix:typePin': h((c, releaseId, typeId) => c.getClient().endpoints.type.pin(toPositiveInt(releaseId), toPositiveInt(typeId))),
    'anix:typeUnpin': h((c, releaseId, typeId) => c.getClient().endpoints.type.unpin(toPositiveInt(releaseId), toPositiveInt(typeId))),
    'anix:getDubberSources': h((c, releaseId, dubberId) =>
      c.getClient().endpoints.release.getDubberSources(toPositiveInt(releaseId), toPositiveInt(dubberId))),
    'anix:getEpisodes': h((c, releaseId, dubberId, sourceId, sort = 1) =>
      c.getClient().endpoints.release.getEpisodes(toPositiveInt(releaseId), toPositiveInt(dubberId), toPositiveInt(sourceId), sort)),
    'anix:getEpisode': h((c, releaseId, sourceId, episodePosition) =>
      c.getClient().endpoints.release.getEpisode(toPositiveInt(releaseId), toPositiveInt(sourceId), episodePosition)),
    'anix:getEpisodeUpdates': h((c, releaseId, page = 0) =>
      c.getClient().endpoints.release.episodeUpdates?.(toPositiveInt(releaseId), page)),
    'anix:getDirectVideoLink': async (_c, args) => {
      const embedUrl = String(args?.[0] || '');
      // TV web prod: Kodik resolve on api.anixapp.com (tv.anixapp.com static nginx → 405 on POST).
      if (import.meta.env.PROD && isTvMode()) {
        const res = await fetch(tvBridgeInvokeUrl(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ channel: 'anix:getDirectVideoLink', args: [embedUrl] }),
        });
        const json = await res.json() as { ok?: boolean; data?: unknown; error?: string };
        if (!res.ok || json.ok === false) {
          throw new Error(json.error || `Не удалось получить ссылку (${res.status})`);
        }
        return json.data;
      }
      const { getDirectVideoLink } = await import('./kodik-direct');
      return getDirectVideoLink(embedUrl);
    },
    'anix:randomRelease': h((c, extended = true) => c.getClient().endpoints.release.getRandomRelease(extended)),
    'anix:latestFeed': h((c, page = 0) => c.getClient().endpoints.feed.latest(page)),
    'anix:myFeed': h((c, page = 0, opts = {}) => c.getClient().endpoints.feed.my?.(page, opts) ?? c.getClient().endpoints.feed.latest(page)),
    'anix:discoverRecommendations': async (c, [page = -1, previousPage = -1]) =>
      c.getClient().endpoints.discover.getRecommendations(page, previousPage),
    'anix:discoverInteresting': async (c) => c.getClient().endpoints.discover.interesting(),
    'anix:discoverWatching': async (c, [page = 0]) => c.getClient().endpoints.discover.watching(page),
    'anix:discoverDiscussing': async (c) => c.getClient().endpoints.discover.discussing(),
    'anix:discoverCommentsWeek': async (c) => c.getClient().endpoints.discover.commentsWeek(),
    'anix:discoverCollectionsWeek': async (c, [page = -1, previousPage = 0]) =>
      c.getClient().endpoints.discover.collectionsWeek(page, previousPage),
    'anix:filterReleases': h((c, page = 0, filterArgs = {}, extended = true) =>
      c.getClient().endpoints.release.filter(page, filterArgs, extended)),
    'anix:homeCustomTabGet': async (c) => {
      const profileId = c.loadConfig().profileId;
      if (!profileId) return { tabName: '', filter: null, activeTab: null };
      const store = readJson<Record<string, unknown>>(CUSTOM_TAB_KEY, {});
      return store[String(profileId)] ?? { tabName: '', filter: null, activeTab: null };
    },
    'anix:homeCustomTabSet': async (c, [data]) => {
      const profileId = c.loadConfig().profileId;
      if (!profileId) throw new Error('Not logged in');
      const store = readJson<Record<string, unknown>>(CUSTOM_TAB_KEY, {});
      store[String(profileId)] = {
        tabName: typeof (data as any)?.tabName === 'string' ? (data as any).tabName : '',
        filter: (data as any)?.filter ?? null,
        activeTab: typeof (data as any)?.activeTab === 'string' ? (data as any).activeTab : null,
      };
      localStorage.setItem(CUSTOM_TAB_KEY, JSON.stringify(store));
      return { ok: true };
    },
    'anix:articleById': h((c, id) => c.getClient().endpoints.channel.getArticle(id)),
    'anix:articleVote': h((c, id, vote) => c.getClient().endpoints.article.vote(id, vote)),
    'anix:channelById': h((c, id) => c.getClient().endpoints.channel.info(id)),
    'anix:channelArticles': h((c, channelId, page = 0) => c.getClient().endpoints.channel.articles(channelId, page)),
    'anix:channelSubscribe': h((c, channelId) => c.getClient().endpoints.channel.subscribe(channelId)),
    'anix:channelUnsubscribe': h((c, channelId) => c.getClient().endpoints.channel.unsubscribe(channelId)),
    'anix:channelSubscriptions': h((c, page = 0) => c.getClient().endpoints.channel.subscriptions(page)),
    'anix:channelEditorAll': h((c) => c.getClient().endpoints.channel.editorAvailableAll()),
    'anix:channelBlog': h((c, id) => c.getClient().endpoints.channel.getBlog(id)),
    'anix:profileById': h((c, id) => c.getClient().endpoints.profile.info(id)),
    'anix:collectionById': h((c, id) => c.getClient().endpoints.collection.info(id)),
    'anix:collectionReleases': h((c, id, page = 0) => c.getClient().endpoints.collection.getCollectionReleases(id, page)),
    'anix:collectionRandomRelease': h((c, id) => c.getClient().endpoints.collection.getRandomRelease(id, true)),
    'anix:addCollectionFavorite': h((c, id) => c.getClient().endpoints.collection.addCollectionFavorite(id)),
    'anix:removeCollectionFavorite': h((c, id) => c.getClient().endpoints.collection.removeCollectionFavorite(id)),
    'anix:collectionsAll': h(async (c, page = 0, options = {}) => {
      const query: Record<string, number> = { sort: typeof options?.sort === 'number' ? options.sort : 2 };
      if (typeof options?.where === 'number') query.where = options.where;
      if (typeof options?.previousPage === 'number') query.previous_page = options.previousPage;
      return c.getClient().endpoints.collection.collections(page, query);
    }),
    'anix:collectionProfileCollections': h((c, profileId, page = 0) =>
      c.getClient().endpoints.collection.profileCollections(profileId, page)),
    'anix:collectionMyCreate': h((c, body) => c.getClient().endpoints.collectionMy.create(body)),
    'anix:collectionMyEdit': h((c, id, body) => c.getClient().endpoints.collectionMy.edit(id, body)),
    'anix:collectionMyEditImage': async () => {
      throw new Error('Загрузка изображений на Android TV пока не поддерживается');
    },
    'anix:collectionMyReleaseAdd': h((c, id, releaseId) =>
      c.getClient().endpoints.collectionMy.releaseAdd(id, { release_id: releaseId })),
    'anix:collectionMyDelete': h((c, id) => c.getClient().endpoints.collectionMy.delete(id)),
    'anix:schedule': h(async (c) => {
      try {
        return await c.getClient().endpoints.schedule.schedule();
      } catch {
        return {};
      }
    }),
    'anix:favorites': h((c, page = 0, sort = BookmarkSortType.NewToOldAddTime, filterAnnounce = 0, filter = 0) =>
      c.getClient().endpoints.profile.getFavorites({ page, sort, filter_announce: filterAnnounce, filter })),
    'anix:getBookmarks': h((c, profileId, type, page = 0, sort = BookmarkSortType.NewToOldAddTime, filterAnnounce = 0, filter = 0) =>
      c.getClient().endpoints.profile.getBookmarks({
        id: profileId,
        type: type ?? BookmarkType.Watching,
        page,
        sort,
        filter_announce: filterAnnounce,
        filter,
      })),
    'anix:collectionFavorites': h((c, page = 0) => c.getClient().endpoints.collectionFavorite.favorites(page)),
    'anix:randomFavorite': h((c, extended = true) =>
      c.getClient().endpoints.release.randomFavorite({ extended_mode: extended })),
    'anix:randomProfileList': h((c, profileId, status, extended = true) =>
      c.getClient().endpoints.release.randomProfileList(profileId, status, { extended_mode: extended })),
    'anix:notificationsAll': h((c, page = 0) => c.getClient().endpoints.notification.getNotifications(page)),
    'anix:notificationsCount': h((c) => c.getClient().endpoints.notification.countNotifications()),
    'anix:notificationsRead': h((c) => c.getClient().endpoints.notification.read()),
    'anix:history': h((c, page = 0) => c.getClient().endpoints.release.getHistory(page)),
    'anix:deleteFromHistory': h((c, releaseId) => c.getClient().endpoints.history.delete(releaseId)),
    'anix:addToHistory': h((c, releaseId, sourceId, episodePosition) =>
      c.getClient().endpoints.release.addToHistory(releaseId, sourceId, episodePosition)),
    'anix:markEpisodeAsWatched': h((c, releaseId, sourceId, episodePosition) =>
      c.getClient().endpoints.release.markEpisodeAsWatched(releaseId, sourceId, episodePosition)),
    'anix:unmarkEpisodeAsWatched': h((c, releaseId, sourceId, episodePosition) =>
      c.getClient().endpoints.release.unmarkEpisodeAsWatched(releaseId, sourceId, episodePosition)),
    'anix:relatedReleases': h((c, relatedId, page = 0) =>
      c.getClient().endpoints.release.getRelatedReleases(relatedId, page)),
    'anix:votedReleases': h((c, profileId, page = 0, sort = 1) =>
      c.getClient().endpoints.profile.getVotedReleases(profileId, page, sort)),
    'anix:profileSocial': h((c, profileId) => c.getClient().endpoints.profile.getSocialPages(profileId)),
    'anix:friends': h((c, profileId, page = 0) =>
      c.getClient().endpoints.profile.getFriends({ id: profileId, page })),
    'anix:friendRequestSend': h((c, profileId) => c.getClient().endpoints.profile.sendFriendRequest(profileId)),
    'anix:friendRequestRemove': h((c, profileId) => c.getClient().endpoints.profile.removeFriendRequest(profileId)),
    'anix:friendRequestHide': h((c, profileId) => c.getClient().endpoints.profile.hideFriendRequest(profileId)),
    'anix:friendRequestsIn': h((c, page = 0) => c.getClient().endpoints.profile.getFriendRequestsIn(page)),
    'anix:friendRequestsOut': h((c, page = 0) => c.getClient().endpoints.profile.getFriendRequestsOut(page)),
    'anix:friendRecommendations': h((c) => c.getClient().endpoints.profile.getFriendRecommendations()),
    'anix:profileReleaseComments': h((c, profileId, page = 0, sort = 1) =>
      c.getClient().endpoints.profile.getReleaseComments(profileId, page, sort)),
    'anix:profileCollectionComments': h((c, profileId, page = 0, sort = 1) =>
      c.getClient().endpoints.profile.getCollectionComments(profileId, page, sort)),
    'anix:profileArticleComments': h((c, profileId, page = 0, sort = 1) =>
      c.getClient().endpoints.profile.getArticleComments(profileId, page, sort)),
    'anix:profileFavoriteVideos': h((c, profileId, page = 0) =>
      c.getClient().endpoints.profile.getFavoriteVideos(profileId, page)),
    'anix:getProfileSettings': h((c) => c.getClient().endpoints.settings.getCurrentProfileSettings()),
    'anix:setStatus': h((c, status) => c.getClient().endpoints.settings.setStatus(status)),
    'anix:getSocial': h((c) => c.getClient().endpoints.settings.getSocial()),
    'anix:setSocial': h((c, data) => c.getClient().endpoints.settings.setSocial(data)),
    'anix:setPrivacyStats': h((c, state) => c.getClient().endpoints.settings.setPrivacyStats(state)),
    'anix:setPrivacyCounts': h((c, state) => c.getClient().endpoints.settings.setPrivacyCounts(state)),
    'anix:setPrivacySocial': h((c, state) => c.getClient().endpoints.settings.setPrivacySocial(state)),
    'anix:setPrivacyFriendRequests': h((c, state) => c.getClient().endpoints.settings.setPrivacyFriendRequests(state)),
    'anix:getLoginInfo': h((c) => c.getClient().endpoints.settings.getLoginInfo()),
    'anix:changeLogin': h((c, newLogin) => c.getClient().endpoints.settings.changeLogin(newLogin)),
    'anix:getBadges': h((c, page = 0) => c.getClient().endpoints.settings.getBadges(page)),
    'anix:setBadge': h((c, id) => c.getClient().endpoints.settings.setBadge(id)),
    'anix:removeBadge': h((c) => c.getClient().endpoints.settings.removeBadge()),
    'anix:selectTheme': h((c, id) => c.getClient().endpoints.settings.selectTheme(id)),
    'anix:setAvatar': async () => {
      throw new Error('Загрузка изображений на Android TV пока не поддерживается');
    },
    'anix:deleteAvatar': h((c) => c.getClient().endpoints.settings.deleteAvatar()),
    'anix:channelUploadCover': async () => {
      throw new Error('Загрузка изображений на Android TV пока не поддерживается');
    },
    'anix:channelDeleteCover': h((c, channelId) => c.getClient().endpoints.channel.deleteCover(channelId)),
    'anix:channelCreateBlog': h((c) => c.getClient().endpoints.channel.createBlog()),
    'anix:loginHistory': h((c, profileId, page = 0) => c.getClient().endpoints.profile.loginHistory?.(profileId, page)),
    'anix:searchReleases': h((c, query, page = 0, searchBy = 0) =>
      c.getClient().endpoints.search.releases({ query, page, searchBy })),
    'anix:searchProfiles': h((c, query, page = 0) =>
      c.getClient().endpoints.search.profiles({ query, page })),
    'anix:searchCollections': h((c, query, page = 0) =>
      c.getClient().endpoints.search.collections({ query, page })),
    'anix:searchProfileList': h((c, status, query, page = 0, searchBy = 0) =>
      c.getClient().endpoints.search.profileList?.({ status, query, page, searchBy })),
    'anix:addToFavorites': h((c, releaseId) => c.getClient().endpoints.release.addFavorite(releaseId)),
    'anix:removeFromFavorites': h((c, releaseId) => c.getClient().endpoints.release.removeFavorite(releaseId)),
    'anix:setListStatus': h(async (c, releaseId, statusId) => {
      const type = typeof statusId === 'number' ? statusId : LIST_STATUS_TO_TYPE[String(statusId)];
      return c.getClient().endpoints.release.addToProfileList(releaseId, type);
    }),
    'anix:clearListStatus': h((c, releaseId, statusId) => {
      const type = typeof statusId === 'number' ? statusId : LIST_STATUS_TO_TYPE[String(statusId)];
      return c.getClient().endpoints.release.removeFromProfileList(releaseId, type);
    }),
    'anix:releaseVote': h((c, releaseId, vote) => c.getClient().endpoints.release.vote(releaseId, vote)),
    'anix:releaseDeleteVote': h((c, releaseId) => c.getClient().endpoints.release.deleteVote(releaseId)),
    'anix:releaseComments': h((c, releaseId, page = 0, sort = 1) =>
      c.getClient().endpoints.releaseComment.comments(releaseId, page, { sort })),
    'anix:releaseCommentReplies': h((c, commentId, page = 0, sort = 2) =>
      c.getClient().endpoints.releaseComment.replies(commentId, page, { sort })),
    'anix:releaseCommentVote': h((c, commentId, vote) => c.getClient().endpoints.releaseComment.vote(commentId, vote)),
    'anix:releaseCommentVotes': h((c, commentId, page = 0, sort = 2) =>
      c.getClient().endpoints.releaseComment.votes(commentId, page, { sort })),
    'anix:releaseCommentById': h((c, commentId) => c.getClient().endpoints.releaseComment.comment(commentId)),
    'anix:releaseCommentAdd': h((c, releaseId, body) =>
      c.getClient().endpoints.releaseComment.add(releaseId, {
        message: body.message,
        spoiler: !!(body.spoiler ?? body.isSpoiler),
        parentCommentId: body.parentCommentId ?? null,
        replyToProfileId: body.replyToProfileId ?? null,
      })),
    'anix:releaseCommentEdit': h((c, commentId, body) =>
      c.getClient().endpoints.releaseComment.edit(commentId, {
        message: body.message,
        spoiler: !!(body.spoiler ?? body.isSpoiler),
      })),
    'anix:releaseCommentDelete': h((c, commentId) => c.getClient().endpoints.releaseComment.delete(commentId)),
  };

  async function invoke(channel: string, args: unknown[] = []) {
    const handler = HANDLERS[channel];
    if (!handler) throw new Error(`Unknown channel: ${channel}`);
    return handler(ctx(), args);
  }

  return { invoke, loadConfig, saveConfig };
}
