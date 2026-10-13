<script lang="ts">
  import { showToast } from '../stores/toast';
  import UiV2OutlinedField from './uikit-v2/UiV2OutlinedField.svelte';

  interface Props {
    onDone: () => void;
  }

  let { onDone }: Props = $props();

  let busy = $state(false);
  let currentPassword = $state('');
  let newPassword = $state('');
  let repeatPassword = $state('');

  function isValidPassword(value: string): boolean {
    return value.length >= 6 && value.length <= 32;
  }

  function passwordError(code?: number): string {
    switch (code) {
      case 2: return 'Некорректный новый пароль';
      case 3: return 'Неверный текущий пароль';
      default: return 'Не удалось изменить пароль';
    }
  }

  async function submit() {
    if (!isValidPassword(currentPassword)) {
      showToast('Текущий пароль: от 6 до 32 символов', 'err');
      return;
    }
    if (!isValidPassword(newPassword)) {
      showToast('Новый пароль: от 6 до 32 символов', 'err');
      return;
    }
    if (newPassword !== repeatPassword) {
      showToast('Пароли не совпадают', 'err');
      return;
    }
    const api = window.anixApi?.settings;
    if (!api?.changePassword) {
      showToast('Смена пароля недоступна', 'err');
      return;
    }
    busy = true;
    try {
      const res = await api.changePassword({
        current: currentPassword,
        new: newPassword,
      });
      const codeNum = res?.code ?? 0;
      if (codeNum === 0 || codeNum === undefined) {
        showToast('Пароль изменён');
        onDone();
      } else {
        showToast(passwordError(codeNum), 'err');
      }
    } catch {
      showToast('Ошибка при смене пароля', 'err');
    } finally {
      busy = false;
    }
  }
</script>

<div class="profile-panel__edit-form">
  <p class="profile-panel__edit-hint">
    Пароль должен быть от 6 до 32 символов. После смены сессия обновится автоматически.
  </p>
  <UiV2OutlinedField
    label="Текущий пароль"
    type="password"
    autocomplete="current-password"
    revealable
    bind:value={currentPassword}
    disabled={busy}
    spellcheck={false}
  />
  <UiV2OutlinedField
    label="Новый пароль"
    type="password"
    autocomplete="new-password"
    revealable
    bind:value={newPassword}
    disabled={busy}
    spellcheck={false}
  />
  <UiV2OutlinedField
    label="Повторите новый пароль"
    type="password"
    autocomplete="new-password"
    revealable
    bind:value={repeatPassword}
    disabled={busy}
    spellcheck={false}
  />
  <button
    type="button"
    class="profile-panel__edit-save"
    disabled={busy}
    onclick={() => void submit()}
  >
    {busy ? 'Сохранение…' : 'Изменить'}
  </button>
</div>
