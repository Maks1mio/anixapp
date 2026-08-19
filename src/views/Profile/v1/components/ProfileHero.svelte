<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { openSettingsModal } from '../../../../stores/modals';
  import { fmtRelative, isLottieBadgeUrl, posterUrl } from '../../_utils';
  import { fetchCdnJson, toCdnProxyUrl } from '../../../../utils/posterUrl';

  interface Props {
    profile:     any;
    coverUrl:    string | null;
    isMyProfile: boolean;
    onOpenSocial: (url: string) => void;
  }

  let { profile, coverUrl, isMyProfile, onOpenSocial }: Props = $props();

  // ── Lottie badge ────────────────────────────────────────────────────────
  let badgeLottieEl = $state<HTMLElement | undefined>();
  let badgeAnim: { destroy?: () => void } | null = null;

  function destroyBadgeAnim() {
    if (badgeAnim?.destroy) badgeAnim.destroy();
    badgeAnim = null;
  }

  async function loadBadgeLottie(url: string, target: HTMLElement) {
    try {
      const json = await fetchCdnJson(url);
      if (!json || typeof json !== 'object') return;
      const mod: any = await import('lottie-web/build/player/lottie_light');
      const lottie = mod?.default ?? mod;
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
    if (badgeLottieEl && profile?.badge?.image_url && isLottieBadgeUrl(profile.badge.image_url)) {
      loadBadgeLottie(profile.badge.image_url, badgeLottieEl);
    }
  });

  onDestroy(() => destroyBadgeAnim());
</script>

<div class="profile__hero">
  {#if coverUrl}
    <div class="profile__hero-cover">
      <img src={coverUrl} alt={profile.login || 'Профиль'} />
    </div>
  {/if}

  <div class="profile__hero-banner{coverUrl ? ' profile__hero-banner--with-cover' : ''}"></div>

  <div class="profile__hero-body">
    <!-- Avatar -->
    <div class="profile__avatar-wrap">
      <div
        class="profile__avatar{!profile.avatar ? ' profile__avatar--empty' : ''}"
        style={profile.avatar ? `background-image:url('${posterUrl(profile.avatar)}')` : ''}
      ></div>
      {#if profile.is_online}
        <span class="profile__online-dot"></span>
      {/if}
    </div>

    <div class="profile__hero-info">
      <!-- Name row -->
      <div class="profile__name-row">
        <h1 class="profile__name">{profile.login || 'Профиль'}</h1>

        {#if profile.badge?.image_url}
          {#if isLottieBadgeUrl(profile.badge.image_url)}
            <span
              class="profile__badge-lottie"
              title={profile.badge.name ?? ''}
              aria-label={profile.badge.name ?? ''}
              bind:this={badgeLottieEl}
            ></span>
          {:else}
            <img class="profile__badge-img" src={toCdnProxyUrl(profile.badge.image_url)} alt={profile.badge.name ?? ''} />
          {/if}
        {/if}

        {#if profile.level != null}
          <span class="profile__level">{profile.level}ур</span>
        {/if}

        {#if profile.is_verified}
          <span class="profile__verified" title="Верифицирован">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" stroke="#60a5fa" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </span>
        {/if}

        {#if profile.rating_score != null}
          <span class="profile__rep{profile.rating_score > 0 ? ' profile__rep--pos' : profile.rating_score < 0 ? ' profile__rep--neg' : ' profile__rep--zero'}">
            {profile.rating_score > 0 ? '+' : ''}{profile.rating_score}
          </span>
        {/if}

        {#if profile.is_online}
          <span class="profile__online-pill">
            <span class="profile__online-pill-dot" aria-hidden="true"></span>
            <span class="profile__online-pill-text">в сети</span>
          </span>
        {:else if profile.last_activity_time}
          <span class="profile__activity-text">был(а) {fmtRelative(profile.last_activity_time)}</span>
        {/if}
      </div>

      {#if profile.status?.trim()}
        <p class="profile__status">{profile.status}</p>
      {/if}

      <!-- Roles -->
      {#if profile.roles?.length}
        <div class="profile__roles">
          {#each profile.roles as r}
            <span class="profile__role" style="border-color:{r.color || '#555'};color:{r.color || '#aaa'}">
              <i class="profile__role-dot" style="background:{r.color || '#555'}"></i>{r.name}
            </span>
          {/each}
        </div>
      {/if}

      <!-- Social actions -->
      <div class="profile__social-actions">
        {#if isMyProfile}
          <button
            type="button"
            class="profile__friend-btn profile__friend-btn--add"
            onclick={() => openSettingsModal('account')}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/>
            </svg>
            <span>Редактировать профиль</span>
          </button>
        {:else}
          {@const isFriend = profile.friend_status === 2}
          <button type="button" class="profile__friend-btn{isFriend ? ' profile__friend-btn--remove' : ' profile__friend-btn--add'}">
            {#if isFriend}
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="22" y1="11" x2="16" y2="11"/>
              </svg>
              <span>Удалить из друзей</span>
            {:else}
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/>
              </svg>
              <span>Добавить в друзья</span>
            {/if}
          </button>
        {/if}

        {#if profile.vk_page}
          <button class="profile__social profile__social--vk" onclick={() => onOpenSocial(`https://vk.com/${profile.vk_page}`)} title="VK">
            <svg viewBox="0 0 24 24" fill="currentColor" width="15" height="15" aria-hidden="true"><path d="M15.684 0H8.316C1.592 0 0 1.592 0 8.316v7.368C0 22.408 1.592 24 8.316 24h7.368C22.408 24 24 22.408 24 15.684V8.316C24 1.592 22.408 0 15.684 0zm3.692 17.123h-1.744c-.66 0-.862-.525-2.049-1.714-1.033-1.01-1.49-1.135-1.744-1.135-.356 0-.458.102-.458.593v1.566c0 .422-.135.677-1.253.677-1.846 0-3.896-1.12-5.338-3.202C4.935 11.178 4.5 8.84 4.5 8.369c0-.254.102-.491.593-.491h1.744c.44 0 .61.203.779.677.864 2.49 2.303 4.675 2.896 4.675.22 0 .322-.102.322-.66V9.978c-.068-1.186-.695-1.287-.695-1.71 0-.203.17-.407.44-.407h2.744c.372 0 .508.203.508.643v3.473c0 .372.17.508.271.508.22 0 .407-.136.813-.542 1.253-1.405 2.151-3.574 2.151-3.574.119-.254.322-.491.763-.491h1.744c.525 0 .643.271.525.643-.22 1.034-2.354 4.031-2.354 4.031-.186.305-.254.44 0 .779.186.254.796.779 1.203 1.253.745.847 1.322 1.558 1.474 2.049.17.491-.085.745-.576.745z"/></svg>
          </button>
        {/if}
        {#if profile.tg_page}
          <button class="profile__social profile__social--tg" onclick={() => onOpenSocial(`https://t.me/${profile.tg_page}`)} title="Telegram">
            <svg viewBox="0 0 24 24" fill="currentColor" width="15" height="15" aria-hidden="true"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>
          </button>
        {/if}
        {#if profile.inst_page}
          <button class="profile__social profile__social--inst" onclick={() => onOpenSocial(`https://instagram.com/${profile.inst_page}`)} title="Instagram">
            <svg viewBox="0 0 24 24" fill="currentColor" width="15" height="15" aria-hidden="true"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z"/></svg>
          </button>
        {/if}
        {#if profile.tt_page}
          <button class="profile__social profile__social--tt" onclick={() => onOpenSocial(`https://tiktok.com/@${profile.tt_page}`)} title="TikTok">
            <svg viewBox="0 0 24 24" fill="currentColor" width="15" height="15" aria-hidden="true"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.18 8.18 0 0 0 4.78 1.52V6.73a4.85 4.85 0 0 1-1.01-.04z"/></svg>
          </button>
        {/if}
        {#if profile.discord_page}
          <button class="profile__social profile__social--ds" onclick={() => onOpenSocial(`https://discord.com/users/${profile.discord_page}`)} title="Discord">
            <svg viewBox="0 0 24 24" fill="currentColor" width="15" height="15" aria-hidden="true"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/></svg>
          </button>
        {/if}
      </div>
    </div>
  </div>
</div>
