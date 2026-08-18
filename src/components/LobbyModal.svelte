<script lang="ts">
  import { onMount } from 'svelte';
  import { closeLobbyModal } from '../stores/modals';
  import LobbyChooser from './LobbyChooser.svelte';
  import { getCurrentRoomId } from '../services/lobby-state';
  import {
    createLobbyRoomAndOpenPlayer,
    joinLobbyRoomAndOpenPlayer,
    openLobbyPlayerWindow,
  } from '../utils/lobby-player';

  interface Props {
    initialCode?: string;
    onClose: () => void;
  }

  const { initialCode, onClose }: Props = $props();

  type View = 'initial' | 'loading';

  let view = $state<View>('initial');
  let loadingText = $state('Загрузка...');
  let joinHint = $state('');
  let joinHintError = $state(false);
  let createLoading = $state(false);
  let joinLoading = $state(false);

  function close() {
    onClose();
    closeLobbyModal();
  }

  async function handleCreate() {
    createLoading = true;
    joinHint = '';
    joinHintError = false;
    try {
      await createLobbyRoomAndOpenPlayer();
      close();
    } catch {
      joinHint = 'Не удалось создать комнату. Попробуйте ещё раз.';
      joinHintError = true;
    } finally {
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
      await joinLobbyRoomAndOpenPlayer(code);
      close();
    } catch {
      joinHint = 'Неверный код или комната не найдена';
      joinHintError = true;
    } finally {
      joinLoading = false;
    }
  }

  async function autoJoinWithCode(code: string) {
    loadingText = 'Подключаемся к комнате через Discord…';
    view = 'loading';
    try {
      await joinLobbyRoomAndOpenPlayer(code);
      close();
    } catch {
      view = 'initial';
      joinHint = 'Не удалось войти по коду из Discord';
      joinHintError = true;
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') close();
  }

  function handleOverlayClick(e: MouseEvent) {
    if ((e.target as HTMLElement).classList.contains('lobby-modal-overlay')) close();
  }

  onMount(() => {
    document.addEventListener('keydown', handleKeydown);

    const currentRoomId = getCurrentRoomId();
    if (initialCode && !currentRoomId) {
      void autoJoinWithCode(initialCode);
    } else if (currentRoomId) {
      loadingText = 'Открываем плеер…';
      view = 'loading';
      void openLobbyPlayerWindow().then(() => close());
    }

    return () => {
      document.removeEventListener('keydown', handleKeydown);
    };
  });
</script>

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div
  class="lobby-modal-overlay lobby-modal-overlay--open"
  role="dialog"
  aria-label="Совместный просмотр"
  tabindex="-1"
  onclick={handleOverlayClick}
>
  <div class="lobby-modal-panel">
    <div class="lobby-modal__header">
      <div class="lobby-modal__header-left">
        <div class="lobby-modal__header-icon">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
            <circle cx="9" cy="7" r="4"/>
            <path d="M22 21v-2a4 4 0 0 0-3-3.87"/>
            <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
          </svg>
        </div>
        <h2 class="lobby-modal__title">Совместный просмотр</h2>
      </div>
      <button type="button" class="lobby-modal__close" aria-label="Закрыть" onclick={close}></button>
    </div>

    <div class="lobby-modal__body">
      {#if view === 'loading'}
        <div class="lobby-modal__loading">{loadingText}</div>
      {:else}
        <LobbyChooser
          {createLoading}
          {joinLoading}
          {joinHint}
          {joinHintError}
          {initialCode}
          onCreate={handleCreate}
          onJoin={handleJoin}
        />
      {/if}
    </div>
  </div>
</div>
