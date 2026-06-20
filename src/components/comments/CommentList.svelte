<script lang="ts">
  import CommentRow from './CommentRow.svelte';
  import CommentComposer from './CommentComposer.svelte';
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
    replyTarget?: CommentData | null;
    showInlineComposer?: boolean;
    submitting?: boolean;
    onReply?: (comment: CommentData) => void;
    onVote?: (comment: CommentData) => void;
    onNavigateReplies?: (comment: CommentData) => void;
    onSubmit?: (payload: { message: string; isSpoiler: boolean }) => void | Promise<void>;
    onCancelReply?: () => void;
    onEdit?: (comment: CommentData, payload: { message: string; isSpoiler: boolean }) => void | Promise<void>;
    onDelete?: (comment: CommentData) => void | Promise<void>;
  }

  let {
    items,
    depth = 0,
    releaseId,
    canReply = true,
    canVote = true,
    navigateReplies = false,
    selfProfileId = null,
    replyTarget = null,
    showInlineComposer = false,
    submitting = false,
    onReply,
    onVote,
    onNavigateReplies,
    onSubmit,
    onCancelReply,
    onEdit,
    onDelete,
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
        canManage={!!window.anixApi?.comments?.release}
        isMine={selfProfileId != null && comment.profile.id === selfProfileId}
        showRepliesToggle={comment.replyCount > 0 && navigateReplies}
        onReply={onReply}
        onVote={onVote}
        onToggleReplies={openReplies}
        {onEdit}
        {onDelete}
      />

      {#if showInlineComposer && replyTarget?.id === comment.id}
        <div class="anix-comment-wrap__reply" id="comment-reply-{comment.id}">
          <CommentComposer
            busy={submitting}
            autofocus={true}
            replyToLogin={comment.profile.login}
            onCancelReply={onCancelReply}
            onSubmit={onSubmit}
          />
        </div>
      {/if}

      {#if !navigateReplies && comment.replyCount > 0}
        <!-- nested inline replies reserved for future non-release contexts -->
      {/if}
    </div>
  {/each}
</div>
