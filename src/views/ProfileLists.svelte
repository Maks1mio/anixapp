<script lang="ts">
  import ReleaseCardsGrid from '../components/ReleaseCardsGrid.svelte';
  import { onMount, onDestroy } from 'svelte';
  import { navigate } from '../stores/navigation';
  import { getSearchParams } from '../router';
  import Tabs from '../components/Tabs.svelte';
  import type { ReleaseCardData } from '../types/release';
  import { buildPosterUrl } from '../utils/posterUrl';
  import { setDiscordContext, refreshDiscordPresence } from '../services/discord-presence';

  interface Props { id?: number; }
  let { id }: Props = $props();

  const LIST_TABS = [
    { id: '1', label: 'Смотрю', type: 1 },
    { id: '2', label: 'В планах', type: 2 },
    { id: '3', label: 'Просмотрено', type: 3 },
    { id: '4', label: 'Отложено', type: 4 },
    { id: '5', label: 'Брошено', type: 5 },
  ] as const;

  let profileLogin = $state('Загрузка…');
  let profileAvatar = $state('');
  let profileId = $state(0);
  let activeTab = $state('1');
  let items = $state<ReleaseCardData[]>([]);
  let page = $state(0);
  let hasMore = $state(true);
  let isLoading = $state(false);
  let loadState = $state<'loading' | 'error' | 'empty' | 'ready'>('loading');
  let errorMsg = $state('');
  let wrapEl: HTMLElement | undefined = $state();

  let scrollEl: HTMLElement | null = null;
  let scrollListener: (() => void) | null = null;

  function mapRelease(raw: Record<string, unknown>): ReleaseCardData {
    const p = raw.poster as Record<string, { url?: string }> | undefined;
    const posterRaw = p?.original?.url ?? p?.medium?.url ?? p?.small?.url
      ?? (typeof raw.poster === 'string' ? raw.poster : undefined)
      ?? (typeof raw.image === 'string' ? raw.image : undefined);
    const poster = posterRaw ? buildPosterUrl(posterRaw) || undefined : undefined;
    let listStatus: ReleaseCardData['listStatus'];
    switch (raw.profile_list_status) {
      case 1: listStatus = 'watching'; break;
      case 2: listStatus = 'planned'; break;
      case 3: listStatus = 'completed'; break;
      case 4: listStatus = 'on_hold'; break;
      case 5: listStatus = 'dropped'; break;
    }
    return {
      id: raw.id as number | undefined,
      titleRu: (raw.title_ru ?? raw.title) as string | undefined,
      titleEn: raw.title_original as string | undefined,
      poster,
      rating: typeof raw.grade === 'number' ? raw.grade : undefined,
      voteCount: typeof raw.vote_count === 'number' ? raw.vote_count : undefined,
      episodesReleased: typeof raw.episodes_released === 'number' ? raw.episodes_released : undefined,
      episodesTotal: typeof raw.episodes_total === 'number' ? raw.episodes_total : undefined,
      year: raw.year ? String(raw.year) : undefined,
      status: (raw.status as { name?: string } | undefined)?.name,
      isFavorite: !!raw.is_favorite,
      listStatus,
      myVote: typeof raw.my_vote === 'number' && raw.my_vote > 0 ? raw.my_vote : undefined,
    };
  }

  async function resolveProfile() {
    if (id) {
      profileId = id;
      const info = await window.anixApi?.profile.info(id) as { profile?: { login?: string; avatar?: string } };
      profileLogin = info?.profile?.login ?? '';
      profileAvatar = info?.profile?.avatar ?? '';
      return;
    }
    const self = await window.anixApi?.profile.self?.() as { profile?: { id?: number; login?: string; avatar?: string } };
    profileId = self?.profile?.id ?? 0;
    profileLogin = self?.profile?.login ?? '';
    profileAvatar = self?.profile?.avatar ?? '';
  }

  async function load(append: boolean) {
    if (!window.anixApi || isLoading || (!hasMore && append) || !profileId) return;
    isLoading = true;
    if (!append) {
      loadState = 'loading';
      page = 0;
      hasMore = true;
      items = [];
    }
    const pageToLoad = page;
    const listType = Number(activeTab);
    try {
      const data = await window.anixApi.profile.getBookmarks(profileId, listType, pageToLoad) as {
        content?: Record<string, unknown>[];
        last?: boolean;
      };
      const content = data?.content ?? [];
      if (!content.length) {
        if (!append) loadState = 'empty';
        hasMore = false;
        return;
      }
      const mapped = content.map(mapRelease);
      items = append ? [...items, ...mapped] : mapped;
      page = pageToLoad + 1;
      if (data.last === true || content.length < 25) hasMore = false;
      loadState = 'ready';
    } catch (err) {
      errorMsg = String(err);
      if (!append) loadState = 'error';
    } finally {
      isLoading = false;
    }
  }

  function onTabChange(tabId: string) {
    if (tabId === activeTab) return;
    activeTab = tabId;
    void load(false);
  }

  function attachScroll() {
    const el = wrapEl?.closest('.page__scroll') as HTMLElement | null;
    if (!el) return;
    scrollEl = el;
    scrollListener = () => {
      if (!hasMore || isLoading) return;
      const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
      if (distance < 200) void load(true);
    };
    el.addEventListener('scroll', scrollListener);
  }

  onMount(async () => {
    const status = getSearchParams().get('status');
    if (status && LIST_TABS.some((t) => t.id === status)) activeTab = status;
    await resolveProfile();
    if (!profileId) {
      loadState = 'error';
      errorMsg = 'Не удалось определить профиль';
      return;
    }
    setDiscordContext({ profileLogin, profileAvatar, profileIsSelf: !id });
    refreshDiscordPresence();
    await load(false);
    attachScroll();
  });

  onDestroy(() => {
    if (scrollEl && scrollListener) scrollEl.removeEventListener('scroll', scrollListener);
  });
</script>

<div class="view view-search view-profile-lists" bind:this={wrapEl}>
  <div class="search-page">
    <div class="view-header">
      <button type="button" class="view-header__back" onclick={() => navigate(id ? `/profile/${profileId}` : '/profile')}>
        ← Назад
      </button>
      <div class="profile-more__user">
        <div class="profile-more__avatar" style={profileAvatar ? `background-image:url('${buildPosterUrl(profileAvatar)}')` : ''}></div>
        <h1 class="view-header__title">{profileLogin}</h1>
      </div>
    </div>

    <Tabs tabs={LIST_TABS.map((t) => ({ id: t.id, label: t.label }))} activeId={activeTab} onChange={onTabChange} />

    <div class="search-page__results">
      {#if loadState === 'loading'}
        <div class="search-page__loading">Загрузка…</div>
      {:else if loadState === 'error'}
        <p class="search-page__error">Ошибка: {errorMsg}</p>
      {:else if loadState === 'empty'}
        <p class="search-page__empty">Список пуст</p>
      {:else}
        <ReleaseCardsGrid items={items} />
      {/if}
      {#if isLoading && loadState === 'ready'}
        <div class="search-page__loading">Загрузка…</div>
      {/if}
    </div>
  </div>
</div>
