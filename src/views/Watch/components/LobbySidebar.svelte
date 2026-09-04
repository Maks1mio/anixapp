<script lang="ts">
  import type { LobbyChatMessage, LobbyParticipant } from '../_types';
  import {
    iconArrowUp,
    iconBan,
    iconClipboardList,
    iconCopy,
    iconLogOut,
    iconStar,
    iconUsers,
  } from '../../../components/icons';
  import { resolveCdnAssetUrl } from '../../../utils/posterUrl';
  import UiV2RoundButton from '../../../components/uikit-v2/UiV2RoundButton.svelte';
  import UiV2Tooltip from '../../../components/uikit-v2/UiV2Tooltip.svelte';
  import UiV2PopupMenu, { type UiV2PopupMenuItem } from '../../../components/uikit-v2/UiV2PopupMenu.svelte';
  import { slide } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { uiv2CustomScroll } from '../../../actions/uiv2CustomScroll';

  const NAME_COLORS = [
    '#FF8A7A', '#F0B429', '#7DDE8A', '#6EC8FF',
    '#C9A0FF', '#FF8EC8', '#5EEAD4', '#E8A87C',
    '#9AB8FF', '#F3D15A',
  ];

  type Props = {
    roomCode: string;
    participants: LobbyParticipant[];
    messages: LobbyChatMessage[];
    myPeerId?: string | null;
    iAmHost?: boolean;
    actionLogOpen?: boolean;
    ontogglelog?: () => void;
    collapsed?: boolean;
    onleave: () => void;
    onsend: (text: string) => void;
    onkick?: (peerId: string) => void;
    ontransferHost?: (peerId: string) => void;
  };

  let {
    roomCode,
    participants,
    messages,
    myPeerId = null,
    iAmHost = false,
    actionLogOpen = false,
    ontogglelog,
    collapsed = false,
    onleave,
    onsend,
    onkick,
    ontransferHost,
  }: Props = $props();

  let draft = $state('');
  let copyDone = $state(false);
  let peopleOpen = $state(false);
  let chatViewport: HTMLDivElement | null = $state(null);

  let menuOpen = $state(false);
  let menuX = $state(0);
  let menuY = $state(0);
  let menuPeerId = $state<string | null>(null);
  let menuLogin = $state('');

  const participantCount = $derived(participants.length);
  const canSend = $derived(draft.trim().length > 0);

  const menuItems = $derived.by((): UiV2PopupMenuItem[] => {
    if (!iAmHost || !menuPeerId) return [];
    return [
      {
        id: 'transfer-host',
        label: 'Передать хост',
        icon: iconStar(16, false),
      },
      {
        id: 'kick',
        label: 'Выгнать',
        icon: iconBan(16),
        danger: true,
        dividerBefore: true,
      },
    ];
  });

  $effect(() => {
    messages.length;
    queueMicrotask(() => {
      const el = chatViewport;
      if (el) el.scrollTop = el.scrollHeight;
    });
  });

  async function copyCode() {
    if (!roomCode) return;
    try {
      await navigator.clipboard.writeText(roomCode);
      copyDone = true;
      setTimeout(() => { copyDone = false; }, 1500);
    } catch {
      /* ignore */
    }
  }

  function send() {
    const text = draft.trim();
    if (!text) return;
    onsend(text);
    draft = '';
  }

  function initials(login: string): string {
    return (login[0] ?? '?').toUpperCase();
  }

  function participantLabel(p: LobbyParticipant): string {
    const login = p.login?.trim() || 'Пользователь';
    const dupes = participants.filter((x) => x.login === p.login).length;
    if (dupes <= 1) return login;
    const tag = String(p.peerId ?? '').slice(-4);
    return `${login} · ${tag}`;
  }

  function formatTime(ts: number): string {
    try {
      return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  }

  function nameColor(login: string): string {
    let hash = 0;
    for (let i = 0; i < login.length; i++) hash = login.charCodeAt(i) + ((hash << 5) - hash);
    return NAME_COLORS[Math.abs(hash) % NAME_COLORS.length];
  }

  function onComposerKey(e: KeyboardEvent) {
    if (e.key !== 'Enter' || e.shiftKey) return;
    e.preventDefault();
    send();
  }

  function canModerate(p: LobbyParticipant): boolean {
    if (!iAmHost) return false;
    const pid = p.peerId != null ? String(p.peerId) : '';
    if (!pid) return false;
    if (myPeerId && pid === myPeerId) return false;
    if (p.isHost) return false;
    return true;
  }

  function openParticipantMenu(p: LobbyParticipant, e: MouseEvent) {
    if (!canModerate(p)) return;
    e.preventDefault();
    e.stopPropagation();
    menuPeerId = String(p.peerId);
    menuLogin = participantLabel(p);
    const el = e.currentTarget instanceof HTMLElement ? e.currentTarget : null;
    const rect = el?.getBoundingClientRect();
    menuX = e.clientX || (rect ? rect.left + rect.width / 2 : 0);
    menuY = e.clientY || (rect ? rect.bottom : 0);
    menuOpen = true;
  }

  function onMenuSelect(id: string) {
    const peerId = menuPeerId;
    menuOpen = false;
    if (!peerId) return;
    if (id === 'kick') onkick?.(peerId);
    if (id === 'transfer-host') ontransferHost?.(peerId);
  }
</script>

<aside
  class="watch-lobby-sidebar"
  class:watch-lobby-sidebar--collapsed={collapsed}
  aria-label="Чат комнаты"
  aria-hidden={collapsed}
  inert={collapsed ? true : undefined}
>
  <div class="watch-lobby-sidebar__inner">
  <header class="watch-lobby-sidebar__header">
    <div class="watch-lobby-sidebar__header-main">
      <h2 class="watch-lobby-sidebar__title">Чат комнаты</h2>
      <div class="watch-lobby-sidebar__header-meta">
        {#if roomCode}
          <UiV2Tooltip text={copyDone ? 'Скопировано' : 'Скопировать код'} placement="bottom" showDelay={80}>
            <button
              type="button"
              class="watch-lobby-sidebar__code"
              class:watch-lobby-sidebar__code--done={copyDone}
              onclick={copyCode}
            >
              <span>{copyDone ? 'Скопировано' : roomCode}</span>
              {@html iconCopy(12)}
            </button>
          </UiV2Tooltip>
        {/if}
        <span class="watch-lobby-sidebar__viewers" aria-label={`${participantCount} участников`}>
          {@html iconUsers(12)}
          {participantCount}
        </span>
      </div>
    </div>
    <div class="watch-lobby-sidebar__header-actions">
      <UiV2Tooltip text="Участники" placement="bottom" showDelay={80}>
        <UiV2RoundButton
          label="Участники"
          size="sm"
          class={peopleOpen ? 'watch-lobby-sidebar__tool watch-lobby-sidebar__tool--on' : 'watch-lobby-sidebar__tool'}
          ariaExpanded={peopleOpen}
          onclick={() => { peopleOpen = !peopleOpen; }}
        >
          {@html iconUsers(15)}
        </UiV2RoundButton>
      </UiV2Tooltip>
      {#if ontogglelog}
        <UiV2Tooltip text="Журнал" placement="bottom" showDelay={80}>
          <UiV2RoundButton
            label="Журнал"
            size="sm"
            class={actionLogOpen ? 'watch-lobby-sidebar__tool watch-lobby-sidebar__tool--on' : 'watch-lobby-sidebar__tool'}
            ariaExpanded={actionLogOpen}
            onclick={ontogglelog}
          >
            {@html iconClipboardList(15)}
          </UiV2RoundButton>
        </UiV2Tooltip>
      {/if}
      <UiV2Tooltip text="Покинуть комнату" placement="bottom" showDelay={80}>
        <UiV2RoundButton
          label="Покинуть комнату"
          size="sm"
          class="watch-lobby-sidebar__tool watch-lobby-sidebar__tool--danger"
          onclick={onleave}
        >
          {@html iconLogOut(15)}
        </UiV2RoundButton>
      </UiV2Tooltip>
    </div>
  </header>

  {#if peopleOpen}
    <section
      class="watch-lobby-sidebar__people"
      aria-label="Участники"
      transition:slide={{ duration: 180, easing: cubicOut }}
    >
      {#if participants.length === 0}
        <p class="watch-lobby-sidebar__empty">Ожидание участников…</p>
      {:else}
        {#each participants as p (String(p.peerId ?? p.login))}
          <div
            class="watch-lobby-sidebar__person"
            class:watch-lobby-sidebar__person--actionable={canModerate(p)}
            role={canModerate(p) ? 'button' : undefined}
            tabindex={canModerate(p) ? 0 : undefined}
            oncontextmenu={(e) => openParticipantMenu(p, e)}
            onkeydown={(e) => {
              if (!canModerate(p)) return;
              if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
                openParticipantMenu(p, e as unknown as MouseEvent);
              }
            }}
          >
            <span
              class="watch-lobby-sidebar__avatar"
              class:watch-lobby-sidebar__avatar--img={!!p.avatar}
              style={p.avatar
                ? `background-image:url('${resolveCdnAssetUrl(p.avatar)}')`
                : `background:${nameColor(p.login || '')}`}
            >
              {#if !p.avatar}{initials(p.login)}{/if}
            </span>
            <span class="watch-lobby-sidebar__name" style={`color:${nameColor(p.login || '')}`}>
              {participantLabel(p)}
              {#if p.isHost}
                <span class="watch-lobby-sidebar__host-badge">хост</span>
              {/if}
            </span>
          </div>
        {/each}
      {/if}
    </section>
  {/if}

  <section class="watch-lobby-sidebar__chat" aria-label="Сообщения">
    <div
      class="watch-lobby-sidebar__messages uiv2-scroll-area uiv2-scroll-area--y"
      use:uiv2CustomScroll={{ axis: 'y' }}
    >
      <div class="uiv2-scroll-area__viewport" data-uiv2-scroll bind:this={chatViewport}>
        {#if messages.length === 0}
          <p class="watch-lobby-sidebar__empty">Добро пожаловать в чат комнаты. Напишите первое сообщение.</p>
        {:else}
          {#each messages as msg (msg.id)}
            {#if msg.system}
              <p class="watch-lobby-sidebar__system">{msg.text}</p>
            {:else}
              <p class="watch-lobby-sidebar__line" class:watch-lobby-sidebar__line--self={msg.self}>
                <time class="watch-lobby-sidebar__line-time" datetime={new Date(msg.ts).toISOString()}>
                  {formatTime(msg.ts)}
                </time>
                <span
                  class="watch-lobby-sidebar__line-name"
                  style={`color:${msg.self ? 'var(--uikit-v2-accent)' : nameColor(msg.login)}`}
                >{msg.self ? 'Вы' : msg.login}</span>
                <span class="watch-lobby-sidebar__line-text">{msg.text}</span>
              </p>
            {/if}
          {/each}
        {/if}
      </div>
      <div class="uiv2-scroll-area__v-track" aria-hidden="true">
        <div class="uiv2-scroll-area__v-thumb"></div>
      </div>
    </div>

    <form
      class="watch-lobby-sidebar__composer"
      onsubmit={(e) => { e.preventDefault(); send(); }}
    >
      <label class="watch-lobby-sidebar__sr" for="lobby-chat-input">Сообщение</label>
      <input
        id="lobby-chat-input"
        class="watch-lobby-sidebar__input"
        type="text"
        maxlength={500}
        placeholder="Написать в чат…"
        autocomplete="off"
        bind:value={draft}
        onkeydown={onComposerKey}
      />
      <button
        type="submit"
        class="watch-lobby-sidebar__send"
        disabled={!canSend}
        aria-label="Отправить"
      >
        {@html iconArrowUp(16)}
      </button>
    </form>
  </section>
  </div>
</aside>

<UiV2PopupMenu
  open={menuOpen}
  x={menuX}
  y={menuY}
  placement="point"
  title={menuLogin || 'Участник'}
  items={menuItems}
  onClose={() => { menuOpen = false; menuPeerId = null; }}
  onSelect={onMenuSelect}
/>
