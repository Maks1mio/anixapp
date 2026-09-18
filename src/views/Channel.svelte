<script lang="ts">
  import { onMount } from 'svelte';
  import UiV2Button from '../components/uikit-v2/UiV2Button.svelte';
  import UiV2Card from '../components/uikit-v2/UiV2Card.svelte';
  import UiV2PopupMenu, { type UiV2PopupMenuItem } from '../components/uikit-v2/UiV2PopupMenu.svelte';
  import FeedArticleCard from '../components/feed/FeedArticleCard.svelte';
  import FeedComposePrompt from '../components/feed/FeedComposePrompt.svelte';
  import UiV2FeedPostSkeleton from '../components/uikit-v2/UiV2FeedPostSkeleton.svelte';
  import UiV2ContentRetryOverlay from '../components/uikit-v2/UiV2ContentRetryOverlay.svelte';
  import { headlineFromLoadError } from '../utils/content-load-error';
  import FeedArticleComposer from '../components/feed/FeedArticleComposer.svelte';
  import { openFeedComposerWindow, resolveFeedArticleForEdit } from '../utils/feed-composer-open';
  import FeedDirectoryModal from '../components/feed/FeedDirectoryModal.svelte';
  import UserAvatar from '../components/UserAvatar.svelte';
  import { navigate } from '../stores/navigation';
  import { openProfilePanel } from '../stores/profile-panel';
  import { isAuthenticated, requireAuth } from '../stores/auth';
  import { showToast } from '../stores/toast';
  import type { FeedArticle, FeedChannel } from '../types/feed';
  import {
    applyArticleVote,
    channelAvatarUrl,
    channelCoverUrl,
    channelSubscriberCount,
    formatCompactCount,
    formatFeedRelativeTime,
    normalizeArticleVote,
    ruSubscribersWord,
  } from '../utils/feed-article';
  import { resolveCdnAssetUrl } from '../utils/posterUrl';
  import {
    normalizeDirectoryPeople,
    pageableContent,
    type DirectoryPerson,
  } from '../utils/feed-directory';
  import {
    iconArrowLeft,
    iconChevronDown,
    iconInfo,
    iconPencil,
  } from '../components/icons';
  import {
    buildFeedChannelMenuItems,
    ensureChannelReportReasons,
    getChannelReportReasons,
    runFeedChannelMenuAction,
  } from '../utils/feed-channel-menu';

  type Props = {
    id: number;
  };

  type ChannelSubscriber = DirectoryPerson;

  let { id }: Props = $props();

  type LoadState = 'loading' | 'ready' | 'empty' | 'error';

  let channel = $state<FeedChannel | null>(null);
  let articles = $state<FeedArticle[]>([]);
  let page = $state(0);
  let hasMore = $state(false);
  let loadState = $state<LoadState>('loading');
  let loadingMore = $state(false);
  let errorMsg = $state('');
  let subscribeBusy = $state(false);
  let selectedArticleId = $state<number | null>(null);
  let composerOpen = $state(false);
  let composerRepost = $state<FeedArticle | null>(null);
  let composerEdit = $state<FeedArticle | null>(null);
  let canWrite = $state(false);
  let authed = $state(false);
  let selfAvatarUrl = $state('');
  let infoOpen = $state(false);
  let moreOpen = $state(false);
  let moreX = $state(0);
  let moreY = $state(0);
  let reportTick = $state(0);
  let subscribers = $state<ChannelSubscriber[]>([]);
  let directoryOpen = $state(false);

  const title = $derived(channel?.title?.trim() || (channel?.is_blog ? 'Блог' : 'Группа'));
  const cover = $derived(channelCoverUrl(channel?.cover));
  const avatar = $derived(channelAvatarUrl(channel?.avatar));
  const subs = $derived(channelSubscriberCount(channel));
  const isBlog = $derived(!!channel?.is_blog);
  const subscribed = $derived(!!channel?.is_subscribed);
  const description = $derived((channel?.description ?? '').trim());
  const createdLabel = $derived(formatFeedRelativeTime(channel?.creation_date));
  const updatedLabel = $derived(formatFeedRelativeTime(channel?.last_article_date));
  const infoKicker = $derived.by(() => {
    if (isBlog) return channel?.is_verified ? 'Официальный блог' : 'Блог';
    return channel?.is_verified ? 'Официальная группа' : 'Группа';
  });

  const moreItems = $derived.by((): UiV2PopupMenuItem[] => {
    void reportTick;
    if (!channel) return [];
    return buildFeedChannelMenuItems(channel, getChannelReportReasons());
  });

  function normalizeArticles(raw: unknown): FeedArticle[] {
    if (!Array.isArray(raw)) return [];
    return raw.filter((a): a is FeedArticle => !!a && typeof a === 'object' && Number((a as FeedArticle).id) > 0);
  }

  function normalizeSubscribers(raw: unknown): ChannelSubscriber[] {
    return normalizeDirectoryPeople(raw);
  }

  async function loadChannel(): Promise<void> {
    try {
      const res = await window.anixApi?.channel?.info?.(id);
      const ch = (res?.channel ?? null) as FeedChannel | null;
      channel = ch?.id ? ch : { id, title: `Канал #${id}` };
    } catch (err) {
      errorMsg = String(err);
      channel = { id, title: `Канал #${id}` };
    }
  }

  async function checkCanWrite(): Promise<void> {
    if (!authed) {
      canWrite = false;
      return;
    }
    try {
      const res = await window.anixApi?.channel?.editorAll?.();
      const list = Array.isArray(res?.channels) ? res.channels : [];
      canWrite = list.some((c) => Number(c?.id) === id);
    } catch {
      canWrite = false;
    }
  }

  async function openComposer(
    repost?: FeedArticle | null,
    opts?: { editArticle?: FeedArticle | null },
  ) {
    if (!authed && !requireAuth()) return;
    let editArticle = opts?.editArticle ?? null;
    if (editArticle) {
      editArticle = await resolveFeedArticleForEdit(editArticle);
    }
    const channelPayload = channel
      ? [{ id: channel.id, title, avatar: channel.avatar, is_blog: channel.is_blog }]
      : [];
    const opened = await openFeedComposerWindow({
      channelId: editArticle?.channel?.id ?? id,
      repostArticle: editArticle ? null : (repost ?? null),
      editArticle,
      channels: channelPayload,
    });
    if (opened) {
      composerOpen = false;
      composerRepost = null;
      composerEdit = null;
      return;
    }
    if (window.electron?.openComposerWindow) {
      showToast('Не удалось открыть окно редактора', 'err');
      return;
    }
    composerEdit = editArticle;
    composerRepost = editArticle ? null : (repost ?? null);
    composerOpen = true;
  }

  async function loadSelfAvatar(): Promise<void> {
    if (!authed || !window.anixApi?.profile?.self) {
      selfAvatarUrl = '';
      return;
    }
    try {
      const res = await window.anixApi.profile.self();
      const next = String(res?.profile?.avatar ?? '').trim();
      selfAvatarUrl = next ? (resolveCdnAssetUrl(next) || next) : '';
    } catch {
      selfAvatarUrl = '';
    }
  }

  async function loadSubscribers(): Promise<void> {
    const api = window.anixApi?.search?.channelSubscribers;
    if (!api) {
      subscribers = [];
      return;
    }
    try {
      const res = await api(id, 0, '');
      subscribers = normalizeSubscribers(pageableContent(res)).slice(0, 8);
    } catch {
      subscribers = [];
    }
  }

  async function loadArticles(nextPage: number, append: boolean): Promise<void> {
    if (!window.anixApi?.channel?.articles) {
      loadState = 'error';
      errorMsg = 'API недоступно';
      return;
    }
    if (append) loadingMore = true;
    else if (loadState !== 'error') {
      loadState = 'loading';
      errorMsg = '';
    }
    try {
      const res = await window.anixApi.channel.articles(id, nextPage);
      const list = normalizeArticles(res?.content).map((a) => ({
        ...a,
        channel: a.channel
          ? { ...a.channel, id: a.channel.id || id, is_subscribed: channel?.is_subscribed ?? a.channel.is_subscribed }
          : channel
            ? { ...channel }
            : a.channel,
      }));
      articles = append ? [...articles, ...list] : list;
      page = nextPage;
      const totalPages = Number(res?.total_page_count ?? 0);
      hasMore = totalPages > 0 ? nextPage + 1 < totalPages : list.length >= 10;
      loadState = articles.length === 0 ? 'empty' : 'ready';
    } catch (err) {
      errorMsg = headlineFromLoadError(err);
      if (!append) {
        articles = [];
        loadState = 'error';
      }
    } finally {
      loadingMore = false;
    }
  }

  async function reload() {
    await loadChannel();
    await Promise.all([
      loadArticles(0, false),
      checkCanWrite(),
      loadSubscribers(),
      loadSelfAvatar(),
    ]);
  }

  function goBack() {
    navigate('/feed');
  }

  function openSubscriber(profileId: number) {
    if (profileId > 0) openProfilePanel(profileId);
  }

  function openMore(e: MouseEvent) {
    const el = e.currentTarget as HTMLElement;
    const r = el.getBoundingClientRect();
    moreX = r.left + r.width / 2;
    moreY = r.bottom;
    moreOpen = !moreOpen;
    if (moreOpen) {
      void ensureChannelReportReasons().then(() => {
        reportTick += 1;
      });
    }
  }

  async function onMoreSelect(menuId: string) {
    moreOpen = false;
    if (!channel) return;
    const result = await runFeedChannelMenuAction(menuId, channel);
    if (result.kind === 'muted') {
      channel = { ...channel, is_muted: true };
    }
    if (result.kind === 'unmuted') {
      channel = { ...channel, is_muted: false };
    }
  }

  async function onSubscribe(channelId: number, next: boolean) {
    if (!authed && !requireAuth()) return;
    const api = window.anixApi?.channel;
    if (!api?.subscribe || !api.unsubscribe) return;
    const prev = channel;
    subscribeBusy = true;
    if (channel?.id === channelId) {
      channel = { ...channel, is_subscribed: next };
    }
    articles = articles.map((a) =>
      a.channel?.id === channelId
        ? { ...a, channel: { ...a.channel, is_subscribed: next } }
        : a,
    );
    try {
      const res = next ? await api.subscribe(channelId) : await api.unsubscribe(channelId);
      const code = Number((res as { code?: number } | undefined)?.code ?? 0);
      if (code !== 0 && code !== 2) {
        throw new Error(`Не удалось ${next ? 'подписаться' : 'отписаться'} (код ${code})`);
      }
    } catch (err) {
      channel = prev;
      showToast(err instanceof Error ? err.message : String(err), 'err');
    } finally {
      subscribeBusy = false;
    }
  }

  async function onVoteArticle(article: FeedArticle, nextVote: 0 | 1 | 2) {
    if (!window.anixApi?.article?.vote) return;
    const prevVote = normalizeArticleVote(article.vote);
    if (prevVote === nextVote) return;
    articles = articles.map((a) => (a.id === article.id ? applyArticleVote(a, nextVote) : a));
    try {
      await window.anixApi.article.vote(article.id, nextVote);
    } catch {
      articles = articles.map((a) => (a.id === article.id ? applyArticleVote(a, prevVote) : a));
    }
  }

  function onOpenArticle(article: FeedArticle) {
    selectedArticleId = article.id;
  }

  function onOpenChannel(channelId: number) {
    if (channelId === id) return;
    navigate(`/channel/${channelId}`);
  }

  onMount(() => {
    const unsub = isAuthenticated.subscribe((v) => {
      authed = v;
      void checkCanWrite();
      void loadSelfAvatar();
    });
    void reload();
    return () => unsub();
  });
</script>

<div class="view view-channel">
  <div class="channel-page__bar">
    <UiV2Button variant="ghost" size="sm" label="Назад" onclick={goBack}>
      {#snippet icon()}{@html iconArrowLeft(16)}{/snippet}
    </UiV2Button>
  </div>

  <header class="channel-page__hero">
    <div
      class="channel-page__cover"
      class:channel-page__cover--empty={!cover}
      style={cover ? `background-image:url('${cover}')` : undefined}
      aria-hidden="true"
    ></div>
    <div class="channel-page__toolbar">
      <div class="channel-page__identity">
        <span
          class="channel-page__avatar"
          class:channel-page__avatar--empty={!avatar}
          style={avatar ? `background-image:url('${avatar}')` : undefined}
          aria-hidden="true"
        ></span>
        <div class="channel-page__hero-meta">
          <h1 class="channel-page__title">
            {title}
            {#if channel?.is_verified}
              <span class="uiv2-feed-post__verified" title="Подтверждённый канал" aria-hidden="true">✓</span>
            {/if}
          </h1>
          <p class="channel-page__status">
            {formatCompactCount(subs)} {ruSubscribersWord(subs)}
          </p>
        </div>
      </div>
      <div class="channel-page__hero-actions">
        {#if subscribed}
          <UiV2Button
            variant="chrome"
            size="sm"
            label={subscribeBusy ? 'Отписка…' : 'Отписаться'}
            disabled={subscribeBusy}
            onclick={() => void onSubscribe(id, false)}
          />
        {:else}
          <UiV2Button
            variant="primary"
            size="sm"
            label={subscribeBusy ? 'Подписка…' : 'Подписаться'}
            disabled={subscribeBusy}
            onclick={() => void onSubscribe(id, true)}
          />
        {/if}
        {#if canWrite}
          <UiV2Button
            variant="chrome"
            size="sm"
            label="Написать"
            onclick={() => void openComposer(null)}
          >
            {#snippet icon()}{@html iconPencil(16)}{/snippet}
          </UiV2Button>
        {/if}
        <UiV2Button
          variant="chrome"
          size="sm"
          label="Ещё"
          ariaHaspopup="menu"
          ariaExpanded={moreOpen}
          onclick={openMore}
        >
          {#snippet trailing()}{@html iconChevronDown(14)}{/snippet}
        </UiV2Button>
      </div>
    </div>
  </header>

  <div class="channel-page__body">
    <div class="channel-page__main">
      {#if canWrite}
        <FeedComposePrompt
          avatarUrl={selfAvatarUrl || avatar}
          onOpen={() => void openComposer(null)}
        />
      {/if}

      {#if loadState === 'loading'}
        <UiV2FeedPostSkeleton count={3} />
      {:else if loadState === 'error'}
        <UiV2ContentRetryOverlay message={errorMsg} onRetry={() => void reload()} />
      {:else if loadState === 'empty'}
        <UiV2Card title="Пока нет записей">
          <p class="feed-page__hint">В этой группе ещё ничего не публиковали.</p>
        </UiV2Card>
      {:else}
        <div class="feed-page__list">
          {#each articles as article (article.id)}
            <FeedArticleCard
              {article}
              selected={selectedArticleId === article.id}
              hideSubscribe={true}
              onOpen={onOpenArticle}
              onChannel={onOpenChannel}
              onVote={onVoteArticle}
              onSubscribe={onSubscribe}
              onArticleRemove={(articleId) => {
                articles = articles.filter((a) => a.id !== articleId);
              }}
              onArticleChange={(next) => {
                articles = articles.map((a) => (a.id === next.id ? next : a));
              }}
              onRepost={(next) => void openComposer(next)}
              onEdit={(next) => void openComposer(null, { editArticle: next })}
            />
          {/each}
        </div>
        {#if hasMore}
          <div class="feed-page__more">
            <UiV2Button
              variant="chrome"
              label={loadingMore ? 'Загрузка…' : 'Ещё'}
              disabled={loadingMore}
              onclick={() => void loadArticles(page + 1, true)}
            />
          </div>
        {/if}
      {/if}
    </div>

    <aside class="channel-page__aside" aria-label="О группе">
      <section class="channel-page__card">
        <h2 class="channel-page__card-kicker">{infoKicker}</h2>
        <p class="channel-page__card-title">{title}</p>
        {#if description}
          <p class="channel-page__card-text" class:channel-page__card-text--clamp={!infoOpen}>
            {description}
          </p>
        {:else}
          <p class="channel-page__card-text channel-page__card-text--muted">Описание не указано.</p>
        {/if}
        {#if infoOpen}
          <ul class="channel-page__facts">
            <li>{formatCompactCount(subs)} {ruSubscribersWord(subs)}</li>
            {#if channel?.article_count != null}
              <li>{formatCompactCount(channel.article_count)} записей</li>
            {/if}
            {#if createdLabel}
              <li>Создана {createdLabel}</li>
            {/if}
            {#if updatedLabel}
              <li>Обновлено {updatedLabel}</li>
            {/if}
          </ul>
        {/if}
        <button
          type="button"
          class="channel-page__more-info"
          aria-expanded={infoOpen}
          onclick={() => { infoOpen = !infoOpen; }}
        >
          <span aria-hidden="true">{@html iconInfo(14)}</span>
          {infoOpen ? 'Скрыть информацию' : 'Подробная информация'}
        </button>
      </section>

      <section class="channel-page__card">
        <h2 class="channel-page__card-title-row">
          <span class="feed-group__card-head">
            Подписчики
            <span class="channel-page__card-count">{formatCompactCount(subs)}</span>
          </span>
          <button
            type="button"
            class="feed-group__all"
            onclick={() => { directoryOpen = true; }}
          >
            Все
          </button>
        </h2>
        {#if subscribers.length > 0}
          <ul class="channel-page__people">
            {#each subscribers as person (person.id)}
              <li>
                <button
                  type="button"
                  class="channel-page__person"
                  title={person.login}
                  onclick={() => openSubscriber(person.id)}
                >
                  <span class="channel-page__avatar-clip">
                    <UserAvatar src={channelAvatarUrl(person.avatar)} label={person.login} />
                  </span>
                  <span class="channel-page__person-name">{person.login}</span>
                </button>
              </li>
            {/each}
          </ul>
        {:else}
          <p class="channel-page__card-text channel-page__card-text--muted">
            Список подписчиков пока недоступен.
          </p>
        {/if}
      </section>
    </aside>
  </div>
</div>

<UiV2PopupMenu
  open={moreOpen}
  x={moreX}
  y={moreY}
  placement="anchor"
  items={moreItems}
  onClose={() => { moreOpen = false; }}
  onSelect={onMoreSelect}
/>

<FeedDirectoryModal
  open={directoryOpen}
  kind="subscribers"
  channelId={id}
  totalCount={subs}
  onClose={() => { directoryOpen = false; }}
/>

<FeedArticleComposer
  open={composerOpen}
  channels={channel
    ? [{ id: channel.id, title: title, avatar: channel.avatar, is_blog: channel.is_blog }]
    : []}
  initialChannelId={composerEdit?.channel?.id ?? id}
  repostArticle={composerRepost}
  editArticle={composerEdit}
  onClose={() => {
    composerOpen = false;
    composerRepost = null;
    composerEdit = null;
  }}
  onPublished={() => {
    composerOpen = false;
    composerRepost = null;
    composerEdit = null;
    void loadArticles(0, false);
  }}
/>
