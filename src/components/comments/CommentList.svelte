<script lang="ts">
  import CommentRow from './CommentRow.svelte';
  import type { CommentData } from '../../types/comment';

  interface Props {
    items: CommentData[];
    depth?: number;
    releaseId?: number;
    canReply?: boolean;
    canVote?: boolean;
    /** Always open dedicated replies page instead of inline expand */
    navigateReplies?: boolean;
    selfProfileId?: number | null;
    onReply?: (comment: CommentData) => void;
    onVote?: (comment: CommentData) => void;
    onNavigateReplies?: (comment: CommentData) => void;
  }

  let {
    items,
    depth = 0,
    releaseId,
    canReply = true,
    canVote = true,
    navigateReplies = false,
    selfProfileId = null,
    onReply,
    onVote,
    onNavigateReplies,
  }: Props = $props();

  function openReplies(comment: CommentData) {
    onNavigateReplies?.(comment);
  }
</script>

<div class="anix-comments__list">
  {#each items as comment (comment.id)}
    <div
      class="anix-comment-wrap"
      class:anix-comment-wrap--nested={depth > 0}
    >
      {#if depth > 0}
        <div class="anix-comment-wrap__rail" aria-hidden="true"></div>
      {/if}

      <CommentRow
        {comment}
        nested={depth > 0}
        {canReply}
        {canVote}
        isMine={selfProfileId != null && comment.profile.id === selfProfileId}
        showRepliesToggle={comment.replyCount > 0 && navigateReplies}
        onReply={onReply}
        onVote={onVote}
        onToggleReplies={openReplies}
      />

      {#if !navigateReplies && comment.replyCount > 0}
        <!-- nested inline replies reserved for future non-release contexts -->
      {/if}
    </div>
  {/each}
</div>
