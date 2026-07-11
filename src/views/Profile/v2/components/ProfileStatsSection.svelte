<script lang="ts">
  import { navigate } from '../../../../stores/navigation';
  import { fmtTime } from '../../_utils';

  interface Props {
    profile: Record<string, unknown>;
    profileId: number;
    isMyProfile: boolean;
  }

  let { profile, profileId, isMyProfile }: Props = $props();

  const statsItems = $derived([
    { label: 'Смотрю', value: Number(profile.watching_count ?? 0), color: '#22c55e', status: 1 },
    { label: 'В планах', value: Number(profile.plan_count ?? 0), color: '#a855f7', status: 2 },
    { label: 'Просмотрено', value: Number(profile.completed_count ?? 0), color: '#3b82f6', status: 3 },
    { label: 'Отложено', value: Number(profile.hold_on_count ?? 0), color: '#f59e0b', status: 4 },
    { label: 'Брошено', value: Number(profile.dropped_count ?? 0), color: '#ef4444', status: 5 },
  ]);

  const preferredBlocks = $derived.by(() => {
    type Pref = { name?: string; percentage?: number; percent?: number };
    const blocks: { label: string; text: string }[] = [];
    const fmt = (items: Pref[] | undefined, label: string) => {
      if (!items?.length) return;
      const text = items
        .slice(0, 3)
        .map((g) => `${g.name ?? ''} ${Math.round(Number(g.percentage ?? g.percent ?? 0))}%`)
        .filter((s) => s.trim())
        .join(', ');
      if (text) blocks.push({ label, text });
    };
    fmt(profile.preferred_genres as Pref[] | undefined, 'Жанры');
    fmt(profile.preferred_audiences as Pref[] | undefined, 'Аудитория');
    fmt(profile.preferred_themes as Pref[] | undefined, 'Тематика');
    return blocks;
  });

  function buildDonutChart(items: { value: number; color: string }[]): string {
    const r = 34, cx = 40, cy = 40, c = 2 * Math.PI * r;
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
      }).join('');
    return `<svg width="160" height="160" viewBox="0 0 80 80" class="profile-v2__donut" aria-hidden="true">
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#2a2a2a" stroke-width="10"></circle>
      ${segs}
      <text x="${cx}" y="${cy - 1}" text-anchor="middle" dominant-baseline="middle" font-size="11" font-weight="700" fill="#9ca3af">${total}</text>
      <text x="${cx}" y="${cy + 10}" text-anchor="middle" dominant-baseline="middle" font-size="6.5" font-weight="600" fill="#6b7280">аниме</text>
    </svg>`;
  }

  const watchTimeLabel = $derived(
    profile.watched_time ? fmtTime(Number(profile.watched_time)) : '',
  );

  function openList(status: number) {
    if (isMyProfile) {
      navigate(`/bookmarks`);
      return;
    }
    navigate(`/profile/${profileId}/lists?status=${status}`);
  }
</script>

<div class="profile-v2__stats">
  <div class="profile-v2__stats-main">
    <div class="profile-v2__stats-list">
      {#each statsItems as s}
        <button
          type="button"
          class="profile-v2__stat-row profile-v2__stat-row--btn"
          disabled={s.value <= 0}
          onclick={() => openList(s.status)}
        >
          <span class="profile-v2__stat-dot" style="background:{s.color}"></span>
          <span class="profile-v2__stat-label">{s.label}</span>
          <span class="profile-v2__stat-value">{s.value}</span>
        </button>
      {/each}

      {#each preferredBlocks as block}
        <p class="profile-v2__pref-line"><span>{block.label}:</span> {block.text}</p>
      {/each}
    </div>

    <div class="profile-v2__stats-chart">
      {@html buildDonutChart(statsItems)}
    </div>
  </div>

  {#if !profile.is_counts_hidden && (profile.watched_episode_count || watchTimeLabel)}
    <div class="profile-v2__stats-totals">
      {#if profile.watched_episode_count}
        <p>Просмотрено серий: <strong>{profile.watched_episode_count}</strong></p>
      {/if}
      {#if watchTimeLabel}
        <p>Время просмотра: <strong>~ {watchTimeLabel}</strong></p>
      {/if}
    </div>
  {/if}
</div>
