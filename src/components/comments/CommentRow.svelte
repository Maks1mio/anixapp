<script lang="ts">
  import { handleUserProfileClick } from '../../stores/user-profile';
  import { iconChevronRight, iconPencil } from '../icons';
  import CommentVote from './CommentVote.svelte';
  import CommentComposer from './CommentComposer.svelte';
  import UserAvatar from '../UserAvatar.svelte';
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
    canManage?: boolean;
    repliesExpanded?: boolean;
    showRepliesToggle?: boolean;
    isMine?: boolean;
    onReply?: (comment: CommentData) => void;
    onVote?: (comment: CommentData) => void;
    onToggleReplies?: (comment: CommentData) => void;
    onEdit?: (comment: CommentData, payload: { message: string; isSpoiler: boolean }) => void | Promise<void>;
    onDelete?: (comment: CommentData) => void | Promise<void>;
  }

  let {
    comment,
    nested = false,
    canReply = true,
    canVote = true,
    canManage = true,
    repliesExpanded = false,
    showRepliesToggle = true,
    isMine = false,
    onReply,
    onVote,
    onToggleReplies,
    onEdit,
    onDelete,
  }: Props = $props();

  let spoilerRevealed = $state(false);
  let editing = $state(false);
  let editBusy = $state(false);

  const contextLabel = $derived(episodeContextLabel(comment.postedAtEpisode));
  const contentHidden = $derived(isCommentContentHidden(comment, spoilerRevealed));
  const hiddenLabel = $derived(hiddenCommentLabel(comment));
  const repliesText = $derived(repliesLabel(comment.replyCount));
  const hasRepliesToggle = $derived(showRepliesToggle && comment.replyCount > 0);
  const showOwnerActions = $derived(canManage && isMine && !comment.isDeleted && !!onEdit && !!onDelete);

  function openProfile(event: MouseEvent) {
    const profileId = Number(comment.profile?.id ?? 0);
    if (profileId > 0) handleUserProfileClick(profileId, event);
  }

  function startEdit() {
    editing = true;
    spoilerRevealed = true;
  }

  function cancelEdit() {
    editing = false;
  }

  async function submitEdit(payload: { message: string; isSpoiler: boolean }) {
    if (!onEdit || editBusy) return;
    editBusy = true;
    try {
      await onEdit(comment, payload);
      editing = false;
      spoilerRevealed = !payload.isSpoiler;
    } finally {
      editBusy = false;
    }
  }

  function requestDelete() {
    if (!onDelete) return;
    if (!window.confirm('Удалить комментарий?')) return;
    void onDelete(comment);
  }
</script>

<article
  class="anix-comment"
  class:anix-comment--nested={nested}
  class:anix-comment--with-thread={hasRepliesToggle}
  id="comment-{comment.id}"
>
  <button type="button" class="anix-comment__avatar" onclick={openProfile} aria-label={comment.profile.login}>
    <UserAvatar src={comment.profile.avatar} label={comment.profile.login} />
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
    {:else if editing}
      <div class="anix-comment__edit">
        {#key comment.id}
          <CommentComposer
            label="Редактирование"
            initialMessage={comment.message}
            initialIsSpoiler={comment.isSpoiler}
            resetOnSubmit={false}
            busy={editBusy}
            autofocus={true}
            onCancel={cancelEdit}
            onSubmit={submitEdit}
          />
        {/key}
      </div>
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

    {#if !comment.isDeleted && !editing}
      <div class="anix-comment__footer">
        <div class="anix-comment__footer-start">
          {#if canReply}
            <button type="button" class="anix-comment__reply" onclick={() => onReply?.(comment)}>
              Ответить
            </button>
          {/if}

          {#if showOwnerActions}
            <button type="button" class="anix-comment__reply" onclick={startEdit}>
              Изменить
            </button>
            <button type="button" class="anix-comment__reply anix-comment__reply--danger" onclick={requestDelete}>
              Удалить
            </button>
          {/if}
        </div>

        <CommentVote {comment} disabled={!canVote} {onVote} />
      </div>
    {/if}
  </div>

  {#if hasRepliesToggle}
    <span class="anix-comment__thread-stem" aria-hidden="true"></span>
    <div class="anix-comment__replies-row">
      <span class="anix-comment__thread-elbow" aria-hidden="true"></span>
      <button
        type="button"
        class="anix-comment__replies"
        onclick={() => onToggleReplies?.(comment)}
      >
        {repliesText}
        {@html iconChevronRight(16)}
      </button>
    </div>
  {/if}
</article>
