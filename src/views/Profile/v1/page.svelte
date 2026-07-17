<script lang="ts">
  import { onMount } from 'svelte';
  import { navigate } from '../../../stores/navigation';
  import { ProfileHero, ProfileStats, ProfileDynamics, ProfileMediaGrid, ProfileFriends } from './components';
  import { fmtDate } from '../_utils';
  import { loadProfilePage, fetchCoverFallback } from '../shared/profile-load';
  import { setDiscordContext, refreshDiscordPresence } from '../../../services/discord-presence';

  interface Props { id?: number; embedded?: boolean; discordLayout?: boolean; }
  let { id, embedded = false, discordLayout = false }: Props = $props();

  const loadProfileId = id;

  let loadState = $state<'loading' | 'error' | 'ready'>('loading');
  let errorMsg = $state('');
  let profile = $state<Record<string, unknown> | null>(null);
  let coverUrl = $state<string | null>(null);
  let isMyProfile = $state(false);
  let friendsData = $state<Record<string, unknown>[]>([]);
  let hasFriendsMore = $state(false);

  function openSocial(url: string) {
    window.electron?.openExternal?.(url);
  }

  onMount(async () => {
    const result = await loadProfilePage(loadProfileId);
    loadState = result.loadState;
    errorMsg = result.errorMsg;
    profile = result.profile;
    coverUrl = result.coverUrl;
    isMyProfile = result.isMyProfile;
    friendsData = result.friendsPreview;
    hasFriendsMore = result.hasFriendsMore;

    if (result.loadState === 'ready' && result.profile?.id) {
      if (!result.coverUrl) {
        fetchCoverFallback(Number(result.profile.id), (url) => { coverUrl = url; });
      }
      if (!embedded) {
        setDiscordContext({
          profileLogin: String(result.profile.login ?? ''),
          profileAvatar: result.profile.avatar ? String(result.profile.avatar) : undefined,
          profileIsSelf: result.isMyProfile,
        });
        refreshDiscordPresence();
      }
    }
  });
</script>

<div class="view view-profile">
  {#if loadState === 'loading'}
    <div class="profile profile--loading">
      <div class="profile__hero">
        <div class="profile__hero-banner profile__skel"></div>
        <div class="profile__hero-body">
          <div class="profile__avatar-wrap">
            <div class="profile__avatar profile__skel"></div>
          </div>
          <div class="profile__hero-info">
            <div class="profile__skel profile__skel--line" style="width:160px;height:24px;margin-bottom:10px"></div>
            <div class="profile__skel profile__skel--line" style="width:240px;height:13px;margin-bottom:8px"></div>
            <div class="profile__skel profile__skel--line" style="width:100px;height:13px"></div>
          </div>
        </div>
      </div>
    </div>
  {:else if loadState === 'error'}
    <div class="profile">
      <p class="profile__error">{errorMsg}</p>
    </div>
  {:else if profile}
    <div class="profile">
      <ProfileHero {profile} {coverUrl} {isMyProfile} onOpenSocial={openSocial} />

      {#if profile.is_banned}
        <div class="profile__ban">
          <span>🚫</span>
          <div>
            <div>Пользователь заблокирован{profile.ban_expires ? ` до ${fmtDate(Number(profile.ban_expires) * 1000)}` : ''}</div>
            {#if profile.ban_reason}
              <div class="profile__ban-reason">Причина: {profile.ban_reason}</div>
            {/if}
          </div>
        </div>
      {/if}

      {#if profile.is_stats_hidden || profile.is_counts_hidden || profile.is_social_hidden}
        {@const pv = [
          profile.is_stats_hidden ? 'статистика' : '',
          profile.is_counts_hidden ? 'счётчики' : '',
          profile.is_social_hidden ? 'соцсети' : '',
        ].filter(Boolean)}
        <div class="profile__privacy">Пользователь скрыл: {pv.join(', ')}.</div>
      {/if}

      {#if !profile.is_stats_hidden}
        <ProfileStats {profile} />
      {/if}

      {#if Array.isArray(profile.watch_dynamics) && profile.watch_dynamics.length && !profile.is_counts_hidden}
        <ProfileDynamics watchDynamics={profile.watch_dynamics as unknown[]} />
      {/if}

      {#if Array.isArray(profile.votes) && profile.votes.length}
        <ProfileMediaGrid
          title="Оценки релизов"
          items={(profile.votes as unknown[]).slice(0, 6)}
          type="vote"
          onViewAll={() => navigate(`/profile/${profile!.id}/votes`)}
        />
      {/if}

      {#if Array.isArray(profile.history) && profile.history.length && !profile.is_counts_hidden}
        <ProfileMediaGrid
          title="История просмотра"
          items={profile.history as unknown[]}
          type="history"
        />
      {/if}

      {#if friendsData.length}
        <ProfileFriends
          friends={friendsData}
          totalCount={Number(profile.friend_count ?? 0)}
          profileId={Number(profile.id)}
          showMore={hasFriendsMore}
        />
      {/if}
    </div>
  {/if}
</div>
