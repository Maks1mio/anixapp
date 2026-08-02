/**
 * Совместимость AnixApp (AnixartJS 0.1.x API) → AnixApi 0.3.x
 * @param {import('anixapi').Anixart} client
 */
function attachLegacyEndpoints(client) {
  const ep = client.endpoints;

  ep.feed.latest = (page) => ep.feed.latestArticles(page);

  const release = ep.release;
  release.info = (id, extended = true) => release.release(id, { extended_mode: extended });
  release.getRandomRelease = (extended = true) => release.random({ extended_mode: extended });
  release.getVideos = (releaseId) => ep.releaseVideo.main(releaseId);
  release.getVideoInCategory = ({ id, categoryId, page = 1 }) =>
    ep.releaseVideo.category(id, categoryId, page);
  release.getDubbers = (releaseId) => ep.episode.types(releaseId);
  release.getDubberSources = (releaseId, dubberId) => ep.episode.sources(releaseId, dubberId);
  release.getEpisodes = (releaseId, dubberId, sourceId, sort = 1) =>
    ep.episode.episodes(releaseId, dubberId, sourceId, { sort });
  release.getEpisode = (releaseId, sourceId, episodePosition) =>
    ep.episode.episodeTarget(releaseId, sourceId, episodePosition);
  release.filter = (page, filterArgs, extended = true) =>
    ep.filter.filter(page, filterArgs, { extended_mode: extended });
  release.getHistory = (page) => ep.history.history(page);
  release.addToHistory = (releaseId, sourceId, episodePosition) =>
    ep.history.add(releaseId, sourceId, episodePosition);
  release.markEpisodeAsWatched = (releaseId, sourceId, episodePosition) =>
    ep.episode.watch(releaseId, sourceId, episodePosition);
  release.unmarkEpisodeAsWatched = (releaseId, sourceId, episodePosition) =>
    ep.episode.unwatch(releaseId, sourceId, episodePosition);
  release.getRelatedReleases = (relatedId, page) => ep.related.related(relatedId, page);
  release.addFavorite = (releaseId) => ep.favorite.add(releaseId);
  release.removeFavorite = (releaseId) => ep.favorite.delete(releaseId);
  release.addToProfileList = (releaseId, type) => ep.profileList.add(type, releaseId);
  release.removeFromProfileList = (releaseId, type) => ep.profileList.delete(type, releaseId);
  release.schedule = () => ep.schedule.schedule();

  ep.discover.getRecommendations = (page) => ep.discover.recommendations(page);

  ep.channel.getArticle = (id) => ep.article.article(id);
  ep.channel.info = (id) => ep.channel.channel(id);
  ep.channel.getBlog = (id) => ep.channel.blog(id);

  const profileById = ep.profile.byId.bind(ep.profile);
  const profileInfo = ep.profile.info.bind(ep.profile);
  ep.profile.info = (id) => (id != null ? profileById(id) : profileInfo());
  ep.profile.getFavorites = ({ page, sort, filter_announce, filter }) =>
    ep.favorite.favorites(page, { sort, filter_announce, filter });
  ep.profile.getBookmarks = ({ id, type, page, sort, filter_announce, filter }) =>
    ep.profileList.profileListByProfile(id, type, page, { sort, filter_announce, filter });
  ep.profile.getVotedReleases = (profileId, page, sort = 1) =>
    ep.profileReleaseVote.allReleaseVoted(profileId, page, { sort });
  ep.profile.getSocialPages = (id) => ep.profile.social(id);
  ep.profile.getFriends = ({ id, page }) => ep.profileFriend.friends(id, page);
  ep.profile.sendFriendRequest = (id) => ep.profileFriend.requestSend(id);
  ep.profile.removeFriendRequest = (id) => ep.profileFriend.requestRemove(id);
  ep.profile.hideFriendRequest = (id) => ep.profileFriend.requestHide(id);
  ep.profile.getFriendRequestsIn = (page = 0) => ep.profileFriend.requestsIn(page);
  ep.profile.getFriendRequestsOut = (page = 0) => ep.profileFriend.requestsOut(page);
  ep.profile.getFriendRecommendations = () => ep.profileFriend.recommendations();
  ep.profile.getReleaseComments = (profileId, page, sort = 1) =>
    ep.releaseComment.profileComments(profileId, page, { sort });
  ep.profile.getCollectionComments = (profileId, page, sort = 1) =>
    ep.collectionComment.profileComments(profileId, page, { sort });
  ep.profile.getArticleComments = (profileId, page, sort = 1) =>
    ep.articleComment.profileComments(profileId, page, { sort });
  ep.profile.getFavoriteVideos = (profileId, page) =>
    ep.releaseVideoFavorite.favorites(profileId, page);

  ep.collection.info = (id) => ep.collection.collection(id);
  ep.collection.getCollectionReleases = (id, page) => ep.collection.releases(id, page);
  ep.collection.getRandomRelease = (id, extended = true) =>
    release.randomCollection(id, { extended_mode: extended });
  ep.collection.addCollectionFavorite = (id) => ep.collectionFavorite.add(id);
  ep.collection.removeCollectionFavorite = (id) => ep.collectionFavorite.delete(id);
  ep.collection.all = (page, sort) => ep.collection.collections(page, { sort });

  ep.notification.getNotifications = (page) => ep.notification.all(page);
  ep.notification.countNotifications = () => ep.notification.count();
  ep.notification.readNotifications = () => ep.notification.read();

  const pref = ep.profilePreference;
  Object.defineProperty(ep, 'settings', {
    value: {
      getCurrentProfileSettings: () => pref.my(),
      setStatus: (status) => pref.statusEdit({ status }),
      getSocial: () => pref.social(),
      setSocial: (data) => pref.socialPagesEdit(normalizeSocial(data)),
      setPrivacyStats: (state) => pref.privacyStatsEdit({ permission: state }),
      setPrivacyCounts: (state) => pref.privacyCountsEdit({ permission: state }),
      setPrivacySocial: (state) => pref.privacySocialEdit({ permission: state }),
      setPrivacyFriendRequests: (state) => pref.privacyFriendRequestsEdit({ permission: state }),
      getLoginInfo: () => pref.changeLoginInfo(),
      changeLogin: (newLogin) => pref.changeLogin({ login: newLogin }),
    },
    writable: true,
    configurable: true,
  });

  ep.search.releases = ({ query, page, searchBy = 0 }) =>
    ep.search.releaseSearch(page, { query, searchBy });
  ep.search.profiles = ({ query, page, searchBy = 0 }) =>
    ep.search.profileSearch(page, { query, searchBy });
  ep.search.collections = ({ query, page, searchBy = 0 }) =>
    ep.search.collectionSearch(page, { query, searchBy });

  return client;
}

/** Как в SocialPagesEditRequest (Jackson): camelCase, не snake_case. */
function normalizeSocial(data) {
  if (!data || typeof data !== 'object') return data;
  return {
    vkPage: String(data.vk_page ?? data.vkPage ?? ''),
    tgPage: String(data.tg_page ?? data.tgPage ?? ''),
    instPage: String(data.inst_page ?? data.instPage ?? ''),
    ttPage: String(data.tt_page ?? data.ttPage ?? ''),
    discordPage: String(data.discord_page ?? data.discordPage ?? ''),
  };
}

module.exports = { attachLegacyEndpoints };
