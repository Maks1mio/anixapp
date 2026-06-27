'use strict';

const { BookmarkType } = require('anixapi');

const AUTH_FILE = 'auth.json';
const DEFAULT_BASE_URL = 'https://api-s.anixsekai.com';
const LOG_DIR = 'logs';

const ANIXART_UA = 'AnixartApp/9.0 BETA 3-25021818 (Android 9; SDK 28; x86_64; ROG ASUS AI2201_B; ru)';

const VIDEO_HOSTS = [
  'anixis.com', 'aniqart.com', 'aniqit.com', 'video.sibnet.ru', 'sibnet.ru',
  'kodikplayer.com', 'kodik-cdn.com', 'kodik-storage.com', 'solodcdn.com', 'collaps.io',
  'aniliberty.top', 'anilibria.tv', 'anilibria.top', 'libria.fun', 'cache.libria.fun',
];

/** Не подменять CORS-заголовки — ломает YouTube/Rutube embed */
const EMBED_MEDIA_HOSTS = [
  'youtube.com', 'youtu.be', 'googlevideo.com', 'ytimg.com', 'ggpht.com',
  'googleapis.com', 'gstatic.com', 'google.com', 'rutube.ru',
];

const LIST_STATUS_TO_TYPE = {
  watching: BookmarkType.Watching,
  planned: BookmarkType.InPlans,
  completed: BookmarkType.Completed,
  on_hold: BookmarkType.HoldOn,
  dropped: BookmarkType.Dropped,
};

const UI_ZOOM_LEVELS = [50, 67, 75, 80, 90, 100, 110, 125, 150, 175, 200];

const DISCORD_RPC_PAGE_KEYS = [
  'discordRpcPageHome', 'discordRpcPageOverview', 'discordRpcPagePopular',
  'discordRpcPageCollections', 'discordRpcPageMyCollections', 'discordRpcPageCollection',
  'discordRpcPageCollectionEdit', 'discordRpcPageRelease', 'discordRpcPageReleaseComments',
  'discordRpcPageReleaseRelated', 'discordRpcPageProfile', 'discordRpcPageProfileFriends',
  'discordRpcPageProfileVotes', 'discordRpcPageBookmarks', 'discordRpcPageSearch',
  'discordRpcPageDownloads', 'discordRpcPageAnnouncement', 'discordRpcPageOther',
];

module.exports = {
  AUTH_FILE,
  DEFAULT_BASE_URL,
  LOG_DIR,
  ANIXART_UA,
  VIDEO_HOSTS,
  EMBED_MEDIA_HOSTS,
  LIST_STATUS_TO_TYPE,
  UI_ZOOM_LEVELS,
  DISCORD_RPC_PAGE_KEYS,
};
