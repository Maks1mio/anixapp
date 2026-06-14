<script lang="ts">
  import { navigate } from '../../stores/navigation';
  import { iconChevronRight, iconPencil } from '../icons';
  import CommentVote from './CommentVote.svelte';
  import {
    episodeContextLabel,
    formatCommentTimestamp,
    hiddenCommentLabel,
    isCommentContentHidden,
    repliesLabel,
  } from '../../utils/comment';
  import type { CommentData } from '../../types/comment';

  interface Props {
    comment: CommentData;
    nested?: boolean;
    canReply?: boolean;
    canVote?: boolean;
    repliesExpanded?: boolean;
    showRepliesToggle?: boolean;
    isMine?: boolean;
    onReply?: (comment: CommentData) => void;
    onVote?: (comment: CommentData) => void;
    onToggleReplies?: (comment: CommentData) => void;
  }

  let {
    comment,
    nested = false,
    canReply = true,
    canVote = true,
    repliesExpanded = false,
    showRepliesToggle = true,
    isMine = false,
    onReply,
    onVote,
    onToggleReplies,
  }: Props = $props();

  let spoilerRevealed = $state(false);

  const contextLabel = $derived(episodeContextLabel(comment.postedAtEpisode));
  const contentHidden = $derived(isCommentContentHidden(comment, spoilerRevealed));
  const hiddenLabel = $derived(hiddenCommentLabel(comment));
  const repliesText = $derived(repliesLabel(comment.replyCount));
  const avatarLetter = $derived(comment.profile.login.charAt(0).toUpperCase() || '?');
  const hasRepliesToggle = $derived(showRepliesToggle && comment.replyCount > 0);

  function openProfile() {
    if (comment.profile.id) navigate(`/profile/${comment.profile.id}`);
  }
</script>

<article
  class="anix-comment"
  class:anix-comment--nested={nested}
  class:anix-comment--with-thread={hasRepliesToggle}
  id="comment-{comment.id}"
>
  <button type="button" class="anix-comment__avatar" onclick={openProfile} aria-label={comment.profile.login}>
    {#if comment.profile.avatar}
      <img src={comment.profile.avatar} alt="" loading="lazy" decoding="async" />
    {:else}
      <span class="anix-comment__avatar-fallback">{avatarLetter}</span>
    {/if}
  </button>

  <div class="anix-comment__main">
    <div class="anix-comment__head">
      <button type="button" class="anix-comment__author" onclick={openProfile}>
        {comment.profile.login}
        {#if comment.profile.badgeUrl}
          <img class="anix-comment__badge" src={comment.profile.badgeUrl} alt="" />
        {/if}
      </button>

      {#if comment.timestamp}
        <time class="anix-comment__time" datetime={String(comment.timestamp)}>
          {formatCommentTimestamp(comment.timestamp)}
        </time>
      {/if}

      {#if comment.isEdited}
        <span class="anix-comment__edited" title="Изменён">
          {@html iconPencil(14)}
        </span>
      {/if}
    </div>

    {#if contextLabel}
      <div class="anix-comment__context">{contextLabel}</div>
    {/if}

    {#if comment.isDeleted}
      <div class="anix-comment__deleted">Комментарий удалён</div>
    {:else if contentHidden}
      <button
        type="button"
        class="anix-comment__spoiler"
        onclick={() => { spoilerRevealed = true; }}
      >
        {hiddenLabel}
      </button>
    {:else}
      <div class="anix-comment__body">{comment.message}</div>
      {#if comment.isSpoiler && spoilerRevealed}
        <button
          type="button"
          class="anix-comment__hide-spoiler"
          onclick={() => { spoilerRevealed = false; }}
        >
          Нажмите, чтобы скрыть
        </button>
      {/if}
    {/if}

    {#if !comment.isDeleted}
      <div class="anix-comment__footer">
        {#if canReply}
          <button type="button" class="anix-comment__reply" onclick={() => onReply?.(comment)}>
            Ответить
          </button>
        {:else}
          <span></span>
        {/if}

        <CommentVote {comment} disabled={!canVote} {onVote} />
      </div>
    {/if}
  </div>

  {#if hasRepliesToggle}
    <div class="anix-comment__thread" aria-hidden="true">
      <span class="anix-comment__thread-stem"></span>
      <span class="anix-comment__thread-elbow"></span>
    </div>
    <button
      type="button"
      class="anix-comment__replies"
      onclick={() => onToggleReplies?.(comment)}
    >
      {repliesText}
      {@html iconChevronRight(16)}
    </button>
  {/if}
</article>
