<script lang="ts">
  import { onMount } from 'svelte';
  import { navigate } from '../../../stores/navigation';
  import {
    ProfileHead,
    ProfileFriendsStrip,
    ProfileTabNav,
    ProfileStatsSection,
    ProfileDynamicsSection,
    ProfileVotesSection,
    ProfileHistorySection,
    ProfileCollectionsSection,
    ProfileCommentsSection,
    ProfileVideosSection,
  } from './components';
  import type { ProfileTab } from './components/ProfileTabNav.svelte';
  import { loadProfilePage, fetchCoverFallback } from '../shared/profile-load';
  import { resolvePinnedTab } from '../../../utils/profile-friend';
  import { setDiscordContext, refreshDiscordPresence } from '../../../services/discord-presence';

  interface Props { id?: number; }
  let { id }: Props = $props();

  const ICON_STATS = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 20V10M12 20V4M20 20v-6"/></svg>';
  const ICON_VOTES = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"/></svg>';
  const ICON_COLLECTIONS = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5z"/></svg>';
  const ICON_COMMENTS = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
  const ICON_VIDEOS = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5,3 19,12 5,21"/></svg>';

  let loadState = $state<'loading' | 'error' | 'ready'>('loading');
  let errorMsg = $state('');
  let profile = $state<Record<string, unknown> | null>(null);
  let coverUrl = $state<string | null>(null);
  let isMyProfile = $state(false);
  let selfProfileId = $state(0);
  let friendsData = $state<Record<string, unknown>[]>([]);
  let hasFriendsMore = $state(false);
  let jacksonRoot = $state<Record<string, unknown> | null>(null);
  let activeTab = $state('stats');
  let pinnedApplied = $state(false);

  const availableTabs = $derived.by((): ProfileTab[] => {
    if (!profile) return [];
    const tabs: ProfileTab[] = [];
    if (!profile.is_stats_hidden) {
      tabs.push({ id: 'stats', label: 'Статистика', icon: ICON_STATS });
    }
    if (Array.isArray(profile.votes) && profile.votes.length) {
      tabs.push({ id: 'votes', label: 'Оценки релизов', icon: ICON_VOTES });
    }
    const collectionCount = Number(profile.collection_count ?? 0);
    const collectionsPreview = Array.isArray(profile.collections_preview) ? profile.collections_preview : [];
    if (collectionCount > 0 || collectionsPreview.length) {
      tabs.push({ id: 'collections', label: 'Коллекции', icon: ICON_COLLECTIONS });
    }
    if (Array.isArray(profile.comments_preview) && profile.comments_preview.length) {
      tabs.push({ id: 'comments', label: 'Комментарии', icon: ICON_COMMENTS });
    }
    if (Array.isArray(profile.release_video_preview) && profile.release_video_preview.length) {
      tabs.push({ id: 'videos', label: 'Видео', icon: ICON_VIDEOS });
    }
    return tabs;
  });

  $effect(() => {
    const ids = availableTabs.map((t) => t.id);
    if (!ids.length) return;
    if (!pinnedApplied && profile) {
      activeTab = resolvePinnedTab(profile.pinned_section_id, ids);
      pinnedApplied = true;
      return;
    }
    if (!ids.includes(activeTab)) {
      activeTab = ids[0];
    }
  });

  const showBelowSection = $derived(
    !!profile
    && !profile.is_counts_hidden
    && (
      (Array.isArray(profile.watch_dynamics) && profile.watch_dynamics.length > 0)
      || (Array.isArray(profile.history) && profile.history.length > 0)
    ),
  );

  function openSocial(url: string) {
    window.electron?.openExternal?.(url);
  }

  onMount(async () => {
    const result = await loadProfilePage(id);
    loadState = result.loadState;
    errorMsg = result.errorMsg;
    profile = result.profile;
    coverUrl = result.coverUrl;
    isMyProfile = result.isMyProfile;
    selfProfileId = result.selfProfileId;
    friendsData = result.friendsPreview;
    hasFriendsMore = result.hasFriendsMore;
    jacksonRoot = result.jacksonRoot;

    if (result.loadState === 'ready' && result.profile?.id) {
      if (!result.coverUrl) {
        fetchCoverFallback(Number(result.profile.id), (url) => { coverUrl = url; });
      }
      setDiscordContext({
        profileLogin: String(result.profile.login ?? ''),
        profileAvatar: result.profile.avatar ? String(result.profile.avatar) : undefined,
        profileIsSelf: result.isMyProfile,
      });
      refreshDiscordPresence();
    }
  });
</script>

<div class="view view-profile view-profile--v2">
  {#if loadState === 'loading'}
    <div class="profile-v2 profile-v2--loading">
      <div class="profile-v2__skel profile-v2__skel--banner"></div>
      <div class="profile-v2__skel profile-v2__skel--avatar"></div>
      <div class="profile-v2__skel profile-v2__skel--line"></div>
    </div>
  {:else if loadState === 'error'}
    <div class="profile-v2">
      <p class="profile-v2__error">{errorMsg}</p>
    </div>
  {:else if profile}
    <div class="profile-v2">
      <ProfileHead
        {profile}
        {coverUrl}
        {isMyProfile}
        {selfProfileId}
        onOpenSocial={openSocial}
      />

      {#if !profile.is_counts_hidden && friendsData.length}
        <ProfileFriendsStrip
          friends={friendsData}
          totalCount={Number(profile.friend_count ?? friendsData.length)}
          profileId={Number(profile.id)}
          {hasFriendsMore}
        />
      {/if}

      {#if availableTabs.length}
        <ProfileTabNav tabs={availableTabs} activeId={activeTab} onChange={(tab) => { activeTab = tab; }} />

        <div class="profile-v2__panel" role="tabpanel">
          {#if activeTab === 'stats' && !profile.is_stats_hidden}
            <ProfileStatsSection
              {profile}
              profileId={Number(profile.id)}
              {isMyProfile}
            />
          {:else if activeTab === 'votes' && Array.isArray(profile.votes) && profile.votes.length}
            <ProfileVotesSection
              items={profile.votes as Record<string, unknown>[]}
              profileId={Number(profile.id)}
              onViewAll={() => navigate(`/profile/${profile.id}/votes`)}
            />
          {:else if activeTab === 'collections' && (Number(profile.collection_count ?? 0) > 0 || (Array.isArray(profile.collections_preview) && profile.collections_preview.length))}
            <ProfileCollectionsSection
              items={(profile.collections_preview as Record<string, unknown>[]) ?? []}
              profileId={Number(profile.id)}
            />
          {:else if activeTab === 'comments' && Array.isArray(profile.comments_preview) && profile.comments_preview.length}
            <ProfileCommentsSection
              items={profile.comments_preview as Record<string, unknown>[]}
              {profile}
              {jacksonRoot}
              profileLogin={String(profile.login ?? '')}
              profileAvatar={profile.avatar ? String(profile.avatar) : undefined}
              profileId={Number(profile.id)}
            />
          {:else if activeTab === 'videos' && Array.isArray(profile.release_video_preview) && profile.release_video_preview.length}
            <ProfileVideosSection
              items={profile.release_video_preview as Record<string, unknown>[]}
              profileId={Number(profile.id)}
            />
          {/if}
        </div>
      {:else if !showBelowSection}
        <p class="profile-v2__empty">Нет данных для отображения</p>
      {/if}

      {#if showBelowSection}
        <div class="profile-v2__below">
          {#if Array.isArray(profile.watch_dynamics) && profile.watch_dynamics.length}
            <ProfileDynamicsSection watchDynamics={profile.watch_dynamics as unknown[]} />
          {/if}

          {#if Array.isArray(profile.history) && profile.history.length}
            <ProfileHistorySection items={profile.history as Record<string, unknown>[]} />
          {/if}
        </div>
      {/if}
    </div>
  {/if}
</div>
