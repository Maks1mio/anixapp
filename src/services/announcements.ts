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
  /** Total comment count (from API) */
  commentCount?: number;
  /** Up to 3 unique user IDs of most recent commenters (newest-first) */
  lastCommenterIds?: number[];
  /** Text of the last comment */
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

const BASE = 'https://nhapp-api.onrender.com/api';

export async function fetchAnnouncements(): Promise<Announcement[]> {
  try {
    const res = await fetch(`${BASE}/announcements`, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return [];
    const data = await res.json();
    if (!Array.isArray(data)) return [];
    return data.filter((a: any) => a && a.active !== false);
  } catch {
    return [];
  }
}

export async function fetchReactions(announcementId: string, userId?: number): Promise<ReactionsResult> {
  const url = userId
    ? `${BASE}/announcements/${announcementId}/reactions?user_id=${userId}`
    : `${BASE}/announcements/${announcementId}/reactions`;
  const res = await fetch(url);
  if (!res.ok) return { likes: 0, dislikes: 0, userReaction: null };
  return res.json();
}

export async function sendReaction(
  announcementId: string,
  userId: number,
  reaction: Reaction
): Promise<ReactionsResult> {
  const res = await fetch(`${BASE}/announcements/${announcementId}/reactions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: userId, reaction }),
  });
  if (!res.ok) throw new Error('Failed to send reaction');
  return res.json();
}

export async function fetchComments(announcementId: string): Promise<Comment[]> {
  const res = await fetch(`${BASE}/announcements/${announcementId}/comments`);
  if (!res.ok) return [];
  return res.json();
}

export async function sendComment(
  announcementId: string,
  userId: number,
  message: string
): Promise<Comment> {
  const res = await fetch(`${BASE}/announcements/${announcementId}/comments`, {
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
  const res = await fetch(`${BASE}/announcements/${announcementId}/comments/${commentId}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: userId }),
  });
  if (!res.ok && res.status !== 204) {
    const err = await res.json().catch(() => ({ error: 'Failed to delete comment' }));
    throw new Error(err.error ?? 'Failed to delete comment');
  }
}

export async function fetchUserPermissions(userId: number): Promise<string[]> {
  try {
    const res = await fetch(`${BASE}/users/${userId}/roles`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data.permissions) ? data.permissions : [];
  } catch {
    return [];
  }
}
