<script lang="ts">
  import { shortcutLabel } from '../../utils/platform';
  import { tick } from 'svelte';
  import UiV2Button from '../uikit-v2/UiV2Button.svelte';
  import UiV2ScrollArea from '../uikit-v2/UiV2ScrollArea.svelte';
  import UiV2FeedPost from '../uikit-v2/UiV2FeedPost.svelte';
  import UiV2FeedPostEmbed from '../uikit-v2/UiV2FeedPostEmbed.svelte';
  import UiV2Tooltip from '../uikit-v2/UiV2Tooltip.svelte';
  import UiV2Toggle from '../uikit-v2/UiV2Toggle.svelte';
  import UiV2ChoiceSheet from '../uikit-v2/UiV2ChoiceSheet.svelte';
  import UiV2PopupMenu, { type UiV2PopupMenuItem } from '../uikit-v2/UiV2PopupMenu.svelte';
  import { pushBackHandler } from '../../platform/mobile-back';
  import { mobileUiZoom } from '../../platform/mobile';
  import {
    iconArrowDown,
    iconArrowLeft,
    iconArrowRight,
    iconArrowUp,
    iconBold,
    iconCheck,
    iconCircleCheck,
    iconRefreshCw,
    iconChevronDown,
    iconCodeXml,
    iconGripVertical,
    iconHeading,
    iconMoreVertical,
    iconType,
    iconImage,
    iconItalic,
    iconLink,
    iconList,
    iconListOrdered,
    iconMinus,
    iconPaperclip,
    iconPlus,
    iconQuote,
    iconRepost,
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
    /** overlay — поверх страницы (веб), window — отдельное окно ПК, page — экран телефона. */
    mode?: 'overlay' | 'window' | 'page';
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
  const isPage = $derived(mode === 'page');

  type BlockKind = 'paragraph' | 'header' | 'list' | 'ordered' | 'quote' | 'delimiter';
  const BLOCK_KINDS: { id: BlockKind; label: string; icon: (size?: number) => string; shortcut: string }[] = [
    { id: 'paragraph', label: 'Текст', icon: iconType, shortcut: 'Ctrl+Shift+P' },
    { id: 'header', label: 'Заголовок', icon: iconHeading, shortcut: 'Ctrl+Shift+H' },
    { id: 'quote', label: 'Цитата', icon: iconQuote, shortcut: 'Ctrl+Shift+Q' },
    { id: 'list', label: 'Список', icon: iconList, shortcut: 'Ctrl+Shift+L' },
    { id: 'ordered', label: 'Нумерованный список', icon: iconListOrdered, shortcut: 'Ctrl+Shift+O' },
    { id: 'delimiter', label: 'Разделитель', icon: iconMinus, shortcut: 'Ctrl+Shift+D' },
  ];

  /** Меню: выбор канала, тип блока, вставка блока (телефон), действия с блоком. */
  type MenuKind = 'channel' | 'kind' | 'insert' | 'tune';
  let menu = $state<MenuKind | null>(null);
  let menuAnchor = $state<HTMLElement | null>(null);
  let menuX = $state(0);
  let menuY = $state(0);
  let tuneIndex = $state(-1);
  let clearOpen = $state(false);
  let draftSavedAt = $state(0);
  /** Правка ещё не записана в черновик (идёт отсрочка автосохранения). */
  let draftSaving = $state(false);
  /** Показывать значок черновика: только для новой записи/предложения, не для правки опубликованной. */
  const showDraftState = $derived(!isEditMode && !!activeDraftId && (draftSaving || draftSavedAt > 0));

  function draftTimeLabel(): string {
    if (!draftSavedAt) return '';
    return new Date(draftSavedAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  }

  function showDraftInfo() {
    if (draftSaving) {
      showToast('Сохраняем черновик…', 'ok');
      return;
    }
    showToast(
      `Черновик сохранён в ${draftTimeLabel()} на этом устройстве. Продолжить можно из вкладки «Черновики» в ленте`,
      'ok',
    );
  }

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
  /** Заголовок экрана телефона — тексты Anixart. */
  const pageTitle = $derived(
    step === 'preview'
      ? 'Публикация'
      : isSuggestion
        ? 'Предложение записи'
        : isEditMode
          ? 'Редактирование записи'
          : 'Новая запись',
  );
  const canPickChannel = $derived(!isSuggestion && !isEditMode && channels.length > 1);
  const currentKind = $derived(BLOCK_KINDS.find((k) => k.id === blockKind) ?? null);
  const hasContent = $derived(editorHasContent(blocks));
  const statusText = $derived(
    mediaBusy
      ? 'Загружаем медиа…'
      : isEditMode
        ? 'Правка опубликованной записи'
        : isSuggestion
          ? 'Предложение увидят администраторы канала'
          : draftSavedAt
            ? 'Черновик сохранён'
            : 'Черновик сохраняется сам',
  );

  function avatarIcon(ch: FeedComposerChannel): string {
    const url = channelAvatarUrl(ch.avatar);
    const style = url ? ` style="background-image:url('${url.replace(/'/g, '%27')}')"` : '';
    return `<span class="feed-composer__menu-avatar${ch.is_blog ? '' : ' is-channel'}"${style}></span>`;
  }

  const menuItems = $derived.by((): UiV2PopupMenuItem[] => {
    if (menu === 'channel') {
      const out: UiV2PopupMenuItem[] = [];
      const push = (list: FeedComposerChannel[], label: string, fallback: string) => {
        if (!list.length) return;
        out.push({ id: `label:${label}`, label, type: 'label' });
        for (const ch of list) {
          out.push({
            id: `ch:${ch.id}`,
            label: ch.title || `${fallback} #${ch.id}`,
            type: 'radio',
            checked: ch.id === channelId,
            keepOpen: false,
            icon: avatarIcon(ch),
            valueText: ch.id === channelId ? '✓' : undefined,
          });
        }
      };
      push(blogs, 'Блоги', 'Блог');
      push(groups, 'Каналы', 'Канал');
      return out;
    }
    if (menu === 'kind' || menu === 'insert') {
      const out: UiV2PopupMenuItem[] = BLOCK_KINDS.map((k) => ({
        id: k.id,
        label: k.label,
        icon: k.icon(16),
        type: menu === 'kind' ? 'radio' : 'action',
        checked: menu === 'kind' ? blockKind === k.id : undefined,
        keepOpen: false,
        valueText: isPage ? undefined : shortcutLabel(k.shortcut),
      }));
      if (menu === 'insert') {
        out.push(
          { id: 'image', label: 'Изображения', icon: iconImage(16), dividerBefore: true },
          { id: 'embed', label: 'Карточка ссылки', icon: iconPaperclip(16) },
        );
      }
      return out;
    }
    if (menu === 'tune') {
      const i = tuneIndex;
      // На узком телефоне пилюля отмены скрыта — те же действия есть здесь.
      const history: UiV2PopupMenuItem[] = isPage
        ? [
            { id: 'undo', label: 'Отменить', icon: iconRotateCcw(16), disabled: !canUndo },
            { id: 'redo', label: 'Повторить', icon: iconRotateCw(16), disabled: !canRedo },
          ]
        : [];
      return [
        ...history,
        { id: 'up', label: 'Переместить выше', icon: iconArrowUp(16), disabled: i <= 0, dividerBefore: isPage },
        { id: 'down', label: 'Переместить ниже', icon: iconArrowDown(16), disabled: i < 0 || i >= blocks.length - 1 },
        { id: 'delete', label: 'Удалить блок', icon: iconTrash2(16), danger: true, dividerBefore: true, disabled: i < 0 },
      ];
    }
    return [];
  });

  const menuTitle = $derived(
    menu === 'channel'
      ? 'Куда публиковать'
      : menu === 'kind'
        ? 'Тип блока'
        : menu === 'insert'
          ? 'Добавить блок'
          : menu === 'tune'
            ? 'Блок'
            : '',
  );

  function openMenu(kind: MenuKind, e: MouseEvent, blockIndex = focusedIndex) {
    const el = e.currentTarget as HTMLElement;
    const rect = el.getBoundingClientRect();
    menuAnchor = el;
    menuX = rect.left + rect.width / 2;
    menuY = rect.top + rect.height / 2;
    tuneIndex = blockIndex;
    inlineOpen = false;
    menu = menu === kind ? null : kind;
  }

  function closeMenu() {
    menu = null;
    menuAnchor = null;
  }

  function refocusBlock(id: string | null) {
    if (!id || isPage) return;
    void tick().then(() => focusBlock(id, focusedItem, 'end'));
  }

  function makeBlock(kind: BlockKind): ArticleEditorBlock {
    const id = generateBlockId();
    switch (kind) {
      case 'header': return { id, type: 'header', html: '', level: 3 };
      case 'quote': return { id, type: 'quote', html: '', caption: '', alignment: 'left' };
      case 'list': return { id, type: 'list', style: 'unordered', items: [''] };
      case 'ordered': return { id, type: 'list', style: 'ordered', items: [''] };
      case 'delimiter': return { id, type: 'delimiter' };
      default: return { id, type: 'paragraph', html: '' };
    }
  }

  /** «+» на телефоне, как в Editor.js: пустой абзац превращается в блок, иначе новый блок встаёт ниже. */
  function insertKind(kind: string) {
    if (kind === 'image') {
      pickImages();
      return;
    }
    if (kind === 'embed') {
      openLinkDialog('embed');
      return;
    }
    const k = kind as BlockKind;
    const current = focusedIndex >= 0 ? blocks[focusedIndex] : null;
    if (current?.type === 'paragraph' && !editorPlainText(current.html)) {
      convertFocused(k);
      if (k !== 'delimiter') void tick().then(() => focusBlock(current.id, k === 'list' || k === 'ordered' ? 0 : null));
      return;
    }
    const at = focusedIndex >= 0 ? focusedIndex : blocks.length - 1;
    insertBlock(makeBlock(k), at);
    if (k === 'delimiter') insertBlock(emptyParagraph(), at + 1);
  }

  function onMenuSelect(id: string) {
    const kind = menu;
    if (kind === 'channel') {
      if (id.startsWith('ch:')) pickChannel(Number(id.slice(3)));
      return;
    }
    if (kind === 'kind') {
      const keep = focusedId;
      convertFocused(id as BlockKind);
      refocusBlock(keep);
      return;
    }
    if (kind === 'insert') {
      insertKind(id);
      return;
    }
    if (kind === 'tune') {
      if (id === 'undo') {
        undo();
        return;
      }
      if (id === 'redo') {
        redo();
        return;
      }
      const i = tuneIndex;
      if (i < 0) return;
      if (id === 'up') moveBlock(i, -1);
      else if (id === 'down') moveBlock(i, 1);
      else if (id === 'delete') removeBlock(i);
    }
  }

  /** «Очистить» (новая запись) / «Вернуть назад» (правка) — как кнопка со стрелкой в Anixart. */
  function clearEditor() {
    clearOpen = false;
    for (const upload of liveUploads.values()) {
      upload.cancelled = true;
      upload.abort();
    }
    const start = isEditMode && editArticle
      ? editorBlocksFromPayload(editArticle.payload)
      : [emptyParagraph()];
    blocks = start;
    pushHistory();
    if (editView === 'code') codeText = stringifyEditorPayload(blocks);
    codeError = '';
    errorMsg = '';
    void tick().then(() => focusBlock(blocks[0]?.id ?? ''));
  }

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

  /** Телефон: системная «назад» сначала закрывает слои, с «Публикации» возвращает к тексту, потом закрывает экран. */
  $effect(() => {
    if (!open || !isPage) return;
    return pushBackHandler(() => {
      if (linkOpen) {
        linkOpen = false;
        linkRange = null;
        return true;
      }
      if (clearOpen) {
        clearOpen = false;
        return true;
      }
      if (step === 'preview') {
        step = 'edit';
        return true;
      }
      requestClose();
      return true;
    });
  });

  /** Телефон: панель инструментов держится над клавиатурой, даже если WebView сам не сжался. */
  let keyboardInset = $state(0);
  $effect(() => {
    const viewport = window.visualViewport;
    if (!open || !isPage || !viewport) return;
    const sync = () => {
      // Окно меряет в пикселях экрана, вёрстка под масштабом интерфейса — в своих
      keyboardInset = Math.max(0, Math.round((window.innerHeight - viewport.height - viewport.offsetTop) / mobileUiZoom()));
    };
    sync();
    viewport.addEventListener('resize', sync);
    return () => {
      viewport.removeEventListener('resize', sync);
      keyboardInset = 0;
    };
  });

  /** Экран могут закрыть и жестом «назад» мимо кнопок — черновик всё равно сохраняем. */
  $effect(() => {
    if (!open || !isPage) return;
    return () => persistDraft();
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
    if (!isEditMode && activeDraftId) draftSaving = true;
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
    menu = null;
    clearOpen = false;
    draftSavedAt = 0;
    draftSaving = false;
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
    menu = null;
  }

  function persistDraft(): void {
    draftSaving = false;
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
    draftSavedAt = Date.now();
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
    // На телефоне у выделения своё системное меню, а B/I/ссылка — в нижней панели.
    if (isPage) {
      inlineOpen = false;
      return;
    }
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
      if (clearOpen) {
        clearOpen = false;
        return;
      }
      if (addOpen || moreOpen || channelOpen || menu) {
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

{#snippet avatar(ch: FeedComposerChannel | null, size: 'sm' | 'md' | 'lg')}
  <span
    class="feed-composer__avatar feed-composer__avatar--{size}"
    class:feed-composer__avatar--channel={!!ch && !ch.is_blog}
    class:feed-composer__avatar--empty={!channelAvatarUrl(ch?.avatar)}
    style={channelAvatarUrl(ch?.avatar)
      ? `background-image:url('${channelAvatarUrl(ch?.avatar)}')`
      : undefined}
    aria-hidden="true"
  ></span>
{/snippet}

{#snippet viewSwitch()}
  <div class="feed-composer__view" role="radiogroup" aria-label="Вид редактора">
    <button
      type="button"
      class="feed-composer__view-btn"
      class:is-active={editView === 'block'}
      role="radio"
      aria-checked={editView === 'block'}
      onclick={() => setEditView('block')}
    >Блоки</button>
    <button
      type="button"
      class="feed-composer__view-btn"
      class:is-active={editView === 'code'}
      role="radio"
      aria-checked={editView === 'code'}
      onclick={() => setEditView('code')}
    >{@html iconCodeXml(14)}<span>Код</span></button>
  </div>
{/snippet}

{#snippet emptyState()}
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
{/snippet}

{#snippet codeView()}
  {#if !isPage}
    <label class="feed-composer__code-label" for="feed-composer-code">Код записи · JSON</label>
  {/if}
  <textarea
    id="feed-composer-code"
    class="feed-composer__code"
    spellcheck="false"
    autocomplete="off"
    autocapitalize="off"
    wrap="off"
    aria-label="Код записи"
    aria-invalid={codeError ? 'true' : 'false'}
    aria-describedby={codeError ? 'feed-composer-code-error' : undefined}
    bind:value={codeText}
    onblur={() => { if (editView === 'code') applyCodeView(false); }}
  ></textarea>
  {#if codeError}
    <p id="feed-composer-code-error" class="feed-composer__error" role="alert">{codeError}</p>
  {/if}
{/snippet}

{#snippet canvas()}
  <div class="feed-composer__canvas">
    {#each blocks as block, index (block.id)}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class="feed-composer__block"
        class:is-focused={focusedId === block.id}
        class:is-delimiter={block.type === 'delimiter'}
        data-block-id={block.id}
        role="group"
        aria-label="Блок редактора"
        aria-current={focusedId === block.id ? 'true' : undefined}
        onpointerdown={() => { focusedId = block.id; }}
      >
        {#if !isPage}
          <button
            type="button"
            class="feed-composer__grip"
            class:is-open={menu === 'tune' && tuneIndex === index}
            aria-label="Действия с блоком"
            aria-haspopup="menu"
            onmousedown={keepSelection}
            onclick={(e) => { focusedId = block.id; openMenu('tune', e, index); }}
          >{@html iconGripVertical(16)}</button>
        {/if}
        {#if block.type === 'paragraph' || block.type === 'header'}
          <div
            class="feed-composer__ce"
            class:feed-composer__ce--h={block.type === 'header'}
            contenteditable="true"
            role="textbox"
            tabindex="0"
            data-block-id={block.id}
            data-field="main"
            data-placeholder={block.type === 'header'
              ? 'Заголовок'
              : index === 0
                ? (isPage ? 'Начните писать…' : 'Начните писать — Enter создаёт новый блок')
                : 'Текст'}
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
              tabindex="0"
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
              tabindex="0"
              data-block-id={block.id}
              data-field="caption"
              data-placeholder="Автор цитаты"
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
                tabindex="0"
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
            role="group"
            aria-label="Изображения"
            onfocusin={() => { focusedId = block.id; focusedItem = null; }}
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
                        disabled={mediaBusy}
                        onclick={() => pickImages(block.id)}
                      >
                        {@html iconPlus(14)}
                        <span>Добавить ещё</span>
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
                <span>Добавить ещё</span>
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
{/snippet}

{#snippet editBody()}
  {#if effectiveRepost && !isSuggestion}
    <p class="feed-composer__repost-hint">{@html iconRepost(14)}<span>Репост записи #{effectiveRepost.id} — можно добавить свой текст</span></p>
  {/if}
  {#if editView === 'code'}
    {@render codeView()}
  {:else}
    {@render canvas()}
  {/if}
  {#if errorMsg && !(editView === 'code' && codeError)}
    <p class="feed-composer__error" role="alert">{errorMsg}</p>
  {/if}
{/snippet}

{#snippet previewPostCard()}
  {#if previewPost}
    <div class="feed-composer__preview-card">
      <UiV2FeedPost data={previewPost} staticPreview />
    </div>
  {/if}
{/snippet}

{#snippet deskBar()}
  <header class="feed-composer__bar">
    <div class="feed-composer__bar-start">
      {#if !isWindow}
        <button
          type="button"
          class="feed-composer__icon-btn"
          aria-label="Закрыть редактор"
          onclick={requestClose}
        >{@html iconX(20)}</button>
      {/if}
      <button
        type="button"
        class="feed-composer__dest"
        class:is-open={menu === 'channel'}
        disabled={!canPickChannel}
        aria-haspopup="menu"
        aria-expanded={menu === 'channel'}
        onclick={(e) => openMenu('channel', e)}
      >
        {@render avatar(selectedChannel, 'md')}
        <span class="feed-composer__dest-copy">
          <span class="feed-composer__dest-kicker">
            {isSuggestion
              ? 'Предложение в канал'
              : isEditMode
                ? 'Правка записи'
                : selectedChannel?.is_blog
                  ? 'Публикация в блог'
                  : 'Публикация в канал'}
          </span>
          <span class="feed-composer__dest-name">{selectedChannel?.title || 'Куда публиковать?'}</span>
        </span>
        {#if canPickChannel}
          <span class="feed-composer__dest-chevron" aria-hidden="true">{@html iconChevronDown(16)}</span>
        {/if}
      </button>
    </div>

    <div class="feed-composer__steps" role="group" aria-label="Шаги">
      <button
        type="button"
        class="feed-composer__step"
        class:is-active={step === 'edit'}
        class:is-done={step === 'preview'}
        aria-current={step === 'edit' ? 'step' : undefined}
        onclick={() => { if (step === 'preview') step = 'edit'; }}
      >
        <span class="feed-composer__step-num" aria-hidden="true">
          {#if step === 'preview'}{@html iconCheck(12)}{:else}1{/if}
        </span>
        {isEditMode ? 'Правка' : 'Текст'}
      </button>
      <span class="feed-composer__step-line" aria-hidden="true"></span>
      <button
        type="button"
        class="feed-composer__step"
        class:is-active={step === 'preview'}
        aria-current={step === 'preview' ? 'step' : undefined}
        disabled={step === 'edit' && !canGoPreview}
        onclick={() => { if (step === 'edit') goPreview(); }}
      >
        <span class="feed-composer__step-num" aria-hidden="true">2</span>
        Публикация
      </button>
    </div>

    <div class="feed-composer__bar-actions">
      {#if step === 'edit'}
        <UiV2Button
          variant="primary"
          size="sm"
          label="Далее"
          disabled={!canGoPreview}
          onclick={goPreview}
        >
          {#snippet trailing()}{@html iconArrowRight(16)}{/snippet}
        </UiV2Button>
      {:else}
        <UiV2Button variant="ghost" size="sm" label="Назад" onclick={() => { step = 'edit'; }} />
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
{/snippet}

{#snippet deskToolbar()}
  <div class="feed-composer__toolbar" role="toolbar" aria-label="Форматирование записи">
    {#if editView === 'block'}
      <div class="feed-composer__tgroup">
        <UiV2Tooltip text={`Отменить · ${shortcutLabel('Ctrl+Z')}`} placement="bottom">
          <button
            type="button"
            class="feed-composer__tool"
            aria-label="Отменить"
            disabled={!canUndo}
            onmousedown={keepSelection}
            onclick={undo}
          >{@html iconRotateCcw(16)}</button>
        </UiV2Tooltip>
        <UiV2Tooltip text={`Повторить · ${shortcutLabel('Ctrl+Y')}`} placement="bottom">
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

      <span class="feed-composer__tsep" aria-hidden="true"></span>

      <button
        type="button"
        class="feed-composer__kind"
        class:is-open={menu === 'kind'}
        aria-haspopup="menu"
        aria-expanded={menu === 'kind'}
        aria-label="Тип блока"
        disabled={!currentKind}
        onmousedown={keepSelection}
        onclick={(e) => openMenu('kind', e)}
      >
        <span class="feed-composer__kind-icon" aria-hidden="true">{@html (currentKind?.icon ?? iconType)(16)}</span>
        <span class="feed-composer__kind-label">
          {currentKind?.label
            ?? (focusedBlock?.type === 'media' ? 'Изображения' : focusedBlock?.type === 'embed' ? 'Ссылка' : 'Текст')}
        </span>
        <span class="feed-composer__kind-chevron" aria-hidden="true">{@html iconChevronDown(14)}</span>
      </button>

      <span class="feed-composer__tsep" aria-hidden="true"></span>

      <div class="feed-composer__tgroup">
        <UiV2Tooltip text={`Жирный · ${shortcutLabel('Ctrl+B')}`} placement="bottom">
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
        <UiV2Tooltip text={`Курсив · ${shortcutLabel('Ctrl+I')}`} placement="bottom">
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
        <UiV2Tooltip text={`Ссылка на выделенный текст · ${shortcutLabel('Ctrl+K')}`} placement="bottom">
          <button
            type="button"
            class="feed-composer__tool"
            aria-label="Ссылка на текст"
            onmousedown={keepSelection}
            onclick={() => openLinkDialog('inline')}
          >{@html iconLink(16)}</button>
        </UiV2Tooltip>
      </div>

      <span class="feed-composer__tsep" aria-hidden="true"></span>

      <div class="feed-composer__tgroup">
        <button
          type="button"
          class="feed-composer__tbtn"
          disabled={mediaBusy}
          onmousedown={keepSelection}
          onclick={() => pickImages()}
        >{@html iconImage(16)}<span>Фото</span></button>
        <button
          type="button"
          class="feed-composer__tbtn"
          disabled={mediaBusy}
          onmousedown={keepSelection}
          onclick={() => openLinkDialog('embed')}
        >{@html iconPaperclip(16)}<span>Ссылка</span></button>
      </div>
    {:else}
      <p class="feed-composer__toolbar-note">
        Правьте JSON напрямую — изменения применятся при возврате к блокам
      </p>
    {/if}

    <div class="feed-composer__toolbar-end">
      {@render viewSwitch()}
    </div>
  </div>
{/snippet}

{#snippet deskStatus()}
  <footer class="feed-composer__status">
    {#if showDraftState && !mediaBusy}
      <span
        class="feed-composer__status-main"
        class:is-saved={!draftSaving}
        class:is-saving={draftSaving}
        aria-live="polite"
      >
        <span class="feed-composer__status-icon" aria-hidden="true">
          {@html draftSaving ? iconRefreshCw(12) : iconCheck(12)}
        </span>
        {draftSaving ? 'Сохраняем черновик…' : `Черновик сохранён в ${draftTimeLabel()}`}
      </span>
    {:else}
      <span class="feed-composer__status-main">{statusText}</span>
    {/if}
    {#if editView === 'block'}
      <span class="feed-composer__status-count">Блоков: {blocks.length} из {ARTICLE_MAX_BLOCKS}</span>
      <span class="feed-composer__status-hint">Enter — новый блок · Shift+Enter — перенос строки · картинку можно вставить из буфера</span>
    {/if}
  </footer>
{/snippet}

{#snippet deskPreview()}
  <UiV2ScrollArea class="feed-composer__scroll" padding="1.5rem 1.5rem 2rem">
    <div class="feed-composer__publish">
      <div class="feed-composer__publish-head">
        <h2 class="feed-composer__publish-title">
          {isSuggestion ? 'Предложение почти готово!' : isEditMode ? 'Изменения почти готовы!' : 'Запись почти готова!'}
        </h2>
        <p class="feed-composer__publish-text">
          Ниже можно настроить параметры записи и посмотреть, как она будет выглядеть после публикации.
          Убедитесь, что запись соответствует правилам сообщества.
        </p>
      </div>

      {#if !selectedChannel?.is_blog}
        <div class="feed-composer__publish-row">
          <div class="feed-composer__switch-copy">
            <span class="feed-composer__switch-title">Подпись автора</span>
            <span class="feed-composer__switch-desc">Читатели увидят пометку с вашим именем</span>
          </div>
          <UiV2Toggle label="Подпись автора" checked={isSigned} onChange={(v) => { isSigned = v; }} />
        </div>
      {/if}

      {#if isSuggestion}
        <p class="feed-composer__note">
          Запись уйдёт администраторам канала «{selectedChannel?.title || 'канал'}» — они решат, публиковать ли её.
        </p>
      {:else if effectiveRepost}
        <p class="feed-composer__note">Запись будет опубликована как репост записи #{effectiveRepost.id}.</p>
      {/if}

      <p class="feed-composer__section-label">Так запись увидят читатели</p>
      {@render previewPostCard()}
      {#if errorMsg}
        <p class="feed-composer__error" role="alert">{errorMsg}</p>
      {/if}
    </div>
  </UiV2ScrollArea>
{/snippet}

{#snippet pageBar()}
  <header class="feed-composer__appbar">
    <button
      type="button"
      class="feed-composer__appbar-btn"
      aria-label="Назад"
      onclick={() => (step === 'preview' ? (step = 'edit') : requestClose())}
    >{@html iconArrowLeft(22)}</button>
    <button
      type="button"
      class="feed-composer__appbar-who"
      disabled={step === 'preview' || !canPickChannel}
      aria-haspopup={canPickChannel ? 'menu' : undefined}
      aria-label={canPickChannel ? `${pageTitle}: выбрать, куда публиковать` : pageTitle}
      onclick={(e) => openMenu('channel', e)}
    >
      <span class="feed-composer__appbar-avatar">
        {@render avatar(selectedChannel, 'lg')}
        {#if canPickChannel && step === 'edit'}
          <span class="feed-composer__appbar-chevron" aria-hidden="true">{@html iconChevronDown(10)}</span>
        {/if}
      </span>
      <span class="feed-composer__appbar-title">{pageTitle}</span>
    </button>
    {#if step === 'edit' && showDraftState}
      <button
        type="button"
        class="feed-composer__appbar-btn feed-composer__appbar-btn--narrow feed-composer__draft-state"
        class:is-saving={draftSaving}
        aria-label={draftSaving ? 'Черновик сохраняется' : 'Черновик сохранён'}
        aria-live="polite"
        onclick={showDraftInfo}
      >
        {#key draftSaving}
          <span class="feed-composer__draft-icon">
            {@html draftSaving ? iconRefreshCw(22) : iconCircleCheck(22)}
          </span>
        {/key}
      </button>
    {/if}
    {#if step === 'edit' && hasContent}
      <button
        type="button"
        class="feed-composer__appbar-btn feed-composer__appbar-btn--narrow"
        aria-label={isEditMode ? 'Вернуть назад' : 'Очистить'}
        onclick={() => { clearOpen = true; }}
      >{@html iconRotateCcw(22)}</button>
    {/if}
    {#if step === 'edit'}
      <button
        type="button"
        class="feed-composer__appbar-btn feed-composer__appbar-btn--accent"
        aria-label="Далее"
        disabled={!canGoPreview}
        onclick={goPreview}
      >{@html iconArrowRight(22)}</button>
    {:else}
      <button
        type="button"
        class="feed-composer__appbar-btn feed-composer__appbar-btn--accent"
        aria-label={isSuggestion ? 'Предложить' : isEditMode ? 'Сохранить' : 'Опубликовать'}
        aria-busy={publishBusy ? 'true' : undefined}
        disabled={!canPublish}
        onclick={() => void publish()}
      >
        {#if publishBusy}
          <span class="feed-composer__spinner" aria-hidden="true"></span>
        {:else}
          {@html iconCheck(22)}
        {/if}
      </button>
    {/if}
  </header>
{/snippet}

{#snippet pageDock()}
  <div class="feed-composer__dock" role="toolbar" aria-label="Инструменты записи">
    <div class="feed-composer__dock-row">
      {#if editView === 'block'}
        <div class="feed-composer__pill">
          <button
            type="button"
            class="feed-composer__dock-btn"
            aria-label="Добавить блок"
            aria-haspopup="menu"
            onmousedown={keepSelection}
            onclick={(e) => openMenu('insert', e)}
          >{@html iconPlus(22)}</button>
          <button
            type="button"
            class="feed-composer__dock-btn"
            aria-label="Действия с блоком"
            aria-haspopup="menu"
            disabled={focusedIndex < 0}
            onmousedown={keepSelection}
            onclick={(e) => openMenu('tune', e, focusedIndex)}
          >{@html iconMoreVertical(22)}</button>
        </div>

        <div class="feed-composer__pill">
          <button
            type="button"
            class="feed-composer__dock-btn feed-composer__dock-btn--text"
            aria-label={`Тип блока: ${currentKind?.label ?? 'нет'}`}
            aria-haspopup="menu"
            disabled={!currentKind}
            onmousedown={keepSelection}
            onclick={(e) => openMenu('kind', e)}
          >Aa</button>
          <button
            type="button"
            class="feed-composer__dock-btn"
            class:is-active={inlineBold}
            aria-pressed={inlineBold}
            aria-label="Жирный"
            onmousedown={keepSelection}
            onclick={() => applyInline('bold')}
          >{@html iconBold(20)}</button>
          <button
            type="button"
            class="feed-composer__dock-btn"
            class:is-active={inlineItalic}
            aria-pressed={inlineItalic}
            aria-label="Курсив"
            onmousedown={keepSelection}
            onclick={() => applyInline('italic')}
          >{@html iconItalic(20)}</button>
          <button
            type="button"
            class="feed-composer__dock-btn"
            aria-label="Ссылка на выделенный текст"
            onmousedown={keepSelection}
            onclick={() => openLinkDialog('inline')}
          >{@html iconLink(20)}</button>
          <button
            type="button"
            class="feed-composer__dock-btn"
            aria-label="Прикрепить изображения"
            disabled={mediaBusy}
            onmousedown={keepSelection}
            onclick={() => pickImages()}
          >{@html iconPaperclip(20)}</button>
        </div>

        <div class="feed-composer__pill feed-composer__pill--history">
          <button
            type="button"
            class="feed-composer__dock-btn"
            aria-label="Отменить"
            disabled={!canUndo}
            onmousedown={keepSelection}
            onclick={undo}
          >{@html iconRotateCcw(20)}</button>
          <button
            type="button"
            class="feed-composer__dock-btn"
            aria-label="Повторить"
            disabled={!canRedo}
            onmousedown={keepSelection}
            onclick={redo}
          >{@html iconRotateCw(20)}</button>
        </div>
      {/if}

      <div class="feed-composer__pill">
        <button
          type="button"
          class="feed-composer__dock-btn"
          class:is-active={editView === 'code'}
          aria-pressed={editView === 'code'}
          aria-label={editView === 'code' ? 'Вернуться к блокам' : 'Код записи'}
          onclick={() => setEditView(editView === 'code' ? 'block' : 'code')}
        >{@html iconCodeXml(20)}</button>
      </div>
    </div>
  </div>
{/snippet}

{#snippet pagePreview()}
  <UiV2ScrollArea class="feed-composer__scroll" padding="0 0 1.5rem">
    <div class="feed-composer__ready">
      <h2 class="feed-composer__ready-title">
        {isSuggestion ? 'Предложение почти готово!' : 'Запись почти готова!'}
      </h2>
      <p class="feed-composer__ready-text">
        Ниже вы можете настроить дополнительные параметры записи, а также ознакомиться с тем, как она будет
        выглядеть после публикации. Убедитесь, что запись также соответствует правилам нашего сообщества
      </p>
    </div>
    <div class="feed-composer__divider" aria-hidden="true"></div>
    {#if !selectedChannel?.is_blog}
      <div class="feed-composer__switch-row">
        <div class="feed-composer__switch-copy">
          <span class="feed-composer__switch-title">Подпись автора</span>
          <span class="feed-composer__switch-desc">Пользователям будет видна пометка с именем автора</span>
        </div>
        <UiV2Toggle label="Подпись автора" checked={isSigned} onChange={(v) => { isSigned = v; }} />
      </div>
      <div class="feed-composer__divider" aria-hidden="true"></div>
    {/if}
    {#if isSuggestion}
      <p class="feed-composer__note feed-composer__note--pad">
        Будет отправлено как предложение в «{selectedChannel?.title || 'канал'}»
      </p>
    {:else if effectiveRepost}
      <p class="feed-composer__note feed-composer__note--pad">Будет опубликовано как репост записи #{effectiveRepost.id}</p>
    {/if}
    {@render previewPostCard()}
    {#if errorMsg}
      <p class="feed-composer__error feed-composer__note--pad" role="alert">{errorMsg}</p>
    {/if}
  </UiV2ScrollArea>
{/snippet}

{#if open}
  <div
    class="feed-composer"
    class:feed-composer--preview={step === 'preview'}
    class:feed-composer--window={isWindow}
    class:feed-composer--page={isPage}
    class:feed-composer--code={editView === 'code'}
    style:padding-bottom={isPage && keyboardInset > 0 ? `${keyboardInset}px` : undefined}
    role="presentation"
  >
    <div
      class="feed-composer__shell"
      role={isPage ? 'main' : 'dialog'}
      aria-modal={isPage ? undefined : 'true'}
      aria-label={isPage ? pageTitle : headerTitle}
    >
      {#if isPage}
        {@render pageBar()}
      {:else}
        {@render deskBar()}
      {/if}

      {#if channels.length === 0 && !isEditMode}
        {@render emptyState()}
      {:else if step === 'edit'}
        {#if !isPage}
          {@render deskToolbar()}
        {/if}
        <UiV2ScrollArea
          class="feed-composer__scroll"
          padding={isPage ? '0.75rem 1rem 6.5rem' : '1.5rem 1.5rem 2rem'}
        >
          <div class="feed-composer__sheet">
            {@render editBody()}
          </div>
        </UiV2ScrollArea>
        {#if isPage}
          {@render pageDock()}
        {:else}
          {@render deskStatus()}
        {/if}
      {:else if isPage}
        {@render pagePreview()}
      {:else}
        {@render deskPreview()}
      {/if}
    </div>

    {#if inlineOpen && step === 'edit' && editView === 'block' && !isPage}
      <div
        class="feed-composer__inline"
        role="toolbar"
        aria-label="Форматирование"
        style={`left:${inlineX}px; top:${inlineY}px`}
      >
        <button type="button" class="feed-composer__tool" class:is-active={inlineBold} aria-pressed={inlineBold} aria-label="Жирный" onmousedown={keepSelection} onclick={() => applyInline('bold')}>{@html iconBold(16)}</button>
        <button type="button" class="feed-composer__tool" class:is-active={inlineItalic} aria-pressed={inlineItalic} aria-label="Курсив" onmousedown={keepSelection} onclick={() => applyInline('italic')}>{@html iconItalic(16)}</button>
        <button type="button" class="feed-composer__tool" aria-label="Ссылка на текст" onmousedown={keepSelection} onclick={() => openLinkDialog('inline')}>{@html iconLink(16)}</button>
      </div>
    {/if}

    {#if linkOpen}
      {#if isPage}
        <button
          type="button"
          class="feed-composer__scrim"
          aria-label="Закрыть"
          onclick={() => { linkOpen = false; linkRange = null; }}
        ></button>
      {/if}
      <div
        class="feed-composer__link"
        role="dialog"
        aria-label={linkMode === 'embed' ? 'Карточка ссылки' : 'Ссылка на текст'}
      >
        <p class="feed-composer__link-title">
          {linkMode === 'embed' ? 'Карточка ссылки' : 'Добавить ссылку'}
        </p>
        <div class="feed-composer__link-row">
          <input
            class="feed-composer__link-input"
            type="url"
            inputmode="url"
            placeholder={isPage ? 'URL' : 'https://'}
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
          {#if !isPage}
            <UiV2Button variant="primary" size="sm" label="Готово" onclick={() => void applyLink()} />
            <button
              type="button"
              class="feed-composer__icon-btn"
              aria-label="Отмена"
              onclick={() => { linkOpen = false; linkRange = null; }}
            >{@html iconX(16)}</button>
          {/if}
        </div>
        {#if isPage}
          <div class="feed-composer__link-actions">
            <UiV2Button variant="ghost" label="Отмена" onclick={() => { linkOpen = false; linkRange = null; }} />
            <UiV2Button variant="primary" label="Готово" onclick={() => void applyLink()} />
          </div>
        {/if}
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

  <UiV2PopupMenu
    open={menu !== null}
    x={menuX}
    y={menuY}
    placement="anchor"
    dropdown={!isPage && (menu === 'channel' || menu === 'kind')}
    anchor={menuAnchor}
    items={menuItems}
    title={isPage ? menuTitle : ''}
    onClose={closeMenu}
    onSelect={(id) => onMenuSelect(id)}
  />

  {#if clearOpen}
    <UiV2ChoiceSheet
      title={isEditMode ? 'Вернуть назад' : 'Очистить'}
      summary={isEditMode
        ? 'Вернуть запись к исходному состоянию? Все внесённые изменения будут утрачены.'
        : 'Вернуться к белому чистому листу, чтобы продолжить творить сначала?'}
      options={[{ value: 'yes', label: isEditMode ? 'Вернуть как было' : 'Очистить запись' }]}
      value=""
      onSelect={clearEditor}
      onClose={() => { clearOpen = false; }}
    />
  {/if}
{/if}
