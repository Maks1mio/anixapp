<script lang="ts">
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import { navigate } from '../../stores/navigation';
  import { adminMode, unlockAdmin } from '../../stores/admin';

  const profile = (window as any).__anixProfile as { id?: number; login?: string; avatar?: string | null } | undefined;
  const login = profile?.login ?? '—';

  let password = $state('');
  let busy = $state(false);
  let error = $state('');

  onMount(() => {
    if (get(adminMode)) navigate('/admin/panel');
  });

  async function handleSubmit(e: Event) {
    e.preventDefault();
    if (busy) return;
    if (!password.trim()) {
      error = 'Введите пароль команды';
      return;
    }
    busy = true;
    error = '';
    try {
      await unlockAdmin(password);
      navigate('/admin/panel');
    } catch (err) {
      error = err instanceof Error ? err.message : 'Ошибка входа';
    } finally {
      busy = false;
    }
  }
</script>

<div class="admin-login view">
  <div class="admin-login__inner">
    <div class="auth">
      <h1 class="auth__title">Команда</h1>
      <p class="auth__subtitle">Вход в панель управления</p>

      <div class="admin-login__account">
        {#if profile?.avatar}
          <span class="admin-login__avatar" style="background-image: url('{profile.avatar}')"></span>
        {/if}
        <div>
          <div class="admin-login__login">{login}</div>
          <div class="admin-login__hint">
            Введите пароль, выданный основателем или администратором
          </div>
        </div>
      </div>

      <form class="auth-form" onsubmit={handleSubmit}>
        <label class="auth-form__label">
          <span>Пароль</span>
          <input
            type="password"
            class="auth-form__input"
            autocomplete="current-password"
            bind:value={password}
          />
        </label>
        {#if error}
          <p class="auth-form__error">{error}</p>
        {/if}
        <button type="submit" class="btn btn-primary auth-form__submit" disabled={busy}>
          {busy ? 'Вход…' : 'Войти'}
        </button>
      </form>
    </div>
  </div>
</div>
