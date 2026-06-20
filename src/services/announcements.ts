export type AnnouncementType = 'NOTE' | 'TIP' | 'IMPORTANT' | 'WARNING' | 'CAUTION' | 'DISCUSSION';
export type Reaction = 'like' | 'dislike';

export interface Announcement {
  id: string;
  type: AnnouncementType;
  message: string;
  link?: { url: string; label: string } | null;
  createdAt: string;
  active: boolean;
  commentsEnabled: boolean;
  commentsLocked: boolean;
  commentCount?: number;
  lastCommenterIds?: number[];
  lastMessage?: string | null;
}

export interface ReactionsResult {
  likes: number;
  dislikes: number;
  userReaction: Reaction | null;
}

export interface Comment {
  id: string;
  announcementId: string;
  userId: number;
  message: string;
  createdAt: string;
}

import { getApiBase, getAdminToken } from './admin-api';

function apiBase(): string {
  return getApiBase();
}

export {
  fetchUserRoles,
  fetchUserPermissions,
  type UserRole,
  type UserRolesResult,
} from './admin-api';

function adminHeaders(): HeadersInit {
  const token = getAdminToken();
  return token
    ? { 'Content-Type': 'application/json', 'X-Admin-Token': token }
    : { 'Content-Type': 'application/json' };
}

export async function fetchAnnouncements(): Promise<Announcement[]> {
  try {
    const res = await fetch(`${apiBase()}/announcements`, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return [];
    const data = await res.json();
    if (!Array.isArray(data)) return [];
    return data.filter((a: Announcement) => a && a.active !== false);
  } catch {
    return [];
  }
}

export async function fetchAllAnnouncements(): Promise<Announcement[]> {
  const res = await fetch(`${apiBase()}/announcements/all`, { headers: adminHeaders() });
  if (!res.ok) throw new Error('failed to load announcements');
  return res.json();
}

export async function createAnnouncement(input: {
  type: AnnouncementType;
  message: string;
  link?: { url: string; label: string } | null;
  commentsEnabled?: boolean;
  commentsLocked?: boolean;
  active?: boolean;
}): Promise<Announcement> {
  const res = await fetch(`${apiBase()}/announcements`, {
    method: 'POST',
    headers: adminHeaders(),
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error('failed to create');
  return res.json();
}

export async function updateAnnouncement(
  id: string,
  patch: Partial<Pick<Announcement, 'type' | 'message' | 'link' | 'active' | 'commentsEnabled' | 'commentsLocked'>>
): Promise<Announcement> {
  const res = await fetch(`${apiBase()}/announcements/${id}`, {
    method: 'PATCH',
    headers: adminHeaders(),
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error('failed to update');
  return res.json();
}

export async function deleteAnnouncement(id: string): Promise<void> {
  const res = await fetch(`${apiBase()}/announcements/${id}`, {
    method: 'DELETE',
    headers: adminHeaders(),
  });
  if (!res.ok && res.status !== 204) throw new Error('failed to delete');
}

export async function fetchReactions(announcementId: string, userId?: number): Promise<ReactionsResult> {
  const url = userId
    ? `${apiBase()}/announcements/${announcementId}/reactions?user_id=${userId}`
    : `${apiBase()}/announcements/${announcementId}/reactions`;
  const res = await fetch(url);
  if (!res.ok) return { likes: 0, dislikes: 0, userReaction: null };
  return res.json();
}

export async function sendReaction(
  announcementId: string,
  userId: number,
  reaction: Reaction
): Promise<ReactionsResult> {
  const res = await fetch(`${apiBase()}/announcements/${announcementId}/reactions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: userId, reaction }),
  });
  if (!res.ok) throw new Error('Failed to send reaction');
  return res.json();
}

export async function fetchComments(announcementId: string): Promise<Comment[]> {
  const res = await fetch(`${apiBase()}/announcements/${announcementId}/comments`);
  if (!res.ok) return [];
  return res.json();
}

export async function sendComment(
  announcementId: string,
  userId: number,
  message: string
): Promise<Comment> {
  const res = await fetch(`${apiBase()}/announcements/${announcementId}/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: userId, message }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to send comment' }));
    throw new Error(err.error ?? 'Failed to send comment');
  }
  return res.json();
}

export async function deleteComment(
  announcementId: string,
  commentId: string,
  userId: number
): Promise<void> {
  const res = await fetch(`${apiBase()}/announcements/${announcementId}/comments/${commentId}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: userId }),
  });
  if (!res.ok && res.status !== 204) {
    const err = await res.json().catch(() => ({ error: 'Failed to delete comment' }));
    throw new Error(err.error ?? 'Failed to delete comment');
  }
}
