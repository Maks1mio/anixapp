<script lang="ts" module>
  import type { CommentVoteValue } from '../../types/comment';

  export type UiV2CommentProfile = {
    id: number;
    login: string;
    avatar?: string | null;
    badgeUrl?: string | null;
    badgeName?: string | null;
  };

  /** Узел дерева комментариев (глубокая вложенность через `replies`). */
  export type UiV2CommentNode = {
    id: number | string;
    message: string;
    timestamp: number;
    voteCount: number;
    userVote?: CommentVoteValue;
    isSpoiler?: boolean;
    isEdited?: boolean;
    isDeleted?: boolean;
    postedAtEpisode?: number | null;
    profile: UiV2CommentProfile;
    /** Уже загруженные ответы (дерево). */
    replies?: UiV2CommentNode[];
    /** Число ответов с API, даже если `replies` ещё не подгружены. */
    replyCount?: number;
    /** Для «комментариев недели» и любых кросс-релизных лент */
    releaseId?: number | null;
    releaseTitle?: string | null;
    releaseHint?: string | null;
  };
</script>

<script lang="ts">
  import {
    iconChevronDown,
    iconChevronRight,
    iconChevronUp,
    iconCopy,
    iconEyeOff,
    iconHeart,
    iconMoreHorizontal,
    iconPencil,
    iconReply,
    iconTrash2,
    iconTriangleAlert,
  } from '../icons';
  import UserAvatar from '../UserAvatar.svelte';
  import UserBadge from '../UserBadge.svelte';
  import UiV2RoundButton from './UiV2RoundButton.svelte';
  import UiV2PopupMenu, { type UiV2PopupMenuItem } from './UiV2PopupMenu.svelte';
  import UiV2CommentThreadSkeleton from './UiV2CommentThreadSkeleton.svelte';
  import UiV2CommentThread from './UiV2CommentThread.svelte';
  import UiV2CommentReactions from './UiV2CommentReactions.svelte';
  import UiV2CommentComposer, {
    type UiV2CommentComposerPayload,
  } from './UiV2CommentComposer.svelte';
  import {
    applyVoteDelta,
    episodeContextLabel,
    formatCommentTimestamp,
    hiddenCommentMeta,
    isCommentContentHidden,
    isCommentHideable,
    nextVote,
    repliesLabel,
    voteCountClass,
    formatVoteCountDisplay,
  } from '../../utils/comment';
  import type { CommentData } from '../../types/comment';
  import { tick } from 'svelte';

  type Props = {
    nodes: UiV2CommentNode[];
    depth?: number;
    /** После этой глубины отступ больше не растёт */
    maxIndentDepth?: number;
    class?: string;
    onReply?: (node: UiV2CommentNode) => void;
    onVote?: (node: UiV2CommentNode) => void;
    onMenuSelect?: (id: string, node: UiV2CommentNode) => void;
    onAuthorClick?: (node: UiV2CommentNode) => void;
    onReleaseClick?: (node: UiV2CommentNode) => void;
    /** Клик по телу комментария (например открыть релиз в ленте недели) */
    onCommentClick?: (node: UiV2CommentNode) => void;
    /** Подгрузка ответов, когда API отдал только replyCount */
    onLoadReplies?: (node: UiV2CommentNode) => Promise<void> | void;
    /** Отправка ответа на комментарий */
    onSubmitReply?: (
      node: UiV2CommentNode,
      payload: UiV2CommentComposerPayload,
    ) => void | Promise<void>;
    /** Редактирование своего комментария */
    onEdit?: (
      node: UiV2CommentNode,
      payload: UiV2CommentComposerPayload,
    ) => void | Promise<void>;
    /** Удаление своего комментария */
    onDelete?: (node: UiV2CommentNode) => void | Promise<void>;
    /** id текущего пользователя — для edit/delete в меню */
    selfProfileId?: number | null;
    /** Показывать inline-композер при «Ответить» (по умолчанию да) */
    enableInlineReply?: boolean;
  };

  let {
    nodes,
    depth = 0,
    maxIndentDepth = 4,
    class: className = '',
    onReply,
    onVote,
    onMenuSelect,
    onAuthorClick,
    onReleaseClick,
    onCommentClick,
    onLoadReplies,
    onSubmitReply,
    onEdit,
    onDelete,
    selfProfileId = null,
    enableInlineReply = true,
  }: Props = $props();

  let expanded = $state<Record<string, boolean>>({});
  let spoilerOpen = $state<Record<string, boolean>>({});
  let loadingReplies = $state<Record<string, boolean>>({});
  let menuOpen = $state(false);
  let menuX = $state(0);
  let menuY = $state(0);
  let menuNode = $state<UiV2CommentNode | null>(null);
  let replyTargetId = $state<string | null>(null);
  let replyBusy = $state(false);
  let editingId = $state<string | null>(null);
  let editBusy = $state(false);

  function isMine(node: UiV2CommentNode): boolean {
    return selfProfileId != null && node.profile.id === selfProfileId;
  }

  function menuItemsFor(node: UiV2CommentNode): UiV2PopupMenuItem[] {
    const items: UiV2PopupMenuItem[] = [
      { id: 'reply', label: 'Ответить', icon: iconReply(16) },
      {
        id: 'reactions',
        label: 'Посмотреть реакции',
        icon: iconHeart(16),
        customSubmenu: true,
        submenuWide: true,
      },
      { id: 'copy', label: 'Копировать текст', icon: iconCopy(16), dividerBefore: true },
    ];
    if (isMine(node) && !node.isDeleted && (onEdit || onDelete)) {
      if (onEdit) {
        items.push({ id: 'edit', label: 'Редактировать', icon: iconPencil(16), dividerBefore: true });
      }
      if (onDelete) {
        items.push({
          id: 'delete',
          label: 'Удалить',
          icon: iconTrash2(16),
          danger: true,
          dividerBefore: !onEdit,
        });
      }
    }
    items.push({
      id: 'report',
      label: 'Пожаловаться',
      icon: iconTriangleAlert(16),
      danger: true,
      dividerBefore: true,
    });
    return items;
  }

  function keyOf(id: number | string): string {
    return String(id);
  }

  function isExpanded(node: UiV2CommentNode): boolean {
    const k = keyOf(node.id);
    if (k in expanded) return expanded[k];
    // Авто-раскрытие, только если ответы уже лежат в дереве
    return (node.replies?.length ?? 0) > 0;
  }

  async function toggleReplies(node: UiV2CommentNode, e?: MouseEvent) {
    const k = keyOf(node.id);
    const next = !isExpanded(node);
    const article =
      (e?.currentTarget as HTMLElement | null)?.closest('.uiv2-comment') as HTMLElement | null;

    expanded = { ...expanded, [k]: next };

    if (!next) {
      // После скрытия ответов поднимаем к родительскому комментарию
      await tick();
      requestAnimationFrame(() => {
        scrollCommentIntoView(article);
      });
      return;
    }

    const hasLoaded = (node.replies?.length ?? 0) > 0;
    if (hasLoaded || !onLoadReplies) return;
    if (loadingReplies[k]) return;

    loadingReplies = { ...loadingReplies, [k]: true };
    try {
      await onLoadReplies(node);
    } finally {
      loadingReplies = { ...loadingReplies, [k]: false };
    }
  }

  function scrollCommentIntoView(el: HTMLElement | null) {
    if (!el) return;
    const scroller = el.closest('.uiv2-scroll-area__viewport, .page__scroll, [data-page-scroll]') as HTMLElement | null;
    if (scroller) {
      const er = el.getBoundingClientRect();
      const sr = scroller.getBoundingClientRect();
      const pad = 12;
      const top = scroller.scrollTop + (er.top - sr.top) - pad;
      scroller.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
      return;
    }
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function revealSpoiler(node: UiV2CommentNode) {
    spoilerOpen = { ...spoilerOpen, [keyOf(node.id)]: true };
  }

  function hideSpoiler(node: UiV2CommentNode) {
    spoilerOpen = { ...spoilerOpen, [keyOf(node.id)]: false };
  }

  function asCommentData(node: UiV2CommentNode): CommentData {
    return {
      id: typeof node.id === 'number' ? node.id : 0,
      message: node.message,
      timestamp: node.timestamp,
      voteCount: node.voteCount,
      userVote: (node.userVote ?? 0) as CommentVoteValue,
      isSpoiler: !!node.isSpoiler,
      isEdited: !!node.isEdited,
      isDeleted: !!node.isDeleted,
      replyCount: Math.max(node.replyCount ?? 0, node.replies?.length ?? 0),
      parentCommentId: null,
      postedAtEpisode: node.postedAtEpisode ?? null,
      profile: {
        id: node.profile.id,
        login: node.profile.login,
        avatar: node.profile.avatar ?? '',
        badgeUrl: node.profile.badgeUrl ?? undefined,
        badgeName: node.profile.badgeName ?? undefined,
      },
    };
  }

  function handleVote(node: UiV2CommentNode, action: 'up' | 'down') {
    const current = (node.userVote ?? 0) as CommentVoteValue;
    const next = nextVote(current, action);
    const updated = applyVoteDelta(asCommentData(node), current, next);
    onVote?.({
      ...node,
      userVote: updated.userVote,
      voteCount: updated.voteCount,
    });
  }

  function openMenu(node: UiV2CommentNode, e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const btn = e.currentTarget as HTMLElement;
    const r = btn.getBoundingClientRect();
    menuNode = node;
    menuX = r.left + r.width / 2;
    menuY = r.bottom + 4;
    menuOpen = true;
  }

  function onContextMenu(node: UiV2CommentNode, e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    menuNode = node;
    menuX = e.clientX;
    menuY = e.clientY;
    menuOpen = true;
  }

  function startReply(node: UiV2CommentNode) {
    if (enableInlineReply) {
      replyTargetId = keyOf(node.id);
      void tick().then(() => {
        const el = document.getElementById(`uiv2-comment-reply-${keyOf(node.id)}`);
        if (el) scrollCommentIntoView(el);
      });
    }
    onReply?.(node);
  }

  function cancelReply() {
    replyTargetId = null;
  }

  async function submitReply(node: UiV2CommentNode, payload: UiV2CommentComposerPayload) {
    replyBusy = true;
    try {
      const k = keyOf(node.id);
      const remoteLoaded = (node.replies ?? []).some((r) => !String(r.id).startsWith('local-'));
      const needsLoad =
        !!onLoadReplies && (node.replyCount ?? 0) > 0 && !remoteLoaded;

      // Сначала раскрываем и подгружаем существующие ответы, потом добавляем свой снизу
      expanded = { ...expanded, [k]: true };
      if (needsLoad) {
        loadingReplies = { ...loadingReplies, [k]: true };
        try {
          await onLoadReplies?.(node);
        } finally {
          loadingReplies = { ...loadingReplies, [k]: false };
        }
      }

      await onSubmitReply?.(node, payload);
      replyTargetId = null;
      expanded = { ...expanded, [k]: true };
    } finally {
      replyBusy = false;
    }
  }

  function handleMenuSelect(id: string) {
    if (!menuNode) return;
    if (id === 'reply') startReply(menuNode);
    if (id === 'copy') {
      void navigator.clipboard?.writeText(menuNode.message).catch(() => {});
    }
    if (id === 'edit' && onEdit) {
      editingId = keyOf(menuNode.id);
      spoilerOpen = { ...spoilerOpen, [keyOf(menuNode.id)]: true };
      replyTargetId = null;
    }
    if (id === 'delete' && onDelete) {
      if (window.confirm('Удалить комментарий?')) {
        void onDelete(menuNode);
      }
    }
    onMenuSelect?.(id, menuNode);
  }

  async function submitEdit(node: UiV2CommentNode, payload: UiV2CommentComposerPayload) {
    if (!onEdit || editBusy) return;
    editBusy = true;
    try {
      await onEdit(node, payload);
      editingId = null;
      spoilerOpen = { ...spoilerOpen, [keyOf(node.id)]: !payload.isSpoiler };
    } finally {
      editBusy = false;
    }
  }

  function cancelEdit() {
    editingId = null;
  }

  function replyCount(node: UiV2CommentNode): number {
    return Math.max(node.replyCount ?? 0, node.replies?.length ?? 0);
  }

  function hideRepliesLabel(count: number): string {
    if (count <= 0) return 'Скрыть ответы';
    const mod10 = count % 10;
    const mod100 = count % 100;
    if (mod10 === 1 && mod100 !== 11) return `Скрыть ${count} ответ`;
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) {
      return `Скрыть ${count} ответа`;
    }
    return `Скрыть ${count} ответов`;
  }

  const indentDepth = $derived(Math.min(depth, maxIndentDepth));
</script>

{#if nodes.length}
  <div
    class="uiv2-comments {className}"
    class:uiv2-comments--nested={depth > 0}
    style:--uiv2-comment-depth={indentDepth}
    role="list"
  >
    {#each nodes as node (node.id)}
      {@const data = asCommentData(node)}
      {@const revealed = !!spoilerOpen[keyOf(node.id)]}
      {@const contentHidden = isCommentContentHidden(data, revealed)}
      {@const context = episodeContextLabel(node.postedAtEpisode)}
      {@const count = replyCount(node)}
      {@const open = isExpanded(node)}
      {@const voteClass = voteCountClass(node.voteCount)}
      {@const hideMeta = hiddenCommentMeta(data)}
      {@const canRehide = revealed && isCommentHideable(data)}
      <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
      <article
        class="uiv2-comment"
        class:uiv2-comment--nested={depth > 0}
        class:uiv2-comment--thread={count > 0}
        class:uiv2-comment--thread-open={count > 0 && open}
        role="listitem"
        oncontextmenu={(e) => onContextMenu(node, e)}
      >
        <button
          type="button"
          class="uiv2-comment__avatar"
          aria-label={node.profile.login}
          onclick={() => onAuthorClick?.(node)}
        >
          <UserAvatar src={node.profile.avatar} label={node.profile.login} />
        </button>

        {#if count > 0}
          <span class="uiv2-comment__thread-stem" aria-hidden="true"></span>
        {/if}

        <div class="uiv2-comment__main">
          <div class="uiv2-comment__head">
            <div class="uiv2-comment__head-start">
              <div class="uiv2-comment__head-line">
                <button
                  type="button"
                  class="uiv2-comment__author"
                  onclick={() => onAuthorClick?.(node)}
                >
                  {node.profile.login}
                  <UserBadge
                    url={node.profile.badgeUrl}
                    name={node.profile.badgeName}
                    size="sm"
                    class="uiv2-comment__badge"
                  />
                </button>
                {#if node.isEdited}
                  <span class="uiv2-comment__edited" title="Изменён">{@html iconPencil(13)}</span>
                {/if}
              </div>
              {#if node.timestamp}
                <time class="uiv2-comment__time" datetime={String(node.timestamp)}>
                  {formatCommentTimestamp(node.timestamp)}
                </time>
              {/if}
            </div>
            <span class="uiv2-comment__more-slot">
              <UiV2RoundButton
                size="sm"
                label="Ещё"
                class="uiv2-comment__more"
                ariaHaspopup="menu"
                ariaExpanded={menuOpen && menuNode?.id === node.id}
                onclick={(e) => openMenu(node, e)}
              >
                {@html iconMoreHorizontal(16)}
              </UiV2RoundButton>
            </span>
          </div>

          {#if node.releaseTitle || node.releaseId}
            <div class="uiv2-comment__release-row">
              <span class="uiv2-comment__release-hint">{node.releaseHint ?? 'к релизу'}</span>
              <button
                type="button"
                class="uiv2-comment__release"
                onclick={(e) => {
                  e.stopPropagation();
                  onReleaseClick?.(node);
                }}
              >
                <span>{node.releaseTitle ?? `Релиз #${node.releaseId}`}</span>
                <span aria-hidden="true">{@html iconChevronRight(14)}</span>
              </button>
            </div>
          {/if}

          {#if context}
            <div class="uiv2-comment__context">{context}</div>
          {/if}

          {#if node.isDeleted}
            <div class="uiv2-comment__deleted">Комментарий удалён</div>
          {:else if editingId === keyOf(node.id)}
            <div class="uiv2-comment__edit">
              {#key node.id}
                <UiV2CommentComposer
                  fieldLabel="Редактирование"
                  initialMessage={node.message}
                  initialIsSpoiler={!!node.isSpoiler}
                  resetOnSubmit={false}
                  busy={editBusy}
                  autofocus={true}
                  onCancel={cancelEdit}
                  onSubmit={(payload) => submitEdit(node, payload)}
                />
              {/key}
            </div>
          {:else if contentHidden}
            <button
              type="button"
              class="uiv2-comment__spoiler-gate uiv2-comment__spoiler-gate--{hideMeta.kind}"
              onclick={() => revealSpoiler(node)}
            >
              <span class="uiv2-comment__spoiler-gate-main">
                <span class="uiv2-comment__spoiler-gate-icon" aria-hidden="true">
                  {@html iconEyeOff(16)}
                </span>
                <span class="uiv2-comment__spoiler-gate-copy">
                  <span class="uiv2-comment__spoiler-gate-title">{hideMeta.title}</span>
                  <span class="uiv2-comment__spoiler-gate-desc">{hideMeta.desc}</span>
                </span>
              </span>
              <span class="uiv2-comment__spoiler-gate-cta">Показать</span>
            </button>
          {:else if onCommentClick}
            <button
              type="button"
              class="uiv2-comment__body uiv2-comment__body--button"
              onclick={() => onCommentClick(node)}
            >
              {node.message}
            </button>
          {:else}
            <div class="uiv2-comment__body">{node.message}</div>
          {/if}
          {#if canRehide}
            <button
              type="button"
              class="uiv2-comment__spoiler-hide"
              onclick={() => hideSpoiler(node)}
            >
              Скрыть снова
            </button>
          {/if}

          {#if !node.isDeleted}
            <div class="uiv2-comment__footer">
              <button type="button" class="uiv2-comment__reply" onclick={() => startReply(node)}>
                Ответить
              </button>

              <div class="uiv2-comment__vote">
                <button
                  type="button"
                  class="uiv2-comment__vote-btn"
                  class:uiv2-comment__vote-btn--down={node.userVote === 1}
                  aria-label="Дизлайк"
                  onclick={() => handleVote(node, 'down')}
                >
                  {@html iconChevronDown(18)}
                </button>
                <span class="uiv2-comment__vote-count uiv2-comment__vote-count--{voteClass}">
                  {formatVoteCountDisplay(node.voteCount)}
                </span>
                <button
                  type="button"
                  class="uiv2-comment__vote-btn"
                  class:uiv2-comment__vote-btn--up={node.userVote === 2}
                  aria-label="Лайк"
                  onclick={() => handleVote(node, 'up')}
                >
                  {@html iconChevronUp(18)}
                </button>
              </div>
            </div>
          {/if}
        </div>

        {#if count > 0 && !open}
          <div class="uiv2-comment__replies-row">
            <span class="uiv2-comment__thread-elbow" aria-hidden="true"></span>
            <button
              type="button"
              class="uiv2-comment__toggle"
              disabled={!!loadingReplies[keyOf(node.id)]}
              onclick={(e) => void toggleReplies(node, e)}
            >
              <span>
                {#if loadingReplies[keyOf(node.id)]}
                  Загрузка ответов…
                {:else}
                  {repliesLabel(count)}
                {/if}
              </span>
              <span class="uiv2-comment__toggle-icon" aria-hidden="true">{@html iconChevronRight(16)}</span>
            </button>
          </div>
        {/if}

        {#if enableInlineReply && replyTargetId === keyOf(node.id)}
          <div class="uiv2-comment__composer-slot" id="uiv2-comment-reply-{keyOf(node.id)}">
            <UiV2CommentComposer
              replyToLogin={node.profile.login}
              autofocus={true}
              busy={replyBusy}
              requireLogin={false}
              onCancelReply={cancelReply}
              onSubmit={(payload) => submitReply(node, payload)}
            />
          </div>
        {/if}

        {#if count > 0 && open}
          <div class="uiv2-comment__replies">
            {#if (node.replies?.length ?? 0) > 0}
              <UiV2CommentThread
                nodes={node.replies ?? []}
                depth={depth + 1}
                {maxIndentDepth}
                {onReply}
                {onVote}
                {onMenuSelect}
                {onAuthorClick}
                {onReleaseClick}
                {onCommentClick}
                {onLoadReplies}
                {onSubmitReply}
                {onEdit}
                {onDelete}
                {selfProfileId}
                {enableInlineReply}
              />
            {:else if loadingReplies[keyOf(node.id)]}
              <div class="uiv2-comment__replies-skeleton">
                <UiV2CommentThreadSkeleton count={2} nested={true} />
              </div>
            {/if}

            <div class="uiv2-comment__replies-row uiv2-comment__replies-row--end">
              <span class="uiv2-comment__thread-elbow" aria-hidden="true"></span>
              <button
                type="button"
                class="uiv2-comment__toggle uiv2-comment__toggle--open"
                onclick={(e) => void toggleReplies(node, e)}
              >
                <span>{hideRepliesLabel(count)}</span>
                <span class="uiv2-comment__toggle-icon" aria-hidden="true">{@html iconChevronRight(16)}</span>
              </button>
            </div>
          </div>
        {/if}
      </article>
    {/each}
  </div>
{/if}

<UiV2PopupMenu
  open={menuOpen}
  x={menuX}
  y={menuY}
  items={menuNode ? menuItemsFor(menuNode) : []}
  onClose={() => {
    menuOpen = false;
    menuNode = null;
  }}
  onSelect={handleMenuSelect}
>
  {#snippet submenuContent(item)}
    {#if item.id === 'reactions' && menuNode}
      <UiV2CommentReactions commentId={menuNode.id} />
    {/if}
  {/snippet}
</UiV2PopupMenu>
