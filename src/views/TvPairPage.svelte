<script lang="ts">
  /**
   * Страница пары для телефона: открывается по QR с ТВ (tv.anixapp.com/?ref=…).
   * Логин/пароль уходят на телевизор через серверную пару, после чего телефон
   * редиректится на anixapp.com.
   */
  import { submitTvPairCredentials } from '../services/tv-pair-login';

  interface Props {
    ref: string;
  }

  let { ref }: Props = $props();

  const REDIRECT_URL = 'https://anixapp.com';

  let login = $state('');
  let password = $state('');
  let busy = $state(false);
  let done = $state(false);
  let error = $state('');

  async function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    if (busy || done) return;
    const user = login.trim();
    if (!user || !password) {
      error = 'Заполните почту или никнейм и пароль.';
      return;
    }
    busy = true;
    error = '';
    try {
      const res = await submitTvPairCredentials(ref, user, password);
      if (!res.ok) {
        error = res.error === 'pair_expired'
          ? 'Ссылка устарела — обновите QR на телевизоре и отсканируйте заново.'
          : 'Не удалось передать данные на телевизор. Проверьте сеть и попробуйте ещё раз.';
        return;
      }
      done = true;
      // Не критично: если вход в этом браузере не удался, ТВ всё равно войдёт сам.
      try {
        await window.anixApi?.auth?.signIn?.(user, password);
      } catch { /* ignore */ }
      window.setTimeout(() => {
        window.location.href = REDIRECT_URL;
      }, 1600);
    } catch (err) {
      error = String((err as Error)?.message || err);
    } finally {
      busy = false;
    }
  }
</script>

<div class="tv-pair">
  <form class="tv-pair__card" onsubmit={handleSubmit}>
    <h1 class="tv-pair__title">AnixApp на телевизоре</h1>

    {#if done}
      <p class="tv-pair__done">Готово! Телевизор входит в аккаунт.</p>
      <p class="tv-pair__hint">
        Сейчас откроется anixapp.com — можно вернуться к нему.<br />
        Если страница не открылась, <a href={REDIRECT_URL}>нажмите сюда</a>.
      </p>
    {:else}
      <p class="tv-pair__hint">
        Войдите — телевизор получит сессию сам, вводить логин на ТВ не нужно.
      </p>

      {#if error}
        <p class="tv-pair__error">{error}</p>
      {/if}

      <label class="tv-pair__field">
        <span>Почта или никнейм</span>
        <input
          type="text"
          name="login"
          autocomplete="username"
          inputmode="email"
          bind:value={login}
          disabled={busy}
          required
        />
      </label>

      <label class="tv-pair__field">
        <span>Пароль</span>
        <input
          type="password"
          name="password"
          autocomplete="current-password"
          bind:value={password}
          disabled={busy}
          required
        />
      </label>

      <button class="tv-pair__submit" type="submit" disabled={busy}>
        {busy ? 'Отправляю…' : 'Войти на телевизоре'}
      </button>
    {/if}
  </form>
</div>

<style>
  .tv-pair {
    min-height: 100vh;
    min-height: 100dvh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1.25rem;
    box-sizing: border-box;
    background: var(--color-bg, #0d0d0d);
    color: var(--color-text, #c2c2c2);
  }

  .tv-pair__card {
    width: min(24rem, 100%);
    display: grid;
    gap: 0.85rem;
    padding: 1.5rem 1.4rem 1.6rem;
    border-radius: 1.1rem;
    background: var(--color-surface, #1a1a1a);
    border: 1px solid var(--color-border, #212121);
    box-shadow: 0 18px 48px rgba(0, 0, 0, 0.35);
  }

  .tv-pair__title {
    margin: 0;
    font-size: 1.35rem;
    font-weight: 700;
    color: #fff;
  }

  .tv-pair__hint {
    margin: 0;
    font-size: 0.92rem;
    line-height: 1.45;
    color: var(--color-text-muted, #8f8f8f);
  }

  .tv-pair__hint a {
    color: var(--color-accent, #e35454);
    text-decoration: none;
  }

  .tv-pair__error {
    margin: 0;
    padding: 0.7rem 0.85rem;
    border-radius: 0.6rem;
    background: rgba(239, 68, 68, 0.14);
    color: #ffb4b4;
    font-size: 0.9rem;
    line-height: 1.4;
  }

  .tv-pair__done {
    margin: 0;
    padding: 0.85rem 1rem;
    border-radius: 0.7rem;
    background: rgba(34, 197, 94, 0.14);
    color: #86efac;
    font-size: 1rem;
    font-weight: 600;
  }

  .tv-pair__field {
    display: grid;
    gap: 0.35rem;
    font-size: 0.82rem;
    color: var(--color-text-muted, #8f8f8f);
  }

  .tv-pair__field input {
    height: 2.8rem;
    padding: 0 0.9rem;
    border-radius: 0.65rem;
    border: 1px solid var(--color-border, #2a2a2a);
    background: rgba(255, 255, 255, 0.04);
    color: #fff;
    font-size: 1rem;
  }

  .tv-pair__field input:focus-visible {
    outline: 2px solid var(--color-accent, #e35454);
    outline-offset: 1px;
  }

  .tv-pair__submit {
    margin-top: 0.25rem;
    height: 3rem;
    border: 0;
    border-radius: 999px;
    background: var(--color-accent, #e35454);
    color: #fff;
    font-size: 1rem;
    font-weight: 700;
    cursor: pointer;
  }

  .tv-pair__submit:disabled {
    opacity: 0.6;
    cursor: default;
  }
</style>
