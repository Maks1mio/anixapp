<script lang="ts">
  import { tick } from 'svelte';
  import UiV2Button from '../uikit-v2/UiV2Button.svelte';
  import UiV2Select, { type UiV2SelectOption } from '../uikit-v2/UiV2Select.svelte';
  import UiV2ScrollArea from '../uikit-v2/UiV2ScrollArea.svelte';
  import UiV2FeedPost from '../uikit-v2/UiV2FeedPost.svelte';
  import UiV2FeedPostEmbed from '../uikit-v2/UiV2FeedPostEmbed.svelte';
  import UiV2Tooltip from '../uikit-v2/UiV2Tooltip.svelte';
  import {
    iconArrowDown,
    iconArrowLeft,
    iconArrowRight,
    iconArrowUp,
    iconBold,
    iconImage,
    iconItalic,
    iconLink,
    iconList,
    iconListOrdered,
    iconMinus,
    iconPaperclip,
    iconPlus,
    iconQuote,
    iconRotateCcw,
    iconRotateCw,
    iconTrash2,
    iconX,
  } from '../icons';
  import {
    ARTICLE_MAX_BLOCKS,
    ARTICLE_MAX_MEDIA_ITEMS,
    buildArticlePayload,
    cloneEditorBlocks,
    detectEmbedType,
    editorBlocksForDraft,
    editorHasContent,
    editorPlainText,
    editorTempFileName,
    emptyParagraph,
    fileToDataUrl,
    generateBlockId,
    looksLikeUrl,
    editorBlocksFromPayload,
    parseEditorPayloadJson,
    sanitizeEditorHtml,
    stringifyEditorPayload,
    type ArticleEditorBlock,
    type ArticleEditorEmbedData,
    type ArticleEditorMediaItem,
  } from '../../utils/feed-article-create';
  import { channelAvatarUrl } from '../../utils/feed-article';
  import { isKeyCode, isLetterKey } from '../../utils/hotkeys';
  import { toFeedImageUrl } from '../../utils/posterUrl';
  import { feedArticleToUiV2FeedPost } from '../../utils/uikit-v2-feed-post';
  import { showToast } from '../../stores/toast';
  import type { FeedArticle } from '../../types/feed';
  import {
    deleteFeedDraft,
    newDraftId,
    upsertFeedDraft,
    type FeedArticleDraft,
  } from '../../utils/feed-article-drafts';

  export type FeedComposerChannel = {
    id: number;
    title: string;
    avatar?: string | null;
    is_blog?: boolean;
  };

  type Props = {
    open: boolean;
    channels: FeedComposerChannel[];
    initialChannelId?: number | null;
    createBusy?: boolean;
    repostArticle?: FeedArticle | null;
    /** Редактирование существующей записи. */
    editArticle?: FeedArticle | null;
    draftId?: string | null;
    initialDraft?: FeedArticleDraft | null;
    mode?: 'overlay' | 'window';
    /** Режим предложения записи в чужой канал. */
    isSuggestion?: boolean;
    onClose: () => void;
    onPublished?: (articleId: number, channelId: number) => void;
    onCreateBlog?: () => void | Promise<void>;
  };

  let {
    open,
    channels,
    initialChannelId = null,
    createBusy = false,
    repostArticle = null,
    editArticle = null,
    draftId = null,
    initialDraft = null,
    mode = 'overlay',
    isSuggestion = false,
    onClose,
    onPublished,
    onCreateBlog,
  }: Props = $props();

  const isEditMode = $derived(!!editArticle && Number(editArticle.id) > 0 && !isSuggestion);

  type Step = 'edit' | 'preview';
  type EditView = 'block' | 'code';

  let step = $state<Step>('edit');
  let editView = $state<EditView>('block');
  let codeText = $state('');
  let codeError = $state('');
  let channelId = $state<number | null>(null);
  let isSigned = $state(false);
  let selfProfile = $state<{ id: number; login: string; avatar?: string | null } | null>(null);
  let blocks = $state<ArticleEditorBlock[]>([emptyParagraph()]);
  let focusedId = $state<string | null>(null);
  let focusedItem = $state<number | null>(null);
  let publishBusy = $state(false);
  let mediaBusy = $state(false);
  let errorMsg = $state('');
  let addOpen = $state(false);
  let moreOpen = $state(false);
  let channelOpen = $state(false);
  let linkOpen = $state(false);
  let linkMode = $state<'inline' | 'embed'>('inline');
  let linkValue = $state('');
  let linkRange: Range | null = null;
  let inlineOpen = $state(false);
  let inlineX = $state(0);
  let inlineY = $state(0);
  let mediaToken = $state('');
  let mediaTokenChannelId = $state<number | null>(null);
  let fileInput = $state<HTMLInputElement | null>(null);
  let mediaBusyId = $state<string | null>(null);
  let wasOpen = $state(false);
  let history = $state<ArticleEditorBlock[][]>([]);
  let historyIndex = $state(-1);
  let historyLock = $state(false);
  let activeDraftId = $state('');
  let inlineBold = $state(false);
  let inlineItalic = $state(false);
  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  let historyTimer: ReturnType<typeof setTimeout> | null = null;
  const liveUploads = new Map<string, { abort: () => void; cancelled: boolean }>();
  const isWindow = $derived(mode === 'window');

  $effect(() => {
    if (!open || channelId != null) return;
    const first = channels[0]?.id ?? null;
    if (first != null) channelId = first;
  });

  const selectedChannel = $derived.by((): FeedComposerChannel | null => {
    const fromList = channels.find((c) => c.id === channelId) ?? null;
    if (fromList) return fromList;
    if (isEditMode && editArticle?.channel && Number(editArticle.channel.id) === Number(channelId)) {
      return {
        id: Number(editArticle.channel.id),
        title: editArticle.channel.title || `Канал #${editArticle.channel.id}`,
        avatar: editArticle.channel.avatar,
        is_blog: !!editArticle.channel.is_blog,
      };
    }
    return null;
  });
  const blogs = $derived(channels.filter((c) => c.is_blog));
  const groups = $derived(channels.filter((c) => !c.is_blog));

  $effect(() => {
    if (!selectedChannel) return;
    if (selectedChannel.is_blog) isSigned = false;
  });

  const channelOptions = $derived.by((): UiV2SelectOption[] => {
    const out: UiV2SelectOption[] = [];
    for (const ch of blogs) {
      out.push({
        value: String(ch.id),
        label: ch.title || `Блог #${ch.id}`,
        desc: 'Блог',
      });
    }
    for (const ch of groups) {
      out.push({
        value: String(ch.id),
        label: ch.title || `Канал #${ch.id}`,
        desc: 'Канал',
      });
    }
    return out;
  });
  const focusedIndex = $derived(blocks.findIndex((b) => b.id === focusedId));
  const focusedBlock = $derived(focusedIndex >= 0 ? blocks[focusedIndex] : null);
  const blockKind = $derived(
    focusedBlock?.type === 'list'
      ? (focusedBlock.style === 'ordered' ? 'ordered' : 'list')
      : (focusedBlock?.type ?? 'paragraph'),
  );
  const canUndo = $derived.by(() => {
    if (historyIndex > 0) return true;
    if (historyIndex < 0 || !history[historyIndex]) return false;
    return JSON.stringify(blocks) !== JSON.stringify(history[historyIndex]);
  });
  const canRedo = $derived.by(() => {
    if (historyIndex < 0 || historyIndex >= history.length - 1) return false;
    return JSON.stringify(blocks) === JSON.stringify(history[historyIndex]);
  });

  function codeViewCanPreview(): boolean {
    try {
      return editorHasContent(parseEditorPayloadJson(codeText));
    } catch {
      return true;
    }
  }

  const effectiveRepost = $derived.by((): FeedArticle | null => {
    if (isSuggestion) return null;
    if (isEditMode) {
      const nested = editArticle?.repost_article;
      return nested && Number(nested.id) > 0 ? nested : null;
    }
    return repostArticle && Number(repostArticle.id) > 0 ? repostArticle : null;
  });

  const canGoPreview = $derived(
    !mediaBusy && (
      (editView === 'code'
        ? codeViewCanPreview()
        : editorHasContent(blocks))
      || (!isSuggestion && !!effectiveRepost && Number(effectiveRepost.id) > 0)
    ),
  );
  const canPublish = $derived(
    !!channelId
    && canGoPreview
    && !publishBusy
    && !createBusy
    && !mediaBusy,
  );
  const headerTitle = $derived(
    isSuggestion
      ? (step === 'preview' ? 'Предпросмотр предложения' : 'Предложение записи')
      : isEditMode
        ? (step === 'preview' ? 'Предпросмотр' : 'Редактирование')
        : repostArticle
          ? 'Репост'
          : step === 'preview'
            ? 'Предпросмотр'
            : 'Новая запись',
  );
  function wantSigned(): boolean {
    if (selectedChannel?.is_blog) return false;
    return isSigned === true;
  }

  const previewPost = $derived.by(() => {
    if (step !== 'preview') return null;
    const signed = wantSigned();
    const payload = buildArticlePayload(blocks, {
      isSigned: signed,
      repostArticleId: isSuggestion ? null : (Number(effectiveRepost?.id ?? 0) || null),
    });
    const article: FeedArticle = {
      id: Number(editArticle?.id ?? 0),
      channel: selectedChannel
        ? {
            id: selectedChannel.id,
            title: selectedChannel.title,
            avatar: selectedChannel.avatar ?? undefined,
            is_blog: selectedChannel.is_blog,
          }
        : { id: 0, title: 'Канал' },
      author: signed && selfProfile
        ? {
            id: selfProfile.id,
            login: selfProfile.login,
            avatar: selfProfile.avatar,
          }
        : null,
      payload: payload.payload,
      creation_date: Math.floor(Date.now() / 1000),
      is_signed: signed,
      contains_repost_article: !!effectiveRepost && !isSuggestion,
      repost_article: !isSuggestion ? (effectiveRepost ?? null) : null,
      comment_count: 0,
      vote_count: 0,
      repost_count: 0,
    };
    return feedArticleToUiV2FeedPost(article);
  });

  $effect(() => {
    if (open && !wasOpen) {
      resetComposer();
    }
    wasOpen = open;
  });

  $effect(() => {
    if (!open) return;
    const onSel = () => updateInlineToolbar();
    document.addEventListener('selectionchange', onSel);
    return () => document.removeEventListener('selectionchange', onSel);
  });

  $effect(() => {
    if (!open || step !== 'edit') return;
    const handler = (e: ClipboardEvent) => {
      void onPaste(e);
    };
    document.addEventListener('paste', handler, true);
    return () => document.removeEventListener('paste', handler, true);
  });

  $effect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => onShellKeydown(e);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  $effect(() => {
    if (!open) return;
    const onReq = () => requestClose();
    window.addEventListener('anix:composer-request-close', onReq);
    return () => window.removeEventListener('anix:composer-request-close', onReq);
  });

  $effect(() => {
    if (!open) return;
    blocks;
    codeText;
    channelId;
    isSigned;
    repostArticle;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => persistDraft(), 500);
    return () => {
      if (saveTimer) {
        clearTimeout(saveTimer);
        saveTimer = null;
      }
    };
  });

  $effect(() => {
    if (!open) return;
    const onProgress = (event: Event) => {
      const detail = (event as CustomEvent<{ uploadId?: string; progress?: number }>).detail;
      const id = String(detail?.uploadId || '');
      if (!id || !liveUploads.has(id)) return;
      const value = Math.round(Number(detail?.progress) || 0);
      patchMediaUpload(id, { uploadProgress: Math.max(1, Math.min(99, value)) });
    };
    window.addEventListener('anix:article-upload-progress', onProgress);
    return () => window.removeEventListener('anix:article-upload-progress', onProgress);
  });

  function resetComposer() {
    for (const upload of liveUploads.values()) {
      upload.cancelled = true;
      upload.abort();
    }
    liveUploads.clear();
    if (historyTimer) {
      clearTimeout(historyTimer);
      historyTimer = null;
    }
    step = 'edit';
    editView = 'block';
    codeText = '';
    codeError = '';
    errorMsg = '';
    addOpen = false;
    moreOpen = false;
    channelOpen = false;
    linkOpen = false;
    linkMode = 'inline';
    linkValue = '';
    linkRange = null;
    inlineOpen = false;
    mediaBusy = false;
    mediaBusyId = null;
    publishBusy = false;
    focusedId = null;
    focusedItem = null;
    mediaToken = '';
    mediaTokenChannelId = null;
    const editing = isEditMode ? editArticle : null;
    const source = editing ? null : initialDraft;
    activeDraftId = editing
      ? ''
      : (source?.id || draftId || newDraftId());
    const editChannelId = Number(editing?.channel?.id ?? 0);
    const preferred = editing && editChannelId > 0
      ? editChannelId
      : (source?.channelId
        ?? (initialChannelId != null
          && (isSuggestion || channels.some((c) => c.id === initialChannelId))
          ? initialChannelId
          : (channels[0]?.id ?? null)));
    channelId = preferred;
    const preferredChannel = channels.find((c) => c.id === preferred);
    if (preferredChannel?.is_blog) {
      isSigned = false;
    } else if (isSuggestion) {
      isSigned = source?.isSigned ?? false;
    } else if (editing) {
      isSigned = !!editing.is_signed;
    } else {
      isSigned = source?.isSigned ?? true;
    }
    void loadSelfProfile();
    const start = editing
      ? editorBlocksFromPayload(editing.payload)
      : (source?.blocks?.length
        ? cloneEditorBlocks(source.blocks)
        : [emptyParagraph()]);
    blocks = start;
    history = [cloneEditorBlocks(start)];
    historyIndex = 0;
    void tick().then(() => focusBlock(start[0].id));
  }

  function pushHistory() {
    if (historyLock) return;
    if (historyTimer) {
      clearTimeout(historyTimer);
      historyTimer = null;
    }
    const snap = cloneEditorBlocks(blocks);
    if (historyIndex >= 0 && JSON.stringify(history[historyIndex]) === JSON.stringify(snap)) return;
    const next = [...history.slice(0, historyIndex + 1), snap].slice(-60);
    history = next;
    historyIndex = next.length - 1;
  }

  function scheduleHistory() {
    if (historyLock) return;
    if (historyTimer) clearTimeout(historyTimer);
    historyTimer = setTimeout(() => {
      historyTimer = null;
      pushHistory();
    }, 450);
  }

  function applyHistorySnapshot(index: number) {
    if (index < 0 || index >= history.length) return;
    const keepId = focusedId;
    historyLock = true;
    if (historyTimer) {
      clearTimeout(historyTimer);
      historyTimer = null;
    }
    historyIndex = index;
    blocks = cloneEditorBlocks(history[index]);
    historyLock = false;
    void tick().then(() => {
      const id = (keepId && blocks.some((block) => block.id === keepId))
        ? keepId
        : (blocks[0]?.id ?? '');
      if (id) focusBlock(id, null, 'end');
    });
  }

  function undo() {
    if (historyIndex >= 0 && JSON.stringify(blocks) !== JSON.stringify(history[historyIndex])) {
      applyHistorySnapshot(historyIndex);
      return;
    }
    if (historyIndex <= 0) return;
    applyHistorySnapshot(historyIndex - 1);
  }

  function redo() {
    if (historyIndex < 0 || historyIndex >= history.length - 1) return;
    if (JSON.stringify(blocks) !== JSON.stringify(history[historyIndex])) {
      applyHistorySnapshot(historyIndex);
      return;
    }
    applyHistorySnapshot(historyIndex + 1);
  }

  function bindHtml(node: HTMLElement, html: string) {
    node.innerHTML = html || '';
    return {
      update(next: string) {
        const value = next || '';
        if (node.innerHTML === value) return;
        node.innerHTML = value;
      },
    };
  }

  function closeMenus() {
    addOpen = false;
    moreOpen = false;
    channelOpen = false;
  }

  function persistDraft(): void {
    if (isEditMode || !activeDraftId || publishBusy) return;
    if (editView === 'code') {
      try {
        const next = parseEditorPayloadJson(codeText);
        codeError = '';
        if (JSON.stringify(next) !== JSON.stringify(blocks)) blocks = next;
      } catch {
        /* оставляем последний валидный набор блоков */
      }
    }
    upsertFeedDraft({
      id: activeDraftId,
      channelId,
      isSigned,
      blocks: editorBlocksForDraft(blocks),
      repostArticle,
    });
    window.electron?.composerDraftsChanged?.();
  }

  function applyCodeView(announce: boolean): boolean {
    try {
      const next = parseEditorPayloadJson(codeText);
      if (JSON.stringify(next) !== JSON.stringify(blocks)) {
        blocks = next;
        pushHistory();
      }
      codeError = '';
      errorMsg = '';
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Некорректный JSON';
      codeError = message;
      if (announce) {
        errorMsg = message;
        showToast(message, 'err');
      }
      return false;
    }
  }

  function setEditView(next: EditView) {
    if (next === editView) return;
    if (next === 'code') {
      closeMenus();
      inlineOpen = false;
      codeText = stringifyEditorPayload(blocks);
      codeError = '';
      editView = 'code';
      void tick().then(() => document.getElementById('feed-composer-code')?.focus());
      return;
    }
    if (!applyCodeView(true)) return;
    editView = 'block';
    void tick().then(() => focusBlock(blocks[0]?.id ?? ''));
  }

  function requestClose() {
    if (publishBusy || mediaBusy) return;
    persistDraft();
    onClose();
  }

  async function loadSelfProfile(): Promise<void> {
    try {
      const res = await window.anixApi?.profile?.self?.();
      const profile = res?.profile as { id?: number; login?: string; avatar?: string | null } | undefined;
      const id = Number(profile?.id ?? 0);
      const login = String(profile?.login ?? '').trim();
      if (id > 0 && login) {
        selfProfile = {
          id,
          login,
          avatar: profile?.avatar ?? null,
        };
        return;
      }
    } catch {
      /* ignore */
    }
    selfProfile = null;
  }

  function onChannelChange(value: string) {
    const n = Number(value);
    channelId = Number.isFinite(n) && n > 0 ? n : null;
    mediaToken = '';
    mediaTokenChannelId = null;
    const ch = channels.find((c) => c.id === channelId);
    if (ch?.is_blog) {
      isSigned = false;
    } else if (!isSuggestion) {
      isSigned = !!ch;
    }
  }

  function pickChannel(id: number) {
    channelId = id;
    channelOpen = false;
    mediaToken = '';
    mediaTokenChannelId = null;
    const ch = channels.find((c) => c.id === id);
    if (ch?.is_blog) {
      isSigned = false;
    } else if (!isSuggestion) {
      isSigned = !!ch;
    }
  }

  async function ensureMediaToken(): Promise<string> {
    if (mediaToken && mediaTokenChannelId === channelId) return mediaToken;
    if (!channelId) throw new Error('Сначала выберите канал или блог');
    const api = window.anixApi?.channel?.editorAvailable;
    if (!api) throw new Error('API редактора недоступно');
    const res = await api(channelId, { isSuggestion, isEditMode });
    const token = String(res?.media_upload_token ?? '').trim();
    if (!token) {
      throw new Error(
        isSuggestion
          ? 'Нет прав на загрузку медиа для предложения'
          : isEditMode
            ? 'Нет прав на загрузку медиа при редактировании'
            : 'Нет прав на загрузку медиа в этот канал',
      );
    }
    mediaToken = token;
    mediaTokenChannelId = channelId;
    return token;
  }

  function mediaErrorMessage(err: unknown, fallback: string): string {
    let raw = err instanceof Error ? err.message : String(err);
    raw = raw.replace(/^Error invoking remote method '[^']+':\s*/i, '');
    raw = raw.replace(/^(HttpError|Error):\s*/i, '').trim();
    if (/content\/upload|Не найдено|HTTP 404/i.test(raw)) return fallback;
    if (/401|403|Нет прав|Unauthorized/i.test(raw)) return 'Нет прав на загрузку медиа в этот канал';
    if (/413|too large|слишком большой/i.test(raw)) return 'Файл слишком большой';
    return raw || fallback;
  }

  function patchMediaUpload(
    uploadId: string,
    patch: Partial<ArticleEditorMediaItem>,
  ): void {
    blocks = blocks.map((block) => {
      if (block.type !== 'media') return block;
      const index = block.items.findIndex((item) => item.id === uploadId);
      if (index < 0) return block;
      const items = [...block.items];
      items[index] = { ...items[index], ...patch };
      return { ...block, items };
    });
  }

  function removeMediaUpload(uploadId: string): void {
    blocks = blocks.map((block) => block.type === 'media'
      ? { ...block, items: block.items.filter((item) => item.id !== uploadId) }
      : block);
  }

  function cancelMediaUpload(item: ArticleEditorMediaItem): void {
    const upload = liveUploads.get(item.id);
    if (!upload) return;
    upload.cancelled = true;
    upload.abort();
  }

  async function uploadImageFile(
    file: File,
    uploadId: string,
    dataUrl: string,
  ): Promise<ArticleEditorMediaItem> {
    const token = await ensureMediaToken();
    const api = window.anixApi?.article?.uploadImage;
    if (!api) throw new Error('Загрузка изображений недоступна');
    const fromMime = (file.type.split('/')[1] || '').replace(/[^a-z0-9]/gi, '');
    const fromName = (file.name.split('.').pop() || '').replace(/[^a-z0-9]/gi, '');
    const ext = (fromName || fromMime || 'jpg').replace(/^jpeg$/i, 'jpg');
    const res = await api(token, dataUrl, editorTempFileName(ext), uploadId);
    if (res?.aborted || liveUploads.get(uploadId)?.cancelled) {
      const err = new Error('Загрузка отменена');
      err.name = 'AbortError';
      throw err;
    }
    const fileInfo = res?.file;
    const url = String(fileInfo?.url ?? '').trim();
    if (Number(res?.success) !== 1 || !url) {
      throw new Error('Не удалось загрузить изображение');
    }
    return {
      id: String(fileInfo?.id ?? generateBlockId()),
      url,
      hash: String(fileInfo?.hash ?? ''),
      width: Number(fileInfo?.width ?? 0) || 0,
      height: Number(fileInfo?.height ?? 0) || 0,
      localPreview: dataUrl,
      uploadProgress: undefined,
    };
  }

  function insertBlock(block: ArticleEditorBlock, afterIndex = focusedIndex) {
    if (blocks.length >= ARTICLE_MAX_BLOCKS) {
      showToast('Не больше 25 блоков в записи', 'err');
      return;
    }
    const at = afterIndex >= 0 ? afterIndex + 1 : blocks.length;
    const next = [...blocks];
    next.splice(at, 0, block);
    blocks = next;
    pushHistory();
    void tick().then(() => focusBlock(block.id));
  }

  function replaceBlock(index: number, block: ArticleEditorBlock) {
    if (index < 0 || index >= blocks.length) return;
    const next = [...blocks];
    next[index] = block;
    blocks = next;
    pushHistory();
  }

  function removeBlock(index: number) {
    const removed = blocks[index];
    if (removed?.type === 'media') {
      removed.items.forEach(cancelMediaUpload);
    }
    if (blocks.length <= 1) {
      blocks = [emptyParagraph()];
      pushHistory();
      void tick().then(() => focusBlock(blocks[0].id, null, 'end'));
      return;
    }
    const next = blocks.filter((_, i) => i !== index);
    blocks = next.length ? next : [emptyParagraph()];
    pushHistory();
    const prev = blocks[Math.max(0, index - 1)];
    void tick().then(() => focusBlock(prev.id, lastItemIndex(prev), 'end'));
  }

  function moveBlock(index: number, dir: -1 | 1) {
    const to = index + dir;
    if (to < 0 || to >= blocks.length) return;
    const next = [...blocks];
    const [item] = next.splice(index, 1);
    next.splice(to, 0, item);
    blocks = next;
    pushHistory();
    void tick().then(() => focusBlock(item.id, lastItemIndex(item)));
  }

  function lastItemIndex(block: ArticleEditorBlock): number | null {
    return block.type === 'list' ? Math.max(0, block.items.length - 1) : null;
  }

  function mediaPreviewSrc(item: ArticleEditorMediaItem, grid: boolean): string {
    if (item.localPreview) return item.localPreview;
    return toFeedImageUrl(item.url, grid ? 'tile' : 'full', item);
  }

  function isCaretAtStart(el: HTMLElement): boolean {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount || !sel.isCollapsed) return false;
    const range = sel.getRangeAt(0);
    const pre = range.cloneRange();
    pre.selectNodeContents(el);
    pre.setEnd(range.startContainer, range.startOffset);
    return pre.toString().replace(/\u00a0/g, ' ').trim() === '';
  }

  function placeCaretAtEnd(el: HTMLElement): void {
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  }

  function placeCaretAtTextOffset(el: HTMLElement, offset: number): void {
    el.focus();
    const sel = window.getSelection();
    if (!sel) return;
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let remaining = Math.max(0, offset);
    let node = walker.nextNode();
    if (!node) {
      placeCaretAtEnd(el);
      return;
    }
    while (node) {
      const len = node.textContent?.length ?? 0;
      if (remaining <= len) {
        const range = document.createRange();
        range.setStart(node, remaining);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
        return;
      }
      remaining -= len;
      node = walker.nextNode();
    }
    placeCaretAtEnd(el);
  }

  function joinEditorHtml(left: string, right: string): string {
    const a = String(left ?? '').replace(/(<br\s*\/?>|\s)+$/i, '');
    const b = String(right ?? '').replace(/^(<br\s*\/?>|\s)+/i, '');
    if (!a) return b;
    if (!b) return a;
    return `${a}${b}`;
  }

  function textLenOf(html: string): number {
    const host = document.createElement('div');
    host.innerHTML = html || '';
    return host.textContent?.length ?? 0;
  }

  function mergeIntoPrevious(index: number, html: string): void {
    const prev = blocks[index - 1];
    if (!prev) {
      removeBlock(index);
      return;
    }
    if (prev.type === 'list') {
      const last = Math.max(0, prev.items.length - 1);
      const joinAt = textLenOf(prev.items[last] ?? '');
      const items = [...prev.items];
      items[last] = joinEditorHtml(items[last], html);
      const next = blocks.filter((_, i) => i !== index);
      next[index - 1] = { ...prev, items };
      blocks = next;
      pushHistory();
      void tick().then(() => focusBlock(prev.id, last, 'end', joinAt));
      return;
    }
    if (prev.type === 'paragraph' || prev.type === 'header' || prev.type === 'quote') {
      const joinAt = textLenOf(prev.html);
      const next = blocks.filter((_, i) => i !== index);
      next[index - 1] = { ...prev, html: joinEditorHtml(prev.html, html) };
      blocks = next;
      pushHistory();
      void tick().then(() => focusBlock(prev.id, null, 'end', joinAt));
      return;
    }
    const next = blocks.filter((_, i) => i !== index);
    blocks = next.length ? next : [emptyParagraph()];
    pushHistory();
    void tick().then(() => focusBlock(prev.id, lastItemIndex(prev), 'end'));
  }

  function focusBlock(
    id: string,
    itemIndex: number | null = null,
    where: 'start' | 'end' = 'start',
    textOffset?: number,
  ) {
    focusedId = id;
    focusedItem = itemIndex;
    const el = itemIndex != null
      ? document.querySelector<HTMLElement>(`[data-block-id="${id}"][data-item-index="${itemIndex}"]`)
      : document.querySelector<HTMLElement>(`[data-block-id="${id}"][data-field="main"]`)
        ?? document.querySelector<HTMLElement>(`[data-block-id="${id}"]`);
    if (!el) return;
    if (typeof textOffset === 'number') {
      placeCaretAtTextOffset(el, textOffset);
      return;
    }
    if (where === 'end') {
      placeCaretAtEnd(el);
      return;
    }
    el.focus();
  }

  function updateBlockHtml(id: string, html: string, extra?: { itemIndex?: number; field?: 'caption' }) {
    const index = blocks.findIndex((b) => b.id === id);
    if (index < 0) return;
    const block = blocks[index];
    if (block.type === 'list' && extra?.itemIndex != null) {
      const items = [...block.items];
      items[extra.itemIndex] = html;
      blocks = blocks.map((b, i) => (i === index ? { ...block, items } : b));
      scheduleHistory();
      return;
    }
    if (block.type === 'quote' && extra?.field === 'caption') {
      blocks = blocks.map((b, i) => (i === index ? { ...block, caption: html } : b));
      scheduleHistory();
      return;
    }
    if (block.type === 'paragraph' || block.type === 'header' || block.type === 'quote') {
      blocks = blocks.map((b, i) => (i === index ? { ...block, html } : b));
      scheduleHistory();
    }
  }

  function commitHtml() {
    pushHistory();
  }

  function pickImages(blockId?: string) {
    if (mediaBusy) return;
    if (blockId) focusedId = blockId;
    fileInput?.click();
  }

  async function addImages(files: File[]) {
    const images = files.filter((f) => f.type.startsWith('image/'));
    if (!images.length || mediaBusy) return;

    let index = focusedIndex >= 0 ? focusedIndex : Math.max(0, blocks.length - 1);
    let block = index >= 0 ? blocks[index] : null;
    const remainingGuess = block?.type === 'media'
      ? ARTICLE_MAX_MEDIA_ITEMS - block.items.length
      : ARTICLE_MAX_MEDIA_ITEMS;
    const batch = images.slice(0, Math.max(0, remainingGuess));
    if (!batch.length) {
      showToast('В этом блоке уже максимум изображений', 'err');
      return;
    }
    if (images.length > batch.length) {
      showToast(`Добавлено ${batch.length} из ${images.length} — лимит блока`, 'err');
    }

    const pendingItems = await Promise.all(batch.map(async (file) => ({
      file,
      item: {
        id: `upload-${crypto.randomUUID()}`,
        url: '',
        hash: '',
        width: 0,
        height: 0,
        localPreview: await fileToDataUrl(file),
        uploadProgress: 0,
      } satisfies ArticleEditorMediaItem,
    })));

    if (block?.type !== 'media') {
      if (blocks.length >= ARTICLE_MAX_BLOCKS) {
        showToast('Не больше 25 блоков в записи', 'err');
        return;
      }
      const created = {
        id: generateBlockId(),
        type: 'media' as const,
        items: pendingItems.map(({ item }) => item),
      };
      mediaBusy = true;
      mediaBusyId = created.id;
      focusedId = created.id;
      const at = index >= 0 ? index + 1 : blocks.length;
      const next = [...blocks];
      next.splice(at, 0, created);
      blocks = next;
      await tick();
      index = blocks.findIndex((item) => item.id === created.id);
      block = index >= 0 ? blocks[index] : null;
    }
    if (block?.type !== 'media' || index < 0) {
      mediaBusy = false;
      mediaBusyId = null;
      return;
    }

    const targetId = block.id;
    focusedId = targetId;
    if (!block.items.some((item) => item.id === pendingItems[0].item.id)) {
      const next = [...blocks];
      next[index] = {
        ...block,
        items: [...block.items, ...pendingItems.map(({ item }) => item)],
      };
      blocks = next;
    }

    mediaBusy = true;
    mediaBusyId = targetId;
    errorMsg = '';
    for (const { item } of pendingItems) {
      liveUploads.set(item.id, {
        cancelled: false,
        abort: () => window.anixApi?.article?.abortUpload?.(item.id),
      });
    }

    let firstError = '';
    for (const { file, item } of pendingItems) {
      const upload = liveUploads.get(item.id);
      const stillPresent = blocks.some(
        (candidate) => candidate.type === 'media'
          && candidate.items.some((media) => media.id === item.id),
      );
      if (!upload || upload.cancelled || !stillPresent) {
        liveUploads.delete(item.id);
        continue;
      }
      try {
        const uploaded = await uploadImageFile(file, item.id, item.localPreview || '');
        patchMediaUpload(item.id, uploaded);
      } catch (err) {
        const cancelled = upload.cancelled || (err instanceof Error && err.name === 'AbortError');
        if (!cancelled) {
          removeMediaUpload(item.id);
          firstError ||= mediaErrorMessage(err, 'Не удалось загрузить изображение');
        }
      } finally {
        liveUploads.delete(item.id);
      }
      focusedId = targetId;
    }
    if (firstError) {
      errorMsg = firstError;
      showToast(firstError, 'err');
    }
    const live = blocks.findIndex((item) => item.id === targetId);
    if (live >= 0 && blocks[live].type === 'media' && blocks[live].items.length === 0) {
      removeBlock(live);
    } else {
      pushHistory();
    }
    mediaBusy = false;
    mediaBusyId = null;
    if (blocks.some((item) => item.id === targetId)) focusedId = targetId;
  }

  async function addEmbedFromUrl(rawUrl: string) {
    const url = rawUrl.trim();
    if (!looksLikeUrl(url)) {
      errorMsg = 'Вставьте корректную ссылку';
      return;
    }
    mediaBusy = true;
    errorMsg = '';
    try {
      const token = await ensureMediaToken();
      const type = detectEmbedType(url);
      const api = window.anixApi?.article?.generateEmbed;
      if (!api) throw new Error('Вложения недоступны');
      const res = await api(type, token, url);
      if (Number(res?.success) !== 1) {
        throw new Error('Не удалось получить данные ссылки');
      }
      const data: ArticleEditorEmbedData = {
        url: String(res.url ?? url),
        hash: String(res.hash ?? ''),
        embed: res.embed ?? null,
        image: res.image ?? null,
        title: res.title ?? null,
        width: res.width ?? null,
        height: res.height ?? null,
        service: type,
        site_name: res.site_name ?? null,
        description: res.description ?? null,
      };
      insertBlock({ id: generateBlockId(), type: 'embed', data });
    } catch (err) {
      errorMsg = mediaErrorMessage(err, 'Не удалось получить данные ссылки');
      showToast(errorMsg, 'err');
    } finally {
      mediaBusy = false;
    }
  }

  function convertFocused(kind: 'paragraph' | 'header' | 'list' | 'ordered' | 'quote' | 'delimiter') {
    const index = focusedIndex >= 0 ? focusedIndex : 0;
    const current = blocks[index];
    if (!current) return;
    const html = current.type === 'paragraph' || current.type === 'header' || current.type === 'quote'
      ? current.html
      : current.type === 'list'
        ? (current.items[0] ?? '')
        : '';
    if (kind === 'delimiter') {
      replaceBlock(index, { id: current.id, type: 'delimiter' });
      const after = blocks[index + 1];
      if (!after || after.type !== 'paragraph') {
        insertBlock(emptyParagraph(), index);
      } else {
        void tick().then(() => focusBlock(after.id));
      }
      return;
    }
    if (kind === 'paragraph') {
      replaceBlock(index, { id: current.id, type: 'paragraph', html });
      return;
    }
    if (kind === 'header') {
      replaceBlock(index, { id: current.id, type: 'header', html, level: 3 });
      return;
    }
    if (kind === 'quote') {
      replaceBlock(index, {
        id: current.id,
        type: 'quote',
        html,
        caption: current.type === 'quote' ? current.caption : '',
        alignment: 'left',
      });
      return;
    }
    const items = current.type === 'list'
      ? current.items
      : html.split(/<br\s*\/?>/i).map((part) => part.trim()).filter(Boolean);
    replaceBlock(index, {
      id: current.id,
      type: 'list',
      style: kind === 'ordered' ? 'ordered' : 'unordered',
      items: items.length ? items : [''],
    });
  }

  function toggleBlock(kind: 'paragraph' | 'header' | 'list' | 'ordered' | 'quote' | 'delimiter') {
    const current = focusedIndex >= 0 ? blocks[focusedIndex] : blocks[0];
    if (!current) return;
    if (kind === 'header' && current.type === 'header') {
      convertFocused('paragraph');
      return;
    }
    if (kind === 'quote' && current.type === 'quote') {
      convertFocused('paragraph');
      return;
    }
    if (kind === 'list' && current.type === 'list' && current.style === 'unordered') {
      convertFocused('paragraph');
      return;
    }
    if (kind === 'ordered' && current.type === 'list' && current.style === 'ordered') {
      convertFocused('paragraph');
      return;
    }
    if (kind === 'delimiter' && current.type === 'delimiter') {
      convertFocused('paragraph');
      return;
    }
    convertFocused(kind);
  }

  function applyInline(command: string, value?: string) {
    try {
      document.execCommand(command, false, value);
    } catch {
      /* ignore */
    }
    const el = document.activeElement;
    if (el instanceof HTMLElement) {
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
    commitHtml();
    syncInlineFlags();
    updateInlineToolbar();
  }

  function openLinkDialog(mode: 'inline' | 'embed' = 'inline') {
    linkMode = mode;
    linkRange = null;
    const sel = window.getSelection();
    if (mode === 'inline' && sel && sel.rangeCount > 0 && !sel.isCollapsed) {
      const range = sel.getRangeAt(0);
      const root = range.commonAncestorContainer instanceof Element
        ? range.commonAncestorContainer
        : range.commonAncestorContainer.parentElement;
      if (root?.closest('.feed-composer__ce')) {
        linkRange = range.cloneRange();
        const selected = sel.toString().trim();
        linkValue = selected && looksLikeUrl(selected) ? selected : '';
      } else {
        linkValue = '';
      }
    } else {
      linkValue = '';
    }
    linkOpen = true;
    moreOpen = false;
    addOpen = false;
    inlineOpen = false;
    void tick().then(() => {
      document.querySelector<HTMLInputElement>('.feed-composer__link-input')?.focus();
    });
  }

  function restoreLinkSelection(): boolean {
    if (!linkRange) return false;
    try {
      const node = linkRange.commonAncestorContainer;
      const el = node instanceof Element ? node : node.parentElement;
      const field = el?.closest<HTMLElement>('.feed-composer__ce');
      field?.focus();
      const sel = window.getSelection();
      if (!sel) return false;
      sel.removeAllRanges();
      sel.addRange(linkRange);
      return !sel.isCollapsed;
    } catch {
      return false;
    }
  }

  async function applyLink() {
    const url = linkValue.trim();
    const href = looksLikeUrl(url) ? url : (url ? `https://${url}` : '');
    const mode = linkMode;
    const hadRange = !!linkRange;
    linkOpen = false;
    if (!href) {
      linkRange = null;
      return;
    }
    if (mode === 'embed') {
      linkRange = null;
      await addEmbedFromUrl(href);
      return;
    }
    if (restoreLinkSelection()) {
      applyInline('createLink', href);
      linkRange = null;
      return;
    }
    linkRange = null;
    if (hadRange) {
      showToast('Выделение пропало — выделите текст ещё раз', 'err');
      return;
    }
    showToast('Сначала выделите текст, затем нажмите «Ссылка»', 'err');
  }

  function syncInlineFlags() {
    try {
      inlineBold = document.queryCommandState('bold');
      inlineItalic = document.queryCommandState('italic');
    } catch {
      inlineBold = false;
      inlineItalic = false;
    }
  }

  function updateInlineToolbar() {
    if (step !== 'edit') {
      inlineOpen = false;
      inlineBold = false;
      inlineItalic = false;
      return;
    }
    syncInlineFlags();
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) {
      inlineOpen = false;
      return;
    }
    const node = sel.anchorNode;
    const el = node instanceof Element ? node : node?.parentElement;
    if (!el?.closest('.feed-composer__ce')) {
      inlineOpen = false;
      return;
    }
    const rect = sel.getRangeAt(0).getBoundingClientRect();
    if (rect.width < 2 && rect.height < 2) {
      inlineOpen = false;
      return;
    }
    inlineX = rect.left + rect.width / 2;
    inlineY = rect.top;
    inlineOpen = true;
  }

  async function onPaste(e: ClipboardEvent) {
    if (editView === 'code') return;
    const target = e.target;
    if (target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement) return;
    const data = e.clipboardData;
    if (!data) return;
    const imageFiles = Array.from(data.files || []).filter((f) => f.type.startsWith('image/'));
    if (!imageFiles.length) {
      for (const item of Array.from(data.items || [])) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) imageFiles.push(file);
        }
      }
    }
    if (!imageFiles.length) return;
      e.preventDefault();
    e.stopPropagation();
    await addImages(imageFiles);
  }

  function onFilesPicked(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    void addImages(files);
  }

  function onBlockInput(id: string, e: Event, extra?: { itemIndex?: number; field?: 'caption' }) {
    const el = e.currentTarget as HTMLElement;
    updateBlockHtml(id, el.innerHTML, extra);
  }

  function onBlockKeydown(block: ArticleEditorBlock, index: number, e: KeyboardEvent, itemIndex?: number) {
    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && isLetterKey(e, 'z')) {
      e.preventDefault();
      e.stopPropagation();
      if (e.shiftKey) redo();
      else undo();
      return;
    }
    if (ctrl && isLetterKey(e, 'y')) {
      e.preventDefault();
      e.stopPropagation();
      redo();
      return;
    }
    if (ctrl && isLetterKey(e, 'b')) {
      e.preventDefault();
      e.stopPropagation();
      applyInline('bold');
      return;
    }
    if (ctrl && isLetterKey(e, 'i')) {
      e.preventDefault();
      e.stopPropagation();
      applyInline('italic');
      return;
    }
    if (ctrl && isKeyCode(e, 'Enter')) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (isKeyCode(e, 'Backspace')) {
      const el = e.currentTarget as HTMLElement;
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed) return;
      if (!isCaretAtStart(el)) return;
      const field = el.dataset.field;
      e.preventDefault();
      e.stopPropagation();
      if (block.type === 'quote' && field === 'caption') {
        void tick().then(() => focusBlock(block.id, null, 'end'));
        return;
      }
      if (block.type === 'list' && itemIndex != null) {
        if (itemIndex > 0) {
          const joinAt = textLenOf(block.items[itemIndex - 1]);
          const items = [...block.items];
          items[itemIndex - 1] = joinEditorHtml(items[itemIndex - 1], items[itemIndex]);
          items.splice(itemIndex, 1);
          replaceBlock(index, { ...block, items });
          void tick().then(() => focusBlock(block.id, itemIndex - 1, 'end', joinAt));
          return;
        }
        const rest = block.items.slice(1);
        const firstHtml = block.items[0] ?? '';
        if (index > 0) {
          if (rest.length) {
            const prev = blocks[index - 1];
            let joinAt = 0;
            const next = [...blocks];
            if (prev.type === 'list') {
              const last = Math.max(0, prev.items.length - 1);
              joinAt = textLenOf(prev.items[last] ?? '');
              const items = [...prev.items];
              items[last] = joinEditorHtml(items[last], firstHtml);
              next[index - 1] = { ...prev, items };
            } else if (prev.type === 'paragraph' || prev.type === 'header' || prev.type === 'quote') {
              joinAt = textLenOf(prev.html);
              next[index - 1] = { ...prev, html: joinEditorHtml(prev.html, firstHtml) };
            }
            next[index] = { ...block, items: rest };
            blocks = next;
            pushHistory();
            void tick().then(() => focusBlock(
              prev.id,
              prev.type === 'list' ? Math.max(0, prev.items.length - 1) : null,
              'end',
              joinAt,
            ));
          } else {
            mergeIntoPrevious(index, firstHtml);
          }
          return;
        }
        replaceBlock(index, { id: block.id, type: 'paragraph', html: firstHtml });
        if (rest.length) {
          insertBlock({
            id: generateBlockId(),
            type: 'list',
            style: block.style,
            items: rest,
          }, index);
        }
        void tick().then(() => focusBlock(block.id, null, 'end'));
        return;
      }
      if (index > 0) {
        const html = block.type === 'paragraph' || block.type === 'header' || block.type === 'quote'
          ? block.html
          : '';
        mergeIntoPrevious(index, html);
      }
      return;
    }
    if (!isKeyCode(e, 'Enter') || e.shiftKey) return;
    e.preventDefault();
    e.stopPropagation();
    if (block.type === 'list' && itemIndex != null) {
      const el = e.currentTarget as HTMLElement;
      if (!editorPlainText(el.innerHTML)) {
        const items = block.items.filter((_, i) => i !== itemIndex);
        replaceBlock(index, { ...block, items: items.length ? items : [''] });
        insertBlock(emptyParagraph(), index);
        return;
      }
      const items = [...block.items];
      items.splice(itemIndex + 1, 0, '');
      replaceBlock(index, { ...block, items });
      void tick().then(() => focusBlock(block.id, itemIndex + 1));
      return;
    }
    insertBlock(emptyParagraph(), index);
  }

  function goPreview() {
    closeMenus();
    inlineOpen = false;
    if (editView === 'code' && !applyCodeView(true)) return;
    commitHtml();
    if (!canGoPreview) {
      errorMsg = isSuggestion
        ? 'Напишите текст или добавьте медиа'
        : 'Напишите текст, добавьте медиа или сделайте репост';
      return;
    }
    const payload = buildArticlePayload(blocks, {
      isSigned: wantSigned(),
      repostArticleId: isSuggestion ? null : (Number(effectiveRepost?.id ?? 0) || null),
    });
    if (payload.payload.block_count < 1 && !payload.repost_article_id) {
      errorMsg = 'Запись пустая';
      return;
    }
    errorMsg = '';
    step = 'preview';
  }

  async function publish() {
    if (!canPublish || !channelId) return;
    const editId = Number(editArticle?.id ?? 0);
    const api = isSuggestion
      ? window.anixApi?.article?.createSuggestion
      : isEditMode
        ? window.anixApi?.article?.edit
        : window.anixApi?.article?.create;
    if (!api) {
      errorMsg = isSuggestion
        ? 'API предложений недоступно'
        : isEditMode
          ? 'API редактирования недоступно'
          : 'API публикации недоступно';
      return;
    }
    if (isEditMode && !(editId > 0)) {
      errorMsg = 'Некорректная запись для редактирования';
      return;
    }
    publishBusy = true;
    errorMsg = '';
    try {
      const signed = wantSigned();
      const payload = buildArticlePayload(blocks, {
        isSigned: signed,
        repostArticleId: isSuggestion ? null : (Number(effectiveRepost?.id ?? 0) || null),
      });
      if (payload.payload.block_count < 1 && !payload.repost_article_id) {
        errorMsg = 'Запись пустая';
        return;
      }
      const res = isSuggestion
        ? await window.anixApi!.article!.createSuggestion!(channelId, {
            is_signed: signed,
            payload: payload.payload,
          })
        : isEditMode
          ? await window.anixApi!.article!.edit!(editId, {
              ...payload,
              is_signed: signed,
            })
          : await window.anixApi!.article!.create!(channelId, {
              ...payload,
              is_signed: signed,
            });
      const code = Number(res?.code ?? 0);
      if (code !== 0) {
        errorMsg = publishError(code);
        return;
      }
      const articleId = Number(res?.article?.id ?? editId ?? 0);
      const draftToRemove = activeDraftId;
      activeDraftId = '';
      if (draftToRemove) deleteFeedDraft(draftToRemove);
      window.electron?.composerDraftsChanged?.();
      showToast(
        isSuggestion
          ? 'Предложение записи успешно отправлено!'
          : isEditMode
            ? 'Запись сохранена'
            : 'Запись опубликована',
        'ok',
      );
      onPublished?.(articleId, channelId);
      onClose();
    } catch (err) {
      errorMsg = err instanceof Error ? err.message : String(err);
    } finally {
      publishBusy = false;
    }
  }

  function publishError(code: number): string {
    if (isSuggestion) {
      switch (code) {
        case 3: return 'Некорректное содержимое предложения';
        case 5: return 'Предложения временно недоступны';
        case 6: return 'Достигнут лимит предложений';
        case 7: return 'Канал не найден';
        case 8: return 'Предложения записей отключены в этом канале';
        case 9: return 'Создатель канала заблокирован';
        case 10: return 'Канал заблокирован';
        case 13: return 'Сначала создайте блог';
        default: return `Не удалось отправить предложение (код ${code})`;
      }
    }
    switch (code) {
      case 2: return isEditMode ? 'Некорректный репост' : 'Некорректный репост';
      case 3: return 'Некорректное содержимое записи';
      case 4: return 'Некорректные теги';
      case 5: return isEditMode ? 'Редактирование временно недоступно' : 'Публикация временно недоступна';
      case 6: return 'Достигнут лимит записей';
      case 7: return 'Канал не найден';
      case 8: return isEditMode ? 'Нет прав на редактирование этой записи' : 'Нет прав на публикацию в этот канал';
      case 9: return 'Создатель канала заблокирован';
      case 10: return 'Канал заблокирован';
      case 13: return 'Сначала создайте блог';
      default: return isEditMode
        ? `Не удалось сохранить (код ${code})`
        : `Не удалось опубликовать (код ${code})`;
    }
  }

  function keepSelection(e: MouseEvent) {
    e.preventDefault();
  }

  function onShellKeydown(e: KeyboardEvent) {
    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && isKeyCode(e, 'Enter')) {
      e.preventDefault();
      return;
    }
    const target = e.target;
    const inField = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
    if (isKeyCode(e, 'Escape')) {
      e.preventDefault();
      if (linkOpen) {
        linkOpen = false;
        linkRange = null;
        return;
      }
      if (addOpen || moreOpen || channelOpen) {
        closeMenus();
        return;
      }
      if (step === 'preview') {
        step = 'edit';
        return;
      }
      requestClose();
      return;
    }
    if (!open || inField || editView === 'code') return;
    if (ctrl && !e.shiftKey && isLetterKey(e, 'z')) {
      e.preventDefault();
      undo();
      return;
    }
    if (ctrl && (isLetterKey(e, 'y') || (e.shiftKey && isLetterKey(e, 'z')))) {
      e.preventDefault();
      redo();
      return;
    }
    if (ctrl && !e.shiftKey && isLetterKey(e, 'b')) {
      e.preventDefault();
      applyInline('bold');
      return;
    }
    if (ctrl && !e.shiftKey && isLetterKey(e, 'i')) {
      e.preventDefault();
      applyInline('italic');
      return;
    }
    if (ctrl && isLetterKey(e, 'k')) {
      e.preventDefault();
      openLinkDialog('inline');
      return;
    }
    if (ctrl && e.shiftKey && isLetterKey(e, 'h')) {
      e.preventDefault();
      toggleBlock('header');
      return;
    }
    if (ctrl && e.shiftKey && isLetterKey(e, 'q')) {
      e.preventDefault();
      toggleBlock('quote');
      return;
    }
    if (ctrl && e.shiftKey && isLetterKey(e, 'l')) {
      e.preventDefault();
      toggleBlock('list');
      return;
    }
    if (ctrl && e.shiftKey && isLetterKey(e, 'o')) {
      e.preventDefault();
      toggleBlock('ordered');
      return;
    }
    if (ctrl && e.shiftKey && isLetterKey(e, 'd')) {
      e.preventDefault();
      toggleBlock('delimiter');
      return;
    }
    if (ctrl && e.shiftKey && isLetterKey(e, 'p')) {
      e.preventDefault();
      toggleBlock('paragraph');
      return;
    }
    if (ctrl && e.shiftKey && isLetterKey(e, 'm')) {
      e.preventDefault();
      pickImages();
      return;
    }
    if (e.altKey && isKeyCode(e, 'ArrowUp')) {
      e.preventDefault();
      if (focusedIndex > 0) moveBlock(focusedIndex, -1);
      return;
    }
    if (e.altKey && isKeyCode(e, 'ArrowDown')) {
      e.preventDefault();
      if (focusedIndex >= 0 && focusedIndex < blocks.length - 1) moveBlock(focusedIndex, 1);
      return;
    }
    if (isKeyCode(e, 'Enter') && !e.shiftKey) {
      const active = document.activeElement;
      if (active instanceof HTMLElement && active.isContentEditable) return;
      if (focusedIndex < 0) return;
      e.preventDefault();
      insertBlock(emptyParagraph(), focusedIndex);
    }
  }

  function removeMediaItem(blockIndex: number, itemIndex: number) {
    const block = blocks[blockIndex];
    if (block?.type !== 'media') return;
    const removed = block.items[itemIndex];
    if (removed) cancelMediaUpload(removed);
    focusedId = block.id;
    const items = block.items.filter((_, i) => i !== itemIndex);
    if (!items.length) {
      removeBlock(blockIndex);
      return;
    }
    replaceBlock(blockIndex, { ...block, items });
  }

  function moveMediaItem(blockIndex: number, itemIndex: number, dir: -1 | 1) {
    const block = blocks[blockIndex];
    if (block?.type !== 'media') return;
    const nextIndex = itemIndex + dir;
    if (nextIndex < 0 || nextIndex >= block.items.length) return;
    focusedId = block.id;
    const items = [...block.items];
    const swap = items[itemIndex];
    items[itemIndex] = items[nextIndex];
    items[nextIndex] = swap;
    replaceBlock(blockIndex, { ...block, items });
  }
</script>

{#if open}
  <div
    class="feed-composer"
    class:feed-composer--preview={step === 'preview'}
    class:feed-composer--window={isWindow}
    role="presentation"
  >
    <div
      class="feed-composer__shell"
      role="dialog"
      aria-modal="true"
      aria-labelledby="feed-composer-title"
    >
      <header class="feed-composer__bar">
        {#if !isWindow || step === 'preview'}
          <UiV2Tooltip text={step === 'preview' ? 'Назад к редактору' : 'Закрыть'} placement="bottom">
        <button
          type="button"
              class="feed-composer__icon-btn"
              aria-label={step === 'preview' ? 'Назад к редактору' : 'Закрыть'}
              onclick={() => (step === 'preview' ? (step = 'edit') : requestClose())}
            >
              {@html iconArrowLeft(22)}
        </button>
          </UiV2Tooltip>
        {/if}

        <div class="feed-composer__who">
          <UiV2Tooltip text={isSuggestion ? 'Канал предложения' : 'Куда публиковать'} placement="bottom">
            <button
              type="button"
              class="feed-composer__avatar-btn"
              aria-label={isSuggestion ? 'Канал предложения' : 'Выбрать канал или блог'}
              aria-expanded={channelOpen}
              disabled={channels.length === 0 || isSuggestion || isEditMode}
              onclick={() => {
                if (isSuggestion || isEditMode) return;
                channelOpen = !channelOpen;
                addOpen = false;
                moreOpen = false;
              }}
            >
              <span
                class="feed-composer__avatar"
                class:feed-composer__avatar--channel={!selectedChannel?.is_blog}
                class:feed-composer__avatar--empty={!channelAvatarUrl(selectedChannel?.avatar)}
                style={channelAvatarUrl(selectedChannel?.avatar)
                  ? `background-image:url('${channelAvatarUrl(selectedChannel?.avatar)}')`
                  : undefined}
              ></span>
            </button>
          </UiV2Tooltip>
          <div class="feed-composer__who-copy">
            <h2 id="feed-composer-title" class="feed-composer__title">{headerTitle}</h2>
            {#if selectedChannel}
              <p class="feed-composer__subtitle">
                {#if isSuggestion}
                  Предложение · {selectedChannel.title}
                {:else}
                  {selectedChannel.is_blog ? 'Блог' : 'Канал'} · {selectedChannel.title}
                {/if}
              </p>
            {/if}
          </div>
        </div>

        <div class="feed-composer__bar-actions">
          {#if step === 'edit'}
            <UiV2Tooltip text="Предпросмотр" placement="bottom">
              <button
                type="button"
                class="feed-composer__icon-btn feed-composer__icon-btn--next"
                aria-label="Предпросмотр"
                disabled={!canGoPreview}
                onclick={goPreview}
              >
                {@html iconArrowRight(22)}
              </button>
            </UiV2Tooltip>
          {:else}
            <UiV2Button
              variant="primary"
              size="sm"
              label={publishBusy
                ? (isSuggestion ? 'Отправка…' : isEditMode ? 'Сохранение…' : 'Публикация…')
                : (isSuggestion ? 'Предложить' : isEditMode ? 'Сохранить' : 'Опубликовать')}
              disabled={!canPublish}
              onclick={() => void publish()}
            />
          {/if}
        </div>
      </header>

      {#if step === 'edit' && (channels.length > 0 || isEditMode)}
        <div class="feed-composer__ribbon" role="toolbar" aria-label="Форматирование записи">
          {#if editView === 'block'}
          <div class="feed-composer__ribbon-group">
            <UiV2Tooltip text="Отменить · Ctrl+Z" placement="bottom">
              <button
                type="button"
                class="feed-composer__tool"
                aria-label="Отменить"
                disabled={!canUndo}
                onmousedown={keepSelection}
                onclick={undo}
              >{@html iconRotateCcw(16)}</button>
            </UiV2Tooltip>
            <UiV2Tooltip text="Повторить · Ctrl+Y" placement="bottom">
              <button
                type="button"
                class="feed-composer__tool"
                aria-label="Повторить"
                disabled={!canRedo}
                onmousedown={keepSelection}
                onclick={redo}
              >{@html iconRotateCw(16)}</button>
            </UiV2Tooltip>
          </div>

          <div class="feed-composer__ribbon-group">
            <UiV2Tooltip text="Текст · Ctrl+Shift+P" placement="bottom">
              <button
                type="button"
                class="feed-composer__tool"
                class:is-active={blockKind === 'paragraph'}
                aria-pressed={blockKind === 'paragraph'}
                aria-label="Текст"
                onmousedown={keepSelection}
                onclick={() => toggleBlock('paragraph')}
              >Aa</button>
            </UiV2Tooltip>
            <UiV2Tooltip text="Заголовок · Ctrl+Shift+H" placement="bottom">
              <button
                type="button"
                class="feed-composer__tool"
                class:is-active={blockKind === 'header'}
                aria-pressed={blockKind === 'header'}
                aria-label="Заголовок"
                onmousedown={keepSelection}
                onclick={() => toggleBlock('header')}
              >H</button>
            </UiV2Tooltip>
            <UiV2Tooltip text="Цитата · Ctrl+Shift+Q" placement="bottom">
              <button
                type="button"
                class="feed-composer__tool"
                class:is-active={blockKind === 'quote'}
                aria-pressed={blockKind === 'quote'}
                aria-label="Цитата"
                onmousedown={keepSelection}
                onclick={() => toggleBlock('quote')}
              >{@html iconQuote(16)}</button>
            </UiV2Tooltip>
            <UiV2Tooltip text="Список · Ctrl+Shift+L" placement="bottom">
              <button
                type="button"
                class="feed-composer__tool"
                class:is-active={blockKind === 'list'}
                aria-pressed={blockKind === 'list'}
                aria-label="Маркированный список"
                onmousedown={keepSelection}
                onclick={() => toggleBlock('list')}
              >{@html iconList(16)}</button>
            </UiV2Tooltip>
            <UiV2Tooltip text="Нумерованный список · Ctrl+Shift+O" placement="bottom">
              <button
                type="button"
                class="feed-composer__tool"
                class:is-active={blockKind === 'ordered'}
                aria-pressed={blockKind === 'ordered'}
                aria-label="Нумерованный список"
                onmousedown={keepSelection}
                onclick={() => toggleBlock('ordered')}
              >{@html iconListOrdered(16)}</button>
            </UiV2Tooltip>
            <UiV2Tooltip text="Разделитель · Ctrl+Shift+D" placement="bottom">
              <button
                type="button"
                class="feed-composer__tool"
                class:is-active={blockKind === 'delimiter'}
                aria-pressed={blockKind === 'delimiter'}
                aria-label="Разделитель"
                onmousedown={keepSelection}
                onclick={() => toggleBlock('delimiter')}
              >{@html iconMinus(16)}</button>
            </UiV2Tooltip>
          </div>

          <div class="feed-composer__ribbon-group">
            <UiV2Tooltip text="Жирный · Ctrl+B" placement="bottom">
              <button
                type="button"
                class="feed-composer__tool"
                class:is-active={inlineBold}
                aria-pressed={inlineBold}
                aria-label="Жирный"
                onmousedown={keepSelection}
                onclick={() => applyInline('bold')}
              >{@html iconBold(16)}</button>
            </UiV2Tooltip>
            <UiV2Tooltip text="Курсив · Ctrl+I" placement="bottom">
              <button
                type="button"
                class="feed-composer__tool"
                class:is-active={inlineItalic}
                aria-pressed={inlineItalic}
                aria-label="Курсив"
                onmousedown={keepSelection}
                onclick={() => applyInline('italic')}
              >{@html iconItalic(16)}</button>
            </UiV2Tooltip>
            <UiV2Tooltip text="Ссылка на текст · Ctrl+K" placement="bottom">
              <button
                type="button"
                class="feed-composer__tool"
                aria-label="Ссылка на текст"
                onmousedown={keepSelection}
                onclick={() => openLinkDialog('inline')}
              >{@html iconLink(16)}</button>
            </UiV2Tooltip>
          </div>

          <div class="feed-composer__ribbon-group">
            <UiV2Tooltip text="Изображение · Ctrl+Shift+M" placement="bottom">
              <button
                type="button"
                class="feed-composer__tool"
                aria-label="Изображение"
                onmousedown={keepSelection}
                onclick={() => pickImages()}
              >{@html iconImage(16)}</button>
            </UiV2Tooltip>
            <UiV2Tooltip text="Карточка ссылки" placement="bottom">
              <button
                type="button"
                class="feed-composer__tool"
                aria-label="Карточка ссылки"
                onmousedown={keepSelection}
                onclick={() => openLinkDialog('embed')}
              >{@html iconPaperclip(16)}</button>
            </UiV2Tooltip>
          </div>

          <div class="feed-composer__ribbon-group">
            <UiV2Tooltip text="Блок выше · Alt+↑" placement="bottom">
              <button
                type="button"
                class="feed-composer__tool"
                aria-label="Блок выше"
                disabled={focusedIndex <= 0}
                onmousedown={keepSelection}
                onclick={() => focusedIndex > 0 && moveBlock(focusedIndex, -1)}
              >{@html iconArrowUp(16)}</button>
            </UiV2Tooltip>
            <UiV2Tooltip text="Блок ниже · Alt+↓" placement="bottom">
              <button
                type="button"
                class="feed-composer__tool"
                aria-label="Блок ниже"
                disabled={focusedIndex < 0 || focusedIndex >= blocks.length - 1}
                onmousedown={keepSelection}
                onclick={() => focusedIndex >= 0 && focusedIndex < blocks.length - 1 && moveBlock(focusedIndex, 1)}
              >{@html iconArrowDown(16)}</button>
            </UiV2Tooltip>
            <UiV2Tooltip text="Удалить блок" placement="bottom">
              <button
                type="button"
                class="feed-composer__tool"
                aria-label="Удалить блок"
                disabled={focusedIndex < 0}
                onmousedown={keepSelection}
                onclick={() => focusedIndex >= 0 && removeBlock(focusedIndex)}
              >{@html iconTrash2(16)}</button>
            </UiV2Tooltip>
          </div>
          {/if}

          <div
            class="feed-composer__ribbon-group feed-composer__ribbon-view"
            role="radiogroup"
            aria-label="Вид редактора"
          >
            <UiV2Tooltip text="Блоки" placement="bottom">
              <button
                type="button"
                class="feed-composer__tool feed-composer__view-btn"
                class:is-active={editView === 'block'}
                role="radio"
                aria-checked={editView === 'block'}
                aria-label="Block"
                onclick={() => setEditView('block')}
              >Block</button>
            </UiV2Tooltip>
            <UiV2Tooltip text="Код записи · JSON" placement="bottom">
              <button
                type="button"
                class="feed-composer__tool feed-composer__view-btn"
                class:is-active={editView === 'code'}
                role="radio"
                aria-checked={editView === 'code'}
                aria-label="Code"
                onclick={() => setEditView('code')}
              >Code</button>
            </UiV2Tooltip>
          </div>
        </div>
      {/if}

      {#if channelOpen && !isSuggestion && !isEditMode && channels.length > 0}
        <div class="feed-composer__picker" role="listbox" aria-label="Куда публиковать">
          {#if blogs.length}
            <p class="feed-composer__picker-label">Блоги</p>
            {#each blogs as ch (ch.id)}
              <button
                type="button"
                class="feed-composer__picker-item"
                class:is-active={ch.id === channelId}
                onclick={() => pickChannel(ch.id)}
              >
                <span
                  class="feed-composer__avatar feed-composer__avatar--sm"
                  class:feed-composer__avatar--empty={!channelAvatarUrl(ch.avatar)}
                  style={channelAvatarUrl(ch.avatar)
                    ? `background-image:url('${channelAvatarUrl(ch.avatar)}')`
                    : undefined}
                ></span>
                <span>{ch.title || `Блог #${ch.id}`}</span>
              </button>
            {/each}
          {/if}
          {#if groups.length}
            <p class="feed-composer__picker-label">Каналы</p>
            {#each groups as ch (ch.id)}
              <button
                type="button"
                class="feed-composer__picker-item"
                class:is-active={ch.id === channelId}
                onclick={() => pickChannel(ch.id)}
              >
                <span
                  class="feed-composer__avatar feed-composer__avatar--sm feed-composer__avatar--channel"
                  class:feed-composer__avatar--empty={!channelAvatarUrl(ch.avatar)}
                  style={channelAvatarUrl(ch.avatar)
                    ? `background-image:url('${channelAvatarUrl(ch.avatar)}')`
                    : undefined}
                ></span>
                <span>{ch.title || `Канал #${ch.id}`}</span>
              </button>
            {/each}
          {/if}
        </div>
      {/if}

        {#if channels.length === 0 && !isEditMode}
        <div class="feed-composer__empty">
          <p>
            {#if isSuggestion}
              Не удалось открыть предложение для этого канала.
            {:else}
            Чтобы писать записи, создайте блог или получите права редактора в канале.
            {/if}
          </p>
          {#if !isSuggestion && onCreateBlog}
            <UiV2Button
              variant="primary"
              label={createBusy ? 'Создание…' : 'Создать блог'}
              disabled={createBusy}
              onclick={() => void onCreateBlog()}
            />
          {/if}
        </div>
      {:else if step === 'edit'}
        <UiV2ScrollArea class="feed-composer__scroll" padding="1.1rem 1.35rem 1.75rem">
          {#if effectiveRepost && !isSuggestion}
            <p class="feed-composer__repost-hint">Репост записи #{effectiveRepost.id}</p>
          {/if}
          {#if editView === 'code'}
            <label class="feed-composer__code-label" for="feed-composer-code">Код записи</label>
            <textarea
              id="feed-composer-code"
              class="feed-composer__code"
              spellcheck="false"
              autocomplete="off"
              autocapitalize="off"
              wrap="off"
              aria-invalid={codeError ? 'true' : 'false'}
              aria-describedby={codeError ? 'feed-composer-code-error' : undefined}
              bind:value={codeText}
              onblur={() => { if (editView === 'code') applyCodeView(false); }}
            ></textarea>
            {#if codeError}
              <p id="feed-composer-code-error" class="feed-composer__error" role="alert">{codeError}</p>
          {/if}
        {:else}
          <div class="feed-composer__canvas">
            {#each blocks as block, index (block.id)}
              <div
                class="feed-composer__block"
                class:is-focused={focusedId === block.id}
                data-block-id={block.id}
                aria-current={focusedId === block.id ? 'true' : undefined}
                onpointerdown={() => { focusedId = block.id; }}
              >
                <div class="feed-composer__block-tools" role="toolbar" aria-label="Поле">
                  <UiV2Tooltip text="Выше" placement="left">
                    <button
                      type="button"
                      class="feed-composer__block-tool"
                      aria-label="Выше"
                      disabled={index <= 0}
                      onmousedown={keepSelection}
                      onclick={() => moveBlock(index, -1)}
                    >{@html iconArrowUp(14)}</button>
                  </UiV2Tooltip>
                  <UiV2Tooltip text="Ниже" placement="left">
                    <button
                      type="button"
                      class="feed-composer__block-tool"
                      aria-label="Ниже"
                      disabled={index >= blocks.length - 1}
                      onmousedown={keepSelection}
                      onclick={() => moveBlock(index, 1)}
                    >{@html iconArrowDown(14)}</button>
                  </UiV2Tooltip>
                  <UiV2Tooltip text="Удалить поле" placement="left">
                    <button
                      type="button"
                      class="feed-composer__block-tool"
                      aria-label="Удалить поле"
                      onmousedown={keepSelection}
                      onclick={() => removeBlock(index)}
                    >{@html iconTrash2(14)}</button>
                  </UiV2Tooltip>
                </div>
                {#if block.type === 'paragraph' || block.type === 'header'}
                  <div
                    class="feed-composer__ce"
                    class:feed-composer__ce--h={block.type === 'header'}
                    contenteditable="true"
                    role="textbox"
                    data-block-id={block.id}
                    data-field="main"
                    data-placeholder={block.type === 'header' ? 'Заголовок' : 'Начните писать'}
                    use:bindHtml={block.html}
                    oninput={(e) => onBlockInput(block.id, e)}
                    onblur={commitHtml}
                    onfocus={() => { focusedId = block.id; focusedItem = null; }}
                    onkeydown={(e) => onBlockKeydown(block, index, e)}
                  ></div>
                {:else if block.type === 'quote'}
                  <div class="feed-composer__quote">
                    <div
                      class="feed-composer__ce"
                      contenteditable="true"
                      role="textbox"
                      data-block-id={block.id}
                      data-field="main"
                      data-placeholder="Цитата"
                      use:bindHtml={block.html}
                      oninput={(e) => onBlockInput(block.id, e)}
                      onblur={commitHtml}
                      onfocus={() => { focusedId = block.id; focusedItem = null; }}
                      onkeydown={(e) => onBlockKeydown(block, index, e)}
                    ></div>
                    <div
                      class="feed-composer__ce feed-composer__ce--caption"
                      contenteditable="true"
                      role="textbox"
                      data-block-id={block.id}
                      data-field="caption"
                      data-placeholder="Автор"
                      use:bindHtml={block.caption}
                      oninput={(e) => onBlockInput(block.id, e, { field: 'caption' })}
                      onblur={commitHtml}
                      onfocus={() => { focusedId = block.id; focusedItem = null; }}
                      onkeydown={(e) => onBlockKeydown(block, index, e)}
                    ></div>
                  </div>
                {:else if block.type === 'list'}
                  <div class="feed-composer__list" class:is-ordered={block.style === 'ordered'}>
                    {#each block.items as item, itemIndex (itemIndex)}
                      <div
                        class="feed-composer__ce feed-composer__ce--li"
                        contenteditable="true"
                        role="textbox"
                        data-block-id={block.id}
                        data-item-index={itemIndex}
                        data-placeholder="Пункт списка"
                        use:bindHtml={item}
                        oninput={(e) => onBlockInput(block.id, e, { itemIndex })}
                        onblur={commitHtml}
                        onfocus={() => { focusedId = block.id; focusedItem = itemIndex; }}
                        onkeydown={(e) => onBlockKeydown(block, index, e, itemIndex)}
                      ></div>
                    {/each}
                  </div>
                {:else if block.type === 'delimiter'}
                  <div class="feed-composer__delimiter" aria-hidden="true">
                    <span>*</span><span>*</span><span>*</span>
                  </div>
                {:else if block.type === 'media'}
                  {@const canAdd = block.items.length < ARTICLE_MAX_MEDIA_ITEMS}
                  {@const useGrid = block.items.length > 1}
                  <div
                    class="feed-composer__media"
                    class:feed-composer__media--grid={useGrid}
                    data-block-id={block.id}
                    data-field="main"
                    tabindex="0"
                    role="group"
                    aria-label="Изображения"
                    onfocus={() => { focusedId = block.id; focusedItem = null; }}
                  >
                    {#each block.items as item, itemIndex (item.id)}
                      <div
                        class="feed-composer__media-item"
                        class:is-solo={!useGrid}
                        class:is-uploading={item.uploadProgress != null}
                        aria-busy={item.uploadProgress != null ? 'true' : undefined}
                      >
                        <img
                          src={mediaPreviewSrc(item, useGrid)}
                          alt=""
                          width={item.width || undefined}
                          height={item.height || undefined}
                          loading="lazy"
                          decoding="async"
                        />
                        {#if item.uploadProgress != null}
                          <div class="feed-composer__upload-status">
                            <span>Загрузка {item.uploadProgress}%</span>
                            <div
                              class="feed-composer__upload-track"
                              role="progressbar"
                              aria-label="Загрузка изображения"
                              aria-valuemin="0"
                              aria-valuemax="100"
                              aria-valuenow={item.uploadProgress}
                            >
                              <span style={`width:${item.uploadProgress}%`}></span>
                            </div>
                          </div>
                        {/if}
                        <div class="feed-composer__media-controls">
                          {#if useGrid}
                            <button
                              type="button"
                              class="feed-composer__media-fab"
                              aria-label="Левее"
                              disabled={itemIndex <= 0 || item.uploadProgress != null}
                              onclick={() => moveMediaItem(index, itemIndex, -1)}
                            >{@html iconArrowLeft(14)}</button>
                            <button
                              type="button"
                              class="feed-composer__media-fab"
                              aria-label="Правее"
                              disabled={itemIndex >= block.items.length - 1 || item.uploadProgress != null}
                              onclick={() => moveMediaItem(index, itemIndex, 1)}
                            >{@html iconArrowRight(14)}</button>
                            <button
                              type="button"
                              class="feed-composer__media-fab"
                              aria-label="Удалить изображение"
                              onclick={() => removeMediaItem(index, itemIndex)}
                            >{@html iconX(14)}</button>
                          {:else}
                            {#if canAdd}
                              <button
                                type="button"
                                class="feed-composer__media-pill"
                                aria-label="Добавить еще"
                                disabled={mediaBusy}
                                onclick={() => pickImages(block.id)}
                              >
                                {@html iconPlus(14)}
                                <span>Добавить еще</span>
                              </button>
                            {/if}
                            <button
                              type="button"
                              class="feed-composer__media-fab"
                              aria-label="Удалить изображение"
                              onclick={() => removeMediaItem(index, itemIndex)}
                            >{@html iconX(14)}</button>
                          {/if}
                        </div>
                      </div>
                    {/each}
                    {#if useGrid && canAdd}
                      <button
                        type="button"
                        class="feed-composer__media-add"
                        disabled={mediaBusy}
                        onclick={() => pickImages(block.id)}
                      >
                        {@html iconImage(22)}
                        <span>Добавить еще</span>
                      </button>
                    {/if}
                  </div>
                {:else if block.type === 'embed'}
                  <UiV2FeedPostEmbed
                    title={block.data.title ?? ''}
                    description={block.data.description ?? ''}
                    image={toFeedImageUrl(block.data.image ?? '')}
                    url={block.data.url}
                    siteName={block.data.site_name ?? ''}
                  />
                {/if}
              </div>
            {/each}
          </div>
          {/if}
          {#if errorMsg && !(editView === 'code' && codeError)}
            <p class="feed-composer__error" role="alert">{errorMsg}</p>
          {/if}
          {#if mediaBusy}
            <p class="feed-composer__hint">Загрузка медиа…</p>
          {/if}
        </UiV2ScrollArea>

      {:else}
        <UiV2ScrollArea class="feed-composer__scroll" padding="1.1rem 1.25rem 1.5rem">
          <div class="feed-composer__preview-meta">
            {#if isSuggestion}
              <p class="feed-composer__repost-hint">
                Будет отправлено как предложение в «{selectedChannel?.title || 'канал'}»
              </p>
            {:else}
              <UiV2Select
                label="Куда публиковать"
                options={channelOptions}
                value={channelId != null ? String(channelId) : ''}
                onChange={onChannelChange}
              />
            {/if}
            {#if !selectedChannel?.is_blog}
              <label class="feed-composer__signed">
                <input type="checkbox" bind:checked={isSigned} />
                <span>Подписать запись</span>
              </label>
            {/if}
            {#if effectiveRepost && !isSuggestion}
              <p class="feed-composer__repost-hint">Будет опубликован как репост записи #{effectiveRepost.id}</p>
            {/if}
            </div>
          {#if previewPost}
            <div class="feed-composer__preview-card">
              <UiV2FeedPost data={previewPost} staticPreview />
          </div>
          {/if}
          {#if errorMsg}
            <p class="feed-composer__error" role="alert">{errorMsg}</p>
          {/if}
        </UiV2ScrollArea>
        {/if}
      </div>

    {#if inlineOpen && step === 'edit' && editView === 'block'}
      <div
        class="feed-composer__inline"
        role="toolbar"
        aria-label="Форматирование"
        style={`left:${inlineX}px; top:${inlineY}px`}
      >
        <UiV2Tooltip text="Жирный · Ctrl+B" placement="top">
          <button type="button" class="feed-composer__tool" class:is-active={inlineBold} aria-pressed={inlineBold} aria-label="Жирный" onmousedown={keepSelection} onclick={() => applyInline('bold')}>{@html iconBold(16)}</button>
        </UiV2Tooltip>
        <UiV2Tooltip text="Курсив · Ctrl+I" placement="top">
          <button type="button" class="feed-composer__tool" class:is-active={inlineItalic} aria-pressed={inlineItalic} aria-label="Курсив" onmousedown={keepSelection} onclick={() => applyInline('italic')}>{@html iconItalic(16)}</button>
        </UiV2Tooltip>
        <UiV2Tooltip text="Ссылка · Ctrl+K" placement="top">
          <button type="button" class="feed-composer__tool" aria-label="Ссылка на текст" onmousedown={keepSelection} onclick={() => openLinkDialog('inline')}>{@html iconLink(16)}</button>
        </UiV2Tooltip>
      </div>
    {/if}

    {#if linkOpen}
      <div
        class="feed-composer__link"
        role="dialog"
        aria-label={linkMode === 'embed' ? 'Карточка ссылки' : 'Ссылка на текст'}
      >
        <input
          class="feed-composer__link-input"
          type="url"
          placeholder="https://"
          bind:value={linkValue}
          onkeydown={(e) => {
            if (isKeyCode(e, 'Enter')) {
              e.preventDefault();
              void applyLink();
            }
            if (isKeyCode(e, 'Escape')) {
              linkOpen = false;
              linkRange = null;
            }
          }}
        />
        <UiV2Button variant="primary" size="sm" label="Готово" onclick={() => void applyLink()} />
        <button
          type="button"
          class="feed-composer__icon-btn"
          aria-label="Отмена"
          onclick={() => {
            linkOpen = false;
            linkRange = null;
          }}
        >
          {@html iconX(16)}
        </button>
          </div>
      {/if}

    <input
      bind:this={fileInput}
      class="feed-composer__file"
      type="file"
      accept="image/*"
      multiple
      onchange={onFilesPicked}
    />
  </div>
{/if}
