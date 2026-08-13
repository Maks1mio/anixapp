<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { lobbyCurrentPlayback, isPlayerWindowOpen, lobbyWatchingPeerIds } from '../stores/modals';
  import { getCurrentRoomId, getCurrentParticipants, leaveLobby } from '../services/lobby-state';
  import { resolveCdnAssetUrl } from '../utils/posterUrl';
  import UiV2Tooltip from './uikit-v2/UiV2Tooltip.svelte';

  let playback = $derived($lobbyCurrentPlayback);
  let playerOpen = $derived($isPlayerWindowOpen);
  let watchingPeerIds = $derived($lobbyWatchingPeerIds);
  let inLobby = $state(false);
  let participants = $state<{ login: string; avatar?: string | null; peerId?: string | null }[]>([]);

  function isWatchingPeer(p: { peerId?: string | null }): boolean {
    const id = p.peerId != null ? String(p.peerId) : '';
    return id !== '' && watchingPeerIds.includes(id);
  }

  const watchingParticipants = $derived.by(() => participants.filter((p) => isWatchingPeer(p)));
  const lobbyOnlyParticipants = $derived.by(() => participants.filter((p) => !isWatchingPeer(p)));

  const avatarRows = $derived.by(() => {
    const w = watchingParticipants.slice(0, 5);
    const rest = 5 - w.length;
    const l = rest > 0 ? lobbyOnlyParticipants.slice(0, rest) : [];
    return [
      ...w.map((p) => ({ p, kind: 'watch' as const })),
      ...l.map((p) => ({ p, kind: 'idle' as const })),
    ];
  });

  const hintText = $derived.by(() => {
    const w = watchingParticipants.length;
    const total = participants.length;
    const l = lobbyOnlyParticipants.length;
    if (w === 0 && total > 1) return 'Плеер ни у кого не открыт';
    if (w === 1 && l > 0) return 'Остальные в комнате без плеера';
    return '';
  });

  function syncState() {
    inLobby = !!getCurrentRoomId();
    participants = getCurrentParticipants();
  }

  function onParticipantsChanged() { syncState(); }
  function onLeft() { inLobby = false; participants = []; }

  onMount(() => {
    syncState();
    window.addEventListener('lobby:participantsChanged', onParticipantsChanged);
    window.addEventListener('lobby:left', onLeft);
    window.addEventListener('lobby:remotePlayback', onParticipantsChanged);
  });
  onDestroy(() => {
    window.removeEventListener('lobby:participantsChanged', onParticipantsChanged);
    window.removeEventListener('lobby:left', onLeft);
    window.removeEventListener('lobby:remotePlayback', onParticipantsChanged);
  });

  let show = $derived(inLobby && !!playback && !playerOpen);

  async function joinWatch() {
    if (!playback) return;
    isPlayerWindowOpen.set(true);
    await window.electron?.openPlayerWindow?.({
      releaseId: playback.releaseId,
      sourceId: playback.sourceId,
      ep: playback.ep,
      title: playback.title,
      sourceName: playback.sourceName,
      ...(playback.dubberId ? { dubberId: playback.dubberId } : {}),
    });
    window.electron?.syncPlayerState?.({ ...playback });
  }

  function handleLeave() {
    leaveLobby();
    lobbyCurrentPlayback.set(null);
  }
</script>

{#if show && playback}
  <div class="lobby-now-watching">
    <div
      class="lobby-now-watching__live"
      class:lobby-now-watching__live--idle={watchingParticipants.length === 0}
    >
      <span class="lobby-now-watching__dot"></span>
      {#if watchingParticipants.length === 0}
        В лобби
      {:else if watchingParticipants.length === 1}
        <span class="lobby-now-watching__live-truncate" title={watchingParticipants[0].login}>
          Смотрит · {watchingParticipants[0].login}
        </span>
      {:else}
        В эфире · {watchingParticipants.length}
      {/if}
    </div>

    <div class="lobby-now-watching__info">
      <span class="lobby-now-watching__title">{playback.title}</span>
      <span class="lobby-now-watching__meta">
        {playback.ep} Серия
        {#if playback.sourceName}
          <span class="lobby-now-watching__sep"></span>
          {playback.sourceName}
        {/if}
        {#if playback.paused}
          <span class="lobby-now-watching__sep"></span>
          На паузе
        {/if}
      </span>
      {#if hintText}
        <span class="lobby-now-watching__hint">{hintText}</span>
      {/if}
    </div>

    {#if avatarRows.length > 0}
      <div class="lobby-now-watching__avatars">
        {#each avatarRows as row (`${row.kind}:${row.p.peerId ?? ''}:${row.p.login}`)}
          <UiV2Tooltip text={row.p.login} placement="bottom">
            <span
              class="lobby-now-watching__avatar"
              class:lobby-now-watching__avatar--watching={row.kind === 'watch'}
              class:lobby-now-watching__avatar--idle={row.kind === 'idle'}
              title={row.p.login}
            >
              {#if row.p.avatar}
                <img src={resolveCdnAssetUrl(row.p.avatar)} alt={row.p.login} />
              {:else}
                {row.p.login?.[0]?.toUpperCase() ?? '?'}
              {/if}
            </span>
          </UiV2Tooltip>
        {/each}
      </div>
    {/if}

    <button
      type="button"
      class="lobby-now-watching__join"
      onclick={joinWatch}
    >
      Присоединиться
    </button>

    <UiV2Tooltip text="Покинуть лобби" placement="bottom">
      <button
        type="button"
        class="lobby-now-watching__leave"
        aria-label="Покинуть лобби"
        onclick={handleLeave}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
          <polyline points="16 17 21 12 16 7"/>
          <line x1="21" y1="12" x2="9" y2="12"/>
        </svg>
      </button>
    </UiV2Tooltip>
  </div>
{/if}

<style lang="scss">
  @use '../styles/variables' as *;

  .lobby-now-watching {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 40px;
    padding: 6px 12px;
    background: color-mix(in srgb, var(--color-accent) 12%, var(--color-surface) 88%);
    border-bottom: 1px solid color-mix(in srgb, var(--color-accent) 30%, transparent 70%);
    flex-shrink: 0;
    overflow: hidden;
  }

  .lobby-now-watching__live {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: #fff;
    background: var(--color-accent);
    padding: 2px 7px;
    border-radius: 4px;
    flex-shrink: 0;
    max-width: min(200px, 38vw);
    min-width: 0;
  }

  .lobby-now-watching__live--idle {
    background: var(--color-border);
    color: var(--color-text-muted);
    font-weight: 600;
    text-transform: none;
    letter-spacing: 0.02em;
  }

  .lobby-now-watching__live-truncate {
    display: block;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 700;
    text-transform: none;
    letter-spacing: 0.02em;
  }

  .lobby-now-watching__live--idle .lobby-now-watching__dot {
    animation: none;
    opacity: 0.55;
    background: var(--color-text-muted);
  }

  .lobby-now-watching__live:not(.lobby-now-watching__live--idle) .lobby-now-watching__dot {
    animation: lobby-pulse 1.4s ease-in-out infinite;
  }

  .lobby-now-watching__dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #fff;
    flex-shrink: 0;
  }

  @keyframes lobby-pulse {
    0%, 100% { opacity: 1; }
    50%       { opacity: 0.4; }
  }

  .lobby-now-watching__info {
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
    flex: 1;
  }

  .lobby-now-watching__title {
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--color-text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .lobby-now-watching__meta {
    font-size: 0.7rem;
    color: var(--color-text-muted);
    display: flex;
    align-items: center;
    gap: 5px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .lobby-now-watching__hint {
    font-size: 0.62rem;
    color: var(--color-text-muted);
    line-height: 1.2;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .lobby-now-watching__sep {
    display: inline-block;
    width: 3px;
    height: 3px;
    border-radius: 50%;
    background: var(--color-text-muted);
    flex-shrink: 0;
  }

  .lobby-now-watching__avatars {
    display: flex;
    align-items: center;
    flex-shrink: 0;
  }

  .lobby-now-watching__avatar {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: var(--color-surface-hover);
    border: 2px solid var(--color-bg);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.65rem;
    font-weight: 700;
    color: var(--color-text);
    overflow: hidden;
    margin-left: -6px;
    position: relative;
    cursor: default;

    &:first-child { margin-left: 0; }

    img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }

    &--watching {
      box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-accent) 70%, transparent);
      z-index: 1;
    }

    &--idle {
      opacity: 0.55;
    }
  }

  .lobby-now-watching__join {
    flex-shrink: 0;
    height: 26px;
    padding: 0 12px;
    border-radius: 6px;
    background: var(--color-accent);
    color: #fff;
    font-size: 0.75rem;
    font-weight: 600;
    border: none;
    cursor: pointer;
    transition: background 0.15s, opacity 0.15s;

    &:hover { background: var(--color-accent-hover); }
    &:active { opacity: 0.85; }
  }

  .lobby-now-watching__leave {
    flex-shrink: 0;
    width: 28px;
    height: 28px;
    border-radius: 6px;
    background: transparent;
    border: 1px solid var(--color-border);
    color: var(--color-text-muted);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: background 0.15s, color 0.15s, border-color 0.15s;
    position: relative;

    &:hover {
      background: rgba(255, 80, 80, 0.12);
      border-color: rgba(255, 80, 80, 0.5);
      color: #ff5050;
    }
  }
</style>
