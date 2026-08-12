/**
 * Общий мост к Anixart API для браузерного dev-режима (Vite middleware).
 * Повторяет IPC-каналы anix:* из electron/main.js без Electron.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { Anixart, DefaultResult, BookmarkType, BookmarkSortType } = require('anixapi');
const { attachLegacyEndpoints } = require('./anix-legacy-endpoints');
const homeCustomFilter = require('./home-custom-filter');
const { getDirectVideoLink } = require('./kodik-direct');

const DEFAULT_BASE_URL = 'https://api-s.anixsekai.com';

const LIST_STATUS_TO_TYPE = {
  watching: BookmarkType.Watching,
  planned: BookmarkType.InPlans,
  completed: BookmarkType.Completed,
  on_hold: BookmarkType.HoldOn,
  dropped: BookmarkType.Dropped,
};

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function readJson(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(file, data) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

function createAnixBridgeCore(options = {}) {
  const configPath = options.configPath ?? path.join(os.homedir(), '.anixapp', 'web-config.json');
  const userDataPath = options.userDataPath ?? path.join(os.homedir(), '.anixapp', 'web-user-data');
  ensureDir(userDataPath);

  let anixart = null;

  function loadConfig() {
    const raw = readJson(configPath, {});
    return {
      token: raw.token ?? null,
      baseUrl: raw.baseUrl || DEFAULT_BASE_URL,
      profileId: raw.profileId ?? null,
      profileLogin: raw.profileLogin ?? null,
      profileAvatar: raw.profileAvatar ?? null,
      profileRaw: raw.profileRaw ?? null,
    };
  }

  function saveConfig(partial) {
    const next = { ...readJson(configPath, {}), ...partial };
    writeJson(configPath, next);
    if ('token' in partial || 'baseUrl' in partial) anixart = null;
  }

  function createClient({ baseUrl, token } = {}) {
    const cfg = loadConfig();
    return attachLegacyEndpoints(new Anixart({
      baseUrl: baseUrl ?? cfg.baseUrl,
      token: token ?? cfg.token ?? undefined,
    }));
  }

  function getClient() {
    if (!anixart) {
      const cfg = loadConfig();
      anixart = createClient({ baseUrl: cfg.baseUrl, token: cfg.token || undefined });
    }
    return anixart;
  }

  function resetClient() {
    anixart = null;
  }

  async function getDirectVideoLinkHandler(embedUrl) {
    return getDirectVideoLink(embedUrl);
  }

  const ctx = () => ({
    getClient,
    createClient,
    loadConfig,
    saveConfig,
    resetClient,
    userDataPath,
    getDirectVideoLink: getDirectVideoLinkHandler,
  });

  const h = (fn) => async (c, args) => fn(c, ...(args ?? []));

  const HANDLERS = {
    'anix:getAuthStatus': async (c) => ({ hasToken: !!c.loadConfig().token }),
    'anix:checkConnection': async (c) => {
      const token = c.loadConfig().token;
      if (!token) return { ok: true };
      await c.getClient().endpoints.feed.latest(1);
      return { ok: true };
    },
    'anix:login': async (c, [username, password]) => {
      const { baseUrl } = c.loadConfig();
      const loginClient = c.createClient({ baseUrl, token: undefined });
      const res = await loginClient.endpoints.auth.signIn({ login: username, password });
      const code = res?.code;
      const profile = res?.profile;
      const profileToken = res?.profileToken;
      if (code === DefaultResult.Ok && profileToken?.token) {
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
      return { success: false, code };
    },
    'anix:signUp': async (c, [payload]) => {
      const login = String(payload?.login || '').trim();
      const email = String(payload?.email || '').trim();
      const password = String(payload?.password || '');
      if (!login || !email || !password) return { success: false, error: 'fields_required' };
      const { baseUrl } = c.loadConfig();
      const client = c.createClient({ baseUrl, token: undefined });
      const res = await client.endpoints.auth.signUp({ login, email, password });
      if (res?.hash) {
        return {
          success: res?.code === DefaultResult.Ok,
          needsVerify: true,
          code: res?.code,
          hash: res.hash,
          codeTimestampExpires: res.codeTimestampExpires,
          suggestedLogins: Array.isArray(res.suggested_logins) ? res.suggested_logins : null,
        };
      }
      return {
        success: false,
        code: res?.code,
        suggestedLogins: Array.isArray(res?.suggested_logins) ? res.suggested_logins : null,
      };
    },
    'anix:signUpVerify': async (c, [payload]) => {
      const login = String(payload?.login || '').trim();
      const email = String(payload?.email || '').trim();
      const password = String(payload?.password || '');
      const hash = String(payload?.hash || '');
      const code = Number(payload?.code);
      if (!login || !email || !password || !hash || !Number.isFinite(code)) {
        return { success: false, error: 'fields_required' };
      }
      const { baseUrl } = c.loadConfig();
      const client = c.createClient({ baseUrl, token: undefined });
      const res = await client.endpoints.auth.verify({ login, email, password, hash, code });
      if (res?.code === DefaultResult.Ok) {
        const loginRes = await client.endpoints.auth.signIn({ login, password });
        if (loginRes?.code === DefaultResult.Ok && loginRes?.profileToken?.token) {
          c.saveConfig({
            token: loginRes.profileToken.token,
            profileId: loginRes.profile?.id ?? null,
            profileLogin: loginRes.profile?.login ?? null,
            profileAvatar: loginRes.profile?.avatar ?? null,
            profileRaw: loginRes.profile || null,
          });
          c.resetClient();
          return { success: true };
        }
        return { success: true, needsLogin: true };
      }
      return { success: false, code: res?.code };
    },
    'anix:signUpResend': async (c, [payload]) => {
      const hash = String(payload?.hash || '');
      if (!hash) return { success: false, error: 'hash_required' };
      const { baseUrl } = c.loadConfig();
      const client = c.createClient({ baseUrl, token: undefined });
      const res = await client.endpoints.auth.resend({
        login: String(payload?.login || '').trim(),
        email: String(payload?.email || '').trim(),
        password: String(payload?.password || ''),
        hash,
      });
      if (res?.code === DefaultResult.Ok || res?.hash) {
        return {
          success: true,
          hash: res?.hash || hash,
          codeTimestampExpires: res?.codeTimestampExpires,
        };
      }
      return { success: false, code: res?.code };
    },
    'anix:checkLogin': async (c, [loginValue]) => {
      const login = String(loginValue || '').trim();
      if (!login) return { available: false, code: 2 };
      const { baseUrl } = c.loadConfig();
      const client = c.createClient({ baseUrl, token: undefined });
      const res = await client.endpoints.auth.checkLogin({ login });
      return {
        available: !!res?.available,
        code: res?.code,
        suggestedLogins: Array.isArray(res?.suggested_logins) ? res.suggested_logins : null,
      };
    },
    'anix:restore': async (c, [dataValue]) => {
      const data = String(dataValue || '').trim();
      if (!data) return { success: false, error: 'data_required' };
      const { baseUrl } = c.loadConfig();
      const client = c.createClient({ baseUrl, token: undefined });
      const res = await client.endpoints.auth.restore({ data });
      if (res?.hash) {
        return {
          success: true,
          needsVerify: true,
          hash: res.hash,
          codeTimestampExpires: res.codeTimestampExpires,
        };
      }
      return { success: false, code: res?.code };
    },
    'anix:restoreVerify': async (c, [payload]) => {
      const data = String(payload?.data || '').trim();
      const password = String(payload?.password || '');
      const hash = String(payload?.hash || '');
      const code = Number(payload?.code);
      if (!data || !password || !hash || !Number.isFinite(code)) {
        return { success: false, error: 'fields_required' };
      }
      const { baseUrl } = c.loadConfig();
      const client = c.createClient({ baseUrl, token: undefined });
      const res = await client.endpoints.auth.restoreVerify({ data, password, hash, code });
      if (res?.code === DefaultResult.Ok && res?.profileToken?.token) {
        c.saveConfig({
          token: res.profileToken.token,
          profileId: res.profile?.id ?? null,
          profileLogin: res.profile?.login ?? null,
          profileAvatar: res.profile?.avatar ?? null,
          profileRaw: res.profile || null,
        });
        c.resetClient();
        return { success: true };
      }
      if (res?.code === DefaultResult.Ok) {
        const loginRes = await client.endpoints.auth.signIn({ login: data, password });
        if (loginRes?.code === DefaultResult.Ok && loginRes?.profileToken?.token) {
          c.saveConfig({
            token: loginRes.profileToken.token,
            profileId: loginRes.profile?.id ?? null,
            profileLogin: loginRes.profile?.login ?? null,
            profileAvatar: loginRes.profile?.avatar ?? null,
            profileRaw: loginRes.profile || null,
          });
          c.resetClient();
          return { success: true };
        }
        return { success: true, needsLogin: true };
      }
      return { success: false, code: res?.code };
    },
    'anix:restoreResend': async (c, [payload]) => {
      const data = String(payload?.data || '').trim();
      const password = String(payload?.password || '');
      const hash = String(payload?.hash || '');
      if (!data || !password || !hash) return { success: false, error: 'fields_required' };
      const { baseUrl } = c.loadConfig();
      const client = c.createClient({ baseUrl, token: undefined });
      const res = await client.endpoints.auth.restoreResend({ data, password, hash });
      if (res?.code === DefaultResult.Ok || res?.hash) {
        return {
          success: true,
          hash: res?.hash || hash,
          codeTimestampExpires: res?.codeTimestampExpires,
        };
      }
      return { success: false, code: res?.code };
    },
    'anix:loginVk': async () => ({
      success: false,
      error: 'oauth_electron_only',
    }),
    'anix:loginGoogle': async () => ({
      success: false,
      error: 'oauth_electron_only',
    }),
    'anix:loginTelegram': async () => ({
      success: false,
      error: 'oauth_electron_only',
    }),
    'anix:loginYandex': async () => ({
      success: false,
      error: 'oauth_electron_only',
    }),
    'anix:bindOAuthService': async () => ({
      success: false,
      error: 'oauth_electron_only',
    }),
    'anix:unbindOAuthService': h(async (c, provider) => {
      const p = String(provider || '').toLowerCase();
      const pref = c.getClient().endpoints.profilePreference;
      let res;
      if (p === 'vk') res = await pref.vkUnbind();
      else if (p === 'google') res = await pref.googleUnbind();
      else if (p === 'telegram') res = await pref.telegramUnbind();
      else if (p === 'yandex') res = await pref.yandexUnbind();
      else return { success: false, error: 'unknown_provider' };
      const code = res?.code ?? -1;
      if (code === 0) return { success: true, code };
      return { success: false, code };
    }),
    'anix:oauthCompleteSignUp': async () => ({
      success: false,
      error: 'oauth_electron_only',
    }),
    'anix:oauthClearPending': async () => ({ ok: true }),
    'anix:oauthSubmitUrl': async () => ({ success: false, error: 'oauth_electron_only' }),
    'anix:oauthCancel': async () => ({ ok: true }),
    'anix:logout': async (c) => {
      const { baseUrl } = c.loadConfig();
      c.saveConfig({
        token: null,
        profileId: null,
        profileLogin: null,
        profileAvatar: null,
        profileRaw: null,
        baseUrl,
      });
      c.resetClient();
    },
    'anix:getBaseUrl': async (c) => c.loadConfig().baseUrl,
    'anix:setBaseUrl': async (c, [baseUrl]) => {
      if (typeof baseUrl !== 'string' || !baseUrl) return;
      c.saveConfig({ baseUrl });
      c.resetClient();
    },
    'anix:pingBaseUrl': async (c, [baseUrl]) => {
      if (typeof baseUrl !== 'string' || !baseUrl) return { ok: false, latencyMs: null };
      try {
        const started = Date.now();
        const client = c.createClient({ baseUrl, token: undefined });
        await client.endpoints.feed.latest(1);
        return { ok: true, latencyMs: Date.now() - started };
      } catch {
        return { ok: false, latencyMs: null };
      }
    },
    'anix:testOffline': async () => {
      throw new Error('TypeError: fetch failed (test)');
    },
    'anix:selfProfile': async (c) => {
      const config = c.loadConfig();
      const { profileLogin, profileAvatar, profileRaw } = config;
      const profileId = config.profileId || (profileRaw && profileRaw.id) || null;

      if (profileId) {
        try {
          const data = await c.getClient().endpoints.profile.info(profileId);
          if (data && data.is_my_profile === false) {
            c.saveConfig({ profileId: null, profileLogin: null, profileAvatar: null, profileRaw: null });
            return { profile: null, session_mismatch: true };
          }
          if (data && data.profile) return data;
        } catch (err) {
          throw err;
        }
      }

      if (profileRaw) {
        return { code: 0, profile: profileRaw, is_my_profile: true };
      }

      if (profileLogin || profileAvatar) {
        return {
          profile: { id: profileId || null, login: profileLogin || '', avatar: profileAvatar || '' },
          is_my_profile: true,
        };
      }

      return null;
    },

    'anix:releaseById': h((c, id, extended = true) => c.getClient().endpoints.release.info(id, extended)),
    'anix:getVideos': h((c, releaseId) => c.getClient().endpoints.release.getVideos(releaseId)),
    'anix:getVideoInCategory': h((c, releaseId, categoryId, page = 1) =>
      c.getClient().endpoints.release.getVideoInCategory({ id: releaseId, categoryId, page })),
    'anix:getDubbers': h((c, releaseId) => c.getClient().endpoints.release.getDubbers(releaseId)),
    'anix:typeAll': h((c) => c.getClient().endpoints.type.types()),
    'anix:typePin': h((c, releaseId, typeId) => c.getClient().endpoints.type.pin(releaseId, typeId)),
    'anix:typeUnpin': h((c, releaseId, typeId) => c.getClient().endpoints.type.unpin(releaseId, typeId)),
    'anix:getDubberSources': h((c, releaseId, dubberId) =>
      c.getClient().endpoints.release.getDubberSources(releaseId, dubberId)),
    'anix:getEpisodes': h((c, releaseId, dubberId, sourceId, sort = 1) =>
      c.getClient().endpoints.release.getEpisodes(releaseId, dubberId, sourceId, sort)),
    'anix:getEpisode': h((c, releaseId, sourceId, episodePosition) =>
      c.getClient().endpoints.release.getEpisode(releaseId, sourceId, episodePosition)),
    'anix:getEpisodeUpdates': h((c, releaseId, page = 0) =>
      c.getClient().endpoints.episode.updates(releaseId, page)),
    'anix:getDirectVideoLink': h((c, embedUrl) => c.getDirectVideoLink(embedUrl)),
    'anix:randomRelease': h((c, extended = true) => c.getClient().endpoints.release.getRandomRelease(extended)),
    'anix:latestFeed': h((c, page = 1) => c.getClient().endpoints.feed.latest(page)),
    'anix:discoverRecommendations': async (c, [page = -1, previousPage = -1]) => {
      try {
        return await c.getClient().endpoints.discover.recommendations(page, { previous_page: previousPage });
      } catch {
        return { content: [] };
      }
    },
    'anix:discoverInteresting': async (c) => {
      try {
        return await c.getClient().endpoints.discover.interesting();
      } catch {
        return { content: [] };
      }
    },
    'anix:discoverWatching': async (c, [page = 0]) => {
      try {
        return await c.getClient().endpoints.discover.watching(page);
      } catch {
        return { content: [] };
      }
    },
    'anix:discoverDiscussing': async (c) => {
      try {
        return await c.getClient().endpoints.discover.discussing();
      } catch {
        return { content: [] };
      }
    },
    'anix:discoverCommentsWeek': async (c) => {
      try {
        return await c.getClient().endpoints.discover.commentsWeek();
      } catch {
        return { content: [] };
      }
    },
    'anix:discoverCollectionsWeek': async (c, [page = -1, previousPage = 0]) => {
      try {
        return await c.getClient().endpoints.discover.collectionsWeek(page, { previous_page: previousPage });
      } catch {
        return { content: [] };
      }
    },
    'anix:filterReleases': h((c, page = 0, filterArgs = {}, extended = true) =>
      c.getClient().endpoints.release.filter(page, filterArgs, extended)),
    'anix:homeCustomTabGet': async (c) => {
      const cfg = c.loadConfig();
      const profileId = cfg.profileId;
      if (!profileId) return { tabName: '', filter: null, activeTab: null };
      return homeCustomFilter.getEntry(c.userDataPath, profileId) ?? { tabName: '', filter: null, activeTab: null };
    },
    'anix:homeCustomTabSet': async (c, [data]) => {
      const profileId = c.loadConfig().profileId;
      if (!profileId) throw new Error('Not logged in');
      homeCustomFilter.setEntry(c.userDataPath, profileId, {
        tabName: typeof data?.tabName === 'string' ? data.tabName : '',
        filter: data?.filter ?? null,
        activeTab: typeof data?.activeTab === 'string' ? data.activeTab : null,
      });
      return { ok: true };
    },
    'anix:articleById': h((c, id) => c.getClient().endpoints.channel.getArticle(id)),
    'anix:channelById': h((c, id) => c.getClient().endpoints.channel.info(id)),
    'anix:channelBlog': h((c, id) => c.getClient().endpoints.channel.getBlog(id)),
    'anix:profileById': h((c, id) => c.getClient().endpoints.profile.info(id)),
    'anix:collectionById': h((c, id) => c.getClient().endpoints.collection.info(id)),
    'anix:collectionReleases': h((c, id, page = 0) =>
      c.getClient().endpoints.collection.getCollectionReleases(id, page)),
    'anix:collectionRandomRelease': h((c, id) =>
      c.getClient().endpoints.collection.getRandomRelease(id, true)),
    'anix:addCollectionFavorite': h((c, id) => c.getClient().endpoints.collection.addCollectionFavorite(id)),
    'anix:removeCollectionFavorite': h((c, id) => c.getClient().endpoints.collection.removeCollectionFavorite(id)),
    'anix:collectionsAll': h(async (c, page = 0, options = {}) => {
      const sort = typeof options?.sort === 'number' ? options.sort : 2;
      const query = { sort };
      if (typeof options?.where === 'number') query.where = options.where;
      if (typeof options?.previousPage === 'number') query.previous_page = options.previousPage;
      return c.getClient().endpoints.collection.collections(page, query);
    }),
    'anix:collectionProfileCollections': h((c, profileId, page = 0) =>
      c.getClient().endpoints.collection.profileCollections(profileId, page)),
    'anix:collectionMyCreate': h((c, body) => c.getClient().endpoints.collectionMy.create(body)),
    'anix:collectionMyEdit': h((c, id, body) => c.getClient().endpoints.collectionMy.edit(id, body)),
    'anix:collectionMyEditImage': h(async (c, id, imageBase64, fileName = 'image.jpg') => {
      const base64 = typeof imageBase64 === 'string' ? imageBase64.replace(/^data:[^;]+;base64,/, '') : '';
      const buffer = Buffer.from(base64, 'base64');
      return c.getClient().endpoints.collectionMy.editImage(id, buffer, fileName);
    }),
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
    'anix:votedReleases': h(async (c, profileId, page = 0, sort = 1) => {
      try {
        const sortValue = Number(sort);
        const safeSort = Number.isFinite(sortValue) && sortValue > 0 ? sortValue : 1;
        return await c.getClient().endpoints.profileReleaseVote.allReleaseVoted(
          profileId,
          page,
          { sort: safeSort },
        );
      } catch (err) {
        const msg = String(err?.message || err || '');
        if (msg.includes('empty response')) {
          return { content: [], last: true, total_count: 0, code: 0 };
        }
        throw err;
      }
    }),
    'anix:profileSocial': h((c, profileId) =>
      c.getClient().endpoints.profile.getSocialPages(profileId)),
    'anix:friends': h((c, profileId, page = 0) =>
      c.getClient().endpoints.profile.getFriends({ id: profileId, page })),
    'anix:friendRequestSend': h((c, profileId) =>
      c.getClient().endpoints.profile.sendFriendRequest(profileId)),
    'anix:friendRequestRemove': h((c, profileId) =>
      c.getClient().endpoints.profile.removeFriendRequest(profileId)),
    'anix:friendRequestHide': h((c, profileId) =>
      c.getClient().endpoints.profile.hideFriendRequest(profileId)),
    'anix:friendRequestsIn': h((c, page = 0) =>
      c.getClient().endpoints.profile.getFriendRequestsIn(page)),
    'anix:friendRequestsOut': h((c, page = 0) =>
      c.getClient().endpoints.profile.getFriendRequestsOut(page)),
    'anix:friendRecommendations': h((c) =>
      c.getClient().endpoints.profile.getFriendRecommendations()),
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
    'anix:setPrivacyFriendRequests': h((c, state) =>
      c.getClient().endpoints.settings.setPrivacyFriendRequests(state)),
    'anix:getLoginInfo': h((c) => c.getClient().endpoints.settings.getLoginInfo()),
    'anix:changeLogin': h((c, newLogin) => c.getClient().endpoints.settings.changeLogin(newLogin)),
    'anix:getBadges': h((c, page = 0) => c.getClient().endpoints.settings.getBadges(page)),
    'anix:setBadge': h((c, id) => c.getClient().endpoints.settings.setBadge(id)),
    'anix:removeBadge': h((c) => c.getClient().endpoints.settings.removeBadge()),
    'anix:selectTheme': h((c, id) => c.getClient().endpoints.settings.selectTheme(id)),
    'anix:setAvatar': h((c, imageBase64, fileName = 'image.jpg') =>
      c.getClient().endpoints.settings.setAvatar(imageBase64, fileName)),
    'anix:deleteAvatar': h((c) => c.getClient().endpoints.settings.deleteAvatar()),
    'anix:channelUploadCover': h((c, channelId, imageBase64, fileName = 'image.jpg') =>
      c.getClient().endpoints.channel.uploadCover(channelId, imageBase64, fileName)),
    'anix:channelDeleteCover': h((c, channelId) =>
      c.getClient().endpoints.channel.deleteCover(channelId)),
    'anix:channelCreateBlog': h((c) => c.getClient().endpoints.channel.createBlog()),
    'anix:loginHistory': h((c, profileId, page = 0) =>
      c.getClient().endpoints.profile.changeLoginHistory(profileId, page)),
    'anix:searchReleases': h((c, query, page = 0, searchBy = 0) =>
      c.getClient().endpoints.search.releases(query, page, searchBy)),
    'anix:searchProfiles': h((c, query, page = 0) => c.getClient().endpoints.search.profiles(query, page)),
    'anix:searchCollections': h((c, query, page = 0) => c.getClient().endpoints.search.collections(query, page)),
    'anix:addToFavorites': h(async (c, releaseId) => {
      const res = await c.getClient().endpoints.release.addFavorite(releaseId);
      if (res?.code !== DefaultResult.Ok) throw new Error(String(res?.code ?? 'fail'));
    }),
    'anix:removeFromFavorites': h(async (c, releaseId) => {
      const res = await c.getClient().endpoints.release.removeFavorite(releaseId);
      if (res?.code !== DefaultResult.Ok) throw new Error(String(res?.code ?? 'fail'));
    }),
    'anix:setListStatus': h(async (c, releaseId, statusId) => {
      const type = LIST_STATUS_TO_TYPE[statusId];
      if (type == null) throw new Error('unknown status');
      const client = c.getClient();
      for (const [id, otherType] of Object.entries(LIST_STATUS_TO_TYPE)) {
        if (id === statusId) continue;
        try {
          await client.endpoints.release.removeFromProfileList(releaseId, otherType);
        } catch {
          /* ignore */
        }
      }
      const res = await client.endpoints.release.addToProfileList(releaseId, type);
      if (res?.code !== DefaultResult.Ok) throw new Error(String(res?.code ?? 'fail'));
    }),
    'anix:clearListStatus': h(async (c, releaseId, statusId) => {
      const type = LIST_STATUS_TO_TYPE[statusId];
      if (type == null) throw new Error('unknown status');
      const res = await c.getClient().endpoints.release.removeFromProfileList(releaseId, type);
      if (res?.code !== DefaultResult.Ok) throw new Error(String(res?.code ?? 'fail'));
    }),
    'anix:releaseVote': h(async (c, releaseId, vote) => {
      const res = await c.getClient().endpoints.release.vote(releaseId, vote);
      if (res?.code !== DefaultResult.Ok) throw new Error(String(res?.code ?? 'vote failed'));
      return res;
    }),
    'anix:releaseDeleteVote': h(async (c, releaseId) => {
      const res = await c.getClient().endpoints.release.deleteVote(releaseId);
      if (res?.code !== DefaultResult.Ok) throw new Error(String(res?.code ?? 'delete vote failed'));
      return res;
    }),
    'anix:releaseComments': h((c, releaseId, page = 0, sort = 1) =>
      c.getClient().endpoints.releaseComment.comments(releaseId, page, { sort })),
    'anix:releaseCommentReplies': h((c, commentId, page = 0, sort = 2) =>
      c.getClient().endpoints.releaseComment.replies(commentId, page, { sort })),
    'anix:releaseCommentVote': h(async (c, commentId, vote) => {
      const res = await c.getClient().endpoints.releaseComment.vote(commentId, vote);
      if (res?.code !== DefaultResult.Ok) throw new Error(String(res?.code ?? 'comment vote failed'));
      return res;
    }),
    'anix:releaseCommentVotes': h((c, commentId, page = 0, sort = 2) =>
      c.getClient().endpoints.releaseComment.votes(commentId, page, { sort })),
    'anix:releaseCommentById': h((c, commentId) => c.getClient().endpoints.releaseComment.comment(commentId)),
    'anix:releaseCommentAdd': h(async (c, releaseId, body) => {
      const payload = {
        message: body.message,
        spoiler: !!(body.spoiler ?? body.isSpoiler),
        parentCommentId: body.parentCommentId ?? null,
        replyToProfileId: body.replyToProfileId ?? null,
      };
      const res = await c.getClient().endpoints.releaseComment.add(releaseId, payload);
      if (res?.code != null && res.code !== DefaultResult.Ok) {
        throw new Error(String(res.code ?? 'comment add failed'));
      }
      return res;
    }),
    'anix:releaseCommentEdit': h(async (c, commentId, body) => {
      const res = await c.getClient().endpoints.releaseComment.edit(commentId, {
        message: body.message,
        spoiler: !!(body.spoiler ?? body.isSpoiler),
      });
      if (res?.code !== DefaultResult.Ok) throw new Error(String(res?.code ?? 'comment edit failed'));
      return res;
    }),
    'anix:releaseCommentDelete': h(async (c, commentId) => {
      const res = await c.getClient().endpoints.releaseComment.delete(commentId);
      if (res?.code !== DefaultResult.Ok) throw new Error(String(res?.code ?? 'comment delete failed'));
      return res;
    }),
  };

  async function invoke(channel, args = []) {
    const handler = HANDLERS[channel];
    if (!handler) throw new Error(`Unknown channel: ${channel}`);
    return handler(ctx(), args);
  }

  return { invoke, loadConfig, saveConfig, configPath };
}

module.exports = { createAnixBridgeCore, DEFAULT_BASE_URL };
