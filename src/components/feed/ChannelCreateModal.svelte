<script lang="ts">
  import { untrack } from 'svelte';
  import { fade, scale } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { portal } from '../../actions/portal';
  import UiV2Button from '../uikit-v2/UiV2Button.svelte';
  import UiV2OutlinedField from '../uikit-v2/UiV2OutlinedField.svelte';
  import { showToast } from '../../stores/toast';
  import { iconX } from '../icons';

  type Props = {
    open: boolean;
    onClose: () => void;
    onCreated?: (channelId: number) => void | Promise<void>;
  };

  let { open, onClose, onCreated }: Props = $props();

  let title = $state('');
  let description = $state('');
  let commenting = $state(true);
  let suggestions = $state(true);
  let busy = $state(false);
  let localHint = $state('');

  const titleOk = $derived(title.trim().length >= 10 && title.trim().length <= 60);
  const descOk = $derived(description.trim().length >= 10 && description.trim().length <= 60);
  const canSubmit = $derived(titleOk && descOk && !busy);

  $effect(() => {
    if (!open) {
      untrack(() => {
        title = '';
        description = '';
        commenting = true;
        suggestions = true;
        busy = false;
        localHint = '';
      });
    }
  });

  function onWindowKeydown(e: KeyboardEvent) {
    if (!open) return;
    if (e.key === 'Escape' && !busy) {
      e.preventDefault();
      onClose();
    }
  }

  function errorForCode(code: number): string {
    switch (code) {
      case 2:
        return 'Неверное название канала: минимум 10 и максимум 60 символов.';
      case 3:
        return 'Неверное описание канала: минимум 10 и максимум 60 символов.';
      case 4:
        return 'Вы превысили допустимый еженедельный лимит по созданию каналов.';
      case 7:
        return 'Создание каналов временно недоступно для вашего аккаунта.';
      default:
        return `Не удалось создать канал (код ${code})`;
    }
  }

  async function submit() {
    if (!canSubmit) {
      if (!titleOk) localHint = 'Название: от 10 до 60 символов';
      else if (!descOk) localHint = 'Описание: от 10 до 60 символов';
      return;
    }
    const api = window.anixApi?.channel;
    if (!api?.create) {
      showToast('Создание канала недоступно', 'err');
      return;
    }
    busy = true;
    localHint = '';
    try {
      const res = await api.create({
        title: title.trim(),
        description: description.trim(),
        is_commenting_enabled: commenting,
        is_article_suggestion_enabled: suggestions,
      });
      const code = Number(res?.code ?? 0);
      if (code !== 0) {
        const msg = errorForCode(code);
        localHint = msg;
        showToast(msg, 'err');
        return;
      }
      const id = Number(res?.channel?.id ?? 0);
      showToast('Канал успешно создан', 'ok');
      onClose();
      if (id > 0) await onCreated?.(id);
    } catch (err) {
      const msg = String(err) || 'Не удалось создать канал';
      localHint = msg;
      showToast(msg, 'err');
    } finally {
      busy = false;
    }
  }
</script>

<svelte:window onkeydown={onWindowKeydown} />

{#if open}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div
    class="channel-create-modal"
    role="dialog"
    aria-modal="true"
    aria-labelledby="channel-create-modal-title"
    use:portal
    transition:fade={{ duration: 140 }}
  >
    <button
      type="button"
      class="channel-create-modal__backdrop"
      aria-label="Закрыть"
      disabled={busy}
      onclick={() => { if (!busy) onClose(); }}
    ></button>

    <div
      class="channel-create-modal__panel"
      transition:scale={{ duration: 180, start: 0.96, opacity: 0, easing: cubicOut }}
    >
      <header class="channel-create-modal__head">
        <h2 id="channel-create-modal-title" class="channel-create-modal__title">Создание канала</h2>
        <button
          type="button"
          class="channel-create-modal__close"
          aria-label="Закрыть"
          disabled={busy}
          onclick={onClose}
        >
          {@html iconX(16)}
        </button>
      </header>

      <div class="channel-create-modal__body">
        <UiV2OutlinedField
          label="Название"
          bind:value={title}
          maxlength={60}
          disabled={busy}
          hint={`${title.trim().length}/60 · минимум 10`}
          error={title.length > 0 && !titleOk}
        />
        <UiV2OutlinedField
          label="Описание"
          bind:value={description}
          maxlength={60}
          multiline
          rows={3}
          disabled={busy}
          hint={`${description.trim().length}/60 · минимум 10`}
          error={description.length > 0 && !descOk}
        />

        <label class="channel-create-modal__check">
          <input type="checkbox" bind:checked={commenting} disabled={busy} />
          <span>
            <span class="channel-create-modal__check-title">Комментарии</span>
            <span class="channel-create-modal__check-desc">Разрешить комментарии к записям</span>
          </span>
        </label>
        <label class="channel-create-modal__check">
          <input type="checkbox" bind:checked={suggestions} disabled={busy} />
          <span>
            <span class="channel-create-modal__check-title">Предложения записей</span>
            <span class="channel-create-modal__check-desc">Подписчики смогут предлагать посты</span>
          </span>
        </label>

        {#if localHint}
          <p class="channel-create-modal__hint" role="alert">{localHint}</p>
        {/if}
      </div>

      <footer class="channel-create-modal__foot">
        <UiV2Button
          label={busy ? 'Создание…' : 'Создать канал'}
          variant="primary"
          block
          disabled={!canSubmit}
          onclick={() => void submit()}
        />
      </footer>
    </div>
  </div>
{/if}
