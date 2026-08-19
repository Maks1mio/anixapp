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
    if (!password.trim()) { error = 'Введите пароль команды'; return; }
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

<div class="adm-login">
  <div class="adm-login__card">
    <div class="adm-login__icon" aria-hidden="true">🛡</div>
    <h1 class="adm-login__title">Панель управления</h1>
    <p class="adm-login__sub">Введите пароль, выданный основателем или администратором</p>

    <div class="adm-login__account">
      {#if profile?.avatar}
        <span class="adm-login__avatar" style="background-image:url('{profile.avatar}')"></span>
      {:else}
        <span class="adm-login__avatar adm-login__avatar--ph">{login.charAt(0).toUpperCase()}</span>
      {/if}
      <span class="adm-login__account-name">{login}</span>
    </div>

    <form class="adm-login__form" onsubmit={handleSubmit}>
      <div class="adm-login__field">
        <label class="adm-login__label" for="adm-password">Пароль</label>
        <input
          id="adm-password"
          type="password"
          class="adm-login__input"
          autocomplete="current-password"
          bind:value={password}
          disabled={busy}
        />
      </div>
      {#if error}
        <p class="adm-login__error" role="alert">{error}</p>
      {/if}
      <button type="submit" class="uiv2-btn uiv2-btn--primary uiv2-btn--lg adm-login__submit" disabled={busy}>
        {busy ? 'Вход…' : 'Войти'}
      </button>
    </form>
  </div>
</div>

<style lang="scss">
.adm-login {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  padding: 1.5rem;
  background: var(--uikit-v2-bg);
  color: var(--uikit-v2-text);
  font-family: var(--uikit-v2-font);
}

.adm-login__card {
  width: 100%;
  max-width: 22rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
  padding: 2rem 1.75rem;
  border-radius: 20px;
  background: color-mix(in srgb, var(--uikit-v2-surface) 85%, transparent);
  border: 1px solid var(--uiv2-border-subtle);
  box-shadow: var(--uiv2-panel-shadow);
  backdrop-filter: blur(20px);
}

.adm-login__icon {
  font-size: 2.25rem;
  margin-bottom: 0.25rem;
}

.adm-login__title {
  margin: 0;
  font-size: 1.35rem;
  font-weight: 700;
  letter-spacing: -0.01em;
  text-align: center;
}

.adm-login__sub {
  margin: 0;
  font-size: 0.8125rem;
  color: var(--uiv2-fg-muted);
  text-align: center;
  line-height: 1.45;
}

.adm-login__account {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.5rem 0.85rem;
  border-radius: 999px;
  background: var(--uiv2-surface-raised);
  margin: 0.25rem 0;
}

.adm-login__avatar {
  width: 1.75rem;
  height: 1.75rem;
  border-radius: 50%;
  flex-shrink: 0;
  background-size: cover;
  background-position: center;
  background-color: var(--uiv2-hover-bg);

  &--ph {
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.7rem;
    font-weight: 700;
    color: var(--uiv2-fg-muted);
  }
}

.adm-login__account-name {
  font-size: 0.875rem;
  font-weight: 600;
}

.adm-login__form {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin-top: 0.5rem;
}

.adm-login__field {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.adm-login__label {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--uiv2-fg-muted);
}

.adm-login__input {
  width: 100%;
  box-sizing: border-box;
  padding: 0.6rem 0.8rem;
  border: 1px solid var(--uiv2-border-strong);
  border-radius: 10px;
  background: var(--uiv2-hover-subtle);
  color: var(--uikit-v2-text);
  font: inherit;
  font-size: 0.9375rem;
  outline: none;
  transition: border-color 0.15s ease;

  &:focus {
    border-color: var(--uikit-v2-accent);
    background: transparent;
  }
}

.adm-login__error {
  margin: 0;
  padding: 0.5rem 0.7rem;
  border-radius: 8px;
  font-size: 0.8125rem;
  color: var(--uikit-v2-danger);
  background: color-mix(in srgb, var(--uikit-v2-danger) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--uikit-v2-danger) 25%, transparent);
}

.adm-login__submit {
  width: 100%;
  justify-content: center;
}
</style>
