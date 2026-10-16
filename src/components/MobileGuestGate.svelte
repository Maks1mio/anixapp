<script lang="ts">
  /**
   * Вкладка, которой нужен аккаунт («Профиль», «Закладки»), у гостя: спокойный экран с «Войти»
   * вместо мгновенного перехода на полноэкранный вход (выглядело как «вылет»). Как в Anixart.
   */
  import { iconUser, iconBookmark, iconSettings, iconDownload } from './icons';
  import { navigate } from '../stores/navigation';
  import { settingsModalOpen } from '../stores/modals';

  interface Props {
    kind: 'profile' | 'bookmarks';
    onLogin: () => void;
  }
  let { kind, onLogin }: Props = $props();

  const TEXT = {
    profile: {
      title: 'Вы не вошли в аккаунт',
      text: 'Войдите, чтобы видеть свой профиль, статистику, оценки и историю просмотра.',
      icon: iconUser,
    },
    bookmarks: {
      title: 'Закладки доступны после входа',
      text: 'Войдите, чтобы сохранять тайтлы в списки «Смотрю», «В планах», «Просмотрено» и избранное.',
      icon: iconBookmark,
    },
  } as const;
  const t = $derived(TEXT[kind]);
</script>

<div class="m-guest">
  <h1 class="m-guest__bar">{kind === 'profile' ? 'Профиль' : 'Закладки'}</h1>
  <div class="m-guest__body">
    <span class="m-guest__icon" aria-hidden="true">{@html t.icon(36)}</span>
    <h2 class="m-guest__title">{t.title}</h2>
    <p class="m-guest__text">{t.text}</p>
    <button type="button" class="m-guest__login" onclick={onLogin}>Войти</button>
    <div class="m-guest__links">
      <button type="button" class="m-guest__link" onclick={() => settingsModalOpen.set(true)}>
        {@html iconSettings(20)}<span>Настройки</span>
      </button>
      <button type="button" class="m-guest__link" onclick={() => navigate('/downloads')}>
        {@html iconDownload(20)}<span>Загрузки</span>
      </button>
    </div>
  </div>
</div>

<style>
  .m-guest { display: flex; flex-direction: column; min-height: 100%; }
  .m-guest__bar {
    margin: 0;
    padding: var(--m-space-4) calc(var(--m-gutter) + env(safe-area-inset-left));
    font: 700 22px/1.25 var(--m-font);
    color: var(--m-text);
  }
  .m-guest__body {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--m-space-3);
    padding: var(--m-space-6) calc(var(--m-gutter) + env(safe-area-inset-left));
    text-align: center;
  }
  .m-guest__icon {
    display: grid;
    place-items: center;
    width: 72px;
    height: 72px;
    border-radius: 50%;
    background: var(--m-secondary-container);
    color: var(--m-on-secondary-container, var(--m-text));
    margin-bottom: var(--m-space-2);
  }
  .m-guest__title { margin: 0; font: 600 18px/1.3 var(--m-font); color: var(--m-text); }
  .m-guest__text { margin: 0; max-width: 340px; font: 400 14px/1.45 var(--m-font); color: var(--m-text-2); }
  .m-guest__login {
    margin-top: var(--m-space-3);
    min-width: 200px;
    height: 48px;
    padding: 0 var(--m-space-6);
    border: 0;
    border-radius: 24px;
    background: var(--m-primary);
    color: var(--m-on-primary, #1c1b1f);
    font: 600 16px var(--m-font);
  }
  .m-guest__links { display: flex; gap: var(--m-space-2); margin-top: var(--m-space-4); }
  .m-guest__link {
    display: inline-flex;
    align-items: center;
    gap: var(--m-space-2);
    height: 40px;
    padding: 0 var(--m-space-4);
    border: 1.5px solid var(--m-outline-variant);
    border-radius: 20px;
    background: transparent;
    color: var(--m-text);
    font: 500 14px var(--m-font);
  }
</style>
