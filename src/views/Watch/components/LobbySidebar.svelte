<script lang="ts">
  import type { LobbyChatMessage, LobbyParticipant } from '../_types';
  import { iconCopy, iconLogOut, iconX } from '../../../components/icons';
  import { resolveCdnAssetUrl } from '../../../utils/posterUrl';
  import UiV2Button from '../../../components/uikit-v2/UiV2Button.svelte';
  import UiV2OutlinedField from '../../../components/uikit-v2/UiV2OutlinedField.svelte';
  import UiV2RoundButton from '../../../components/uikit-v2/UiV2RoundButton.svelte';
  import { uiv2CustomScroll } from '../../../actions/uiv2CustomScroll';

  type Props = {
    roomCode: string;
    participants: LobbyParticipant[];
    messages: LobbyChatMessage[];
    actionLogOpen?: boolean;
    ontogglelog?: () => void;
    onhide: () => void;
    onleave: () => void;
    onsend: (text: string) => void;
  };

  let {
    roomCode,
    participants,
    messages,
    actionLogOpen = false,
    ontogglelog,
    onhide,
    onleave,
    onsend,
  }: Props = $props();

  let draft = $state('');
  let copyDone = $state(false);
  let chatViewport: HTMLDivElement | null = $state(null);

  const participantCount = $derived(participants.length);

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
      // ignore
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
    const tag = p.deviceId ? String(p.deviceId).slice(-4) : String(p.peerId ?? p.id).slice(-4);
    return `${login} · ${tag}`;
  }

  function formatTime(ts: number): string {
    try {
      return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  }
</script>

<aside class="watch-lobby-sidebar" aria-label="Совместный просмотр">
  <header class="watch-lobby-sidebar__header">
    <div class="watch-lobby-sidebar__header-text">
      <h2 class="watch-lobby-sidebar__title">Совместный просмотр</h2>
      {#if ontogglelog}
        <button
          type="button"
          class="watch-lobby-sidebar__log-toggle"
          class:watch-lobby-sidebar__log-toggle--active={actionLogOpen}
          aria-pressed={actionLogOpen}
          onclick={ontogglelog}
        >Журнал</button>
      {/if}
      {#if roomCode}
        <button
          type="button"
          class="watch-lobby-sidebar__code"
          class:watch-lobby-sidebar__code--done={copyDone}
          title="Скопировать код"
          onclick={copyCode}
        >
          <span>{copyDone ? 'Скопировано' : roomCode}</span>
          {@html iconCopy(14)}
        </button>
      {/if}
    </div>
    <UiV2RoundButton
      label="Скрыть панель"
      size="sm"
      class="watch-lobby-sidebar__hide"
      onclick={onhide}
    >
      {@html iconX(16)}
    </UiV2RoundButton>
  </header>

  <section class="watch-lobby-sidebar__people" aria-label="Участники">
    <div class="watch-lobby-sidebar__people-head">
      <span>Участники</span>
      <span class="watch-lobby-sidebar__count">{participantCount}</span>
    </div>
    <div class="watch-lobby-sidebar__people-list">
      {#if participants.length === 0}
        <p class="watch-lobby-sidebar__empty">Ожидание участников…</p>
      {:else}
        {#each participants as p (String(p.peerId ?? p.id))}
          <div class="watch-lobby-sidebar__person">
            <span
              class="watch-lobby-sidebar__avatar"
              class:watch-lobby-sidebar__avatar--img={!!p.avatar}
              style={p.avatar ? `background-image:url('${resolveCdnAssetUrl(p.avatar)}')` : ''}
            >
              {#if !p.avatar}{initials(p.login)}{/if}
            </span>
            <span class="watch-lobby-sidebar__name">{participantLabel(p)}</span>
          </div>
        {/each}
      {/if}
    </div>
  </section>

  <section class="watch-lobby-sidebar__chat" aria-label="Чат">
    <div
      class="watch-lobby-sidebar__messages uiv2-scroll-area uiv2-scroll-area--y"
      use:uiv2CustomScroll={{ axis: 'y' }}
    >
      <div class="uiv2-scroll-area__viewport" data-uiv2-scroll bind:this={chatViewport}>
        {#if messages.length === 0}
          <p class="watch-lobby-sidebar__empty">Напишите первое сообщение</p>
        {:else}
          {#each messages as msg (msg.id)}
            {#if msg.system}
              <p class="watch-lobby-sidebar__system">{msg.text}</p>
            {:else}
              <article class="watch-lobby-sidebar__msg" class:watch-lobby-sidebar__msg--self={msg.self}>
                <span
                  class="watch-lobby-sidebar__avatar watch-lobby-sidebar__avatar--sm"
                  class:watch-lobby-sidebar__avatar--img={!!msg.avatar}
                  style={msg.avatar ? `background-image:url('${resolveCdnAssetUrl(msg.avatar)}')` : ''}
                >
                  {#if !msg.avatar}{initials(msg.login)}{/if}
                </span>
                <div class="watch-lobby-sidebar__bubble">
                  <div class="watch-lobby-sidebar__meta">
                    <span class="watch-lobby-sidebar__msg-name">{msg.self ? 'Вы' : msg.login}</span>
                    <span class="watch-lobby-sidebar__msg-time">{formatTime(msg.ts)}</span>
                  </div>
                  <p class="watch-lobby-sidebar__msg-text">{msg.text}</p>
                </div>
              </article>
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
      <UiV2OutlinedField
        label="Сообщение"
        bind:value={draft}
        maxlength={500}
      />
      <UiV2Button
        label="Отправить"
        variant="primary"
        size="sm"
        disabled={!draft.trim()}
        onclick={send}
      />
    </form>
  </section>

  <footer class="watch-lobby-sidebar__footer">
    <UiV2Button
      label="Покинуть комнату"
      variant="danger"
      size="sm"
      block
      onclick={onleave}
    >
      {#snippet icon()}
        {@html iconLogOut(14)}
      {/snippet}
    </UiV2Button>
  </footer>
</aside>
