<script lang="ts">
  import ProfileStatsSection from './ProfileStatsSection.svelte';
  import ProfileDynamicsSection from './ProfileDynamicsSection.svelte';
  import ProfileHistorySection from './ProfileHistorySection.svelte';
  import ProfileFriendsSection from './ProfileFriendsSection.svelte';
  import ProfileVotesSection from './ProfileVotesSection.svelte';
  import ProfileCollectionsSection from './ProfileCollectionsSection.svelte';
  import ProfileCommentsSection from './ProfileCommentsSection.svelte';
  import ProfileVideosSection from './ProfileVideosSection.svelte';
  import ProfileSection from './shell/ProfileSection.svelte';
  import ProfilePrivacyNotice from './ProfilePrivacyNotice.svelte';
  import { hasStatsExtras, hasProfilePrivacyRestrictions } from '../profile-privacy';

  interface Props {
    profile: Record<string, unknown>;
    activeTab: string;
    isMyProfile: boolean;
    jacksonRoot: Record<string, unknown> | null;
    friendsTotal: number;
  }

  let { profile, activeTab, isMyProfile, jacksonRoot, friendsTotal }: Props = $props();

  const profileId = $derived(Number(profile.id ?? 0));
  const statsExtras = $derived(hasStatsExtras(profile));
  const showPrivacyNotice = $derived(hasProfilePrivacyRestrictions(profile, isMyProfile));
</script>

<div class="profile-ui__tab-content">
  {#if showPrivacyNotice}
    <ProfilePrivacyNotice class="profile-ui__privacy--main" />
  {/if}

  {#if activeTab === 'stats' && !profile.is_stats_hidden}
    <ProfileSection title="Обзор">
      <ProfileStatsSection {profile} {profileId} {isMyProfile} />
    </ProfileSection>

    {#if statsExtras}
      {#if Array.isArray(profile.watch_dynamics) && profile.watch_dynamics.length}
        <ProfileSection title="Динамика просмотра серий">
          <ProfileDynamicsSection watchDynamics={profile.watch_dynamics as unknown[]} />
        </ProfileSection>
      {/if}
      {#if Array.isArray(profile.history) && profile.history.length}
        <ProfileSection title="Просмотрено недавно">
          <ProfileHistorySection items={profile.history as Record<string, unknown>[]} />
        </ProfileSection>
      {/if}
    {/if}
  {:else if activeTab === 'friends' && !profile.is_counts_hidden}
    <ProfileSection title={friendsTotal > 0 ? `Друзья · ${friendsTotal}` : 'Друзья'}>
      <ProfileFriendsSection {profileId} {isMyProfile} totalCount={friendsTotal} hideTitle />
    </ProfileSection>
  {:else if activeTab === 'votes' && Array.isArray(profile.votes) && profile.votes.length}
    <ProfileSection title="Оценки">
      <ProfileVotesSection items={profile.votes as Record<string, unknown>[]} {profileId} />
    </ProfileSection>
  {:else if activeTab === 'collections' && (Number(profile.collection_count ?? 0) > 0 || (Array.isArray(profile.collections_preview) && profile.collections_preview.length))}
    <ProfileSection title="Коллекции">
      <ProfileCollectionsSection items={(profile.collections_preview as Record<string, unknown>[]) ?? []} />
    </ProfileSection>
  {:else if activeTab === 'comments' && Array.isArray(profile.comments_preview) && profile.comments_preview.length}
    <ProfileSection title="Комментарии">
      <ProfileCommentsSection
        items={profile.comments_preview as Record<string, unknown>[]}
        {profile}
        {jacksonRoot}
        profileLogin={String(profile.login ?? '')}
        profileAvatar={profile.avatar ? String(profile.avatar) : undefined}
        {profileId}
      />
    </ProfileSection>
  {:else if activeTab === 'videos' && Array.isArray(profile.release_video_preview) && profile.release_video_preview.length}
    <ProfileSection title="Видео">
      <ProfileVideosSection items={profile.release_video_preview as Record<string, unknown>[]} {profileId} />
    </ProfileSection>
  {/if}
</div>
