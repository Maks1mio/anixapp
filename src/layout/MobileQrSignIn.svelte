<script lang="ts">
  /**
   * «Вход по QR» на телефоне: разрешить вход на другом устройстве, как в Anixart 11+.
   * Сканер читает ссылку с экрана устройства, дальше — проверка устройства и его PIN-кода.
   */
  import { onMount } from 'svelte';
  import UiV2OutlinedField from '../components/uikit-v2/UiV2OutlinedField.svelte';
  import { scanQrSignIn } from '../native/anix-qr';
  import { formatAnixError } from '../native/anix-errors';

  // Коды ответа auth/qr/* (QrAuthResult в anixapi)
  const CODE_OK = 0;
  const CODE_EXPIRED = 2;
  const CODE_DECLINED = 3;
  const CODE_TOO_MANY_ATTEMPTS = 4;
  const CODE_PIN_INVALID = 5;
  const CODE_TOO_MANY_REQUESTS = 6;
  const PIN_LENGTH = 4;

  type View = 'start' | 'loading' | 'confirm' | 'result';
  type Result = { title: string; text: string };

  let view = $state<View>('start');
  let startMessage = $state('');
  let key = $state('');
  let device = $state('');
  let pin = $state('');
  let pinError = $state('');
  let result = $state<Result | null>(null);
  let busy = $state(false);

  const login = (window as { __anixProfile?: { login?: string } }).__anixProfile?.login ?? '';

  const RESULTS: Record<string, Result> = {
    confirmed: { title: 'Вход подтверждён', text: 'Теперь можно возвращаться к устройству.' },
    declined: { title: 'Вход отклонён', text: 'Устройство не получит доступа к вашему профилю.' },
    expired: { title: 'QR-код устарел', text: 'Откройте на устройстве вход по QR-коду и отсканируйте новый код.' },
    blocked: { title: 'Слишком много попыток', text: 'Код введён неверно несколько раз. Отсканируйте новый QR-код с экрана устройства.' },
    throttled: { title: 'Слишком много запросов', text: 'Попробуйте через несколько минут.' },
    failed: { title: 'Не удалось загрузить', text: 'Проверьте подключение к интернету и попробуйте ещё раз.' },
  };

  function showResult(id: keyof typeof RESULTS) {
    result = RESULTS[id];
    view = 'result';
  }

  /** Ответы, которые заканчивают сессию: одинаковы для open, confirm и decline. */
  function finishByCode(code: number | undefined): boolean {
    if (code === CODE_EXPIRED) showResult('expired');
    else if (code === CODE_DECLINED) showResult('declined');
    else if (code === CODE_TOO_MANY_ATTEMPTS) showResult('blocked');
    else if (code === CODE_TOO_MANY_REQUESTS) showResult('throttled');
    else return false;
    return true;
  }

  async function scan() {
    startMessage = '';
    view = 'start';
    const scanned = await scanQrSignIn();
    if (scanned.denied) {
      startMessage = 'Нет доступа к камере. Разрешите его приложению в настройках телефона.';
      return;
    }
    if (!scanned.key) return;

    key = scanned.key;
    pin = '';
    pinError = '';
    view = 'loading';
    try {
      const res = await window.anixApi?.auth?.qrOpen?.(key);
      if (finishByCode(res?.code)) return;
      if (res?.code !== CODE_OK) {
        showResult('failed');
        return;
      }
      device = res?.device?.trim() || 'Неизвестное устройство';
      view = 'confirm';
    } catch {
      showResult('failed');
    }
  }

  async function confirm(e: SubmitEvent) {
    e.preventDefault();
    const code = pin.trim();
    if (code.length !== PIN_LENGTH) {
      pinError = 'Введите все 4 цифры кода';
      return;
    }
    busy = true;
    pinError = '';
    try {
      const res = await window.anixApi?.auth?.qrConfirm?.({ key, pin: code });
      if (res?.code === CODE_OK) showResult('confirmed');
      else if (res?.code === CODE_PIN_INVALID) {
        const left = res?.attempts_left;
        pinError = left != null ? `Неверный код. Осталось попыток: ${left}` : 'Неверный код';
      } else if (!finishByCode(res?.code)) showResult('failed');
    } catch (err) {
      pinError = formatAnixError(err);
    } finally {
      busy = false;
    }
  }

  async function decline() {
    busy = true;
    try {
      await window.anixApi?.auth?.qrDecline?.(key);
      showResult('declined');
    } catch {
      showResult('failed');
    } finally {
      busy = false;
    }
  }

  onMount(() => {
    void scan();
  });
</script>

<div class="m-qr">
  {#if view === 'start'}
    <p class="m-qr__text">
      Откройте на другом устройстве вход по QR-коду и наведите на него камеру телефона. Подтвердить вход можно будет
      кодом с его экрана.
    </p>
    {#if startMessage}<p class="m-qr__error" role="alert">{startMessage}</p>{/if}
    <button type="button" class="uiv2-btn uiv2-btn--lg uiv2-btn--primary uiv2-btn--block m-qr__action" onclick={() => void scan()}>
      <span class="uiv2-btn__label">Сканировать QR-код</span>
    </button>

  {:else if view === 'loading'}
    <p class="m-qr__text" role="status">Проверяю QR-код…</p>

  {:else if view === 'confirm'}
    <h2 class="m-qr__title">Войти на другом устройстве?</h2>
    <p class="m-qr__device">{device}</p>
    {#if login}<p class="m-qr__text">Устройство войдёт в профиль {login}</p>{/if}
    <form onsubmit={confirm}>
      <UiV2OutlinedField
        label="Код с экрана устройства"
        bind:value={pin}
        inputmode="numeric"
        autocomplete="one-time-code"
        maxlength={PIN_LENGTH}
        disabled={busy}
      />
      {#if pinError}<p class="m-qr__error" role="alert">{pinError}</p>{/if}
      <p class="m-qr__note">Вводите код, только если сами видите его на своём устройстве. Никому его не сообщайте.</p>
      <button type="submit" class="uiv2-btn uiv2-btn--lg uiv2-btn--primary uiv2-btn--block m-qr__action" disabled={busy}>
        <span class="uiv2-btn__label">Разрешить вход</span>
      </button>
      <button type="button" class="uiv2-btn uiv2-btn--lg uiv2-btn--chrome uiv2-btn--block m-qr__action" disabled={busy} onclick={() => void decline()}>
        <span class="uiv2-btn__label">Отклонить</span>
      </button>
    </form>

  {:else if result}
    <h2 class="m-qr__title">{result.title}</h2>
    <p class="m-qr__text">{result.text}</p>
    <button type="button" class="uiv2-btn uiv2-btn--lg uiv2-btn--chrome uiv2-btn--block m-qr__action" onclick={() => void scan()}>
      <span class="uiv2-btn__label">Сканировать ещё раз</span>
    </button>
  {/if}
</div>

<style lang="scss">
  .m-qr {
    --uikit-v2-surface: var(--m-bg);
    --uikit-v2-text: var(--m-text);
    --uikit-v2-muted: var(--m-text-2);

    display: flex;
    flex-direction: column;
    max-width: 26rem;
    margin: 0 auto;
    padding: var(--m-space-4);
  }

  .m-qr__title {
    margin: 0 0 var(--m-space-2);
    color: var(--m-text);
    font: 700 22px/1.25 var(--m-font);
  }

  .m-qr__device {
    margin: 0 0 var(--m-space-1);
    color: var(--m-text);
    font-size: 16px;
    font-weight: 600;
  }

  .m-qr__text {
    margin: 0 0 var(--m-space-4);
    color: var(--m-text-2);
    font-size: 15px;
    line-height: 1.4;
  }

  .m-qr__note {
    margin: var(--m-space-3) 0 var(--m-space-2);
    color: var(--m-text-2);
    font-size: 13px;
    line-height: 1.4;
  }

  .m-qr__error {
    margin: var(--m-space-2) 0 0;
    color: var(--color-error, #e55353);
    font-size: 14px;
    line-height: 1.4;
  }

  .m-qr__action {
    min-height: 52px;
    margin-top: var(--m-space-3);
    border-radius: var(--m-radius-pill);
  }
</style>
