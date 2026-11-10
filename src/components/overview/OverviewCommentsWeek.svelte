<script lang="ts">
  import { navigate } from '../../stores/navigation';
  import { handleUserProfileClick } from '../../stores/user-profile';
  import { requireAuth } from '../../stores/auth';
  import UiV2CommentThread, {
    type UiV2CommentNode,
  } from '../uikit-v2/UiV2CommentThread.svelte';
  import { type OverviewCommentWeekItem } from '../../utils/overview';
  import { apiVotePayload } from '../../utils/comment';
  import type { CommentVoteValue } from '../../types/comment';

  interface Props {
    items: OverviewCommentWeekItem[];
  }

  let { items }: Props = $props();

  /** Голоса, поставленные здесь: список приходит снаружи, поэтому храним поверх него */
  let votes = $state<Record<number, { userVote: CommentVoteValue; voteCount: number }>>({});

  const nodes = $derived.by((): UiV2CommentNode[] =>
    items.map((item) => ({
      id: item.id,
      message: item.message,
      timestamp: item.timestamp,
      voteCount: votes[item.id]?.voteCount ?? item.voteCount,
      userVote: votes[item.id]?.userVote ?? item.userVote,
      isSpoiler: item.isSpoiler,
      profile: {
        id: item.profileId,
        login: item.profileLogin,
        avatar: item.profileAvatar,
        badgeUrl: item.profileBadgeUrl ?? null,
        badgeName: item.profileBadgeName ?? null,
      },
      releaseId: item.releaseId,
      releaseTitle: item.releaseTitle,
    })),
  );

  function openProfile(node: UiV2CommentNode) {
    handleUserProfileClick(node.profile.id);
  }

  function openRelease(node: UiV2CommentNode) {
    if (node.releaseId) navigate(`/release/${node.releaseId}`);
  }

  /** Стрелки голосования: сразу меняем счётчик, при ошибке сервера возвращаем прежний */
  async function handleVote(updated: UiV2CommentNode) {
    if (!requireAuth()) return;
    const id = Number(updated.id);
    const prev = nodes.find((n) => Number(n.id) === id);
    const commentsApi = window.anixApi?.comments?.release;
    if (!prev || !commentsApi) return;
    const prevVote = (prev.userVote ?? 0) as CommentVoteValue;
    const nextVote = (updated.userVote ?? 0) as CommentVoteValue;
    votes = { ...votes, [id]: { userVote: nextVote, voteCount: updated.voteCount } };
    try {
      await commentsApi.vote(id, apiVotePayload(prevVote, nextVote));
    } catch {
      votes = { ...votes, [id]: { userVote: prevVote, voteCount: prev.voteCount } };
    }
  }
</script>

{#if nodes.length > 0}
  <div class="overview-comments-week">
    <UiV2CommentThread
      nodes={nodes}
      enableInlineReply={false}
      onAuthorClick={openProfile}
      onReleaseClick={openRelease}
      onVote={handleVote}
    />
  </div>
{/if}
