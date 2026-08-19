<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import {
    buildViewStateKey,
    getViewState,
    restoreScrollTop,
    registerActiveScrollKey,
    saveViewStateData,
  } from '../../../stores/view-state';
  import {
    ProfileFriendsStrip,
    ProfileTabContent,
  } from './components';
  import ProfileShell from './components/shell/ProfileShell.svelte';
  import ProfileSidebar from './components/shell/ProfileSidebar.svelte';
  import ProfileMain from './components/shell/ProfileMain.svelte';
  import { loadProfilePage, fetchCoverFallback } from '../shared/profile-load';
  import { resolvePinnedTab } from '../../../utils/profile-friend';
  import { setDiscordContext, refreshDiscordPresence } from '../../../services/discord-presence';
  import { getPath } from '../../../router';
  import { buildProfileTabs } from './profile-tabs';

  interface Props { id?: number; embedded?: boolean; discordLayout?: boolean; }
  let { id, embedded = false, discordLayout = false }: Props = $props();

  const viewStateKey = buildViewStateKey(getPath());

  interface ProfileViewState {
    activeTab: string;
  }

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
  let unregisterScrollKey: (() => void) | null = null;

  const availableTabs = $derived(
    profile ? buildProfileTabs(profile, friendsData.length) : [],
  );

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

  function openSocial(url: string) {
    window.electron?.openExternal?.(url);
  }

  onMount(async () => {
    if (!embedded) {
      unregisterScrollKey = registerActiveScrollKey(() => viewStateKey);
    }
    const cached = embedded ? null : getViewState<ProfileViewState>(viewStateKey);
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
      if (!embedded) {
        setDiscordContext({
          profileLogin: String(result.profile.login ?? ''),
          profileAvatar: result.profile.avatar ? String(result.profile.avatar) : undefined,
          profileIsSelf: result.isMyProfile,
        });
        refreshDiscordPresence();
      }

      if (cached?.data?.activeTab) {
        const tabIds = availableTabs.map((t) => t.id);
        if (tabIds.includes(cached.data.activeTab)) {
          pinnedApplied = true;
          activeTab = cached.data.activeTab;
        }
      }
      void restoreScrollTop(cached?.scrollTop ?? 0, { maxWaitMs: embedded ? 0 : 5000 });
    }
  });

  onDestroy(() => {
    unregisterScrollKey?.();
    unregisterScrollKey = null;
    if (!embedded && loadState === 'ready') {
      saveViewStateData(viewStateKey, { activeTab });
    }
  });
</script>

<div
  class="view view-profile view-profile--v2 profile-ui"
  class:view-profile--embedded={embedded}
  class:view-profile--discord={discordLayout}
>
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
    {#if !discordLayout && !embedded && !profile.is_counts_hidden && friendsData.length}
      <ProfileFriendsStrip
        friends={friendsData}
        totalCount={Number(profile.friend_count ?? friendsData.length)}
        profileId={Number(profile.id)}
        {hasFriendsMore}
      />
    {/if}

    {#if discordLayout}
      <ProfileShell modal>
        {#snippet children()}
          <ProfileSidebar
            {profile}
            {coverUrl}
            {isMyProfile}
            {selfProfileId}
            onOpenSocial={openSocial}
          />
        {/snippet}
        {#snippet main()}
          <ProfileMain
            tabs={availableTabs}
            {activeTab}
            onTabChange={(tab) => { activeTab = tab; }}
          >
            {#snippet children()}
              <ProfileTabContent
                {profile}
                {activeTab}
                {isMyProfile}
                {jacksonRoot}
                friendsTotal={Number(profile.friend_count ?? friendsData.length)}
              />
            {/snippet}
          </ProfileMain>
        {/snippet}
      </ProfileShell>
    {:else}
      <ProfileShell>
        {#snippet children()}
          <ProfileSidebar
            {profile}
            {coverUrl}
            {isMyProfile}
            {selfProfileId}
            onOpenSocial={openSocial}
          />
        {/snippet}
        {#snippet main()}
          <ProfileMain
            tabs={availableTabs}
            {activeTab}
            onTabChange={(tab) => { activeTab = tab; }}
            sticky={false}
          >
            {#snippet children()}
              <ProfileTabContent
                {profile}
                {activeTab}
                {isMyProfile}
                {jacksonRoot}
                friendsTotal={Number(profile.friend_count ?? friendsData.length)}
              />
            {/snippet}
          </ProfileMain>
        {/snippet}
      </ProfileShell>
    {/if}

    {#if availableTabs.length === 0}
      <p class="profile-v2__empty">Нет данных для отображения</p>
    {/if}
  {/if}
</div>