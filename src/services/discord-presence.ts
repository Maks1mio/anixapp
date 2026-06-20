import {
  type DiscordRpcPageSettings,
  type DiscordRpcSettings,
  isPageRpcEnabled,
  normalizeDiscordRpcSettings,
} from './discord-rpc-settings';
import { toDiscordRpcImageUrl } from '../utils/posterUrl';

export interface DiscordPresenceContext {
  releaseTitle?: string;
  releasePoster?: string;
  profileLogin?: string;
  profileAvatar?: string;
  profileIsSelf?: boolean;
  collectionTitle?: string;
  collectionImage?: string;
  searchQuery?: string;
}

export interface DiscordPresenceRouteInput {
  path: string;
  collectionsWeek?: boolean;
  searchQuery?: string;
}

type ResolvedPresence =
  | { ipcType: 'browsing' }
  | { ipcType: 'page'; pageKey: keyof DiscordRpcPageSettings; details: string; state: string }
  | { ipcType: 'release'; pageKey: keyof DiscordRpcPageSettings; title: string; posterUrl?: string; state?: string }
  | { ipcType: 'profile'; pageKey: keyof DiscordRpcPageSettings; username: string; avatarUrl?: string; isSelf: boolean; state?: string }
  | { ipcType: 'collection'; pageKey: keyof DiscordRpcPageSettings; title: string; imageUrl?: string; state?: string };

let context: DiscordPresenceContext = {};
let settingsCache: DiscordRpcSettings | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let lastRouteInput: DiscordPresenceRouteInput | null = null;

function discordUpdate(data: Record<string, unknown>) {
  (window.electron as { discordUpdate?: (d: Record<string, unknown>) => void } | undefined)?.discordUpdate?.(data);
}

async function loadSettings(): Promise<DiscordRpcSettings> {
  if (!window.electron?.getSettings) return normalizeDiscordRpcSettings(null);
  try {
    const raw = await window.electron.getSettings();
    settingsCache = normalizeDiscordRpcSettings(raw as Record<string, unknown>);
    return settingsCache;
  } catch {
    return normalizeDiscordRpcSettings(null);
  }
}

export function invalidateDiscordRpcSettingsCache() {
  settingsCache = null;
}

export function setDiscordContext(partial: DiscordPresenceContext) {
  context = { ...context, ...partial };
}

export function clearDiscordContext() {
  context = {};
}

export function getDiscordContext(): Readonly<DiscordPresenceContext> {
  return context;
}

export function resolveRoutePresence(input: DiscordPresenceRouteInput): ResolvedPresence {
  const path = input.path.split('?')[0] || '/';
  const ctx = {
    ...context,
    searchQuery: input.searchQuery ?? context.searchQuery,
  };

  if (path === '/') {
    return { ipcType: 'page', pageKey: 'discordRpcPageHome', details: 'AnixApp', state: 'Главная' };
  }
  if (path === '/overview') {
    return { ipcType: 'page', pageKey: 'discordRpcPageOverview', details: 'Обзор', state: 'В приложении' };
  }
  if (path === '/overview/popular') {
    return { ipcType: 'page', pageKey: 'discordRpcPagePopular', details: 'Популярное', state: 'В приложении' };
  }
  if (path === '/collections/my') {
    return { ipcType: 'page', pageKey: 'discordRpcPageMyCollections', details: 'Мои коллекции', state: 'В приложении' };
  }
  if (
    path === '/collections/create'
    || path === '/collections/pick-release'
    || /^\/collections\/edit\/\d+$/.test(path)
  ) {
    return { ipcType: 'page', pageKey: 'discordRpcPageCollectionEdit', details: 'Редактор коллекции', state: 'В приложении' };
  }
  if (path === '/collections' || input.collectionsWeek) {
    return {
      ipcType: 'page',
      pageKey: 'discordRpcPageCollections',
      details: input.collectionsWeek ? 'Коллекции недели' : 'Коллекции',
      state: 'В приложении',
    };
  }
  const collectionMatch = path.match(/^\/collection\/(\d+)$/);
  if (collectionMatch) {
    return {
      ipcType: 'collection',
      pageKey: 'discordRpcPageCollection',
      title: ctx.collectionTitle || 'Коллекция',
      imageUrl: ctx.collectionImage,
      state: 'Просматривает коллекцию',
    };
  }
  const releaseCommentsMatch = path.match(/^\/release\/(\d+)\/comments$/);
  const releaseRepliesMatch = path.match(/^\/release\/(\d+)\/comment\/(\d+)\/replies$/);
  if (releaseCommentsMatch || releaseRepliesMatch) {
    return {
      ipcType: 'release',
      pageKey: 'discordRpcPageReleaseComments',
      title: ctx.releaseTitle || 'Аниме',
      posterUrl: ctx.releasePoster,
      state: 'Комментарии',
    };
  }
  const releaseRelatedMatch = path.match(/^\/release\/(\d+)\/related$/);
  if (releaseRelatedMatch) {
    return {
      ipcType: 'release',
      pageKey: 'discordRpcPageReleaseRelated',
      title: ctx.releaseTitle || 'Аниме',
      posterUrl: ctx.releasePoster,
      state: 'Связанные релизы',
    };
  }
  const releaseMatch = path.match(/^\/release\/(\d+)$/);
  if (releaseMatch) {
    return {
      ipcType: 'release',
      pageKey: 'discordRpcPageRelease',
      title: ctx.releaseTitle || 'Аниме',
      posterUrl: ctx.releasePoster,
      state: 'Страница аниме',
    };
  }
  const profileFriendsMatch = path.match(/^\/profile\/(\d+)\/friends$/);
  if (profileFriendsMatch) {
    return {
      ipcType: 'profile',
      pageKey: 'discordRpcPageProfileFriends',
      username: ctx.profileLogin || 'Пользователь',
      avatarUrl: ctx.profileAvatar,
      isSelf: !!ctx.profileIsSelf,
      state: 'Друзья',
    };
  }
  const profileVotesMatch = path.match(/^\/profile\/(\d+)\/votes$/);
  if (profileVotesMatch) {
    return {
      ipcType: 'profile',
      pageKey: 'discordRpcPageProfileVotes',
      username: ctx.profileLogin || 'Пользователь',
      avatarUrl: ctx.profileAvatar,
      isSelf: !!ctx.profileIsSelf,
      state: 'Оценки',
    };
  }
  const profileMatch = path.match(/^\/profile\/(\d+)$/);
  if (profileMatch) {
    return {
      ipcType: 'profile',
      pageKey: 'discordRpcPageProfile',
      username: ctx.profileLogin || 'Пользователь',
      avatarUrl: ctx.profileAvatar,
      isSelf: !!ctx.profileIsSelf,
    };
  }
  if (path === '/profile/friends') {
    return {
      ipcType: 'profile',
      pageKey: 'discordRpcPageProfileFriends',
      username: ctx.profileLogin || 'Пользователь',
      avatarUrl: ctx.profileAvatar,
      isSelf: true,
      state: 'Друзья',
    };
  }
  if (path === '/profile/votes') {
    return {
      ipcType: 'profile',
      pageKey: 'discordRpcPageProfileVotes',
      username: ctx.profileLogin || 'Пользователь',
      avatarUrl: ctx.profileAvatar,
      isSelf: true,
      state: 'Оценки',
    };
  }
  if (path === '/profile') {
    return {
      ipcType: 'profile',
      pageKey: 'discordRpcPageProfile',
      username: ctx.profileLogin || 'Пользователь',
      avatarUrl: ctx.profileAvatar,
      isSelf: true,
    };
  }
  if (path === '/bookmarks') {
    return { ipcType: 'page', pageKey: 'discordRpcPageBookmarks', details: 'Закладки', state: 'В приложении' };
  }
  if (path === '/search') {
    const q = ctx.searchQuery?.trim();
    return {
      ipcType: 'page',
      pageKey: 'discordRpcPageSearch',
      details: 'Поиск',
      state: q && q.length >= 2 ? q : 'В приложении',
    };
  }
  if (path === '/downloads') {
    return { ipcType: 'page', pageKey: 'discordRpcPageDownloads', details: 'Загрузки', state: 'В приложении' };
  }
  if (/^\/announcement\/[^/]+\/chat$/.test(path)) {
    return { ipcType: 'page', pageKey: 'discordRpcPageAnnouncement', details: 'Объявление', state: 'Чат' };
  }
  return { ipcType: 'page', pageKey: 'discordRpcPageOther', details: 'AnixApp', state: 'В приложении' };
}

function applyResolved(settings: DiscordRpcSettings, resolved: ResolvedPresence) {
  if (!settings.discordRpcEnabled) return;

  const showImages = settings.discordRpcShowImages !== false;
  const sendGenericInApp = () => {
    discordUpdate({
      type: 'page',
      details: 'AnixApp',
      state: 'В приложении',
      showImages,
    });
  };

  if (!settings.discordRpcShowBrowsing) {
    sendGenericInApp();
    return;
  }

  if (resolved.ipcType === 'browsing') {
    sendGenericInApp();
    return;
  }

  if (!isPageRpcEnabled(settings, resolved.pageKey)) {
    sendGenericInApp();
    return;
  }

  switch (resolved.ipcType) {
    case 'page':
      discordUpdate({
        type: 'page',
        details: resolved.details,
        state: resolved.state,
        showImages,
      });
      break;
    case 'release':
      discordUpdate({
        type: 'release',
        title: resolved.title,
        posterUrl: showImages ? toDiscordRpcImageUrl(resolved.posterUrl) : undefined,
        state: resolved.state,
        showImages,
      });
      if (showImages && resolved.posterUrl) {
        discordUpdate({ type: 'posterUrl', posterUrl: toDiscordRpcImageUrl(resolved.posterUrl) });
      }
      break;
    case 'profile':
      discordUpdate({
        type: 'profile',
        username: resolved.username,
        avatarUrl: showImages ? toDiscordRpcImageUrl(resolved.avatarUrl) : undefined,
        isSelf: resolved.isSelf,
        state: resolved.state,
        showImages,
      });
      break;
    case 'collection':
      discordUpdate({
        type: 'collection',
        title: resolved.title,
        imageUrl: showImages ? toDiscordRpcImageUrl(resolved.imageUrl) : undefined,
        state: resolved.state,
        showImages,
      });
      break;
  }
}

export async function syncDiscordPresence(input: DiscordPresenceRouteInput) {
  if (!window.electron?.discordUpdate) return;
  const settings = settingsCache ?? await loadSettings();
  const resolved = resolveRoutePresence(input);
  applyResolved(settings, resolved);
}

export function scheduleDiscordPresenceSync(input: DiscordPresenceRouteInput) {
  lastRouteInput = input;
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    void syncDiscordPresence(input);
  }, 150);
}

/** Re-sync after page context loaded (same route, richer data). */
export function refreshDiscordPresence() {
  if (lastRouteInput) void syncDiscordPresence(lastRouteInput);
}
