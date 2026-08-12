<script lang="ts">
  import { navigate } from '../../stores/navigation';
  import UserAvatar from '../UserAvatar.svelte';
  import UserBadge from '../UserBadge.svelte';
  import { iconChevronRight } from '../icons';
  import {
    formatCommentWeekTime,
    type OverviewCommentWeekItem,
  } from '../../utils/overview';
  import { isCommentContentHidden } from '../../utils/comment';

  interface Props {
    items: OverviewCommentWeekItem[];
  }

  let { items }: Props = $props();
  let revealed = $state<Record<number, boolean>>({});

  function openRelease(releaseId: number) {
    navigate(`/release/${releaseId}`);
  }

  function revealSpoiler(id: number) {
    revealed = { ...revealed, [id]: true };
  }

  function hideSpoiler(id: number) {
    revealed = { ...revealed, [id]: false };
  }
</script>

{#if items.length > 0}
  <div class="overview-comments-week">
    {#each items as item (item.id)}
      {@const hidden = isCommentContentHidden(
        { isSpoiler: item.isSpoiler, isDeleted: false, voteCount: item.voteCount },
        !!revealed[item.id],
      )}
      <article class="overview-comment-week">
        <div class="overview-comment-week__bubble">
          <UserAvatar src={item.profileAvatar} label={item.profileLogin} class="overview-comment-week__avatar" />
          <div class="overview-comment-week__main">
            <div class="overview-comment-week__head">
              <span class="overview-comment-week__login">
                {item.profileLogin}
                <UserBadge
                  url={item.profileBadgeUrl}
                  name={item.profileBadgeName}
                  size="xs"
                />
              </span>
              <span class="overview-comment-week__to">к релизу</span>
            </div>
            <button type="button" class="overview-comment-week__release" onclick={() => openRelease(item.releaseId)}>
              <span>{item.releaseTitle}</span>
              {@html iconChevronRight(16)}
            </button>

            {#if hidden}
              <button type="button" class="overview-comment-week__spoiler" onclick={() => revealSpoiler(item.id)}>
                Комментарий может содержать спойлер. Нажмите, чтобы прочитать
              </button>
            {:else}
              <p class="overview-comment-week__message">{item.message}</p>
              {#if item.isSpoiler && revealed[item.id]}
                <button
                  type="button"
                  class="overview-comment-week__hide-spoiler"
                  onclick={() => hideSpoiler(item.id)}
                >
                  Нажмите, чтобы скрыть
                </button>
              {/if}
            {/if}

            <div class="overview-comment-week__foot">
              <time>{formatCommentWeekTime(item.timestamp)}</time>
              <span class="overview-comment-week__votes">{item.voteCount}</span>
            </div>
          </div>
        </div>
      </article>
    {/each}
  </div>
{/if}
