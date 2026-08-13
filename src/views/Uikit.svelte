<script lang="ts">
  import ReleaseCardUiV2 from "../components/ReleaseCardUiV2.svelte";
  import ReleaseCardsGrid from '../components/ReleaseCardsGrid.svelte';
  import CollectionCard, { type CollectionCardData } from '../components/CollectionCard.svelte';
  import Select from '../components/Select.svelte';
  import Tabs from '../components/Tabs.svelte';
  import UiV2Tooltip from '../components/uikit-v2/UiV2Tooltip.svelte';
  import UiV2PopupMenu, { type UiV2PopupMenuItem } from '../components/uikit-v2/UiV2PopupMenu.svelte';
  import UiV2CommentThread, {
    type UiV2CommentNode,
  } from '../components/uikit-v2/UiV2CommentThread.svelte';
  import { commentDataToUiV2Node } from '../utils/comment-v2';
  import type { SelectOption } from '../components/select';
  import type { CommentData } from '../types/comment';
  import { navigate } from '../stores/navigation';
  import type { ReleaseCardData } from '../types/release';
  import { iconMoreHorizontal } from '../components/icons';

  const SAMPLE_CARD: ReleaseCardData = {
    id: 2,
    titleRu: 'Адская девочка',
    titleEn: 'Jigoku Shoujo',
    description: 'Всё началось с того, как у Маюми пропали сто тысяч йен, собранных всем классом на благотворительность.',
    poster: 'https://s.anixmirai.com/posters/VPHehhgSpJ9VRap8e2VpahnZPYyaof.jpg',
    titleAlt: '地獄少女',
    rating: 4.23,
    voteCount: 2079,
    episodesReleased: 26,
    episodesTotal: 26,
    year: '2005',
    country: 'Япония',
    status: 'Вышел',
    genres: 'сверхъестественное, тайна, триллер, ужасы, психологическое',
    studio: 'Studio Deen',
    category: 'Сериал',
    releaseDate: 'c 05.10.2005 по 05.04.2006',
  };

  const MINI_SAMPLES: ReleaseCardData[] = [
    { id: 1, titleRu: 'Кае не страшно', poster: 'https://s.anixmirai.com/posters/VPHehhgSpJ9VRap8e2VpahnZPYyaof.jpg', rating: 4.7, episodesReleased: 10, episodesTotal: 12, isFavorite: true },
    { id: 2, titleRu: 'Ты и я — полные противоположности', poster: 'https://s.anixmirai.com/posters/VPHehhgSpJ9VRap8e2VpahnZPYyaof.jpg', rating: 2.8, episodesReleased: 10, episodesTotal: 12 },
    { id: 3, titleRu: 'Прекрасная вечерняя луна', poster: 'https://s.anixmirai.com/posters/VPHehhgSpJ9VRap8e2VpahnZPYyaof.jpg', rating: 4.6, episodesReleased: 10, year: '2024' },
    { id: 4, titleRu: 'Провожающая в последний путь Фрирен', poster: 'https://s.anixmirai.com/posters/VPHehhgSpJ9VRap8e2VpahnZPYyaof.jpg', rating: 4.9, episodesReleased: 8, episodesTotal: 10, listStatus: 'planned', isFavorite: true },
    { id: 5, titleRu: 'Богиня благословляет этот прекрасный мир', poster: 'https://s.anixmirai.com/posters/VPHehhgSpJ9VRap8e2VpahnZPYyaof.jpg', status: 'скоро', listStatus: 'planned' },
    { id: 6, titleRu: 'Рик и Морти: Аниме', poster: 'https://s.anixmirai.com/posters/VPHehhgSpJ9VRap8e2VpahnZPYyaof.jpg', year: '2023', listStatus: 'planned' },
    { id: 7, titleRu: 'Клинок, рассекающий демонов', poster: 'https://s.anixmirai.com/posters/VPHehhgSpJ9VRap8e2VpahnZPYyaof.jpg', rating: 4.8, episodesTotal: 11, listStatus: 'planned' },
  ];

  // Tabs demo state
  let tabsDemoActive = $state<'latest' | 'ongoing'>('latest');
  const tabsDemoTabs = [
    { id: 'latest', label: 'Последние' },
    { id: 'ongoing', label: 'Онгоинги' },
  ];
  const TABS_DEMO_LATEST: ReleaseCardData[] = [
    { id: 1, titleRu: 'Адская девочка', rating: 4.23 },
    { id: 2, titleRu: 'Провожающая в последний путь Фрирен', rating: 4.9 },
  ];
  const TABS_DEMO_ONGOING: ReleaseCardData[] = [
    { id: 3, titleRu: 'Онгоинг пример 1', rating: 4.1 },
    { id: 4, titleRu: 'Онгоинг пример 2', rating: 3.8 },
  ];
  let tabsDemoItems = $derived(tabsDemoActive === 'latest' ? TABS_DEMO_LATEST : TABS_DEMO_ONGOING);

  // Rating slider
  let ratingValue = $state(4.23);

  // Select demo state
  const SELECT_OPTIONS: SelectOption[] = [
    { value: 'api-s.anixsekai.com', label: 'api-s.anixsekai.com' },
    { value: 'api.anixart.app',     label: 'api.anixart.app' },
    { value: 'api.anixart.tv',      label: 'api.anixart.tv (Заблокирован в РФ)' },
  ];
  let selectDemoValue = $state('api-s.anixsekai.com');

  const SAMPLE_COLLECTION: CollectionCardData = {
    id: 1,
    title: 'Этти 18+ Этти',
    image: 'https://s.anixmirai.com/posters/VPHehhgSpJ9VRap8e2VpahnZPYyaof.jpg',
    description: 'Подборка для вечера — когда не знаешь, что посмотреть, но хочется что-то лёгкое.',
    notesCount: 6,
    favoritesCount: 19596,
    isFavorite: false,
  };

  const DEMO_COMMENT_PROFILE = {
    id: 1,
    login: '永遠の孤独',
    avatar: 'https://s.anixmirai.com/posters/VPHehhgSpJ9VRap8e2VpahnZPYyaof.jpg',
  };

  function mockComment(id: number, message: string, extra: Partial<CommentData> = {}): CommentData {
    return {
      id,
      message,
      timestamp: Math.floor(Date.now() / 1000) - 3600,
      voteCount: 12,
      userVote: 0,
      isSpoiler: false,
      isEdited: false,
      isDeleted: false,
      replyCount: 67,
      parentCommentId: null,
      profile: DEMO_COMMENT_PROFILE,
      ...extra,
    };
  }

  const COMMENT_THREAD_DEMOS: { label: string; nodes: UiV2CommentNode[]; nested?: boolean }[] = [
    { label: 'Короткий (1 строка)', nodes: [commentDataToUiV2Node(mockComment(101, 'Огонь!'))] },
    { label: 'Средний (2–3 строки)', nodes: [commentDataToUiV2Node(mockComment(102, 'Какая это имба просто огонь ту...'))] },
    {
      label: 'Длинный абзац',
      nodes: [
        commentDataToUiV2Node(
          mockComment(
            103,
            'Это один из лучших релизов сезона. Сюжет держит с первой серии, персонажи проработаны, а финал вообще не оставляет равнодушным. Рекомендую всем, кто любит жанр.',
          ),
        ),
      ],
    },
    {
      label: 'Очень длинный текст',
      nodes: [
        commentDataToUiV2Node(
          mockComment(
            104,
            'Смотрел на одном дыхании — и это не преувеличение. Первая половина кажется спокойной, но дальше начинается настоящий разворот, который меняет восприятие всего, что было до. Анимация на ключевых сценах на высоте, музыка попадает в настроение идеально. Единственный минус — пару серий середины чуть провисают по темпу, но финальная арка полностью компенсирует.',
          ),
        ),
      ],
    },
    {
      label: 'С контекстом серии',
      nodes: [
        commentDataToUiV2Node(
          mockComment(105, 'На этом моменте я понял, что досмотрю до конца.', { postedAtEpisode: 7 }),
        ),
      ],
    },
    {
      label: 'Изменённый комментарий',
      nodes: [
        commentDataToUiV2Node(
          mockComment(106, 'Пересмотрел второй раз — оценка только выросла.', { isEdited: true }),
        ),
      ],
    },
    {
      label: 'Вложенный (nested)',
      nodes: [
        commentDataToUiV2Node(mockComment(107, 'Ответ в ветке — проверка линии на узком аватаре.')),
      ],
      nested: true,
    },
  ];

  let dotsMenuOpen = $state(false);
  let dotsMenuX = $state(0);
  let dotsMenuY = $state(0);

  const dotsMenuItems: UiV2PopupMenuItem[] = [
    { id: 'favorite', label: 'Добавить в избранное' },
    {
      id: 'status',
      label: 'Статус',
      dividerBefore: true,
      children: [
        { id: 'none', label: 'Не в списке', type: 'radio', checked: true },
        { id: 'watching', label: 'Смотрю', type: 'radio' },
        { id: 'planned', label: 'В планах', type: 'radio' },
        { id: 'completed', label: 'Просмотрено', type: 'radio' },
        { id: 'dropped', label: 'Брошено', type: 'radio' },
        { id: 'on_hold', label: 'Отложено', type: 'radio' },
      ],
    },
  ];

  function openDotsDemo(e: MouseEvent) {
    const btn = e.currentTarget as HTMLButtonElement;
    const r = btn.getBoundingClientRect();
    dotsMenuX = r.left + r.width / 2;
    dotsMenuY = r.bottom + 4;
    dotsMenuOpen = true;
  }

  function handleNavLink(e: MouseEvent, href: string) {
    if (href.startsWith('/')) {
      e.preventDefault();
      navigate(href);
    }
  }
</script>

<div class="view view-uikit">
  <header class="uikit-header">
    <h1 class="uikit-title">UI Kit</h1>
    <p class="uikit-desc">
      Legacy-витрина. Актуальный кит —
      <button type="button" class="uikit-link" style="background:none;border:0;padding:0;cursor:pointer;font:inherit" onclick={() => navigate('/uikit-v2')}>
        UI Kit V2
      </button>
    </p>
  </header>

  <!-- Colors -->
  <section class="uikit-section">
    <h2 class="uikit-section__title">Цвета</h2>
    <div class="uikit-colors">
      <div class="uikit-color uikit-color--bg" title="background"><span>bg</span></div>
      <div class="uikit-color uikit-color--surface" title="surface"><span>surface</span></div>
      <div class="uikit-color uikit-color--surface-hover" title="surface-hover"><span>surface-hover</span></div>
      <div class="uikit-color uikit-color--border" title="border"><span>border</span></div>
      <div class="uikit-color uikit-color--text" title="text"><span>text</span></div>
      <div class="uikit-color uikit-color--text-muted" title="text-muted"><span>text-muted</span></div>
      <div class="uikit-color uikit-color--accent" title="accent"><span>accent</span></div>
      <div class="uikit-color uikit-color--success" title="success"><span>success</span></div>
      <div class="uikit-color uikit-color--error" title="error"><span>error</span></div>
    </div>
  </section>

  <!-- Typography -->
  <section class="uikit-section">
    <h2 class="uikit-section__title">Типографика</h2>
    <div class="uikit-typo">
      <h1 class="uikit-typo__h1">Заголовок H1</h1>
      <h2 class="uikit-typo__h2">Заголовок H2</h2>
      <h3 class="uikit-typo__h3">Заголовок H3</h3>
      <p class="uikit-typo__body">Основной текст. Lorem ipsum dolor sit amet, consectetur adipiscing elit.</p>
      <p class="uikit-typo__muted">Приглушённый текст для подписей и мета-информации.</p>
      <p class="uikit-typo__small">Мелкий текст 0.9rem</p>
    </div>
  </section>

  <!-- Buttons -->
  <section class="uikit-section">
    <h2 class="uikit-section__title">Кнопки</h2>
    <div class="uikit-buttons">
      <button type="button" class="btn btn-primary">Primary</button>
      <button type="button" class="btn btn-secondary">Secondary</button>
      <button type="button" class="btn btn-primary" disabled>Primary disabled</button>
      <button type="button" class="btn btn-secondary" disabled>Secondary disabled</button>
    </div>
  </section>

  <!-- Tabs + Grid demo -->
  <section class="uikit-section">
    <h2 class="uikit-section__title">Tabs & Grid</h2>
    <p class="uikit-section__desc">Комбинация tabs-bar и грида карточек как на главной/в закладках</p>
    <div class="uikit-tabs-grid-demo">
      <Tabs
        tabs={tabsDemoTabs}
        activeId={tabsDemoActive}
        onChange={(id) => { tabsDemoActive = id as 'latest' | 'ongoing'; }}
      />
      <div class="bookmarks__grid">
        <ReleaseCardsGrid items={tabsDemoItems} />
      </div>
    </div>
  </section>

  <!-- Forms -->
  <section class="uikit-section">
    <h2 class="uikit-section__title">Формы</h2>
    <div class="uikit-form-demo">
      <label class="auth-form__label">
        <span>Обычное поле</span>
        <input type="text" class="auth-form__input" placeholder="Плейсхолдер" />
      </label>
      <label class="auth-form__label">
        <span>Поле с ошибкой</span>
        <input type="text" class="auth-form__input uikit-input--error" placeholder="Неверное значение" value="test" />
        <p class="auth-form__error">Текст ошибки валидации</p>
      </label>
      <label class="auth-form__label">
        <span>Disabled</span>
        <input type="text" class="auth-form__input" placeholder="Отключено" disabled />
      </label>
    </div>
  </section>

  <!-- Tooltip -->
  <section class="uikit-section">
    <h2 class="uikit-section__title">Тултип (UiV2)</h2>
    <p class="uikit-section__desc">Наведи на элемент — появляется подсказка с плавной анимацией</p>
    <div class="uikit-tooltip-demo">
      <UiV2Tooltip text="Обычный анимированный тултип">
        <span class="uikit-tooltip-trigger" role="button" tabindex="0">Наведи на меня</span>
      </UiV2Tooltip>
      <UiV2Tooltip
        title="Названия"
        lines={[
          { label: 'Оригинал', value: 'Jigoku Shoujo' },
          { label: 'Альт', value: '地獄少女' },
        ]}
      >
        <span class="uikit-tooltip-trigger" role="button" tabindex="0">Ещё пример</span>
      </UiV2Tooltip>
      <UiV2Tooltip text="Подсказка для кнопки">
        <button type="button" class="btn btn-secondary uikit-tooltip-trigger" tabindex="0">
          Кнопка с тултипом
        </button>
      </UiV2Tooltip>
    </div>
  </section>

  <!-- Select demo -->
  <section class="uikit-section">
    <h2 class="uikit-section__title">Селектор</h2>
    <div class="uikit-select-demo">
      <Select
        options={SELECT_OPTIONS}
        value={selectDemoValue}
        placeholder="Выберите эндпоинт"
        onChange={(v) => { selectDemoValue = v; console.log('Selected:', v); }}
      />
    </div>
  </section>

  <!-- Dots menu -->
  <section class="uikit-section">
    <h2 class="uikit-section__title">Меню (UiV2PopupMenu)</h2>
    <p class="uikit-section__desc">Контекстное меню V2 с подменю статусов</p>
    <div class="uikit-dots-menu-demo">
      <button type="button" class="btn btn-secondary" onclick={openDotsDemo}>
        {@html iconMoreHorizontal(18)} Открыть меню
      </button>
    </div>
  </section>

  <!-- Links -->
  <section class="uikit-section">
    <h2 class="uikit-section__title">Ссылки</h2>
    <div class="uikit-links">
      <a href="/" class="uikit-link" onclick={(e) => handleNavLink(e, '/')}>Обычная ссылка</a>
      <a href="/" class="nav-link" onclick={(e) => handleNavLink(e, '/')}>Nav link</a>
      <a href="/" class="logo" onclick={(e) => handleNavLink(e, '/')}>Logo</a>
    </div>
  </section>

  <!-- Horizontal release card demo -->
  <section class="uikit-section">
    <h2 class="uikit-section__title">Карточка релиза (каталог, V2)</h2>
    <p class="uikit-section__desc">Горизонтальная карточка с данными из API (grade, poster, episodes)</p>
    <div class="uikit-rating-demo">
      <label class="uikit-rating-demo__control">
        <span>Оценка (grade)</span>
        <input type="range" min="0" max="5" step="0.05" bind:value={ratingValue} />
        <span class="uikit-rating-demo__value">{ratingValue.toFixed(2)}</span>
      </label>
    </div>
    <div class="uikit-catalog-cards">
      <ReleaseCardUiV2 data={{ ...SAMPLE_CARD, rating: ratingValue }} variant="horizontal" />
    </div>
  </section>

  <!-- Mini cards -->
  <section class="uikit-section">
    <h2 class="uikit-section__title">Карточка мини (сетка, V2)</h2>
    <p class="uikit-section__desc">Вертикальная компактная карточка для режима сетки</p>
    <div class="release-cards-grid">
      {#each MINI_SAMPLES as item (item.id)}
        <ReleaseCardUiV2 data={item} variant="vertical" />
      {/each}
    </div>
  </section>

  <!-- Collection card -->
  <section class="uikit-section">
    <h2 class="uikit-section__title">Карточка коллекции</h2>
    <p class="uikit-section__desc">Сетка и cover-вариант как в мобильном приложении</p>
    <div class="uikit-collections">
      <CollectionCard data={SAMPLE_COLLECTION} />
      <CollectionCard data={{ ...SAMPLE_COLLECTION, isFavorite: true }} variant="cover" />
    </div>
  </section>

  <!-- Spacing -->
  <section class="uikit-section">
    <h2 class="uikit-section__title">Радиусы и отступы</h2>
    <div class="uikit-spacing">
      <div class="uikit-box uikit-box--sm">radius-sm</div>
      <div class="uikit-box uikit-box--md">radius-md</div>
      <div class="uikit-box uikit-box--lg">radius-lg</div>
    </div>
  </section>

  <!-- Comment thread lines -->
  <section class="uikit-section">
    <h2 class="uikit-section__title">Комментарии (UiV2)</h2>
    <p class="uikit-section__desc">
      Разная длина текста — проверка thread-линии и футера V2
    </p>
    <div class="uikit-comments-demo">
      {#each COMMENT_THREAD_DEMOS as demo (demo.nodes[0].id)}
        <div class="uikit-comments-demo__item">
          <p class="uikit-comments-demo__label">{demo.label}</p>
          <UiV2CommentThread
            nodes={demo.nodes}
            depth={demo.nested ? 1 : 0}
            enableInlineReply={false}
          />
        </div>
      {/each}
    </div>
  </section>

  <!-- States -->
  <section class="uikit-section">
    <h2 class="uikit-section__title">Состояния</h2>
    <div class="uikit-states">
      <p class="feed-loading">Загрузка…</p>
      <p class="feed-empty">Нет записей.</p>
      <p class="feed-error">Ошибка загрузки данных.</p>
    </div>
  </section>
</div>

<UiV2PopupMenu
  open={dotsMenuOpen}
  x={dotsMenuX}
  y={dotsMenuY}
  items={dotsMenuItems}
  onClose={() => { dotsMenuOpen = false; }}
  onSelect={(id) => console.log('[UiV2PopupMenu]', id)}
/>
