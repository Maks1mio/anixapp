<script lang="ts">
  import { fade, scale } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { portal } from '../../actions/portal';
  import UiV2Button from '../uikit-v2/UiV2Button.svelte';
  import UiV2OutlinedField from '../uikit-v2/UiV2OutlinedField.svelte';
  import BadgeTile from './BadgeTile.svelte';
  import type { ApiBadge } from '../../types/api';
  import { resolveJacksonRefs } from '../../utils/jackson-refs';

  interface Props {
    onClose: () => void;
    /** Значок получен — перезагрузить коллекцию */
    onClaimed?: (badge: ApiBadge | null) => void;
  }

  let { onClose, onClaimed }: Props = $props();

  type Stage = 'input' | 'preview' | 'done';

  let stage = $state<Stage>('input');
  let code = $state('');
  let busy = $state(false);
  let error = $state('');
  let preview = $state<{ name: string; badge: ApiBadge | null } | null>(null);

  const titleId = `badge-claim-${Math.random().toString(36).slice(2, 8)}`;
  const trimmed = $derived(code.trim());

  // Коды AchievementResponse (Anixart 10.5)
  const CLAIM_ERRORS: Record<number, string> = {
    2: 'Этот значок уже есть в вашей коллекции.',
    3: 'Код неверный или больше не действует. Проверьте его и попробуйте ещё раз.',
    4: 'Войдите в профиль, чтобы получить значок.',
    5: 'Достигнут лимит получения значка по этому коду.',
    6: 'Значок по этому коду изменился. Нажмите «Продолжить», чтобы проверить его снова.',
  };

  async function checkCode() {
    const api = window.anixApi?.settings;
    if (!trimmed || busy || !api?.previewBadgeCode) return;
    busy = true;
    error = '';
    try {
      const res = resolveJacksonRefs(await api.previewBadgeCode(trimmed)) as Awaited<
        ReturnType<NonNullable<typeof api.previewBadgeCode>>
      >;
      const badge = res?.achievement?.badge ?? null;
      if (res?.code !== 0 || !badge) {
        error = res?.code === 3 || !res?.achievement
          ? CLAIM_ERRORS[3]
          : 'Не удалось проверить код. Попробуйте ещё раз.';
        return;
      }
      preview = { name: res.achievement?.name?.trim() || badge.name?.trim() || 'Значок', badge };
      stage = 'preview';
    } catch {
      error = 'Не удалось проверить код. Попробуйте ещё раз.';
    } finally {
      busy = false;
    }
  }

  async function claim() {
    const api = window.anixApi?.settings;
    const badgeId = Number(preview?.badge?.id);
    if (busy || !api?.claimBadgeCode || !badgeId) return;
    busy = true;
    error = '';
    try {
      const res = await api.claimBadgeCode(trimmed, badgeId);
      if (res?.code === 0) {
        stage = 'done';
        onClaimed?.(preview?.badge ?? null);
        return;
      }
      if (res?.code === 6) {
        // Значок за кодом сменился — заново проверить
        stage = 'input';
        preview = null;
      }
      error = CLAIM_ERRORS[res?.code ?? -1] ?? 'Не удалось получить значок. Проверьте код и попробуйте ещё раз.';
    } catch {
      error = 'Не удалось получить значок. Проверьте код и попробуйте ещё раз.';
    } finally {
      busy = false;
    }
  }

  function editCode() {
    stage = 'input';
    preview = null;
    error = '';
  }

  function onWindowKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') onClose();
  }
</script>

<svelte:window onkeydown={onWindowKeydown} />

<div class="uiv2-choice-sheet" role="dialog" aria-modal="true" aria-labelledby={titleId} use:portal>
  <button
    type="button"
    class="uiv2-choice-sheet__backdrop"
    aria-label="Закрыть"
    onclick={onClose}
    transition:fade={{ duration: 160 }}
  ></button>

  <div
    class="uiv2-choice-sheet__panel uiv2-choice-sheet__panel--form badge-claim"
    transition:scale={{ duration: 220, start: 0.94, easing: cubicOut }}
  >
    <h3 id={titleId} class="uiv2-choice-sheet__title">Получить по коду</h3>

    {#if stage === 'input'}
      <p class="badge-claim__hint">Введите код, чтобы получить значок в профиль</p>
      <form
        class="badge-claim__form"
        onsubmit={(e) => {
          e.preventDefault();
          void checkCode();
        }}
      >
        <UiV2OutlinedField
          label="Код значка"
          bind:value={code}
          autocomplete="off"
          spellcheck={false}
          maxlength={64}
          disabled={busy}
          error={!!error}
          hint={error || undefined}
          hintTone={error ? 'error' : undefined}
        />
        <UiV2Button
          label={busy ? 'Проверяем…' : 'Продолжить'}
          size="lg"
          block
          variant="primary"
          disabled={busy || !trimmed}
          onclick={() => void checkCode()}
        />
      </form>
    {:else if stage === 'preview' && preview}
      <div class="badge-claim__preview">
        {#if preview.badge}
          <div class="badge-claim__tile">
            <BadgeTile badge={preview.badge} compact />
          </div>
        {/if}
        <span class="badge-claim__name">{preview.name}</span>
        {#if preview.badge?.is_available === false}
          <span class="badge-claim__warn">Сейчас недоступен для получения</span>
        {/if}
      </div>
      {#if error}
        <p class="badge-claim__error" role="alert">{error}</p>
      {/if}
      <UiV2Button
        label={busy ? 'Получаем…' : 'Получить'}
        size="lg"
        block
        variant="primary"
        disabled={busy}
        onclick={() => void claim()}
      />
      <UiV2Button label="Ввести другой код" size="lg" block variant="chrome" disabled={busy} onclick={editCode} />
    {:else}
      <div class="badge-claim__preview">
        {#if preview?.badge}
          <div class="badge-claim__tile">
            <BadgeTile badge={preview.badge} compact />
          </div>
        {/if}
        <span class="badge-claim__name">{preview?.name}</span>
        <p class="badge-claim__hint">Значок добавлен в вашу коллекцию</p>
      </div>
    {/if}

    <UiV2Button label={stage === 'done' ? 'Готово' : 'Отмена'} size="lg" block variant="ghost" onclick={onClose} />
  </div>
</div>

<style lang="scss">
  .badge-claim__hint {
    margin: 0;
    color: var(--uiv2-fg-muted);
    font-size: 0.84rem;
    line-height: 1.4;
  }

  .badge-claim__form {
    display: flex;
    flex-direction: column;
    gap: 0.55rem;
  }

  .badge-claim__preview {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.45rem;
    padding: 0.4rem 0;
    text-align: center;
  }

  .badge-claim__tile {
    width: 6rem;
  }

  .badge-claim__name {
    color: var(--uiv2-fg-strong);
    font-size: 1rem;
    font-weight: 700;
  }

  .badge-claim__warn,
  .badge-claim__error {
    margin: 0;
    color: var(--uiv2-choice-warning-fg);
    font-size: 0.8rem;
    line-height: 1.35;
  }
</style>
