/** User vote: 0 = none, 1 = dislike, 2 = like (VoteType in API) */
export type CommentVoteValue = 0 | 1 | 2;

export interface CommentProfile {
  id: number;
  login: string;
  avatar: string;
  badgeUrl?: string;
  isVerified?: boolean;
  isSponsor?: boolean;
}

/** Normalized comment shape for UI (release / article / collection) */
export interface CommentData {
  id: number;
  message: string;
  timestamp: number;
  voteCount: number;
  userVote: CommentVoteValue;
  isSpoiler: boolean;
  isEdited: boolean;
  isDeleted: boolean;
  replyCount: number;
  parentCommentId: number | null;
  postedAtEpisode?: number | null;
  profile: CommentProfile;
}

export type CommentSort = 1 | 2 | 3;

export const COMMENT_SORT_OPTIONS: { value: CommentSort; label: string }[] = [
  { value: 1, label: 'Сначала новые' },
  { value: 2, label: 'Сначала старые' },
  { value: 3, label: 'Сначала популярные' },
];

export const COMMENT_SORT_DEFAULT: CommentSort = 1;
export const COMMENT_REPLIES_SORT_DEFAULT: CommentSort = 2;
