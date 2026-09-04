<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { flip } from 'svelte/animate';
  import { fly, fade } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { listFluoRooms, type FluoRoomListItem } from '../../fluo/rooms-api';
  import { subscribeFluoCatalog } from '../../fluo/catalog-ws';
  import type { FluoAnimeSelectMode, FluoControlMode, FluoCreateRoomOptions, FluoRoomVisibility } from '../../fluo/types';
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
  import UiV2Select, { type UiV2SelectOption } from '../../components/uikit-v2/UiV2Select.svelte';
  import UiV2Tooltip from '../../components/uikit-v2/UiV2Tooltip.svelte';

  let rooms = $state<FluoRoomListItem[]>([]);
  let loadState = $state<'loading' | 'ready' | 'error'>('loading');
  let errorMsg = $state('');
  let joinCode = $state('');
  let joinBusy = $state(false);
  let joinHint = $state('');
  let joinHintError = $state(false);

  let createOpen = $state(false);
  let createName = $state('');
  let createVisibility = $state<FluoRoomVisibility>('public');
  let createPassword = $state('');
  let createControl = $state<FluoControlMode>('everyone');
  let createAnime = $state<FluoAnimeSelectMode>('everyone');
  let createChat = $state(true);
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
    if (!silent && rooms.length === 0) loadState = 'loading';
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

  const visibilityOptions: UiV2SelectOption[] = [
    { value: 'public', label: 'Публичный', desc: 'В каталоге, войти может любой' },
    { value: 'private', label: 'Приватный', desc: 'Скрыт из каталога, вход по коду' },
    { value: 'closed', label: 'Закрытый', desc: 'В каталоге, вход только с паролем' },
  ];
  const playerControlOptions: UiV2SelectOption[] = [
    { value: 'host', label: 'Хост', desc: 'Play, пауза, перемотка и серии текущего тайтла' },
    { value: 'everyone', label: 'Могут все', desc: 'Свободное управление плеером' },
  ];
  const animeSelectOptions: UiV2SelectOption[] = [
    { value: 'host', label: 'Хост', desc: 'Хост сам решает, что смотреть' },
    { value: 'everyone', label: 'Могут все', desc: 'Свободное переключение тайтла' },
    { value: 'vote', label: 'Могут все (голосование)', desc: 'Смена тайтла через голосование' },
  ];
  const chatOptions: UiV2SelectOption[] = [
    { value: 'on', label: 'Включён' },
    { value: 'off', label: 'Выключен' },
  ];

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
    createName = '';
    createVisibility = 'public';
    createPassword = '';
    createControl = 'everyone';
    createAnime = 'everyone';
    createChat = true;
    createHint = '';
    createOpen = true;
  }

  async function submitCreate() {
    if (createVisibility === 'closed' && !createPassword.trim()) {
      createHint = 'Укажите пароль для закрытой комнаты';
      return;
    }
    createBusy = true;
    createHint = '';
    const options: FluoCreateRoomOptions = {
      name: createName.trim() || undefined,
      visibility: createVisibility,
      password: createVisibility === 'closed' ? createPassword : undefined,
      settings: {
        controlMode: createControl === 'host' ? 'host' : 'everyone',
        animeSelectMode: createAnime,
        chatEnabled: createChat,
      },
    };
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

<div class="fluo-page">
  <header class="fluo-page__header">
    <div class="fluo-page__title-row">
      <span class="fluo-page__brand-icon" aria-hidden="true">{@html iconSignal(22)}</span>
      <h1 class="fluo-page__title">Fluo</h1>
      <p class="fluo-page__subtitle">Комнаты совместного просмотра</p>
    </div>
    <div class="fluo-page__actions">
      <div class="fluo-page__join">
        <UiV2OutlinedField
          label="Код комнаты"
          bind:value={joinCode}
          maxlength={12}
          autocomplete="off"
          spellcheck={false}
          oninput={() => { joinHint = ''; joinHintError = false; }}
        />
        <UiV2Button
          label={joinBusy ? 'Вход…' : 'Войти'}
          variant="chrome"
          disabled={joinBusy}
          onclick={() => void handleQuickJoin()}
        />
      </div>
      <UiV2Button
        label="Создать комнату"
        variant="primary"
        onclick={openCreate}
      >
        {#snippet icon()}{@html iconPlus(16)}{/snippet}
      </UiV2Button>
    </div>
    {#if joinHint}
      <p class="fluo-page__hint" class:fluo-page__hint--error={joinHintError} role="status">{joinHint}</p>
    {/if}
  </header>

  {#if loadState === 'loading'}
    <p class="fluo-page__status" transition:fade={{ duration: 160 }}>Загрузка комнат…</p>
  {:else if loadState === 'error'}
    <p class="fluo-page__status fluo-page__status--error" transition:fade={{ duration: 160 }}>{errorMsg}</p>
    <UiV2Button label="Повторить" variant="chrome" onclick={() => void refreshRooms()} />
  {:else if rooms.length === 0}
    <p class="fluo-page__status" transition:fade={{ duration: 180 }}>Пока нет активных комнат. Создайте первую.</p>
  {:else}
    <ul class="fluo-page__grid" role="list">
      {#each rooms as room (room.roomId || room.code)}
        <li
          animate:flip={{ duration: 360, easing: cubicOut }}
          in:fly={{ y: 18, duration: 300, easing: cubicOut }}
          out:fly={{ y: -10, duration: 220, easing: cubicOut }}
        >
          <article
            class="fluo-room"
            tabindex="0"
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
          </article>
        </li>
      {/each}
    </ul>
  {/if}
</div>

{#if createOpen}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div
    class="fluo-modal-overlay"
    role="dialog"
    aria-modal="true"
    aria-label="Создать комнату"
    tabindex="-1"
    onclick={(e) => { if (e.target === e.currentTarget) createOpen = false; }}
  >
    <div class="fluo-modal">
      <div class="fluo-modal__head">
        <h2>Создать комнату</h2>
        <button type="button" class="fluo-modal__close" aria-label="Закрыть" onclick={() => { createOpen = false; }}>
          {@html iconX(18)}
        </button>
      </div>
      <div class="fluo-modal__body">
        <UiV2OutlinedField label="Название" bind:value={createName} maxlength={80} />

        <UiV2Select
          label="Настройки комнаты"
          options={visibilityOptions}
          value={createVisibility}
          onChange={(v) => {
            if (v === 'public' || v === 'private' || v === 'closed') createVisibility = v;
          }}
        />

        {#if createVisibility === 'closed'}
          <UiV2OutlinedField
            label="Пароль"
            type="password"
            revealable
            bind:value={createPassword}
            maxlength={64}
            required
          />
        {/if}

        <UiV2Select
          label="Управление плеером"
          options={playerControlOptions}
          value={createControl}
          onChange={(v) => {
            if (v === 'host' || v === 'everyone') createControl = v;
          }}
        />

        <UiV2Select
          label="Выбор аниме"
          options={animeSelectOptions}
          value={createAnime}
          onChange={(v) => {
            if (v === 'host' || v === 'everyone' || v === 'vote') createAnime = v;
          }}
        />

        <UiV2Select
          label="Настройки чата"
          options={chatOptions}
          value={createChat ? 'on' : 'off'}
          onChange={(v) => { createChat = v === 'on'; }}
        />

        {#if createHint}
          <p class="fluo-page__hint fluo-page__hint--error" role="alert">{createHint}</p>
        {/if}
      </div>
      <div class="fluo-modal__foot">
        <UiV2Button label="Отмена" variant="ghost" onclick={() => { createOpen = false; }} />
        <UiV2Button
          label={createBusy ? 'Создание…' : 'Создать'}
          variant="primary"
          disabled={createBusy}
          onclick={() => void submitCreate()}
        />
      </div>
    </div>
  </div>
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
    padding: 1.25rem 1.5rem 2.5rem;
    max-width: 1120px;
  }

  .fluo-page__header {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    margin-bottom: 1.5rem;
  }

  .fluo-page__title-row {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.5rem 0.75rem;
  }

  .fluo-page__brand-icon {
    display: inline-flex;
    color: var(--uikit-v2-accent, var(--color-accent));
  }

  .fluo-page__title {
    margin: 0;
    font-size: 1.75rem;
    font-weight: 700;
    letter-spacing: -0.02em;
  }

  .fluo-page__subtitle {
    margin: 0;
    color: var(--color-text-secondary, rgba(255, 255, 255, 0.55));
    font-size: 0.95rem;
  }

  .fluo-page__actions {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    gap: 0.75rem 1rem;
  }

  .fluo-page__join {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    gap: 0.5rem;
    flex: 1 1 240px;
    max-width: 420px;
  }

  .fluo-page__join :global(.uiv2-outlined-field) {
    flex: 1 1 140px;
  }

  .fluo-page__hint {
    margin: 0;
    font-size: 0.875rem;
    color: var(--color-text-secondary, rgba(255, 255, 255, 0.6));
  }

  .fluo-page__hint--error {
    color: var(--color-danger, #f07178);
  }

  .fluo-page__status {
    margin: 2rem 0;
    color: var(--color-text-secondary, rgba(255, 255, 255, 0.55));
  }

  .fluo-page__status--error {
    color: var(--color-danger, #f07178);
  }

  .fluo-page__grid {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1.1rem;
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
    border: 1px solid color-mix(in srgb, var(--color-border, #333) 80%, transparent);
    border-radius: 14px;
    background: color-mix(in srgb, var(--color-surface, #161616) 94%, #000);
    color: inherit;
    cursor: pointer;
    transition: border-color 0.15s ease, background 0.15s ease;
  }

  .fluo-room:hover,
  .fluo-room:focus-visible {
    border-color: var(--uikit-v2-accent, var(--color-accent));
    outline: none;
  }

  .fluo-room__frame {
    position: relative;
    width: 100%;
    aspect-ratio: 16 / 9;
    border-radius: 10px;
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
  }

  .fluo-room__live {
    position: absolute;
    left: 8px;
    bottom: 8px;
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    border-radius: 8px;
    background: rgba(0, 0, 0, 0.62);
    color: #fff;
  }

  .fluo-room__lock {
    position: absolute;
    top: 8px;
    right: 8px;
    display: grid;
    place-items: center;
    width: 26px;
    height: 26px;
    border-radius: 8px;
    background: rgba(0, 0, 0, 0.62);
    color: #fff;
  }

  .fluo-room__body {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    padding: 0.75rem 0.2rem 0.15rem;
  }

  .fluo-room__name-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .fluo-room__name {
    font-weight: 700;
    font-size: 0.95rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .fluo-room__badge {
    flex-shrink: 0;
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    padding: 0.15rem 0.4rem;
    border-radius: 4px;
    background: color-mix(in srgb, var(--color-border, #444) 60%, transparent);
  }

  .fluo-room__badge[data-vis='closed'] {
    background: color-mix(in srgb, var(--uikit-v2-accent, var(--color-accent)) 25%, transparent);
  }

  .fluo-room__badge[data-vis='private'] {
    background: color-mix(in srgb, var(--color-border, #444) 80%, transparent);
  }

  .fluo-room__title {
    margin: 0;
    font-size: 0.92rem;
    font-weight: 600;
    line-height: 1.35;
    overflow: hidden;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
  }

  .fluo-room__meta {
    margin: 0;
    font-size: 0.8rem;
    color: var(--color-text-secondary, rgba(255, 255, 255, 0.55));
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .fluo-room__progress {
    height: 3px;
    border-radius: 99px;
    background: color-mix(in srgb, var(--color-border, #444) 70%, transparent);
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
    color: var(--color-text-secondary, rgba(255, 255, 255, 0.5));
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
    border: 2px solid var(--color-surface, #1a1a1a);
    margin-left: -6px;
    background: #333;
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
    color: var(--color-text-secondary, rgba(255, 255, 255, 0.55));
  }

  .fluo-room__flags {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    font-size: 0.72rem;
    color: var(--color-text-secondary, rgba(255, 255, 255, 0.5));
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
    background: rgba(0, 0, 0, 0.55);
  }

  .fluo-modal {
    width: min(480px, 100%);
    max-height: min(88vh, 720px);
    overflow: auto;
    border-radius: 14px;
    background: var(--color-surface, #1c1c1e);
    border: 1px solid var(--color-border, #333);
    box-shadow: 0 16px 48px rgba(0, 0, 0, 0.45);
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
    border-radius: 8px;
    background: transparent;
    color: inherit;
    cursor: pointer;
  }

  .fluo-modal__close:hover {
    background: color-mix(in srgb, #fff 8%, transparent);
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
    color: var(--color-text-secondary, rgba(255, 255, 255, 0.55));
  }

  .fluo-modal__fieldset {
    margin: 0;
    padding: 0;
    border: none;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  .fluo-modal__fieldset legend {
    font-size: 0.8rem;
    font-weight: 600;
    margin-bottom: 0.25rem;
    color: var(--color-text-secondary, rgba(255, 255, 255, 0.65));
  }

  .fluo-modal__radio,
  .fluo-modal__check {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.9rem;
    cursor: pointer;
  }

  .fluo-modal__foot {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    padding: 0 1rem 1rem;
  }

  @media (max-width: 860px) {
    .fluo-page {
      padding: 1rem;
    }

    .fluo-page__grid {
      grid-template-columns: 1fr;
    }

    .fluo-page__actions {
      flex-direction: column;
      align-items: stretch;
    }

    .fluo-page__join {
      max-width: none;
    }
  }
</style>
