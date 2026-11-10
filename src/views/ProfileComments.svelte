<script lang="ts">
  import UiV2BackBar from '../components/uikit-v2/UiV2BackBar.svelte';
  import { onMount, onDestroy, untrack } from 'svelte';
  import { swipeTabs, type TabSwipeState } from '../actions/swipeTabs';
  import { isMobileMode } from '../platform/mobile';
  import TabPeek from '../components/TabPeek.svelte';
  import { createTabPrefetch, tabNeighbors, TAB_PEEK_ITEMS } from '../utils/tab-prefetch.svelte';
  import { navigate, goBack } from '../stores/navigation';
  import UiV2Tabs from '../components/uikit-v2/UiV2Tabs.svelte';
  import UiV2CommentThread, { type UiV2CommentNode } from '../components/uikit-v2/UiV2CommentThread.svelte';
  import type { UiV2CommentComposerPayload } from '../components/uikit-v2/UiV2CommentComposer.svelte';
  import { handleUserProfileClick } from '../stores/user-profile';
  import { requireAuth } from '../stores/auth';
  import {
    appendUiV2CommentReply,
    commentDataToUiV2Node,
    patchUiV2CommentNode,
    setUiV2CommentReplies,
    uiV2NodeToCommentData,
  } from '../utils/comment-v2';
  import { buildPosterUrl } from '../utils/posterUrl';
  import { resolveJacksonRefs, resolveJacksonRefsByKey } from '../utils/jackson-refs';

  /** Поля-ссылки в странице комментариев профиля: у каждого класса своя нумерация @id */
  const COMMENT_REF_KEYS = ['release', 'collection', 'article', 'channel', 'profile'] as const;
  import {
    apiVotePayload,
    buildReleaseCommentAddBody,
    mapProfileCommentPreview,
    normalizeComment,
    normalizeCommentsFromResponse,
    type ProfileCommentPreviewItem,
  } from '../utils/comment';
  import { setDiscordContext, refreshDiscordPresence } from '../services/discord-presence';
  import UiV2ContentRetryOverlay from '../components/uikit-v2/UiV2ContentRetryOverlay.svelte';
  import { headlineFromLoadError } from '../utils/content-load-error';
  import CommentsSortButton from '../components/comments/CommentsSortButton.svelte';
  import { COMMENT_SORT_DEFAULT, type CommentSort, type CommentVoteValue } from '../types/comment';

  interface Props {
    id?: number;
    /** Внутри модалки профиля на ПК: без своей шапки, прокрутка — у модалки */
    embedded?: boolean;
  }
  let { id, embedded = false }: Props = $props();

  const COMMENT_TABS = [
    { id: 'release', label: 'К релизам' },
    { id: 'collection', label: 'К коллекциям' },
    { id: 'article', label: 'К записям' },
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
  // Как в приложении: над списком «N всего» и сортировка, у каждой вкладки своя
  let sortByTab = $state<Record<CommentTabId, CommentSort>>({
    release: COMMENT_SORT_DEFAULT,
    collection: COMMENT_SORT_DEFAULT,
    article: COMMENT_SORT_DEFAULT,
  });
  let totalCount = $state(0);
  let jacksonRoot = $state<Record<string, unknown> | null>(null);
  /** Ветки, голоса и ответы поверх загруженных страниц: id комментария → узел */
  let patched = $state<Record<string, UiV2CommentNode>>({});
  let wrapEl: HTMLElement | undefined = $state();

  const selfId = Number((window as { __anixProfile?: { id?: number } }).__anixProfile?.id ?? 0) || null;

  /** Строка из ленты профиля → узел нового треда (подпись «к релизу / к коллекции / к статье» + название) */
  function toNode(item: ProfileCommentPreviewItem): UiV2CommentNode {
    return {
      id: item.id,
      message: item.message,
      timestamp: item.timestamp,
      voteCount: item.voteCount,
      userVote: item.userVote,
      isSpoiler: item.isSpoiler,
      replyCount: item.replyCount,
      profile: {
        id: item.profileId || profileId,
        login: item.profileLogin,
        avatar: item.profileAvatar,
        badgeUrl: item.profileBadgeUrl ?? null,
        badgeName: item.profileBadgeName ?? null,
      },
      releaseTitle: item.targetTitle,
      releaseHint: item.contextLabel,
    };
  }

  const commentTabs = $derived(
    COMMENT_TABS.map((t) => ({
      id: t.id,
      label: t.label,
      badge: t.id === activeTab && totalCount > 0 ? totalCount : undefined,
    })),
  );

  const nodes = $derived(items.map((item) => patched[String(item.id)] ?? toNode(item)));
  const itemById = $derived(new Map(items.map((item) => [String(item.id), item])));

  function setNodes(next: UiV2CommentNode[]) {
    const map: Record<string, UiV2CommentNode> = {};
    for (const n of next) map[String(n.id)] = n;
    patched = map;
  }

  /** Корневой комментарий ветки, в которой лежит узел */
  function rootOf(id: number | string): UiV2CommentNode | null {
    const has = (list: UiV2CommentNode[] | undefined): boolean =>
      !!list?.some((n) => n.id === id || has(n.replies));
    return nodes.find((n) => n.id === id || has(n.replies)) ?? null;
  }

  function openTarget(node: UiV2CommentNode) {
    const path = itemById.get(String(node.id))?.targetPath;
    if (path) navigate(path);
  }

  type CommentsApi = {
    replies: (commentId: number, page?: number, sort?: number) => Promise<unknown>;
    vote: (commentId: number, vote: number) => Promise<unknown>;
    add: (targetId: number, body: ReturnType<typeof buildReleaseCommentAddBody>) => Promise<unknown>;
  };

  /** Ответы, голоса и отправка — в API той сущности, к которой комментарий */
  function apiFor(tab: CommentTabId): CommentsApi | null {
    const a = window.anixApi;
    if (tab === 'release') return a?.comments?.release ?? null;
    if (tab === 'collection') return a?.comments?.collection ?? null;
    const art = a?.article;
    if (!art?.commentReplies || !art.commentVote || !art.commentAdd) return null;
    return { replies: art.commentReplies, vote: art.commentVote, add: art.commentAdd };
  }

  async function handleVote(updated: UiV2CommentNode) {
    if (!requireAuth()) return;
    const api = apiFor(activeTab);
    const root = rootOf(updated.id);
    if (!api || !root) return;
    const findIn = (list: UiV2CommentNode[]): UiV2CommentNode | null => {
      for (const n of list) {
        if (n.id === updated.id) return n;
        const f = n.replies ? findIn(n.replies) : null;
        if (f) return f;
      }
      return null;
    };
    const prev = findIn([root]);
    if (!prev) return;
    setNodes(patchUiV2CommentNode(nodes, updated.id, { userVote: updated.userVote, voteCount: updated.voteCount }));
    try {
      await api.vote(Number(updated.id), apiVotePayload(
        (prev.userVote ?? 0) as CommentVoteValue,
        (updated.userVote ?? 0) as CommentVoteValue,
      ));
    } catch {
      setNodes(patchUiV2CommentNode(nodes, updated.id, { userVote: prev.userVote, voteCount: prev.voteCount }));
    }
  }

  async function loadReplies(node: UiV2CommentNode) {
    const api = apiFor(activeTab);
    if (!api) return;
    try {
      const data = await api.replies(Number(node.id), 0, 2);
      const replies = normalizeCommentsFromResponse(data as Record<string, unknown>).map((c) => commentDataToUiV2Node(c));
      setNodes(setUiV2CommentReplies(nodes, node.id, replies));
    } catch {
      /* ignore */
    }
  }

  async function submitReply(node: UiV2CommentNode, payload: UiV2CommentComposerPayload) {
    if (!requireAuth()) return;
    const api = apiFor(activeTab);
    const root = rootOf(node.id);
    const targetId = root ? itemById.get(String(root.id))?.targetId ?? 0 : 0;
    if (!api || !root || !targetId) return;
    try {
      const res = await api.add(targetId, buildReleaseCommentAddBody(payload, {
        replyTarget: uiV2NodeToCommentData(node),
        threadRootCommentId: Number(root.id),
      })) as { code?: number; comment?: Record<string, unknown> };
      if (res?.code != null && res.code !== 0) throw new Error(String(res.code));
      if (res?.comment) {
        const resolved = resolveJacksonRefs(res) as Record<string, unknown>;
        const added = commentDataToUiV2Node(normalizeComment((resolved.comment ?? res.comment) as Record<string, unknown>, resolved));
        setNodes(appendUiV2CommentReply(nodes, root.id, added));
      }
    } catch {
      /* ignore */
    }
  }

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
    const sort = sortByTab[tab];
    if (tab === 'release') return api.getReleaseComments(profileId, pageNum, sort);
    if (tab === 'collection') return api.getCollectionComments(profileId, pageNum, sort);
    return api.getArticleComments(profileId, pageNum, sort);
  }

  async function load(append: boolean) {
    if (!window.anixApi || isLoading || (!hasMore && append) || !profileId) return;
    isLoading = true;
    if (!append) {
      if (loadState !== 'error') loadState = 'loading';
      page = 0;
      hasMore = true;
      items = [];
      patched = {};
    }
    const pageToLoad = page;
    try {
      const data = resolveJacksonRefsByKey(
        await fetchPage(activeTab, pageToLoad) as Record<string, unknown>,
        COMMENT_REF_KEYS,
      );
      const content = (data?.content ?? []) as Record<string, unknown>[];
      if (!append) totalCount = Number((data as { total_count?: unknown })?.total_count ?? 0) || 0;
      if (!content.length) {
        if (!append) loadState = 'empty';
        hasMore = false;
        return;
      }
      const mapped = content
        .map((raw) => mapProfileCommentPreview(
          { ...raw, comment_type: activeTab },
          data,
        ))
        .filter((item): item is ProfileCommentPreviewItem => item != null);
      items = append ? [...items, ...mapped] : mapped;
      page = pageToLoad + 1;
      if (data.last === true || content.length < 25) hasMore = false;
      loadState = 'ready';
    } catch (err) {
      errorMsg = headlineFromLoadError(err);
      if (!append) loadState = 'error';
    } finally {
      isLoading = false;
    }
  }

  /** Первая страница соседних вкладок: при свайпе рядом едет уже настоящий список. */
  const tabPrefetch = createTabPrefetch<ProfileCommentPreviewItem[]>(async (id) => {
    const data = resolveJacksonRefsByKey(await fetchPage(id as CommentTabId, 0) as Record<string, unknown>, COMMENT_REF_KEYS);
    return ((data?.content ?? []) as Record<string, unknown>[])
      .map((raw) => mapProfileCommentPreview({ ...raw, comment_type: id }, data))
      .filter((item): item is ProfileCommentPreviewItem => item != null);
  });
  const peekTabs = $derived(tabNeighbors(COMMENT_TABS.map((t) => t.id), activeTab));

  $effect(() => {
    if (!isMobileMode() || loadState !== 'ready') return;
    const { prev, next } = peekTabs;
    untrack(() => {
      if (prev) tabPrefetch.ensure(prev);
      if (next) tabPrefetch.ensure(next);
    });
  });

  /** Ход свайпа содержимого — для планки и подписей вкладок */
  let tabSwipe = $state<TabSwipeState>(null);

  function swipeToTab(dir: 1 | -1): boolean {
    const nextTab = COMMENT_TABS[COMMENT_TABS.findIndex((t) => t.id === activeTab) + dir];
    if (!nextTab) return false;
    onTabChange(nextTab.id);
    return true;
  }

  function onTabChange(tabId: string) {
    if (tabId === activeTab) return;
    activeTab = tabId as CommentTabId;
    patched = {};
    const scroller = wrapEl?.closest('.page__scroll');
    if (scroller) scroller.scrollTop = 0;
    const seed = isMobileMode() ? tabPrefetch.get(tabId) : undefined;
    totalCount = 0;
    if (seed?.length) {
      // У заранее загруженной вкладки нет общего числа — список показываем сразу, «N всего» догружаем
      const tab = tabId as CommentTabId;
      void fetchPage(tab, 0)
        .then((data) => {
          if (activeTab === tab) totalCount = Number((data as { total_count?: unknown })?.total_count ?? 0) || 0;
        })
        .catch(() => {});
      items = seed;
      page = 1;
      hasMore = seed.length >= 25;
      loadState = 'ready';
      return;
    }
    void load(false);
  }

  function onSortChange(next: CommentSort) {
    if (next === sortByTab[activeTab]) return;
    sortByTab = { ...sortByTab, [activeTab]: next };
    tabPrefetch.clear();
    patched = {};
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

<div class="view view-search view-profile-comments" class:view-profile-comments--embedded={embedded} bind:this={wrapEl}>
  <div class="search-page">
    <!-- Шапка и вкладки — одним закреплённым блоком: вкладки не уезжают под шапку при прокрутке -->
    <div class="profile-comments__sticky" class:profile-comments__sticky--page={!embedded}>
      {#if !embedded}
        <header class="profile-subpage__head">
          <UiV2BackBar
            segments={[{ label: 'Комментарии', active: true }, { label: profileLogin }]}
            avatarUrl={profileAvatar ? buildPosterUrl(profileAvatar) : ''}
            onBack={goBack}
          />
        </header>
      {/if}

      <!-- Сортировка — круглой кнопкой в строке вкладок, «N всего» — счётчиком на активной вкладке -->
      <UiV2Tabs tabs={commentTabs} activeId={activeTab} swipe={tabSwipe} onChange={onTabChange} class={embedded ? 'profile-comments__tabs' : 'profile-comments__tabs uiv2-tabs--static'}>
        {#snippet leftActions()}
          <CommentsSortButton sort={sortByTab[activeTab]} onSortChange={onSortChange} />
        {/snippet}
      </UiV2Tabs>
    </div>

    <div class="search-page__results">
      <div use:swipeTabs={{ onSwipe: swipeToTab, enabled: isMobileMode(), activeId: activeTab, onSwipeProgress: (dir, progress, ms) => (tabSwipe = dir ? { dir, progress, ms } : null) }}>
        {#if loadState === 'loading'}
          <div class="search-page__loading">Загрузка…</div>
        {:else if loadState === 'error'}
          <UiV2ContentRetryOverlay message={errorMsg} onRetry={() => void load(false)} />
        {:else if loadState === 'empty'}
          <p class="search-page__empty">Комментариев нет</p>
        {:else}
          {@render commentList(items)}
          {#if peekTabs.prev}<TabPeek dir={-1}>{@render commentsPeek(peekTabs.prev)}</TabPeek>{/if}
          {#if peekTabs.next}<TabPeek dir={1}>{@render commentsPeek(peekTabs.next)}</TabPeek>{/if}
        {/if}
      </div>
      {#if isLoading && loadState === 'ready'}
        <div class="search-page__loading">Загрузка…</div>
      {/if}
    </div>
  </div>
</div>

{#snippet commentList(list: ProfileCommentPreviewItem[])}
  <UiV2CommentThread
    nodes={list === items ? nodes : list.map((item) => toNode(item))}
    class="profile-comments__thread"
    reactionsSource={activeTab}
    selfProfileId={selfId}
    onAuthorClick={(n) => handleUserProfileClick(n.profile.id)}
    onReleaseClick={openTarget}
    onVote={handleVote}
    onLoadReplies={loadReplies}
    onSubmitReply={submitReply}
  />
{/snippet}

{#snippet commentsPeek(id: string)}
  {@const list = tabPrefetch.get(id)}
  {#if list?.length}
    {@render commentList(list.slice(0, TAB_PEEK_ITEMS))}
  {:else if list}
    <p class="search-page__empty">Комментариев нет</p>
  {:else}
    <div class="search-page__loading">Загрузка…</div>
  {/if}
{/snippet}
