<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { navigate } from '../../stores/navigation';
  import { ProfileHero, ProfileStats, ProfileDynamics, ProfileMediaGrid, ProfileFriends } from './components';
  import { fmtDate, posterUrl } from './_utils';
  import { setDiscordContext, refreshDiscordPresence } from '../../services/discord-presence';

  interface Props { id?: number; }
  let { id }: Props = $props();

  // ── State ──────────────────────────────────────────────────────────────────
  let loadState   = $state<'loading' | 'error' | 'ready'>('loading');
  let errorMsg    = $state('');
  let profile     = $state<any>(null);
  let coverUrl    = $state<string | null>(null);
  let isMyProfile = $state(false);
  let friendsData = $state<any[]>([]);
  let hasFriendsMore = $state(false);

  function openSocial(url: string) {
    (window as any).electron?.openExternal(url);
  }

  // ── Data loading ───────────────────────────────────────────────────────────
  onMount(async () => {
    if (!window.anixApi) {
      errorMsg  = 'API недоступно (только в Electron).';
      loadState = 'error';
      return;
    }

    try {
      const profilePromise = id
        ? window.anixApi.profile.info(id)
        : window.anixApi.profile.self();

      const channelPromise = id
        ? (window.anixApi.channel?.getBlog
            ? window.anixApi.channel.getBlog(id).catch(() => null)
            : window.anixApi.channel?.info?.(id).catch(() => null) ?? Promise.resolve(null))
        : Promise.resolve(null);

      const [data, channelData] = await Promise.all([profilePromise, channelPromise]) as any[];

      if (data?.session_mismatch || !data?.profile) {
        errorMsg  = data?.session_mismatch ? 'Профиль не совпадает с сессией.' : 'Не удалось загрузить профиль.';
        loadState = 'error';
        return;
      }

      profile     = data.profile;
      isMyProfile = !id || !!(data?.is_my_profile);

      // Cover
      const cover =
        data?.blogInfo?.channel?.cover
        || data?.blog_info?.channel?.cover
        || data?.blog?.channel?.cover
        || (channelData as any)?.blogInfo?.channel?.cover
        || (channelData as any)?.channel?.cover
        || null;
      coverUrl = cover ? posterUrl(cover) : null;

      // Lazy cover fallback
      if (!cover && profile?.id) {
        const blogFn = window.anixApi.channel?.getBlog ?? window.anixApi.channel?.info;
        if (blogFn) {
          blogFn.call(window.anixApi.channel, Number(profile.id))
            .then((ch: any) => {
              const fallback =
                ch?.channel?.cover
                || ch?.blogInfo?.channel?.cover
                || ch?.blog_info?.channel?.cover
                || null;
              if (fallback) coverUrl = posterUrl(fallback);
            })
            .catch(() => {});
        }
      }

      // Friends preview
      if ((profile.friend_count ?? 0) > 0 && profile.id) {
        window.anixApi.profile.getFriends(profile.id, 0)
          .then((fData: any) => {
            const friends = (fData?.content ?? []) as any[];
            friendsData    = friends.slice(0, 7);
            hasFriendsMore = (profile.friend_count ?? 0) > 7;
          })
          .catch(() => {});
      }

      loadState = 'ready';

      setDiscordContext({
        profileLogin: profile.login ?? '',
        profileAvatar: profile.avatar ? posterUrl(profile.avatar) : undefined,
        profileIsSelf: isMyProfile,
      });
      refreshDiscordPresence();
    } catch {
      errorMsg  = 'Ошибка загрузки профиля.';
      loadState = 'error';
    }
  });
</script>

<div class="view view-profile">

  <!-- Loading skeleton -->
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

  <!-- Error -->
  {:else if loadState === 'error'}
    <div class="profile">
      <p class="profile__error">{errorMsg}</p>
    </div>

  <!-- Ready -->
  {:else if profile}
    <div class="profile">

      <!-- Hero section -->
      <ProfileHero {profile} {coverUrl} {isMyProfile} onOpenSocial={openSocial} />

      <!-- Ban notice -->
      {#if profile.is_banned}
        <div class="profile__ban">
          <span>🚫</span>
          <div>
            <div>Пользователь заблокирован{profile.ban_expires ? ` до ${fmtDate(profile.ban_expires * 1000)}` : ''}</div>
            {#if profile.ban_reason}
              <div class="profile__ban-reason">Причина: {profile.ban_reason}</div>
            {/if}
          </div>
        </div>
      {/if}

      <!-- Privacy notice -->
      {#if profile.is_stats_hidden || profile.is_counts_hidden || profile.is_social_hidden}
        {@const pv = [
          profile.is_stats_hidden   ? 'статистика' : '',
          profile.is_counts_hidden  ? 'счётчики'   : '',
          profile.is_social_hidden  ? 'соцсети'    : '',
        ].filter(Boolean)}
        <div class="profile__privacy">Пользователь скрыл: {pv.join(', ')}.</div>
      {/if}

      <!-- Stats + donut -->
      {#if !profile.is_stats_hidden}
        <ProfileStats {profile} />
      {/if}

      <!-- Watch dynamics chart -->
      {#if profile.watch_dynamics?.length && !profile.is_counts_hidden}
        <ProfileDynamics watchDynamics={profile.watch_dynamics} />
      {/if}

      <!-- Votes -->
      {#if profile.votes?.length}
        <ProfileMediaGrid
          title="Оценки релизов"
          items={profile.votes.slice(0, 6)}
          type="vote"
          onViewAll={() => navigate(`/profile/${profile.id}/votes`)}
        />
      {/if}

      <!-- History -->
      {#if profile.history?.length && !profile.is_counts_hidden}
        <ProfileMediaGrid
          title="История просмотра"
          items={profile.history}
          type="history"
        />
      {/if}

      <!-- Friends -->
      {#if friendsData.length}
        <ProfileFriends
          friends={friendsData}
          totalCount={profile.friend_count ?? 0}
          profileId={profile.id}
          showMore={hasFriendsMore}
        />
      {/if}

    </div>
  {/if}

</div>
