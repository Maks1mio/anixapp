import type { ProfileTab } from './components/ProfileTabNav.svelte';

const ICON_STATS = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 20V10M12 20V4M20 20v-6"/></svg>';
const ICON_VOTES = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"/></svg>';
const ICON_COLLECTIONS = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5z"/></svg>';
const ICON_COMMENTS = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
const ICON_FRIENDS = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>';
const ICON_VIDEOS = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5,3 19,12 5,21"/></svg>';

export function buildProfileTabs(
  profile: Record<string, unknown>,
  friendsPreviewCount = 0,
): ProfileTab[] {
  const tabs: ProfileTab[] = [];
  if (!profile.is_stats_hidden) {
    tabs.push({ id: 'stats', label: 'Статистика', icon: ICON_STATS });
  }
  const friendCount = Number(profile.friend_count ?? 0);
  if (!profile.is_counts_hidden && (friendCount > 0 || friendsPreviewCount > 0)) {
    tabs.push({ id: 'friends', label: 'Друзья', icon: ICON_FRIENDS });
  }
  if (Array.isArray(profile.votes) && profile.votes.length) {
    tabs.push({ id: 'votes', label: 'Оценки', icon: ICON_VOTES });
  }
  const collectionCount = Number(profile.collection_count ?? 0);
  const collectionsPreview = Array.isArray(profile.collections_preview) ? profile.collections_preview : [];
  if (collectionCount > 0 || collectionsPreview.length) {
    tabs.push({ id: 'collections', label: 'Коллекции', icon: ICON_COLLECTIONS });
  }
  if (Array.isArray(profile.comments_preview) && profile.comments_preview.length) {
    tabs.push({ id: 'comments', label: 'Комментарии', icon: ICON_COMMENTS });
  }
  if (Array.isArray(profile.release_video_preview) && profile.release_video_preview.length) {
    tabs.push({ id: 'videos', label: 'Видео', icon: ICON_VIDEOS });
  }
  return tabs;
}
