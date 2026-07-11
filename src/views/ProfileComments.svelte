<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { navigate } from '../stores/navigation';
  import Tabs from '../components/Tabs.svelte';
  import UserAvatar from '../components/UserAvatar.svelte';
  import { iconChevronRight } from '../components/icons';
  import { buildPosterUrl } from '../utils/posterUrl';
  import { resolveJacksonRefs } from '../utils/jackson-refs';
  import {
    formatCommentTimestamp,
    isCommentContentHidden,
    mapProfileCommentPreview,
    type ProfileCommentPreviewItem,
  } from '../utils/comment';
  import { setDiscordContext, refreshDiscordPresence } from '../services/discord-presence';

  interface Props { id?: number; }
  let { id }: Props = $props();

  const COMMENT_TABS = [
    { id: 'release', label: 'К релизам' },
    { id: 'collection', label: 'К коллекциям' },
    { id: 'article', label: 'К статьям' },
  ] as const;

  type CommentTabId = typeof COMMENT_TABS[number]['id'];

  let profileLogin = $state('Загрузка…');
  let profileAvatar = $state('');
  let profileId = $state(0);
  let activeTab = $state<CommentTabId>('release');
  let items = $state<ProfileCommentPreviewItem[]>([]);
  let page = $state(0);
  let hasMore = $state(true);
  let isLoading = $state(false);
  let loadState = $state<'loading' | 'error' | 'empty' | 'ready'>('loading');
  let errorMsg = $state('');
  let jacksonRoot = $state<Record<string, unknown> | null>(null);
  let revealed = $state<Record<number, boolean>>({});
  let wrapEl: HTMLElement | undefined = $state();

  let scrollEl: HTMLElement | null = null;
  let scrollListener: (() => void) | null = null;

  async function resolveProfile() {
    if (id) {
      profileId = id;
      const info = resolveJacksonRefs(
        await window.anixApi!.profile.info(id) as Record<string, unknown>,
      );
      jacksonRoot = info;
      const p = info?.profile as { login?: string; avatar?: string } | undefined;
      profileLogin = p?.login ?? '';
      profileAvatar = p?.avatar ?? '';
      return;
    }
    const self = resolveJacksonRefs(
      await window.anixApi!.profile.self() as Record<string, unknown>,
    );
    jacksonRoot = self;
    const p = self?.profile as { id?: number; login?: string; avatar?: string } | undefined;
    profileId = p?.id ?? 0;
    profileLogin = p?.login ?? '';
    profileAvatar = p?.avatar ?? '';
  }

  async function fetchPage(tab: CommentTabId, pageNum: number) {
    const api = window.anixApi!.profile;
    if (tab === 'release') return api.getReleaseComments(profileId, pageNum);
    if (tab === 'collection') return api.getCollectionComments(profileId, pageNum);
    return api.getArticleComments(profileId, pageNum);
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
    try {
      const data = resolveJacksonRefs(
        await fetchPage(activeTab, pageToLoad) as Record<string, unknown>,
      );
      const content = (data?.content ?? []) as Record<string, unknown>[];
      if (!content.length) {
        if (!append) loadState = 'empty';
        hasMore = false;
        return;
      }
      const mapped = content
        .map((raw) => mapProfileCommentPreview(
          { ...raw, comment_type: activeTab },
          jacksonRoot ?? undefined,
        ))
        .filter((item): item is ProfileCommentPreviewItem => item != null);
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
    activeTab = tabId as CommentTabId;
    revealed = {};
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

<div class="view view-search view-profile-comments" bind:this={wrapEl}>
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

    <Tabs tabs={[...COMMENT_TABS]} activeId={activeTab} onChange={onTabChange} />

    <div class="search-page__results">
      {#if loadState === 'loading'}
        <div class="search-page__loading">Загрузка…</div>
      {:else if loadState === 'error'}
        <p class="search-page__error">Ошибка: {errorMsg}</p>
      {:else if loadState === 'empty'}
        <p class="search-page__empty">Комментариев нет</p>
      {:else}
        <div class="overview-comments-week">
          {#each items as item (item.id)}
            {@const hidden = isCommentContentHidden(
              { isSpoiler: item.isSpoiler, isDeleted: false, voteCount: item.voteCount },
              !!revealed[item.id],
            )}
            <article class="overview-comment-week">
              <div class="overview-comment-week__bubble">
                <UserAvatar src={item.profileAvatar} label={item.profileLogin} class="overview-comment-week__avatar" />
                <div class="overview-comment-week__main">
                  <div class="overview-comment-week__head">
                    <span class="overview-comment-week__login">{item.profileLogin}</span>
                    <span class="overview-comment-week__to">{item.contextLabel}</span>
                  </div>
                  {#if item.targetPath}
                    <button type="button" class="overview-comment-week__release" onclick={() => navigate(item.targetPath!)}>
                      <span>{item.targetTitle}</span>
                      {@html iconChevronRight(16)}
                    </button>
                  {:else}
                    <p class="overview-comment-week__release overview-comment-week__release--plain">{item.targetTitle}</p>
                  {/if}
                  {#if hidden}
                    <button type="button" class="overview-comment-week__spoiler" onclick={() => { revealed = { ...revealed, [item.id]: true }; }}>
                      Комментарий может содержать спойлер. Нажмите, чтобы прочитать
                    </button>
                  {:else}
                    {#if item.message}
                      <p class="overview-comment-week__message">{item.message}</p>
                    {/if}
                  {/if}
                  <div class="overview-comment-week__foot">
                    {#if item.timestamp}
                      <time>{formatCommentTimestamp(item.timestamp)}</time>
                    {/if}
                    <span class="overview-comment-week__votes">{item.voteCount}</span>
                  </div>
                </div>
              </div>
            </article>
          {/each}
        </div>
      {/if}
      {#if isLoading && loadState === 'ready'}
        <div class="search-page__loading">Загрузка…</div>
      {/if}
    </div>
  </div>
</div>
