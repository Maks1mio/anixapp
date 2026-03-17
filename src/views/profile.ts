import { navigate } from '../app';
import { iconStar } from '../components/icons';

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
  const d = new Date(ts * (ts < 1e12 ? 1000 : 1));
  const months = ['янв.','фев.','мар.','апр.','мая','июн.','июл.','авг.','сен.','окт.','ноя.','дек.'];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

function fmtRelativeShort(ts: number): string {
  if (!ts) return '';
  const ms = ts < 1e12 ? ts * 1000 : ts;
  const d = new Date(ms);
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`;
}

const MONTH_NAMES_SHORT = ['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек'];

function posterUrl(raw: string | undefined): string {
  if (!raw) return '';
  const s = raw.trim();
  if (!s) return '';
  if (s.startsWith('http')) return s;
  return `https://s.anixmirai.com/posters/${s}`;
}

function bindCardClicks(container: HTMLElement) {
  container.querySelectorAll('[data-release-id]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-release-id');
      if (id) navigate(`/release/${id}`);
    });
  });
}

function buildLineChart(container: HTMLElement, dynamics: any[]) {
  if (!dynamics.length) return;

  const W = container.clientWidth || 700;
  const H = 120;
  const padL = 0;
  const padR = 0;
  const padT = 20;
  const padB = 24;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;

  const maxCount = Math.max(...dynamics.map((d: any) => d.count), 1);
  const n = dynamics.length;

  const points = dynamics.map((d: any, i: number) => {
    const x = padL + (n > 1 ? (i / (n - 1)) * chartW : chartW / 2);
    const y = padT + chartH - (d.count / maxCount) * chartH;
    return { x, y, count: d.count, ts: d.timestamp };
  });

  const lineCoords = points.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const areaCoords = `${padL},${padT + chartH} ${lineCoords} ${padL + chartW},${padT + chartH}`;

  // Month labels on X axis
  const monthLabels: string[] = [];
  let lastMonth = -1;
  for (const p of points) {
    const ms = p.ts < 1e12 ? p.ts * 1000 : p.ts;
    const date = new Date(ms);
    const m = date.getMonth();
    if (m !== lastMonth) {
      lastMonth = m;
      monthLabels.push(`<text x="${p.x.toFixed(1)}" y="${H - 2}" class="profile__chart-label">${MONTH_NAMES_SHORT[m]}</text>`);
    }
  }

  // Horizontal grid lines
  const gridLines: string[] = [];
  const steps = 4;
  for (let i = 0; i <= steps; i++) {
    const y = padT + (i / steps) * chartH;
    gridLines.push(`<line x1="${padL}" y1="${y.toFixed(1)}" x2="${padL + chartW}" y2="${y.toFixed(1)}" class="profile__chart-grid"/>`);
  }

  container.innerHTML = `
    <svg class="profile__chart-svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
      ${gridLines.join('')}
      <polygon points="${areaCoords}" class="profile__chart-area"/>
      <polyline points="${lineCoords}" class="profile__chart-line"/>
      ${monthLabels.join('')}
    </svg>
  `;

  const svg = container.querySelector('svg') as SVGElement;

  const tooltip = document.createElement('div');
  tooltip.className = 'profile__chart-tooltip';
  tooltip.hidden = true;
  document.body.appendChild(tooltip);

  const removeTooltip = () => {
    tooltip.hidden = true;
    tooltip.remove();
  };

  svg.addEventListener('mousemove', (e) => {
    const rect = svg.getBoundingClientRect();
    const scaleX = W / rect.width;
    const mx = (e.clientX - rect.left) * scaleX;

    let closest = points[0];
    let minDist = Infinity;
    for (const p of points) {
      const dist = Math.abs(p.x - mx);
      if (dist < minDist) { minDist = dist; closest = p; }
    }

    const ms = closest.ts < 1e12 ? closest.ts * 1000 : closest.ts;
    const date = new Date(ms);
    const dateStr = `${date.getDate()} ${MONTH_NAMES_SHORT[date.getMonth()]}`;
    tooltip.textContent = `${closest.count} серий · ${dateStr}`;
    tooltip.hidden = false;

    if (!document.body.contains(tooltip)) document.body.appendChild(tooltip);

    const tw = tooltip.offsetWidth;
    const th = tooltip.offsetHeight;
    let tx = e.clientX - tw / 2;
    let ty = e.clientY - th - 10;

    if (tx < 4) tx = 4;
    if (tx + tw > window.innerWidth - 4) tx = window.innerWidth - 4 - tw;
    if (ty < 4) ty = e.clientY + 14;

    tooltip.style.left = `${tx}px`;
    tooltip.style.top = `${ty}px`;
  });

  svg.addEventListener('mouseleave', () => {
    tooltip.hidden = true;
  });

  const observer = new MutationObserver(() => {
    if (!document.body.contains(container)) {
      removeTooltip();
      observer.disconnect();
    }
  });
  observer.observe(container.parentElement || document.body, { childList: true, subtree: true });
}

function renderProfileCard(opts: {
  id: number;
  image: string;
  title: string;
  subtitle?: string;
  meta?: string;
  stars?: number;
}): string {
  const img = posterUrl(opts.image);
  const starsHtml = opts.stars != null
    ? `<div class="profile__card-stars">${Array.from({ length: 5 }, (_, i) => iconStar(11, i < opts.stars!)).join('')}</div>`
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
    </button>
  `;
}

export function renderProfile(userId?: number): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'view view-profile';

  wrap.innerHTML = `
    <div class="profile">
      <div class="profile__hero">
        <div class="profile__avatar-wrap">
          <div class="profile__avatar profile__avatar--placeholder"></div>
          <span class="profile__avatar-online" hidden></span>
        </div>
        <div class="profile__hero-info">
          <div class="profile__name-row">
            <h1 class="profile__name">Профиль</h1>
            <span class="profile__badge" hidden></span>
          </div>
          <p class="profile__status profile__status--muted">Загрузка…</p>
          <div class="profile__roles" hidden></div>
          <div class="profile__meta-line" hidden></div>
          <div class="profile__socials" hidden></div>
        </div>
      </div>

      <div class="profile__stats-grid" hidden></div>

      <div class="profile__section profile__section--watch-info" hidden>
        <div class="profile__watch-info"></div>
      </div>

      <div class="profile__section profile__section--dynamics" hidden>
        <h2 class="profile__section-title">Динамика просмотра</h2>
        <div class="profile__chart-wrap"></div>
      </div>

      <div class="profile__section profile__section--votes" hidden>
        <h2 class="profile__section-title">Оценка релизов</h2>
        <div class="profile__hscroll">
          <div class="profile__hscroll-track profile__votes-list"></div>
        </div>
      </div>

      <div class="profile__section profile__section--history" hidden>
        <h2 class="profile__section-title">История просмотра</h2>
        <div class="profile__hscroll">
          <div class="profile__hscroll-track profile__history-list"></div>
        </div>
      </div>

      <div class="profile__section profile__section--friends" hidden>
        <h2 class="profile__section-title">Друзья</h2>
        <div class="profile__friends-list"></div>
      </div>
    </div>
  `;

  if (!window.anixApi) {
    const st = wrap.querySelector('.profile__status') as HTMLElement;
    if (st) st.textContent = 'API недоступно (только в Electron).';
    return wrap;
  }

  const profilePromise = userId
    ? window.anixApi.profile.info(userId)
    : window.anixApi.profile.self();

  profilePromise.then((data: any) => {
    console.log('[Anix API] profile', data);
    const profile = data?.profile;
    if (data?.session_mismatch || !profile) {
      const st = wrap.querySelector('.profile__status') as HTMLElement;
      if (st) st.textContent = data?.session_mismatch
        ? 'Профиль не совпадает с сессией. Выйдите и войдите снова.'
        : 'Не удалось загрузить профиль.';
      return;
    }

    // Avatar
    const avatarEl = wrap.querySelector('.profile__avatar') as HTMLElement;
    if (avatarEl && profile.avatar) {
      avatarEl.classList.remove('profile__avatar--placeholder');
      avatarEl.style.backgroundImage = `url(${profile.avatar})`;
    }

    // Online dot
    const onlineDot = wrap.querySelector('.profile__avatar-online') as HTMLElement;
    if (onlineDot && profile.is_online) onlineDot.hidden = false;

    // Name
    const nameEl = wrap.querySelector('.profile__name') as HTMLElement;
    if (nameEl) nameEl.textContent = profile.login || 'Профиль';

    // Discord Rich Presence: show profile info (avatar + name)
    window.dispatchEvent(new CustomEvent('discord:profileView', {
      detail: {
        username: profile.login || '',
        avatarUrl: profile.avatar || null,
        isSelf: !userId,
      },
    }));

    // Badge
    const badgeEl = wrap.querySelector('.profile__badge') as HTMLElement;
    if (badgeEl && profile.badge) {
      badgeEl.hidden = false;
      badgeEl.innerHTML = profile.badge.image_url
        ? `<img src="${esc(profile.badge.image_url)}" alt="${esc(profile.badge.name || '')}" />`
        : esc(profile.badge.name || '');
    }

    // Status
    const statusEl = wrap.querySelector('.profile__status') as HTMLElement;
    if (statusEl) {
      statusEl.classList.remove('profile__status--muted');
      statusEl.textContent = profile.status || '';
      if (!profile.status) statusEl.hidden = true;
    }

    // Roles
    const rolesEl = wrap.querySelector('.profile__roles') as HTMLElement;
    if (rolesEl && profile.roles?.length) {
      rolesEl.hidden = false;
      rolesEl.innerHTML = profile.roles.map((r: any) =>
        `<span class="profile__role" style="color:${esc(r.color || '#e5e5e5')}">${esc(r.name)}</span>`
      ).join('');
    }

    // Meta line
    const metaLine = wrap.querySelector('.profile__meta-line') as HTMLElement;
    if (metaLine) {
      const parts: string[] = [];
      if (profile.is_online) parts.push('<span class="profile__online">в сети</span>');
      else if (profile.last_activity_time) parts.push(`Активность: ${fmtDate(profile.last_activity_time)}`);
      if (profile.register_date) parts.push(`Регистрация: ${fmtDate(profile.register_date)}`);
      if (parts.length) {
        metaLine.hidden = false;
        metaLine.innerHTML = parts.join(' <span class="profile__meta-dot">·</span> ');
      }
    }

    // Social links — inside hero-info
    const socials: {name: string; url: string}[] = [];
    if (profile.vk_page) socials.push({ name: 'VK', url: `https://vk.com/${profile.vk_page}` });
    if (profile.tg_page) socials.push({ name: 'Telegram', url: `https://t.me/${profile.tg_page}` });
    if (profile.inst_page) socials.push({ name: 'Instagram', url: `https://instagram.com/${profile.inst_page}` });
    if (profile.tt_page) socials.push({ name: 'TikTok', url: `https://tiktok.com/@${profile.tt_page}` });
    if (profile.discord_page) socials.push({ name: 'Discord', url: '#' });
    if (socials.length) {
      const socialsEl = wrap.querySelector('.profile__socials') as HTMLElement;
      if (socialsEl) {
        socialsEl.hidden = false;
        socialsEl.innerHTML = socials.map(s =>
          `<a class="profile__social-link" href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.name)}</a>`
        ).join('');
      }
    }

    // Stats
    const statsGrid = wrap.querySelector('.profile__stats-grid') as HTMLElement;
    if (statsGrid) {
      const w = profile.watching_count ?? 0;
      const p_ = profile.plan_count ?? 0;
      const c = profile.completed_count ?? 0;
      const h = profile.hold_on_count ?? 0;
      const d = profile.dropped_count ?? 0;
      const f = profile.favorite_count ?? 0;
      const total = w + p_ + c + h + d;
      const stats = [
        { label: 'Смотрю', value: w, color: '#3b82f6' },
        { label: 'В планах', value: p_, color: '#a855f7' },
        { label: 'Просмотрено', value: c, color: '#22c55e' },
        { label: 'Отложено', value: h, color: '#f59e0b' },
        { label: 'Брошено', value: d, color: '#ef4444' },
        { label: 'Избранное', value: f, color: '#e35689' },
      ];
      statsGrid.hidden = false;
      const barParts = stats.slice(0, 5).filter(s => s.value > 0).map(s => {
        const pct = total > 0 ? ((s.value / total) * 100) : 0;
        return `<div class="profile__bar-seg" style="width:${pct}%;background:${s.color}" title="${s.label}: ${s.value}"></div>`;
      }).join('');
      statsGrid.innerHTML = `
        <div class="profile__stats-bar">${barParts}</div>
        <div class="profile__stats-items">
          ${stats.map(s => `
            <div class="profile__stat-item">
              <span class="profile__stat-dot" style="background:${s.color}"></span>
              <span class="profile__stat-label">${s.label}</span>
              <strong class="profile__stat-value">${s.value}</strong>
            </div>
          `).join('')}
        </div>
      `;
    }

    // Watch info
    const watchInfoSection = wrap.querySelector('.profile__section--watch-info') as HTMLElement;
    const watchInfoEl = wrap.querySelector('.profile__watch-info') as HTMLElement;
    if (watchInfoEl && (profile.watched_episode_count || profile.watched_time)) {
      watchInfoSection.hidden = false;
      const parts: string[] = [];
      if (profile.watched_episode_count) parts.push(`<div class="profile__wi"><span class="profile__wi-val">${profile.watched_episode_count}</span><span class="profile__wi-label">серий просмотрено</span></div>`);
      if (profile.watched_time) parts.push(`<div class="profile__wi"><span class="profile__wi-val">${fmtTime(profile.watched_time)}</span><span class="profile__wi-label">время просмотра</span></div>`);
      if (profile.comment_count) parts.push(`<div class="profile__wi"><span class="profile__wi-val">${profile.comment_count}</span><span class="profile__wi-label">комментариев</span></div>`);
      if (profile.friend_count) parts.push(`<div class="profile__wi"><span class="profile__wi-val">${profile.friend_count}</span><span class="profile__wi-label">друзей</span></div>`);
      watchInfoEl.innerHTML = parts.join('');
    }

    // Watch dynamics — osu!-style line chart
    const dynamics = profile.watch_dynamics as any[] | undefined;
    if (dynamics?.length) {
      const dynSection = wrap.querySelector('.profile__section--dynamics') as HTMLElement;
      const chartWrap = wrap.querySelector('.profile__chart-wrap') as HTMLElement;
      dynSection.hidden = false;
      requestAnimationFrame(() => buildLineChart(chartWrap, dynamics));
    }

    // Votes
    if (profile.votes?.length) {
      const votesSection = wrap.querySelector('.profile__section--votes') as HTMLElement;
      const votesList = wrap.querySelector('.profile__votes-list') as HTMLElement;
      votesSection.hidden = false;
      votesList.innerHTML = profile.votes.map((v: any) => renderProfileCard({
        id: v.id,
        image: v.image,
        title: v.title_ru || v.title_original || 'Без названия',
        stars: v.my_vote ?? undefined,
        meta: v.voted_at ? fmtRelativeShort(v.voted_at) : undefined,
      })).join('');
      bindCardClicks(votesList);
    }

    // History
    if (profile.history?.length) {
      const historySection = wrap.querySelector('.profile__section--history') as HTMLElement;
      const historyList = wrap.querySelector('.profile__history-list') as HTMLElement;
      historySection.hidden = false;
      historyList.innerHTML = profile.history.map((rel: any) => renderProfileCard({
        id: rel.id,
        image: rel.image,
        title: rel.title_ru || rel.title_original || 'Без названия',
        subtitle: rel.last_view_episode?.name,
        meta: rel.last_view_timestamp ? fmtRelativeShort(rel.last_view_timestamp) : undefined,
      })).join('');
      bindCardClicks(historyList);
    }

    // Friends — clickable
    if (profile.friend_count > 0 && profile.id && window.anixApi) {
      const friendsSection = wrap.querySelector('.profile__section--friends') as HTMLElement;
      const friendsList = wrap.querySelector('.profile__friends-list') as HTMLElement;
      window.anixApi.profile.getFriends(profile.id, 0).then((fData: any) => {
        const friends = (fData?.content ?? []) as any[];
        if (!friends.length) return;
        friendsSection.hidden = false;
        friendsList.innerHTML = friends.slice(0, 12).map((fr: any) => `
          <button type="button" class="profile__friend" data-friend-id="${fr.id}">
            <div class="profile__friend-avatar" ${fr.avatar ? `style="background-image:url('${esc(fr.avatar)}')"` : ''}></div>
            <span class="profile__friend-name">${esc(fr.login || '')}</span>
            ${fr.is_online ? '<span class="profile__friend-online"></span>' : ''}
          </button>
        `).join('');
        friendsList.querySelectorAll('[data-friend-id]').forEach(btn => {
          btn.addEventListener('click', () => {
            const fid = btn.getAttribute('data-friend-id');
            if (fid) navigate(`/profile/${fid}`);
          });
        });
      }).catch(() => {});
    }
  }).catch((err: unknown) => {
    console.error(err);
    const st = wrap.querySelector('.profile__status') as HTMLElement;
    if (st) st.textContent = `Ошибка: ${String(err)}`;
  });

  return wrap;
}
