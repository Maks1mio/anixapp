<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { flip } from 'svelte/animate';
  import { fly, fade } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { listFluoRooms, type FluoRoomListItem } from '../../fluo/rooms-api';
  import { subscribeFluoCatalog } from '../../fluo/catalog-ws';
  import type { FluoControlMode, FluoCreateRoomOptions } from '../../fluo/types';
  import { fluoPlaybackControlMode, fluoAnimeSelectModeOf } from '../../fluo/types';
  import {
    createLobbyRoomAndOpenPlayer,
    joinLobbyRoomAndOpenPlayer,
    FluoJoinError,
  } from '../../utils/lobby-player';
  import { resolveCdnAssetUrl } from '../../utils/posterUrl';
  import { fmtTime } from '../Watch/_utils';
  import { handleUserProfileClick } from '../../stores/user-profile';
  import {
    iconLock,
    iconPlus,
    iconSignal,
    iconUsers,
    iconVote,
    iconMessageCircle,
    iconX,
    iconPlay,
    iconPause,
  } from '../../components/icons';
  import UiV2Button from '../../components/uikit-v2/UiV2Button.svelte';
  import UiV2OutlinedField from '../../components/uikit-v2/UiV2OutlinedField.svelte';
  import UiV2PillField from '../../components/uikit-v2/UiV2PillField.svelte';
  import UiV2Tooltip from '../../components/uikit-v2/UiV2Tooltip.svelte';
  import FluoCreateRoomModal from '../../components/FluoCreateRoomModal.svelte';
  import UiV2ContentRetryOverlay from '../../components/uikit-v2/UiV2ContentRetryOverlay.svelte';

  let rooms = $state<FluoRoomListItem[]>([]);
  let loadState = $state<'loading' | 'ready' | 'error'>('loading');
  let errorMsg = $state('');
  let joinCode = $state('');
  let joinBusy = $state(false);
  let joinHint = $state('');
  let joinHintError = $state(false);

  let createOpen = $state(false);
  let createBusy = $state(false);
  let createHint = $state('');

  let passwordOpen = $state(false);
  let passwordRoom: FluoRoomListItem | null = $state(null);
  let passwordValue = $state('');
  let passwordBusy = $state(false);
  let passwordHint = $state('');

  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let unsubCatalog: (() => void) | null = null;

  function applyRooms(next: FluoRoomListItem[], source: 'ws' | 'http' = 'http'): void {
    // Закешированный пустой GET не должен затирать живой каталог с WS
    if (source === 'http' && next.length === 0 && rooms.length > 0) return;
    rooms = next;
    loadState = 'ready';
    errorMsg = '';
  }

  async function refreshRooms(silent = false) {
    if (!silent && rooms.length === 0 && loadState !== 'error') loadState = 'loading';
    try {
      applyRooms(await listFluoRooms(), 'http');
    } catch {
      if (!rooms.length) {
        loadState = 'error';
        errorMsg = 'Не удалось загрузить комнаты';
      }
    }
  }

  function onFocus() {
    void refreshRooms(true);
  }

  function onVisibility() {
    if (document.visibilityState === 'visible') void refreshRooms(true);
  }

  function onLobbySession() {
    void refreshRooms(true);
  }

  onMount(() => {
    void refreshRooms();
    unsubCatalog = subscribeFluoCatalog((next) => applyRooms(next, 'ws'));
    // Backup, если WS каталога недоступен
    pollTimer = setInterval(() => void refreshRooms(true), 4000);
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('lobby:session', onLobbySession);
    window.addEventListener('lobby:left', onLobbySession);
    window.addEventListener('fluo:session', onLobbySession);
    window.addEventListener('fluo:left', onLobbySession);
    return () => {
      unsubCatalog?.();
      unsubCatalog = null;
      if (pollTimer) clearInterval(pollTimer);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('lobby:session', onLobbySession);
      window.removeEventListener('lobby:left', onLobbySession);
      window.removeEventListener('fluo:session', onLobbySession);
      window.removeEventListener('fluo:left', onLobbySession);
    };
  });

  onDestroy(() => {
    unsubCatalog?.();
    if (pollTimer) clearInterval(pollTimer);
  });

  function controlLabel(mode: FluoControlMode | undefined): string {
    return fluoPlaybackControlMode({ controlMode: mode }) === 'host' ? 'Хост' : 'Могут все';
  }

  function animeSelectLabel(room: FluoRoomListItem): string {
    const mode = fluoAnimeSelectModeOf(room.settings);
    if (mode === 'host') return 'Тайтл: хост';
    if (mode === 'vote') return 'Тайтл: голосование';
    return 'Тайтл: все';
  }

  function visibilityLabel(vis: FluoRoomVisibility | undefined): string {
    if (vis === 'closed') return 'Закрытый';
    if (vis === 'private') return 'Приватный';
    return 'Публичный';
  }

  function displayName(room: FluoRoomListItem): string {
    const name = (room.name || '').trim();
    if (!name) return 'Новая комната';
    if (name.toUpperCase() === String(room.code || '').toUpperCase()) return 'Новая комната';
    if (/^комната\s+[A-Z0-9]{4,12}$/i.test(name)) return 'Новая комната';
    return name;
  }

  function frameOf(room: FluoRoomListItem): string | null {
    const preview = room.content?.previewUrl;
    if (preview) return preview.startsWith('data:') ? preview : (resolveCdnAssetUrl(preview) || preview);
    const poster = room.content?.posterUrl;
    if (!poster) return null;
    return resolveCdnAssetUrl(poster) || poster;
  }

  function episodeLabel(ep?: string): string {
    if (ep == null || String(ep).trim() === '') return '';
    const n = Number(ep);
    return Number.isFinite(n) ? `Серия ${n}` : `Серия ${ep}`;
  }

  function progressPct(room: FluoRoomListItem): number {
    const dur = room.content?.duration ?? 0;
    const t = room.content?.currentTime ?? 0;
    if (!(dur > 0)) return 0;
    return Math.max(0, Math.min(100, (t / dur) * 100));
  }

  function onProfileClick(e: MouseEvent, profileId?: number | null) {
    e.preventDefault();
    e.stopPropagation();
    handleUserProfileClick(profileId, e);
  }

  function onCardKeydown(e: KeyboardEvent, room: FluoRoomListItem) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onRoomActivate(room);
    }
  }

  async function handleQuickJoin() {
    const code = joinCode.trim().toUpperCase();
    if (!code) {
      joinHint = 'Введите код комнаты';
      joinHintError = true;
      return;
    }
    joinBusy = true;
    joinHint = '';
    joinHintError = false;
    try {
      await joinLobbyRoomAndOpenPlayer(code);
    } catch (err: unknown) {
      if (err instanceof FluoJoinError) {
        if (err.code === 'password_required') {
          passwordRoom = {
            roomId: '',
            code,
            name: 'Закрытая комната',
            visibility: 'closed',
            settings: { controlMode: 'everyone', animeSelectMode: 'everyone', chatEnabled: true },
            participantCount: 0,
            participants: [],
            hostPeerId: null,
            hostLogin: null,
            content: null,
            createdAt: Date.now(),
            activity: [],
          };
          passwordValue = '';
          passwordHint = '';
          passwordOpen = true;
        } else if (err.code === 'banned') {
          joinHint = 'Вас выгнали из этой комнаты';
          joinHintError = true;
        } else {
          joinHint = err.message || 'Не удалось войти';
          joinHintError = true;
        }
      } else {
        joinHint = 'Неверный код или комната не найдена';
        joinHintError = true;
      }
    } finally {
      joinBusy = false;
    }
  }

  function openCreate() {
    createHint = '';
    createOpen = true;
  }

  async function submitCreate(options: FluoCreateRoomOptions) {
    createBusy = true;
    createHint = '';
    try {
      await createLobbyRoomAndOpenPlayer(null, options);
      createOpen = false;
      await refreshRooms(true);
    } catch (err: unknown) {
      createHint = err instanceof Error ? err.message : 'Не удалось создать комнату';
    } finally {
      createBusy = false;
    }
  }

  function onRoomActivate(room: FluoRoomListItem) {
    if (room.visibility === 'closed') {
      passwordRoom = room;
      passwordValue = '';
      passwordHint = '';
      passwordOpen = true;
      return;
    }
    void joinRoom(room.code);
  }

  async function joinRoom(code: string, password?: string) {
    try {
      await joinLobbyRoomAndOpenPlayer(code, password);
      passwordOpen = false;
      void refreshRooms(true);
    } catch (err: unknown) {
      if (err instanceof FluoJoinError) {
        if (err.code === 'password_required' || err.code === 'password_invalid') {
          passwordHint = err.message;
          passwordOpen = true;
          return;
        }
        if (err.code === 'banned') {
          joinHint = 'Вас выгнали из этой комнаты';
          joinHintError = true;
          passwordOpen = false;
          return;
        }
      }
      joinHint = 'Не удалось войти в комнату';
      joinHintError = true;
      passwordOpen = false;
    }
  }

  async function submitPassword() {
    if (!passwordRoom) return;
    passwordBusy = true;
    passwordHint = '';
    try {
      await joinRoom(passwordRoom.code, passwordValue);
    } finally {
      passwordBusy = false;
    }
  }
</script>

<div class="view view-fluo fluo-page">
  <header class="fluo-page__hero">
    <div class="fluo-page__hero-top">
      <div class="fluo-page__brand">
        <span class="fluo-page__brand-icon" aria-hidden="true">{@html iconSignal(22)}</span>
        <div class="fluo-page__brand-text">
          <h1 class="fluo-page__title">Fluo</h1>
          <p class="fluo-page__subtitle">Комнаты совместного просмотра</p>
        </div>
      </div>
      <UiV2Button
        label="Создать комнату"
        variant="primary"
        class="fluo-page__create"
        onclick={openCreate}
      >
        {#snippet icon()}{@html iconPlus(16)}{/snippet}
      </UiV2Button>
    </div>

    <div class="fluo-page__toolbar" role="group" aria-label="Вход по коду комнаты">
      <UiV2PillField
        label="Код комнаты"
        bind:value={joinCode}
        maxlength={12}
        autocomplete="off"
        spellcheck={false}
        error={joinHintError}
        class="fluo-page__code"
        oninput={() => { joinHint = ''; joinHintError = false; }}
        onkeydown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            void handleQuickJoin();
          }
        }}
      />
      <UiV2Button
        label={joinBusy ? 'Вход…' : 'Войти'}
        variant="chrome"
        disabled={joinBusy || !joinCode.trim()}
        onclick={() => void handleQuickJoin()}
      />
    </div>
    {#if joinHint}
      <p class="fluo-page__hint" class:fluo-page__hint--error={joinHintError} role="status">{joinHint}</p>
    {/if}
  </header>

  {#if loadState === 'loading'}
    <div class="fluo-page__state fluo-page__state--loading" aria-busy="true" aria-live="polite" transition:fade={{ duration: 160 }}>
      <div class="fluo-page__skeleton-grid" aria-hidden="true">
        {#each [1, 2, 3] as n (n)}
          <div class="fluo-skel">
            <div class="fluo-skel__frame"></div>
            <div class="fluo-skel__line fluo-skel__line--lg"></div>
            <div class="fluo-skel__line"></div>
            <div class="fluo-skel__line fluo-skel__line--sm"></div>
          </div>
        {/each}
      </div>
      <p class="fluo-page__state-sub">Загрузка комнат…</p>
    </div>
  {:else if loadState === 'error'}
    <UiV2ContentRetryOverlay message={errorMsg} onRetry={() => void refreshRooms(true)} />
  {:else if rooms.length === 0}
    <div class="fluo-page__state" transition:fade={{ duration: 180 }}>
      <div class="fluo-page__state-icon" aria-hidden="true">{@html iconSignal(36)}</div>
      <p class="fluo-page__state-title">Пока нет активных комнат</p>
      <p class="fluo-page__state-sub">Создайте комнату сверху или войдите по коду</p>
    </div>
  {:else}
    <div class="fluo-page__section-head">
      <h2 class="fluo-page__section-title">Активные комнаты</h2>
      <span class="fluo-page__section-meta">{rooms.length}</span>
    </div>
    <ul class="fluo-page__grid" role="list">
      {#each rooms as room (room.roomId || room.code)}
        <li
          animate:flip={{ duration: 360, easing: cubicOut }}
          in:fly={{ y: 18, duration: 300, easing: cubicOut }}
          out:fly={{ y: -10, duration: 220, easing: cubicOut }}
        >
          <button
            type="button"
            class="fluo-room"
            aria-label={`Войти в ${displayName(room)}`}
            onclick={() => onRoomActivate(room)}
            onkeydown={(e) => onCardKeydown(e, room)}
          >
            <div class="fluo-room__frame" aria-hidden="true">
              {#if frameOf(room)}
                <img src={frameOf(room)!} alt="" />
              {:else}
                <span class="fluo-room__frame-fallback">{@html iconSignal(28)}</span>
              {/if}
              {#if room.content}
                <span class="fluo-room__live" data-paused={room.content.paused ? '1' : '0'}>
                  {#if room.content.paused}
                    {@html iconPause(14)}
                  {:else}
                    {@html iconPlay(14)}
                  {/if}
                </span>
              {/if}
              {#if room.visibility === 'closed'}
                <span class="fluo-room__lock" title="Закрытая">{@html iconLock(14)}</span>
              {/if}
            </div>
            <div class="fluo-room__body">
              <div class="fluo-room__name-row">
                <span class="fluo-room__name">{displayName(room)}</span>
                <span class="fluo-room__badge" data-vis={room.visibility}>
                  {visibilityLabel(room.visibility)}
                </span>
              </div>
              {#if room.content?.title}
                <p class="fluo-room__title">{room.content.title}</p>
                <p class="fluo-room__meta">
                  {#if room.content.dubberName || room.content.sourceName}
                    {room.content.dubberName || room.content.sourceName}
                  {/if}
                  {#if episodeLabel(room.content.ep)}
                    {#if room.content.dubberName || room.content.sourceName} – {/if}{episodeLabel(room.content.ep)}
                  {/if}
                </p>
              {:else}
                <p class="fluo-room__meta">Ожидание контента</p>
              {/if}

              {#if (room.content?.duration ?? 0) > 0}
                <div
                  class="fluo-room__progress"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(progressPct(room))}
                  aria-label={`Прогресс ${fmtTime(room.content?.currentTime ?? 0)} из ${fmtTime(room.content?.duration ?? 0)}`}
                >
                  <span class="fluo-room__progress-fill" style={`width: ${progressPct(room)}%`}></span>
                </div>
                <p class="fluo-room__time">{fmtTime(room.content?.currentTime ?? 0)} / {fmtTime(room.content?.duration ?? 0)}</p>
              {/if}

              <div class="fluo-room__foot">
                <div class="fluo-room__people">
                  <div class="fluo-room__avatars">
                    {#each room.participants.slice(0, 5) as p, i (p.peerId ?? `${p.login}-${i}`)}
                      {@const pid = typeof p.profileId === 'number' ? p.profileId : null}
                      <UiV2Tooltip text={p.login || 'Участник'} placement="top" showDelay={80}>
                        {#if pid && pid > 0}
                          <button
                            type="button"
                            class="fluo-room__avatar-btn"
                            aria-label={`Профиль ${p.login || 'участника'}`}
                            onclick={(e) => onProfileClick(e, pid)}
                          >
                            {#if p.avatar}
                              <img class="fluo-room__avatar" src={resolveCdnAssetUrl(p.avatar) || p.avatar} alt="" />
                            {:else}
                              <span class="fluo-room__avatar fluo-room__avatar--fallback">{(p.login || '?').slice(0, 1)}</span>
                            {/if}
                          </button>
                        {:else if p.avatar}
                          <img class="fluo-room__avatar" src={resolveCdnAssetUrl(p.avatar) || p.avatar} alt="" />
                        {:else}
                          <span class="fluo-room__avatar fluo-room__avatar--fallback">{(p.login || '?').slice(0, 1)}</span>
                        {/if}
                      </UiV2Tooltip>
                    {/each}
                  </div>
                  <span class="fluo-room__count">
                    {@html iconUsers(14)}
                    {room.participantCount} смотрят
                  </span>
                </div>

                <div class="fluo-room__flags">
                  <span>
                    {#if fluoPlaybackControlMode(room.settings) === 'host'}
                      {@html iconLock(14)}
                    {:else}
                      {@html iconUsers(14)}
                    {/if}
                    Плеер: {controlLabel(room.settings?.controlMode)}
                  </span>
                  <span>
                    {#if fluoAnimeSelectModeOf(room.settings) === 'vote'}
                      {@html iconVote(14)}
                    {:else if fluoAnimeSelectModeOf(room.settings) === 'host'}
                      {@html iconLock(14)}
                    {:else}
                      {@html iconUsers(14)}
                    {/if}
                    {animeSelectLabel(room)}
                  </span>
                  {#if room.settings && !room.settings.chatEnabled}
                    <span>{@html iconMessageCircle(14)} Чат выкл.</span>
                  {/if}
                </div>
              </div>
            </div>
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</div>

{#if createOpen}
  <FluoCreateRoomModal
    busy={createBusy}
    hint={createHint}
    onClose={() => { createOpen = false; }}
    onSubmit={submitCreate}
  />
{/if}

{#if passwordOpen && passwordRoom}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div
    class="fluo-modal-overlay"
    role="dialog"
    aria-modal="true"
    aria-label="Пароль комнаты"
    tabindex="-1"
    onclick={(e) => { if (e.target === e.currentTarget) passwordOpen = false; }}
  >
    <div class="fluo-modal fluo-modal--sm">
      <div class="fluo-modal__head">
        <h2>{passwordRoom.name}</h2>
        <button type="button" class="fluo-modal__close" aria-label="Закрыть" onclick={() => { passwordOpen = false; }}>
          {@html iconX(18)}
        </button>
      </div>
      <div class="fluo-modal__body">
        <p class="fluo-modal__lead">Закрытая комната — введите пароль</p>
        <UiV2OutlinedField
          label="Пароль"
          type="password"
          revealable
          bind:value={passwordValue}
          maxlength={64}
        />
        {#if passwordHint}
          <p class="fluo-page__hint fluo-page__hint--error" role="alert">{passwordHint}</p>
        {/if}
      </div>
      <div class="fluo-modal__foot">
        <UiV2Button label="Отмена" variant="ghost" onclick={() => { passwordOpen = false; }} />
        <UiV2Button
          label={passwordBusy ? 'Вход…' : 'Войти'}
          variant="primary"
          disabled={passwordBusy || !passwordValue.trim()}
          onclick={() => void submitPassword()}
        />
      </div>
    </div>
  </div>
{/if}

<style>
  .fluo-page {
    width: 100%;
    max-width: 56rem;
    margin: 0 auto;
    min-width: 0;
    box-sizing: border-box;
    padding-bottom: 2.5rem;
    container-type: inline-size;
  }

  .fluo-page__hero {
    display: flex;
    flex-direction: column;
    gap: 0.85rem;
    margin-bottom: 1.5rem;
    padding: 1.1rem 1.15rem 1.05rem;
    border-radius: 18px;
    border: 1px solid var(--uiv2-border-subtle, transparent);
    background:
      linear-gradient(
        165deg,
        color-mix(in srgb, var(--uikit-v2-accent, var(--color-accent)) 10%, transparent) 0%,
        transparent 42%
      ),
      var(--uiv2-card-bg, var(--color-surface, #161616));
    box-shadow: var(--uiv2-chrome-shadow, none);
  }

  .fluo-page__hero-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.85rem 1rem;
    flex-wrap: wrap;
  }

  .fluo-page__brand {
    display: flex;
    align-items: center;
    gap: 0.7rem;
    min-width: 0;
  }

  .fluo-page__brand-icon {
    display: grid;
    place-items: center;
    width: 2.5rem;
    height: 2.5rem;
    border-radius: 999px;
    background: color-mix(in srgb, var(--uikit-v2-accent, var(--color-accent)) 16%, transparent);
    color: var(--uikit-v2-accent, var(--color-accent));
    flex-shrink: 0;
  }

  .fluo-page__brand-text {
    min-width: 0;
  }

  .fluo-page__title {
    margin: 0;
    font-size: 1.45rem;
    font-weight: 700;
    letter-spacing: -0.02em;
    line-height: 1.15;
    color: var(--uiv2-fg-strong, var(--color-text, #fff));
  }

  .fluo-page__subtitle {
    margin: 0.2rem 0 0;
    font-size: 0.85rem;
    color: var(--uiv2-fg-muted, rgba(255, 255, 255, 0.55));
  }

  .fluo-page__toolbar {
    display: flex;
    align-items: center;
    gap: 0.55rem;
    flex-wrap: wrap;
  }

  .fluo-page__code {
    flex: 1 1 12rem;
    max-width: 22rem;
  }

  .fluo-page__hint {
    margin: 0;
    font-size: 0.82rem;
    color: var(--uiv2-fg-muted, rgba(255, 255, 255, 0.55));
  }

  .fluo-page__hint--error {
    color: var(--uikit-v2-danger, var(--color-error, #f07178));
  }

  .fluo-page__section-head {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
    margin: 0 0 0.85rem;
  }

  .fluo-page__section-title {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
    color: var(--uiv2-fg-strong, var(--color-text, #fff));
  }

  .fluo-page__section-meta {
    font-size: 0.8rem;
    font-variant-numeric: tabular-nums;
    color: var(--uiv2-fg-muted, rgba(255, 255, 255, 0.5));
  }

  .fluo-page__state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
    padding: 3rem 1rem 2.5rem;
    text-align: center;
  }

  .fluo-page__state--loading {
    align-items: stretch;
    padding-top: 0.25rem;
  }

  .fluo-page__state-icon {
    color: var(--uiv2-fg-muted, rgba(255, 255, 255, 0.5));
    opacity: 0.35;
    margin-bottom: 0.25rem;
  }

  .fluo-page__state-title {
    margin: 0;
    font-size: 0.95rem;
    font-weight: 550;
    color: var(--uiv2-fg-strong, var(--color-text, #fff));
  }

  .fluo-page__state-sub {
    margin: 0 0 0.65rem;
    font-size: 0.82rem;
    color: var(--uiv2-fg-muted, rgba(255, 255, 255, 0.55));
  }

  .fluo-page__skeleton-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1rem;
    margin-bottom: 1rem;
  }

  .fluo-skel {
    display: flex;
    flex-direction: column;
    gap: 0.55rem;
    padding: 0.7rem;
    border-radius: var(--uikit-v2-radius, 8px);
    border: 1px solid var(--uiv2-border-subtle, transparent);
    background: var(--uiv2-card-bg, transparent);
  }

  .fluo-skel__frame,
  .fluo-skel__line {
    border-radius: 6px;
    background: linear-gradient(
      90deg,
      var(--uiv2-skeleton-base, rgba(255, 255, 255, 0.07)) 0%,
      var(--uiv2-skeleton-highlight, rgba(255, 255, 255, 0.12)) 50%,
      var(--uiv2-skeleton-base, rgba(255, 255, 255, 0.07)) 100%
    );
    background-size: 200% 100%;
    animation: fluo-skel-shine 1.2s ease-in-out infinite;
  }

  .fluo-skel__frame {
    aspect-ratio: 16 / 9;
  }

  .fluo-skel__line {
    height: 0.7rem;
    width: 72%;
  }

  .fluo-skel__line--lg {
    width: 88%;
    height: 0.85rem;
  }

  .fluo-skel__line--sm {
    width: 42%;
  }

  @keyframes fluo-skel-shine {
    0% { background-position: 100% 0; }
    100% { background-position: -100% 0; }
  }

  .fluo-page__grid {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1rem;
  }

  .fluo-page__grid > li {
    min-width: 0;
  }

  .fluo-room {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    text-align: left;
    padding: 0.7rem;
    border: 1px solid var(--uiv2-border-subtle, var(--color-border, #333));
    border-radius: var(--uikit-v2-radius, 8px);
    background: var(--uiv2-card-bg, var(--color-surface, #161616));
    color: inherit;
    font: inherit;
    cursor: pointer;
    transition: border-color 0.15s ease, background 0.15s ease;
  }

  .fluo-room:hover,
  .fluo-room:focus-visible {
    border-color: color-mix(in srgb, var(--uikit-v2-accent, var(--color-accent)) 55%, transparent);
    outline: none;
  }

  .fluo-room:focus-visible {
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--uikit-v2-accent, var(--color-accent)) 35%, transparent);
  }

  .fluo-room__frame {
    position: relative;
    width: 100%;
    aspect-ratio: 16 / 9;
    border-radius: calc(var(--uikit-v2-radius, 8px) - 2px);
    overflow: hidden;
    background: color-mix(in srgb, #000 45%, transparent);
    display: grid;
    place-items: center;
  }

  .fluo-room__frame img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    image-rendering: auto;
  }

  .fluo-room__frame-fallback {
    opacity: 0.45;
    color: var(--uiv2-fg-muted, rgba(255, 255, 255, 0.5));
  }

  .fluo-room__live,
  .fluo-room__lock {
    position: absolute;
    display: grid;
    place-items: center;
    border-radius: var(--uikit-v2-radius, 8px);
    background: var(--uiv2-media-control-bg, rgba(0, 0, 0, 0.62));
    color: #fff;
  }

  .fluo-room__live {
    left: 8px;
    bottom: 8px;
    width: 28px;
    height: 28px;
  }

  .fluo-room__lock {
    top: 8px;
    right: 8px;
    width: 26px;
    height: 26px;
  }

  .fluo-room__body {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    padding: 0.75rem 0.15rem 0.1rem;
  }

  .fluo-room__name-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .fluo-room__name {
    font-weight: 650;
    font-size: 0.95rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--uiv2-fg-strong, var(--color-text, #fff));
  }

  .fluo-room__badge {
    flex-shrink: 0;
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    padding: 0.15rem 0.4rem;
    border-radius: 4px;
    background: var(--uiv2-surface-subtle, rgba(255, 255, 255, 0.06));
    color: var(--uiv2-fg-muted, rgba(255, 255, 255, 0.65));
  }

  .fluo-room__badge[data-vis='closed'] {
    background: color-mix(in srgb, var(--uikit-v2-accent, var(--color-accent)) 25%, transparent);
    color: var(--uiv2-fg-strong, #fff);
  }

  .fluo-room__title {
    margin: 0;
    font-size: 0.9rem;
    font-weight: 600;
    line-height: 1.35;
    overflow: hidden;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
  }

  .fluo-room__meta,
  .fluo-room__time,
  .fluo-room__count,
  .fluo-room__flags {
    color: var(--uiv2-fg-muted, rgba(255, 255, 255, 0.55));
  }

  .fluo-room__meta {
    margin: 0;
    font-size: 0.8rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .fluo-room__progress {
    height: 3px;
    border-radius: 99px;
    background: var(--uiv2-border-subtle, rgba(255, 255, 255, 0.1));
    overflow: hidden;
    margin-top: 0.2rem;
  }

  .fluo-room__progress-fill {
    display: block;
    height: 100%;
    background: var(--uikit-v2-accent, var(--color-accent));
  }

  .fluo-room__time {
    margin: 0;
    font-size: 0.7rem;
    font-variant-numeric: tabular-nums;
  }

  .fluo-room__people {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .fluo-room__foot {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.45rem 0.85rem;
    margin-top: 0.2rem;
  }

  .fluo-room__avatars {
    display: flex;
  }

  .fluo-room__avatar {
    width: 22px;
    height: 22px;
    border-radius: 50%;
    object-fit: cover;
    border: 2px solid var(--uikit-v2-bg, var(--color-bg, #111));
    margin-left: -6px;
    background: var(--uiv2-surface-subtle, #333);
    font-size: 0.65rem;
    display: inline-grid;
    place-items: center;
  }

  .fluo-room__avatar:first-child {
    margin-left: 0;
  }

  .fluo-room__avatar-btn {
    display: inline-flex;
    padding: 0;
    border: none;
    background: transparent;
    cursor: pointer;
    border-radius: 50%;
  }

  .fluo-room__avatar-btn:focus-visible {
    outline: 2px solid var(--uikit-v2-accent, var(--color-accent));
    outline-offset: 1px;
  }

  .fluo-room__count {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    font-size: 0.75rem;
  }

  .fluo-room__flags {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    font-size: 0.72rem;
  }

  .fluo-room__flags span {
    display: inline-flex;
    align-items: center;
    gap: 0.2rem;
  }

  .fluo-modal-overlay {
    position: fixed;
    inset: 0;
    z-index: 80;
    display: grid;
    place-items: center;
    padding: 1rem;
    background: var(--uiv2-overlay, rgba(0, 0, 0, 0.55));
  }

  .fluo-modal {
    width: min(480px, 100%);
    max-height: min(88vh, 720px);
    overflow: auto;
    border-radius: var(--uikit-v2-radius, 8px);
    background: var(--uiv2-panel-bg, var(--color-surface, #1c1c1e));
    border: 1px solid var(--uiv2-panel-border, var(--color-border, #333));
    box-shadow: var(--uiv2-panel-shadow, 0 16px 48px rgba(0, 0, 0, 0.45));
  }

  .fluo-modal--sm {
    width: min(360px, 100%);
  }

  .fluo-modal__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem 1rem 0.5rem;
  }

  .fluo-modal__head h2 {
    margin: 0;
    font-size: 1.15rem;
  }

  .fluo-modal__close {
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    border: none;
    border-radius: var(--uikit-v2-radius, 8px);
    background: transparent;
    color: inherit;
    cursor: pointer;
  }

  .fluo-modal__close:hover {
    background: var(--uiv2-surface-subtle, rgba(255, 255, 255, 0.08));
  }

  .fluo-modal__close:focus-visible {
    outline: 2px solid var(--uikit-v2-accent, var(--color-accent));
    outline-offset: 1px;
  }

  .fluo-modal__body {
    display: flex;
    flex-direction: column;
    gap: 0.85rem;
    padding: 0.5rem 1rem 1rem;
  }

  .fluo-modal__lead {
    margin: 0;
    font-size: 0.9rem;
    color: var(--uiv2-fg-muted, rgba(255, 255, 255, 0.55));
  }

  .fluo-modal__foot {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    padding: 0 1rem 1rem;
  }

  @container (min-width: 720px) {
    .fluo-page__grid,
    .fluo-page__skeleton-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @container (max-width: 560px) {
    .fluo-page__grid,
    .fluo-page__skeleton-grid {
      grid-template-columns: 1fr;
    }

    .fluo-page__hero-top {
      flex-direction: column;
      align-items: stretch;
    }

    .fluo-page__create {
      width: 100%;
    }

    .fluo-page__toolbar {
      flex-direction: column;
      align-items: stretch;
    }

    .fluo-page__code {
      max-width: none;
    }
  }

  @media (max-width: 640px) {
    .fluo-page__grid,
    .fluo-page__skeleton-grid {
      grid-template-columns: 1fr;
    }

    .fluo-page__hero-top {
      flex-direction: column;
      align-items: stretch;
    }

    .fluo-page__toolbar {
      flex-direction: column;
      align-items: stretch;
    }

    .fluo-page__code {
      max-width: none;
    }
  }
</style>
