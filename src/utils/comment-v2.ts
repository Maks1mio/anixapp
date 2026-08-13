import type { CommentData, CommentVoteValue } from '../types/comment';
import type { UiV2CommentNode } from '../components/uikit-v2/UiV2CommentThread.svelte';

export function commentDataToUiV2Node(
  c: CommentData,
  releaseMeta?: { id: number; title?: string },
): UiV2CommentNode {
  return {
    id: c.id,
    message: c.message,
    timestamp: c.timestamp,
    voteCount: c.voteCount,
    userVote: c.userVote,
    isSpoiler: c.isSpoiler,
    isEdited: c.isEdited,
    isDeleted: c.isDeleted,
    postedAtEpisode: c.postedAtEpisode,
    replyCount: c.replyCount,
    profile: {
      id: c.profile.id,
      login: c.profile.login,
      avatar: c.profile.avatar,
      badgeUrl: c.profile.badgeUrl,
      badgeName: c.profile.badgeName,
    },
    releaseId: releaseMeta?.id,
    releaseTitle: releaseMeta?.title,
    releaseHint: releaseMeta?.title ? 'к релизу' : null,
  };
}

export function uiV2NodeToCommentData(node: UiV2CommentNode): CommentData {
  return {
    id: typeof node.id === 'number' ? node.id : Number(node.id) || 0,
    message: node.message,
    timestamp: node.timestamp,
    voteCount: node.voteCount,
    userVote: (node.userVote ?? 0) as CommentVoteValue,
    isSpoiler: !!node.isSpoiler,
    isEdited: !!node.isEdited,
    isDeleted: !!node.isDeleted,
    replyCount: Math.max(node.replyCount ?? 0, node.replies?.length ?? 0),
    parentCommentId: null,
    postedAtEpisode: node.postedAtEpisode ?? null,
    profile: {
      id: node.profile.id,
      login: node.profile.login,
      avatar: node.profile.avatar ?? '',
      badgeUrl: node.profile.badgeUrl ?? undefined,
      badgeName: node.profile.badgeName ?? undefined,
    },
  };
}

export function patchUiV2CommentNode(
  nodes: UiV2CommentNode[],
  id: number | string,
  patch: Partial<UiV2CommentNode> | ((n: UiV2CommentNode) => UiV2CommentNode),
): UiV2CommentNode[] {
  return nodes.map((node) => {
    if (node.id === id) {
      return typeof patch === 'function' ? patch(node) : { ...node, ...patch };
    }
    if (node.replies?.length) {
      return { ...node, replies: patchUiV2CommentNode(node.replies, id, patch) };
    }
    return node;
  });
}

export function setUiV2CommentReplies(
  nodes: UiV2CommentNode[],
  parentId: number | string,
  replies: UiV2CommentNode[],
): UiV2CommentNode[] {
  return patchUiV2CommentNode(nodes, parentId, (node) => ({
    ...node,
    replies,
    replyCount: Math.max(node.replyCount ?? 0, replies.length),
  }));
}

export function appendUiV2CommentReply(
  nodes: UiV2CommentNode[],
  parentId: number | string,
  reply: UiV2CommentNode,
): UiV2CommentNode[] {
  return patchUiV2CommentNode(nodes, parentId, (node) => {
    const replies = [...(node.replies ?? []), reply];
    return {
      ...node,
      replies,
      replyCount: Math.max(node.replyCount ?? 0, replies.length),
    };
  });
}

/** Flatten tree back to top-level CommentData[] (replies discarded for parent sync). */
export function uiV2NodesToCommentDataList(nodes: UiV2CommentNode[]): CommentData[] {
  return nodes.map((n) => {
    const base = uiV2NodeToCommentData(n);
    return {
      ...base,
      replyCount: Math.max(base.replyCount, n.replies?.length ?? 0),
    };
  });
}
