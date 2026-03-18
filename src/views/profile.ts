import { navigate } from '../app';
import { iconStar } from '../components/icons';
import { openSettingsModal } from '../components/settings-modal';

// ——— Helpers ———

function esc(s: string): string {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
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

function fmtShortDate(ts: number): string {
  if (!ts) return '';
  const ms = ts < 1e12 ? ts * 1000 : ts;
  const d = new Date(ms);
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`;
}

const MONTH_SHORT = ['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек'];

function posterUrl(raw: string | undefined): string {
  if (!raw) return '';
  const s = raw.trim();
  if (!s || s === 'null') return '';
  if (s.startsWith('http')) return s;
  return `https://s.anixmirai.com/posters/${s}`;
}

function isLottieBadgeUrl(url: string): boolean {
  const u = url.trim().toLowerCase();
  return u.endsWith('.json');
}

// ——— Inline SVG social icons ———

function si(path: string, size = 16): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${path}</svg>`;
}

const ICON_VK   = si('<path d="M15.07 2H8.93C3.33 2 2 3.33 2 8.93v6.14C2 20.67 3.33 22 8.93 22h6.14c5.6 0 6.93-1.33 6.93-6.93V8.93C22 3.33 20.67 2 15.07 2zm2.92 13.36h-1.5c-.57 0-.74-.45-1.76-1.48-.88-.86-1.27-.97-1.49-.97-.3 0-.39.09-.39.51v1.35c0 .36-.11.58-1.07.58-1.58 0-3.33-.96-4.57-2.74C5.81 10.4 5.37 8.5 5.37 8.08c0-.22.09-.42.51-.42h1.5c.38 0 .52.17.67.58.74 2.13 1.97 4 2.48 4 .19 0 .28-.09.28-.57V9.34c-.06-1.01-.59-1.1-.59-1.46 0-.17.14-.35.38-.35h2.35c.32 0 .43.17.43.55v2.97c0 .32.14.44.23.44.19 0 .35-.12.7-.47 1.07-1.2 1.84-3.06 1.84-3.06.1-.22.28-.42.65-.42h1.5c.45 0 .55.23.45.55-.19.87-2.02 3.45-2.02 3.45-.16.26-.22.38 0 .67.16.22.68.67 1.03 1.07.64.73 1.13 1.33 1.26 1.75.14.42-.07.64-.49.64z"/>');
const ICON_TG   = si('<path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>');
const ICON_TT   = si('<path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.27 6.27 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.18 8.18 0 0 0 4.79 1.53V6.77a4.85 4.85 0 0 1-1.02-.08z"/>');
const ICON_INST = si('<path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z"/>');

const ICON_VERIFIED  = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" stroke="#60a5fa" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const ICON_USER_PLUS = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>`;
const ICON_USER_MINUS= `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="22" y1="11" x2="16" y2="11"/></svg>`;
const ICON_PENCIL    = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>`;

// ——— Card / grid helpers ———

function bindCardClicks(container: HTMLElement) {
  container.querySelectorAll('[data-release-id]:not([data-bound])').forEach(btn => {
    (btn as HTMLElement).dataset.bound = '1';
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-release-id');
      if (id) navigate(`/release/${id}`);
    });
  });
}

function renderProfileCard(opts: {
  id: number; image: string; title: string;
  subtitle?: string; meta?: string; stars?: number;
}): string {
  const img = posterUrl(opts.image);
  const starsHtml = opts.stars != null
    ? `<div class="profile__card-stars">${Array.from({ length: 5 }, (_, i) => iconStar(10, i < opts.stars!)).join('')}</div>`
    : '';
  return `
    <button type="button" class="profile__card" data-release-id="${opts.id}">
      <div class="profile__card-poster" ${img ? `style="background-image:url('${esc(img)}')"` : ''}></div>
      <div class="profile__card-body">
        <span class="profile__card-title">${esc(opts.title)}</span>
        ${starsHtml}
        ${opts.subtitle ? `<span class="profile__card-sub">${esc(opts.subtitle)}</span>` : ''}
        ${opts.meta ? `<span class="profile__card-meta">${esc(opts.meta)}</span>` : ''}
      </div>
    </button>`;
}

function friendCardHtml(fr: any): string {
  return `
    <button type="button" class="profile__friend-card" data-friend-id="${fr.id}">
      <div class="profile__friend-av" ${fr.avatar ? `style="background-image:url('${esc(fr.avatar)}')"` : ''}></div>
      ${fr.is_online ? '<span class="profile__friend-online"></span>' : ''}
      <span class="profile__friend-name">${esc(fr.login || '')}</span>
      ${fr.friend_count != null ? `<span class="profile__friend-sub">${fr.friend_count} др.</span>` : ''}
    </button>`;
}

// ——— SVG line chart (watch dynamics) ———

function buildLineChart(container: HTMLElement, dynamics: any[]) {
  if (!dynamics.length) return;

  const W = 800, H = 110;
  const padL = 26, padR = 8, padT = 8, padB = 36;
  const counts = dynamics.map((d: any) => d.count as number);
  const maxVal = Math.max(...counts, 1);
  const n = dynamics.length;
  const iw = W - padL - padR;
  const ih = H - padT - padB;

  const px = (i: number) => padL + (n <= 1 ? iw / 2 : (i / (n - 1)) * iw);
  const py = (v: number) => padT + (1 - v / maxVal) * ih;

  const linePts = dynamics.map((d: any, i: number) =>
    `${i === 0 ? 'M' : 'L'}${px(i).toFixed(1)},${py(d.count).toFixed(1)}`
  ).join(' ');
  const areaPath = `${linePts} L${px(n - 1).toFixed(1)},${(H - padB).toFixed(1)} L${px(0).toFixed(1)},${(H - padB).toFixed(1)} Z`;

  // Horizontal grid lines at 0%, 50%, 100%
  const grids = [0, 0.5, 1].map(frac => {
    const y = padT + (1 - frac) * ih;
    const val = Math.round(maxVal * frac);
    return [
      `<line stroke="#262626" stroke-dasharray="3 3" x1="${padL}" y1="${y.toFixed(1)}" x2="${W - padR}" y2="${y.toFixed(1)}"/>`,
      val > 0 ? `<text class="profile__chart-label" x="0" y="${(y + 3.5).toFixed(1)}" text-anchor="start">${val}</text>` : '',
    ].join('');
  }).join('');

  // X-axis date labels every ~7 points, always first + last
  const step = Math.max(1, Math.floor(n / 7));
  const idxSet = new Set<number>();
  for (let i = 0; i < n; i += step) idxSet.add(i);
  idxSet.add(n - 1);
  const xLabels = [...idxSet].sort((a, b) => a - b).map(i => {
    const d = dynamics[i];
    const ms = d.timestamp < 1e12 ? d.timestamp * 1000 : d.timestamp;
    const dt = new Date(ms);
    const lbl = `${dt.getDate()}.${String(dt.getMonth() + 1).padStart(2, '0')}.${String(dt.getFullYear()).slice(-2)}`;
    return `<text class="profile__chart-label" x="${px(i).toFixed(1)}" y="${H - padB + 14}" text-anchor="middle">${lbl}</text>`;
  }).join('');

  // Hover dots
  const dots = dynamics.map((d: any, i: number) =>
    `<circle class="profile__chart-dot" cx="${px(i).toFixed(1)}" cy="${py(d.count).toFixed(1)}" r="3.5" data-count="${d.count}" data-ts="${d.timestamp}"/>`
  ).join('');

  container.innerHTML = `
    <div class="profile__chart-wrap">
      <svg class="profile__chart-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
        <defs>
          <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#e35689" stop-opacity="0.35"/>
            <stop offset="100%" stop-color="#e35689" stop-opacity="0.02"/>
          </linearGradient>
        </defs>
        ${grids}
        <path d="${areaPath}" fill="url(#chartGrad)"/>
        <path class="profile__chart-line" d="${linePts}"/>
        ${dots}
        ${xLabels}
      </svg>
    </div>`;

  // Tooltip
  const tooltip = document.createElement('div');
  tooltip.className = 'profile__chart-tooltip';
  tooltip.hidden = true;
  document.body.appendChild(tooltip);

  container.querySelectorAll('.profile__chart-dot').forEach(dot => {
    dot.addEventListener('mouseenter', e => {
      const el = e.target as SVGCircleElement;
      const ts = parseInt(el.dataset.ts || '0', 10);
      const ms = ts < 1e12 ? ts * 1000 : ts;
      const dt = new Date(ms);
      tooltip.textContent = `${el.dataset.count} серий · ${dt.getDate()} ${MONTH_SHORT[dt.getMonth()]} ${dt.getFullYear()}`;
      tooltip.hidden = false;
      const r = (e.target as Element).getBoundingClientRect();
      tooltip.style.left = `${r.left + r.width / 2 - tooltip.offsetWidth / 2}px`;
      tooltip.style.top = `${r.top - 38}px`;
    });
    dot.addEventListener('mouseleave', () => { tooltip.hidden = true; });
  });
}

// ——— Donut chart (stats) ———

function buildDonutChart(items: { label: string; value: number; color: string }[]): string {
  const r = 34, cx = 40, cy = 40;
  const C = 2 * Math.PI * r;
  const total = items.reduce((s, i) => s + i.value, 0);
  if (!total) return '';

  let acc = 0;
  const segs = items.filter(s => s.value > 0).map(s => {
    const dash = (s.value / total) * C;
    const seg = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${s.color}" stroke-width="10"
      stroke-dasharray="${dash.toFixed(2)} ${(C - dash).toFixed(2)}"
      stroke-dashoffset="${(-acc).toFixed(2)}"
      transform="rotate(-90 ${cx} ${cy})"><title>${s.label}: ${s.value}</title></circle>`;
    acc += dash;
    return seg;
  }).join('');

  return `<svg width="148" height="148" viewBox="0 0 80 80" class="profile__donut">
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#1e1e1e" stroke-width="10"/>
    ${segs}
    <text x="${cx}" y="${cy - 1}" text-anchor="middle" dominant-baseline="middle" font-size="12" font-weight="700" fill="#737373">${total}</text>
    <text x="${cx}" y="${cy + 10}" text-anchor="middle" dominant-baseline="middle" font-size="7" font-weight="600" fill="#555">аниме</text>
  </svg>`;
}

// ——— Main profile view ———

export function renderProfile(userId?: number): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'view view-profile';

  let badgeAnim: { destroy?: () => void } | null = null;
  let badgeAnimToken = 0;

  const destroyBadgeAnim = () => {
    if (badgeAnim?.destroy) badgeAnim.destroy();
    badgeAnim = null;
  };

  wrap.innerHTML = `
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
    </div>`;

  if (!window.anixApi) {
    wrap.innerHTML = `<div class="profile"><p class="profile__error">API недоступно (только в Electron).</p></div>`;
    return wrap;
  }

  const profilePromise = userId
    ? window.anixApi.profile.info(userId)
    : window.anixApi.profile.self();

  const channelPromise = userId
    ? (window.anixApi.channel.getBlog
      ? window.anixApi.channel.getBlog(userId).catch(() => null)
      : window.anixApi.channel.info(userId).catch(() => null))
    : Promise.resolve(null);

  Promise.all([profilePromise, channelPromise])
    .then(([data, channelData]) => {
      const profile = data?.profile as any;

      if (data?.session_mismatch || !profile) {
        wrap.innerHTML = `<div class="profile"><p class="profile__error">${
          data?.session_mismatch ? 'Профиль не совпадает с сессией.' : 'Не удалось загрузить профиль.'
        }</p></div>`;
        return;
      }

      const isMyProfile = !userId || !!(data as any)?.is_my_profile;
      const coverFromData: string | null =
        (data as any)?.blogInfo?.channel?.cover
        || (data as any)?.blog_info?.channel?.cover
        || (data as any)?.blog?.channel?.cover
        || (channelData as any)?.blogInfo?.channel?.cover
        || (channelData as any)?.channel?.cover
        || null;

      // Badge
      const badgeUrlRaw = (profile.badge?.image_url as string | undefined) ?? '';
      const badgeName = (profile.badge?.name as string | undefined) ?? '';
      const badgeUrl = badgeUrlRaw?.trim?.() ? badgeUrlRaw.trim() : '';
      const badgeHtml = badgeUrl
        ? (isLottieBadgeUrl(badgeUrl)
          ? `<span class="profile__badge-lottie" data-badge-lottie="${esc(badgeUrl)}" title="${esc(badgeName)}" aria-label="${esc(badgeName)}"></span>`
          : `<img class="profile__badge-img" src="${esc(badgeUrl)}" alt="${esc(badgeName)}" />`)
        : '';

      // Level
      const levelHtml = profile.level != null
        ? `<span class="profile__level">${profile.level}ур</span>`
        : '';

      // Reputation
      const repScore = profile.rating_score;
      const repHtml = repScore != null
        ? `<span class="profile__rep ${repScore > 0 ? 'profile__rep--pos' : repScore < 0 ? 'profile__rep--neg' : 'profile__rep--zero'}">${repScore > 0 ? '+' : ''}${repScore}</span>`
        : '';

      // Online/activity
      const onlineHtml = profile.is_online
        ? `<span class="profile__online-pill">в сети</span>`
        : profile.last_activity_time
          ? `<span class="profile__activity-text">был(а) ${fmtRelative(profile.last_activity_time)}</span>`
          : '';

      // Status
      const statusHtml = profile.status?.trim()
        ? `<p class="profile__status">${esc(profile.status)}</p>` : '';

      // Roles
      const rolesHtml = profile.roles?.length
        ? `<div class="profile__roles">${profile.roles.map((r: any) =>
            `<span class="profile__role" style="border-color:${esc(r.color || '#555')};color:${esc(r.color || '#aaa')}"><i class="profile__role-dot" style="background:${esc(r.color || '#555')}"></i>${esc(r.name)}</span>`
          ).join('')}</div>` : '';

      // Social icon buttons (icon-only, brand colored via CSS class)
      const socialMap = [
        { field: 'vk_page',      icon: ICON_VK,   cls: 'vk',   type: 'url',  url: `https://vk.com/${profile.vk_page}` },
        { field: 'tg_page',      icon: ICON_TG,   cls: 'tg',   type: 'url',  url: `https://t.me/${profile.tg_page}` },
        { field: 'tt_page',      icon: ICON_TT,   cls: 'tt',   type: 'url',  url: `https://tiktok.com/@${profile.tt_page}` },
        { field: 'inst_page',    icon: ICON_INST, cls: 'inst', type: 'url',  url: `https://instagram.com/${profile.inst_page}` },
      ];
      const socialBtns = socialMap
        .filter(s => profile[s.field]?.trim?.())
        .map(s => `<button class="profile__social profile__social--${s.cls}" data-stype="${s.type}" data-sval="${esc(s.url)}" title="${s.cls === 'ds' ? 'Discord (копировать)' : s.cls.toUpperCase()}">${s.icon}</button>`)
        .join('');
      const socialsHtml = socialBtns ? `<div class="profile__socials">${socialBtns}</div>` : '';

      // Friend button
      let friendBtnHtml = '';
      if (!isMyProfile) {
        const isFriend = profile.friend_status === 2;
        friendBtnHtml = `
          <button type="button" class="profile__friend-btn ${isFriend ? 'profile__friend-btn--remove' : 'profile__friend-btn--add'}" data-friend-action="${isFriend ? 'remove' : 'add'}" data-profile-id="${profile.id}">
            ${isFriend ? ICON_USER_MINUS : ICON_USER_PLUS}
            <span>${isFriend ? 'Удалить из друзей' : 'Добавить в друзья'}</span>
          </button>`;
      }

      // Edit profile button (only for self)
      const editBtnHtml = isMyProfile
        ? `
          <button type="button" class="profile__friend-btn profile__friend-btn--add" data-profile-edit="1">
            ${ICON_PENCIL}
            <span>Редактировать профиль</span>
          </button>`
        : '';

      // Ban / privacy
      const banHtml = profile.is_banned
        ? `<div class="profile__ban">
            <span>🚫</span>
            <div>
              <div>Пользователь заблокирован${profile.ban_expires ? ` до ${fmtDate(profile.ban_expires * 1000)}` : ''}</div>
              ${profile.ban_reason ? `<div class="profile__ban-reason">Причина: ${esc(profile.ban_reason)}</div>` : ''}
            </div>
          </div>` : '';

      const pv: string[] = [];
      if (profile.is_stats_hidden)  pv.push('статистика');
      if (profile.is_counts_hidden) pv.push('счётчики');
      if (profile.is_social_hidden) pv.push('соцсети');
      const privacyHtml = pv.length
        ? `<div class="profile__privacy">Пользователь скрыл: ${pv.join(', ')}.</div>` : '';

      // Watch info cards
      const wiParts: string[] = [];
      if (profile.watched_episode_count) wiParts.push(`<div class="profile__stat-item profile__stat-item--muted"><span class="profile__stat-dot profile__stat-dot--watch"></span><span class="profile__stat-lbl">Серий</span><strong class="profile__stat-val">${profile.watched_episode_count}</strong></div>`);
      if (profile.watched_time)          wiParts.push(`<div class="profile__stat-item profile__stat-item--muted"><span class="profile__stat-dot profile__stat-dot--watch"></span><span class="profile__stat-lbl">Просмотра</span><strong class="profile__stat-val">${fmtTime(profile.watched_time)}</strong></div>`);
      if (profile.comment_count)         wiParts.push(`<div class="profile__stat-item profile__stat-item--muted"><span class="profile__stat-dot profile__stat-dot--watch"></span><span class="profile__stat-lbl">Комментариев</span><strong class="profile__stat-val">${profile.comment_count}</strong></div>`);
      if (profile.friend_count)          wiParts.push(`<div class="profile__stat-item profile__stat-item--muted"><span class="profile__stat-dot profile__stat-dot--watch"></span><span class="profile__stat-lbl">Друзей</span><strong class="profile__stat-val">${profile.friend_count}</strong></div>`);
      if (profile.register_date)         wiParts.push(`<div class="profile__stat-item profile__stat-item--muted"><span class="profile__stat-dot profile__stat-dot--watch"></span><span class="profile__stat-lbl">Регистрация</span><strong class="profile__stat-val">${fmtDate(profile.register_date)}</strong></div>`);
      const watchInfoHtml = wiParts.length && !profile.is_counts_hidden
        ? `<div class="profile__stats-wi">${wiParts.join('')}</div>` : '';

      // Stats + donut
      const statsItems = [
        { label: 'Смотрю',      value: profile.watching_count   ?? 0, color: '#3b82f6' },
        { label: 'В планах',    value: profile.plan_count       ?? 0, color: '#a855f7' },
        { label: 'Просмотрено', value: profile.completed_count  ?? 0, color: '#22c55e' },
        { label: 'Отложено',    value: profile.hold_on_count    ?? 0, color: '#f59e0b' },
        { label: 'Брошено',     value: profile.dropped_count    ?? 0, color: '#ef4444' },
        { label: 'Избранное',   value: profile.favorite_count   ?? 0, color: '#e35689' },
      ];
      const donutHtml = buildDonutChart(statsItems);
      const statsHtml = !profile.is_stats_hidden ? `
        <section class="profile__section">
          <h2 class="profile__section-title">Статистика</h2>
          <div class="profile__stats-layout">
            <div class="profile__stats-items">
              ${statsItems.map(s => `
                <div class="profile__stat-item">
                  <span class="profile__stat-dot" style="background:${s.color}"></span>
                  <span class="profile__stat-lbl">${s.label}</span>
                  <strong class="profile__stat-val">${s.value}</strong>
                </div>`).join('')}
            </div>
            ${donutHtml ? `<div class="profile__donut-wrap">${donutHtml}</div>` : ''}
            ${watchInfoHtml}
          </div>
        </section>` : '';

      // Dynamics
      const dynamics = profile.watch_dynamics as any[] | undefined;
      const dynamicsHtml = dynamics?.length && !profile.is_counts_hidden
        ? `<section class="profile__section">
            <h2 class="profile__section-title">Динамика просмотра</h2>
            <div data-dynamics></div>
          </section>` : '';

      // Votes — show first 6 in grid, "Показать всё" navigates to sub-page
      const votesHtml = profile.votes?.length
        ? `<section class="profile__section">
            <div class="profile__section-hdr">
              <h2 class="profile__section-title">Оценки релизов</h2>
              <button class="profile__view-all" data-nav="/profile/${profile.id}/votes">Показать всё</button>
            </div>
            <div class="profile__media-grid" id="profile-votes-list"></div>
          </section>` : '';

      // History
      const historyHtml = profile.history?.length && !profile.is_counts_hidden
        ? `<section class="profile__section">
            <h2 class="profile__section-title">История просмотра</h2>
            <div class="profile__media-grid" id="profile-history-list"></div>
          </section>` : '';

      // ——— Render ———
      const renderProfileView = (coverUrl: string | null) => {
        destroyBadgeAnim();
        const myToken = ++badgeAnimToken;

        const coverHtml = coverUrl
          ? `<div class="profile__hero-cover"><img src="${esc(coverUrl)}" alt="${esc(profile.login || 'Профиль')}" /></div>`
          : '';

        wrap.innerHTML = `
        <div class="profile">
          <div class="profile__hero">
            ${coverHtml}
            <div class="profile__hero-banner ${coverUrl ? 'profile__hero-banner--with-cover' : ''}"></div>
            <div class="profile__hero-body">
              <div class="profile__avatar-wrap">
                <div class="profile__avatar ${!profile.avatar ? 'profile__avatar--empty' : ''}"
                     ${profile.avatar ? `style="background-image:url('${esc(profile.avatar)}')"` : ''}></div>
                ${profile.is_online ? '<span class="profile__online-dot"></span>' : ''}
              </div>
              <div class="profile__hero-info">
                <div class="profile__name-row">
                  <h1 class="profile__name">${esc(profile.login || 'Профиль')}</h1>
                  ${badgeHtml}
                  ${levelHtml}
                  ${profile.is_verified ? `<span class="profile__verified" title="Верифицирован">${ICON_VERIFIED}</span>` : ''}
                  ${repHtml}
                  ${onlineHtml}
                </div>
                ${statusHtml}
                ${rolesHtml}
                ${(socialsHtml || friendBtnHtml || editBtnHtml) ? `<div class="profile__social-actions">${editBtnHtml}${friendBtnHtml}${socialsHtml}</div>` : ''}
              </div>
            </div>
          </div>

          ${banHtml}
          ${privacyHtml}
          ${statsHtml}
          ${dynamicsHtml}
          ${votesHtml}
          ${historyHtml}
          <div id="profile-friends-wrap"></div>
        </div>`;

        const badgeEl = wrap.querySelector<HTMLElement>('[data-badge-lottie]');
        if (badgeEl) {
          const url = badgeEl.getAttribute('data-badge-lottie') || '';
          const target = badgeEl;
          target.textContent = '';

          (async () => {
            try {
              const res = await fetch(url, { cache: 'force-cache' });
              if (!res.ok) throw new Error(`badge fetch failed: ${res.status}`);
              const json = await res.json();
              if (!json || typeof json !== 'object') throw new Error('badge json invalid');
              if ((json as any).tgs !== 1 && !(json as any).layers) {
                throw new Error('badge json not lottie');
              }

              const mod: any = await import('lottie-web');
              const lottie = mod?.default ?? mod;
              if (!lottie?.loadAnimation) throw new Error('lottie-web missing loadAnimation');
              if (myToken !== badgeAnimToken) return;

              badgeAnim = lottie.loadAnimation({
                container: target,
                renderer: 'svg',
                loop: true,
                autoplay: true,
                animationData: json,
                rendererSettings: {
                  preserveAspectRatio: 'xMidYMid meet',
                },
              });
            } catch (_e) {
              // If badge failed to load, just keep it empty (no layout shift).
            }
          })();
        }
      };

      renderProfileView(coverFromData);

      if (!coverFromData && profile?.id) {
        const blogFn = window.anixApi?.channel?.getBlog ?? window.anixApi?.channel?.info;
        if (blogFn) {
          blogFn.call(window.anixApi.channel, Number(profile.id))
            .then((chData: any) => {
              const fallbackCover =
                chData?.channel?.cover
                || chData?.blogInfo?.channel?.cover
                || chData?.blog_info?.channel?.cover
                || null;
              if (fallbackCover) renderProfileView(fallbackCover);
            })
            .catch(() => {});
        }
      }

      // Bind social buttons
      wrap.querySelectorAll('[data-stype]').forEach(btn => {
        btn.addEventListener('click', () => {
          const type = btn.getAttribute('data-stype');
          const val  = btn.getAttribute('data-sval') || '';
          window.electron?.openExternal(val);
        });
      });

      // Bind "Edit profile" button (self) → открывает настройки на вкладке "Моя учётная запись"
      wrap.querySelectorAll('[data-profile-edit]').forEach(btn => {
        btn.addEventListener('click', () => {
          openSettingsModal(() => {}, 'account');
        });
      });

      // Bind nav buttons (Показать всё)
      wrap.querySelectorAll('[data-nav]').forEach(btn => {
        btn.addEventListener('click', () => {
          const path = btn.getAttribute('data-nav');
          if (path) navigate(path);
        });
      });

      // Line chart
      if (dynamics?.length && !profile.is_counts_hidden) {
        const chartWrap = wrap.querySelector('[data-dynamics]') as HTMLElement | null;
        if (chartWrap) buildLineChart(chartWrap, dynamics);
      }

      // Votes list (first 6)
      if (profile.votes?.length) {
        const list = wrap.querySelector('#profile-votes-list') as HTMLElement | null;
        if (list) {
          list.innerHTML = profile.votes.slice(0, 6).map((v: any) => renderProfileCard({
            id: v.id, image: v.image,
            title: v.title_ru || v.title_original || 'Без названия',
            stars: v.my_vote ?? undefined,
            meta: v.voted_at ? fmtShortDate(v.voted_at) : undefined,
          })).join('');
          bindCardClicks(list);
        }
      }

      // History list
      if (profile.history?.length && !profile.is_counts_hidden) {
        const list = wrap.querySelector('#profile-history-list') as HTMLElement | null;
        if (list) {
          list.innerHTML = profile.history.map((rel: any) => renderProfileCard({
            id: rel.id, image: rel.image,
            title: rel.title_ru || rel.title_original || 'Без названия',
            subtitle: rel.last_view_episode?.name,
            meta: rel.last_view_timestamp ? fmtShortDate(rel.last_view_timestamp) : undefined,
          })).join('');
          bindCardClicks(list);
        }
      }

      // Friends preview (first 6, "Показать всё" → /profile/:id/friends)
      if ((profile.friend_count ?? 0) > 0 && profile.id && window.anixApi) {
        window.anixApi.profile.getFriends(profile.id, 0).then((fData: any) => {
          const friends = (fData?.content ?? []) as any[];
          if (!friends.length) return;
          const friendsWrap = document.getElementById('profile-friends-wrap');
          if (!friendsWrap) return;
          const hasMore = (profile.friend_count ?? 0) > 7;
          friendsWrap.innerHTML = `
            <section class="profile__section">
              <div class="profile__section-hdr">
                <h2 class="profile__section-title">
                  Друзья <span class="profile__count-chip">${profile.friend_count}</span>
                </h2>
                ${hasMore ? `<button class="profile__view-all" data-nav="/profile/${profile.id}/friends">Показать всё</button>` : ''}
              </div>
              <div class="profile__friends-grid" id="profile-friends-list">
                ${friends.slice(0, 7).map(friendCardHtml).join('')}
              </div>
            </section>`;

          friendsWrap.querySelectorAll('[data-nav]').forEach(btn => {
            btn.addEventListener('click', () => {
              const path = btn.getAttribute('data-nav');
              if (path) navigate(path);
            });
          });

          friendsWrap.querySelectorAll('[data-friend-id]:not([data-bound])').forEach(btn => {
            (btn as HTMLElement).dataset.bound = '1';
            btn.addEventListener('click', () => {
              const fid = btn.getAttribute('data-friend-id');
              if (fid) navigate(`/profile/${fid}`);
            });
          });
        }).catch(() => {});
      }
    })
    .catch((err: unknown) => {
      console.error(err);
      wrap.innerHTML = `<div class="profile"><p class="profile__error">Ошибка загрузки профиля.</p></div>`;
    });

  return wrap;
}

// ——— Votes sub-page ———

