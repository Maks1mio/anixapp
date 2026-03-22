<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { navigate } from '../stores/navigation';
  import { closeLobbyModal } from '../stores/modals';
  import {
    createRoom,
    joinRoom,
    getRoom,
    leaveRoom as apiLeaveRoom,
    type LobbyParticipant,
    type LobbyRoom,
  } from '../services/lobby-api';
  import {
    setLobbyRoom,
    leaveLobby,
    getCurrentRoomId,
    getCurrentParticipants,
    getLobbyLog,
    setLobbyParticipants,
  } from '../services/lobby-state';
  import { isConnected } from '../services/lobby-ws';
    import Page from './Page.svelte';

  interface Props {
    initialCode?: string;
    onClose: () => void;
  }

  const { initialCode, onClose }: Props = $props();

  // ── view state ────────────────────────────────────────────────────────────────
  type View = 'initial' | 'loading' | 'room';

  let view = $state<View>('initial');
  let loadingText = $state('Загрузка...');

  // initial view state
  let codeInput = $state('');
  let joinHint = $state('');
  let joinHintError = $state(false);
  let createLoading = $state(false);
  let joinLoading = $state(false);

  // room view state
  let roomId = $state('');
  let roomCode = $state('');
  let participants = $state<LobbyParticipant[]>([]);
  let connected = $state(false);
  let showLogs = $state(false);
  let logEntries = $state<ReturnType<typeof getLobbyLog>>([]);
  let copyDone = $state(false);

  // cleanup refs
  let destroyed = false;
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let statusInterval: ReturnType<typeof setInterval> | null = null;
  let onWsParticipants: EventListener | null = null;
  let onLogUpdated: EventListener | null = null;

  // ── helpers ───────────────────────────────────────────────────────────────────
  function getProfile(): { profileId?: number; login?: string; avatar?: string | null } {
    try {
      const raw = (window as any).__anixProfile as { id?: number; login?: string; avatar?: string | null } | undefined;
      if (raw && (raw.id || raw.login)) {
        return { profileId: raw.id, login: raw.login ?? undefined, avatar: raw.avatar ?? null };
      }
    } catch (_) {}
    return {};
  }

  function getDeviceIdPromise(): Promise<string | null> {
    const getDeviceId = (window as any).electron?.getDeviceId;
    return typeof getDeviceId === 'function'
      ? getDeviceId().catch(() => null)
      : Promise.resolve(null);
  }

  // ── room logic ────────────────────────────────────────────────────────────────
  function enterRoom(id: string, code: string, parts: LobbyParticipant[]) {
    roomId = id;
    roomCode = code;
    participants = parts;
    view = 'room';
    startRoomLifecycle(id);
  }

  function startRoomLifecycle(id: string) {
    destroyed = false;

    // Status polling
    connected = isConnected();
    statusInterval = setInterval(() => {
      connected = isConnected();
    }, 2000);

    // WS participant updates
    const wsHandler = ((e: CustomEvent) => {
      if (destroyed) return;
      const list = (e.detail as { participants?: LobbyParticipant[] } | null)?.participants ?? [];
      setLobbyParticipants(list);
      participants = list;
    }) as EventListener;
    onWsParticipants = wsHandler;
    window.addEventListener('lobby:participantsChanged', wsHandler);

    // Log updates
    const logHandler = (() => {
      if (!showLogs) return;
      logEntries = getLobbyLog();
    }) as EventListener;
    onLogUpdated = logHandler;
    window.addEventListener('lobby:logUpdated', logHandler);

    // Fallback polling
    startPolling(id);
  }

  function cleanupRoom() {
    if (destroyed) return;
    destroyed = true;
    stopPolling();
    if (statusInterval) { clearInterval(statusInterval); statusInterval = null; }
    if (onWsParticipants) {
      window.removeEventListener('lobby:participantsChanged', onWsParticipants);
      onWsParticipants = null;
    }
    if (onLogUpdated) {
      window.removeEventListener('lobby:logUpdated', onLogUpdated);
      onLogUpdated = null;
    }
  }

  function startPolling(id: string) {
    if (pollTimer) return;
    pollTimer = setInterval(() => {
      if (destroyed) return;
      getRoom(id)
        .then((room: LobbyRoom) => {
          if (destroyed) return;
          const list = room.participants ?? [];
          setLobbyParticipants(list);
          participants = list;
        })
        .catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : String(err);
          if (msg.includes('404') && !destroyed) {
            cleanupRoom();
            leaveLobby();
            close();
          }
        });
    }, 10000);
  }

  function stopPolling() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  }

  // ── actions ───────────────────────────────────────────────────────────────────
  async function handleCreate() {
    createLoading = true;
    joinHint = '';
    joinHintError = false;
    try {
      const deviceId = await getDeviceIdPromise();
      const { roomId: id, code, myPeerId: peerId } = await createRoom({ ...getProfile(), deviceId: deviceId ?? null });
      setLobbyRoom(id, { myPeerId: peerId, participants: [], roomCode: code });
      window.dispatchEvent(new CustomEvent('lobby:participantsChanged', { detail: { participants: [] } }));
      enterRoom(id, code, []);
    } catch {
      joinHint = 'Не удалось создать комнату. Попробуйте ещё раз.';
      joinHintError = true;
    } finally {
      createLoading = false;
    }
  }

  async function handleJoin() {
    const code = codeInput.trim();
    if (!code) {
      joinHint = 'Введите код комнаты';
      joinHintError = true;
      return;
    }
    joinLoading = true;
    joinHint = '';
    joinHintError = false;
    try {
      const deviceId = await getDeviceIdPromise();
      const room = await joinRoom(code, { ...getProfile(), deviceId: deviceId ?? null });
      setLobbyRoom(room.roomId, {
        myPeerId: room.myPeerId,
        participants: room.participants ?? [],
        playback: room.playback ?? undefined,
        roomCode: room.code,
      });
      enterRoom(room.roomId, room.code, room.participants ?? []);
    } catch {
      joinHint = 'Неверный код или комната не найдена';
      joinHintError = true;
    } finally {
      joinLoading = false;
    }
  }

  async function handleLeave() {
    try {
      const deviceId = await getDeviceIdPromise();
      if (deviceId) await apiLeaveRoom(roomId, deviceId).catch(() => undefined);
    } finally {
      cleanupRoom();
      leaveLobby();
      // Reset to initial view for a fresh start
      roomId = '';
      roomCode = '';
      participants = [];
      codeInput = '';
      joinHint = '';
      joinHintError = false;
      view = 'initial';
    }
  }

  async function handleCopyCode() {
    try {
      await navigator.clipboard.writeText(roomCode);
      copyDone = true;
      setTimeout(() => { copyDone = false; }, 1500);
    } catch {}
  }

  function toggleLogs() {
    showLogs = !showLogs;
    if (showLogs) logEntries = getLobbyLog();
  }

  function handleCodeInput(e: Event) {
    codeInput = (e.target as HTMLInputElement).value
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '');
  }

  function handleCodeKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') handleJoin();
  }

  // ── initial auto-join ─────────────────────────────────────────────────────────
  async function autoJoinWithCode(code: string) {
    loadingText = 'Подключаемся к комнате через Discord…';
    view = 'loading';
    try {
      const deviceId = await getDeviceIdPromise();
      const room = await joinRoom(code, { ...getProfile(), deviceId: deviceId ?? null });
      setLobbyRoom(room.roomId, {
        myPeerId: room.myPeerId,
        participants: room.participants ?? [],
        playback: room.playback ?? undefined,
        roomCode: room.code,
      });
      enterRoom(room.roomId, room.code, room.participants ?? []);
    } catch {
      codeInput = code;
      view = 'initial';
    }
  }

  async function loadExistingRoom(id: string) {
    loadingText = 'Загрузка...';
    view = 'loading';
    try {
      const room = await getRoom(id);
      enterRoom(id, room.code, room.participants ?? []);
    } catch {
      enterRoom(id, '', []);
    }
  }

  // ── log helpers ───────────────────────────────────────────────────────────────
  function formatLogEntry(entry: ReturnType<typeof getLobbyLog>[number]): string {
    const ts = new Date(entry.ts).toLocaleTimeString();
    let author = '';
    if (entry.fromPeerId) {
      const p = getCurrentParticipants().find((x) => x.peerId === entry.fromPeerId);
      if (p) author = p.login || `ID ${p.id}`;
    } else if (entry.type === 'local-playback') {
      author = 'Вы';
    }
    const playback = entry.playback;
    const pos = playback ? Math.round(playback.currentTime ?? 0) : null;
    const ep = playback?.ep ? `E${playback.ep}` : '';
    const state =
      playback && typeof playback.paused === 'boolean'
        ? playback.paused ? 'Пауза' : 'Play'
        : '';
    return JSON.stringify({ ts, author, type: entry.type, state, ep, pos, note: entry.note || '' });
  }

  // ── keyboard / click outside ──────────────────────────────────────────────────
  function close() {
    cleanupRoom();
    onClose();
    closeLobbyModal();
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
      autoJoinWithCode(initialCode);
    } else if (currentRoomId) {
      loadExistingRoom(currentRoomId);
    }
  });

  onDestroy(() => {
    document.removeEventListener('keydown', handleKeydown);
    cleanupRoom();
  });
</script>

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div
  class="lobby-modal-overlay lobby-modal-overlay--open"
  role="dialog"
  aria-label="Лобби совместного просмотра"
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

    <Page>
    <div class="lobby-modal__body">
      {#if view === 'loading'}
        <div class="lobby-modal__loading">{loadingText}</div>

      {:else if view === 'initial'}
        <div class="lobby-modal__welcome">
          <div class="lobby-modal__welcome-icon">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <rect x="2" y="3" width="20" height="14" rx="2"/>
              <line x1="8" y1="21" x2="16" y2="21"/>
              <line x1="12" y1="17" x2="12" y2="21"/>
              <polygon points="10 8 16 11 10 14 10 8" fill="currentColor" stroke="none"/>
            </svg>
          </div>
          <p class="lobby-modal__welcome-text">Смотрите аниме вместе с друзьями в реальном времени</p>
        </div>

        <div class="lobby-modal__actions">
          <button
            type="button"
            class="lobby-modal__btn lobby-modal__btn--create"
            class:lobby-modal__btn--loading={createLoading}
            disabled={createLoading}
            onclick={handleCreate}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="16"/>
              <line x1="8" y1="12" x2="16" y2="12"/>
            </svg>
            Создать комнату
          </button>

          <div class="lobby-modal__divider">
            <span class="lobby-modal__divider-line"></span>
            <span class="lobby-modal__divider-text">или</span>
            <span class="lobby-modal__divider-line"></span>
          </div>

          <div class="lobby-modal__join-group">
            <label class="lobby-modal__join-label">Присоединиться по коду</label>
            <div class="lobby-modal__join-row">
              <input
                type="text"
                class="lobby-modal__input"
                placeholder="ABC123"
                maxlength="12"
                autocomplete="off"
                spellcheck={false}
                value={codeInput}
                oninput={handleCodeInput}
                onkeydown={handleCodeKeydown}
              />
              <button
                type="button"
                class="lobby-modal__btn lobby-modal__btn--join"
                class:lobby-modal__btn--loading={joinLoading}
                disabled={joinLoading}
                onclick={handleJoin}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>
                  <polyline points="10 17 15 12 10 7"/>
                  <line x1="15" y1="12" x2="3" y2="12"/>
                </svg>
                Войти
              </button>
            </div>
            {#if joinHint}
              <p class="lobby-modal__join-hint" class:lobby-modal__join-hint--error={joinHintError}>
                {joinHint}
              </p>
            {/if}
          </div>
        </div>

      {:else if view === 'room'}
        <div class="lobby-modal__room">
          {#if roomCode}
            <div class="lobby-modal__code-section">
              <div class="lobby-modal__code-header">
                <span class="lobby-modal__code-label">Код комнаты</span>
                <span
                  class="lobby-modal__status"
                  class:lobby-modal__status--connected={connected}
                  class:lobby-modal__status--connecting={!connected}
                >
                  <span class="lobby-modal__status-dot"></span>
                  <span class="lobby-modal__status-text">
                    {connected ? 'Подключено' : 'Подключение...'}
                  </span>
                </span>
              </div>
              <div class="lobby-modal__code-block">
                <span class="lobby-modal__code-value">{roomCode}</span>
                <button
                  type="button"
                  class="lobby-modal__copy-btn"
                  class:lobby-modal__copy-btn--done={copyDone}
                  title="Скопировать код"
                  onclick={handleCopyCode}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                  </svg>
                  {copyDone ? 'Скопировано!' : 'Копировать'}
                </button>
              </div>
            </div>
          {/if}

          <div class="lobby-modal__participants-section">
            <div class="lobby-modal__participants-header">
              <span class="lobby-modal__participants-label">Участники</span>
              <span class="lobby-modal__participants-count">{participants.length}</span>
            </div>
            <div class="lobby-modal__participants-list">
              {#if participants.length === 0}
                <div class="lobby-modal__empty-participants">Ожидание участников...</div>
              {:else}
                {#each participants as p}
                  <button
                    type="button"
                    class="lobby-modal__participant"
                    onclick={() => navigate(`/profile/${p.id}`)}
                  >
                    <div class="lobby-modal__participant-avatar-wrap">
                      <span
                        class="lobby-modal__participant-avatar"
                        class:lobby-modal__participant-avatar--img={!!p.avatar}
                        style={p.avatar ? `background-image:url(${p.avatar})` : ''}
                      ></span>
                      <span class="lobby-modal__participant-online"></span>
                    </div>
                    <span class="lobby-modal__participant-name">{p.login || 'Пользователь'}</span>
                  </button>
                {/each}
              {/if}
            </div>
          </div>

          <div class="lobby-modal__room-footer">
            <button
              type="button"
              class="lobby-modal__btn lobby-modal__btn--leave"
              onclick={handleLeave}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                <polyline points="16 17 21 12 16 7"/>
                <line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
              Покинуть
            </button>
            <button
              type="button"
              class="lobby-modal__btn lobby-modal__btn--logs"
              class:lobby-modal__btn--active={showLogs}
              onclick={toggleLogs}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="16" y1="13" x2="8" y2="13"/>
                <line x1="16" y1="17" x2="8" y2="17"/>
              </svg>
              Логи
            </button>
          </div>

          {#if showLogs}
            <div class="lobby-modal__log-section">
              <div class="lobby-modal__log">
                {#if logEntries.length === 0}
                  <div class="lobby-modal__log-empty">Пока нет событий</div>
                {:else}
                  {#each logEntries as entry}
                    {@const ts = new Date(entry.ts).toLocaleTimeString()}
                    {@const playback = entry.playback}
                    {@const pos = playback ? Math.round(playback.currentTime ?? 0) : null}
                    {@const ep = playback?.ep ? `E${playback.ep}` : ''}
                    {@const state = playback && typeof playback.paused === 'boolean' ? (playback.paused ? 'Пауза' : 'Play') : ''}
                    {@const authorParticipant = entry.fromPeerId ? getCurrentParticipants().find((x) => x.peerId === entry.fromPeerId) : null}
                    {@const author = authorParticipant ? (authorParticipant.login || `ID ${authorParticipant.id}`) : (entry.type === 'local-playback' ? 'Вы' : '')}
                    <div class="lobby-modal__log-item">
                      <span class="lobby-modal__log-time">{ts}</span>
                      {#if author}<span class="lobby-modal__log-author">{author}</span>{/if}
                      <span class="lobby-modal__log-type">{entry.type}</span>
                      {#if state}<span class="lobby-modal__log-tag">{state}</span>{/if}
                      {#if ep}<span class="lobby-modal__log-tag">{ep}</span>{/if}
                      {#if pos != null}<span class="lobby-modal__log-tag">{pos}s</span>{/if}
                      {#if entry.note}<span class="lobby-modal__log-note">{entry.note}</span>{/if}
                    </div>
                  {/each}
                {/if}
              </div>
            </div>
          {/if}
        </div>
      {/if}
    </div>
    </Page>
  </div>
</div>
