<script lang="ts">
  import { navigate } from '../../../../stores/navigation';
  import UserAvatar from '../../../../components/UserAvatar.svelte';
  import UserBadge from '../../../../components/UserBadge.svelte';
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
    profileId: number;
    profile?: Record<string, unknown> | null;
    jacksonRoot?: Record<string, unknown> | null;
  }

  let { items, profileLogin, profileAvatar, profileId, profile = null, jacksonRoot = null }: Props = $props();

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

<div class="profile-ui__comments">
  {#if Array.isArray(profile?.roles) && profile.roles.length}
    <div class="profile-ui__comment-roles">
      <span class="profile-ui__comment-roles-label">Роли</span>
      <div class="profile-ui__roles-row">
        {#each profile.roles as role}
          {@const r = role as { name?: string; color?: string }}
          {@const c = r.color || '#888'}
          <span
            class="profile-ui__role"
            style="--role-color:{c};border-color:{c};color:{c};background:color-mix(in srgb, {c} 14%, transparent);"
          >
            <i class="profile-ui__role-dot" style="background:{c}"></i>{r.name}
          </span>
        {/each}
      </div>
    </div>
  {/if}

  <div class="profile-ui__comments-list">
    {#each comments as item (item.id)}
      {@const hidden = isCommentContentHidden(
        { isSpoiler: item.isSpoiler, isDeleted: false, voteCount: item.voteCount },
        !!revealed[item.id],
      )}
      <article class="profile-ui__comment">
        <div class="profile-ui__comment-row">
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
        <span class="profile-ui__comment-context">{item.contextLabel}</span>
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
</div>
