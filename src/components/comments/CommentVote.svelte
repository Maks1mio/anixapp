<script lang="ts">
  import { iconChevronDown, iconChevronUp } from '../icons';
  import {
    applyVoteDelta,
    formatVoteCountDisplay,
    nextVote,
    voteCountClass,
  } from '../../utils/comment';
  import type { CommentData } from '../../types/comment';

  interface Props {
    comment: CommentData;
    disabled?: boolean;
    onVote?: (comment: CommentData) => void;
  }

  let { comment, disabled = false, onVote }: Props = $props();

  const countClass = $derived(voteCountClass(comment.voteCount));

  function handleVote(action: 'up' | 'down') {
    if (disabled) return;
    const next = nextVote(comment.userVote, action);
    const updated = applyVoteDelta(comment, comment.userVote, next);
    onVote?.(updated);
  }
</script>

<div class="anix-comment-vote">
  <button
    type="button"
    class="anix-comment-vote__btn"
    class:anix-comment-vote__btn--active-down={comment.userVote === 1}
    aria-label="Дизлайк"
    {disabled}
    onclick={() => handleVote('down')}
  >
    {@html iconChevronDown(18)}
  </button>

  <span
    class="anix-comment-vote__count anix-comment-vote__count--{countClass}"
  >
    {formatVoteCountDisplay(comment.voteCount)}
  </span>

  <button
    type="button"
    class="anix-comment-vote__btn"
    class:anix-comment-vote__btn--active-up={comment.userVote === 2}
    aria-label="Лайк"
    {disabled}
    onclick={() => handleVote('up')}
  >
    {@html iconChevronUp(18)}
  </button>
</div>
