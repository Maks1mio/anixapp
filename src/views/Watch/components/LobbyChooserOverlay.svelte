<script lang="ts">
  import { onMount } from 'svelte';
  import { fade, scale } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { portal } from '../../../actions/portal';
  import LobbyChooser from '../../../components/LobbyChooser.svelte';
  import UiV2Tooltip from '../../../components/uikit-v2/UiV2Tooltip.svelte';
  import {
    createLobbyRoomAndOpenPlayer,
    joinLobbyRoomAndOpenPlayer,
  } from '../../../utils/lobby-player';
  import type { LobbyPlayback } from '../../../services/lobby-api';

  type Props = {
    onClose: () => void;
    getPlayback?: () => Partial<LobbyPlayback> | null;
  };

  let { onClose, getPlayback }: Props = $props();

  let createLoading = $state(false);
  let joinLoading = $state(false);
  let joinHint = $state('');
  let joinHintError = $state(false);

  function canIpc(): boolean {
    return typeof window.electron?.lobbyCreateFromPlayer === 'function';
  }

  async function handleCreate() {
    createLoading = true;
    joinHint = '';
    joinHintError = false;
    try {
      if (canIpc()) {
        window.electron?.lobbyCreateFromPlayer?.(getPlayback?.() ?? null);
        return;
      }
      await createLobbyRoomAndOpenPlayer(getPlayback?.() ?? null);
      onClose();
    } catch {
      joinHint = 'Не удалось создать комнату. Попробуйте ещё раз.';
      joinHintError = true;
      createLoading = false;
    }
  }

  async function handleJoin(code: string) {
    if (!code) {
      joinHint = 'Введите код комнаты';
      joinHintError = true;
      return;
    }
    joinLoading = true;
    joinHint = '';
    joinHintError = false;
    try {
      if (canIpc()) {
        window.electron?.lobbyJoinFromPlayer?.(code);
        return;
      }
      await joinLobbyRoomAndOpenPlayer(code);
      onClose();
    } catch {
      joinHint = 'Неверный код или комната не найдена';
      joinHintError = true;
      joinLoading = false;
    }
  }

  function onChooserError(e: Event) {
    const msg = String((e as CustomEvent).detail ?? '');
    joinHint = msg || 'Не удалось подключиться';
    joinHintError = true;
    createLoading = false;
    joinLoading = false;
  }

  function onSession(e: Event) {
    const session = (e as CustomEvent).detail as { inLobby?: boolean } | null;
    if (session?.inLobby) onClose();
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') onClose();
  }

  onMount(() => {
    window.addEventListener('keydown', onKeydown);
    window.addEventListener('lobby:chooserError', onChooserError);
    window.addEventListener('lobby:session', onSession);
    return () => {
      window.removeEventListener('keydown', onKeydown);
      window.removeEventListener('lobby:chooserError', onChooserError);
      window.removeEventListener('lobby:session', onSession);
    };
  });
</script>

<div class="lobby-chooser-overlay" role="dialog" aria-modal="true" aria-label="Совместный просмотр" use:portal>
  <button
    type="button"
    class="lobby-chooser-overlay__backdrop"
    aria-label="Закрыть"
    onclick={onClose}
    transition:fade={{ duration: 160 }}
  ></button>

  <div
    class="lobby-chooser-overlay__panel"
    transition:scale={{ duration: 220, start: 0.94, easing: cubicOut }}
  >
    <div class="lobby-chooser-overlay__header">
      <div class="lobby-chooser-overlay__header-left">
        <div class="lobby-chooser-overlay__header-icon" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
            <circle cx="9" cy="7" r="4"/>
            <path d="M22 21v-2a4 4 0 0 0-3-3.87"/>
            <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
          </svg>
        </div>
        <h2 class="lobby-chooser-overlay__title">Совместный просмотр</h2>
        <UiV2Tooltip text="Может быть переделано в будущем" placement="bottom" showDelay={80}>
          <span class="beta-badge" tabindex="0">beta</span>
        </UiV2Tooltip>
      </div>
      <button type="button" class="lobby-chooser-overlay__close" aria-label="Закрыть" onclick={onClose}></button>
    </div>

    <LobbyChooser
      {createLoading}
      {joinLoading}
      {joinHint}
      {joinHintError}
      onCreate={handleCreate}
      onJoin={handleJoin}
    />
  </div>
</div>
