'use strict';

const { ipcMain } = require('electron');
const { BookmarkType, BookmarkSortType, DefaultResult } = require('anixapi');
const { broadcastBookmarksChanged } = require('../lib/broadcast');

function toPositiveInt(value) {
  const n = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
}

function toNonNegativeInt(value) {
  const n = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : null;
}

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
  const releaseId = toPositiveInt(id);
  if (releaseId == null) return null;
  try {
    const client = getAnixart();
    const data = await client.endpoints.release.info(releaseId, extended);
    return data;
  } catch (err) {
    handleAnixError(err, 'releaseById');
  }
});

ipcMain.handle('anix:getVideos', async (_, releaseId) => {
  const id = toPositiveInt(releaseId);
  if (id == null) return { types: [] };
  try {
    const client = getAnixart();
    return await client.endpoints.release.getVideos(id);
  } catch (err) {
    handleAnixError(err, 'getVideos');
  }
});

ipcMain.handle('anix:getVideoInCategory', async (_, releaseId, categoryId, page = 1) => {
  const id = toPositiveInt(releaseId);
  const cat = toPositiveInt(categoryId);
  if (id == null || cat == null) return { videos: [] };
  try {
    const client = getAnixart();
    return await client.endpoints.release.getVideoInCategory({ id, categoryId: cat, page });
  } catch (err) {
    handleAnixError(err, 'getVideoInCategory');
  }
});

ipcMain.handle('anix:getDubbers', async (_, releaseId) => {
  const id = toPositiveInt(releaseId);
  if (id == null) return { types: [] };
  try {
    const client = getAnixart();
    return await client.endpoints.release.getDubbers(id);
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

ipcMain.handle('anix:typePin', async (_, releaseId, typeId) => {
  const id = toPositiveInt(releaseId);
  const type = toPositiveInt(typeId);
  if (id == null || type == null) return null;
  try {
    const client = getAnixart();
    return await client.endpoints.type.pin(id, type);
  } catch (err) {
    handleAnixError(err, 'typePin');
  }
});

ipcMain.handle('anix:typeUnpin', async (_, releaseId, typeId) => {
  const id = toPositiveInt(releaseId);
  const type = toPositiveInt(typeId);
  if (id == null || type == null) return null;
  try {
    const client = getAnixart();
    return await client.endpoints.type.unpin(id, type);
  } catch (err) {
    handleAnixError(err, 'typeUnpin');
  }
});

ipcMain.handle('anix:getDubberSources', async (_, releaseId, dubberId) => {
  const id = toPositiveInt(releaseId);
  const dubId = toPositiveInt(dubberId);
  if (id == null || dubId == null) return { sources: [] };
  try {
    const client = getAnixart();
    return await client.endpoints.release.getDubberSources(id, dubId);
  } catch (err) {
    handleAnixError(err, 'getDubberSources');
  }
});

ipcMain.handle('anix:getEpisodes', async (_, releaseId, dubberId, sourceId, sort = 1) => {
  const id = toPositiveInt(releaseId);
  const dubId = toPositiveInt(dubberId);
  const srcId = toPositiveInt(sourceId);
  if (id == null || dubId == null || srcId == null) return { episodes: [] };
  try {
    const client = getAnixart();
    return await client.endpoints.release.getEpisodes(id, dubId, srcId, sort);
  } catch (err) {
    handleAnixError(err, 'getEpisodes');
  }
});

ipcMain.handle('anix:getEpisode', async (_, releaseId, sourceId, episodePosition) => {
  const id = toPositiveInt(releaseId);
  const srcId = toPositiveInt(sourceId);
  const ep = toNonNegativeInt(episodePosition);
  if (id == null || srcId == null || ep == null) return { episode: null };
  try {
    const client = getAnixart();
    return await client.endpoints.release.getEpisode(id, srcId, ep);
  } catch (err) {
    handleAnixError(err, 'getEpisode');
  }
});

ipcMain.handle('anix:getEpisodeUpdates', async (_, releaseId, page = 0) => {
  const id = toPositiveInt(releaseId);
  if (id == null) return { content: [] };
  try {
    const client = getAnixart();
    return await client.endpoints.episode.updates(id, page);
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

ipcMain.handle('anix:latestFeed', async (_, page = 0) => {
  try {
    const client = getAnixart();
    const data = await client.endpoints.feed.latest(page);
    return data;
  } catch (err) {
    handleAnixError(err, 'latestFeed');
  }
});

ipcMain.handle('anix:myFeed', async (_, page = 0, opts = {}) => {
  try {
    const client = getAnixart();
    const channelId = opts?.channelId != null && Number(opts.channelId) > 0
      ? Number(opts.channelId)
      : undefined;
    const date = Number.isFinite(Number(opts?.date)) ? Number(opts.date) : 0;
    const query = {
      date,
      ...(channelId != null ? { channel_id: channelId } : {}),
    };
    return await client.endpoints.feed.feed(page, query);
  } catch (err) {
    handleAnixError(err, 'myFeed');
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

ipcMain.handle('anix:articleVote', async (_, id, vote) => {
  try {
    const client = getAnixart();
    return await client.endpoints.article.vote(id, vote);
  } catch (err) {
    handleAnixError(err, 'articleVote');
  }
});

ipcMain.handle('anix:articleDelete', async (_, id) => {
  try {
    const client = getAnixart();
    return await client.endpoints.article.delete(id);
  } catch (err) {
    handleAnixError(err, 'articleDelete');
  }
});

ipcMain.handle('anix:articleMute', async (_, id) => {
  try {
    const client = getAnixart();
    return await client.endpoints.article.mute(id);
  } catch (err) {
    handleAnixError(err, 'articleMute');
  }
});

ipcMain.handle('anix:articleUnmute', async (_, id) => {
  try {
    const client = getAnixart();
    return await client.endpoints.article.unmute(id);
  } catch (err) {
    handleAnixError(err, 'articleUnmute');
  }
});

ipcMain.handle('anix:articlePin', async (_, id, isPinned) => {
  try {
    const client = getAnixart();
    return await client.endpoints.article.editIsPinned(id, { is_pinned: !!isPinned });
  } catch (err) {
    handleAnixError(err, 'articlePin');
  }
});

ipcMain.handle('anix:reportArticleReasons', async () => {
  try {
    const client = getAnixart();
    return await client.endpoints.report.articleReasons();
  } catch (err) {
    handleAnixError(err, 'reportArticleReasons');
  }
});

ipcMain.handle('anix:reportArticle', async (_, body) => {
  try {
    const client = getAnixart();
    return await client.endpoints.report.article(body);
  } catch (err) {
    handleAnixError(err, 'reportArticle');
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

ipcMain.handle('anix:channelArticles', async (_, channelId, page = 0) => {
  try {
    const client = getAnixart();
    return await client.endpoints.channel.articles(channelId, page);
  } catch (err) {
    handleAnixError(err, 'channelArticles');
  }
});

ipcMain.handle('anix:channelSubscribe', async (_, channelId) => {
  try {
    const client = getAnixart();
    return await client.endpoints.channel.subscribe(channelId);
  } catch (err) {
    handleAnixError(err, 'channelSubscribe');
  }
});

ipcMain.handle('anix:channelUnsubscribe', async (_, channelId) => {
  try {
    const client = getAnixart();
    return await client.endpoints.channel.unsubscribe(channelId);
  } catch (err) {
    handleAnixError(err, 'channelUnsubscribe');
  }
});

ipcMain.handle('anix:channelSubscriptions', async (_, page = 0) => {
  try {
    const client = getAnixart();
    return await client.endpoints.channel.subscriptions(page);
  } catch (err) {
    handleAnixError(err, 'channelSubscriptions');
  }
});

ipcMain.handle('anix:channelEditorAll', async () => {
  try {
    const client = getAnixart();
    return await client.endpoints.channel.editorAvailableAll();
  } catch (err) {
    handleAnixError(err, 'channelEditorAll');
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
    const res = await client.endpoints.collection.addCollectionFavorite(id);
    broadcastBookmarksChanged({ kind: 'collections', releaseId: id });
    return res;
  } catch (err) {
    handleAnixError(err, 'addCollectionFavorite');
  }
});

ipcMain.handle('anix:removeCollectionFavorite', async (_, id) => {
  try {
    const client = getAnixart();
    const res = await client.endpoints.collection.removeCollectionFavorite(id);
    broadcastBookmarksChanged({ kind: 'collections', releaseId: id });
    return res;
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

ipcMain.handle('anix:notificationsRead', async () => {
  try {
    const client = getAnixart();
    return await client.endpoints.notification.read();
  } catch (err) {
    handleAnixError(err, 'notificationsRead');
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
    const res = await client.endpoints.history.delete(releaseId);
    broadcastBookmarksChanged({ kind: 'history', releaseId });
    return res;
  } catch (err) {
    handleAnixError(err, 'deleteFromHistory');
  }
});

ipcMain.handle('anix:addToHistory', async (_, releaseId, sourceId, episodePosition) => {
  try {
    const client = getAnixart();
    await client.endpoints.release.addToHistory(releaseId, sourceId, episodePosition);
    broadcastBookmarksChanged({ kind: 'history', releaseId });
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

ipcMain.handle('anix:votedReleases', async (_, profileId, page = 0, sort = 1) => {
  try {
    const client = getAnixart();
    // API требует sort — без него отвечает HTTP 200 с пустым телом
    const sortValue = Number(sort);
    const safeSort = Number.isFinite(sortValue) && sortValue > 0 ? sortValue : 1;
    const data = await client.endpoints.profileReleaseVote.allReleaseVoted(
      profileId,
      page,
      { sort: safeSort },
    );
    return data;
  } catch (err) {
    const msg = String(err?.message || err || '');
    // Без sort / за последней страницей API может отдать пустое тело
    if (msg.includes('empty response')) {
      return { content: [], last: true, total_count: 0, code: 0 };
    }
    handleAnixError(err, 'votedReleases');
  }
});

ipcMain.handle('anix:profileSocial', async (_, profileId) => {
  try {
    const client = getAnixart();
    return await client.endpoints.profile.getSocialPages(profileId);
  } catch (err) {
    handleAnixError(err, 'profileSocial');
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

ipcMain.handle('anix:friendRequestHide', async (_, profileId) => {
  try {
    const client = getAnixart();
    return await client.endpoints.profile.hideFriendRequest(profileId);
  } catch (err) {
    handleAnixError(err, 'friendRequestHide');
  }
});

ipcMain.handle('anix:friendRequestsIn', async (_, page = 0) => {
  try {
    const client = getAnixart();
    return await client.endpoints.profile.getFriendRequestsIn(page);
  } catch (err) {
    handleAnixError(err, 'friendRequestsIn');
  }
});

ipcMain.handle('anix:friendRequestsOut', async (_, page = 0) => {
  try {
    const client = getAnixart();
    return await client.endpoints.profile.getFriendRequestsOut(page);
  } catch (err) {
    handleAnixError(err, 'friendRequestsOut');
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

ipcMain.handle('anix:getBadges', async (_, page = 0) => {
  try {
    const client = getAnixart();
    return await client.endpoints.settings.getBadges(page);
  } catch (err) {
    handleAnixError(err, 'getBadges');
  }
});

ipcMain.handle('anix:setBadge', async (_, id) => {
  try {
    const client = getAnixart();
    return await client.endpoints.settings.setBadge(id);
  } catch (err) {
    handleAnixError(err, 'setBadge');
  }
});

ipcMain.handle('anix:removeBadge', async () => {
  try {
    const client = getAnixart();
    return await client.endpoints.settings.removeBadge();
  } catch (err) {
    handleAnixError(err, 'removeBadge');
  }
});

ipcMain.handle('anix:selectTheme', async (_, id) => {
  try {
    const client = getAnixart();
    return await client.endpoints.settings.selectTheme(id);
  } catch (err) {
    handleAnixError(err, 'selectTheme');
  }
});

ipcMain.handle('anix:setAvatar', async (_, imageBase64, fileName = 'image.jpg') => {
  try {
    const client = getAnixart();
    return await client.endpoints.settings.setAvatar(imageBase64, fileName);
  } catch (err) {
    handleAnixError(err, 'setAvatar');
  }
});

ipcMain.handle('anix:deleteAvatar', async () => {
  try {
    const client = getAnixart();
    return await client.endpoints.settings.deleteAvatar();
  } catch (err) {
    handleAnixError(err, 'deleteAvatar');
  }
});

ipcMain.handle('anix:channelUploadCover', async (_, channelId, imageBase64, fileName = 'image.jpg') => {
  try {
    const client = getAnixart();
    return await client.endpoints.channel.uploadCover(channelId, imageBase64, fileName);
  } catch (err) {
    handleAnixError(err, 'channelUploadCover');
  }
});

ipcMain.handle('anix:channelDeleteCover', async (_, channelId) => {
  try {
    const client = getAnixart();
    return await client.endpoints.channel.deleteCover(channelId);
  } catch (err) {
    handleAnixError(err, 'channelDeleteCover');
  }
});

ipcMain.handle('anix:channelCreateBlog', async () => {
  try {
    const client = getAnixart();
    return await client.endpoints.channel.createBlog();
  } catch (err) {
    handleAnixError(err, 'channelCreateBlog');
  }
});

ipcMain.handle('anix:loginHistory', async (_, profileId, page = 0) => {
  try {
    const client = getAnixart();
    return await client.endpoints.profile.changeLoginHistory(profileId, page);
  } catch (err) {
    handleAnixError(err, 'loginHistory');
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

loggedHandle('anix:searchProfileList', async (_, status, query, page = 0, searchBy = 0) => {
  try {
    const client = getAnixart();
    const data = await client.endpoints.search.profileListSearch(status, page, {
      query,
      page,
      searchBy,
    });
    logger.info('search', 'profileList', { status, query, page, searchBy, total: data?.total_count ?? data?.total });
    return data;
  } catch (err) {
    handleAnixError(err, 'searchProfileList');
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
  if (res?.code !== DefaultResult.Ok) return Promise.reject(new Error(res?.code ?? 'fail'));
  broadcastBookmarksChanged({ kind: 'favorites', releaseId });
  return undefined;
});

ipcMain.handle('anix:removeFromFavorites', async (_, releaseId) => {
  const client = getAnixart();
  const res = await client.endpoints.release.removeFavorite(releaseId);
  if (res?.code !== DefaultResult.Ok) return Promise.reject(new Error(res?.code ?? 'fail'));
  broadcastBookmarksChanged({ kind: 'favorites', releaseId });
  return undefined;
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
  if (res?.code !== DefaultResult.Ok) return Promise.reject(new Error(res?.code ?? 'fail'));
  broadcastBookmarksChanged({ kind: 'list', releaseId, statusId });
  return undefined;
});

ipcMain.handle('anix:clearListStatus', async (_, releaseId, statusId) => {
  const type = LIST_STATUS_TO_TYPE[statusId];
  if (type == null) return Promise.reject(new Error('unknown status'));
  const client = getAnixart();
  const res = await client.endpoints.release.removeFromProfileList(releaseId, type);
  if (res?.code !== DefaultResult.Ok) return Promise.reject(new Error(res?.code ?? 'fail'));
  broadcastBookmarksChanged({ kind: 'list', releaseId, statusId: null });
  return undefined;
});

ipcMain.handle('anix:releaseVote', async (_, releaseId, vote) => {
  const client = getAnixart();
  const res = await client.endpoints.release.vote(releaseId, vote);
  if (res?.code !== DefaultResult.Ok) {
    return Promise.reject(new Error(String(res?.code ?? 'vote failed')));
  }
  broadcastBookmarksChanged({ kind: 'votes', releaseId });
  return res;
});

ipcMain.handle('anix:releaseDeleteVote', async (_, releaseId) => {
  const client = getAnixart();
  const res = await client.endpoints.release.deleteVote(releaseId);
  if (res?.code !== DefaultResult.Ok) {
    return Promise.reject(new Error(String(res?.code ?? 'delete vote failed')));
  }
  broadcastBookmarksChanged({ kind: 'votes', releaseId });
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

ipcMain.handle('anix:releaseCommentVotes', async (_, commentId, page = 0, sort = 2) => {
  try {
    const client = getAnixart();
    return await client.endpoints.releaseComment.votes(commentId, page, { sort });
  } catch (err) {
    handleAnixError(err, 'releaseCommentVotes');
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
