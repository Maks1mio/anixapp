<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import Page from './Page.svelte';
  import {
    iconMoreHorizontal,
    iconMessageCircle,
    iconPlus,
  } from './icons';
  import {
    openProfilePanel,
    setProfilePanelInnerView,
    updateProfilePanelLogin,
    type ProfilePanelInnerView,
  } from '../stores/profile-panel';
  import { resolveCdnAssetUrl, toCdnProxyUrl, fetchCdnJson } from '../utils/posterUrl';
  import { resolveFriendButtonState } from '../utils/profile-friend';
  import { fmtDate, fmtLastSeen, isLottieBadgeUrl, posterUrl } from '../views/Profile/_utils';
  import { resolveJacksonRefs } from '../utils/jackson-refs';
  import {
    hasProfilePrivacyRestrictions,
    PROFILE_PRIVACY_NOTICE,
  } from '../views/Profile/v2/profile-privacy';
  import ProfileStatsSection from '../views/Profile/v2/components/ProfileStatsSection.svelte';
  import ProfileDynamicsSection from '../views/Profile/v2/components/ProfileDynamicsSection.svelte';
  import ProfileHistorySection from '../views/Profile/v2/components/ProfileHistorySection.svelte';
  import ProfilePanelFriendsView from './ProfilePanelFriendsView.svelte';
  import ProfilePanelEditView from './ProfilePanelEditView.svelte';
  import ProfilePanelLoginHistoryView from './ProfilePanelLoginHistoryView.svelte';
  import ProfileSocialSheet from './ProfileSocialSheet.svelte';
  import ProfilePanelMoreSheet, { type ProfileMoreAction } from './ProfilePanelMoreSheet.svelte';
  import UiV2Button from './uikit-v2/UiV2Button.svelte';
  import UiV2RoundButton from './uikit-v2/UiV2RoundButton.svelte';
  import UiV2Card from './uikit-v2/UiV2Card.svelte';
  import { showToast } from '../stores/toast';
  import { requireAuth } from '../stores/auth';
  import {
    hasProfileSocial,
    listSocialLinks,
    normalizeSocialPages,
    openSocialLink,
    SOCIAL_ICONS,
    type ProfileSocialLink,
    type ProfileSocialPages,
  } from '../utils/profile-social';

  interface Props {
    userId: number;
    active?: boolean;
  }

  let { userId, active = false }: Props = $props();

  let loadState = $state<'loading' | 'error' | 'ready'>('loading');
  let errorMsg = $state('');
  let profile = $state<Record<string, unknown> | null>(null);
  let isMyProfile = $state(false);
  let selfProfileId = $state(0);
  let panelView = $state<ProfilePanelInnerView>('overview');
  let friendBusy = $state(false);
  let coverUrl = $state<string | null>(null);

  let friends = $state<Record<string, unknown>[]>([]);
  let socialSheetOpen = $state(false);
  let socialPages = $state<ProfileSocialPages | null>(null);
  let socialBusy = $state(false);
  let moreSheetOpen = $state(false);
  let editStartScreen = $state<'menu' | 'status' | 'nickname' | 'social'>('menu');

  let badgeLottieEl = $state<HTMLElement | undefined>();
  let badgeAnim: { destroy?: () => void } | null = null;

  const login = $derived(String(profile?.login ?? 'Профиль'));
  const avatarUrl = $derived(profile?.avatar ? posterUrl(String(profile.avatar)) : '');
  const statusText = $derived(
    profile?.status && String(profile.status).trim() ? String(profile.status).trim() : '',
  );
  const isOnline = $derived(!!profile?.is_online);
  const level = $derived.by(() => {
    if (profile?.rating_score == null || profile.rating_score === '') return null;
    const n = Number(profile.rating_score);
    return Number.isFinite(n) ? n : null;
  });
  const registerLabel = $derived.by(() => {
    const ts = Number(profile?.register_date ?? 0);
    if (!ts) return '';
    return `на проекте с ${fmtDate(ts)}`;
  });
  const activityLabel = $derived.by(() => {
    if (!profile) return '';
    if (profile.is_online) return 'в сети';
    const ts = Number(profile.last_activity_time ?? 0);
    return ts ? fmtLastSeen(ts) : '';
  });
  const metaSecondary = $derived(registerLabel || activityLabel);
  const roles = $derived(
    Array.isArray(profile?.roles)
      ? (profile!.roles as { name?: string; color?: string }[]).filter((r) => r?.name)
      : [],
  );
  const badge = $derived((profile?.badge as { image_url?: string; name?: string } | null) ?? null);
  const friendCount = $derived(Number(profile?.friend_count ?? 0));
  const showPrivacy = $derived(profile ? hasProfilePrivacyRestrictions(profile, isMyProfile) : false);
  const friendNamesPreview = $derived.by(() => {
    const names = friends
      .map((f) => String(f.login ?? '').trim())
      .filter(Boolean)
      .slice(0, 2);
    if (!names.length) return '';
    if (friendCount > names.length) return `${names.join(', ')} и другие`;
    return names.join(', ');
  });
  const friendsAvatars = $derived(friends.slice(0, 3));
  const hasSocial = $derived.by(() => {
    if (!profile || profile.is_social_hidden) return false;
    if (profile.is_social === true) return true;
    return !!(
      profile.vk_page
      || profile.tg_page
      || profile.inst_page
      || profile.tt_page
      || profile.discord_page
    );
  });
  const ownSocialLinks = $derived(
    profile && isMyProfile && !profile.is_social_hidden
      ? listSocialLinks(profile)
      : [],
  );
  const watchDynamics = $derived(
    Array.isArray(profile?.watch_dynamics) ? (profile!.watch_dynamics as unknown[]) : [],
  );
  const dynamicsSummary = $derived.by(() => {
    const points = watchDynamics
      .map((d) => {
        const row = d as { count?: number; timestamp?: number };
        return { count: Number(row.count ?? 0), timestamp: Number(row.timestamp ?? 0) };
      })
      .filter((d) => Number.isFinite(d.count) && Number.isFinite(d.timestamp) && d.timestamp > 0);
    if (!points.length) return null;
    const total = points.reduce((s, d) => s + d.count, 0);
    const peak = points.reduce((best, d) => (d.count > best.count ? d : best), points[0]);
    const activeDays = points.filter((d) => d.count > 0).length;
    const peakMs = peak.timestamp < 1e12 ? peak.timestamp * 1000 : peak.timestamp;
    const peakDate = new Date(peakMs);
    const peakLabel = `${peakDate.getDate()}.${String(peakDate.getMonth() + 1).padStart(2, '0')}`;
    return { total, peakCount: peak.count, peakLabel, activeDays };
  });
  const recentHistory = $derived(
    Array.isArray(profile?.history) ? (profile!.history as Record<string, unknown>[]) : [],
  );

  const friendButton = $derived(resolveFriendButtonState(
    Number(profile?.id ?? 0),
    selfProfileId,
    profile?.friend_status as number | null | undefined,
    {
      requestsDisallowed: !!profile?.is_friend_requests_disallowed,
      isBlocked: !!profile?.is_blocked,
    },
  ));

  const primaryLabel = $derived.by(() => {
    if (isMyProfile) return 'Редактировать';
    if (friendButton.action === 'none' && friendButton.disabled) return friendButton.label;
    return friendButton.label;
  });

  const bannerStyle = $derived.by(() => {
    if (coverUrl) return `background-image:url('${toCdnProxyUrl(coverUrl)}')`;
    const accent = roles[0]?.color;
    if (accent) return `background:linear-gradient(160deg, ${accent} 0%, #1a1a1a 70%)`;
    return '';
  });

  function roleStyle(color?: string) {
    const c = color || '#888';
    return `--role-color:${c};border-color:${c};color:${c};`;
  }

  function destroyBadgeAnim() {
    if (badgeAnim?.destroy) badgeAnim.destroy();
    badgeAnim = null;
  }

  async function loadBadgeLottie(url: string, target: HTMLElement) {
    try {
      const json = await fetchCdnJson(url);
      if (!json || typeof json !== 'object') return;
      const mod: { default?: unknown } = await import('lottie-web/build/player/lottie_light');
      const lottie = (mod?.default ?? mod) as { loadAnimation?: (opts: object) => { destroy?: () => void } };
      if (!lottie?.loadAnimation) return;
      destroyBadgeAnim();
      badgeAnim = lottie.loadAnimation({
        container: target,
        renderer: 'svg',
        loop: true,
        autoplay: true,
        animationData: json,
        rendererSettings: { preserveAspectRatio: 'xMidYMid meet' },
      });
    } catch { /* ignore */ }
  }

  async function loadCover(id: number) {
    try {
      const ch = window.anixApi?.channel?.getBlog
        ? await window.anixApi.channel.getBlog(id)
        : await window.anixApi?.channel?.info?.(id);
      const cover =
        (ch as { channel?: { cover?: string } } | undefined)?.channel?.cover
        || (ch as { blogInfo?: { channel?: { cover?: string } } } | undefined)?.blogInfo?.channel?.cover
        || null;
      coverUrl = cover ? String(cover) : null;
    } catch {
      coverUrl = null;
    }
  }

  async function loadProfile() {
    const id = userId;
    if (!window.anixApi?.profile || !id) {
      loadState = 'error';
      errorMsg = 'API недоступно';
      return;
    }
    loadState = 'loading';
    try {
      const [info, self] = await Promise.all([
        window.anixApi.profile.info(id) as Promise<Record<string, unknown>>,
        window.anixApi.profile.self().catch(() => null) as Promise<Record<string, unknown> | null>,
      ]);
      const resolved = resolveJacksonRefs(info);
      const p = resolved.profile as Record<string, unknown> | undefined;
      if (!p) {
        loadState = 'error';
        errorMsg = 'Профиль не найден';
        return;
      }
      profile = p;
      isMyProfile = !!info.is_my_profile || Number(p.id) === Number((self?.profile as { id?: number } | undefined)?.id);
      selfProfileId = Number((self?.profile as { id?: number } | undefined)?.id ?? 0);
      loadState = 'ready';
      updateProfilePanelLogin(id, String(p.login ?? ''));
      void loadCover(id);
      void loadFriendsPreview();
    } catch (err) {
      errorMsg = String(err);
      loadState = 'error';
    }
  }

  async function loadFriendsPreview() {
    if (!window.anixApi?.profile || !userId || profile?.is_counts_hidden) return;
    try {
      const data = await window.anixApi.profile.getFriends(userId, 0) as { content?: Record<string, unknown>[] };
      friends = (data?.content ?? []).slice(0, 12);
    } catch {
      friends = [];
    }
  }

  let innerSlideReady = $state(false);

  /** Один шаг слайда: обзор ↔ любой внутренний экран (как настройки). */
  const innerOffset = $derived(panelView === 'overview' ? 0 : -100);
  const innerTrackStyle = $derived(`transform:translate3d(${innerOffset}%,0,0)`);
  const subViewActive = $derived(panelView !== 'overview');

  function profileShareUrl(): string {
    return `https://anixart-app.com/profile/${userId}`;
  }

  function openFriendsView() {
    panelView = 'friends';
  }

  function closeFriendsView() {
    panelView = 'overview';
  }

  function openEditView(screen: 'menu' | 'status' | 'nickname' | 'social' = 'menu') {
    editStartScreen = screen;
    panelView = 'edit';
  }

  function closeEditView() {
    panelView = 'overview';
    editStartScreen = 'menu';
  }

  function openLoginHistoryView() {
    panelView = 'loginHistory';
  }

  function closeLoginHistoryView() {
    panelView = 'overview';
  }

  async function onOwnSocialClick(link: ProfileSocialLink) {
    const result = await openSocialLink(link);
    if (result === 'copied') showToast(`Discord: ${link.value} скопирован`);
    else if (result === 'error') showToast('Не удалось открыть', 'err');
  }

  function onProfilePatched(patch: Record<string, unknown>) {
    if ('cover' in patch) {
      coverUrl = patch.cover ? String(patch.cover) : null;
    }
    if (!profile) return;
    const { cover: _cover, ...rest } = patch;
    if (Object.keys(rest).length === 0) return;
    profile = { ...profile, ...rest };
    if (typeof rest.login === 'string' && rest.login) {
      updateProfilePanelLogin(userId, rest.login);
    }
  }

  $effect(() => {
    if (!active) {
      if (panelView !== 'overview') panelView = 'overview';
      return;
    }
    setProfilePanelInnerView(panelView);
  });

  async function onFriendClick() {
    if (isMyProfile) {
      openEditView();
      return;
    }
    if (!requireAuth()) return;
    if (!profile || friendBusy || friendButton.disabled || friendButton.action === 'none') return;
    if (!window.anixApi?.profile) return;
    friendBusy = true;
    try {
      const fn = friendButton.action === 'send'
        ? window.anixApi.profile.sendFriendRequest
        : window.anixApi.profile.removeFriendRequest;
      const res = await fn(Number(profile.id)) as { friend_status?: number | null };
      profile = { ...profile, friend_status: res?.friend_status ?? null };
    } catch {
      /* ignore */
    } finally {
      friendBusy = false;
    }
  }

  async function openSocialSheet(targetId: number, known?: Record<string, unknown> | null) {
    if (socialBusy) return;
    const hint = known ?? profile;
    if (hint?.is_social === false) {
      showToast('У пользователя нет соцсетей', 'err');
      return;
    }

    socialBusy = true;
    try {
      const api = window.anixApi?.profile?.getSocialPages;
      if (api) {
        const data = await api(targetId);
        const pages = normalizeSocialPages(data);
        if (!hasProfileSocial(pages)) {
          showToast('Соцсети скрыты или не указаны', 'err');
          return;
        }
        socialPages = pages;
        socialSheetOpen = true;
        return;
      }
      const fallback = normalizeSocialPages(hint ?? {});
      if (!hasProfileSocial(fallback)) {
        showToast('У пользователя нет соцсетей', 'err');
        return;
      }
      socialPages = fallback;
      socialSheetOpen = true;
    } catch {
      showToast('Не удалось загрузить соцсети', 'err');
    } finally {
      socialBusy = false;
    }
  }

  function closeSocialSheet() {
    socialSheetOpen = false;
    socialPages = null;
  }

  function closeMoreSheet() {
    moreSheetOpen = false;
  }

  async function copyProfileLink() {
    try {
      await navigator.clipboard.writeText(profileShareUrl());
      showToast('Ссылка скопирована');
    } catch {
      showToast('Не удалось скопировать ссылку', 'err');
    }
  }

  async function shareProfile() {
    const url = profileShareUrl();
    const title = login || 'Профиль';
    try {
      if (typeof navigator.share === 'function') {
        await navigator.share({ title, url, text: title });
        return;
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
    }
    try {
      await navigator.clipboard.writeText(url);
      showToast('Ссылка скопирована');
    } catch {
      showToast('Не удалось поделиться', 'err');
    }
  }

  function onMoreAction(id: ProfileMoreAction) {
    if (id === 'loginHistory') openLoginHistoryView();
    else if (id === 'share') void shareProfile();
    else if (id === 'copyLink') void copyProfileLink();
    else showToast('Скоро', 'err');
  }

  function openFriend(id: number, friendLogin?: string) {
    openProfilePanel(id, { login: friendLogin });
  }

  function onMoreClick() {
    moreSheetOpen = true;
  }

  function friendAvatar(fr: Record<string, unknown>): string {
    return fr.avatar ? resolveCdnAssetUrl(String(fr.avatar)) : '';
  }

  function friendWord(n: number) {
    const mod10 = n % 10;
    const mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return 'друг';
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'друга';
    return 'друзей';
  }

  $effect(() => {
    const url = badge?.image_url;
    if (badgeLottieEl && url && isLottieBadgeUrl(url)) {
      void loadBadgeLottie(url, badgeLottieEl);
    }
  });

  $effect(() => {
    void userId;
    panelView = 'overview';
    closeSocialSheet();
    closeMoreSheet();
    if (active) setProfilePanelInnerView('overview');
    innerSlideReady = false;
    const id = requestAnimationFrame(() => {
      innerSlideReady = true;
    });
    return () => cancelAnimationFrame(id);
  });

  onMount(() => {
    void loadProfile();
  });

  onDestroy(() => destroyBadgeAnim());
</script>

<div
  class="profile-panel__block"
  class:profile-panel__block--active={active}
  aria-hidden={!active}
  inert={active ? undefined : true}
>
  {#if loadState === 'loading' || loadState === 'error'}
    <Page scrollId={`profile-panel-${userId}`} extraClass="profile-panel__page">
      {#if loadState === 'loading'}
        <p class="profile-panel__state">Загрузка…</p>
      {:else}
        <div class="profile-panel__state">
          <p>{errorMsg || 'Не удалось загрузить'}</p>
          <button type="button" class="profile-panel__retry" onclick={() => void loadProfile()}>Повторить</button>
        </div>
      {/if}
    </Page>
  {:else if profile}
    <div class="profile-panel__inner-viewport">
      <div
        class="profile-panel__inner-track"
        class:profile-panel__inner-track--ready={innerSlideReady}
        style={innerTrackStyle}
      >
        <div
          class="profile-panel__inner-slide"
          class:profile-panel__inner-slide--active={panelView === 'overview'}
          aria-hidden={panelView !== 'overview'}
          inert={panelView === 'overview' ? undefined : true}
        >
          <Page scrollId={`profile-panel-${userId}`} extraClass="profile-panel__page">
            <section class="profile-panel__top">
              <div class="profile-panel__banner" class:profile-panel__banner--empty={!coverUrl && !roles[0]?.color} style={bannerStyle}></div>

              <div class="profile-panel__identity">
                <div class="profile-panel__avatar-wrap">
                  <div
                    class="profile-panel__avatar"
                    style={avatarUrl ? `background-image:url('${avatarUrl}')` : undefined}
                    role="img"
                    aria-label={login}
                  ></div>
                  <span
                    class="profile-panel__online"
                    class:profile-panel__online--on={isOnline}
                    aria-hidden="true"
                  ></span>
                </div>

                <h2 class="profile-panel__name">
                  <span class="profile-panel__name-text">{login}</span>
                  {#if badge?.image_url}
                    {#if isLottieBadgeUrl(badge.image_url)}
                      <span class="profile-panel__badge" title={badge.name ?? ''} bind:this={badgeLottieEl}></span>
                    {:else}
                      <img class="profile-panel__badge-img" src={toCdnProxyUrl(badge.image_url)} alt={badge.name ?? ''} />
                    {/if}
                  {/if}
                  {#if profile.is_verified}
                    <span class="profile-panel__verified" title="Подтверждён">✓</span>
                  {/if}
                </h2>

                {#if statusText}
                  <p class="profile-panel__bio">{statusText}</p>
                {/if}

                {#if level != null || metaSecondary}
                  <div class="profile-panel__meta">
                    {#if level != null}
                      <span class="profile-panel__level">{level}</span>
                    {/if}
                    {#if level != null && metaSecondary}
                      <span class="profile-panel__meta-dot" aria-hidden="true">·</span>
                    {/if}
                    {#if metaSecondary}
                      <span class="profile-panel__meta-text">{metaSecondary}</span>
                    {/if}
                  </div>
                {/if}

                {#if roles.length}
                  <div class="profile-panel__roles">
                    {#each roles as role}
                      <span class="profile-panel__role" style={roleStyle(role.color)}>
                        <i class="profile-panel__role-dot" style="background:{role.color || '#888'}"></i>
                        {role.name}
                      </span>
                    {/each}
                  </div>
                {/if}
              </div>

              <div class="profile-panel__cta">
                {#if isMyProfile || friendButton.action !== 'none'}
                  <UiV2Button
                    label={friendBusy ? '…' : primaryLabel}
                    size="lg"
                    block
                    variant={!isMyProfile && friendButton.action === 'send' ? 'light' : 'chrome'}
                    disabled={!isMyProfile && (friendBusy || friendButton.disabled)}
                    onclick={() => void onFriendClick()}
                  />
                {:else if friendButton.disabled}
                  <UiV2Button label={friendButton.label} size="lg" block disabled />
                {/if}
                {#if !isMyProfile}
                  <UiV2RoundButton
                    label="Сообщение"
                    size="lg"
                    title="Сообщение"
                    disabled={socialBusy}
                    class={!hasSocial ? 'uiv2-round-btn--muted' : ''}
                    onclick={() => void openSocialSheet(userId, profile)}
                  >
                    {@html iconMessageCircle(18)}
                  </UiV2RoundButton>
                {/if}
                <UiV2RoundButton
                  label="Ещё"
                  size="lg"
                  title="Ещё"
                  ariaHaspopup="dialog"
                  ariaExpanded={moreSheetOpen}
                  onclick={onMoreClick}
                >
                  {@html iconMoreHorizontal(18)}
                </UiV2RoundButton>
              </div>

              {#if isMyProfile}
                <div class="profile-panel__social-row" aria-label="Социальные сети">
                  <UiV2RoundButton
                    label="Добавить соцсети"
                    title="Добавить соцсети"
                    onclick={() => openEditView('social')}
                  >
                    {@html iconPlus(18)}
                  </UiV2RoundButton>
                  {#each ownSocialLinks as link (link.id)}
                    <UiV2RoundButton
                      label={link.label}
                      title={link.label}
                      class={`uiv2-round-btn--social uiv2-round-btn--social-${link.id}`}
                      onclick={() => void onOwnSocialClick(link)}
                    >
                      {@html SOCIAL_ICONS[link.id]}
                    </UiV2RoundButton>
                  {/each}
                </div>
              {/if}

              {#if !profile.is_counts_hidden && (friendCount > 0 || isMyProfile)}
                <button type="button" class="profile-panel__friends-row" onclick={openFriendsView}>
                  <div class="profile-panel__friends-copy">
                    <span class="profile-panel__friends-count">{friendCount} {friendWord(friendCount)}</span>
                    {#if friendNamesPreview}
                      <span class="profile-panel__friends-names">{friendNamesPreview}</span>
                    {/if}
                  </div>
                  {#if friendsAvatars.length}
                    <div class="profile-panel__friends-stack" aria-hidden="true">
                      {#each friendsAvatars as fr, i (fr.id ?? i)}
                        {@const av = friendAvatar(fr)}
                        <span
                          class="profile-panel__friends-av"
                          style={`${av ? `background-image:url('${av}');` : ''}z-index:${friendsAvatars.length - i}`}
                        ></span>
                      {/each}
                    </div>
                  {/if}
                </button>
              {/if}

              {#if showPrivacy}
                <p class="profile-panel__privacy">{PROFILE_PRIVACY_NOTICE}</p>
              {/if}
            </section>

            <div class="profile-panel__tab-body">
              {#if !profile.is_stats_hidden}
                <UiV2Card title="Статистика">
                  <div class="profile-panel__stats">
                    <ProfileStatsSection
                      profile={profile}
                      profileId={userId}
                      isMyProfile={isMyProfile}
                      showMoreLink
                      plain
                    />
                  </div>
                </UiV2Card>

                {#if watchDynamics.length && dynamicsSummary}
                  <UiV2Card
                    title="Динамика просмотра"
                    spaced
                    pill={`${dynamicsSummary.total} всего · ${dynamicsSummary.peakCount} пик · ${dynamicsSummary.peakLabel} · ${dynamicsSummary.activeDays} дн.`}
                  >
                    <div class="profile-panel__dynamics">
                      <ProfileDynamicsSection {watchDynamics} hideSummary hideYLabels />
                    </div>
                  </UiV2Card>
                {/if}

                {#if recentHistory.length}
                  <UiV2Card title="Просмотрено недавно" spaced>
                    <div class="profile-panel__recent">
                      <ProfileHistorySection items={recentHistory} />
                    </div>
                  </UiV2Card>
                {/if}
              {:else if !isMyProfile}
                <p class="profile-panel__hint">Статистика скрыта настройками приватности.</p>
              {/if}
            </div>
          </Page>
        </div>

        <div
          class="profile-panel__inner-slide"
          class:profile-panel__inner-slide--active={subViewActive}
          aria-hidden={!subViewActive}
          inert={subViewActive ? undefined : true}
        >
          {#if panelView === 'friends'}
            <Page scrollId={`profile-panel-friends-${userId}`} extraClass="profile-panel__page">
              <ProfilePanelFriendsView
                profileId={userId}
                {login}
                {isMyProfile}
                {friendCount}
                onBack={closeFriendsView}
                onOpenFriend={openFriend}
                onOpenMessage={(id, fr) => void openSocialSheet(id, fr)}
              />
            </Page>
          {:else if panelView === 'edit'}
            <Page scrollId={`profile-panel-edit-${userId}`} extraClass="profile-panel__page">
              <ProfilePanelEditView
                profileId={userId}
                {login}
                status={statusText}
                badgeName={badge?.name ?? null}
                badgeUrl={badge?.image_url ?? null}
                startScreen={editStartScreen}
                onBack={closeEditView}
                onProfilePatched={onProfilePatched}
              />
            </Page>
          {:else if panelView === 'loginHistory'}
            <Page scrollId={`profile-panel-login-history-${userId}`} extraClass="profile-panel__page">
              <ProfilePanelLoginHistoryView
                profileId={userId}
                {login}
                onBack={closeLoginHistoryView}
              />
            </Page>
          {/if}
        </div>
      </div>
    </div>
  {/if}

  {#if socialSheetOpen && socialPages}
    <ProfileSocialSheet pages={socialPages} onClose={closeSocialSheet} />
  {/if}

  {#if moreSheetOpen}
    <ProfilePanelMoreSheet
      {isMyProfile}
      onClose={closeMoreSheet}
      onAction={onMoreAction}
    />
  {/if}
</div>
