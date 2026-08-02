<script lang="ts">
  import { navigate } from '../stores/navigation';
  import { iconChevronLeft, iconChevronRight, iconPlus, iconX } from '../components/icons';
  import UiV2RoundButton from '../components/uikit-v2/UiV2RoundButton.svelte';
  import UiV2Button from '../components/uikit-v2/UiV2Button.svelte';
  import UiV2PillBar from '../components/uikit-v2/UiV2PillBar.svelte';
  import UiV2BackBar from '../components/uikit-v2/UiV2BackBar.svelte';
  import UiV2ChoiceSheet from '../components/uikit-v2/UiV2ChoiceSheet.svelte';
  import UiV2Card from '../components/uikit-v2/UiV2Card.svelte';

  type SectionId = 'tokens' | 'type' | 'controls' | 'surfaces';

  const sections: { id: SectionId; title: string; desc: string }[] = [
    { id: 'tokens', title: 'Токены', desc: 'Цвета, радиусы, тени — основа V2' },
    { id: 'type', title: 'Типографика', desc: 'Иерархия заголовков и текста' },
    { id: 'controls', title: 'Контролы', desc: 'Кнопки, pill-навигация, поля' },
    { id: 'surfaces', title: 'Поверхности', desc: 'Панели, модалки, карточки взаимодействия' },
  ];

  let active: SectionId = $state('controls');

  const pillItems = [
    { id: '1', label: 'Maks1mio' },
    { id: '2', label: 'Releases' },
    { id: '3', label: 'Friends' },
  ];
  let pillIndex = $state(1);

  let choiceOpen = $state(false);
  let choiceValue = $state(0);
  const choiceOptions = [
    { value: 0, label: 'Все пользователи' },
    { value: 1, label: 'Только друзья' },
    { value: 2, label: 'Только я' },
  ];
</script>

<div class="view view-uikit-v2">
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


          <label class="uikit-v2-field">
            <span class="uikit-v2-field__label">Поле ввода</span>
            <input class="uikit-v2-input" type="text" placeholder="Placeholder…" />
          </label>
        {:else}
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
