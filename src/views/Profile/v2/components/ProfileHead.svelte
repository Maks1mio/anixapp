<script lang="ts">
  import { onDestroy } from 'svelte';
  import { openSettingsModal } from '../../../../stores/modals';
  import { fmtLastSeen, isLottieBadgeUrl, posterUrl } from '../../_utils';
  import { fetchCdnJson, toCdnProxyUrl } from '../../../../utils/posterUrl';

  interface Props {
    profile: Record<string, unknown>;
    coverUrl: string | null;
    isMyProfile: boolean;
    onOpenSocial: (url: string) => void;
  }

  let { profile, coverUrl, isMyProfile, onOpenSocial }: Props = $props();

  let badgeLottieEl = $state<HTMLElement | undefined>();
  let badgeAnim: { destroy?: () => void } | null = null;

  const displayCover = $derived(coverUrl ? toCdnProxyUrl(coverUrl) : '');
  const avatarStyle = $derived(
    profile.avatar ? `background-image:url('${posterUrl(String(profile.avatar))}')` : '',
  );

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

  $effect(() => {
    const badgeUrl = (profile.badge as { image_url?: string } | null)?.image_url;
    if (badgeLottieEl && badgeUrl && isLottieBadgeUrl(badgeUrl)) {
      loadBadgeLottie(badgeUrl, badgeLottieEl);
    }
  });

  onDestroy(() => destroyBadgeAnim());
</script>

<header class="profile-v2__hero">
  <div class="profile-v2__banner">
    {#if displayCover}
      <img class="profile-v2__banner-img" src={displayCover} alt="" loading="lazy" decoding="async" />
    {/if}
  </div>

  <div class="profile-v2__hero-body">
    <div class="profile-v2__avatar-wrap">
      <div
        class="profile-v2__avatar{profile.avatar ? '' : ' profile-v2__avatar--empty'}"
        style={avatarStyle}
      ></div>
      {#if profile.is_online}
        <span class="profile-v2__online-dot" aria-hidden="true"></span>
      {/if}
    </div>

    <div class="profile-v2__identity">
      <div class="profile-v2__name-row">
        <h1 class="profile-v2__name">{profile.login || 'Профиль'}</h1>
        {#if (profile.badge as { image_url?: string } | null)?.image_url}
          {@const badge = profile.badge as { image_url: string; name?: string }}
          {#if isLottieBadgeUrl(badge.image_url)}
            <span class="profile-v2__badge-lottie" title={badge.name ?? ''} bind:this={badgeLottieEl}></span>
          {:else}
            <img class="profile-v2__badge-img" src={toCdnProxyUrl(badge.image_url)} alt={badge.name ?? ''} />
          {/if}
        {/if}
        {#if profile.is_verified}
          <span class="profile-v2__verified" title="Верифицирован" aria-label="Верифицирован">✓</span>
        {/if}
      </div>

      {#if profile.status && String(profile.status).trim()}
        <p class="profile-v2__status">{profile.status}</p>
      {/if}

      <div class="profile-v2__meta-row">
        {#if profile.level != null}
          <span class="profile-v2__level">{profile.level}</span>
        {/if}
        {#if profile.is_online}
          <span class="profile-v2__activity profile-v2__activity--online">в сети</span>
        {:else if profile.last_activity_time}
          <span class="profile-v2__activity">{fmtLastSeen(Number(profile.last_activity_time))}</span>
        {/if}
        {#if profile.rating_score != null}
          {@const score = Number(profile.rating_score)}
          <span class="profile-v2__rep profile-v2__rep--{score > 0 ? 'pos' : score < 0 ? 'neg' : 'zero'}">
            {score > 0 ? '+' : ''}{score}
          </span>
        {/if}
      </div>
    </div>

    <div class="profile-v2__actions">
      {#if isMyProfile}
        <button type="button" class="profile-v2__friend-btn" onclick={() => openSettingsModal('account')}>
          Редактировать профиль
        </button>
      {:else}
        {@const isFriend = profile.friend_status === 2}
        <button type="button" class="profile-v2__friend-btn">
          {isFriend ? 'Удалить из друзей' : 'Добавить в друзья'}
        </button>
      {/if}

      {#if !profile.is_social_hidden}
        <div class="profile-v2__social-row">
          {#if profile.vk_page}
            <button type="button" class="profile-v2__social-btn" title="VK" onclick={() => onOpenSocial(`https://vk.com/${profile.vk_page}`)}>VK</button>
          {/if}
          {#if profile.tg_page}
            <button type="button" class="profile-v2__social-btn" title="Telegram" onclick={() => onOpenSocial(`https://t.me/${profile.tg_page}`)}>TG</button>
          {/if}
          {#if profile.discord_page}
            <button type="button" class="profile-v2__social-btn" title="Discord" onclick={() => onOpenSocial(`https://discord.com/users/${profile.discord_page}`)}>DS</button>
          {/if}
        </div>
      {/if}
    </div>

    {#if profile.is_banned}
      <p class="profile-v2__note profile-v2__note--warn">Пользователь заблокирован</p>
    {/if}
    {#if profile.is_stats_hidden || profile.is_counts_hidden || profile.is_social_hidden}
      {@const pv = [
        profile.is_stats_hidden ? 'статистика' : '',
        profile.is_counts_hidden ? 'счётчики' : '',
        profile.is_social_hidden ? 'соцсети' : '',
      ].filter(Boolean)}
      <p class="profile-v2__note">Скрыто: {pv.join(', ')}</p>
    {/if}
  </div>
</header>
