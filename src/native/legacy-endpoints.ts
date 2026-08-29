/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyClient = {
  endpoints: any;
};

function unsupportedUpload(): never {
  throw new Error('Загрузка изображений на Android TV пока не поддерживается');
}

function normalizeSocial(data: Record<string, unknown> | null | undefined) {
  if (!data || typeof data !== 'object') return data;
  return {
    vkPage: String(data.vk_page ?? data.vkPage ?? ''),
    tgPage: String(data.tg_page ?? data.tgPage ?? ''),
    instPage: String(data.inst_page ?? data.instPage ?? ''),
    ttPage: String(data.tt_page ?? data.ttPage ?? ''),
    discordPage: String(data.discord_page ?? data.discordPage ?? ''),
  };
}

/** Совместимость AnixApp → AnixApi 0.3.x (без Node Buffer). */
export function attachLegacyEndpoints<T extends AnyClient>(client: T): T {
  const ep = client.endpoints;

  ep.feed.latest = (page: number) => ep.feed.latestArticles(page);

  const release = ep.release;
  release.info = (id: number, extended = true) => release.release(id, { extended_mode: extended });
  release.getRandomRelease = (extended = true) => release.random({ extended_mode: extended });
  release.getVideos = (releaseId: number) => ep.releaseVideo.main(releaseId);
  release.getVideoInCategory = ({ id, categoryId, page = 1 }: { id: number; categoryId: number; page?: number }) =>
    ep.releaseVideo.category(id, categoryId, page);
  release.getDubbers = (releaseId: number) => ep.episode.types(releaseId);
  release.getDubberSources = (releaseId: number, dubberId: number) => ep.episode.sources(releaseId, dubberId);
  release.getEpisodes = (releaseId: number, dubberId: number, sourceId: number, sort = 1) =>
    ep.episode.episodes(releaseId, dubberId, sourceId, { sort });
  release.getEpisode = (releaseId: number, sourceId: number, episodePosition: number) =>
    ep.episode.episodeTarget(releaseId, sourceId, episodePosition);
  release.filter = (page: number, filterArgs: unknown, extended = true) =>
    ep.filter.filter(page, filterArgs, { extended_mode: extended });
  release.getHistory = (page: number) => ep.history.history(page);
  release.addToHistory = (releaseId: number, sourceId: number, episodePosition: number) =>
    ep.history.add(releaseId, sourceId, episodePosition);
  release.markEpisodeAsWatched = (releaseId: number, sourceId: number, episodePosition: number) =>
    ep.episode.watch(releaseId, sourceId, episodePosition);
  release.unmarkEpisodeAsWatched = (releaseId: number, sourceId: number, episodePosition: number) =>
    ep.episode.unwatch(releaseId, sourceId, episodePosition);
  release.getRelatedReleases = (relatedId: number, page: number) => ep.related.related(relatedId, page);
  release.addFavorite = (releaseId: number) => ep.favorite.add(releaseId);
  release.removeFavorite = (releaseId: number) => ep.favorite.delete(releaseId);
  release.addToProfileList = (releaseId: number, type: number) => ep.profileList.add(type, releaseId);
  release.removeFromProfileList = (releaseId: number, type: number) => ep.profileList.delete(type, releaseId);
  release.schedule = () => ep.schedule.schedule();

  ep.discover.getRecommendations = (page: number) => ep.discover.recommendations(page);

  ep.channel.getArticle = (id: number) => ep.article.article(id);
  ep.channel.info = (id: number) => ep.channel.channel(id);
  ep.channel.getBlog = (id: number) => ep.channel.blog(id);
  ep.channel.uploadCover = unsupportedUpload;
  ep.channel.deleteCover = (channelId: number) => ep.channel.coverDelete(channelId);

  const profileById = ep.profile.byId.bind(ep.profile);
  const profileInfo = ep.profile.info.bind(ep.profile);
  ep.profile.info = (id?: number) => (id != null ? profileById(id) : profileInfo());
  ep.profile.getFavorites = ({ page, sort, filter_announce, filter }: Record<string, number>) =>
    ep.favorite.favorites(page, { sort, filter_announce, filter });
  ep.profile.getBookmarks = ({ id, type, page, sort, filter_announce, filter }: Record<string, number>) =>
    ep.profileList.profileListByProfile(id, type, page, { sort, filter_announce, filter });
  ep.profile.getVotedReleases = (profileId: number, page: number, sort = 1) =>
    ep.profileReleaseVote.allReleaseVoted(profileId, page, { sort });
  ep.profile.getSocialPages = (id: number) => ep.profile.social(id);
  ep.profile.getFriends = ({ id, page }: { id: number; page: number }) => ep.profileFriend.friends(id, page);
  ep.profile.sendFriendRequest = (id: number) => ep.profileFriend.requestSend(id);
  ep.profile.removeFriendRequest = (id: number) => ep.profileFriend.requestRemove(id);
  ep.profile.hideFriendRequest = (id: number) => ep.profileFriend.requestHide(id);
  ep.profile.getFriendRequestsIn = (page = 0) => ep.profileFriend.requestsIn(page);
  ep.profile.getFriendRequestsOut = (page = 0) => ep.profileFriend.requestsOut(page);
  ep.profile.getFriendRecommendations = () => ep.profileFriend.recommendations();
  ep.profile.getReleaseComments = (profileId: number, page: number, sort = 1) =>
    ep.releaseComment.profileComments(profileId, page, { sort });
  ep.profile.getCollectionComments = (profileId: number, page: number, sort = 1) =>
    ep.collectionComment.profileComments(profileId, page, { sort });
  ep.profile.getArticleComments = (profileId: number, page: number, sort = 1) =>
    ep.articleComment.profileComments(profileId, page, { sort });
  ep.profile.getFavoriteVideos = (profileId: number, page: number) =>
    ep.releaseVideoFavorite.favorites(profileId, page);

  ep.collection.info = (id: number) => ep.collection.collection(id);
  ep.collection.getCollectionReleases = (id: number, page: number) => ep.collection.releases(id, page);
  ep.collection.getRandomRelease = (id: number, extended = true) =>
    release.randomCollection(id, { extended_mode: extended });
  ep.collection.addCollectionFavorite = (id: number) => ep.collectionFavorite.add(id);
  ep.collection.removeCollectionFavorite = (id: number) => ep.collectionFavorite.delete(id);
  ep.collection.all = (page: number, sort: number) => ep.collection.collections(page, { sort });

  ep.notification.getNotifications = (page: number) => ep.notification.all(page);
  ep.notification.countNotifications = () => ep.notification.count();
  ep.notification.readNotifications = () => ep.notification.read();

  const pref = ep.profilePreference;
  Object.defineProperty(ep, 'settings', {
    value: {
      getCurrentProfileSettings: () => pref.my(),
      setStatus: (status: string) => pref.statusEdit({ status }),
      getSocial: () => pref.social(),
      setSocial: (data: Record<string, unknown>) => pref.socialPagesEdit(normalizeSocial(data)),
      setPrivacyStats: (state: number) => pref.privacyStatsEdit({ permission: state }),
      setPrivacyCounts: (state: number) => pref.privacyCountsEdit({ permission: state }),
      setPrivacySocial: (state: number) => pref.privacySocialEdit({ permission: state }),
      setPrivacyFriendRequests: (state: number) => pref.privacyFriendRequestsEdit({ permission: state }),
      getLoginInfo: () => pref.changeLoginInfo(),
      changeLogin: (newLogin: string) => pref.changeLogin({ login: newLogin }),
      getBadges: (page = 0) => ep.profileBadge.all(page),
      setBadge: (id: number) => ep.profileBadge.edit(id),
      removeBadge: () => ep.profileBadge.remove(),
      selectTheme: (id: number) => pref.selectTheme({ id }),
      setAvatar: unsupportedUpload,
      deleteAvatar: () => pref.avatarDelete(),
    },
    writable: true,
    configurable: true,
  });

  ep.search.releases = ({ query, page, searchBy = 0 }: { query: string; page: number; searchBy?: number }) =>
    ep.search.releaseSearch(page, { query, searchBy });
  ep.search.profiles = ({ query, page, searchBy = 0 }: { query: string; page: number; searchBy?: number }) =>
    ep.search.profileSearch(page, { query, searchBy });
  ep.search.collections = ({ query, page, searchBy = 0 }: { query: string; page: number; searchBy?: number }) =>
    ep.search.collectionSearch(page, { query, searchBy });

  return client;
}
