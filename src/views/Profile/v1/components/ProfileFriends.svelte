<script lang="ts">
  import { navigate } from '../../../../stores/navigation';
  import { posterUrl } from '../../_utils';
  import UserBadge from '../../../../components/UserBadge.svelte';
  import { resolveBadgeName, resolveProfileBadgeUrl } from '../../../../utils/badge';

  interface Props {
    friends:    any[];
    totalCount: number;
    profileId:  number;
    showMore:   boolean;
  }

  let { friends, totalCount, profileId, showMore }: Props = $props();
</script>

<section class="profile__section">
  <div class="profile__section-hdr">
    <h2 class="profile__section-title">
      Друзья <span class="profile__count-chip">{totalCount}</span>
    </h2>
    {#if showMore}
      <button class="profile__view-all" onclick={() => navigate(`/profile/${profileId}/friends`)}>
        Показать всё
      </button>
    {/if}
  </div>

  <div class="profile__friends-grid">
    {#each friends as fr}
      {@const badgeUrl = resolveProfileBadgeUrl(fr as Record<string, unknown>)}
      <button type="button" class="profile__friend-card" onclick={() => navigate(`/profile/${fr.id}`)}>
        <div class="profile__friend-av" style={fr.avatar ? `background-image:url('${posterUrl(fr.avatar)}')` : ''}></div>
        {#if fr.is_online}
          <span class="profile__friend-online"></span>
        {/if}
        <span class="profile__friend-name-row">
          <span class="profile__friend-name">{fr.login || ''}</span>
          <UserBadge url={badgeUrl} name={resolveBadgeName(fr.badge)} size="xs" />
        </span>
        {#if fr.friend_count != null}
          <span class="profile__friend-sub">{fr.friend_count} др.</span>
        {/if}
      </button>
    {/each}
  </div>
</section>
