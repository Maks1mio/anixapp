<script lang="ts">
  import { navigate } from '../../../../stores/navigation';
  import { fmtWatchedTime } from '../../_utils';
  import { profileShowcaseBackground } from '../../../../utils/profile-showcase-theme';
  import { toCdnProxyUrl } from '../../../../utils/posterUrl';

  interface Props {
    profile: Record<string, unknown>;
    profileId: number;
    isMyProfile: boolean;
    /** Показать ссылку «Узнать подробнее» (в панели профиля). */
    showMoreLink?: boolean;
    /** Число оценок (из preview API). Если не передано — подгрузится. */
    votesCount?: number;
    /** Без фонового showcase — нейтральная карточка панели */
    plain?: boolean;
  }

  let {
    profile,
    profileId,
    isMyProfile,
    showMoreLink = false,
    votesCount,
    plain = false,
  }: Props = $props();

  type ListTab = 'votes' | 'watching' | 'planned' | 'completed' | 'on_hold' | 'dropped';

  let loadedVotesCount = $state(0);

  $effect(() => {
    if (votesCount != null) {
      loadedVotesCount = votesCount;
      return;
    }
    if (!window.anixApi?.profile?.getVotedReleases || !profileId) {
      loadedVotesCount = 0;
      return;
    }
    let cancelled = false;
    void window.anixApi.profile
      .getVotedReleases(profileId, 0, 1)
      .then((data: { content?: unknown[]; total_count?: number }) => {
        if (cancelled) return;
        loadedVotesCount = Number(data?.total_count ?? data?.content?.length ?? 0);
      })
      .catch(() => {
        if (!cancelled) loadedVotesCount = 0;
      });
    return () => {
      cancelled = true;
    };
  });

  const showcaseBg = $derived(
    plain
      ? null
      : profileShowcaseBackground(profile, {
          backgroundUrlProxy: (url) => toCdnProxyUrl(url),
        }),
  );
  const showcaseStyle = $derived(showcaseBg ? `background:${showcaseBg}` : undefined);

  const statusItems = $derived([
    { label: 'Смотрю', value: Number(profile.watching_count ?? 0), color: '#22c55e', tab: 'watching' as ListTab },
    { label: 'В планах', value: Number(profile.plan_count ?? 0), color: '#a855f7', tab: 'planned' as ListTab },
    { label: 'Просмотрено', value: Number(profile.completed_count ?? 0), color: '#3b82f6', tab: 'completed' as ListTab },
    { label: 'Отложено', value: Number(profile.hold_on_count ?? 0), color: '#f59e0b', tab: 'on_hold' as ListTab },
    { label: 'Брошено', value: Number(profile.dropped_count ?? 0), color: '#ef4444', tab: 'dropped' as ListTab },
  ]);

  const listItems = $derived([
    { label: 'Оценки', value: loadedVotesCount, color: '#eab308', tab: 'votes' as ListTab },
    ...statusItems,
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
    // Плотное кольцо к центру — как в Anixart
    const r = 22, cx = 40, cy = 40, stroke = 28, c = 2 * Math.PI * r;
    const total = items.reduce((s, i) => s + i.value, 0);
    if (!total) return '';
    let acc = 0;
    const segs = items
      .filter((s) => s.value > 0)
      .map((s) => {
        const dash = (s.value / total) * c;
        const seg = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${s.color}" stroke-width="${stroke}"
          stroke-dasharray="${dash.toFixed(2)} ${(c - dash).toFixed(2)}"
          stroke-dashoffset="${(-acc).toFixed(2)}"
          transform="rotate(-90 ${cx} ${cy})"></circle>`;
        acc += dash;
        return seg;
      }).join('');
    return `<svg width="148" height="148" viewBox="0 0 80 80" class="profile-v2__donut" aria-hidden="true">
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--pp-donut-track)" stroke-width="${stroke}"></circle>
      ${segs}
    </svg>`;
  }

  // API: watched_time в минутах (35524 → «24 дня 16 часов»)
  const watchTimeLabel = $derived.by(() => {
    const min = Number(profile.watched_time ?? 0);
    if (!min) return '';
    return fmtWatchedTime(min);
  });

  const episodesLabel = $derived.by(() => {
    const n = Number(profile.watched_episode_count ?? 0);
    if (!n) return '';
    return n.toLocaleString('ru-RU');
  });

  function bookmarksPath(tab: ListTab): string {
    if (isMyProfile) return `/bookmarks?tab=${tab}`;
    return `/bookmarks?tab=${tab}&user=${profileId}`;
  }

  function openList(tab: ListTab) {
    navigate(bookmarksPath(tab));
  }

  function openFullStats() {
    navigate(bookmarksPath('votes'));
  }
</script>

<div
  class="profile-v2__stats"
  class:profile-v2__stats--themed={!!showcaseBg}
  style={showcaseStyle}
>
  <div class="profile-v2__stats-main">
    <div class="profile-v2__stats-list">
      {#each listItems as s}
        <button
          type="button"
          class="profile-v2__stat-row profile-v2__stat-row--btn"
          disabled={s.value <= 0}
          onclick={() => openList(s.tab)}
        >
          <span class="profile-v2__stat-dot" style="background:{s.color}"></span>
          <span class="profile-v2__stat-inline">
            <span class="profile-v2__stat-label">{s.label}</span>
            <span class="profile-v2__stat-value">{s.value.toLocaleString('ru-RU')}</span>
          </span>
        </button>
      {/each}
    </div>

    <div class="profile-v2__stats-chart">
      {@html buildDonutChart(statusItems)}
    </div>
  </div>

  {#if preferredBlocks.length}
    <div class="profile-v2__prefs">
      {#each preferredBlocks as block}
        <p class="profile-v2__pref-line"><span>{block.label}:</span> {block.text}</p>
      {/each}
    </div>
  {/if}

  {#if episodesLabel || watchTimeLabel}
    <div class="profile-v2__stats-totals">
      {#if episodesLabel}
        <p><span class="profile-v2__stats-totals-label">Просмотрено серий:</span> <strong>{episodesLabel}</strong></p>
      {/if}
      {#if watchTimeLabel}
        <p><span class="profile-v2__stats-totals-label">Время просмотра:</span> <strong>~ {watchTimeLabel}</strong></p>
      {/if}
    </div>
  {/if}

  {#if showMoreLink}
    <button type="button" class="profile-v2__stats-more" onclick={openFullStats}>
      Узнать подробнее
    </button>
  {/if}
</div>
