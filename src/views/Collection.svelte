<script lang="ts">
  import ReleaseCardsGrid from '../components/ReleaseCardsGrid.svelte';
  import { onMount, onDestroy } from 'svelte';
  import AnimatedMediaOverlay from '../components/AnimatedMediaOverlay.svelte';
  import UserAvatar from '../components/UserAvatar.svelte';
  import { CommentsSection } from '../components/comments';
  import UiV2Button from '../components/uikit-v2/UiV2Button.svelte';
  import UiV2RoundButton from '../components/uikit-v2/UiV2RoundButton.svelte';
  import UiV2Card from '../components/uikit-v2/UiV2Card.svelte';
  import UiV2Skeleton from '../components/uikit-v2/UiV2Skeleton.svelte';
  import UiV2AnimeCardSkeleton from '../components/uikit-v2/UiV2AnimeCardSkeleton.svelte';
  import UiV2PopupMenu, { type UiV2PopupMenuItem } from '../components/uikit-v2/UiV2PopupMenu.svelte';
  import UiV2ContentRetryOverlay from '../components/uikit-v2/UiV2ContentRetryOverlay.svelte';
  import {
    iconBookmark,
    iconCopy,
    iconInfo,
    iconLock,
    iconMessageCircle,
    iconMoreHorizontal,
    iconPencil,
    iconShuffle,
    iconTrash2,
  } from '../components/icons';
  import { navigate } from '../stores/navigation';
  import { requireAuth } from '../stores/auth';
  import { handleUserProfileClick } from '../stores/user-profile';
  import { showToast } from '../stores/toast';
  import { COLLECTION_DELETE_ERROR_MESSAGES } from '../utils/collection';
  import { setDiscordContext, refreshDiscordPresence } from '../services/discord-presence';
  import { ensureProfileId } from '../utils/profile';
  import type { ReleaseCardData } from '../types/release';
  import type { CommentData } from '../types/comment';
  import { buildPosterUrl } from '../utils/posterUrl';
  import { mapReleaseRawToCard } from '../utils/release-card';
  import { normalizeCommentsFromResponse } from '../utils/comment';
  import { normalizeArticleBaseUrl } from '../utils/feed-article-menu';
  import { headlineFromLoadError } from '../utils/content-load-error';
  import { notifyBookmarksChanged } from '../utils/favorites-events';

  interface Props {
    id: number;
  }

  let { id }: Props = $props();

  const MONTHS = 'янв. февр. мар. апр. мая июн. июл. авг. сен. окт. нояб. дек.'.split(' ');
  const COMMENTS_PREVIEW = 3;

  function formatDate(ts: number): string {
    const date = new Date(ts * 1000);
    const now = new Date();
    const time = `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
    const year = date.getFullYear() !== now.getFullYear() ? ` ${date.getFullYear()}` : '';
    return `${date.getDate()} ${MONTHS[date.getMonth()]}${year} в ${time}`;
  }

  function pluralRu(n: number, one: string, few: string, many: string): string {
    const m10 = n % 10;
    const m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
    return many;
  }

  // State
  let loadState = $state<'loading' | 'error' | 'ready'>('loading');
  let errorMsg = $state('');

  // Collection info
  let collectionTitle = $state('');
  let collectionDesc = $state('');
  let collectionImage = $state('');
  /** Anixart 11+: анимированная обложка (видео) */
  let collectionCoverAnimation = $state('');
  let creationDate = $state(0);
  let lastUpdateDate = $state(0);
  let totalReleases = $state(0);
  let isFavorite = $state(false);
  let favoritesCount = $state(0);
  let commentCount = $state(0);

  let authorId = $state<number | null>(null);
  let authorName = $state('');
  let authorAvatar = $state('');
  let isOwner = $state(false);
  let isPrivate = $state(false);
  let isDeleting = $state(false);
  let selfProfileId = $state<number | null>(null);

  let watchingCount = $state(0);
  let planCount = $state(0);
  let completedCount = $state(0);
  let holdOnCount = $state(0);
  let droppedCount = $state(0);
  let statusSum = $derived(watchingCount + planCount + completedCount + holdOnCount + droppedCount);
  const uncategorizedCount = $derived(Math.max(0, totalReleases - statusSum));
  const statsTotal = $derived(Math.max(totalReleases, statusSum));
  const statusRows = $derived([
    { key: 'watching', label: 'Смотрю', count: watchingCount },
    { key: 'planned', label: 'В планах', count: planCount },
    { key: 'completed', label: 'Просмотрено', count: completedCount },
    { key: 'on_hold', label: 'Отложено', count: holdOnCount },
    { key: 'dropped', label: 'Брошено', count: droppedCount },
    { key: 'none', label: 'Не в списках', count: uncategorizedCount },
  ]);

  // Releases
  let releaseItems = $state<ReleaseCardData[]>([]);
  let nextPage = $state(1);
  let hasMore = $state(false);
  let isLoadingMore = $state(false);
  let wrapEl: HTMLElement | undefined = $state();

  // Comments
  let comments = $state<CommentData[]>([]);

  // «⋯» menu
  let moreOpen = $state(false);
  let moreX = $state(0);
  let moreY = $state(0);
  let reportReasons = $state<{ id: number; label: string }[]>([]);

  const moreItems = $derived.by<UiV2PopupMenuItem[]>(() => {
    const items: UiV2PopupMenuItem[] = [
      { id: 'copy', label: 'Скопировать ссылку', icon: iconCopy(16) },
    ];
    if (isOwner) {
      items.push(
        { id: 'edit', label: 'Редактировать', icon: iconPencil(16) },
        { id: 'delete', label: 'Удалить коллекцию', icon: iconTrash2(16), danger: true, dividerBefore: true },
      );
    } else {
      const report: UiV2PopupMenuItem = { id: 'report', label: 'Пожаловаться', icon: iconInfo(16), danger: true };
      if (reportReasons.length > 0) {
        report.children = reportReasons.map((r) => ({ id: `report:${r.id}`, label: r.label }));
        report.submenuWide = true;
      }
      items.push(report);
    }
    return items;
  });

  function parseReleases(res: any) {
    let content = res?.content ?? res?.releases;
    if (content && !Array.isArray(content) && Array.isArray(content.releases)) content = content.releases;
    const rawList = Array.isArray(content) ? content : [];
    return rawList.filter((item: any) => {
      if (!item || typeof item.id !== 'number') return false;
      if (item.release_count != null && !item.title_ru && !item.title_original) return false;
      return item.title_ru != null || item.title_original != null;
    });
  }

  async function loadMore() {
    if (!hasMore || isLoadingMore || !window.anixApi) return;
    isLoadingMore = true;
    try {
      const list = parseReleases(await window.anixApi.collection.getReleases(id, nextPage));
      releaseItems = [...releaseItems, ...list.map((raw: any) => mapReleaseRawToCard(raw as Record<string, unknown>))];
      nextPage += 1;
      hasMore = list.length > 0 && releaseItems.length < totalReleases;
    } catch { /* ignore */ } finally {
      isLoadingMore = false;
    }
  }

  function attachScroll() {
    const scrollEl = wrapEl?.closest('.page__scroll') as HTMLElement | null;
    if (!scrollEl) return;
    scrollEl.addEventListener('scroll', () => {
      if (!hasMore || isLoadingMore) return;
      const distance = scrollEl.scrollHeight - scrollEl.scrollTop - scrollEl.clientHeight;
      if (distance < 300) loadMore();
    });
    requestAnimationFrame(() => {
      if (!hasMore || isLoadingMore) return;
      if (scrollEl.scrollHeight <= scrollEl.clientHeight + 50) loadMore();
    });
  }

  function onLayoutChanged() {
    releaseItems = [...releaseItems];
  }

  async function toggleBookmark() {
    if (!requireAuth()) return;
    if (!window.anixApi) return;
    const was = isFavorite;
    isFavorite = !was;
    favoritesCount = Math.max(0, favoritesCount + (was ? -1 : 1));
    try {
      if (was) await window.anixApi.collection.removeFavorite(id);
      else await window.anixApi.collection.addFavorite(id);
      notifyBookmarksChanged({ kind: 'collections' });
    } catch {
      isFavorite = was;
      favoritesCount = Math.max(0, favoritesCount + (was ? 1 : -1));
    }
  }

  async function openRandom() {
    if (!window.anixApi) return;
    try {
      const res = await window.anixApi.collection.getRandomRelease(id) as any;
      const rid = res?.release?.id;
      if (rid) navigate(`/release/${rid}`);
    } catch { /* ignore */ }
  }

  function scrollToComments() {
    document.getElementById('comments')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function deleteCollection() {
    if (!window.anixApi || isDeleting) return;
    if (!window.confirm('Удалить коллекцию? Это действие нельзя отменить.')) return;
    isDeleting = true;
    try {
      const res = await window.anixApi.collectionMy.delete(id) as { code?: number };
      const code = res?.code ?? -1;
      if (code !== 0 && code !== 4) {
        showToast(COLLECTION_DELETE_ERROR_MESSAGES[code] ?? 'Не удалось удалить коллекцию', 'err');
        return;
      }
      showToast('Коллекция удалена');
      navigate('/collections/my');
    } catch (err) {
      showToast(String(err), 'err');
    } finally {
      isDeleting = false;
    }
  }

  async function ensureReportReasons() {
    if (reportReasons.length > 0 || !window.anixApi?.report?.collectionReasons) return;
    try {
      const rows = await window.anixApi.report.collectionReasons();
      reportReasons = (Array.isArray(rows) ? rows : [])
        .map((row) => ({ id: Number(row?.id), label: String(row?.title ?? row?.name ?? row?.text ?? '') }))
        .filter((r) => r.id > 0 && r.label);
    } catch { /* ignore */ }
  }

  function openMore(e: MouseEvent) {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    moreX = r.left + r.width / 2;
    moreY = r.bottom;
    moreOpen = !moreOpen;
    if (moreOpen && !isOwner) void ensureReportReasons();
  }

  async function onMoreSelect(actionId: string) {
    moreOpen = false;
    if (actionId === 'copy') {
      const base = await window.anixApi?.client?.getBaseUrl?.();
      const url = `${normalizeArticleBaseUrl(typeof base === 'string' ? base : '')}collection/${id}`;
      try {
        await navigator.clipboard.writeText(url);
        showToast('Ссылка скопирована');
      } catch {
        showToast(url, 'info');
      }
    } else if (actionId === 'edit') {
      navigate(`/collections/edit/${id}`);
    } else if (actionId === 'delete') {
      void deleteCollection();
    } else if (actionId.startsWith('report:')) {
      if (!requireAuth()) return;
      const reasonId = Number(actionId.slice('report:'.length));
      try {
        const res = await window.anixApi?.report?.submitCollection?.({ entity_id: id, reason_id: reasonId });
        const code = Number(res?.code ?? 0);
        showToast(code === 0 ? 'Жалоба отправлена' : `Не удалось отправить жалобу (код ${code})`, code === 0 ? 'ok' : 'err');
      } catch (err) {
        showToast(String(err), 'err');
      }
    }
  }

  async function loadComments() {
    if (!window.anixApi?.comments?.collection) return;
    try {
      const data = await window.anixApi.comments.collection.list(id, 0, 3);
      comments = normalizeCommentsFromResponse(data as Record<string, unknown>);
      const total = data?.total_count ?? data?.total_elements;
      if (typeof total === 'number') commentCount = total;
    } catch { /* ignore */ }
  }

  async function loadCollection() {
    if (!window.anixApi) {
      errorMsg = 'API недоступно.';
      loadState = 'error';
      return;
    }

    if (loadState !== 'error') loadState = 'loading';
    try {
      const [infoRes, releasesRes] = await Promise.all([
        window.anixApi.collection.info(id),
        window.anixApi.collection.getReleases(id, 0),
      ]) as any[];

      const info = infoRes?.collection ?? infoRes;
      const code = infoRes?.code;
      if ((code !== 0 && code !== undefined) || !info) {
        errorMsg = code !== 0 ? 'Коллекция недоступна или удалена.' : 'Коллекция не найдена.';
        loadState = 'error';
        return;
      }

      const creator = info.creator || {};
      authorId = creator.id ?? creator['@id'] ?? null;
      authorName = creator.nickname ?? creator.username ?? creator.login ?? (creator as any).name ?? 'Пользователь';
      authorAvatar = creator.avatar ?? '';
      selfProfileId = await ensureProfileId();
      isOwner = selfProfileId != null && authorId === selfProfileId;

      collectionTitle = info.title || 'Без названия';
      collectionDesc = info.description || '';
      collectionImage = info.image || '';
      collectionCoverAnimation = typeof info.cover_animation === 'string' ? info.cover_animation : '';
      isPrivate = !!(info.is_private ?? info.isPrivate);
      creationDate = info.creation_date ?? 0;
      lastUpdateDate = info.last_update_date ?? 0;
      favoritesCount = info.favorites_count ?? 0;
      commentCount = info.comment_count ?? 0;
      isFavorite = !!(info.is_favorite ?? infoRes?.is_favorite);

      watchingCount = infoRes?.watching_count ?? 0;
      planCount = infoRes?.plan_count ?? 0;
      completedCount = infoRes?.completed_count ?? 0;
      holdOnCount = infoRes?.hold_on_count ?? 0;
      droppedCount = infoRes?.dropped_count ?? 0;

      const totalFromApi = releasesRes?.total_count;
      totalReleases = typeof totalFromApi === 'number' && totalFromApi >= 0
        ? totalFromApi
        : statusSum || (info.releases?.length ?? 0);

      const list = parseReleases(releasesRes);
      releaseItems = list.map((raw: any) => mapReleaseRawToCard(raw as Record<string, unknown>));
      hasMore = (typeof totalFromApi === 'number' ? totalFromApi : totalReleases) > list.length;

      setDiscordContext({
        collectionTitle: collectionTitle,
        collectionImage: collectionImage ? buildPosterUrl(collectionImage) : undefined,
      });
      refreshDiscordPresence();

      loadState = 'ready';
      void loadComments();
      requestAnimationFrame(attachScroll);
    } catch (err) {
      errorMsg = headlineFromLoadError(err);
      loadState = 'error';
    }
  }

  onMount(() => {
    void loadCollection();

    window.addEventListener('anix:cardLayoutChanged', onLayoutChanged);
  });

  onDestroy(() => {
    window.removeEventListener('anix:cardLayoutChanged', onLayoutChanged);
  });
</script>

{#snippet commentIcon()}{@html iconMessageCircle(16)}{/snippet}
{#snippet bookmarkIcon()}
  <span class="collection-head__bookmark-icon" class:collection-head__bookmark-icon--on={isFavorite}>{@html iconBookmark(16)}</span>
{/snippet}
{#snippet shuffleIcon()}{@html iconShuffle(16)}{/snippet}

<div class="view view-collection" bind:this={wrapEl}>
  {#if loadState === 'loading'}
    <div class="collection-page" aria-busy="true">
      <UiV2Skeleton tag="div" rounded="lg" class="collection-cover collection-cover--skeleton" />
      <div class="collection-head">
        <UiV2Skeleton tag="div" class="collection-skel collection-skel--title" />
        <UiV2Skeleton tag="div" class="collection-skel collection-skel--meta" />
      </div>
      <div class="collection-skel-grid">
        {#each [0, 1, 2, 3] as i (i)}
          <UiV2AnimeCardSkeleton variant="horizontal" />
        {/each}
      </div>
    </div>
  {:else if loadState === 'error'}
    <UiV2ContentRetryOverlay message={errorMsg} onRetry={() => void loadCollection()} />
  {:else}
    <div class="collection-page">
      <div class="collection-cover">
        {#if collectionImage}
          <img src={buildPosterUrl(collectionImage)} alt="" loading="eager" />
          <AnimatedMediaOverlay src={collectionCoverAnimation} />
        {/if}
      </div>

      <header class="collection-head">
        <div class="collection-head__row">
          <h1 class="collection-head__title">
            {#if isPrivate}
              <span class="collection-head__lock" aria-label="Закрытая коллекция">{@html iconLock(18)}</span>
            {/if}
            {collectionTitle}
          </h1>
          <div class="collection-head__tools">
            <UiV2Button
              label={String(favoritesCount)}
              variant={isFavorite ? 'light' : 'chrome'}
              icon={bookmarkIcon}
              onclick={toggleBookmark}
            />
            <UiV2Button
              label={String(commentCount)}
              icon={commentIcon}
              onclick={scrollToComments}
            />
            <UiV2RoundButton
              label="Ещё"
              ariaHaspopup="menu"
              ariaExpanded={moreOpen}
              onclick={openMore}
            >
              {@html iconMoreHorizontal(18)}
            </UiV2RoundButton>
          </div>
        </div>

        <div class="collection-head__meta">
          <button
            type="button"
            class="collection-head__author"
            onclick={(event) => { if (authorId) handleUserProfileClick(authorId, event); }}
          >
            <UserAvatar src={authorAvatar} label={authorName} class="collection-head__avatar" />
            <span class="collection-head__author-name">{authorName}</span>
          </button>
          {#if creationDate}
            <span class="collection-head__sep" aria-hidden="true">·</span>
            <span class="collection-head__date">Создана {formatDate(creationDate)}</span>
          {/if}
          {#if lastUpdateDate && lastUpdateDate !== creationDate}
            <span class="collection-head__sep" aria-hidden="true">·</span>
            <span class="collection-head__date">{creationDate ? 'обновлена' : 'Обновлена'} {formatDate(lastUpdateDate)}</span>
          {/if}
        </div>

        {#if collectionDesc}
          <p class="collection-head__desc">{collectionDesc}</p>
        {/if}

        {#if isOwner && isPrivate}
          <p class="collection-head__private" role="status">
            Закрытая коллекция, её видите только вы
          </p>
        {/if}

      </header>

      {#if totalReleases > 0}
        <UiV2Card title="Релизы" pill={String(totalReleases)} class="collection-stats">
          {#if statsTotal > 0}
            <div class="collection-stats__bar" role="img" aria-label="Распределение по спискам">
              {#each statusRows as row (row.key)}
                {#if row.count > 0}
                  <span
                    class="collection-stats__seg collection-stats__seg--{row.key}"
                    style="flex-grow:{row.count}"
                  ></span>
                {/if}
              {/each}
            </div>
          {/if}
          <ul class="collection-stats__legend">
            {#each statusRows as row (row.key)}
              {#if row.key !== 'none' || row.count > 0}
                <li class="collection-stats__item" class:collection-stats__item--zero={row.count === 0}>
                  <i class="collection-stats__dot collection-stats__dot--{row.key}"></i>
                  <span class="collection-stats__label">{row.label}</span>
                  <span class="collection-stats__count">{row.count}</span>
                </li>
              {/if}
            {/each}
          </ul>
          <div class="collection-stats__foot">
            <span class="collection-stats__share">
              {#if statsTotal > 0}
                У вас в списках {statusSum} из {totalReleases}
              {/if}
            </span>
            <UiV2Button label="Случайный релиз" size="sm" icon={shuffleIcon} onclick={openRandom} />
          </div>
        </UiV2Card>
      {/if}

      <section class="collection-releases">
        {#if releaseItems.length === 0 && !hasMore}
          <p class="collection-releases__empty">В коллекции пока нет релизов</p>
        {:else}
          <ReleaseCardsGrid items={releaseItems} className="collection-releases__grid" />
          {#if isLoadingMore}
            <div class="collection-skel-grid">
              {#each [0, 1] as i (i)}
                <UiV2AnimeCardSkeleton variant="horizontal" />
              {/each}
            </div>
          {/if}
        {/if}
      </section>

      <div class="collection-comments">
        <CommentsSection
          title={commentCount > 0 ? `Комментарии · ${commentCount}` : 'Комментарии'}
          subtitle=""
          items={comments}
          totalCount={commentCount}
          previewLimit={COMMENTS_PREVIEW}
          showAllHref={commentCount > COMMENTS_PREVIEW ? `/collection/${id}/comments` : undefined}
          collectionId={id}
          showComposer={true}
          {selfProfileId}
          onItemsChange={(next) => { comments = next; }}
          onCommentAdded={() => { commentCount += 1; }}
        />
      </div>
    </div>
  {/if}
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
