<script lang="ts">
  /** Записи блога в конце профиля, как в Android 11: подгружаются по мере прокрутки. */
  import FeedArticleCard from '../feed/FeedArticleCard.svelte';
  import FeedArticleComposer from '../feed/FeedArticleComposer.svelte';
  import FeedComposePrompt from '../feed/FeedComposePrompt.svelte';
  import UiV2FeedPostSkeleton from '../uikit-v2/UiV2FeedPostSkeleton.svelte';
  import { navigate } from '../../stores/navigation';
  import { requireAuth } from '../../stores/auth';
  import { showToast } from '../../stores/toast';
  import { applyArticleVote, normalizeArticleVote } from '../../utils/feed-article';
  import { openFeedComposerWindow, resolveFeedArticleForEdit } from '../../utils/feed-composer-open';
  import type { FeedArticle, FeedChannel } from '../../types/feed';

  interface Props {
    channel: FeedChannel;
    isMyProfile: boolean;
    avatarUrl?: string;
  }

  let { channel, isMyProfile, avatarUrl = '' }: Props = $props();

  let articles = $state<FeedArticle[]>([]);
  let page = $state(0);
  let hasMore = $state(false);
  let loading = $state(true);
  let selectedId = $state<number | null>(null);
  let composerOpen = $state(false);
  let composerRepost = $state<FeedArticle | null>(null);
  let composerEdit = $state<FeedArticle | null>(null);
  let sentinel = $state<HTMLElement | null>(null);

  const composerChannels = $derived([
    { id: channel.id, title: channel.title ?? 'Блог', avatar: channel.avatar, is_blog: channel.is_blog },
  ]);

  async function load(nextPage: number) {
    const api = window.anixApi?.channel?.articles;
    if (!api) {
      loading = false;
      return;
    }
    loading = true;
    try {
      const res = await api(channel.id, nextPage);
      const raw: unknown[] = Array.isArray(res?.content) ? res.content : [];
      const list = raw
        .filter((a): a is FeedArticle => !!a && typeof a === 'object' && Number((a as FeedArticle).id) > 0)
        .map((a) => ({ ...a, channel: a.channel ? { ...a.channel, id: a.channel.id || channel.id } : { ...channel } }));
      const known = new Set(nextPage === 0 ? [] : articles.map((a) => a.id));
      const fresh = list.filter((a) => !known.has(a.id));
      articles = nextPage === 0 ? fresh : [...articles, ...fresh];
      page = nextPage;
      const totalPages = Number(res?.total_page_count ?? 0);
      hasMore = totalPages > 0 ? nextPage + 1 < totalPages : list.length >= 10;
    } catch {
      hasMore = false;
    } finally {
      loading = false;
    }
  }

  async function openComposer(repost: FeedArticle | null, edit: FeedArticle | null = null) {
    if (!requireAuth()) return;
    const editArticle = edit ? await resolveFeedArticleForEdit(edit) : null;
    const opened = await openFeedComposerWindow({
      channelId: editArticle?.channel?.id ?? channel.id,
      repostArticle: editArticle ? null : repost,
      editArticle,
      channels: composerChannels,
    });
    if (opened) return;
    if (window.electron?.openComposerWindow) {
      showToast('Не удалось открыть окно редактора', 'err');
      return;
    }
    composerEdit = editArticle;
    composerRepost = editArticle ? null : repost;
    composerOpen = true;
  }

  function closeComposer() {
    composerOpen = false;
    composerRepost = null;
    composerEdit = null;
  }

  async function onVote(article: FeedArticle, nextVote: 0 | 1 | 2) {
    const api = window.anixApi?.article?.vote;
    if (!api) return;
    const prev = normalizeArticleVote(article.vote);
    if (prev === nextVote) return;
    articles = articles.map((a) => (a.id === article.id ? applyArticleVote(a, nextVote) : a));
    try {
      await api(article.id, nextVote);
    } catch {
      articles = articles.map((a) => (a.id === article.id ? applyArticleVote(a, prev) : a));
    }
  }

  $effect(() => {
    void load(0);
  });

  $effect(() => {
    // Новый наблюдатель после каждой страницы: если метка осталась на экране, повторного события не будет
    void articles.length;
    const el = sentinel;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting) && hasMore && !loading) void load(page + 1);
      },
      { rootMargin: '600px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  });
</script>

<section class="profile-feed" aria-label="Записи">
  {#if isMyProfile}
    <FeedComposePrompt {avatarUrl} placeholder="Добавить запись…" onOpen={() => void openComposer(null)} />
  {/if}

  {#if articles.length}
    <div class="feed-page__list">
      {#each articles as article (article.id)}
        <FeedArticleCard
          {article}
          selected={selectedId === article.id}
          hideSubscribe
          menuPinAvailable={isMyProfile}
          entryPoint="channel"
          onOpen={(a) => (selectedId = a.id)}
          onChannel={(id) => { if (id !== channel.id) navigate(`/channel/${id}`); }}
          {onVote}
          onArticleRemove={(id) => { articles = articles.filter((a) => a.id !== id); }}
          onArticleChange={(next) => {
            const prev = articles.find((a) => a.id === next.id) as (FeedArticle & { is_pinned?: boolean }) | undefined;
            articles = articles.map((a) => (a.id === next.id ? next : a));
            // Закрепили / открепили — порядок задаёт сервер (закреплённая первой)
            if (prev && !!prev.is_pinned !== !!(next as FeedArticle & { is_pinned?: boolean }).is_pinned) void load(0);
          }}
          onRepost={(a) => void openComposer(a)}
          onEdit={(a) => void openComposer(null, a)}
        />
      {/each}
    </div>
  {/if}

  {#if loading}
    <UiV2FeedPostSkeleton count={articles.length ? 1 : 2} />
  {/if}
  {#if hasMore}<div bind:this={sentinel} class="profile-feed__sentinel" aria-hidden="true"></div>{/if}
</section>

<FeedArticleComposer
  open={composerOpen}
  channels={composerChannels}
  initialChannelId={composerEdit?.channel?.id ?? channel.id}
  repostArticle={composerRepost}
  editArticle={composerEdit}
  onClose={closeComposer}
  onPublished={() => {
    closeComposer();
    void load(0);
  }}
/>

<style lang="scss">
  .profile-feed {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    min-width: 0;
    margin-top: 0.75rem;
  }

  .profile-feed__sentinel {
    height: 1px;
  }
</style>
