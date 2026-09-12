<script lang="ts">
  import type { FluoAnimeSelectMode, FluoControlMode, FluoCreateRoomOptions, FluoRoomVisibility } from '../fluo/types';
  import { iconX } from './icons';
  import UiV2Button from './uikit-v2/UiV2Button.svelte';
  import UiV2OutlinedField from './uikit-v2/UiV2OutlinedField.svelte';
  import UiV2Select, { type UiV2SelectOption } from './uikit-v2/UiV2Select.svelte';

  type Props = {
    busy?: boolean;
    hint?: string;
    onClose: () => void;
    onSubmit: (options: FluoCreateRoomOptions) => void | Promise<void>;
  };

  let { busy = false, hint = '', onClose, onSubmit }: Props = $props();

  let name = $state('');
  let visibility = $state<FluoRoomVisibility>('public');
  let password = $state('');
  let control = $state<FluoControlMode>('everyone');
  let anime = $state<FluoAnimeSelectMode>('everyone');
  let chat = $state(true);
  let localHint = $state('');

  const visibilityOptions: UiV2SelectOption[] = [
    { value: 'public', label: 'Публичный', desc: 'В каталоге, войти может любой' },
    { value: 'private', label: 'Приватный', desc: 'Скрыт из каталога, вход по коду' },
    { value: 'closed', label: 'Закрытый', desc: 'В каталоге, вход только с паролем' },
  ];
  const playerControlOptions: UiV2SelectOption[] = [
    { value: 'host', label: 'Хост', desc: 'Play, пауза, перемотка и серии текущего тайтла' },
    { value: 'everyone', label: 'Могут все', desc: 'Свободное управление плеером' },
  ];
  const animeSelectOptions: UiV2SelectOption[] = [
    { value: 'host', label: 'Хост', desc: 'Хост сам решает, что смотреть' },
    { value: 'everyone', label: 'Могут все', desc: 'Свободное переключение тайтла' },
    { value: 'vote', label: 'Могут все (голосование)', desc: 'Смена тайтла через голосование' },
  ];
  const chatOptions: UiV2SelectOption[] = [
    { value: 'on', label: 'Включён' },
    { value: 'off', label: 'Выключен' },
  ];

  const shownHint = $derived(localHint || hint);

  async function submit() {
    if (visibility === 'closed' && !password.trim()) {
      localHint = 'Укажите пароль для закрытой комнаты';
      return;
    }
    localHint = '';
    const options: FluoCreateRoomOptions = {
      name: name.trim() || undefined,
      visibility,
      password: visibility === 'closed' ? password : undefined,
      settings: {
        controlMode: control === 'host' ? 'host' : 'everyone',
        animeSelectMode: anime,
        chatEnabled: chat,
      },
    };
    await onSubmit(options);
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div
  class="fluo-create-modal-overlay"
  role="dialog"
  aria-modal="true"
  aria-label="Создать комнату"
  tabindex="-1"
  onclick={(e) => { if (e.target === e.currentTarget) onClose(); }}
>
  <div class="fluo-create-modal">
    <div class="fluo-create-modal__head">
      <h2>Создать комнату</h2>
      <button type="button" class="fluo-create-modal__close" aria-label="Закрыть" onclick={onClose}>
        {@html iconX(18)}
      </button>
    </div>
    <div class="fluo-create-modal__body">
      <UiV2OutlinedField label="Название" bind:value={name} maxlength={80} disabled={busy} />

      <UiV2Select
        label="Настройки комнаты"
        options={visibilityOptions}
        value={visibility}
        disabled={busy}
        onChange={(v) => {
          if (v === 'public' || v === 'private' || v === 'closed') visibility = v;
        }}
      />

      {#if visibility === 'closed'}
        <UiV2OutlinedField
          label="Пароль"
          type="password"
          revealable
          bind:value={password}
          maxlength={64}
          required
          disabled={busy}
        />
      {/if}

      <UiV2Select
        label="Управление плеером"
        options={playerControlOptions}
        value={control}
        disabled={busy}
        onChange={(v) => {
          if (v === 'host' || v === 'everyone') control = v;
        }}
      />

      <UiV2Select
        label="Выбор аниме"
        options={animeSelectOptions}
        value={anime}
        disabled={busy}
        onChange={(v) => {
          if (v === 'host' || v === 'everyone' || v === 'vote') anime = v;
        }}
      />

      <UiV2Select
        label="Настройки чата"
        options={chatOptions}
        value={chat ? 'on' : 'off'}
        disabled={busy}
        onChange={(v) => { chat = v === 'on'; }}
      />

      {#if shownHint}
        <p class="fluo-create-modal__hint" role="alert">{shownHint}</p>
      {/if}
    </div>
    <div class="fluo-create-modal__foot">
      <UiV2Button label="Отмена" variant="ghost" disabled={busy} onclick={onClose} />
      <UiV2Button
        label={busy ? 'Создание…' : 'Создать'}
        variant="primary"
        disabled={busy}
        onclick={() => void submit()}
      />
    </div>
  </div>
</div>

<style>
  .fluo-create-modal-overlay {
    position: fixed;
    inset: 0;
    z-index: 80;
    display: grid;
    place-items: center;
    padding: 1rem;
    background: var(--uiv2-overlay, rgba(0, 0, 0, 0.55));
  }

  .fluo-create-modal {
    width: min(480px, 100%);
    max-height: min(88vh, 720px);
    overflow: auto;
    border-radius: var(--uikit-v2-radius, 8px);
    background: var(--uiv2-panel-bg, var(--color-surface, #1c1c1e));
    border: 1px solid var(--uiv2-panel-border, var(--color-border, #333));
    box-shadow: var(--uiv2-panel-shadow, 0 16px 48px rgba(0, 0, 0, 0.45));
  }

  .fluo-create-modal__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem 1rem 0.5rem;
  }

  .fluo-create-modal__head h2 {
    margin: 0;
    font-size: 1.15rem;
  }

  .fluo-create-modal__close {
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    border: none;
    border-radius: var(--uikit-v2-radius, 8px);
    background: transparent;
    color: inherit;
    cursor: pointer;
  }

  .fluo-create-modal__close:hover {
    background: var(--uiv2-surface-subtle, rgba(255, 255, 255, 0.08));
  }

  .fluo-create-modal__close:focus-visible {
    outline: 2px solid var(--uikit-v2-accent, var(--color-accent));
    outline-offset: 1px;
  }

  .fluo-create-modal__body {
    display: flex;
    flex-direction: column;
    gap: 0.85rem;
    padding: 0.5rem 1rem 1rem;
  }

  .fluo-create-modal__hint {
    margin: 0;
    font-size: 0.875rem;
    color: var(--uikit-v2-danger, var(--color-error, #f07178));
  }

  .fluo-create-modal__foot {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    padding: 0 1rem 1rem;
  }
</style>
