<script lang="ts">
  import { fmtTime, fmtDate } from '../../_utils';

  interface Props { profile: any; }
  let { profile }: Props = $props();

  const statsItems = $derived([
    { label: 'Смотрю',      value: profile.watching_count  ?? 0, color: '#3b82f6' },
    { label: 'В планах',    value: profile.plan_count      ?? 0, color: '#a855f7' },
    { label: 'Просмотрено', value: profile.completed_count ?? 0, color: '#22c55e' },
    { label: 'Отложено',    value: profile.hold_on_count   ?? 0, color: '#f59e0b' },
    { label: 'Брошено',     value: profile.dropped_count   ?? 0, color: '#ef4444' },
    { label: 'Избранное',   value: profile.favorite_count  ?? 0, color: '#e35689' },
  ]);

  const wiParts = $derived([
    profile.watched_episode_count ? { label: 'Серий',       val: String(profile.watched_episode_count) } : null,
    profile.watched_time          ? { label: 'Просмотра',    val: fmtTime(profile.watched_time) }        : null,
    profile.comment_count         ? { label: 'Комментариев', val: String(profile.comment_count) }        : null,
    profile.friend_count          ? { label: 'Друзей',       val: String(profile.friend_count) }         : null,
    profile.register_date         ? { label: 'Регистрация',  val: fmtDate(profile.register_date) }       : null,
  ].filter(Boolean) as { label: string; val: string }[]);

  function buildDonutChart(items: { label: string; value: number; color: string }[]): string {
    const r = 34, cx = 40, cy = 40, c = 2 * Math.PI * r;
    const total = items.reduce((s, i) => s + i.value, 0);
    if (!total) return '';
    let acc = 0;
    const segs = items
      .filter(s => s.value > 0)
      .map(s => {
        const dash = (s.value / total) * c;
        const seg = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${s.color}" stroke-width="10"
          stroke-dasharray="${dash.toFixed(2)} ${(c - dash).toFixed(2)}"
          stroke-dashoffset="${(-acc).toFixed(2)}"
          transform="rotate(-90 ${cx} ${cy})"></circle>`;
        acc += dash;
        return seg;
      }).join('');
    return `<svg width="148" height="148" viewBox="0 0 80 80" class="profile__donut">
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#1e1e1e" stroke-width="10"></circle>
      ${segs}
      <text x="${cx}" y="${cy - 1}" text-anchor="middle" dominant-baseline="middle" font-size="12" font-weight="700" fill="#737373">${total}</text>
      <text x="${cx}" y="${cy + 10}" text-anchor="middle" dominant-baseline="middle" font-size="7" font-weight="600" fill="#555">аниме</text>
    </svg>`;
  }
</script>

<section class="profile__section">
  <h2 class="profile__section-title">Статистика</h2>
  <div class="profile__stats-layout">
    <!-- Stat list -->
    <div class="profile__stats-items">
      {#each statsItems as s}
        <div class="profile__stat-item">
          <span class="profile__stat-dot" style="background:{s.color}"></span>
          <span class="profile__stat-lbl">{s.label}</span>
          <strong class="profile__stat-val">{s.value}</strong>
        </div>
      {/each}
    </div>

    <!-- Donut -->
    <div class="profile__donut-wrap">
      {@html buildDonutChart(statsItems)}
    </div>

    <!-- Watch info -->
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
