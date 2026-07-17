'use strict';

const { ipcMain } = require('electron');
const { BookmarkType, BookmarkSortType, DefaultResult } = require('anixapi');

function register(deps) {
  const {
    loggedHandle,
    handleAnixError,
    getAnixart,
    appendLog,
    homeCustomFilter,
    LIST_STATUS_TO_TYPE,
    config,
    app,
    logger,
  } = deps;

// ——— Anixart API bridge (raw JSON responses for renderer) ———

loggedHandle('anix:releaseById', async (_, id, extended = true) => {
  try {
    const client = getAnixart();
    const data = await client.endpoints.release.info(id, extended);
    return data;
  } catch (err) {
    handleAnixError(err, 'releaseById');
  }
});

ipcMain.handle('anix:getVideos', async (_, releaseId) => {
  try {
    const client = getAnixart();
    return await client.endpoints.release.getVideos(releaseId);
  } catch (err) {
    handleAnixError(err, 'getVideos');
  }
});

ipcMain.handle('anix:getVideoInCategory', async (_, releaseId, categoryId, page = 1) => {
  try {
    const client = getAnixart();
    return await client.endpoints.release.getVideoInCategory({ id: releaseId, categoryId, page });
  } catch (err) {
    handleAnixError(err, 'getVideoInCategory');
  }
});

ipcMain.handle('anix:getDubbers', async (_, releaseId) => {
  try {
    const client = getAnixart();
    return await client.endpoints.release.getDubbers(releaseId);
  } catch (err) {
    handleAnixError(err, 'getDubbers');
  }
});

ipcMain.handle('anix:typeAll', async () => {
  try {
    const client = getAnixart();
    return await client.endpoints.type.types();
  } catch (err) {
    handleAnixError(err, 'typeAll');
  }
});

ipcMain.handle('anix:getDubberSources', async (_, releaseId, dubberId) => {
  try {
    const client = getAnixart();
    return await client.endpoints.release.getDubberSources(releaseId, dubberId);
  } catch (err) {
    handleAnixError(err, 'getDubberSources');
  }
});

ipcMain.handle('anix:getEpisodes', async (_, releaseId, dubberId, sourceId, sort = 1) => {
  try {
    const client = getAnixart();
    return await client.endpoints.release.getEpisodes(releaseId, dubberId, sourceId, sort);
  } catch (err) {
    handleAnixError(err, 'getEpisodes');
  }
});

ipcMain.handle('anix:getEpisode', async (_, releaseId, sourceId, episodePosition) => {
  try {
    const client = getAnixart();
    return await client.endpoints.release.getEpisode(releaseId, sourceId, episodePosition);
  } catch (err) {
    handleAnixError(err, 'getEpisode');
  }
});

ipcMain.handle('anix:getEpisodeUpdates', async (_, releaseId, page = 0) => {
  try {
    const client = getAnixart();
    return await client.endpoints.episode.updates(releaseId, page);
  } catch (err) {
    handleAnixError(err, 'getEpisodeUpdates');
  }
});

ipcMain.handle('anix:randomRelease', async (_, extended = true) => {
  try {
    const client = getAnixart();
    const data = await client.endpoints.release.getRandomRelease(extended);
    return data;
  } catch (err) {
    handleAnixError(err, 'randomRelease');
  }
});

ipcMain.handle('anix:latestFeed', async (_, page = 1) => {
  try {
    const client = getAnixart();
    const data = await client.endpoints.feed.latest(page);
    return data;
  } catch (err) {
    handleAnixError(err, 'latestFeed');
  }
});

ipcMain.handle('anix:discoverRecommendations', async (_, page = -1, previousPage = -1) => {
  try {
    const client = getAnixart();
    const data = await client.endpoints.discover.recommendations(page, { previous_page: previousPage });
    return data;
  } catch (err) {
    logger.error('api', `discoverRecommendations: ${err?.message ?? err}`);
    return { content: [] };
  }
});

ipcMain.handle('anix:discoverInteresting', async () => {
  try {
    const client = getAnixart();
    return await client.endpoints.discover.interesting();
  } catch (err) {
    logger.error('api', `discoverInteresting: ${err?.message ?? err}`);
    return { content: [] };
  }
});

ipcMain.handle('anix:discoverWatching', async (_, page = 0) => {
  try {
    const client = getAnixart();
    return await client.endpoints.discover.watching(page);
  } catch (err) {
    logger.error('api', `discoverWatching: ${err?.message ?? err}`);
    return { content: [] };
  }
});

ipcMain.handle('anix:discoverDiscussing', async () => {
  try {
    const client = getAnixart();
    return await client.endpoints.discover.discussing();
  } catch (err) {
    logger.error('api', `discoverDiscussing: ${err?.message ?? err}`);
    return { content: [] };
  }
});

ipcMain.handle('anix:discoverCommentsWeek', async () => {
  try {
    const client = getAnixart();
    return await client.endpoints.discover.commentsWeek();
  } catch (err) {
    logger.error('api', `discoverCommentsWeek: ${err?.message ?? err}`);
    return { content: [] };
  }
});

ipcMain.handle('anix:discoverCollectionsWeek', async (_, page = -1, previousPage = -1) => {
  try {
    const client = getAnixart();
    return await client.endpoints.collection.collections(page, { where: 2, sort: 4, previous_page: previousPage });
  } catch (err) {
    logger.error('api', `discoverCollectionsWeek: ${err?.message ?? err}`);
    return { content: [] };
  }
});

loggedHandle('anix:filterReleases', async (_, page = 0, filterArgs = {}, extended = true) => {
  try {
    const client = getAnixart();
    const data = await client.endpoints.release.filter(page, filterArgs, extended);
    return data;
  } catch (err) {
    handleAnixError(err, 'filterReleases');
  }
});

loggedHandle('anix:homeCustomTabGet', async () => {
  const cfg = config.loadConfig();
  const profileId = cfg.profileId;
  if (!profileId) return { tabName: '', filter: null, activeTab: null };
  const entry = homeCustomFilter.getEntry(app.getPath('userData'), profileId);
  return entry ?? { tabName: '', filter: null, activeTab: null };
});

loggedHandle('anix:homeCustomTabSet', async (_, data) => {
  const cfg = config.loadConfig();
  const profileId = cfg.profileId;
  if (!profileId) throw new Error('Not logged in');
  homeCustomFilter.setEntry(app.getPath('userData'), profileId, {
    tabName: typeof data?.tabName === 'string' ? data.tabName : '',
    filter: data?.filter ?? null,
    activeTab: typeof data?.activeTab === 'string' ? data.activeTab : null,
  });
  return { ok: true };
});

ipcMain.handle('anix:articleById', async (_, id) => {
  try {
    const client = getAnixart();
    const data = await client.endpoints.channel.getArticle(id);
    return data;
  } catch (err) {
    handleAnixError(err, 'articleById');
  }
});

ipcMain.handle('anix:channelById', async (_, id) => {
  try {
    const client = getAnixart();
    const data = await client.endpoints.channel.info(id);
    return data;
  } catch (err) {
    handleAnixError(err, 'channelById');
  }
});

ipcMain.handle('anix:channelBlog', async (_, id) => {
  try {
    const client = getAnixart();
    const data = await client.endpoints.channel.getBlog(id);
    return data;
  } catch (err) {
    handleAnixError(err, 'channelBlog');
  }
});

ipcMain.handle('anix:profileById', async (_, id) => {
  try {
    const client = getAnixart();
    const data = await client.endpoints.profile.info(id);
    return data;
  } catch (err) {
    handleAnixError(err, 'profileById');
  }
});

ipcMain.handle('anix:collectionById', async (_, id) => {
  try {
    const client = getAnixart();
    const data = await client.endpoints.collection.info(id);
    return data;
  } catch (err) {
    handleAnixError(err, 'collectionById');
  }
});

ipcMain.handle('anix:collectionReleases', async (_, id, page = 0) => {
  try {
    const client = getAnixart();
    const data = await client.endpoints.collection.getCollectionReleases(id, page);
    return data;
  } catch (err) {
    handleAnixError(err, 'collectionReleases');
  }
});

ipcMain.handle('anix:collectionRandomRelease', async (_, id) => {
  try {
    const client = getAnixart();
    const data = await client.endpoints.collection.getRandomRelease(id, true);
    return data;
  } catch (err) {
    handleAnixError(err, 'collectionRandomRelease');
  }
});

ipcMain.handle('anix:addCollectionFavorite', async (_, id) => {
  try {
    const client = getAnixart();
    return await client.endpoints.collection.addCollectionFavorite(id);
  } catch (err) {
    handleAnixError(err, 'addCollectionFavorite');
  }
});

ipcMain.handle('anix:removeCollectionFavorite', async (_, id) => {
  try {
    const client = getAnixart();
    return await client.endpoints.collection.removeCollectionFavorite(id);
  } catch (err) {
    handleAnixError(err, 'removeCollectionFavorite');
  }
});

loggedHandle('anix:collectionsAll', async (_, page = 0, options = {}) => {
  try {
    const client = getAnixart();
    const sort = typeof options?.sort === 'number' ? options.sort : 2;
    const query = { sort };
    if (typeof options?.where === 'number') query.where = options.where;
    if (typeof options?.previousPage === 'number') query.previous_page = options.previousPage;
    const data = await client.endpoints.collection.collections(page, query);
    return data;
  } catch (err) {
    handleAnixError(err, 'collectionsAll');
  }
});

ipcMain.handle('anix:collectionProfileCollections', async (_, profileId, page = 0) => {
  try {
    const client = getAnixart();
    return await client.endpoints.collection.profileCollections(profileId, page);
  } catch (err) {
    handleAnixError(err, 'collectionProfileCollections');
  }
});

ipcMain.handle('anix:collectionMyCreate', async (_, body) => {
  try {
    const client = getAnixart();
    return await client.endpoints.collectionMy.create(body);
  } catch (err) {
    handleAnixError(err, 'collectionMyCreate');
  }
});

ipcMain.handle('anix:collectionMyEdit', async (_, id, body) => {
  try {
    const client = getAnixart();
    return await client.endpoints.collectionMy.edit(id, body);
  } catch (err) {
    handleAnixError(err, 'collectionMyEdit');
  }
});

ipcMain.handle('anix:collectionMyEditImage', async (_, id, imageBase64, fileName = 'image.jpg') => {
  try {
    const client = getAnixart();
    const base64 = typeof imageBase64 === 'string' ? imageBase64.replace(/^data:[^;]+;base64,/, '') : '';
    const buffer = Buffer.from(base64, 'base64');
    return await client.endpoints.collectionMy.editImage(id, buffer, fileName);
  } catch (err) {
    handleAnixError(err, 'collectionMyEditImage');
  }
});

ipcMain.handle('anix:collectionMyReleaseAdd', async (_, id, releaseId) => {
  try {
    const client = getAnixart();
    return await client.endpoints.collectionMy.releaseAdd(id, { release_id: releaseId });
  } catch (err) {
    handleAnixError(err, 'collectionMyReleaseAdd');
  }
});

ipcMain.handle('anix:collectionMyDelete', async (_, id) => {
  try {
    const client = getAnixart();
    return await client.endpoints.collectionMy.delete(id);
  } catch (err) {
    handleAnixError(err, 'collectionMyDelete');
  }
});

loggedHandle('anix:schedule', async () => {
  try {
    const client = getAnixart();
    return await client.endpoints.schedule.schedule();
  } catch (err) {
    logger.error('api', `schedule: ${err?.message ?? err}`);
    return {};
  }
});

ipcMain.handle('anix:favorites', async (_, page = 0, sort = BookmarkSortType.NewToOldAddTime, filterAnnounce = 0, filter = 0) => {
  try {
    const client = getAnixart();
    const data = await client.endpoints.profile.getFavorites({
      page,
      sort,
      filter_announce: filterAnnounce,
      filter,
    });
    appendLog('favorites', { page, sort, filterAnnounce, filter, response: data });
    return data;
  } catch (err) {
    handleAnixError(err, 'favorites');
  }
});

ipcMain.handle('anix:getBookmarks', async (_, profileId, type, page = 0, sort = BookmarkSortType.NewToOldAddTime, filterAnnounce = 0, filter = 0) => {
  try {
    const client = getAnixart();
    return await client.endpoints.profile.getBookmarks({
      id: profileId,
      type: type ?? BookmarkType.Watching,
      page,
      sort,
      filter_announce: filterAnnounce,
      filter,
    });
  } catch (err) {
    handleAnixError(err, 'getBookmarks');
  }
});

ipcMain.handle('anix:collectionFavorites', async (_, page = 0) => {
  try {
    const client = getAnixart();
    return await client.endpoints.collectionFavorite.favorites(page);
  } catch (err) {
    handleAnixError(err, 'collectionFavorites');
  }
});

ipcMain.handle('anix:randomFavorite', async (_, extended = true) => {
  try {
    const client = getAnixart();
    return await client.endpoints.release.randomFavorite({ extended_mode: extended });
  } catch (err) {
    handleAnixError(err, 'randomFavorite');
  }
});

ipcMain.handle('anix:randomProfileList', async (_, profileId, status, extended = true) => {
  try {
    const client = getAnixart();
    return await client.endpoints.release.randomProfileList(profileId, status, { extended_mode: extended });
  } catch (err) {
    handleAnixError(err, 'randomProfileList');
  }
});

ipcMain.handle('anix:notificationsAll', async (_, page = 0) => {
  try {
    const client = getAnixart();
    const data = await client.endpoints.notification.getNotifications(page);
    appendLog('notifications', { page, response: data });
    return data;
  } catch (err) {
    handleAnixError(err, 'notificationsAll');
  }
});

ipcMain.handle('anix:notificationsCount', async () => {
  try {
    const client = getAnixart();
    const data = await client.endpoints.notification.countNotifications();
    return data;
  } catch (err) {
    handleAnixError(err, 'notificationsCount');
  }
});

ipcMain.handle('anix:history', async (_, page = 0) => {
  try {
    const client = getAnixart();
    const data = await client.endpoints.release.getHistory(page);
    return data;
  } catch (err) {
    handleAnixError(err, 'history');
  }
});

ipcMain.handle('anix:deleteFromHistory', async (_, releaseId) => {
  try {
    const client = getAnixart();
    return await client.endpoints.history.delete(releaseId);
  } catch (err) {
    handleAnixError(err, 'deleteFromHistory');
  }
});

ipcMain.handle('anix:addToHistory', async (_, releaseId, sourceId, episodePosition) => {
  try {
    const client = getAnixart();
    await client.endpoints.release.addToHistory(releaseId, sourceId, episodePosition);
  } catch (err) {
    handleAnixError(err, 'addToHistory');
  }
});

ipcMain.handle('anix:markEpisodeAsWatched', async (_, releaseId, sourceId, episodePosition) => {
  try {
    const client = getAnixart();
    await client.endpoints.release.markEpisodeAsWatched(releaseId, sourceId, episodePosition);
  } catch (err) {
    handleAnixError(err, 'markEpisodeAsWatched');
  }
});

ipcMain.handle('anix:unmarkEpisodeAsWatched', async (_, releaseId, sourceId, episodePosition) => {
  try {
    const client = getAnixart();
    await client.endpoints.release.unmarkEpisodeAsWatched(releaseId, sourceId, episodePosition);
  } catch (err) {
    handleAnixError(err, 'unmarkEpisodeAsWatched');
  }
});

ipcMain.handle('anix:relatedReleases', async (_, relatedId, page = 0) => {
  try {
    const client = getAnixart();
    const data = await client.endpoints.release.getRelatedReleases(relatedId, page);
    appendLog('relatedReleases', { relatedId, page, response: data });
    return data;
  } catch (err) {
    handleAnixError(err, 'relatedReleases');
  }
});

ipcMain.handle('anix:votedReleases', async (_, profileId, page = 0) => {
  try {
    const client = getAnixart();
    const data = await client.endpoints.profile.getVotedReleases(profileId, page);
    return data;
  } catch (err) {
    handleAnixError(err, 'votedReleases');
  }
});

ipcMain.handle('anix:friends', async (_, profileId, page = 0) => {
  try {
    const client = getAnixart();
    const data = await client.endpoints.profile.getFriends({ id: profileId, page });
    return data;
  } catch (err) {
    handleAnixError(err, 'friends');
  }
});

ipcMain.handle('anix:friendRequestSend', async (_, profileId) => {
  try {
    const client = getAnixart();
    return await client.endpoints.profile.sendFriendRequest(profileId);
  } catch (err) {
    handleAnixError(err, 'friendRequestSend');
  }
});

ipcMain.handle('anix:friendRequestRemove', async (_, profileId) => {
  try {
    const client = getAnixart();
    return await client.endpoints.profile.removeFriendRequest(profileId);
  } catch (err) {
    handleAnixError(err, 'friendRequestRemove');
  }
});

ipcMain.handle('anix:friendRecommendations', async () => {
  try {
    const client = getAnixart();
    return await client.endpoints.profile.getFriendRecommendations();
  } catch (err) {
    handleAnixError(err, 'friendRecommendations');
  }
});

ipcMain.handle('anix:profileReleaseComments', async (_, profileId, page = 0, sort = 1) => {
  try {
    const client = getAnixart();
    return await client.endpoints.profile.getReleaseComments(profileId, page, sort);
  } catch (err) {
    handleAnixError(err, 'profileReleaseComments');
  }
});

ipcMain.handle('anix:profileCollectionComments', async (_, profileId, page = 0, sort = 1) => {
  try {
    const client = getAnixart();
    return await client.endpoints.profile.getCollectionComments(profileId, page, sort);
  } catch (err) {
    handleAnixError(err, 'profileCollectionComments');
  }
});

ipcMain.handle('anix:profileArticleComments', async (_, profileId, page = 0, sort = 1) => {
  try {
    const client = getAnixart();
    return await client.endpoints.profile.getArticleComments(profileId, page, sort);
  } catch (err) {
    handleAnixError(err, 'profileArticleComments');
  }
});

ipcMain.handle('anix:profileFavoriteVideos', async (_, profileId, page = 0) => {
  try {
    const client = getAnixart();
    return await client.endpoints.profile.getFavoriteVideos(profileId, page);
  } catch (err) {
    handleAnixError(err, 'profileFavoriteVideos');
  }
});

// ——— Настройки профиля ———

ipcMain.handle('anix:getProfileSettings', async () => {
  try {
    const client = getAnixart();
    return await client.endpoints.settings.getCurrentProfileSettings();
  } catch (err) {
    handleAnixError(err, 'getProfileSettings');
  }
});

ipcMain.handle('anix:setStatus', async (_, status) => {
  try {
    const client = getAnixart();
    return await client.endpoints.settings.setStatus(status);
  } catch (err) {
    handleAnixError(err, 'setStatus');
  }
});

ipcMain.handle('anix:getSocial', async () => {
  try {
    const client = getAnixart();
    return await client.endpoints.settings.getSocial();
  } catch (err) {
    handleAnixError(err, 'getSocial');
  }
});

ipcMain.handle('anix:setSocial', async (_, data) => {
  try {
    const client = getAnixart();
    return await client.endpoints.settings.setSocial(data);
  } catch (err) {
    handleAnixError(err, 'setSocial');
  }
});

ipcMain.handle('anix:setPrivacyStats', async (_, state) => {
  try {
    const client = getAnixart();
    return await client.endpoints.settings.setPrivacyStats(state);
  } catch (err) {
    handleAnixError(err, 'setPrivacyStats');
  }
});

ipcMain.handle('anix:setPrivacyCounts', async (_, state) => {
  try {
    const client = getAnixart();
    return await client.endpoints.settings.setPrivacyCounts(state);
  } catch (err) {
    handleAnixError(err, 'setPrivacyCounts');
  }
});

ipcMain.handle('anix:setPrivacySocial', async (_, state) => {
  try {
    const client = getAnixart();
    return await client.endpoints.settings.setPrivacySocial(state);
  } catch (err) {
    handleAnixError(err, 'setPrivacySocial');
  }
});

ipcMain.handle('anix:setPrivacyFriendRequests', async (_, state) => {
  try {
    const client = getAnixart();
    return await client.endpoints.settings.setPrivacyFriendRequests(state);
  } catch (err) {
    handleAnixError(err, 'setPrivacyFriendRequests');
  }
});

ipcMain.handle('anix:getLoginInfo', async () => {
  try {
    const client = getAnixart();
    return await client.endpoints.settings.getLoginInfo();
  } catch (err) {
    handleAnixError(err, 'getLoginInfo');
  }
});

ipcMain.handle('anix:changeLogin', async (_, newLogin) => {
  try {
    const client = getAnixart();
    const res = await client.endpoints.settings.changeLogin(newLogin);
    // Update cached login in config if successful
    if (res && res.code === 0) {
      config.saveConfig({ profileLogin: newLogin });
    }
    return res;
  } catch (err) {
    handleAnixError(err, 'changeLogin');
  }
});

// ——— Поиск ———

loggedHandle('anix:searchReleases', async (_, query, page = 0, searchBy = 0) => {
  try {
    const client = getAnixart();
    const data = await client.endpoints.search.releases({ query, page, searchBy });
    logger.info('search', 'releases', { query, page, searchBy, total: data?.total });
    return data;
  } catch (err) {
    handleAnixError(err, 'searchReleases');
  }
});

ipcMain.handle('anix:searchProfiles', async (_, query, page = 0) => {
  try {
    const client = getAnixart();
    const data = await client.endpoints.search.profiles({ query, page, searchBy: 0 });
    appendLog('searchProfiles', { query, page, response: data });
    return data;
  } catch (err) {
    handleAnixError(err, 'searchProfiles');
  }
});

ipcMain.handle('anix:searchCollections', async (_, query, page = 0) => {
  try {
    const client = getAnixart();
    const data = await client.endpoints.search.collections({ query, page, searchBy: 0 });
    appendLog('searchCollections', { query, page, response: data });
    return data;
  } catch (err) {
    handleAnixError(err, 'searchCollections');
  }
});

// ——— Избранное и список (профиль) ———

ipcMain.handle('anix:addToFavorites', async (_, releaseId) => {
  const client = getAnixart();
  const res = await client.endpoints.release.addFavorite(releaseId);
  return res?.code === DefaultResult.Ok ? undefined : Promise.reject(new Error(res?.code ?? 'fail'));
});

ipcMain.handle('anix:removeFromFavorites', async (_, releaseId) => {
  const client = getAnixart();
  const res = await client.endpoints.release.removeFavorite(releaseId);
  return res?.code === DefaultResult.Ok ? undefined : Promise.reject(new Error(res?.code ?? 'fail'));
});

ipcMain.handle('anix:setListStatus', async (_, releaseId, statusId) => {
  const type = LIST_STATUS_TO_TYPE[statusId];
  if (type == null) return Promise.reject(new Error('unknown status'));
  const client = getAnixart();
  // Сначала убираем из остальных списков — иначе тайтл остаётся в старой категории.
  for (const [id, otherType] of Object.entries(LIST_STATUS_TO_TYPE)) {
    if (id === statusId) continue;
    try {
      await client.endpoints.release.removeFromProfileList(releaseId, otherType);
    } catch {
      /* ignore — мог не быть в этом списке */
    }
  }
  const res = await client.endpoints.release.addToProfileList(releaseId, type);
  return res?.code === DefaultResult.Ok ? undefined : Promise.reject(new Error(res?.code ?? 'fail'));
});

ipcMain.handle('anix:clearListStatus', async (_, releaseId, statusId) => {
  const type = LIST_STATUS_TO_TYPE[statusId];
  if (type == null) return Promise.reject(new Error('unknown status'));
  const client = getAnixart();
  const res = await client.endpoints.release.removeFromProfileList(releaseId, type);
  return res?.code === DefaultResult.Ok ? undefined : Promise.reject(new Error(res?.code ?? 'fail'));
});

ipcMain.handle('anix:releaseVote', async (_, releaseId, vote) => {
  const client = getAnixart();
  const res = await client.endpoints.release.vote(releaseId, vote);
  if (res?.code !== DefaultResult.Ok) {
    return Promise.reject(new Error(String(res?.code ?? 'vote failed')));
  }
  return res;
});

ipcMain.handle('anix:releaseDeleteVote', async (_, releaseId) => {
  const client = getAnixart();
  const res = await client.endpoints.release.deleteVote(releaseId);
  if (res?.code !== DefaultResult.Ok) {
    return Promise.reject(new Error(String(res?.code ?? 'delete vote failed')));
  }
  return res;
});

ipcMain.handle('anix:releaseComments', async (_, releaseId, page = 0, sort = 1) => {
  try {
    const client = getAnixart();
    return await client.endpoints.releaseComment.comments(releaseId, page, { sort });
  } catch (err) {
    handleAnixError(err, 'releaseComments');
  }
});

ipcMain.handle('anix:releaseCommentReplies', async (_, commentId, page = 0, sort = 2) => {
  try {
    const client = getAnixart();
    return await client.endpoints.releaseComment.replies(commentId, page, { sort });
  } catch (err) {
    handleAnixError(err, 'releaseCommentReplies');
  }
});

ipcMain.handle('anix:releaseCommentVote', async (_, commentId, vote) => {
  try {
    const client = getAnixart();
    const res = await client.endpoints.releaseComment.vote(commentId, vote);
    if (res?.code !== DefaultResult.Ok) {
      return Promise.reject(new Error(String(res?.code ?? 'comment vote failed')));
    }
    return res;
  } catch (err) {
    handleAnixError(err, 'releaseCommentVote');
  }
});

ipcMain.handle('anix:releaseCommentById', async (_, commentId) => {
  try {
    const client = getAnixart();
    return await client.endpoints.releaseComment.comment(commentId);
  } catch (err) {
    handleAnixError(err, 'releaseCommentById');
  }
});

ipcMain.handle('anix:releaseCommentAdd', async (_, releaseId, body) => {
  try {
    const client = getAnixart();
    const payload = {
      message: body.message,
      spoiler: !!(body.spoiler ?? body.isSpoiler),
      parentCommentId: body.parentCommentId ?? null,
      replyToProfileId: body.replyToProfileId ?? null,
    };
    const res = await client.endpoints.releaseComment.add(releaseId, payload);
    if (res?.code != null && res.code !== DefaultResult.Ok) {
      return Promise.reject(new Error(String(res.code ?? 'comment add failed')));
    }
    return res;
  } catch (err) {
    handleAnixError(err, 'releaseCommentAdd');
  }
});

ipcMain.handle('anix:releaseCommentEdit', async (_, commentId, body) => {
  try {
    const client = getAnixart();
    const res = await client.endpoints.releaseComment.edit(commentId, {
      message: body.message,
      spoiler: !!(body.spoiler ?? body.isSpoiler),
    });
    if (res?.code !== DefaultResult.Ok) {
      return Promise.reject(new Error(String(res?.code ?? 'comment edit failed')));
    }
    return res;
  } catch (err) {
    handleAnixError(err, 'releaseCommentEdit');
  }
});

ipcMain.handle('anix:releaseCommentDelete', async (_, commentId) => {
  try {
    const client = getAnixart();
    const res = await client.endpoints.releaseComment.delete(commentId);
    if (res?.code !== DefaultResult.Ok) {
      return Promise.reject(new Error(String(res?.code ?? 'comment delete failed')));
    }
    return res;
  } catch (err) {
    handleAnixError(err, 'releaseCommentDelete');
  }
});
}

module.exports = { register };
