<script module lang="ts">
  const DONT_SHOW_KEY = 'anixapp_hide_about_modal';

  export function isAnixappAboutHidden(): boolean {
    try {
      return localStorage.getItem(DONT_SHOW_KEY) === '1';
    } catch {
      return false;
    }
  }

  export function setAnixappAboutHidden(hidden: boolean): void {
    try {
      if (hidden) localStorage.setItem(DONT_SHOW_KEY, '1');
      else localStorage.removeItem(DONT_SHOW_KEY);
    } catch {
      /* ignore */
    }
  }
</script>

<script lang="ts">
  import type { TransitionConfig } from 'svelte/transition';
  import { uiv2CustomScroll } from '../actions/uiv2CustomScroll';

  export type AnixappLegalStep = 'about' | 'terms';

  interface Props {
    startStep?: AnixappLegalStep;
    offerDontShowAgain?: boolean;
    onClose: () => void;
  }

  let {
    startStep: initialStep = 'about',
    offerDontShowAgain = true,
    onClose,
  }: Props = $props();

  const TERMS_WRITTEN_AT = '25 августа 2026';
  /** spring-ish ease ≈ cubic-bezier(0.22, 1, 0.36, 1) */
  const SMART_EASE = (t: number) => 1 - Math.pow(1 - t, 3.35);

  let step = $state<AnixappLegalStep>(initialStep);
  let dontShowAgain = $state(false);
  let reduceMotion = $state(false);

  $effect(() => {
    try {
      reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch {
      reduceMotion = false;
    }
  });

  function smartOverlay(_node: Element, params?: { duration?: number }): TransitionConfig {
    const duration = reduceMotion ? 0 : (params?.duration ?? 260);
    return {
      duration,
      easing: SMART_EASE,
      css: (t) => `opacity:${t}`,
    };
  }

  function smartPanel(
    _node: Element,
    params?: { duration?: number; y?: number; scale?: number; opacity?: number },
  ): TransitionConfig {
    const duration = reduceMotion ? 0 : (params?.duration ?? 380);
    const y = params?.y ?? 22;
    const fromScale = params?.scale ?? 0.94;
    return {
      duration,
      easing: SMART_EASE,
      css: (t) => {
        const ty = (1 - t) * y;
        const s = fromScale + (1 - fromScale) * t;
        return `opacity:${t};transform:translate3d(0,${ty}px,0) scale(${s});`;
      },
    };
  }

  function smartPanelOut(
    _node: Element,
    params?: { duration?: number },
  ): TransitionConfig {
    const duration = reduceMotion ? 0 : (params?.duration ?? 200);
    return {
      duration,
      easing: (t) => t * t,
      css: (t) => {
        // t: 1 → 0 on outro
        const s = 0.97 + 0.03 * t;
        const ty = (1 - t) * -8;
        return `opacity:${t};transform:translate3d(0,${ty}px,0) scale(${s});`;
      },
    };
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  }

  function onAboutConfirm() {
    if (dontShowAgain) setAnixappAboutHidden(true);
    step = 'terms';
  }
</script>

<svelte:window onkeydown={onKeydown} />

<div
  class="auth-terms-modal"
  role="presentation"
  transition:smartOverlay={{ duration: 280 }}
>
  <button
    type="button"
    class="auth-terms-modal__backdrop"
    aria-label="Закрыть"
    onclick={onClose}
    transition:smartOverlay={{ duration: 240 }}
  ></button>

  <div class="auth-terms-modal__stage">
    {#key step}
      <div
        class="auth-terms-modal__panel"
        class:auth-terms-modal__panel--compact={step === 'about'}
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-terms-modal-title"
        in:smartPanel={{ duration: 400, y: 20, scale: 0.93 }}
        out:smartPanelOut={{ duration: 180 }}
      >
        {#if step === 'about'}
          <header class="auth-terms-modal__head">
            <div class="auth-terms-modal__head-text">
              <h2 id="auth-terms-modal-title" class="auth-terms-modal__title">О проекте</h2>
            </div>
            <button type="button" class="auth-terms-modal__close" aria-label="Закрыть" onclick={onClose}>×</button>
          </header>

          <div class="auth-terms-modal__body auth-terms-modal__body--compact">
            <p>
              AnixApp — <strong>некоммерческое</strong> приложение, сделанное на чистом энтузиазме.
              Оно открыто для всех и развивается без платных подписок, скрытых платежей и коммерческой
              монетизации со стороны авторов клиента.
            </p>
            <p class="auth-terms-modal__note">
              Если кто-то делает форк AnixApp с подписками, платными «премиум»-функциями или иным
              способом зарабатывает на чужом энтузиазме, выдавая это за официальный или добросовестный
              продукт — такие разработчики действуют <strong>недобросовестно</strong>. Мы к ним не
              относимся и не несём ответственность за их действия.
            </p>
          </div>

          <footer class="auth-terms-modal__foot auth-terms-modal__foot--split">
            {#if offerDontShowAgain}
              <label class="auth-terms-modal__dont">
                <button
                  type="button"
                  class="auth-terms-modal__switch"
                  class:auth-terms-modal__switch--on={dontShowAgain}
                  role="switch"
                  aria-checked={dontShowAgain}
                  aria-label="Больше не показывать"
                  onclick={() => { dontShowAgain = !dontShowAgain; }}
                >
                  <span class="auth-terms-modal__switch-thumb" aria-hidden="true"></span>
                </button>
                <span>Больше не показывать</span>
              </label>
            {:else}
              <span></span>
            {/if}
            <button type="button" class="uiv2-btn uiv2-btn--lg uiv2-btn--primary" onclick={onAboutConfirm}>
              <span class="uiv2-btn__label">Понятно</span>
            </button>
          </footer>
        {:else}
          <header class="auth-terms-modal__head">
            <div class="auth-terms-modal__head-text">
              <h2 id="auth-terms-modal-title" class="auth-terms-modal__title">Условия использования AnixApp</h2>
              <p class="auth-terms-modal__date">Дата написания: {TERMS_WRITTEN_AT}</p>
            </div>
            <button type="button" class="auth-terms-modal__close" aria-label="Закрыть" onclick={onClose}>×</button>
          </header>

          <div class="auth-terms-modal__scroll uiv2-scroll-area uiv2-scroll-area--y" use:uiv2CustomScroll={{ axis: 'y' }}>
            <div class="uiv2-scroll-area__viewport auth-terms-modal__body" data-uiv2-scroll>
              <p>
                AnixApp — неофициальный клиент для доступа к сервису Anixart. Он не заменяет правила Anixart
                и не отменяет ваши обязательства перед Anixart.
              </p>

              <section>
                <h3>Что получает приложение</h3>
                <ul>
                  <li>Данные аккаунта Anixart, которые вы вводите при входе или OAuth (токен сессии, профиль, аватар, никнейм).</li>
                  <li>Локальные настройки приложения, историю просмотра, закладки и загрузки на вашем устройстве.</li>
                  <li>Технический идентификатор устройства — для стабильной работы клиента.</li>
                  <li>Сетевые запросы к API Anixart и связанным источникам воспроизведения контента.</li>
                  <li>При включении — данные для Discord Rich Presence (что вы смотрите, без пароля и личных сообщений).</li>
                </ul>
                <p class="auth-terms-modal__note">
                  Данные авторизации (токен сессии и связанные сведения профиля) хранятся
                  <strong> только у вас на компьютере</strong> — локально в данных приложения.
                  Авторы AnixApp не получают и не хранят ваш пароль и сессию на своих серверах.
                </p>
              </section>

              <section>
                <h3>За что отвечает AnixApp</h3>
                <ul>
                  <li>Работу клиента: интерфейс, воспроизведение, синхронизацию настроек и функций, описанных в приложении.</li>
                  <li>Безопасное локальное хранение сессии и настроек на вашем устройстве в пределах возможностей ОС.</li>
                  <li>Исправление ошибок и обновления клиента по мере их выпуска.</li>
                </ul>
                <p class="auth-terms-modal__note">
                  AnixApp не предоставляет контент сам по себе, не модерирует материалы Anixart и не гарантирует
                  постоянную доступность озвучек, источников или серверов третьих лиц.
                </p>
              </section>

              <section>
                <h3>За что отвечает пользователь</h3>
                <ul>
                  <li>Корректность данных при регистрации и входе, сохранность пароля и аккаунта Anixart.</li>
                  <li>Соблюдение правил Anixart, авторских прав и законодательства вашей страны.</li>
                  <li>Использование приложения только для личных некоммерческих целей, если иное не разрешено правилами Anixart.</li>
                  <li>Действия в совместном просмотре, чатах и загрузках — вы несёте ответственность за то, что отправляете и делитесь.</li>
                  <li>Риски использования сторонних источников видео и неофициального клиента: сбои, блокировки, изменения API.</li>
                </ul>
              </section>

              <p class="auth-terms-modal__footer-note">
                Продолжая пользоваться AnixApp, вы подтверждаете, что прочитали эти условия и принимаете их
                вместе с правилами Anixart.
              </p>
            </div>
            <div class="uiv2-scroll-area__v-track" aria-hidden="true">
              <div class="uiv2-scroll-area__v-thumb"></div>
            </div>
          </div>

          <footer class="auth-terms-modal__foot">
            <button type="button" class="uiv2-btn uiv2-btn--lg uiv2-btn--primary" onclick={onClose}>
              <span class="uiv2-btn__label">Понятно</span>
            </button>
          </footer>
        {/if}
      </div>
    {/key}
  </div>
</div>
