<script lang="ts">
  import { onMount } from 'svelte';
  import TvPage from '../components/tv/TvPage.svelte';
  import TvHomeRow from '../components/tv/TvHomeRow.svelte';
  import TvRow from '../components/tv/TvRow.svelte';
  import TvShortcutTile from '../components/tv/TvShortcutTile.svelte';
  import UserAvatar from '../components/UserAvatar.svelte';
  import UiV2ContentRetryOverlay from '../components/uikit-v2/UiV2ContentRetryOverlay.svelte';
  import { iconBookmark, iconSettings } from '../components/icons';
  import { navigate } from '../stores/navigation';
  import { requireAuth, syncAuthStatus } from '../stores/auth';
  import { ensureProfileId } from '../utils/profile';
  import { resolveJacksonRefs } from '../utils/jackson-refs';
  import { fmtDate, fmtLastSeen, fmtWatchedTime, getProfileBanNotice } from './Profile/_utils';
  import { hasProfilePrivacyRestrictions, isBlockedByProfile, PROFILE_BLOCKED_BY_USER_NOTICE, PROFILE_PRIVACY_NOTICE } from './Profile/v2/profile-privacy';
  import { toCdnProxyUrl } from '../utils/posterUrl';
  import { mapReleaseRawToCard } from '../utils/release-card';
  import { tvPosterThumbUrl } from '../platform/tv';
  import { attachTvHomeCarouselScroll } from '../tv/carouselScroll';
  import { mapWithConcurrency } from '../tv/homeRows';
  import { TV_BOOKMARK_ROW_LIMIT, fetchTvBookmarkPage, type TvBookmarkListId } from '../tv/bookmarkRows';
  import { headlineFromLoadError } from '../utils/content-load-error';
  import type { ReleaseCardData } from '../types/release';

  interface Props {
    /** Не задан — свой профиль. */
    userId?: number;
  }

  let { userId }: Props = $props();

  type RowStatus = 'loading' | 'ready' | 'empty' | 'error';
  interface ListRow {
    id: TvBookmarkListId;
    label: string;
    items: ReleaseCardData[];
    status: RowStatus;
  }
  interface Friend {
    id: number;
    login: string;
    avatar: string | null;
    online: boolean;
  }

  const LIST_ROWS: { id: TvBookmarkListId; label: string; ownLabel: string }[] = [
    { id: 'watching', label: 'Смотрит', ownLabel: 'Смотрю' },
    { id: 'planned', label: 'В планах', ownLabel: 'В планах' },
    { id: 'completed', label: 'Просмотрено', ownLabel: 'Просмотрено' },
    { id: 'votes', label: 'Оценки', ownLabel: 'Мои оценки' },
  ];

  let profileId = $state<number | null>(null);
  let profile = $state<Record<string, unknown> | null>(null);
  let isMine = $state(false);
  let loadState = $state<'loading' | 'error' | 'guest' | 'ready'>('loading');
  let errorMsg = $state('');
  let rows = $state<ListRow[]>([]);
  let friends = $state<Friend[]>([]);
  let friendsStatus = $state<RowStatus>('loading');
  let coverUrl = $state('');

  const login = $derived(String(profile?.login ?? ''));
  const avatar = $derived(typeof profile?.avatar === 'string' ? tvPosterThumbUrl(profile.avatar) ?? profile.avatar : null);
  const status = $derived(typeof profile?.status === 'string' ? profile.status.trim() : '');
  const activity = $derived.by(() => {
    if (!profile) return '';
    if (profile.is_online) return 'в сети';
    const ts = Number(profile.last_activity_time ?? 0);
    return ts ? fmtLastSeen(ts) : '';
  });
  const rating = $derived(profile?.rating_score == null ? null : Number(profile.rating_score));
  const registered = $derived.by(() => {
    const ts = Number(profile?.register_date ?? 0);
    return ts ? `на проекте с ${fmtDate(ts)}` : '';
  });
  const roles = $derived(
    Array.isArray(profile?.roles) ? (profile.roles as { name?: string; color?: string }[]).filter((r) => r?.name) : [],
  );
  const blockedByUser = $derived(isBlockedByProfile(profile));
  const notice = $derived.by(() => {
    if (!profile) return '';
    if (blockedByUser) return PROFILE_BLOCKED_BY_USER_NOTICE;
    return getProfileBanNotice(profile) || (hasProfilePrivacyRestrictions(profile, isMine) ? PROFILE_PRIVACY_NOTICE : '');
  });
  const history = $derived.by((): ReleaseCardData[] => {
    if (!profile || statsHidden || !Array.isArray(profile.history)) return [];
    return (profile.history as Record<string, unknown>[])
      .filter((r) => r && typeof r === 'object' && Number(r.id) > 0)
      .map((r) => mapReleaseRawToCard(r));
  });
  const statsHidden = $derived(!!profile?.is_stats_hidden && !isMine);
  const stats = $derived.by(() => {
    if (!profile || statsHidden) return [];
    const n = (key: string) => Number(profile?.[key] ?? 0);
    const out = [
      { label: 'Смотрю', value: n('watching_count'), list: 'watching' },
      { label: 'В планах', value: n('plan_count'), list: 'planned' },
      { label: 'Просмотрено', value: n('completed_count'), list: 'completed' },
      { label: 'Отложено', value: n('hold_on_count'), list: 'on_hold' },
      { label: 'Брошено', value: n('dropped_count'), list: 'dropped' },
    ];
    return out.map((s) => ({ ...s, text: s.value.toLocaleString('ru-RU') }));
  });
  const watchFacts = $derived.by(() => {
    if (!profile || statsHidden) return '';
    const time = fmtWatchedTime(Number(profile.watched_time ?? 0));
    const eps = Number(profile.watched_episode_count ?? 0);
    return [time ? `${time} за просмотром` : '', eps ? `${eps.toLocaleString('ru-RU')} эпизодов` : '']
      .filter(Boolean)
      .join(' · ');
  });

  async function resolveId(): Promise<number | null> {
    if (userId && userId > 0) return userId;
    const authed = await syncAuthStatus();
    if (!authed) return null;
    const id = Number(await ensureProfileId() ?? 0);
    return id > 0 ? id : null;
  }

  async function load() {
    loadState = 'loading';
    try {
      const id = await resolveId();
      if (!id) {
        loadState = 'guest';
        return;
      }
      profileId = id;
      const [info, self] = await Promise.all([
        window.anixApi.profile.info(id) as Promise<Record<string, unknown>>,
        window.anixApi.profile.self().catch(() => null) as Promise<Record<string, unknown> | null>,
      ]);
      const resolved = resolveJacksonRefs(info) as Record<string, unknown>;
      const p = resolved.profile as Record<string, unknown> | undefined;
      if (!p) {
        errorMsg = 'Профиль не найден';
        loadState = 'error';
        return;
      }
      profile = p;
      const selfId = Number((self?.profile as { id?: number } | undefined)?.id ?? 0);
      isMine = !!info.is_my_profile || (selfId > 0 && selfId === Number(p.id));
      loadState = 'ready';
      void loadCover(id);
      if (isBlockedByProfile(p)) return;
      void loadRows(id);
      void loadFriends(id);
    } catch (err) {
      errorMsg = headlineFromLoadError(err);
      loadState = 'error';
    }
  }

  async function loadCover(id: number) {
    coverUrl = '';
    try {
      const res = (await window.anixApi?.channel?.getBlog?.(id)) as { channel?: { cover?: string } } | undefined;
      coverUrl = res?.channel?.cover ? toCdnProxyUrl(res.channel.cover) : '';
    } catch {
      coverUrl = '';
    }
  }

  async function loadRows(id: number) {
    rows = LIST_ROWS.map((def) => ({
      id: def.id,
      label: isMine ? def.ownLabel : def.label,
      items: [],
      status: 'loading' as RowStatus,
    }));
    await mapWithConcurrency(LIST_ROWS, 2, async (def) => {
      try {
        const page = await fetchTvBookmarkPage(def.id, 0, isMine ? undefined : id);
        const items = page.items.slice(0, TV_BOOKMARK_ROW_LIMIT);
        rows = rows.map((row) => (row.id === def.id ? { ...row, items, status: items.length ? 'ready' : 'empty' } : row));
      } catch {
        rows = rows.map((row) => (row.id === def.id ? { ...row, status: 'empty' } : row));
      }
      return def.id;
    });
  }

  async function loadFriends(id: number) {
    friendsStatus = 'loading';
    if (profile?.is_counts_hidden && !isMine) {
      friendsStatus = 'empty';
      return;
    }
    try {
      const data = (await window.anixApi.profile.getFriends(id, 0)) as { content?: Record<string, unknown>[] };
      friends = (data?.content ?? [])
        .map((raw) => ({
          id: Number(raw.id ?? 0),
          login: String(raw.login ?? ''),
          avatar: typeof raw.avatar === 'string' ? tvPosterThumbUrl(raw.avatar) ?? raw.avatar : null,
          online: !!raw.is_online,
        }))
        .filter((f) => f.id > 0);
      friendsStatus = friends.length ? 'ready' : 'empty';
    } catch {
      friendsStatus = 'empty';
    }
  }

  function openList(list: string) {
    navigate(`/bookmarks/${list}`);
  }

  onMount(() => {
    const detachCarouselScroll = attachTvHomeCarouselScroll();
    void load();
    const onAuthChanged = () => {
      if (!userId) void load();
    };
    window.addEventListener('anix:authChanged', onAuthChanged);
    return () => {
      detachCarouselScroll();
      window.removeEventListener('anix:authChanged', onAuthChanged);
    };
  });
</script>

<TvPage title={login || 'Профиль'} hideHead>
  <div class="tv-home tv-profile">
    <section class="tv-home__stage" aria-label="Профиль">
      <div class="tv-home__rails" data-tv-home-rails>
        {#if loadState === 'guest'}
          <div class="tv-bookmarks__empty">
            <h1 class="tv-bookmarks__empty-title">Профиль</h1>
            <p class="tv-bookmarks__empty-text">Войдите в аккаунт, чтобы видеть свой профиль, списки и друзей.</p>
            <button type="button" class="tv-bookmarks__login" onclick={() => { if (requireAuth()) void load(); }}>Войти</button>
          </div>
        {:else if loadState === 'error'}
          <div class="tv-overview__error">
            <UiV2ContentRetryOverlay message={errorMsg} onRetry={() => void load()} />
          </div>
        {:else}
          <div class="tv-home__rows">
            <section class="tv-home-row tv-profile__hero" aria-label="Профиль" data-tv-home-row data-tv-home-row-id="profile-hero">
              {#if coverUrl}<div class="tv-profile__cover" style={`background-image:url('${coverUrl}')`} aria-hidden="true"></div>{/if}
              <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
              <div
                class="tv-profile__head"
                class:tv-profile__head--loading={loadState === 'loading'}
                tabindex={loadState === 'ready' && stats.length === 0 && !isMine ? 0 : undefined}
              >
                <span class="tv-profile__avatar" class:tv-profile__avatar--online={!!profile?.is_online}>
                  <UserAvatar src={avatar} label={login || '?'} />
                </span>
                <div class="tv-profile__info">
                  <h1 class="tv-profile__login">{login || ' '}</h1>
                  {#if status}<p class="tv-profile__status">{status}</p>{/if}
                  {#if rating != null || activity || registered}
                    <p class="tv-profile__facts">
                      {#if rating != null}<span class="tv-profile__rating" class:tv-profile__rating--zero={rating === 0} class:tv-profile__rating--negative={rating < 0}>{String(rating).replace('-', '–')}</span>{/if}
                      {[activity, registered].filter(Boolean).join(' · ')}
                    </p>
                  {/if}
                  {#if watchFacts}<p class="tv-profile__facts">{watchFacts}</p>{/if}
                  {#if roles.length}
                    <div class="tv-profile__roles">
                      {#each roles as role}<span class="tv-profile__role" style={`color:${role.color || '#888'}`}>{role.name}</span>{/each}
                    </div>
                  {/if}
                  {#if notice}<p class="tv-profile__notice">{notice}</p>{/if}
                </div>
              </div>

              {#if loadState === 'ready'}
                <div class="tv-profile__bar">
                  {#each stats as stat, i (stat.list)}
                    {#if isMine}
                      <button type="button" class="tv-profile__stat" data-tv-autofocus={i === 0 || undefined} onclick={() => openList(stat.list)}>
                        <span class="tv-profile__stat-value">{stat.text}</span>
                        <span class="tv-profile__stat-label">{stat.label}</span>
                      </button>
                    {:else}
                      <!-- Фокус без действия: иначе шапку чужого профиля не увидеть с пульта. -->
                      <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
                      <div class="tv-profile__stat tv-profile__stat--static" tabindex="0" data-tv-autofocus={i === 0 || undefined}>
                        <span class="tv-profile__stat-value">{stat.text}</span>
                        <span class="tv-profile__stat-label">{stat.label}</span>
                      </div>
                    {/if}
                  {/each}
                  {#if isMine}
                    <button type="button" class="tv-action" onclick={() => navigate('/bookmarks')}>
                      <span class="tv-action__icon" aria-hidden="true">{@html iconBookmark(26)}</span>
                      Закладки
                    </button>
                    <button type="button" class="tv-action" onclick={() => navigate('/settings')}>
                      <span class="tv-action__icon" aria-hidden="true">{@html iconSettings(26)}</span>
                      Настройки
                    </button>
                  {/if}
                </div>
              {/if}
            </section>

            {#if loadState === 'ready'}
              {#if history.length}
                <TvHomeRow label="Просмотрено недавно" tabId={`profile-${profileId}-history`} items={history} status="ready" />
              {/if}
              {#each rows.filter((row) => row.status !== 'empty') as row (row.id)}
                <TvHomeRow
                  label={row.label}
                  tabId={`profile-${profileId}-${row.id}`}
                  items={row.items}
                  status={row.status}
                  showSeeAll={isMine && row.status === 'ready'}
                  seeAllHref={`/bookmarks/${row.id}`}
                  seeAllText="Открыть весь список"
                  seeAllAt="end"
                />
              {/each}

              {#if friendsStatus !== 'empty' && !blockedByUser}
                <TvRow
                  id={`profile-${profileId}-friends`}
                  label="Друзья"
                  size="compact"
                  status={friendsStatus}
                  count={friends.length}
                  meta={profile?.friend_count ? Number(profile.friend_count).toLocaleString('ru-RU') : ''}
                >
                  {#each friends as friend (friend.id)}
                    <div class="uiv2-carousel__item">
                      <TvShortcutTile
                        title={friend.login || `id ${friend.id}`}
                        sub={friend.online ? 'в сети' : ''}
                        image={friend.avatar}
                        round
                        onclick={() => navigate(`/profile/${friend.id}`)}
                      />
                    </div>
                  {/each}
                </TvRow>
              {/if}
            {/if}
          </div>
        {/if}
      </div>
    </section>
  </div>
</TvPage>
