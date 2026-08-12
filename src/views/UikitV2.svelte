<script lang="ts">
  import { navigate } from '../stores/navigation';
  import {
    iconBookmark,
    iconCheck,
    iconChevronLeft,
    iconChevronRight,
    iconCopy,
    iconInfo,
    iconMoreHorizontal,
    iconPin,
    iconPlus,
    iconSettings,
    iconSlidersHorizontal,
    iconShuffle,
    iconShare,
    iconTrash2,
    iconX,
  } from '../components/icons';
  import UiV2RoundButton from '../components/uikit-v2/UiV2RoundButton.svelte';
  import UiV2Button from '../components/uikit-v2/UiV2Button.svelte';
  import UiV2OutlinedField from '../components/uikit-v2/UiV2OutlinedField.svelte';
  import UiV2PillBar from '../components/uikit-v2/UiV2PillBar.svelte';
  import UiV2BackBar from '../components/uikit-v2/UiV2BackBar.svelte';
  import UiV2ChoiceSheet from '../components/uikit-v2/UiV2ChoiceSheet.svelte';
  import UiV2Card from '../components/uikit-v2/UiV2Card.svelte';
  import UiV2AnimeCard from '../components/uikit-v2/UiV2AnimeCard.svelte';
  import UiV2PopupMenu, { type UiV2PopupMenuItem } from '../components/uikit-v2/UiV2PopupMenu.svelte';
  import UiV2SectionHeader from '../components/uikit-v2/UiV2SectionHeader.svelte';
  import UiV2ReleaseCarousel from '../components/uikit-v2/UiV2ReleaseCarousel.svelte';
  import UiV2DiscussList, { type UiV2DiscussItem } from '../components/uikit-v2/UiV2DiscussList.svelte';
  import UiV2CollectionCard, {
    type UiV2CollectionCardData,
  } from '../components/uikit-v2/UiV2CollectionCard.svelte';
  import UiV2SearchFranchise, {
    type UiV2SearchFranchiseData,
  } from '../components/uikit-v2/UiV2SearchFranchise.svelte';
  import UiV2Tabs, { type UiV2TabItem } from '../components/uikit-v2/UiV2Tabs.svelte';
  import UiV2CommentThread, {
    type UiV2CommentNode,
  } from '../components/uikit-v2/UiV2CommentThread.svelte';
  import UiV2AnimeCardSkeleton from '../components/uikit-v2/UiV2AnimeCardSkeleton.svelte';
  import UiV2DiscussListSkeleton from '../components/uikit-v2/UiV2DiscussListSkeleton.svelte';
  import UiV2CollectionCardSkeleton from '../components/uikit-v2/UiV2CollectionCardSkeleton.svelte';
  import UiV2ReleaseCarouselSkeleton from '../components/uikit-v2/UiV2ReleaseCarouselSkeleton.svelte';
  import UiV2CommentThreadSkeleton from '../components/uikit-v2/UiV2CommentThreadSkeleton.svelte';
  import UiV2ApiPanelSkeleton from '../components/uikit-v2/UiV2ApiPanelSkeleton.svelte';
  import UiV2ScrollArea from '../components/uikit-v2/UiV2ScrollArea.svelte';
  import UiV2Tooltip from '../components/uikit-v2/UiV2Tooltip.svelte';
  import UiV2Select from '../components/uikit-v2/UiV2Select.svelte';
  import UiV2EndpointSelect from '../components/uikit-v2/UiV2EndpointSelect.svelte';
  import { showToast } from '../stores/toast';
  import { handleUserProfileClick } from '../stores/user-profile';
  import { normalizeCommentProfile, normalizeCommentsFromResponse } from '../utils/comment';
  import { resolveJacksonEntity } from '../utils/jackson-refs';
  import { mapOverviewCommentWeek } from '../utils/overview';
  import type { CommentData } from '../types/comment';
  import { buildPosterUrl, toCdnProxyUrl, resolveCdnAssetUrl } from '../utils/posterUrl';
  import type { UiV2CommentComposerPayload } from '../components/uikit-v2/UiV2CommentComposer.svelte';
  import { getHomeTabFilterArgs } from '../data/homeTabs';
  import {
    DEFAULT_PLAYBACK_RATE,
    PLAYBACK_RATE_MAX,
    PLAYBACK_RATE_MIN,
    PLAYBACK_RATE_STEP,
    PLAYBACK_RATE_WARN,
    formatPlaybackRate,
  } from '../utils/player-hotkeys';

  type SectionId = 'tokens' | 'type' | 'controls' | 'surfaces' | 'cards' | 'comments' | 'menu';

  const sections: { id: SectionId; title: string; desc: string }[] = [
    { id: 'tokens', title: 'Токены', desc: 'Цвета, радиусы, тени — основа V2' },
    { id: 'type', title: 'Типографика', desc: 'Иерархия заголовков и текста' },
    { id: 'controls', title: 'Контролы', desc: 'Кнопки, pill-навигация, вкладки, поля' },
    { id: 'surfaces', title: 'Поверхности', desc: 'Панели, модалки, карточки взаимодействия' },
    { id: 'cards', title: 'Карточки', desc: 'Аниме, карусель, обсуждения, коллекции, франшиза' },
    { id: 'comments', title: 'Комментарии', desc: 'Треды, спойлеры, голоса, глубокая вложенность' },
    { id: 'menu', title: 'Popup Menu', desc: 'Вложенные меню, тоглы, копирование без закрытия' },
  ];

  let active: SectionId = $state('comments');

  const pillItems = [
    { id: '1', label: 'Maks1mio' },
    { id: '2', label: 'Releases' },
    { id: '3', label: 'Friends' },
  ];
  let pillIndex = $state(1);

  let tabsBookmarksDemoId = $state('planned');
  const tabsBookmarksDemo: UiV2TabItem[] = [
    { id: 'watching', label: 'Смотрю' },
    { id: 'planned', label: 'В планах' },
    { id: 'completed', label: 'Просмотрено' },
    { id: 'on_hold', label: 'Отложено' },
    { id: 'dropped', label: 'Брошено' },
    { id: 'collections', label: 'Коллекции', dividerBefore: true },
    { id: 'history', label: 'История' },
    { id: 'votes', label: 'Оценки' },
    { id: 'favorites', label: 'Избранное' },
  ];

  let tabsHomeDemoId = $state('anime');
  const tabsHomeDemo: UiV2TabItem[] = [
    { id: 'my', label: 'Моя вкладка' },
    { id: 'anime', label: 'Аниме' },
    { id: 'donghua', label: 'Дунхуа' },
    { id: 'latest', label: 'Последнее' },
    { id: 'ongoing', label: 'Онгоинги' },
    { id: 'announcements', label: 'Анонсы' },
    { id: 'completed', label: 'Завершенные' },
    { id: 'movies', label: 'Фильмы' },
    { id: 'ova', label: 'OVA' },
    { id: 'specials', label: 'Спешлы' },
  ];

  let choiceOpen = $state(false);
  let choiceValue = $state(0);
  const choiceOptions = [
    { value: 0, label: 'Все пользователи' },
    { value: 1, label: 'Только друзья' },
    { value: 2, label: 'Только я' },
  ];

  let demoLogin = $state('');
  let demoPassword = $state('');
  let demoNickname = $state('');
  let demoStatus = $state('');

  const selectDemoOptions = [
    { value: 'api-s.anixsekai.com', label: 'api-s.anixsekai.com', status: 'good' as const, hint: '24 ms' },
    { value: 'api.anixart.app', label: 'api.anixart.app', status: 'medium' as const, hint: '86 ms' },
    {
      value: 'api.anixart.tv',
      label: 'api.anixart.tv',
      desc: 'Заблокирован в РФ',
      status: 'offline' as const,
      disabled: true,
    },
  ];
  let selectDemoValue = $state('api-s.anixsekai.com');

  let popupNotify = $state(true);
  let popupAutoplay = $state(false);
  let popupPinned = $state(false);
  let popupSubtitles = $state(true);
  let popupVisibility = $state<'all' | 'friends' | 'me'>('friends');
  let popupQuality = $state<'auto' | '1080' | '720' | '480'>('auto');
  let popupCopied = $state('');
  let popupPlaybackRate = $state(1);

  const DEMO_SHARE_URL = 'https://anix.app/release/demo';

  const franchiseDemoData: UiV2SearchFranchiseData = {
    name: 'black_clover',
    releaseCount: 7,
    firstReleaseId: 20055,
    relatedId: 20055,
    images: [
      'https://s.anixmirai.com/posters/VPHehhgSpJ9VRap8e2VpahnZPYyaof.jpg',
      'https://s.anixmirai.com/posters/VPHehhgSpJ9VRap8e2VpahnZPYyaof.jpg',
      'https://s.anixmirai.com/posters/VPHehhgSpJ9VRap8e2VpahnZPYyaof.jpg',
    ],
  };

  const popupDemoItems = $derived<UiV2PopupMenuItem[]>([
    { id: 'bookmark', label: 'В закладки', icon: iconBookmark(18) },
    {
      id: 'share',
      label: 'Поделиться',
      icon: iconShare(18),
      children: [
        {
          id: 'copy-link',
          label: popupCopied === 'copy-link' ? 'Ссылка скопирована' : 'Копировать ссылку',
          icon: popupCopied === 'copy-link' ? iconCheck(16) : iconCopy(16),
          keepOpen: true,
        },
        {
          id: 'copy-html',
          label: popupCopied === 'copy-html' ? 'HTML скопирован' : 'Копировать HTML',
          icon: popupCopied === 'copy-html' ? iconCheck(16) : iconCopy(16),
          keepOpen: true,
        },
        {
          id: 'copy-title',
          label: popupCopied === 'copy-title' ? 'Название скопировано' : 'Копировать название',
          icon: popupCopied === 'copy-title' ? iconCheck(16) : iconCopy(16),
          keepOpen: true,
          dividerBefore: true,
        },
      ],
    },
    {
      id: 'options',
      label: 'Опции',
      icon: iconSlidersHorizontal(18),
      children: [
        {
          id: 'playback-rate',
          label: 'Скорость',
          type: 'slider',
          value: popupPlaybackRate,
          valueText: formatPlaybackRate(popupPlaybackRate),
          min: PLAYBACK_RATE_MIN,
          max: PLAYBACK_RATE_MAX,
          step: PLAYBACK_RATE_STEP,
          minLabel: `${PLAYBACK_RATE_MIN}×`,
          maxLabel: `${PLAYBACK_RATE_MAX}×`,
          warnAt: PLAYBACK_RATE_WARN,
          warnText: 'Выше 2× плеер может не успевать буферизировать видео.',
          showReset: true,
          resetValue: DEFAULT_PLAYBACK_RATE,
          keepOpen: true,
        },
        {
          id: 'quality-auto',
          label: 'Качество: Авто',
          type: 'radio',
          checked: popupQuality === 'auto',
          dividerBefore: true,
          keepOpen: true,
        },
        {
          id: 'quality-1080',
          label: '1080p',
          type: 'radio',
          checked: popupQuality === '1080',
          keepOpen: true,
        },
        {
          id: 'quality-720',
          label: '720p',
          type: 'radio',
          checked: popupQuality === '720',
          keepOpen: true,
        },
        {
          id: 'quality-480',
          label: '480p',
          type: 'radio',
          checked: popupQuality === '480',
          keepOpen: true,
        },
        {
          id: 'subtitles',
          label: 'Субтитры',
          type: 'toggle',
          checked: popupSubtitles,
          dividerBefore: true,
          keepOpen: true,
        },
        {
          id: 'pin',
          label: 'Закрепить',
          icon: iconPin(16),
          type: 'toggle',
          checked: popupPinned,
          keepOpen: true,
        },
      ],
    },
    {
      id: 'visibility-all',
      label: 'Видно всем',
      type: 'radio',
      checked: popupVisibility === 'all',
      dividerBefore: true,
      keepOpen: true,
    },
    {
      id: 'visibility-friends',
      label: 'Только друзья',
      type: 'radio',
      checked: popupVisibility === 'friends',
      keepOpen: true,
    },
    {
      id: 'visibility-me',
      label: 'Только я',
      type: 'radio',
      checked: popupVisibility === 'me',
      keepOpen: true,
    },
    {
      id: 'notify',
      label: 'Уведомления',
      icon: iconSettings(18),
      type: 'toggle',
      checked: popupNotify,
      dividerBefore: true,
      keepOpen: true,
    },
    {
      id: 'autoplay',
      label: 'Автовоспроизведение',
      type: 'toggle',
      checked: popupAutoplay,
      keepOpen: true,
    },
    { id: 'info', label: 'Подробнее', icon: iconInfo(18), dividerBefore: true },
    { id: 'remove', label: 'Скрыть', icon: iconTrash2(18), danger: true, dividerBefore: true },
  ]);

  let popupOpen = $state(false);
  let popupX = $state(0);
  let popupY = $state(0);
  let popupPlacement = $state<'point' | 'anchor'>('anchor');
  let popupLastAction = $state('—');

  async function copyText(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  }

  async function onPopupSelect(id: string) {
    popupLastAction = id;
    if (id === 'copy-link') {
      const ok = await copyText(DEMO_SHARE_URL);
      popupCopied = ok ? 'copy-link' : '';
      showToast(ok ? 'Ссылка скопирована' : 'Не удалось скопировать');
      if (ok) window.setTimeout(() => { if (popupCopied === 'copy-link') popupCopied = ''; }, 1600);
      return;
    }
    if (id === 'copy-html') {
      const html = `<a href="${DEMO_SHARE_URL}">AnixApp</a>`;
      const ok = await copyText(html);
      popupCopied = ok ? 'copy-html' : '';
      showToast(ok ? 'HTML скопирован' : 'Не удалось скопировать');
      if (ok) window.setTimeout(() => { if (popupCopied === 'copy-html') popupCopied = ''; }, 1600);
      return;
    }
    if (id === 'copy-title') {
      const ok = await copyText('Demo Release — AnixApp');
      popupCopied = ok ? 'copy-title' : '';
      showToast(ok ? 'Название скопировано' : 'Не удалось скопировать');
      if (ok) window.setTimeout(() => { if (popupCopied === 'copy-title') popupCopied = ''; }, 1600);
      return;
    }
    if (
      id.startsWith('visibility-') ||
      id.startsWith('quality-') ||
      id === 'notify' ||
      id === 'autoplay' ||
      id === 'subtitles' ||
      id === 'pin' ||
      id === 'playback-rate'
    ) {
      return;
    }
    showToast(`Popup: ${id}`);
  }

  function onPopupChecked(id: string, checked: boolean) {
    if (id === 'notify') popupNotify = checked;
    else if (id === 'autoplay') popupAutoplay = checked;
    else if (id === 'subtitles') popupSubtitles = checked;
    else if (id === 'pin') popupPinned = checked;
    else if (id === 'visibility-all') popupVisibility = 'all';
    else if (id === 'visibility-friends') popupVisibility = 'friends';
    else if (id === 'visibility-me') popupVisibility = 'me';
    else if (id === 'quality-auto') popupQuality = 'auto';
    else if (id === 'quality-1080') popupQuality = '1080';
    else if (id === 'quality-720') popupQuality = '720';
    else if (id === 'quality-480') popupQuality = '480';
    popupLastAction = `${id}=${checked}`;
  }

  function onPopupValueChange(id: string, value: number) {
    if (id === 'playback-rate') {
      popupPlaybackRate = value;
      popupLastAction = `${id}=${formatPlaybackRate(value)}`;
    }
  }

  function openPopupFromButton(e: MouseEvent) {
    const btn = e.currentTarget as HTMLElement;
    const r = btn.getBoundingClientRect();
    popupPlacement = 'anchor';
    popupX = r.left + r.width / 2;
    popupY = r.bottom + 4;
    popupOpen = true;
  }

  function openPopupFromContext(e: MouseEvent) {
    e.preventDefault();
    popupPlacement = 'point';
    popupX = e.clientX;
    popupY = e.clientY;
    popupOpen = true;
  }

  type AnimeCardDemo = {
    id: number | string;
    title: string;
    titleOriginal: string | null;
    titleAlt: string | null;
    posterUrl: string | null;
    episodes: string | number | null;
    year: string | number | null;
    rating: number | null;
    ratingCount: number | null;
    country: string | null;
    genres: string[];
    description: string | null;
    status: string | null;
    studio: string | null;
    source: string | null;
    author: string | null;
    director: string | null;
    duration: number | null;
    category: string | null;
    favoritesCount: number | null;
    season: number | null;
    airedOnDate: number | null;
    isFavorite: boolean;
    listStatus: 'watching' | 'planned' | 'completed' | 'on_hold' | 'dropped' | null;
  };

  const API_ENDPOINT = "release.filter(0, { sort: 0, country: 'Япония' }, true)";
  const API_FILTER = getHomeTabFilterArgs('anime');

  let cardsLoadState = $state<'idle' | 'loading' | 'ready' | 'error'>('idle');
  let cardsError = $state('');
  let cardsApiRaw = $state<unknown>(null);
  let animeCards = $state<AnimeCardDemo[]>([]);

  const cardsApiJson = $derived(
    cardsApiRaw == null ? '' : JSON.stringify(cardsApiRaw, null, 2),
  );

  const cardsPending = $derived(
    cardsLoadState === 'loading' || (cardsLoadState === 'idle' && animeCards.length === 0),
  );

  const discussDemoItems = $derived.by((): UiV2DiscussItem[] =>
    animeCards.slice(0, 5).map((card, i) => ({
      id: card.id,
      title: card.title,
      titleOriginal: card.titleOriginal,
      posterUrl: card.posterUrl,
      episodes: card.episodes,
      year: card.year,
      country: card.country,
      rating: card.rating,
      ratingCount: card.ratingCount,
      description: card.description,
      commentCount: [91, 59, 43, 38, 37][i] ?? 12 + i * 3,
    })),
  );

  const collectionDemoItems = $derived.by((): UiV2CollectionCardData[] => {
    const posters = animeCards.map((c) => c.posterUrl).filter(Boolean) as string[];
    const fallback =
      posters[0] ??
      'https://s.anixmirai.com/posters/VPHehhgSpJ9VRap8e2VpahnZPYyaof.jpg';
    return [
      {
        id: 'c1',
        title: 'Лучшее за сезон',
        image: posters[0] ?? fallback,
        description: 'Подборка тайтлов, которые стоит досмотреть до конца сезона.',
        releaseCount: 18,
        notesCount: 24,
        favoritesCount: 3120,
        isFavorite: true,
      },
      {
        id: 'c2',
        title: 'Для вечера',
        image: posters[1] ?? fallback,
        description: 'Лёгкие и атмосферные релизы, когда не хочется напрягаться.',
        releaseCount: 12,
        notesCount: 6,
        favoritesCount: 980,
      },
      {
        id: 'c3',
        title: 'Скрытые жемчужины',
        image: posters[2] ?? fallback,
        description: 'Малоизвестные, но сильные работы — для расширения кругозора.',
        releaseCount: 9,
        notesCount: 41,
        favoritesCount: 15400,
        isPrivate: true,
      },
      {
        id: 'c4',
        title: 'Классика сёнэна',
        image: posters[3] ?? fallback,
        description: null,
        releaseCount: 27,
        favoritesCount: 8200,
        isFavorite: true,
      },
    ];
  });

  const nowSec = Math.floor(Date.now() / 1000);

  let commentThread = $state<UiV2CommentNode[]>([
    {
      id: 1,
      message: 'Аниме просто огонь, атмосфера и музыка на высоте.',
      timestamp: nowSec - 46 * 60,
      voteCount: 7,
      userVote: 0,
      postedAtEpisode: 6,
      profile: { id: 11, login: 'SolarW' },
      replies: [
        {
          id: 11,
          message: 'Согласен, особенно саундтрек во 2 серии.',
          timestamp: nowSec - 40 * 60,
          voteCount: 2,
          profile: { id: 12, login: 'Naalvagar' },
          isEdited: true,
          replies: [
            {
              id: 111,
              message: 'А концовка 3 серии — это вообще другое измерение.',
              timestamp: nowSec - 35 * 60,
              voteCount: 1,
              profile: { id: 13, login: 'kino_owl' },
              replies: [
                {
                  id: 1111,
                  message: 'Только без спойлеров в треде, пожалуйста 🙏',
                  timestamp: nowSec - 30 * 60,
                  voteCount: 4,
                  profile: { id: 14, login: 'quiet_room' },
                },
              ],
            },
          ],
        },
        {
          id: 12,
          message: 'Жду следующий сезон уже сейчас.',
          timestamp: nowSec - 28 * 60,
          voteCount: 0,
          profile: { id: 15, login: 'momo' },
        },
      ],
    },
    {
      id: 2,
      message: 'В финале раскрыли личность антагониста и переписали весь лор сериала.',
      timestamp: nowSec - 2 * 3600,
      voteCount: 3,
      isSpoiler: true,
      postedAtEpisode: 12,
      profile: { id: 21, login: 'spoiler_fox' },
      replies: [
        {
          id: 21,
          message: 'Спасибо за плашку, чуть не открыл без сезона.',
          timestamp: nowSec - 90 * 60,
          voteCount: 5,
          profile: { id: 22, login: 'careful' },
        },
      ],
    },
    {
      id: 3,
      message: 'Первые серии тяжеловаты, но после 4-й всё встаёт на места.',
      timestamp: nowSec - 5 * 3600,
      voteCount: -1,
      userVote: 1,
      profile: { id: 31, login: 'slowburn' },
    },
  ]);

  const commentWeekFallback: UiV2CommentNode[] = [
    {
      id: 'w1',
      message: 'Гигантская леди оказалась намного глубже, чем казалось по трейлеру.',
      timestamp: nowSec - 3 * 86400,
      voteCount: 382,
      profile: { id: 41, login: 'Rina' },
      releaseId: 64,
      releaseTitle: 'Гигантская леди',
      releaseHint: 'к релизу',
    },
    {
      id: 'w2',
      message: 'Описание: мир после катастрофы, где люди учатся жить заново — и это ощущается в каждом кадре.',
      timestamp: nowSec - 4 * 86400,
      voteCount: 211,
      profile: { id: 42, login: 'Archivist' },
      releaseId: 120,
      releaseTitle: 'Пепел неба',
      releaseHint: 'к релизу',
    },
    {
      id: 'w3',
      message: 'Финал переворачивает всё с ног на голову.',
      timestamp: nowSec - 5 * 86400,
      voteCount: 156,
      isSpoiler: true,
      profile: { id: 43, login: 'NightReader' },
      releaseId: 88,
      releaseTitle: 'Красная река',
      releaseHint: 'к релизу',
    },
  ];

  let commentWeek = $state<UiV2CommentNode[]>(commentWeekFallback);

  const COMMENTS_RELEASE_ID_DEFAULT = 64;
  let commentsReleaseId = $state(COMMENTS_RELEASE_ID_DEFAULT);
  let commentsReleaseIdDraft = $state(String(COMMENTS_RELEASE_ID_DEFAULT));
  let commentsPage = $state(0);
  let commentsSort = $state(3); // популярные
  let commentsLoadState = $state<'idle' | 'loading' | 'ready' | 'error'>('idle');
  let commentsError = $state('');
  let commentsApiRaw = $state<unknown>(null);
  let commentsLastPage = $state(false);
  let commentsReleaseNodes = $state<UiV2CommentNode[]>([]);

  const commentsApiJson = $derived(
    commentsApiRaw == null ? '' : JSON.stringify(commentsApiRaw, null, 2),
  );

  const commentsPending = $derived(commentsLoadState === 'loading');

  function commentDataToNode(c: CommentData, releaseMeta?: { id: number; title?: string }): UiV2CommentNode {
    return {
      id: c.id,
      message: c.message,
      timestamp: c.timestamp,
      voteCount: c.voteCount,
      userVote: c.userVote,
      isSpoiler: c.isSpoiler,
      isEdited: c.isEdited,
      isDeleted: c.isDeleted,
      postedAtEpisode: c.postedAtEpisode,
      replyCount: c.replyCount,
      profile: {
        id: c.profile.id,
        login: c.profile.login,
        avatar: c.profile.avatar,
        badgeUrl: c.profile.badgeUrl,
        badgeName: c.profile.badgeName,
      },
      releaseId: releaseMeta?.id,
      releaseTitle: releaseMeta?.title,
      releaseHint: releaseMeta?.title ? 'к релизу' : null,
    };
  }

  function patchCommentReplies(
    nodes: UiV2CommentNode[],
    parentId: number | string,
    replies: UiV2CommentNode[],
  ): UiV2CommentNode[] {
    return nodes.map((node) => {
      if (node.id === parentId) {
        return {
          ...node,
          replies,
          replyCount: Math.max(node.replyCount ?? 0, replies.length),
        };
      }
      if (node.replies?.length) {
        return { ...node, replies: patchCommentReplies(node.replies, parentId, replies) };
      }
      return node;
    });
  }

  async function loadCommentReplies(node: UiV2CommentNode) {
    const commentId = typeof node.id === 'number' ? node.id : Number(node.id);
    if (!Number.isFinite(commentId) || commentId <= 0) return;
    if (!window.anixApi?.comments?.release?.replies) {
      showToast('API ответов недоступно', 'err');
      return;
    }
    try {
      const data = await window.anixApi.comments.release.replies(commentId, 0, 2);
      const list = normalizeCommentsFromResponse(data as Record<string, unknown>);
      const replies = list.map((c) => commentDataToNode(c));
      commentsReleaseNodes = patchCommentReplies(commentsReleaseNodes, node.id, replies);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Не удалось загрузить ответы', 'err');
    }
  }

  async function loadReleaseComments(opts?: { page?: number; releaseId?: number; force?: boolean }) {
    const releaseId = opts?.releaseId ?? commentsReleaseId;
    const page = opts?.page ?? commentsPage;
    if (!window.anixApi?.comments?.release?.list) {
      commentsLoadState = 'error';
      commentsError = 'API недоступно (нужен Electron / anixApi)';
      return;
    }
    commentsLoadState = 'loading';
    commentsError = '';
    try {
      const data = await window.anixApi.comments.release.list(releaseId, page, commentsSort);
      commentsApiRaw = data;
      commentsReleaseId = releaseId;
      commentsPage = page;
      commentsLastPage = !!(data as { last?: boolean })?.last;
      const list = normalizeCommentsFromResponse(data as Record<string, unknown>);
      commentsReleaseNodes = list.map((c) => commentDataToNode(c));
      commentsLoadState = 'ready';
    } catch (e) {
      commentsLoadState = 'error';
      commentsError = e instanceof Error ? e.message : String(e);
    }
  }

  async function loadCommentsWeek() {
    if (!window.anixApi?.discover?.commentsWeek) return;
    try {
      const data = await window.anixApi.discover.commentsWeek();
      const content = Array.isArray(data?.content) ? data.content : [];
      const mapped = content
        .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
        .map((raw) => {
          const item = mapOverviewCommentWeek(raw, data);
          if (!item) return null;
          const profileRaw =
            resolveJacksonEntity(raw.profile, data) ??
            (raw.profile && typeof raw.profile === 'object' && !Array.isArray(raw.profile)
              ? (raw.profile as Record<string, unknown>)
              : undefined);
          const profile = normalizeCommentProfile(profileRaw, data);
          return {
            id: item.id,
            message: item.message,
            timestamp: item.timestamp,
            voteCount: item.voteCount,
            isSpoiler: item.isSpoiler,
            profile: {
              id: profile.id || 0,
              login: profile.login || item.profileLogin,
              avatar: profile.avatar || item.profileAvatar,
              badgeUrl: profile.badgeUrl,
              badgeName: profile.badgeName,
            },
            releaseId: item.releaseId,
            releaseTitle: item.releaseTitle,
            releaseHint: 'к релизу',
          } satisfies UiV2CommentNode;
        })
        .filter((x): x is UiV2CommentNode => !!x);
      if (mapped.length) commentWeek = mapped;
    } catch {
      /* keep fallback */
    }
  }

  function applyCommentsReleaseId() {
    const n = Number.parseInt(commentsReleaseIdDraft.trim(), 10);
    if (!Number.isFinite(n) || n <= 0) {
      showToast('Укажи корректный id релиза', 'err');
      return;
    }
    commentsPage = 0;
    void loadReleaseComments({ releaseId: n, page: 0, force: true });
  }

  function openCommentProfile(node: UiV2CommentNode, e?: MouseEvent) {
    const id = Number(node.profile.id);
    if (id > 0) {
      handleUserProfileClick(id, e);
      return;
    }
    showToast(`Профиль: ${node.profile.login}`);
  }

  function openCommentRelease(node: UiV2CommentNode) {
    if (node.releaseId) {
      navigate(`/release/${node.releaseId}`);
      return;
    }
    showToast(node.releaseTitle ? `Релиз: ${node.releaseTitle}` : 'Релиз не указан');
  }

  function patchCommentVote(nodes: UiV2CommentNode[], updated: UiV2CommentNode): UiV2CommentNode[] {
    return nodes.map((node) => {
      if (node.id === updated.id) {
        return { ...node, voteCount: updated.voteCount, userVote: updated.userVote };
      }
      if (node.replies?.length) {
        return { ...node, replies: patchCommentVote(node.replies, updated) };
      }
      return node;
    });
  }

  function appendLocalReply(
    nodes: UiV2CommentNode[],
    parentId: number | string,
    reply: UiV2CommentNode,
  ): UiV2CommentNode[] {
    return nodes.map((node) => {
      if (node.id === parentId) {
        const existing = node.replies ?? [];
        // Не дублируем, если уже есть; новый всегда в конец
        const replies = [...existing.filter((r) => r.id !== reply.id), reply];
        return {
          ...node,
          replies,
          replyCount: Math.max(node.replyCount ?? 0, existing.length) + 1,
        };
      }
      if (node.replies?.length) {
        return { ...node, replies: appendLocalReply(node.replies, parentId, reply) };
      }
      return node;
    });
  }

  function demoAuthorProfile(): UiV2CommentNode['profile'] {
    const self = (window as unknown as {
      __anixProfile?: { id?: number; login?: string; avatar?: string | null };
    }).__anixProfile;
    if (self?.login) {
      return {
        id: self.id && self.id > 0 ? self.id : -1,
        login: self.login,
        avatar: self.avatar ? resolveCdnAssetUrl(self.avatar) : null,
      };
    }
    return { id: -1, login: 'Вы' };
  }

  /** Локальный превью-ответ в UI Kit (на сервер не уходит). */
  function makeLocalReply(payload: UiV2CommentComposerPayload): UiV2CommentNode {
    return {
      id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      message: payload.message,
      timestamp: Math.floor(Date.now() / 1000),
      voteCount: 0,
      userVote: 0,
      isSpoiler: payload.isSpoiler,
      profile: demoAuthorProfile(),
      replyCount: 0,
      replies: [],
    };
  }

  function previewSubmitReply(
    setNodes: (fn: (prev: UiV2CommentNode[]) => UiV2CommentNode[]) => void,
    parent: UiV2CommentNode,
    payload: UiV2CommentComposerPayload,
  ) {
    const reply = makeLocalReply(payload);
    setNodes((prev) => appendLocalReply(prev, parent.id, reply));
    showToast(payload.isSpoiler ? 'Демо: спойлер-ответ добавлен локально' : 'Демо: ответ добавлен локально');
  }

  $effect(() => {
    if (active !== 'comments') return;
    if (commentsLoadState === 'idle') void loadReleaseComments({ page: 0 });
    void loadCommentsWeek();
  });

  function resolvePoster(raw: Record<string, unknown>): string | null {
    const p = raw.poster as Record<string, { url?: string }> | string | undefined;
    let posterRaw: string | undefined;
    if (p && typeof p === 'object') {
      posterRaw = p.original?.url ?? p.medium?.url ?? p.small?.url;
    } else if (typeof p === 'string') {
      posterRaw = p;
    } else if (typeof raw.image === 'string') {
      posterRaw = raw.image;
    }
    if (!posterRaw) return null;
    const built = buildPosterUrl(posterRaw);
    return built ? toCdnProxyUrl(built) : null;
  }

  function parseGenres(raw: unknown): string[] {
    if (Array.isArray(raw)) {
      return raw
        .map((g) => (typeof g === 'string' ? g : (g as { name?: string })?.name))
        .filter((g): g is string => !!g && typeof g === 'string');
    }
    if (typeof raw === 'string' && raw.trim()) {
      return raw.split(/,\s*/).map((g) => g.trim()).filter(Boolean);
    }
    return [];
  }

  function namedField(raw: unknown): string | null {
    if (typeof raw === 'string' && raw.trim()) return raw.trim();
    if (raw && typeof raw === 'object' && typeof (raw as { name?: unknown }).name === 'string') {
      const name = (raw as { name: string }).name.trim();
      return name || null;
    }
    return null;
  }

  function formatEpisodes(released: unknown, total: unknown): string | number | null {
    const r = typeof released === 'number' ? released : null;
    const t = typeof total === 'number' ? total : null;
    if (r != null && t != null) return `${r} / ${t} эп.`;
    if (r != null) return `${r} эп.`;
    if (t != null) return `${t} эп.`;
    return null;
  }

  function mapReleaseToAnimeCard(raw: Record<string, unknown>): AnimeCardDemo {
    const title = String(
      raw.title_ru ?? raw.titleRu ?? raw.title_original ?? raw.title ?? `Release ${raw.id ?? ''}`,
    );
    const titleOriginalRaw =
      (typeof raw.title_original === 'string' && raw.title_original.trim()
        ? raw.title_original.trim()
        : null) ||
      (typeof raw.titleEn === 'string' && raw.titleEn.trim() ? raw.titleEn.trim() : null);
    const titleAltRaw = (() => {
      const alt = raw.title_alt ?? raw.titleAlt;
      if (typeof alt === 'string' && alt.trim()) return alt.trim();
      if (Array.isArray(alt)) {
        const parts = alt
          .map((v) => (typeof v === 'string' ? v.trim() : ''))
          .filter(Boolean);
        return parts.length ? parts.join(' / ') : null;
      }
      return null;
    })();
    return {
      id: (raw.id as number | string) ?? title,
      title,
      titleOriginal: titleOriginalRaw && titleOriginalRaw !== title ? titleOriginalRaw : null,
      titleAlt: titleAltRaw,
      posterUrl: resolvePoster(raw),
      episodes: formatEpisodes(raw.episodes_released, raw.episodes_total),
      year: (raw.year as string | number | null | undefined) ?? null,
      rating: typeof raw.grade === 'number' ? raw.grade : null,
      ratingCount: typeof raw.vote_count === 'number' ? raw.vote_count : null,
      country: typeof raw.country === 'string' ? raw.country : null,
      genres: parseGenres(raw.genres),
      description: typeof raw.description === 'string' ? raw.description : null,
      status: namedField(raw.status),
      studio: typeof raw.studio === 'string' && raw.studio.trim() ? raw.studio.trim() : null,
      source: typeof raw.source === 'string' && raw.source.trim() ? raw.source.trim() : null,
      author: typeof raw.author === 'string' && raw.author.trim() ? raw.author.trim() : null,
      director: typeof raw.director === 'string' && raw.director.trim() ? raw.director.trim() : null,
      duration: typeof raw.duration === 'number' ? raw.duration : null,
      category: namedField(raw.category),
      favoritesCount: typeof raw.favorites_count === 'number' ? raw.favorites_count : null,
      season: typeof raw.season === 'number' ? raw.season : null,
      airedOnDate: typeof raw.aired_on_date === 'number' ? raw.aired_on_date : null,
      isFavorite: !!(raw.is_favorite),
      listStatus: (() => {
        const code = typeof raw.profile_list_status === 'number' ? raw.profile_list_status : null;
        switch (code) {
          case 1: return 'watching' as const;
          case 2: return 'planned' as const;
          case 3: return 'completed' as const;
          case 4: return 'on_hold' as const;
          case 5: return 'dropped' as const;
          default: return null;
        }
      })(),
    };
  }

  async function loadAnimeCards(force = false) {
    if (!force && (cardsLoadState === 'loading' || cardsLoadState === 'ready')) return;
    if (!window.anixApi?.release?.filter) {
      cardsError = 'API недоступно (нужен Electron / anixApi)';
      cardsLoadState = 'error';
      return;
    }
    cardsLoadState = 'loading';
    cardsError = '';
    try {
      const data = await window.anixApi.release.filter(0, API_FILTER, true);
      cardsApiRaw = data;
      const content = Array.isArray((data as { content?: unknown[] })?.content)
        ? ((data as { content: Record<string, unknown>[] }).content)
        : [];
      animeCards = content.map(mapReleaseToAnimeCard);
      cardsLoadState = 'ready';
    } catch (err) {
      cardsError = String(err);
      cardsLoadState = 'error';
    }
  }

  $effect(() => {
    if (active === 'cards') void loadAnimeCards();
  });
</script>

<div class="view view-uikit-v2" class:view-uikit-v2--wide={active === 'cards' || active === 'comments'}>
  <header class="uikit-v2-header">
    <div class="uikit-v2-header__top">
      <button type="button" class="uikit-v2-back" onclick={() => navigate('/')}>
        ← Назад
      </button>
      <span class="uikit-v2-badge">Developer</span>
    </div>
    <h1 class="uikit-v2-title">UI Kit V2</h1>
    <p class="uikit-v2-desc">
      Новая дизайн-система AnixApp. Здесь собираем компоненты с нуля — без наследия старого UI Kit.
    </p>
  </header>

  <nav class="uikit-v2-nav" aria-label="Разделы UI Kit V2">
    {#each sections as s}
      <button
        type="button"
        class="uikit-v2-nav__item"
        class:uikit-v2-nav__item--active={active === s.id}
        onclick={() => (active = s.id)}
      >
        {s.title}
      </button>
    {/each}
  </nav>

  {#each sections as s}
    {#if active === s.id}
      <section class="uikit-v2-section" aria-labelledby="uikit-v2-{s.id}">
        <h2 id="uikit-v2-{s.id}" class="uikit-v2-section__title">{s.title}</h2>
        <p class="uikit-v2-section__desc">{s.desc}</p>

        {#if s.id === 'tokens'}
          <div class="uikit-v2-swatches">
            <div class="uikit-v2-swatch" style="background: var(--uikit-v2-bg)">
              <span>bg</span>
            </div>
            <div class="uikit-v2-swatch" style="background: var(--uikit-v2-surface)">
              <span>surface</span>
            </div>
            <div class="uikit-v2-swatch" style="background: var(--uikit-v2-elevated)">
              <span>elevated</span>
            </div>
            <div class="uikit-v2-swatch" style="background: var(--uikit-v2-border)">
              <span>border</span>
            </div>
            <div class="uikit-v2-swatch uikit-v2-swatch--ink" style="background: var(--uikit-v2-text)">
              <span>text</span>
            </div>
            <div class="uikit-v2-swatch uikit-v2-swatch--ink" style="background: var(--uikit-v2-muted)">
              <span>muted</span>
            </div>
            <div class="uikit-v2-swatch" style="background: var(--uikit-v2-accent)">
              <span>accent</span>
            </div>
            <div class="uikit-v2-swatch" style="background: var(--uikit-v2-danger)">
              <span>danger</span>
            </div>
          </div>
        {:else if s.id === 'type'}
          <div class="uikit-v2-type">
            <p class="uikit-v2-type__display">Display</p>
            <p class="uikit-v2-type__h1">Заголовок H1</p>
            <p class="uikit-v2-type__h2">Заголовок H2</p>
            <p class="uikit-v2-type__body">Основной текст — читаемый абзац для интерфейса.</p>
            <p class="uikit-v2-type__caption">Подпись / метаданные</p>
            <p class="uikit-v2-type__mono">mono / code 0123456789</p>
          </div>
        {:else if s.id === 'controls'}
          <div class="uikit-v2-demo-block">
            <h3 class="uikit-v2-demo-block__title">Back Bar</h3>
            <p class="uikit-v2-demo-block__desc">
              Назад + где сейчас и наследование (как в «Друзья» панели профиля).
            </p>
            <UiV2BackBar
              segments={[
                { label: 'Друзья', active: true },
                { label: 'Maks1mio' },
              ]}
              onBack={() => {}}
            />
          </div>

          <div class="uikit-v2-demo-block">
            <h3 class="uikit-v2-demo-block__title">Pill Bar</h3>
            <p class="uikit-v2-demo-block__desc">
              История как в панели профиля: крошки, активная пилюля, стрелки появляются на hover.
            </p>
            <UiV2PillBar
              items={pillItems}
              activeIndex={pillIndex}
              onBack={() => { pillIndex = Math.max(0, pillIndex - 1); }}
              onForward={() => { pillIndex = Math.min(pillItems.length - 1, pillIndex + 1); }}
              onSelect={(i) => { pillIndex = i; }}
            />

            <p class="uikit-v2-demo-block__desc" style="margin-top:0.75rem;margin-bottom:0">
              Активно: <strong>{pillItems[pillIndex].label}</strong>
              ({pillIndex + 1}/{pillItems.length})
            </p>
          </div>

          <div class="uikit-v2-demo-block">
            <h3 class="uikit-v2-demo-block__title">Tabs</h3>
            <p class="uikit-v2-demo-block__desc">
              Горизонтальные вкладки с прокруткой, разделителем групп и боковыми кнопками — как в закладках и на главной.
            </p>
            <div class="uikit-v2-tabs-demo">
              <UiV2Tabs
                tabs={tabsBookmarksDemo}
                activeId={tabsBookmarksDemoId}
                onChange={(id) => { tabsBookmarksDemoId = id; }}
              />
            </div>
            <div class="uikit-v2-tabs-demo uikit-v2-tabs-demo--home">
              <UiV2Tabs
                tabs={tabsHomeDemo}
                activeId={tabsHomeDemoId}
                onChange={(id) => { tabsHomeDemoId = id; }}
              >
                {#snippet leftActions()}
                  <button type="button" class="uiv2-tabs__tool-btn" aria-label="Настройки вкладок">
                    {@html iconSlidersHorizontal(18)}
                  </button>
                {/snippet}
                {#snippet rightActions()}
                  <button type="button" class="uiv2-tabs__tool-btn" aria-label="Случайный релиз">
                    {@html iconShuffle(18)}
                  </button>
                {/snippet}
              </UiV2Tabs>
            </div>
          </div>

          <div class="uikit-v2-demo-block">
            <h3 class="uikit-v2-demo-block__title">Scroll Area</h3>
            <p class="uikit-v2-demo-block__desc">
              Кастомный скролл V2: нативный scrollbar скрыт, ползунок появляется у края при наведении или прокрутке колёсиком.
            </p>
            <UiV2ScrollArea class="uikit-v2-scroll-demo" padding="0.65rem 0.85rem">
              {#each Array.from({ length: 24 }) as _, i (i)}
                <p class="uikit-v2-scroll-demo__line">
                  Строка {i + 1} — пример длинного списка внутри UiV2ScrollArea.
                </p>
              {/each}
            </UiV2ScrollArea>
          </div>

          <div class="uikit-v2-demo-block">
            <h3 class="uikit-v2-demo-block__title">Round Button</h3>
            <p class="uikit-v2-demo-block__desc">
              Круглые кнопки с inset-тенью
              <code>box-shadow: 0 1px 0 rgba(255, 255, 255, 0.05) inset</code>.
            </p>
            <div class="uikit-v2-round-row">
              <UiV2RoundButton size="sm" label="Назад">
                {@html iconChevronLeft(16)}
              </UiV2RoundButton>
              <UiV2RoundButton label="Вперёд">
                {@html iconChevronRight(18)}
              </UiV2RoundButton>
              <UiV2RoundButton size="lg" label="Закрыть">
                {@html iconX(20)}
              </UiV2RoundButton>
              <UiV2RoundButton label="Добавить">
                {@html iconPlus(18)}
              </UiV2RoundButton>
              <UiV2RoundButton label="Недоступно" disabled>
                {@html iconChevronRight(18)}
              </UiV2RoundButton>
            </div>
          </div>

          <div class="uikit-v2-demo-block">
            <h3 class="uikit-v2-demo-block__title">Button</h3>
            <p class="uikit-v2-demo-block__desc">
              Длинные pill-кнопки в стиле Round Button: текст или иконка + текст.
            </p>
            <div class="uikit-v2-controls">
              <UiV2Button label="Chrome" />
              <UiV2Button label="Primary" variant="primary" />
              <UiV2Button label="Ghost" variant="ghost" />
              <UiV2Button label="Danger" variant="danger" />
              <UiV2Button label="Disabled" disabled />
            </div>
            <div class="uikit-v2-controls" style="margin-bottom:0">
              <UiV2Button label="Назад" size="sm">
                {#snippet icon()}
                  {@html iconChevronLeft(16)}
                {/snippet}
              </UiV2Button>
              <UiV2Button label="Добавить">
                {#snippet icon()}
                  {@html iconPlus(16)}
                {/snippet}
              </UiV2Button>
              <UiV2Button label="Вперёд" variant="primary">
                {#snippet icon()}
                  {@html iconChevronRight(16)}
                {/snippet}
              </UiV2Button>
              <UiV2Button label="Удалить" variant="danger" size="lg">
                {#snippet icon()}
                  {@html iconX(16)}
                {/snippet}
              </UiV2Button>
            </div>

          </div>

          <div class="uikit-v2-demo-block">
            <h3 class="uikit-v2-demo-block__title">Outlined Field</h3>
            <p class="uikit-v2-demo-block__desc">
              Outlined-поле с плавающим лейблом, паролем, multiline и подсказкой.
            </p>
            <div class="uikit-v2-outlined-demo">
              <UiV2OutlinedField label="Почта или никнейм" bind:value={demoLogin} />
              <UiV2OutlinedField
                label="Пароль"
                type="password"
                bind:value={demoPassword}
                revealable
              />
              <UiV2OutlinedField label="Отключено" value="demo" disabled />
              <UiV2OutlinedField
                label="Новый никнейм"
                bind:value={demoNickname}
                hint="Никнейм можно менять раз в 30 дней · от 3 до 20 символов"
              />
              <UiV2OutlinedField
                label="Статус"
                bind:value={demoStatus}
                multiline
                rows={4}
                maxlength={150}
              />
            </div>
          </div>

          <div class="uikit-v2-demo-block">
            <h3 class="uikit-v2-demo-block__title">Tooltip</h3>
            <p class="uikit-v2-demo-block__desc">
              Простой текст, заголовок с ping, строки «ключ — значение» или свой snippet через <code>content</code>.
            </p>
            <div class="uikit-v2-tooltip-demo">
              <UiV2Tooltip text="Обычный анимированный тултип">
                <button type="button" class="uikit-v2-tooltip-demo__link">Простой</button>
              </UiV2Tooltip>
              <UiV2Tooltip
                title="api-s.anixsekai.com"
                status="good"
                meta="24 ms"
                description="Основной эндпоинт с низкой задержкой"
              >
                <button type="button" class="uikit-v2-tooltip-demo__link">Ping + описание</button>
              </UiV2Tooltip>
              <UiV2Tooltip
                title="Jigoku Shoujo"
                lines={[
                  { label: 'Оригинал', value: 'Jigoku Shoujo' },
                  { label: 'Альт', value: '地獄少女' },
                ]}
              >
                <button type="button" class="uikit-v2-tooltip-demo__link">Несколько строк</button>
              </UiV2Tooltip>
              <UiV2Tooltip text="Подсказка для кнопки">
                <UiV2Button label="Кнопка с тултипом" />
              </UiV2Tooltip>
            </div>
          </div>

          <div class="uikit-v2-demo-block">
            <h3 class="uikit-v2-demo-block__title">Select</h3>
            <p class="uikit-v2-demo-block__desc">
              Outlined-триггер, выпадающий список с ping, hint, desc и галочкой у выбранного пункта.
            </p>
            <div class="uikit-v2-select-demo">
              <UiV2Select
                options={selectDemoOptions}
                bind:value={selectDemoValue}
                placeholder="Выберите эндпоинт"
                onChange={(v) => showToast(`Выбрано: ${v}`)}
              />
            </div>
            <p class="uikit-v2-demo-block__desc" style="margin-top:0.75rem;margin-bottom:0">
              Текущее значение: <strong>{selectDemoValue}</strong>
            </p>
          </div>

          <div class="uikit-v2-demo-block">
            <h3 class="uikit-v2-demo-block__title">Select — сервер (live)</h3>
            <p class="uikit-v2-demo-block__desc">
              Реальный выбор API-эндпоинта: параллельный ping всех серверов, статус по задержке, смена base URL.
            </p>
            <div class="uikit-v2-select-demo">
              <UiV2EndpointSelect
                pingIntervalMs={1000}
                onChange={(v) => showToast(`Эндпоинт: ${v.replace(/^https:\/\//, '')}`)}
              />
            </div>
          </div>
        {:else if s.id === 'surfaces'}
          <div class="uikit-v2-demo-block">
            <h3 class="uikit-v2-demo-block__title">Choice Sheet</h3>
            <p class="uikit-v2-demo-block__desc">
              Модалка выбора одной опции (радио) — как приватность в редактировании профиля.
            </p>
            <UiV2Button
              label="Открыть Choice Sheet"
              onclick={() => { choiceOpen = true; }}
            />
            <p class="uikit-v2-demo-block__desc" style="margin-top:0.75rem;margin-bottom:0">
              Выбрано: <strong>{choiceOptions.find((o) => o.value === choiceValue)?.label}</strong>
            </p>
          </div>

          <div class="uikit-v2-demo-block">
            <h3 class="uikit-v2-demo-block__title">Card</h3>
            <p class="uikit-v2-demo-block__desc">
              Контент-панели профиля: заголовок, опциональная пилюля, тело.
            </p>
            <div class="uikit-v2-card-stack">
              <UiV2Card title="Статистика">
                <p class="uikit-v2-card-demo-body">
                  Оценки, списки, жанры и время просмотра — контент секции внутри карточки.
                </p>
              </UiV2Card>
              <UiV2Card
                title="Динамика просмотра"
                pill="65 всего · 12 пик · 15.07 · 10 дн."
              >
                <p class="uikit-v2-card-demo-body">
                  График активности за период. Пилюля в шапке — краткая сводка.
                </p>
              </UiV2Card>
              <UiV2Card title="Просмотрено недавно">
                <p class="uikit-v2-card-demo-body">
                  Список недавних релизов с постером, названием и метаданными.
                </p>
              </UiV2Card>
            </div>
          </div>
        {:else if s.id === 'cards'}
          <div class="uikit-v2-demo-block">
            <h3 class="uikit-v2-demo-block__title">API ответ</h3>
            <p class="uikit-v2-demo-block__desc">
              Как вкладка «Аниме» на главной: <code>{API_ENDPOINT}</code>.
              Полный JSON ответа ниже — карточки берут поля из <code>content[]</code>.
            </p>
            <div class="uikit-v2-api-toolbar">
              <UiV2Button
                label={cardsLoadState === 'loading' ? 'Загрузка…' : 'Обновить'}
                size="sm"
                disabled={cardsLoadState === 'loading'}
                onclick={() => void loadAnimeCards(true)}
              />
              <span class="uikit-v2-api-toolbar__meta">
                {#if cardsLoadState === 'ready'}
                  {animeCards.length} релизов
                {:else if cardsLoadState === 'loading'}
                  Загрузка…
                {:else if cardsLoadState === 'error'}
                  Ошибка
                {:else}
                  —
                {/if}
              </span>
            </div>
            {#if cardsLoadState === 'error'}
              <p class="uikit-v2-demo-block__desc uikit-v2-api-error">{cardsError}</p>
            {:else if cardsApiJson}
              <pre class="uikit-v2-api-json" tabindex="0">{cardsApiJson}</pre>
            {:else if cardsPending}
              <UiV2ApiPanelSkeleton />
            {/if}
          </div>

          <div class="uikit-v2-demo-block">
            <h3 class="uikit-v2-demo-block__title">Vertical</h3>
            <p class="uikit-v2-demo-block__desc">
              Сетка каталога: постер, «⋯» при hover / ПКМ, золотой рейтинг.
            </p>
            {#if cardsPending}
              <div class="uikit-v2-anime-grid">
                {#each Array.from({ length: 10 }) as _, i (i)}
                  <UiV2AnimeCardSkeleton variant="vertical" />
                {/each}
              </div>
            {:else if animeCards.length === 0 && cardsLoadState === 'ready'}
              <p class="uikit-v2-demo-block__desc">В ответе нет релизов.</p>
            {:else}
              <div class="uikit-v2-anime-grid">
                {#each animeCards.slice(0, 10) as card (card.id)}
                  <UiV2AnimeCard
                    variant="vertical"
                    title={card.title}
                    titleOriginal={card.titleOriginal}
                    titleAlt={card.titleAlt}
                    posterUrl={card.posterUrl}
                    episodes={card.episodes}
                    year={card.year}
                    rating={card.rating}
                    status={card.status}
                    season={card.season}
                    airedOnDate={card.airedOnDate}
                    isFavorite={card.isFavorite}
                    listStatus={card.listStatus}
                    onclick={() => showToast(`Открыть: ${card.title}`)}
                    onMenuSelect={(id) => showToast(`Меню «${id}»: ${card.title}`)}
                  />
                {/each}
              </div>
            {/if}
          </div>

          <div class="uikit-v2-demo-block">
            <h3 class="uikit-v2-demo-block__title">Horizontal</h3>
            <p class="uikit-v2-demo-block__desc">
              Список: мета как ссылки, жанры с иконкой и подчёркиванием.
            </p>
            {#if cardsPending}
              <div class="uikit-v2-anime-list">
                {#each Array.from({ length: 5 }) as _, i (i)}
                  <UiV2AnimeCardSkeleton variant="horizontal" />
                {/each}
              </div>
            {:else}
            <div class="uikit-v2-anime-list">
              {#each animeCards.slice(0, 5) as card (card.id)}
                <UiV2AnimeCard
                  variant="horizontal"
                  title={card.title}
                  titleOriginal={card.titleOriginal}
                  titleAlt={card.titleAlt}
                  posterUrl={card.posterUrl}
                  episodes={card.episodes}
                  year={card.year}
                  rating={card.rating}
                  ratingCount={card.ratingCount}
                  country={card.country}
                  genres={card.genres}
                  description={card.description}
                  status={card.status}
                  studio={card.studio}
                  source={card.source}
                  author={card.author}
                  director={card.director}
                  duration={card.duration}
                  category={card.category}
                  favoritesCount={card.favoritesCount}
                  season={card.season}
                  airedOnDate={card.airedOnDate}
                  isFavorite={card.isFavorite}
                  listStatus={card.listStatus}
                  onclick={() => showToast(`Открыть: ${card.title}`)}
                  onMenuSelect={(id) => showToast(`Меню «${id}»: ${card.title}`)}
                  onGenreClick={(genre) => showToast(`Жанр: ${genre}`)}
                  onMetaClick={(kind, value) => showToast(`${kind}: ${value}`)}
                />
              {/each}
            </div>
            {/if}
          </div>

          <div class="uikit-v2-demo-block">
            <UiV2SectionHeader
              title="Рекомендации"
              subtitle="Карусель из вертикальных карточек"
              onShowAll={() => showToast('Показать всё: рекомендации')}
            />
            {#if cardsPending}
              <UiV2ReleaseCarouselSkeleton count={8} />
            {:else if animeCards.length === 0}
              <p class="uikit-v2-demo-block__desc">Нет данных для карусели.</p>
            {:else}
              <UiV2ReleaseCarousel measureKey={animeCards.length}>
                {#each animeCards.slice(0, 12) as card (card.id)}
                  <div class="uiv2-carousel__item">
                    <UiV2AnimeCard
                      variant="vertical"
                      title={card.title}
                      titleOriginal={card.titleOriginal}
                      titleAlt={card.titleAlt}
                      posterUrl={card.posterUrl}
                      episodes={card.episodes}
                      year={card.year}
                      rating={card.rating}
                      status={card.status}
                      season={card.season}
                      airedOnDate={card.airedOnDate}
                      isFavorite={card.isFavorite}
                      listStatus={card.listStatus}
                      onclick={() => showToast(`Открыть: ${card.title}`)}
                      onMenuSelect={(id) => showToast(`Меню «${id}»: ${card.title}`)}
                    />
                  </div>
                {/each}
              </UiV2ReleaseCarousel>
            {/if}
          </div>

          <div class="uikit-v2-demo-block">
            <UiV2SectionHeader
              title="Обсуждают сегодня"
              subtitle="Как Horizontal, компактнее — с описанием и отдельной строкой комментариев"
            />
            {#if cardsPending}
              <div class="uikit-v2-discuss-wrap">
                <UiV2DiscussListSkeleton count={5} />
              </div>
            {:else if discussDemoItems.length === 0}
              <p class="uikit-v2-demo-block__desc">Нет данных для списка.</p>
            {:else}
              <div class="uikit-v2-discuss-wrap">
                <UiV2DiscussList
                  items={discussDemoItems}
                  onclick={(item) => showToast(`Обсуждение: ${item.title}`)}
                  onMenuSelect={(id, item) => showToast(`Меню «${id}»: ${item.title}`)}
                />
              </div>
            {/if}
          </div>

          <div class="uikit-v2-demo-block">
            <UiV2SectionHeader
              title="Франшиза в поиске"
              subtitle="Карточка с анимацией «колоды» постеров"
            />
            <div class="uikit-v2-franchise-demo">
              <UiV2SearchFranchise
                data={franchiseDemoData}
                onclick={() => navigate('/release/20055/related')}
              />
            </div>
          </div>

          <div class="uikit-v2-demo-block">
            <UiV2SectionHeader
              title="Коллекции"
              subtitle="Обложка с названием поверх — без блока описания"
              onShowAll={() => showToast('Показать всё: коллекции')}
            />
            {#if cardsPending}
              <UiV2CollectionCardSkeleton count={4} />
            {:else}
            <div class="uikit-v2-collections-grid">
              {#each collectionDemoItems as item (item.id)}
                <UiV2CollectionCard
                  data={item}
                  variant="cover"
                  onclick={(c) => showToast(`Коллекция: ${c.title}`)}
                  onMenuSelect={(id) => showToast(`Коллекция «${id}»: ${item.title}`)}
                />
              {/each}
            </div>
            {/if}
          </div>
        {:else if s.id === 'comments'}
          <div class="uikit-v2-demo-block">
            <h3 class="uikit-v2-demo-block__title">API: комментарии релиза</h3>
            <p class="uikit-v2-demo-block__desc">
              Полный JSON <code>comments.release.list(releaseId, page, sort=3)</code>
              — популярные, по умолчанию <code>/release/{COMMENTS_RELEASE_ID_DEFAULT}</code>. Можно листать страницы.
            </p>
            <div class="uikit-v2-api-toolbar uikit-v2-comments-api-toolbar">
              <label class="uikit-v2-comments-api-id">
                <span>releaseId</span>
                <input
                  class="uikit-v2-comments-api-input"
                  type="number"
                  min="1"
                  bind:value={commentsReleaseIdDraft}
                  onkeydown={(e) => {
                    if (e.key === 'Enter') applyCommentsReleaseId();
                  }}
                />
              </label>
              <UiV2Button label="Загрузить" size="sm" onclick={applyCommentsReleaseId} />
              <UiV2Button
                label="←"
                size="sm"
                disabled={commentsLoadState === 'loading' || commentsPage <= 0}
                onclick={() => void loadReleaseComments({ page: Math.max(0, commentsPage - 1) })}
              />
              <span class="uikit-v2-api-toolbar__meta">стр. {commentsPage}</span>
              <UiV2Button
                label="→"
                size="sm"
                disabled={commentsLoadState === 'loading' || commentsLastPage}
                onclick={() => void loadReleaseComments({ page: commentsPage + 1 })}
              />
              <UiV2Button
                label={commentsLoadState === 'loading' ? 'Загрузка…' : 'Обновить'}
                size="sm"
                disabled={commentsLoadState === 'loading'}
                onclick={() => void loadReleaseComments({ force: true })}
              />
              <span class="uikit-v2-api-toolbar__meta">
                {#if commentsLoadState === 'ready'}
                  {commentsReleaseNodes.length} на странице · release {commentsReleaseId}
                {:else if commentsLoadState === 'loading'}
                  Загрузка…
                {:else if commentsLoadState === 'error'}
                  Ошибка
                {:else}
                  —
                {/if}
              </span>
            </div>
            {#if commentsLoadState === 'error'}
              <p class="uikit-v2-demo-block__desc uikit-v2-api-error">{commentsError}</p>
            {:else if commentsApiJson}
              <pre class="uikit-v2-api-json" tabindex="0">{commentsApiJson}</pre>
            {:else if commentsPending}
              <UiV2ApiPanelSkeleton />
            {/if}
          </div>

          {#if commentsPending}
            <div class="uikit-v2-demo-block">
              <UiV2SectionHeader
                title="Тред из API"
                subtitle="Популярные · «Показать ответы» подгружает replies с API"
              />
              <div class="uikit-v2-comments-wrap">
                <UiV2CommentThreadSkeleton count={4} />
              </div>
            </div>
          {:else if commentsReleaseNodes.length}
            <div class="uikit-v2-demo-block">
              <UiV2SectionHeader
                title="Тред из API"
                subtitle="Популярные · «Показать ответы» подгружает replies с API"
              />
              <div class="uikit-v2-comments-wrap">
                <UiV2CommentThread
                  nodes={commentsReleaseNodes}
                  onReply={(n) => showToast(`Ответ → ${n.profile.login}`)}
                  onSubmitReply={(n, p) => {
                    previewSubmitReply((fn) => {
                      commentsReleaseNodes = fn(commentsReleaseNodes);
                    }, n, p);
                  }}
                  onVote={(n) => {
                    commentsReleaseNodes = patchCommentVote(commentsReleaseNodes, n);
                  }}
                  onMenuSelect={(id, n) => showToast(`Меню «${id}»: ${n.profile.login}`)}
                  onAuthorClick={(n) => openCommentProfile(n)}
                  onLoadReplies={loadCommentReplies}
                />
              </div>
            </div>
          {/if}

          <div class="uikit-v2-demo-block">
            <UiV2SectionHeader
              title="Тред (демо-вложенность)"
              subtitle="Глубокие ответы, спойлеры, голоса, ⋯ и ПКМ"
            />
            <div class="uikit-v2-comments-wrap">
              <UiV2CommentThread
                nodes={commentThread}
                onReply={(n) => showToast(`Ответ → ${n.profile.login}`)}
                onSubmitReply={(n, p) => {
                  previewSubmitReply((fn) => {
                    commentThread = fn(commentThread);
                  }, n, p);
                }}
                onVote={(n) => {
                  commentThread = patchCommentVote(commentThread, n);
                }}
                onMenuSelect={(id, n) => showToast(`Меню «${id}»: ${n.profile.login}`)}
                onAuthorClick={(n) => openCommentProfile(n)}
              />
            </div>
          </div>

          <div class="uikit-v2-demo-block">
            <UiV2SectionHeader
              title="Комментарии недели"
              subtitle="Тот же комментарий: клик по тексту → релиз, аватар/ник → профиль"
            />
            <div class="uikit-v2-comments-wrap">
              <UiV2CommentThread
                nodes={commentWeek}
                onReply={(n) => showToast(`Ответ → ${n.profile.login}`)}
                onSubmitReply={(n, p) => {
                  previewSubmitReply((fn) => {
                    commentWeek = fn(commentWeek);
                  }, n, p);
                }}
                onVote={(n) => {
                  commentWeek = patchCommentVote(commentWeek, n);
                }}
                onMenuSelect={(id, n) => showToast(`Меню «${id}»: ${n.profile.login}`)}
                onAuthorClick={(n) => openCommentProfile(n)}
                onReleaseClick={openCommentRelease}
                onCommentClick={openCommentRelease}
              />
            </div>
          </div>
        {:else if s.id === 'menu'}
          <div class="uikit-v2-demo-block">
            <h3 class="uikit-v2-demo-block__title">Кнопка «⋯»</h3>
            <p class="uikit-v2-demo-block__desc">
              Наведи на «Поделиться» / «Опции» — рядом откроется такое же glass-окно.
              Тоглы, radio и копирование с <code>keepOpen</code> не закрывают меню.
            </p>
            <div class="uikit-v2-menu-demo-row">
              <UiV2RoundButton
                size="sm"
                label="Меню"
                ariaHaspopup="menu"
                ariaExpanded={popupOpen}
                onclick={openPopupFromButton}
              >
                {@html iconMoreHorizontal(16)}
              </UiV2RoundButton>
              <UiV2Button label="Открыть меню" size="sm" onclick={openPopupFromButton} />
            </div>
          </div>

          <div class="uikit-v2-demo-block">
            <h3 class="uikit-v2-demo-block__title">Правая кнопка мыши</h3>
            <p class="uikit-v2-demo-block__desc">
              Меню у курсора (<code>placement: point</code>). ПКМ по цветной области — видно glass-эффект как в референсе.
            </p>
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div
              class="uikit-v2-menu-demo-surface uikit-v2-menu-demo-surface--vivid"
              oncontextmenu={openPopupFromContext}
            >
              ПКМ здесь
            </div>
          </div>

          <div class="uikit-v2-demo-block">
            <h3 class="uikit-v2-demo-block__title">Состояние</h3>
            <p class="uikit-v2-demo-block__desc" style="margin-bottom:0">
              Действие: <strong>{popupLastAction}</strong>
              · visibility: <code>{popupVisibility}</code>
              · quality: <code>{popupQuality}</code>
              · speed: <code>{formatPlaybackRate(popupPlaybackRate)}</code>
              · notify: <code>{popupNotify ? 'on' : 'off'}</code>
              · autoplay: <code>{popupAutoplay ? 'on' : 'off'}</code>
              · pin: <code>{popupPinned ? 'on' : 'off'}</code>
              · subs: <code>{popupSubtitles ? 'on' : 'off'}</code>
            </p>
          </div>
        {/if}
      </section>
    {/if}
  {/each}
</div>

{#if choiceOpen}
  <UiV2ChoiceSheet
    title="Кто видит в профиле мои комментарии, коллекции, видео и друзей"
    options={choiceOptions}
    value={choiceValue}
    onClose={() => { choiceOpen = false; }}
    onSelect={(v) => {
      choiceValue = Number(v);
      choiceOpen = false;
    }}
  />
{/if}

<UiV2PopupMenu
  open={popupOpen}
  x={popupX}
  y={popupY}
  placement={popupPlacement}
  items={popupDemoItems}
  onClose={() => { popupOpen = false; }}
  onSelect={(id) => { void onPopupSelect(id); }}
  onCheckedChange={onPopupChecked}
  onValueChange={onPopupValueChange}
/>
