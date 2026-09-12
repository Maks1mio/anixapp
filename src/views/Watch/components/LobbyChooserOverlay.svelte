<script lang="ts">
  import { onMount } from 'svelte';
  import { portal } from '../../../actions/portal';
  import FluoCreateRoomModal from '../../../components/FluoCreateRoomModal.svelte';
  import type { FluoCreateRoomOptions } from '../../../fluo/types';
  import {
    createLobbyRoomAndOpenPlayer,
  } from '../../../utils/lobby-player';
  import type { LobbyPlayback } from '../../../services/lobby-api';

  type Props = {
    onClose: () => void;
    getPlayback?: () => Partial<LobbyPlayback> | null;
  };

  let { onClose, getPlayback }: Props = $props();

  let createBusy = $state(false);
  let createHint = $state('');

  function canIpc(): boolean {
    return typeof window.electron?.lobbyCreateFromPlayer === 'function';
  }

  async function handleCreate(options: FluoCreateRoomOptions) {
    const playback = getPlayback?.() ?? null;
    if (playback && typeof (playback as { localFile?: unknown }).localFile === 'string'
      && String((playback as { localFile?: string }).localFile).trim()) {
      createHint = 'Совместный просмотр недоступен для скачанных файлов';
      return;
    }
    createBusy = true;
    createHint = '';
    try {
      if (canIpc()) {
        window.electron?.lobbyCreateFromPlayer?.({
          playback: playback ?? null,
          options,
        });
        return;
      }
      await createLobbyRoomAndOpenPlayer(playback, options);
      onClose();
    } catch (err: unknown) {
      createHint = err instanceof Error ? err.message : 'Не удалось создать комнату. Попробуйте ещё раз.';
      createBusy = false;
    }
  }

  function onChooserError(e: Event) {
    const msg = String((e as CustomEvent).detail ?? '');
    createHint = msg || 'Не удалось создать комнату';
    createBusy = false;
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

<div class="lobby-create-portal" use:portal>
  <FluoCreateRoomModal
    busy={createBusy}
    hint={createHint}
    onClose={onClose}
    onSubmit={handleCreate}
  />
</div>

<style>
  .lobby-create-portal {
    display: contents;
  }
</style>
