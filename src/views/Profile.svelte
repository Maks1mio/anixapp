<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { navigate } from '../stores/navigation';
  import { openSettingsModal } from '../stores/modals';

  interface Props {
    id?: number;
  }

  let { id }: Props = $props();

  // Helpers
  function esc(s: string): string {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  function fmtTime(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const d = Math.floor(h / 24);
    if (d >= 1) {
      const rem = h % 24;
      return rem > 0 ? `${d} д. ${rem} ч.` : `${d} д.`;
    }
    const m = Math.floor((seconds % 3600) / 60);
    return h > 0 ? `${h} ч. ${m} мин.` : `${m} мин.`;
  }

  function fmtDate(ts: number): string {
    if (!ts) return '';
    const d = new Date(ts < 1e12 ? ts * 1000 : ts);
    const months = ['янв.','фев.','мар.','апр.','мая','июн.','июл.','авг.','сен.','окт.','ноя.','дек.'];
    return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
  }

  function fmtRelative(ts: number): string {
    if (!ts) return '';
    const ms = ts < 1e12 ? ts * 1000 : ts;
    const diff = Date.now() - ms;
    const min = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    if (min < 1) return 'только что';
    if (min < 60) return `${min} мин. назад`;
    if (hours < 24) return `${hours} ч. назад`;
    if (days < 7) return `${days} д. назад`;
    return fmtDate(ts);
  }

  function buildDonutChart(items: { label: string; value: number; color: string }[]): string {
    const r = 34;
    const cx = 40;
    const cy = 40;
    const c = 2 * Math.PI * r;
    const total = items.reduce((s, i) => s + i.value, 0);
    if (!total) return '';

    let acc = 0;
    const segs = items
      .filter((s) => s.value > 0)
      .map((s) => {
        const dash = (s.value / total) * c;
        const seg = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${s.color}" stroke-width="10"
          stroke-dasharray="${dash.toFixed(2)} ${(c - dash).toFixed(2)}"
          stroke-dashoffset="${(-acc).toFixed(2)}"
          transform="rotate(-90 ${cx} ${cy})"></circle>`;
        acc += dash;
        return seg;
      })
      .join('');

    return `<svg width="148" height="148" viewBox="0 0 80 80" class="profile__donut">
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#1e1e1e" stroke-width="10"></circle>
      ${segs}
      <text x="${cx}" y="${cy - 1}" text-anchor="middle" dominant-baseline="middle" font-size="12" font-weight="700" fill="#737373">${total}</text>
      <text x="${cx}" y="${cy + 10}" text-anchor="middle" dominant-baseline="middle" font-size="7" font-weight="600" fill="#555">аниме</text>
    </svg>`;
  }

  type DynamicsPoint = { count: number; timestamp: number };

  function getDynamicsData(): DynamicsPoint[] {
    const src = (profile?.watch_dynamics ?? []) as Array<{ count?: number; timestamp?: number }>;
    return src
      .map((d) => ({ count: Number(d.count ?? 0), timestamp: Number(d.timestamp ?? 0) }))
      .filter((d) => Number.isFinite(d.count) && Number.isFinite(d.timestamp) && d.timestamp > 0);
  }

  function buildDynamicsGeometry(data: DynamicsPoint[]) {
    const w = 800;
    const h = 110;
    const padL = 26;
    const padR = 8;
    const padT = 8;
    const padB = 36;
    const maxVal = Math.max(...data.map((d) => d.count), 1);
    const n = data.length;
    const iw = w - padL - padR;
    const ih = h - padT - padB;
    const px = (i: number) => padL + (n <= 1 ? iw / 2 : (i / (n - 1)) * iw);
    const py = (v: number) => padT + (1 - v / maxVal) * ih;
    const points = data.map((d, i) => ({ x: px(i), y: py(d.count), ...d }));
    const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
    const areaPath = `${linePath} L${points[n - 1].x.toFixed(1)},${(h - padB).toFixed(1)} L${points[0].x.toFixed(1)},${(h - padB).toFixed(1)} Z`;
    return { w, h, padL, padR, padT, padB, ih, maxVal, points, linePath, areaPath };
  }

  let dynamicsHoverIndex = $state<number | null>(null);
  let dynamicsSvgEl = $state<SVGSVGElement | null>(null);
  let dynamicsTooltipEl: HTMLDivElement | null = null;

  function ensureDynamicsTooltip() {
    if (dynamicsTooltipEl || typeof document === 'undefined') return;
    const el = document.createElement('div');
    el.className = 'profile__chart-tooltip';
    el.style.display = 'none';
    document.body.appendChild(el);
    dynamicsTooltipEl = el;
  }

  function hideDynamicsTooltip() {
    if (dynamicsTooltipEl) dynamicsTooltipEl.style.display = 'none';
  }

  function setDynamicsHoverFromMouse(e: MouseEvent, chart: ReturnType<typeof buildDynamicsGeometry>) {
    if (!dynamicsSvgEl || !chart.points.length) return;
    const rect = dynamicsSvgEl.getBoundingClientRect();
    if (!rect.width) return;
    const x = ((e.clientX - rect.left) / rect.width) * chart.w;
    let nearest = 0;
    let best = Number.POSITIVE_INFINITY;
    for (let i = 0; i < chart.points.length; i += 1) {
      const dx = Math.abs(chart.points[i].x - x);
      if (dx < best) {
        best = dx;
        nearest = i;
      }
    }
    dynamicsHoverIndex = nearest;

    ensureDynamicsTooltip();
    if (!dynamicsTooltipEl) return;
    const p = chart.points[nearest];
    dynamicsTooltipEl.textContent = fmtDynamicsTooltip(p.timestamp, p.count);
    dynamicsTooltipEl.style.display = 'block';

    const tooltipRect = dynamicsTooltipEl.getBoundingClientRect();
    const margin = 10;
    let left = e.clientX - tooltipRect.width / 2;
    const top = e.clientY - tooltipRect.height - 14;
    if (left < margin) left = margin;
    if (left + tooltipRect.width > window.innerWidth - margin) left = window.innerWidth - margin - tooltipRect.width;
    dynamicsTooltipEl.style.left = `${left}px`;
    dynamicsTooltipEl.style.top = `${Math.max(margin, top)}px`;
  }

  function fmtDynamicsTooltip(ts: number, count: number): string {
    const ms = ts < 1e12 ? ts * 1000 : ts;
    const d = new Date(ms);
    const months = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
    return `${count} серий · ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
  }

  function shouldShowDynamicsLabel(index: number, total: number): boolean {
    const step = Math.max(1, Math.floor(total / 7));
    return index % step === 0 || index === total - 1;
  }

  function posterUrl(raw: string | undefined): string {
    if (!raw) return '';
    const s = raw.trim();
    if (!s || s === 'null') return '';
    if (s.startsWith('http')) return s;
    return `https://s.anixmirai.com/posters/${s}`;
  }

  function isLottieBadgeUrl(url: string): boolean {
    return url.trim().toLowerCase().endsWith('.json');
  }

  // State
  let loadState = $state<'loading' | 'error' | 'ready'>('loading');
  let errorMsg = $state('');
  let profile = $state<any>(null);
  let coverUrl = $state<string | null>(null);
  let isMyProfile = $state(false);
  let badgeLottieEl: HTMLElement | undefined = $state();
  let badgeAnim: { destroy?: () => void } | null = null;
  let friendsData = $state<any[]>([]);
  let hasFriendsMore = $state(false);

  function destroyBadgeAnim() {
    if (badgeAnim?.destroy) badgeAnim.destroy();
    badgeAnim = null;
  }

  async function loadBadgeLottie(url: string, target: HTMLElement) {
    try {
      const res = await fetch(url, { cache: 'force-cache' });
      if (!res.ok) return;
      const json = await res.json();
      if (!json || typeof json !== 'object') return;
      const mod: any = await import('lottie-web');
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

  onMount(async () => {
    if (!window.anixApi) {
      errorMsg = 'API недоступно (только в Electron).';
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
        errorMsg = data?.session_mismatch ? 'Профиль не совпадает с сессией.' : 'Не удалось загрузить профиль.';
        loadState = 'error';
        return;
      }

      profile = data.profile;
      isMyProfile = !id || !!(data?.is_my_profile);

      // Cover
      const cover =
        data?.blogInfo?.channel?.cover
        || data?.blog_info?.channel?.cover
        || data?.blog?.channel?.cover
        || (channelData as any)?.blogInfo?.channel?.cover
        || (channelData as any)?.channel?.cover
        || null;
      coverUrl = cover;

      // Try fetching cover from channel if not found
      if (!cover && profile?.id) {
        const blogFn = window.anixApi.channel?.getBlog ?? window.anixApi.channel?.info;
        if (blogFn) {
          blogFn.call(window.anixApi.channel, Number(profile.id))
            .then((chData: any) => {
              const fallback = chData?.channel?.cover || chData?.blogInfo?.channel?.cover || chData?.blog_info?.channel?.cover || null;
              if (fallback) coverUrl = fallback;
            })
            .catch(() => {});
        }
      }

      // Friends preview
      if ((profile.friend_count ?? 0) > 0 && profile.id) {
        window.anixApi.profile.getFriends(profile.id, 0).then((fData: any) => {
          const friends = (fData?.content ?? []) as any[];
          friendsData = friends.slice(0, 7);
          hasFriendsMore = (profile.friend_count ?? 0) > 7;
        }).catch(() => {});
      }

      loadState = 'ready';

      // Discord RPC
      window.dispatchEvent(new CustomEvent('discord:profileView', {
        detail: { username: profile.login ?? '', avatarUrl: profile.avatar ?? null, isSelf: isMyProfile },
      }));
    } catch (err) {
      errorMsg = 'Ошибка загрузки профиля.';
      loadState = 'error';
    }
  });

  onDestroy(() => {
    destroyBadgeAnim();
    if (dynamicsTooltipEl) {
      dynamicsTooltipEl.remove();
      dynamicsTooltipEl = null;
    }
  });

  function openSocial(url: string) {
    window.electron?.openExternal(url);
  }
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
      <!-- Hero -->
      <div class="profile__hero">
        {#if coverUrl}
          <div class="profile__hero-cover">
            <img src={coverUrl} alt={profile.login || 'Профиль'} />
          </div>
        {/if}
        <div class="profile__hero-banner{coverUrl ? ' profile__hero-banner--with-cover' : ''}"></div>
        <div class="profile__hero-body">
          <div class="profile__avatar-wrap">
            <div
              class="profile__avatar{!profile.avatar ? ' profile__avatar--empty' : ''}"
              style={profile.avatar ? `background-image:url('${profile.avatar}')` : ''}
            ></div>
            {#if profile.is_online}
              <span class="profile__online-dot"></span>
            {/if}
          </div>
          <div class="profile__hero-info">
            <div class="profile__name-row">
              <h1 class="profile__name">{profile.login || 'Профиль'}</h1>
              <!-- Badge -->
              {#if profile.badge?.image_url}
                {#if isLottieBadgeUrl(profile.badge.image_url)}
                  <span class="profile__badge-lottie" title={profile.badge.name ?? ''} aria-label={profile.badge.name ?? ''} bind:this={badgeLottieEl}></span>
                {:else}
                  <img class="profile__badge-img" src={profile.badge.image_url} alt={profile.badge.name ?? ''} />
                {/if}
              {/if}
              {#if profile.level != null}
                <span class="profile__level">{profile.level}ур</span>
              {/if}
              {#if profile.is_verified}
                <span class="profile__verified" title="Верифицирован">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" stroke="#60a5fa" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
                </span>
              {/if}
              {#if profile.rating_score != null}
                <span class="profile__rep{profile.rating_score > 0 ? ' profile__rep--pos' : profile.rating_score < 0 ? ' profile__rep--neg' : ' profile__rep--zero'}">
                  {profile.rating_score > 0 ? '+' : ''}{profile.rating_score}
                </span>
              {/if}
              {#if profile.is_online}
                <span class="profile__online-pill">в сети</span>
              {:else if profile.last_activity_time}
                <span class="profile__activity-text">был(а) {fmtRelative(profile.last_activity_time)}</span>
              {/if}
            </div>

            {#if profile.status?.trim()}
              <p class="profile__status">{profile.status}</p>
            {/if}

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
                <button type="button" class="profile__friend-btn profile__friend-btn--add" onclick={() => openSettingsModal('account')}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>
                  <span>Редактировать профиль</span>
                </button>
              {:else}
                {@const isFriend = profile.friend_status === 2}
                <button type="button" class="profile__friend-btn{isFriend ? ' profile__friend-btn--remove' : ' profile__friend-btn--add'}">
                  {#if isFriend}
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
                    <span>Удалить из друзей</span>
                  {:else}
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
                    <span>Добавить в друзья</span>
                  {/if}
                </button>
              {/if}

              <!-- Social links -->
              {#if profile.vk_page}
                <button class="profile__social profile__social--vk" onclick={() => openSocial(`https://vk.com/${profile.vk_page}`)} title="VK">VK</button>
              {/if}
              {#if profile.tg_page}
                <button class="profile__social profile__social--tg" onclick={() => openSocial(`https://t.me/${profile.tg_page}`)} title="Telegram">TG</button>
              {/if}
            </div>
          </div>
        </div>
      </div>

      <!-- Ban -->
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
        {@const pv = [profile.is_stats_hidden ? 'статистика' : '', profile.is_counts_hidden ? 'счётчики' : '', profile.is_social_hidden ? 'соцсети' : ''].filter(Boolean)}
        <div class="profile__privacy">Пользователь скрыл: {pv.join(', ')}.</div>
      {/if}

      <!-- Stats -->
      {#if !profile.is_stats_hidden}
        {@const statsItems = [
          { label: 'Смотрю',      value: profile.watching_count  ?? 0, color: '#3b82f6' },
          { label: 'В планах',    value: profile.plan_count      ?? 0, color: '#a855f7' },
          { label: 'Просмотрено', value: profile.completed_count ?? 0, color: '#22c55e' },
          { label: 'Отложено',    value: profile.hold_on_count   ?? 0, color: '#f59e0b' },
          { label: 'Брошено',     value: profile.dropped_count   ?? 0, color: '#ef4444' },
          { label: 'Избранное',   value: profile.favorite_count  ?? 0, color: '#e35689' },
        ]}
        {@const wiParts = [
          profile.watched_episode_count ? { label: 'Серий',        val: String(profile.watched_episode_count) } : null,
          profile.watched_time          ? { label: 'Просмотра',     val: fmtTime(profile.watched_time) }       : null,
          profile.comment_count         ? { label: 'Комментариев',  val: String(profile.comment_count) }       : null,
          profile.friend_count          ? { label: 'Друзей',        val: String(profile.friend_count) }        : null,
          profile.register_date         ? { label: 'Регистрация',   val: fmtDate(profile.register_date) }      : null,
        ].filter(Boolean) as { label: string; val: string }[]}
        <section class="profile__section">
          <h2 class="profile__section-title">Статистика</h2>
          <div class="profile__stats-layout">
            <div class="profile__stats-items">
              {#each statsItems as s}
                <div class="profile__stat-item">
                  <span class="profile__stat-dot" style="background:{s.color}"></span>
                  <span class="profile__stat-lbl">{s.label}</span>
                  <strong class="profile__stat-val">{s.value}</strong>
                </div>
              {/each}
            </div>
            <div class="profile__donut-wrap">
              {@html buildDonutChart(statsItems)}
            </div>
            {#if !profile.is_counts_hidden && wiParts.length}
              <div class="profile__stats-wi">
                {#each wiParts as wi}
                  <div class="profile__stat-item profile__stat-item--muted">
                    <span class="profile__stat-dot profile__stat-dot--watch"></span>
                    <span class="profile__stat-lbl">{wi.label}</span>
                    <strong class="profile__stat-val">{wi.val}</strong>
                  </div>
                {/each}
              </div>
            {/if}
          </div>
        </section>
      {/if}

      <!-- Watch dynamics -->
      {#if profile.watch_dynamics?.length && !profile.is_counts_hidden}
        {@const dynamicsData = getDynamicsData()}
        {@const chart = dynamicsData.length ? buildDynamicsGeometry(dynamicsData) : null}
        <section class="profile__section">
          <h2 class="profile__section-title">Динамика просмотра</h2>
          {#if chart}
            <div class="profile__chart-wrap">
              <svg class="profile__chart-svg" viewBox="0 0 {chart.w} {chart.h}" preserveAspectRatio="none" bind:this={dynamicsSvgEl}>
                <defs>
                  <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" style="stop-color: var(--color-accent)" stop-opacity="0.35"></stop>
                    <stop offset="100%" style="stop-color: var(--color-accent)" stop-opacity="0.02"></stop>
                  </linearGradient>
                </defs>
                {#each [0, 0.5, 1] as frac}
                  {@const y = chart.padT + (1 - frac) * chart.ih}
                  {@const val = Math.round(chart.maxVal * frac)}
                  <line stroke="#262626" stroke-dasharray="3 3" x1={chart.padL} y1={y} x2={chart.w - chart.padR} y2={y}></line>
                  {#if val > 0}
                    <text class="profile__chart-label" x="0" y={y + 3.5} text-anchor="start">{val}</text>
                  {/if}
                {/each}
                <path d={chart.areaPath} fill="url(#chartGrad)"></path>
                <path class="profile__chart-line" d={chart.linePath}></path>

                {#if dynamicsHoverIndex != null}
                  {@const hp = chart.points[dynamicsHoverIndex]}
                  <line class="profile__chart-hover-line" x1={hp.x} y1={chart.padT} x2={hp.x} y2={chart.h - chart.padB}></line>
                {/if}

                {#each chart.points as p, i}
                  <circle class="profile__chart-dot" cx={p.x} cy={p.y} r={dynamicsHoverIndex === i ? 5 : 3.5}></circle>
                {/each}

                {#each chart.points as p, i}
                  {#if shouldShowDynamicsLabel(i, chart.points.length)}
                    {@const dt = new Date((p.timestamp < 1e12 ? p.timestamp * 1000 : p.timestamp))}
                    <text class="profile__chart-label" x={p.x} y={chart.h - chart.padB + 14} text-anchor="middle">
                      {dt.getDate()}.{String(dt.getMonth() + 1).padStart(2, '0')}.{String(dt.getFullYear()).slice(-2)}
                    </text>
                  {/if}
                {/each}

                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <rect
                  class="profile__chart-overlay"
                  x={chart.padL}
                  y={chart.padT}
                  width={chart.w - chart.padL - chart.padR}
                  height={chart.h - chart.padT - chart.padB}
                  onmousemove={(e) => setDynamicsHoverFromMouse(e, chart)}
                  onmouseleave={() => {
                    dynamicsHoverIndex = null;
                    hideDynamicsTooltip();
                  }}
                ></rect>
              </svg>
            </div>
          {/if}
        </section>
      {/if}

      <!-- Votes -->
      {#if profile.votes?.length}
        <section class="profile__section">
          <div class="profile__section-hdr">
            <h2 class="profile__section-title">Оценки релизов</h2>
            <button class="profile__view-all" onclick={() => navigate(`/profile/${profile.id}/votes`)}>Показать всё</button>
          </div>
          <div class="profile__media-grid">
            {#each profile.votes.slice(0, 6) as v}
              <button type="button" class="profile__card" onclick={() => navigate(`/release/${v.id}`)}>
                {#if v.image}
                  <div class="profile__card-poster" style="background-image:url('{posterUrl(v.image)}')"></div>
                {:else}
                  <div class="profile__card-poster"></div>
                {/if}
                <div class="profile__card-body">
                  <span class="profile__card-title">{v.title_ru || v.title_original || 'Без названия'}</span>
                  {#if v.my_vote}
                    <div class="profile__card-stars">
                      {#each Array.from({ length: 5 }, (_, i) => i) as i}
                        <svg width="10" height="10" viewBox="0 0 24 24" fill={i < v.my_vote ? 'currentColor' : 'none'} stroke="currentColor" stroke-width="2"><polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"/></svg>
                      {/each}
                    </div>
                  {/if}
                </div>
              </button>
            {/each}
          </div>
        </section>
      {/if}

      <!-- History -->
      {#if profile.history?.length && !profile.is_counts_hidden}
        <section class="profile__section">
          <h2 class="profile__section-title">История просмотра</h2>
          <div class="profile__media-grid">
            {#each profile.history as rel}
              <button type="button" class="profile__card" onclick={() => navigate(`/release/${rel.id}`)}>
                {#if rel.image}
                  <div class="profile__card-poster" style="background-image:url('{posterUrl(rel.image)}')"></div>
                {:else}
                  <div class="profile__card-poster"></div>
                {/if}
                <div class="profile__card-body">
                  <span class="profile__card-title">{rel.title_ru || rel.title_original || 'Без названия'}</span>
                  {#if rel.last_view_episode?.name}
                    <span class="profile__card-sub">{rel.last_view_episode.name}</span>
                  {/if}
                </div>
              </button>
            {/each}
          </div>
        </section>
      {/if}

      <!-- Friends preview -->
      {#if friendsData.length}
        <section class="profile__section">
          <div class="profile__section-hdr">
            <h2 class="profile__section-title">
              Друзья <span class="profile__count-chip">{profile.friend_count}</span>
            </h2>
            {#if hasFriendsMore}
              <button class="profile__view-all" onclick={() => navigate(`/profile/${profile.id}/friends`)}>Показать всё</button>
            {/if}
          </div>
          <div class="profile__friends-grid">
            {#each friendsData as fr}
              <button type="button" class="profile__friend-card" onclick={() => navigate(`/profile/${fr.id}`)}>
                <div class="profile__friend-av" style={fr.avatar ? `background-image:url('${fr.avatar}')` : ''}></div>
                {#if fr.is_online}
                  <span class="profile__friend-online"></span>
                {/if}
                <span class="profile__friend-name">{fr.login || ''}</span>
                {#if fr.friend_count != null}
                  <span class="profile__friend-sub">{fr.friend_count} др.</span>
                {/if}
              </button>
            {/each}
          </div>
        </section>
      {/if}
    </div>
  {/if}
</div>
