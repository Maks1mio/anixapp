import { navigate } from '../app';
import { iconHeart } from '../components/icons';
import { renderDotsMenu } from '../components/dots-menu';
import { ratingHue, renderReleaseCardHorizontal } from '../components/release-card-h';
import { renderReleaseCardVertical } from '../components/release-card-v';
import { renderCollectionCard } from '../components/collection-card';
import { renderSearchFranchise } from '../components/search-franchise';
import { renderSelect } from '../components/select';
import type { ReleaseCardData } from '../types/release';

export function renderUikit(): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'view view-uikit';

  wrap.innerHTML = `
    <header class="uikit-header">
      <h1 class="uikit-title">UI Kit</h1>
      <p class="uikit-desc">Компоненты и стили приложения AnixApp</p>
    </header>

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

    <section class="uikit-section">
      <h2 class="uikit-section__title">Кнопки</h2>
      <div class="uikit-buttons">
        <button type="button" class="btn btn-primary">Primary</button>
        <button type="button" class="btn btn-secondary">Secondary</button>
        <button type="button" class="btn btn-primary" disabled>Primary disabled</button>
        <button type="button" class="btn btn-secondary" disabled>Secondary disabled</button>
      </div>
    </section>

    <section class="uikit-section">
      <h2 class="uikit-section__title">Basic Tabs</h2>
      <p class="uikit-section__desc">Табы с анимированным переходом фона на выбранный</p>
      <div class="uikit-tabs-demo" id="uikit-tabs-demo"></div>
    </section>

    <section class="uikit-section">
      <h2 class="uikit-section__title">Формы</h2>
      <div class="uikit-form-demo">
        <label class="auth-form__label">
          <span>Обычное поле</span>
          <input type="text" class="auth-form__input" placeholder="Плейсхолдер" value="" />
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

    <section class="uikit-section">
      <h2 class="uikit-section__title">Тултип (кастомный, анимированный)</h2>
      <p class="uikit-section__desc">Наведи на элемент — появляется подсказка с плавной анимацией</p>
      <div class="uikit-tooltip-demo">
        <span class="tooltip-trigger uikit-tooltip-trigger" tabindex="0">
          Наведи на меня
          <span class="tooltip tooltip--animated">Обычный анимированный тултип</span>
        </span>
        <span class="tooltip-trigger uikit-tooltip-trigger" tabindex="0">
          Ещё пример
          <span class="tooltip tooltip--animated">Оригинал: Jigoku Shoujo<br>Альт: 地獄少女</span>
        </span>
        <button type="button" class="btn btn-secondary tooltip-trigger uikit-tooltip-trigger" tabindex="0">
          Кнопка с тултипом
          <span class="tooltip tooltip--animated">Подсказка для кнопки</span>
        </button>
      </div>
    </section>

    <section class="uikit-section">
      <h2 class="uikit-section__title">Селектор</h2>
      <div class="uikit-select-demo" id="uikit-select-demo"></div>
    </section>

    <section class="uikit-section">
      <h2 class="uikit-section__title">Меню три точки</h2>
      <p class="uikit-section__desc">Отдельный компонент dots-menu, открывается в body (position: fixed)</p>
      <div class="uikit-dots-menu-demo" id="uikit-dots-menu-demo"></div>
    </section>

    <section class="uikit-section">
      <h2 class="uikit-section__title">Ссылки</h2>
      <div class="uikit-links">
        <a href="/" class="uikit-link" data-nav>Обычная ссылка</a>
        <a href="/" class="nav-link" data-nav>Nav link</a>
        <a href="/" class="logo" data-nav>Logo</a>
      </div>
    </section>

    <section class="uikit-section">
      <h2 class="uikit-section__title">Карточка релиза (каталог)</h2>
      <p class="uikit-section__desc">Горизонтальная карточка с данными из API (grade, poster, episodes)</p>
      <div class="uikit-rating-demo">
        <label class="uikit-rating-demo__control">
          <span>Оценка (grade)</span>
          <input
            id="uikit-rating-range"
            type="range"
            min="0"
            max="5"
            step="0.05"
            value="4.23"
          />
          <span class="uikit-rating-demo__value" id="uikit-rating-value">4.23</span>
        </label>
      </div>
      <div class="uikit-catalog-cards" id="uikit-release-card-demo"></div>
    </section>

    <section class="uikit-section">
      <h2 class="uikit-section__title">Карточка мини (сетка)</h2>
      <p class="uikit-section__desc">Вертикальная компактная карточка для режима сетки</p>
      <div class="release-cards-grid" id="uikit-mini-cards-demo"></div>
    </section>

    <section class="uikit-section">
      <h2 class="uikit-section__title">Карточка коллекции</h2>
      <p class="uikit-section__desc">Горизонтальная карточка коллекции с постером и счётчиками</p>
      <div class="uikit-collections" id="uikit-collections-demo"></div>
    </section>

    <section class="uikit-section">
      <h2 class="uikit-section__title">Франшиза в поиске</h2>
      <p class="uikit-section__desc">Компонент search-franchise с анимацией \"колоды\"</p>
      <div class="uikit-franchise" id="uikit-franchise-demo"></div>
    </section>

    <section class="uikit-section">
      <h2 class="uikit-section__title">Радиусы и отступы</h2>
      <div class="uikit-spacing">
        <div class="uikit-box uikit-box--sm">radius-sm</div>
        <div class="uikit-box uikit-box--md">radius-md</div>
        <div class="uikit-box uikit-box--lg">radius-lg</div>
      </div>
    </section>

    <section class="uikit-section">
      <h2 class="uikit-section__title">Состояния</h2>
      <div class="uikit-states">
        <p class="feed-loading">Загрузка…</p>
        <p class="feed-empty">Нет записей.</p>
        <p class="feed-error">Ошибка загрузки данных.</p>
      </div>
    </section>
  `;

  const dotsMenuDemo = wrap.querySelector('#uikit-dots-menu-demo');
  if (dotsMenuDemo) {
    const dotsMenu = renderDotsMenu({
      entries: [
        { id: 'favorite', label: 'Добавить в избранное', icon: iconHeart(16, false) },
        { type: 'divider' },
        { type: 'label', text: 'СТАТУС' },
        { id: 'none', label: 'Не смотрю' },
        { id: 'watching', label: 'Смотрю' },
        { id: 'planned', label: 'В планах' },
        { id: 'completed', label: 'Просмотрено' },
        { id: 'dropped', label: 'Брошено' },
        { id: 'on_hold', label: 'Отложено' },
      ],
      onSelect: (id) => console.log('[Dots menu] Выбрано:', id),
    });
    dotsMenuDemo.appendChild(dotsMenu);
  }

  const selectDemo = wrap.querySelector('#uikit-select-demo');
  if (selectDemo) {
    const apiSelect = renderSelect({
      label: 'Эндпоинт API',
      placeholder: 'Выберите эндпоинт',
      value: 'api-s.anixsekai.com',
      options: [
        { value: 'api-s.anixsekai.com', label: 'api-s.anixsekai.com' },
        { value: 'api.anixart.app', label: 'api.anixart.app' },
        { value: 'api.anixart.tv', label: 'api.anixart.tv (Заблокирован в РФ)' },
      ],
      onChange: (value) => console.log('Selected:', value),
    });
    selectDemo.appendChild(apiSelect);
  }

  const tabsDemo = wrap.querySelector('#uikit-tabs-demo');
  if (tabsDemo) {
    const labels = ['Profile', 'Connections', 'Subscription', 'Security'];
    const tabsRoot = document.createElement('div');
    tabsRoot.className = 'tabs';
    tabsRoot.setAttribute('role', 'tablist');
    const slider = document.createElement('div');
    slider.className = 'tabs__slider';
    slider.setAttribute('aria-hidden', 'true');
    tabsRoot.appendChild(slider);
    let activeIndex = 1;
    labels.forEach((label, i) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'tabs__tab';
      btn.setAttribute('role', 'tab');
      btn.setAttribute('aria-selected', i === activeIndex ? 'true' : 'false');
      btn.textContent = label;
      btn.addEventListener('click', () => {
        activeIndex = i;
        labels.forEach((_, j) => {
          const t = tabsRoot.querySelectorAll('.tabs__tab')[j] as HTMLElement;
          if (t) t.setAttribute('aria-selected', j === i ? 'true' : 'false');
        });
        tabsRoot.querySelectorAll('.tabs__tab').forEach((tab) => tab.classList.remove('tabs__tab--active'));
        (tabsRoot.querySelectorAll('.tabs__tab')[i] as HTMLElement)?.classList.add('tabs__tab--active');
        const tabEl = tabsRoot.querySelectorAll('.tabs__tab')[i] as HTMLElement;
        if (tabEl && slider) {
          const r = tabEl.getBoundingClientRect();
          const parentR = tabsRoot.getBoundingClientRect();
          slider.style.left = `${tabEl.offsetLeft}px`;
          slider.style.width = `${tabEl.offsetWidth}px`;
        }
      });
      tabsRoot.appendChild(btn);
      if (i === activeIndex) btn.classList.add('tabs__tab--active');
    });
    tabsDemo.appendChild(tabsRoot);
    requestAnimationFrame(() => {
      const tabEl = tabsRoot.querySelectorAll('.tabs__tab')[activeIndex] as HTMLElement;
      if (tabEl && slider) {
        slider.style.left = `${tabEl.offsetLeft}px`;
        slider.style.width = `${tabEl.offsetWidth}px`;
      }
    });
  }

  // Демо карточки релиза с реальными данными из API + управление оценкой
  const cardDemo = wrap.querySelector('#uikit-release-card-demo');
  const ratingRange = wrap.querySelector('#uikit-rating-range') as HTMLInputElement | null;
  const ratingValueEl = wrap.querySelector('#uikit-rating-value') as HTMLElement | null;
  if (cardDemo) {
    const baseCardData: ReleaseCardData = {
      id: 2,
      titleRu: 'Адская девочка',
      titleEn: 'Jigoku Shoujo',
      description:
        'Всё началось с того, как у Маюми пропали сто тысяч йен, собранных всем классом на благотворительность. Для ученицы средней школы это очень приличная сумма. Опасаясь всеобщего гнева',
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

    const renderSample = (rating: number) => {
      const data: ReleaseCardData = {
        ...baseCardData,
        rating,
      };
      cardDemo.innerHTML = '';
      cardDemo.appendChild(renderReleaseCardHorizontal(data));
    };

    const setSliderColor = (value: number) => {
      if (ratingRange) ratingRange.style.accentColor = `hsl(${ratingHue(value)}, 95%, 52%)`;
    };

    const initialRating = baseCardData.rating ?? 0;
    renderSample(initialRating);
    setSliderColor(initialRating);
    if (ratingRange && ratingValueEl) {
      ratingRange.value = initialRating.toFixed(2);
      ratingValueEl.textContent = initialRating.toFixed(2);
      ratingRange.addEventListener('input', () => {
        const val = Number(ratingRange.value);
        const clamped = Math.max(0, Math.min(5, Number.isFinite(val) ? val : 0));
        ratingValueEl.textContent = clamped.toFixed(2);
        setSliderColor(clamped);
        renderSample(clamped);
      });
    }
  }

  // Демо мини-карточки (вертикальные)
  const miniDemo = wrap.querySelector('#uikit-mini-cards-demo');
  if (miniDemo) {
    const samples: ReleaseCardData[] = [
      {
        id: 1,
        titleRu: 'Кае не страшно',
        poster: 'https://s.anixmirai.com/posters/VPHehhgSpJ9VRap8e2VpahnZPYyaof.jpg',
        rating: 4.7,
        episodesReleased: 10,
        episodesTotal: 12,
        isFavorite: true,
      },
      {
        id: 2,
        titleRu: 'Ты и я — полные противоположности',
        poster: 'https://s.anixmirai.com/posters/VPHehhgSpJ9VRap8e2VpahnZPYyaof.jpg',
        rating: 2.8,
        episodesReleased: 10,
        episodesTotal: 12,
      },
      {
        id: 3,
        titleRu: 'Прекрасная вечерняя луна',
        poster: 'https://s.anixmirai.com/posters/VPHehhgSpJ9VRap8e2VpahnZPYyaof.jpg',
        rating: 4.6,
        episodesReleased: 10,
        episodesTotal: undefined,
        year: '2024',
      },
      {
        id: 4,
        titleRu: 'Провожающая в последний путь Фрирен',
        poster: 'https://s.anixmirai.com/posters/VPHehhgSpJ9VRap8e2VpahnZPYyaof.jpg',
        rating: 4.9,
        episodesReleased: 8,
        episodesTotal: 10,
        listStatus: 'planned',
        isFavorite: true,
      },
      {
        id: 5,
        titleRu: 'Богиня благословляет этот прекрасный мир',
        poster: 'https://s.anixmirai.com/posters/VPHehhgSpJ9VRap8e2VpahnZPYyaof.jpg',
        status: 'скоро',
        listStatus: 'planned',
      },
      {
        id: 6,
        titleRu: 'Рик и Морти: Аниме',
        poster: 'https://s.anixmirai.com/posters/VPHehhgSpJ9VRap8e2VpahnZPYyaof.jpg',
        year: '2023',
        listStatus: 'planned',
      },
      {
        id: 7,
        titleRu: 'Клинок, рассекающий демонов',
        poster: 'https://s.anixmirai.com/posters/VPHehhgSpJ9VRap8e2VpahnZPYyaof.jpg',
        rating: 4.8,
        episodesTotal: 11,
        listStatus: 'planned',
      },
    ];
    samples.forEach((d) => miniDemo.appendChild(renderReleaseCardVertical(d)));
  }

  // Демо карточки коллекции
  const collectionsDemo = wrap.querySelector('#uikit-collections-demo');
  if (collectionsDemo) {
    const col = renderCollectionCard({
      id: 1,
      title: 'Этти 18+ Этти',
      image: 'https://s.anixmirai.com/posters/VPHehhgSpJ9VRap8e2VpahnZPYyaof.jpg',
      releaseCount: 42,
      notesCount: 8,
      bookmarksCount: 95,
    });
    collectionsDemo.appendChild(col);
  }

  // Демо search-franchise
  const franchiseDemo = wrap.querySelector('#uikit-franchise-demo');
  if (franchiseDemo) {
    const card = renderSearchFranchise({
      images: [
        'https://s.anixmirai.com/posters/VPHehhgSpJ9VRap8e2VpahnZPYyaof.jpg',
        'https://s.anixmirai.com/posters/VPHehhgSpJ9VRap8e2VpahnZPYyaof.jpg',
        'https://s.anixmirai.com/posters/VPHehhgSpJ9VRap8e2VpahnZPYyaof.jpg',
      ],
      name: 'black_clover',
      releaseCount: 7,
      firstReleaseId: 20055,
    });
    franchiseDemo.appendChild(card);
  }

  wrap.querySelectorAll('[data-nav]').forEach((el) => {
    el.addEventListener('click', (e) => {
      const a = el as HTMLAnchorElement;
      if (a.href && a.getAttribute('href')?.startsWith('/')) {
        e.preventDefault();
        navigate(a.getAttribute('href')!);
      }
    });
  });

  return wrap;
}
