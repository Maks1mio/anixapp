<script lang="ts">
  import { onDestroy } from 'svelte';
  import { openSettingsModal } from '../../../../../stores/modals';
  import { openUserProfileModal } from '../../../../../stores/user-profile';
  import { fmtDate, fmtLastSeen, fmtRelative, isLottieBadgeUrl, posterUrl } from '../../../_utils';
  import { fetchCdnJson, toCdnProxyUrl, resolveCdnAssetUrl } from '../../../../../utils/posterUrl';
  import { resolveFriendButtonState } from '../../../../../utils/profile-friend';
  import { invalidateProfilePreview } from '../../../../../utils/profile-preview';
  import { hasProfilePrivacyRestrictions } from '../../profile-privacy';
  import ProfilePrivacyNotice from '../ProfilePrivacyNotice.svelte';

  interface Props {
    profile: Record<string, unknown>;
    coverUrl: string | null;
    isMyProfile: boolean;
    selfProfileId: number;
    variant?: 'sidebar' | 'popout';
    showFullLink?: boolean;
    onOpenSocial?: (url: string) => void;
  }

  let {
    profile,
    coverUrl,
    isMyProfile,
    selfProfileId,
    variant = 'sidebar',
    showFullLink = false,
    onOpenSocial = (url) => window.electron?.openExternal?.(url),
  }: Props = $props();

  let badgeLottieEl = $state<HTMLElement | undefined>();
  let badgeAnim: { destroy?: () => void } | null = null;
  let friendBusy = $state(false);

  const displayCover = $derived(coverUrl ? toCdnProxyUrl(coverUrl) : '');
  const avatarStyle = $derived(
    profile.avatar ? `background-image:url('${posterUrl(String(profile.avatar))}')` : '',
  );
  const bannerStyle = $derived.by(() => {
    if (displayCover) return `background-image:url('${displayCover}')`;
    const roles = profile.roles as { color?: string }[] | undefined;
    const accent = roles?.[0]?.color;
    if (accent) return `background:${accent}`;
    return '';
  });

  const friendButton = $derived(resolveFriendButtonState(
    Number(profile.id ?? 0),
    selfProfileId,
    profile.friend_status as number | null | undefined,
    {
      requestsDisallowed: !!profile.is_friend_requests_disallowed,
      isBlocked: !!profile.is_blocked,
    },
  ));

  const collectionPreview = $derived(
    Array.isArray(profile.collections_preview)
      ? (profile.collections_preview as Record<string, unknown>[]).slice(0, 4)
      : [],
  );

  const hasSocial = $derived(
    !profile.is_social_hidden
    && !!(profile.vk_page || profile.tg_page || profile.inst_page || profile.tt_page || profile.discord_page),
  );

  const login = $derived(String(profile.login || 'Профиль'));
  const showPrivacyNotice = $derived(hasProfilePrivacyRestrictions(profile, isMyProfile));

  function roleStyle(color?: string) {
    const c = color || '#888';
    return `--role-color:${c};border-color:${c};color:${c};background:color-mix(in srgb, ${c} 14%, transparent);`;
  }

  function destroyBadgeAnim() {
    if (badgeAnim?.destroy) badgeAnim.destroy();
    badgeAnim = null;
  }

  async function loadBadgeLottie(url: string, target: HTMLElement) {
    try {
      const json = await fetchCdnJson(url);
      if (!json || typeof json !== 'object') return;
      const mod: { default?: unknown } = await import('lottie-web');
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

  async function onFriendClick() {
    if (friendBusy || friendButton.disabled || friendButton.action === 'none') return;
    const profileId = Number(profile.id ?? 0);
    if (!profileId || !window.anixApi?.profile) return;
    friendBusy = true;
    try {
      const fn = friendButton.action === 'send'
        ? window.anixApi.profile.sendFriendRequest
        : window.anixApi.profile.removeFriendRequest;
      const res = await fn(profileId) as { friend_status?: number | null };
      profile.friend_status = res?.friend_status ?? null;
      invalidateProfilePreview(profileId);
    } catch { /* ignore */ } finally {
      friendBusy = false;
    }
  }

  function openFullProfile() {
    const profileId = Number(profile.id ?? 0);
    if (profileId) openUserProfileModal(profileId);
  }

  $effect(() => {
    const badgeUrl = (profile.badge as { image_url?: string } | null)?.image_url;
    if (badgeLottieEl && badgeUrl && isLottieBadgeUrl(badgeUrl)) {
      loadBadgeLottie(badgeUrl, badgeLottieEl);
    }
  });

  onDestroy(() => destroyBadgeAnim());
</script>

<aside class="profile-ui__sidebar profile-ui__sidebar--{variant}">
  <div class="profile-ui__banner-wrap">
    {#if displayCover}
      <img class="profile-ui__banner-img" src={displayCover} alt="" loading="lazy" decoding="async" />
    {:else}
      <div class="profile-ui__banner" style={bannerStyle}></div>
    {/if}
  </div>

  <div class="profile-ui__sidebar-header">
    <div class="profile-ui__avatar-row">
      <div class="profile-ui__avatar-wrap">
        <div
          class="profile-ui__avatar{profile.avatar ? '' : ' profile-ui__avatar--empty'}"
          style={avatarStyle}
        ></div>
        <span
          class="profile-ui__status-dot"
          class:profile-ui__status-dot--online={!!profile.is_online}
          aria-hidden="true"
        ></span>
      </div>
    </div>
  </div>

  <div class="profile-ui__sidebar-body">
    <div class="profile-ui__identity profile-ui__identity--mobile">
      <div class="profile-ui__name-row">
        <h2 class="profile-ui__name">{login}</h2>
        {#if (profile.badge as { image_url?: string } | null)?.image_url}
          {@const badge = profile.badge as { image_url: string; name?: string }}
          {#if isLottieBadgeUrl(badge.image_url)}
            <span class="profile-ui__badge-lottie" title={badge.name ?? ''} bind:this={badgeLottieEl}></span>
          {:else}
            <img class="profile-ui__badge-img" src={toCdnProxyUrl(badge.image_url)} alt={badge.name ?? ''} />
          {/if}
        {/if}
        {#if profile.is_verified}
          <span class="profile-ui__verified" title="Верифицирован">✓</span>
        {/if}
      </div>

      {#if variant === 'sidebar'}
        <p class="profile-ui__handle">@{login.toLowerCase()}</p>
      {/if}

      {#if profile.status && String(profile.status).trim()}
        <p class="profile-ui__status-text">{profile.status}</p>
      {/if}

      {#if Array.isArray(profile.roles) && profile.roles.length}
        <div class="profile-ui__roles-row">
          {#each profile.roles as role}
            {@const r = role as { name?: string; color?: string }}
            <span class="profile-ui__role" style={roleStyle(r.color)}>
              <i class="profile-ui__role-dot" style="background:{r.color || '#888'}"></i>{r.name}
            </span>
          {/each}
        </div>
      {/if}

      <div class="profile-ui__meta profile-ui__meta--mobile">
        {#if profile.level != null}
          <span class="profile-ui__level-badge">{profile.level}</span>
        {/if}
        {#if profile.is_online}
          <span class="profile-ui__activity profile-ui__activity--online">в сети</span>
        {:else if profile.last_activity_time}
          <span class="profile-ui__activity">
            {variant === 'sidebar' ? fmtLastSeen(Number(profile.last_activity_time)) : fmtRelative(Number(profile.last_activity_time))}
          </span>
        {/if}
        {#if profile.rating_score != null}
          {@const score = Number(profile.rating_score)}
          <span class="profile-ui__rep profile-ui__rep--{score > 0 ? 'pos' : score < 0 ? 'neg' : 'zero'}">
            {score > 0 ? '+' : ''}{score}
          </span>
        {/if}
      </div>
    </div>

    {#if variant === 'sidebar'}
      <div class="profile-ui__actions">
        {#if isMyProfile}
          <button type="button" class="profile-ui__btn-primary" onclick={() => openSettingsModal('account')}>
            Редактировать профиль
          </button>
        {:else if friendButton.action !== 'none'}
          <button
            type="button"
            class="profile-ui__btn-primary"
            disabled={friendBusy || friendButton.disabled}
            onclick={onFriendClick}
          >
            {friendBusy ? '…' : friendButton.label}
          </button>
        {:else if friendButton.disabled}
          <span class="profile-ui__muted-note">{friendButton.label}</span>
        {/if}
      </div>
    {/if}

    {#if !profile.is_counts_hidden}
      <div class="profile-ui__section profile-ui__section--counts">
        {#if profile.friend_count != null}
          <span>{profile.friend_count} {Number(profile.friend_count) === 1 ? 'друг' : Number(profile.friend_count) < 5 ? 'друга' : 'друзей'}</span>
        {/if}
        {#if profile.collection_count != null}
          <span>{profile.collection_count} {Number(profile.collection_count) === 1 ? 'коллекция' : Number(profile.collection_count) < 5 ? 'коллекции' : 'коллекций'}</span>
        {/if}
      </div>
    {/if}

    {#if collectionPreview.length > 0 && variant === 'popout'}
      <div class="profile-ui__section">
        <span class="profile-ui__section-label">Коллекции</span>
        <div class="profile-ui__collection-grid">
          {#each collectionPreview as item}
            {@const image = resolveCdnAssetUrl((item.image ?? item.poster) as string)}
            <div
              class="profile-ui__collection-thumb"
              style={image ? `background-image:url('${image}')` : ''}
              title={(item.title ?? item.name) as string}
            ></div>
          {/each}
        </div>
      </div>
    {/if}

    {#if hasSocial}
      <div class="profile-ui__section">
        <span class="profile-ui__section-label">Соцсети</span>
        <div class="profile-ui__social-row">
          {#if profile.vk_page}
            <button type="button" class="profile-ui__social-btn" onclick={() => onOpenSocial(`https://vk.com/${profile.vk_page}`)}>VK</button>
          {/if}
          {#if profile.tg_page}
            <button type="button" class="profile-ui__social-btn" onclick={() => onOpenSocial(`https://t.me/${profile.tg_page}`)}>TG</button>
          {/if}
          {#if profile.inst_page}
            <button type="button" class="profile-ui__social-btn" onclick={() => onOpenSocial(`https://instagram.com/${profile.inst_page}`)}>IG</button>
          {/if}
          {#if profile.tt_page}
            <button type="button" class="profile-ui__social-btn" onclick={() => onOpenSocial(`https://tiktok.com/@${profile.tt_page}`)}>TT</button>
          {/if}
          {#if profile.discord_page}
            <button type="button" class="profile-ui__social-btn" onclick={() => onOpenSocial(`https://discord.com/users/${profile.discord_page}`)}>DS</button>
          {/if}
        </div>
      </div>
    {/if}

    {#if showFullLink && variant !== 'popout'}
      <button type="button" class="profile-ui__link-btn" onclick={openFullProfile}>
        Полный профиль
      </button>
    {/if}

    {#if showPrivacyNotice}
      <ProfilePrivacyNotice />
    {/if}

    {#if profile.is_banned}
      <p class="profile-ui__note profile-ui__note--warn">
        Пользователь заблокирован{profile.ban_expires ? ` до ${fmtDate(Number(profile.ban_expires) * 1000)}` : ''}
      </p>
      {#if profile.ban_reason}
        <p class="profile-ui__note profile-ui__note--warn">Причина: {profile.ban_reason}</p>
      {/if}
    {/if}
  </div>

  {#if variant === 'popout'}
    <div class="profile-ui__sidebar-footer">
      {#if showFullLink}
        <button type="button" class="profile-ui__link-btn" onclick={openFullProfile}>
          Полный профиль
        </button>
      {/if}
      <div class="profile-ui__actions">
        {#if isMyProfile}
          <button type="button" class="profile-ui__btn-primary" onclick={() => openSettingsModal('account')}>
            Редактировать профиль
          </button>
        {:else if friendButton.action !== 'none'}
          <button
            type="button"
            class="profile-ui__btn-primary"
            disabled={friendBusy || friendButton.disabled}
            onclick={onFriendClick}
          >
            {friendBusy ? '…' : friendButton.label}
          </button>
        {:else if friendButton.disabled}
          <span class="profile-ui__muted-note">{friendButton.label}</span>
        {/if}
      </div>
    </div>
  {/if}
</aside>
