<script lang="ts">
  import { formatCommentTime } from '../_utils';

  type Comment = {
    id?: number;
    profile?: { nickname?: string; avatar?: string };
    message?: string;
    timestamp?: number;
  };

  interface Props { comments: Comment[]; }
  let { comments }: Props = $props();
</script>

<div class="release-page__section" id="comments">
  <h2 class="release-page__section-title">Комментарии ({comments.length})</h2>
  <div class="release-page__comments">
    {#each comments.slice(0, 20) as c}
      {@const prof     = c.profile ?? {}}
      {@const nickname = (prof as { nickname?: string }).nickname ?? 'Пользователь'}
      {@const avatar   = (prof as { avatar?: string }).avatar ?? ''}
      <div class="release-page__comment">
        <div class="release-page__comment-avatar" style={avatar ? `background-image:url(${avatar})` : ''}></div>
        <div class="release-page__comment-body">
          <span class="release-page__comment-author">{nickname}</span>
          {#if c.timestamp}
            <span class="release-page__comment-time">{formatCommentTime(c.timestamp)}</span>
          {/if}
          <div class="release-page__comment-text">{c.message ?? ''}</div>
        </div>
      </div>
    {/each}
  </div>
</div>
