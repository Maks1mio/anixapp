<script lang="ts">
  import { openSettingsModal } from '../stores/modals';

  interface Props {
    onSuccess: () => void;
    /** Закрыть оверлей без входа (гость) */
    onDismiss?: () => void;
    /** Показать «Продолжить без входа» */
    allowGuest?: boolean;
    /** Компактный оверлей поверх приложения */
    overlay?: boolean;
  }

  let { onSuccess, onDismiss, allowGuest = false, overlay = false }: Props = $props();

  let login = $state('');
  let password = $state('');
  let errorText = $state('');
  let isSubmitting = $state(false);

  const hasApi = typeof window !== 'undefined' && !!window.anixApi;

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault();
    if (!login.trim() || !password) return;
    if (!window.anixApi) return;

    errorText = '';
    isSubmitting = true;

    try {
      const result = await window.anixApi.auth.signIn(login.trim(), password);
      if (result?.success) {
        onSuccess();
        return;
      }
      const code = result?.code ?? -1;
      if (code === 401 || code === 2 || code === 3) errorText = 'Неверный логин или пароль.';
      else if (code === 402) errorText = 'Аккаунт заблокирован.';
      else if (code === 403) errorText = 'Аккаунт заблокирован навсегда.';
      else errorText = `Ошибка входа (код ${code}).`;
    } catch (err) {
      errorText = `Ошибка: ${String(err)}`;
    } finally {
      isSubmitting = false;
    }
  }
</script>

<div class="view view-auth" class:view-auth--overlay={overlay} class:view-auth--fullscreen={!overlay}>
  {#if !overlay}
    <div class="titlebar">
      <div class="titlebar__menu">
        <button
          type="button"
          class="titlebar__menu-item"
          aria-label="Настройки"
          onclick={() => openSettingsModal()}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
          </svg>
        </button>
      </div>
    </div>
  {/if}

  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div
    class="view-auth__body"
    onclick={(e) => {
      if (overlay && e.target === e.currentTarget) onDismiss?.();
    }}
  >
    <div class="auth" role={overlay ? 'dialog' : undefined} aria-modal={overlay || undefined} aria-label="Вход">
      {#if overlay && onDismiss}
        <button type="button" class="auth__close" aria-label="Закрыть" onclick={() => onDismiss?.()}>×</button>
      {/if}
      <h1 class="auth__title">AnixApp</h1>
      <p class="auth__subtitle">
        {#if overlay}
          Войдите, чтобы открыть этот раздел. Используйте аккаунт Anixart, чтобы войти.
        {:else}
          Используйте аккаунт Anixart, чтобы войти
        {/if}
      </p>

      {#if !hasApi}
        <p class="auth-form__error">API недоступно. Запустите <code>npm run electron:dev</code>.</p>
      {:else}
        <form class="auth-form" onsubmit={handleSubmit}>
          <label class="auth-form__label">
            <span>Логин</span>
            <input
              type="text"
              class="auth-form__input"
              autocomplete="username"
              required
              disabled={isSubmitting}
              bind:value={login}
            />
          </label>
          <label class="auth-form__label">
            <span>Пароль</span>
            <input
              type="password"
              class="auth-form__input"
              autocomplete="current-password"
              required
              disabled={isSubmitting}
              bind:value={password}
            />
          </label>
          {#if errorText}
            <p class="auth-form__error" role="alert">{errorText}</p>
          {/if}
          <button
            type="submit"
            class="btn btn-primary auth-form__submit"
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Вход…' : 'Войти'}
          </button>

          {#if allowGuest && onDismiss}
            <button
              type="button"
              class="btn auth-form__guest"
              disabled={isSubmitting}
              onclick={() => onDismiss?.()}
            >
              Продолжить без входа
            </button>
          {/if}
        </form>
      {/if}
    </div>
  </div>
</div>
