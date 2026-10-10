<script lang="ts">
  /**
   * Профиль на Android (как в Anixart): вкладки-чипы «Статистика / Оценки релизов / Коллекции /
   * Комментарии / Видео» с превью первых записей и «Показать все». Данные вкладок грузятся лениво.
   */
  import { navigate } from '../stores/navigation';
  import { closeProfilePanel } from '../stores/profile-panel';
  import { formatHistoryViewTime } from '../utils/historyFormat';
  import { formatCommentTimestamp } from '../utils/comment';
  import { resolveJacksonRefs } from '../utils/jackson-refs';
  import { toCdnProxyUrl } from '../utils/posterUrl';
  import PosterImage from './PosterImage.svelte';
  import ProfileStatsSection from '../views/Profile/v2/components/ProfileStatsSection.svelte';
  import { iconStar, iconCopy, iconMessageCircle, iconPlay } from './icons';

  interface Props {
    userId: number;
    profile: Record<string, unknown>;
    isMyProfile: boolean;
    statsHidden: boolean;
  }
  let { userId, profile, isMyProfile, statsHidden }: Props = $props();

  /** Столбиковая диаграмма (как у вкладки «Статистика» в Anixart). */
  const iconStats = (size: number) =>
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 20v-6"/><path d="M12 20V4"/><path d="M18 20v-10"/></svg>`;

  type TabId = 'stats' | 'votes' | 'collections' | 'comments' | 'videos';
  const TABS: { id: TabId; label: string; icon: (s: number) => string; all: (id: number) => string }[] = [
    { id: 'stats', label: 'Статистика', icon: iconStats, all: (id) => `/profile/${id}/votes` },
    { id: 'votes', label: 'Оценки релизов', icon: iconStar, all: (id) => `/profile/${id}/votes` },
    { id: 'collections', label: 'Коллекции', icon: iconCopy, all: (id) => `/profile/${id}/collections` },
    { id: 'comments', label: 'Комментарии', icon: iconMessageCircle, all: (id) => `/profile/${id}/comments` },
    { id: 'videos', label: 'Видео', icon: iconPlay, all: (id) => `/profile/${id}/videos` },
  ];
  const PREVIEW = 5;

  let tab = $state<TabId>(statsHidden ? 'votes' : 'stats');
  let items = $state<Record<TabId, Record<string, unknown>[] | null>>({
    stats: [], votes: null, collections: null, comments: null, videos: null,
  });
  let failed = $state<Record<string, boolean>>({});

  async function load(t: TabId) {
    if (t === 'stats' || items[t] !== null || !window.anixApi) return;
    try {
      const api = window.anixApi;
      let data: Record<string, unknown> | null = null;
      if (t === 'votes') data = await api.profile.getVotedReleases(userId, 0, 1);
      else if (t === 'collections') data = await api.collection.profileCollections(userId, 0) as Record<string, unknown>;
      else if (t === 'comments') data = resolveJacksonRefs(await api.profile.getReleaseComments(userId, 0) as Record<string, unknown>);
      else if (t === 'videos') data = await api.profile.getFavoriteVideos(userId, 0) as Record<string, unknown>;
      items = { ...items, [t]: ((data?.content ?? []) as Record<string, unknown>[]).slice(0, PREVIEW) };
    } catch {
      failed = { ...failed, [t]: true };
      items = { ...items, [t]: [] };
    }
  }

  $effect(() => {
    void load(tab);
  });

  function go(path: string) {
    closeProfilePanel();
    navigate(path);
  }

  function poster(raw: Record<string, unknown> | undefined): string {
    const v = raw?.image ?? raw?.poster ?? '';
    return typeof v === 'string' ? v : '';
  }

  function stars(n: unknown): number {
    const v = Number(n);
    return Number.isFinite(v) ? Math.max(0, Math.min(5, Math.round(v))) : 0;
  }

  function avatar(p: unknown): string {
    const a = (p as { avatar?: string } | undefined)?.avatar;
    return a ? toCdnProxyUrl(a) : '';
  }
</script>

<div class="m-ptabs">
  <div class="m-ptabs__bar" role="tablist" aria-label="Разделы профиля">
    {#each TABS as t (t.id)}
      {#if !(t.id === 'stats' && statsHidden)}
        <button
          type="button"
          role="tab"
          class="m-ptabs__chip"
          class:m-ptabs__chip--on={tab === t.id}
          aria-selected={tab === t.id}
          onclick={() => (tab = t.id)}
        >
          {@html t.icon(18)}
          <span>{t.label}</span>
        </button>
      {/if}
    {/each}
  </div>

  <div class="m-ptabs__body" role="tabpanel">
    {#if tab === 'stats'}
      <ProfileStatsSection {profile} profileId={userId} {isMyProfile} showMoreLink plain />
    {:else if items[tab] === null}
      <p class="m-ptabs__empty">Загрузка…</p>
    {:else if !items[tab]?.length}
      <p class="m-ptabs__empty">{failed[tab] ? 'Не удалось загрузить' : 'Нет данных для отображения'}</p>
    {:else}
      {#if tab === 'votes'}
        {#each items.votes ?? [] as r (r.id)}
          <button type="button" class="m-ptabs__row" onclick={() => go(`/release/${r.id}`)}>
            <span class="m-ptabs__poster"><PosterImage src={poster(r)} alt="" thumb="cardVertical" /></span>
            <span class="m-ptabs__text">
              <span class="m-ptabs__title">{r.title_ru ?? r.title_original ?? ''}</span>
              <span class="m-ptabs__meta">
                <span class="m-ptabs__stars" aria-label={`Оценка ${stars(r.my_vote)} из 5`}>
                  {#each [1, 2, 3, 4, 5] as n (n)}
                    <span class="m-ptabs__star" class:m-ptabs__star--on={n <= stars(r.my_vote)}>{@html iconStar(16, n <= stars(r.my_vote))}</span>
                  {/each}
                </span>
                {#if r.voted_at}<span aria-hidden="true">•</span><span>{formatHistoryViewTime(Number(r.voted_at))}</span>{/if}
              </span>
            </span>
          </button>
        {/each}
      {:else if tab === 'comments'}
        {#each items.comments ?? [] as c (c.id)}
          {@const rel = (c.release ?? {}) as Record<string, unknown>}
          <button type="button" class="m-ptabs__comment" onclick={() => rel.id && go(`/release/${rel.id}`)}>
            <span class="m-ptabs__c-head">
              <span class="m-ptabs__avatar" style={avatar(c.profile) ? `background-image:url('${avatar(c.profile)}')` : undefined}></span>
              <span class="m-ptabs__c-who">
                <span class="m-ptabs__c-login">{(c.profile as { login?: string } | undefined)?.login ?? ''} <span class="m-ptabs__c-to">к релизу</span></span>
                <span class="m-ptabs__c-release">{rel.title_ru ?? rel.title_original ?? ''}</span>
              </span>
            </span>
            <span class="m-ptabs__c-text">{c.message ?? ''}</span>
            <span class="m-ptabs__c-foot">
              <span>{formatCommentTimestamp(Number(c.timestamp ?? 0))}</span>
              {#if Number(c.likes_count ?? c.vote_count ?? 0)}<span class="m-ptabs__c-likes">{c.likes_count ?? c.vote_count}</span>{/if}
            </span>
          </button>
        {/each}
      {:else if tab === 'collections'}
        {#each items.collections ?? [] as col (col.id)}
          <button type="button" class="m-ptabs__row" onclick={() => go(`/collection/${col.id}`)}>
            <span class="m-ptabs__poster m-ptabs__poster--wide"><PosterImage src={poster(col)} alt="" /></span>
            <span class="m-ptabs__text">
              <span class="m-ptabs__title">{col.title ?? ''}</span>
              {#if col.description}<span class="m-ptabs__meta m-ptabs__meta--clamp">{col.description}</span>{/if}
            </span>
          </button>
        {/each}
      {:else if tab === 'videos'}
        {#each items.videos ?? [] as v (v.id)}
          <button type="button" class="m-ptabs__row" onclick={() => (v.release as { id?: number } | undefined)?.id && go(`/release/${(v.release as { id: number }).id}`)}>
            <span class="m-ptabs__poster m-ptabs__poster--wide"><PosterImage src={poster(v)} alt="" /></span>
            <span class="m-ptabs__text">
              <span class="m-ptabs__title">{v.title ?? ''}</span>
              {#if (v.release as { title_ru?: string } | undefined)?.title_ru}<span class="m-ptabs__meta">{(v.release as { title_ru: string }).title_ru}</span>{/if}
            </span>
          </button>
        {/each}
      {/if}
      <button type="button" class="m-ptabs__all" onclick={() => go(TABS.find((t) => t.id === tab)!.all(userId))}>Показать все</button>
    {/if}
  </div>
</div>
