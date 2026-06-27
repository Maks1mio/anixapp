<script lang="ts">
  import { navigate } from '../../../../stores/navigation';
  import UserAvatar from '../../../../components/UserAvatar.svelte';
  import { iconChevronRight } from '../../../../components/icons';
  import {
    formatCommentTimestamp,
    isCommentContentHidden,
    mapProfileCommentPreview,
    type ProfileCommentPreviewItem,
  } from '../../../../utils/comment';

  interface Props {
    items: Record<string, unknown>[];
    profileLogin: string;
    profileAvatar?: string;
    profile?: Record<string, unknown> | null;
    jacksonRoot?: Record<string, unknown> | null;
  }

  let { items, profileLogin, profileAvatar, profile = null, jacksonRoot = null }: Props = $props();

  let revealed = $state<Record<number, boolean>>({});

  const comments = $derived(
    items
      .map((item) => {
        const mapped = mapProfileCommentPreview(item, jacksonRoot ?? profile ?? undefined);
        if (!mapped) return null;
        if (!mapped.profileLogin || mapped.profileLogin === 'Пользователь') {
          return {
            ...mapped,
            profileLogin: (item.profile as { login?: string } | undefined)?.login ?? profileLogin,
            profileAvatar:
              mapped.profileAvatar
              || (item.profile as { avatar?: string } | undefined)?.avatar
              || profileAvatar
              || '',
          };
        }
        return mapped;
      })
      .filter((item): item is ProfileCommentPreviewItem => item != null),
  );

  function openTarget(path: string) {
    navigate(path);
  }

  function revealSpoiler(id: number) {
    revealed = { ...revealed, [id]: true };
  }

  function hideSpoiler(id: number) {
    revealed = { ...revealed, [id]: false };
  }
</script>

<div class="overview-comments-week">
  {#each comments as item (item.id)}
    {@const hidden = isCommentContentHidden(
      { isSpoiler: item.isSpoiler, isDeleted: false, voteCount: item.voteCount },
      !!revealed[item.id],
    )}
    <article class="overview-comment-week">
      <div class="overview-comment-week__bubble">
        <UserAvatar src={item.profileAvatar} label={item.profileLogin} class="overview-comment-week__avatar" />
        <div class="overview-comment-week__main">
          <div class="overview-comment-week__head">
            <span class="overview-comment-week__login">{item.profileLogin}</span>
            <span class="overview-comment-week__to">{item.contextLabel}</span>
          </div>

          {#if item.targetPath}
            <button
              type="button"
              class="overview-comment-week__release"
              onclick={() => openTarget(item.targetPath!)}
            >
              <span>{item.targetTitle}</span>
              {@html iconChevronRight(16)}
            </button>
          {:else}
            <p class="overview-comment-week__release overview-comment-week__release--plain">{item.targetTitle}</p>
          {/if}

          {#if hidden}
            <button type="button" class="overview-comment-week__spoiler" onclick={() => revealSpoiler(item.id)}>
              Комментарий может содержать спойлер. Нажмите, чтобы прочитать
            </button>
          {:else}
            {#if item.message}
              <p class="overview-comment-week__message">{item.message}</p>
            {/if}
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
            {#if item.timestamp}
              <time>{formatCommentTimestamp(item.timestamp)}</time>
            {/if}
            <span class="overview-comment-week__votes">{item.voteCount}</span>
          </div>
        </div>
      </div>
    </article>
  {/each}
</div>
