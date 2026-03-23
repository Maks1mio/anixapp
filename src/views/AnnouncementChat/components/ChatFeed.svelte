<script lang="ts">
  import type { Announcement, Comment } from '../../../services/announcements';
  import type { ReleaseEmbed } from '../_types';
  import type { ReleaseCardData } from '../../../types/release';
  import { parseMessage, dateLabel, isGrouped, isLastInGroup, shouldShowDate } from '../_utils';
  import MessageRow from './MessageRow.svelte';
  import EmptyState from './EmptyState.svelte';
  import DateSeparator from './DateSeparator.svelte';

  interface Profile {
    login: string;
    avatar: string | null;
  }

  interface Props {
    comments: Comment[];
    loadState: 'loading' | 'ready';
    profileCache: Record<number, Profile>;
    releaseCache: Record<number, ReleaseEmbed | 'loading' | 'error'>;
    announcement: Announcement | null;
    accentColor: string;
    onReply: (c: Comment) => void;
    onMention: (userId: number) => void;
    onOpenProfile: (userId: number) => void;
    embedToCardData: (e: ReleaseEmbed) => ReleaseCardData;
    canModerate: boolean;
    onDelete: (commentId: string) => void;
  }

  let {
    comments,
    loadState,
    profileCache,
    releaseCache,
    announcement,
    accentColor,
    onReply,
    onMention,
    onOpenProfile,
    embedToCardData,
    canModerate,
    onDelete,
  }: Props = $props();

  const commentById = $derived(new Map(comments.map(c => [c.id, c])));

  function getComment(cid: string): Comment | undefined {
    return commentById.get(cid);
  }

  const showActions = $derived(
    !!announcement?.commentsEnabled && !announcement?.commentsLocked
  );

  const selfId = $derived((window as any).__anixProfile?.id as number | undefined);
</script>

<div class="dc-feed">
  {#if loadState === 'loading'}
    <EmptyState variant="loading" {accentColor} />
  {:else if comments.length === 0}
    <EmptyState variant="empty" {accentColor} />
  {:else}
    {#each comments as c, i (c.id)}
      {#if shouldShowDate(comments, i)}
        <DateSeparator label={dateLabel(c.createdAt)} />
      {/if}

      {@const parsed       = parseMessage(c.message)}
      {@const hasReply     = !!parsed.replyId}
      {@const prevHasReply = i > 0 && !!parseMessage(comments[i - 1].message).replyId}

      <!--
        Группировка разбивается на границах цитат:
        - сообщение с цитатой → всегда standalone (grouped=false)
        - сообщение сразу после цитаты → тоже standalone (prevHasReply)
        - сообщение перед цитатой → последнее в своей группе (nextHasReply ломает nextGrouped)
      -->
      {@const grouped = !hasReply && !prevHasReply && isGrouped(comments, i)}

      <!--
        showAvatar=true если это ПЕРВОЕ в своей группе (аватар сверху группы)
        grouped=false означает, что сообщение не является продолжением предыдущего
      -->
      {@const showAvatar = !grouped}

      {@const embed          = parsed.releaseId != null ? releaseCache[parsed.releaseId] : undefined}
      {@const replied        = parsed.replyId ? getComment(parsed.replyId) : null}
      {@const repliedProfile = replied ? profileCache[replied.userId] : undefined}
      {@const repliedParsed  = replied ? parseMessage(replied.message) : null}
      {@const repliedEmbed   = repliedParsed?.releaseId != null ? releaseCache[repliedParsed.releaseId] : undefined}

      <MessageRow
        comment={c}
        {grouped}
        {showAvatar}
        isMine={typeof selfId === 'number' && selfId === c.userId}
        profile={profileCache[c.userId]}
        {embed}
        {replied}
        {repliedProfile}
        {repliedEmbed}
        {showActions}
        {profileCache}
        {onReply}
        {onMention}
        {onOpenProfile}
        {embedToCardData}
        canDelete={canModerate || c.userId === selfId}
        {onDelete}
      />
    {/each}
  {/if}
</div>

<style lang="scss">
  @use '../../../styles/variables' as *;

  .dc-feed {
    flex: 1;
    display: flex;
    flex-direction: column;
    padding: 0 0 1.25rem 0;
    min-height: 0;
  }
</style>
