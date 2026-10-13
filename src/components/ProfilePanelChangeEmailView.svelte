<script lang="ts">
  import { onDestroy } from 'svelte';
  import { showToast } from '../stores/toast';
  import UiV2OutlinedField from './uikit-v2/UiV2OutlinedField.svelte';

  interface Props {
    emailHint?: string;
    onDone: () => void;
  }

  let { emailHint = '', onDone }: Props = $props();

  type Step = 'form' | 'code';
  let step = $state<Step>('form');
  let busy = $state(false);

  let currentEmail = $state('');
  let currentPassword = $state('');
  let newEmail = $state('');

  let code = $state('');
  let hash = $state('');
  let expiresAt = $state(0);
  let resendLeft = $state(0);
  let resendTimer: ReturnType<typeof setInterval> | null = null;

  $effect(() => {
    if (emailHint && !currentEmail) currentEmail = emailHint;
  });

  function clearResendTimer() {
    if (resendTimer) {
      clearInterval(resendTimer);
      resendTimer = null;
    }
  }

  function startResendCountdown(expires: number) {
    clearResendTimer();
    expiresAt = expires > 0 ? expires : 0;
    const tick = () => {
      const left = Math.max(0, expiresAt - Math.floor(Date.now() / 1000));
      resendLeft = left;
      if (left <= 0) clearResendTimer();
    };
    tick();
    resendTimer = setInterval(tick, 1000);
  }

  onDestroy(clearResendTimer);

  function emailChangeError(code?: number): string {
    switch (code) {
      case 2: return 'Неверный пароль';
      case 3: return 'Неверный текущий Email';
      case 4: return 'Некорректный новый Email';
      case 5: return 'Этот Email уже занят';
      case 6: return 'Код уже отправлен';
      case 7: return 'Не удалось отправить код';
      default: return 'Не удалось начать смену Email';
    }
  }

  function emailResendError(code?: number): string {
    switch (code) {
      case 2: return 'Неверный пароль';
      case 3: return 'Неверный текущий Email';
      case 4: return 'Сессия подтверждения устарела';
      case 5: return 'Не удалось отправить код';
      default: return 'Не удалось отправить код повторно';
    }
  }

  function emailVerifyError(code?: number): string {
    switch (code) {
      case 2: return 'Некорректный Email';
      case 3: return 'Неверный код';
      case 4: return 'Код устарел';
      case 5: return 'Сессия подтверждения устарела';
      case 6: return 'Этот Email уже занят';
      default: return 'Не удалось подтвердить Email';
    }
  }

  async function submitEmail() {
    const cur = currentEmail.trim();
    const neu = newEmail.trim();
    const pass = currentPassword;
    if (!cur || !neu || !pass) {
      showToast('Заполните все поля', 'err');
      return;
    }
    if (pass.length < 6 || pass.length > 32) {
      showToast('Пароль должен быть от 6 до 32 символов', 'err');
      return;
    }
    const api = window.anixApi?.settings;
    if (!api?.changeEmail) {
      showToast('Смена Email недоступна', 'err');
      return;
    }
    busy = true;
    try {
      const res = await api.changeEmail({
        current_email: cur,
        current_password: pass,
        new_email: neu,
      });
      const codeNum = res?.code ?? 0;
      const nextHash = String(res?.hash ?? '').trim();
      // 0 — ок, 6 — код уже отправлен (всё равно открываем шаг кода)
      if ((codeNum === 0 || codeNum === 6) && nextHash) {
        hash = nextHash;
        startResendCountdown(Number(res?.timestamp_expires ?? 0));
        code = '';
        step = 'code';
        if (codeNum === 6) showToast('Код уже отправлен на новый Email');
        else showToast('Код отправлен на новый Email');
      } else {
        showToast(emailChangeError(codeNum), 'err');
      }
    } catch {
      showToast('Ошибка при смене Email', 'err');
    } finally {
      busy = false;
    }
  }

  async function resendCode() {
    if (resendLeft > 0 || busy) return;
    const api = window.anixApi?.settings;
    if (!api?.changeEmailResend || !hash) return;
    busy = true;
    try {
      const res = await api.changeEmailResend({
        new_email: newEmail.trim(),
        current_email: currentEmail.trim(),
        current_password: currentPassword,
        hash,
      });
      const codeNum = res?.code ?? 0;
      if (codeNum === 0 || codeNum === undefined) {
        startResendCountdown(Number(res?.timestamp_expires ?? 0));
        showToast('Код отправлен повторно');
      } else {
        showToast(emailResendError(codeNum), 'err');
      }
    } catch {
      showToast('Не удалось отправить код', 'err');
    } finally {
      busy = false;
    }
  }

  async function verifyCode() {
    const digits = code.trim();
    const n = Number.parseInt(digits, 10);
    if (!digits || !Number.isFinite(n)) {
      showToast('Введите код из письма', 'err');
      return;
    }
    const api = window.anixApi?.settings;
    if (!api?.changeEmailVerify || !hash) return;
    busy = true;
    try {
      const res = await api.changeEmailVerify({
        new_email: newEmail.trim(),
        code: n,
        hash,
      });
      const codeNum = res?.code ?? 0;
      if (codeNum === 0 || codeNum === undefined) {
        showToast('Email изменён');
        onDone();
      } else {
        showToast(emailVerifyError(codeNum), 'err');
      }
    } catch {
      showToast('Ошибка подтверждения', 'err');
    } finally {
      busy = false;
    }
  }
</script>

{#if step === 'form'}
  <div class="profile-panel__edit-form">
    <p class="profile-panel__edit-hint">
      Укажите текущий Email, пароль и новый адрес. На новый Email придёт код подтверждения.
    </p>
    <UiV2OutlinedField
      label="Текущий Email"
      type="email"
      inputmode="email"
      autocomplete="email"
      bind:value={currentEmail}
      disabled={busy}
      spellcheck={false}
    />
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
      label="Новый Email"
      type="email"
      inputmode="email"
      autocomplete="email"
      bind:value={newEmail}
      disabled={busy}
      spellcheck={false}
    />
    <button
      type="button"
      class="profile-panel__edit-save"
      disabled={busy}
      onclick={() => void submitEmail()}
    >
      {busy ? 'Отправка…' : 'Продолжить'}
    </button>
  </div>
{:else}
  <div class="profile-panel__edit-form">
    <p class="profile-panel__edit-hint">
      Код отправлен на <strong>{newEmail.trim()}</strong>. Введите его ниже.
    </p>
    <UiV2OutlinedField
      label="Код из письма"
      type="text"
      inputmode="numeric"
      autocomplete="one-time-code"
      bind:value={code}
      disabled={busy}
      maxlength={8}
      spellcheck={false}
    />
    <button
      type="button"
      class="profile-panel__edit-save"
      disabled={busy}
      onclick={() => void verifyCode()}
    >
      {busy ? 'Проверка…' : 'Подтвердить'}
    </button>
    <button
      type="button"
      class="profile-panel__edit-save profile-panel__edit-save--ghost"
      disabled={busy || resendLeft > 0}
      onclick={() => void resendCode()}
    >
      {#if resendLeft > 0}
        Отправить снова через {resendLeft} с
      {:else}
        Отправить код снова
      {/if}
    </button>
  </div>
{/if}
