<script lang="ts">
  import { onDestroy, onMount, tick } from 'svelte';
  import { fade, scale } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { requireAuth } from '../../../stores/auth';
  import { openProfilePanel } from '../../../stores/profile-panel';
  import { iconMoreVertical, iconX } from '../../../components/icons';
  import { portal } from '../../../actions/portal';
  import UserAvatar from '../../../components/UserAvatar.svelte';
  import UiV2RoundButton from '../../../components/uikit-v2/UiV2RoundButton.svelte';
  import UiV2Button from '../../../components/uikit-v2/UiV2Button.svelte';
  import UiV2OutlinedField from '../../../components/uikit-v2/UiV2OutlinedField.svelte';

  interface Props {
    releaseId: number;
  }

  type SelfProfile = { id: number; login: string; avatar: string | null };

  let { releaseId }: Props = $props();

  let dialogOpen = $state(false);
  let bannerUrl = $state('');
  let trailerUrl = $state('');
  let anonymous = $state(false);
  let busy = $state(false);
  let errorMsg = $state('');
  let successMsg = $state('');
  let remaining = $state<number | null>(null);
  let quotaLimit = $state(30);
  let banned = $state(false);
  let selfProfile = $state<SelfProfile | null>(null);

  const filledCount = $derived((bannerUrl.trim() ? 1 : 0) + (trailerUrl.trim() ? 1 : 0));
  const fieldsDisabled = $derived(busy || banned);

  function readSelfProfile(): SelfProfile | null {
    const raw = (window as {
      __anixProfile?: { id?: number; login?: string; avatar?: string | null };
    }).__anixProfile;
    const id = Number(raw?.id ?? 0);
    if (!Number.isFinite(id) || id <= 0) return null;
    return {
      id,
      login: String(raw?.login ?? '').trim() || `ID ${id}`,
      avatar: raw?.avatar ? String(raw.avatar) : null,
    };
  }

  async function loadQuota(): Promise<void> {
    const quotaFn = window.anixApi?.kitsu?.suggestionQuota;
    if (!quotaFn) return;
    try {
      const result = await quotaFn();
      if (result?.banned) {
        banned = true;
        remaining = 0;
        return;
      }
      banned = false;
      if (result?.ok && typeof result.remaining === 'number') {
        remaining = result.remaining;
        if (typeof result.limit === 'number' && result.limit > 0) quotaLimit = result.limit;
      }
    } catch {
      /* keep previous */
    }
  }

  function focusTrigger(): void {
    const btn = document.querySelector('.release-suggest .uiv2-round-btn') as HTMLButtonElement | null;
    btn?.focus();
  }

  async function openDialog(): Promise<void> {
    if (!requireAuth()) return;
    dialogOpen = true;
    bannerUrl = '';
    trailerUrl = '';
    anonymous = false;
    errorMsg = '';
    successMsg = '';
    banned = false;
    selfProfile = readSelfProfile();
    void loadQuota();
    await tick();
    document.getElementById('release-suggest-banner')?.focus();
  }

  function closeDialog(): void {
    if (busy) return;
    dialogOpen = false;
    bannerUrl = '';
    trailerUrl = '';
    errorMsg = '';
    focusTrigger();
  }

  function openSelfProfile(): void {
    if (!selfProfile) return;
    const id = selfProfile.id;
    const login = selfProfile.login;
    closeDialog();
    openProfilePanel(id, { login });
  }

  function onWindowKeydown(e: KeyboardEvent) {
    if (e.key !== 'Escape' || !dialogOpen) return;
    e.preventDefault();
    closeDialog();
  }

  let onProfileUpdated: (() => void) | null = null;

  onMount(() => {
    onProfileUpdated = () => {
      selfProfile = readSelfProfile();
    };
    window.addEventListener('anix:profileUpdated', onProfileUpdated);
  });

  onDestroy(() => {
    if (onProfileUpdated) window.removeEventListener('anix:profileUpdated', onProfileUpdated);
  });

  async function submit(): Promise<void> {
    if (!requireAuth()) return;
    const banner = bannerUrl.trim();
    const trailer = trailerUrl.trim();
    if (banned) {
      errorMsg = 'Вам запрещено предлагать обложки и видео.';
      return;
    }
    if (!banner && !trailer) {
      errorMsg = 'Укажите ссылку на баннер, трейлер или оба';
      return;
    }
    if (remaining != null && filledCount > remaining) {
      errorMsg = `Сегодня осталось ${remaining} из ${quotaLimit}. Одно поле = 1 запрос.`;
      return;
    }

    const submitFn = window.anixApi?.kitsu?.submitSuggestion;
    if (!submitFn) {
      errorMsg = 'Отправка недоступна в этой сборке. Обновите приложение.';
      return;
    }

    busy = true;
    errorMsg = '';
    successMsg = '';
    try {
      const result = await submitFn({
        anixartId: releaseId,
        bannerUrl: banner || undefined,
        trailerUrl: trailer || undefined,
        anonymous,
      });
      if (!result?.ok) {
        if (result?.banned) {
          banned = true;
          remaining = 0;
        }
        errorMsg = result?.error || 'Не удалось отправить предложение';
        return;
      }
      if (typeof result.remaining === 'number') remaining = result.remaining;
      const sent = [banner && 'баннер', trailer && 'трейлер'].filter(Boolean).join(' и ');
      successMsg = remaining != null
        ? `Отправлено: ${sent}. Осталось ${remaining} из ${quotaLimit}.`
        : `Отправлено: ${sent}.`;
      bannerUrl = '';
      trailerUrl = '';
    } catch (e) {
      errorMsg = e instanceof Error ? e.message : 'Ошибка сети';
    } finally {
      busy = false;
    }
  }
</script>

<svelte:window onkeydown={onWindowKeydown} />

<div class="release-suggest">
  <UiV2RoundButton
    size="sm"
    label="Предложить баннер или трейлер"
    title="Предложить баннер или трейлер"
    ariaHaspopup="dialog"
    ariaExpanded={dialogOpen}
    onclick={() => void openDialog()}
  >
    {@html iconMoreVertical(16)}
  </UiV2RoundButton>
</div>

{#if dialogOpen}
  <div
    class="uiv2-choice-sheet"
    role="dialog"
    aria-modal="true"
    aria-labelledby="release-suggest-title"
    use:portal
  >
    <button
      type="button"
      class="uiv2-choice-sheet__backdrop"
      aria-label="Закрыть"
      onclick={closeDialog}
      transition:fade={{ duration: 160 }}
    ></button>

    <div
      class="uiv2-choice-sheet__panel uiv2-choice-sheet__panel--form"
      transition:scale={{ duration: 220, start: 0.94, easing: cubicOut }}
    >
      <div class="release-suggest-sheet__head">
        <h2 id="release-suggest-title" class="uiv2-choice-sheet__title">Предложить оформление</h2>
        <UiV2RoundButton
          size="sm"
          label="Закрыть"
          disabled={busy}
          onclick={closeDialog}
        >
          {@html iconX(16)}
        </UiV2RoundButton>
      </div>

      <p class="release-suggest-sheet__lead">
        Можно заполнить одно поле или оба. Пустое поле не отправится. Одно поле = 1 запрос.
      </p>

      {#if banned}
        <p class="release-suggest-sheet__msg release-suggest-sheet__msg--error" role="alert">
          Вам запрещено предлагать обложки и видео.
        </p>
      {:else if remaining != null}
        <p class="release-suggest-sheet__quota" aria-live="polite">
          Сегодня осталось {remaining} из {quotaLimit}
          {#if filledCount > 0}
            · будет списано {filledCount}
          {/if}
        </p>
      {/if}

      <div class="release-suggest-sheet__fields">
        <UiV2OutlinedField
          id="release-suggest-banner"
          label="Баннер"
          type="url"
          inputmode="url"
          autocomplete="off"
          spellcheck={false}
          bind:value={bannerUrl}
          disabled={fieldsDisabled}
          hint="Ссылка на картинку"
        />
        <UiV2OutlinedField
          id="release-suggest-trailer"
          label="Трейлер"
          type="url"
          inputmode="url"
          autocomplete="off"
          spellcheck={false}
          bind:value={trailerUrl}
          disabled={fieldsDisabled}
          hint="Только YouTube"
        />
      </div>

      <div class="release-suggest-sheet__identity">
        {#if !anonymous && selfProfile}
          <button
            type="button"
            class="release-suggest-sheet__sender"
            onclick={openSelfProfile}
          >
            <span class="release-suggest-sheet__avatar">
              <UserAvatar src={selfProfile.avatar} label={selfProfile.login} />
            </span>
            <span class="release-suggest-sheet__sender-text">
              <span class="release-suggest-sheet__sender-label">Отправитель</span>
              <span class="release-suggest-sheet__sender-name">{selfProfile.login}</span>
            </span>
          </button>
        {/if}

        <button
          type="button"
          class="release-suggest-sheet__anon"
          role="switch"
          aria-checked={anonymous}
          disabled={fieldsDisabled}
          onclick={() => { anonymous = !anonymous; }}
        >
          <span>Остаться анонимным</span>
          <span
            class="uiv2-popup-menu__switch"
            class:uiv2-popup-menu__switch--on={anonymous}
            aria-hidden="true"
          >
            <span class="uiv2-popup-menu__switch-thumb"></span>
          </span>
        </button>
      </div>

      <p class="release-suggest-sheet__note">
        Нужен вход в Anixart. Если не анонимно, в админке увидят ваш профиль.
      </p>

      {#if errorMsg}
        <p class="release-suggest-sheet__msg release-suggest-sheet__msg--error" role="alert">{errorMsg}</p>
      {/if}
      {#if successMsg}
        <p class="release-suggest-sheet__msg release-suggest-sheet__msg--ok" role="status">{successMsg}</p>
      {/if}

      <div class="release-suggest-sheet__actions">
        <UiV2Button
          label="Отмена"
          size="sm"
          variant="chrome"
          disabled={busy}
          onclick={closeDialog}
        />
        <UiV2Button
          label={busy ? 'Отправка…' : 'Отправить'}
          size="sm"
          variant="primary"
          disabled={fieldsDisabled || filledCount === 0}
          onclick={() => void submit()}
        />
      </div>
    </div>
  </div>
{/if}
