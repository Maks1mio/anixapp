<script lang="ts">
  import { onDestroy, tick } from 'svelte';
  import { fly, slide } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { AgentApiError } from '../../services/agent-api';
  import {
    TICKET_CATEGORIES,
    TICKET_STATUSES,
    fetchTicket,
    patchTicket,
    postTicketMessage,
    ticketImageUrl,
    uploadScreenshot,
    type SupportStreamEvent,
    type Ticket,
    type TicketCategory,
    type TicketMessage,
  } from '../../services/support-api';
  import { renderAgentMarkdown } from '../../utils/agent-markdown';
  import { openFeedMediaLightbox } from '../../utils/feed-media-lightbox';
  import {
    iconArrowUp,
    iconChevronDown,
    iconLayoutList,
    iconLock,
    iconPaperclip,
    iconRotateCcw,
    iconX,
  } from '../../components/icons';
  import UiV2Button from '../../components/uikit-v2/UiV2Button.svelte';
  import UiV2Tooltip from '../../components/uikit-v2/UiV2Tooltip.svelte';
  import AgentFace from './AgentFace.svelte';
  import { PERSONA_LOOKS, moodFromActivity, personaId, type PersonaId } from './personas';

  interface Props {
    /** null — the «new ticket» screen. */
    ticketId: string | null;
    persona: PersonaId;
    admin: boolean;
    sideCollapsed: boolean;
    client: { version: string | null; platform: string | null };
    onToggleSide: () => void;
    onOpenPanel: () => void;
    /** A ticket was created or changed — refresh it in the list / select it. */
    onTicket: (ticket: Ticket, created: boolean) => void;
  }

  let { ticketId, persona, admin, sideCollapsed, client, onToggleSide, onOpenPanel, onTicket }: Props = $props();

  const MAX_LEN = 4000;
  const MAX_IMAGES = 6;
  const POLL_MS = 5000;

  interface Attachment {
    key: string;
    preview: string;
    url: string | null;
    error?: string;
  }

  let ticket = $state<Ticket | null>(null);
  let messages = $state<TicketMessage[]>([]);
  let viewerId = $state(0);
  let loading = $state(false);
  let loadError = $state('');
  let input = $state('');
  let attachments = $state<Attachment[]>([]);
  let category = $state<TicketCategory>('bug');
  let sending = $state(false);
  let banner = $state('');
  let summaryOpen = $state(false);
  let dragOver = $state(false);
  /** Bot answer in flight (streamed). */
  let live = $state<{ persona: PersonaId; text: string; status: string | null; activity: string | null } | null>(null);

  let scroller = $state<HTMLDivElement | null>(null);
  let textarea = $state<HTMLTextAreaElement | null>(null);
  let fileInput = $state<HTMLInputElement | null>(null);
  let abort: AbortController | null = null;
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let keySeq = 0;
  let loadedFor: string | null = null;

  const lastId = $derived(messages.at(-1)?.id ?? 0);
  const closed = $derived(ticket?.status === 'closed');
  const owner = $derived(!!ticket && ticket.user_id === viewerId);
  const uploading = $derived(attachments.some((a) => !a.url && !a.error));
  const readyImages = $derived(attachments.filter((a) => a.url).map((a) => a.url as string));
  const canSend = $derived(!sending && !uploading && (input.trim().length > 0 || readyImages.length > 0) && !(closed && !admin));
  const canReopen = $derived(!!ticket && closed && (admin || ticket.closed_by === 'user'));
  const look = $derived(PERSONA_LOOKS[ticket?.persona ? personaId(ticket.persona) : persona]);

  // ── loading & polling ─────────────────────────────────────────────────────

  $effect(() => {
    const id = ticketId;
    if (id === loadedFor) return;
    loadedFor = id;
    abort?.abort();
    abort = null;
    sending = false;
    live = null;
    banner = '';
    ticket = null;
    messages = [];
    if (id) void load(id);
    else void tick().then(() => textarea?.focus());
  });

  async function load(id: string) {
    loading = true;
    loadError = '';
    try {
      const res = await fetchTicket(id);
      if (ticketId !== id) return;
      ticket = res.ticket;
      messages = res.messages;
      viewerId = res.viewer.user_id;
      loading = false;
      await scrollToBottom();
    } catch (err) {
      loadError = err instanceof Error ? err.message : String(err);
    } finally {
      loading = false;
    }
  }

  async function poll() {
    const id = ticketId;
    if (!id || sending || loading || document.hidden) return;
    try {
      const res = await fetchTicket(id, lastId);
      if (ticketId !== id || sending) return;
      const fresh = res.messages.filter((m) => !messages.some((x) => x.id === m.id));
      if (fresh.length) {
        const near = isNearBottom();
        messages = [...messages, ...fresh];
        if (near) void scrollToBottom(true);
      }
      if (res.ticket.updated_at !== ticket?.updated_at) {
        ticket = res.ticket;
        onTicket(res.ticket, false);
      }
    } catch {
      /* next tick */
    }
  }

  $effect(() => {
    if (!ticketId) return;
    pollTimer = setInterval(() => void poll(), POLL_MS);
    return () => {
      if (pollTimer) clearInterval(pollTimer);
      pollTimer = null;
    };
  });

  onDestroy(() => {
    abort?.abort();
    for (const a of attachments) URL.revokeObjectURL(a.preview);
  });

  function isNearBottom(): boolean {
    return !scroller || scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 140;
  }

  async function scrollToBottom(smooth = false) {
    await tick();
    scroller?.scrollTo({ top: scroller.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  }

  // ── attachments ───────────────────────────────────────────────────────────

  function addFiles(files: Iterable<File>) {
    for (const file of files) {
      if (!file.type.startsWith('image/')) continue;
      if (attachments.length >= MAX_IMAGES) {
        banner = `Можно прикрепить до ${MAX_IMAGES} картинок`;
        break;
      }
      keySeq += 1;
      const item: Attachment = { key: `f${keySeq}`, preview: URL.createObjectURL(file), url: null };
      attachments.push(item);
      const key = item.key;
      uploadScreenshot(file)
        .then((url) => {
          const i = attachments.findIndex((a) => a.key === key);
          if (i >= 0) attachments[i] = { ...attachments[i], url };
        })
        .catch((err) => {
          const i = attachments.findIndex((a) => a.key === key);
          if (i >= 0) attachments[i] = { ...attachments[i], error: err instanceof Error ? err.message : 'Ошибка' };
        });
    }
  }

  function removeAttachment(key: string) {
    const a = attachments.find((x) => x.key === key);
    if (a) URL.revokeObjectURL(a.preview);
    attachments = attachments.filter((x) => x.key !== key);
  }

  function onPaste(e: ClipboardEvent) {
    const files = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith('image/'));
    if (files.length) {
      e.preventDefault();
      addFiles(files);
    }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    dragOver = false;
    if (e.dataTransfer?.files?.length) addFiles(e.dataTransfer.files);
  }

  // ── sending ───────────────────────────────────────────────────────────────

  async function send() {
    if (!canSend) return;
    const text = input.trim().slice(0, MAX_LEN);
    const images = readyImages;
    const creating = !ticketId;
    input = '';
    for (const a of attachments) URL.revokeObjectURL(a.preview);
    attachments = [];
    resizeTextarea();
    sending = true;
    banner = '';
    abort = new AbortController();
    const ctrl = abort;
    const onEvent = (e: SupportStreamEvent) => {
      if (ctrl.signal.aborted) return;
      switch (e.type) {
        case 'ticket':
          ticket = e.ticket;
          onTicket(e.ticket, creating && loadedFor === null);
          if (creating && loadedFor === null) loadedFor = e.ticket.id; // keep the thread, don't reload
          break;
        case 'message':
          if (!messages.some((m) => m.id === e.message.id)) messages = [...messages, e.message];
          if (e.message.author_kind === 'bot') live = null;
          if (e.message.author_kind === 'user' || e.message.author_kind === 'admin') viewerId ||= e.message.author_id ?? 0;
          void scrollToBottom(true);
          break;
        case 'status':
          live = { persona: personaId(e.persona), text: live?.text ?? '', status: e.text, activity: e.activity };
          void scrollToBottom(true);
          break;
        case 'delta':
          live = { persona: personaId(e.persona), text: (live?.text ?? '') + e.text, status: null, activity: null };
          if (isNearBottom()) void scrollToBottom();
          break;
        case 'error':
          banner = e.message;
          break;
      }
    };
    try {
      await postTicketMessage(
        ticketId,
        { message: text, images, persona, ...(creating ? { category, client } : {}) },
        onEvent,
        ctrl.signal,
      );
    } catch (err) {
      const e = err instanceof AgentApiError ? err : null;
      banner = e?.message ?? 'Не получилось отправить';
      if (!messages.length || e?.code === 'support_limit' || e?.code === 'ticket_closed') input = text;
    } finally {
      if (abort === ctrl) abort = null;
      sending = false;
      live = null;
    }
  }

  async function setStatus(action: 'close' | 'reopen' | 'pending' | 'open') {
    if (!ticket) return;
    let reason: string | undefined;
    if (action === 'close' && admin && !owner) {
      reason = prompt('Причина закрытия (необязательно)') ?? undefined;
    } else if (action === 'close' && !confirm('Закрыть обращение?')) return;
    try {
      const res = await patchTicket(ticket.id, { action, reason });
      if (res.ticket) {
        ticket = res.ticket;
        onTicket(res.ticket, false);
      }
      await poll();
    } catch (err) {
      banner = err instanceof Error ? err.message : String(err);
    }
  }

  async function setCategory(next: TicketCategory) {
    if (!ticket || !admin) return;
    try {
      const res = await patchTicket(ticket.id, { action: 'edit', category: next });
      if (res.ticket) {
        ticket = res.ticket;
        onTicket(res.ticket, false);
      }
    } catch (err) {
      banner = err instanceof Error ? err.message : String(err);
    }
  }

  function resizeTextarea() {
    void tick().then(() => {
      if (!textarea) return;
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 220)}px`;
    });
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      void send();
    }
  }

  function openImages(list: { url: string }[], index: number, el: HTMLElement) {
    openFeedMediaLightbox(list.map((img) => ({ url: ticketImageUrl(img.url), kind: 'image' as const })), index, el);
  }

  function time(iso: string): string {
    const d = new Date(iso);
    const today = new Date().toDateString() === d.toDateString();
    return d.toLocaleString('ru-RU', today ? { hour: '2-digit', minute: '2-digit' } : { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  }

  function authorName(m: TicketMessage): string {
    if (m.author_kind === 'bot') return PERSONA_LOOKS[personaId(m.persona)].name;
    if (m.author_kind === 'admin') return m.author_login ?? 'Команда';
    return m.author_login ?? 'Пользователь';
  }
</script>

<section class="support" style:--agent-accent={look.accent}>
  <header class="support__head">
    <UiV2Tooltip text={sideCollapsed ? 'Показать список' : 'Скрыть список'} placement="bottom">
      <button type="button" class="support-icon-btn support__side-btn" aria-label="Список обращений" onclick={onToggleSide}>
        {@html iconLayoutList(17)}
      </button>
    </UiV2Tooltip>
    <button type="button" class="support-icon-btn support__panel-btn" aria-label="Список обращений" onclick={onOpenPanel}>
      {@html iconLayoutList(17)}
    </button>
    {#if ticket}
      <div class="support__title">
        <span class="support__name">{ticket.title}</span>
        <span class="support__meta">
          #{ticket.number}
          <span class="support-status support-status--{ticket.status}">{TICKET_STATUSES[ticket.status]}</span>
          {#if admin}
            <select
              class="support__cat"
              value={ticket.category}
              aria-label="Категория"
              onchange={(e) => void setCategory((e.currentTarget as HTMLSelectElement).value as TicketCategory)}
            >
              {#each Object.entries(TICKET_CATEGORIES) as [id, name] (id)}
                <option value={id}>{name}</option>
              {/each}
            </select>
            {#if !owner && ticket.login}· {ticket.login}{/if}
          {:else}
            · {TICKET_CATEGORIES[ticket.category]}
          {/if}
        </span>
      </div>
      <div class="support__actions">
        {#if admin && !closed}
          {#if ticket.status === 'pending'}
            <UiV2Button label="Взять в работу" variant="chrome" size="sm" onclick={() => void setStatus('open')} />
          {:else}
            <UiV2Button label="Ждёт команду" variant="chrome" size="sm" onclick={() => void setStatus('pending')} />
          {/if}
        {/if}
        {#if !closed && (owner || admin)}
          <UiV2Button label="Закрыть" variant="chrome" size="sm" onclick={() => void setStatus('close')} />
        {:else if canReopen}
          <UiV2Button label="Открыть снова" variant="chrome" size="sm" onclick={() => void setStatus('reopen')}>
            {#snippet icon()}{@html iconRotateCcw(14)}{/snippet}
          </UiV2Button>
        {/if}
      </div>
    {:else}
      <div class="support__title">
        <span class="support__name">Поддержка AnixApp</span>
        <span class="support__meta">Канна и Ася разберутся, а если нужно — позовут команду</span>
      </div>
    {/if}
  </header>

  {#if admin && ticket?.summary}
    <div class="support-summary">
      <button type="button" class="support-summary__toggle" aria-expanded={summaryOpen} onclick={() => (summaryOpen = !summaryOpen)}>
        Резюме для команды
        <span class="support-summary__chev" class:support-summary__chev--open={summaryOpen} aria-hidden="true">{@html iconChevronDown(12)}</span>
      </button>
      {#if summaryOpen}
        <div class="support-summary__text" transition:slide={{ duration: 180 }}>{@html renderAgentMarkdown(ticket.summary)}</div>
      {/if}
    </div>
  {/if}

  <div class="support__scroll" bind:this={scroller}>
    <div class="support__inner">
      {#if loading}
        <div class="support-center"><AgentFace {persona} mood="think" size={80} /></div>
      {:else if loadError}
        <div class="support-center">
          <AgentFace {persona} mood="sad" size={96} />
          <p class="support-muted">{loadError}</p>
          {#if ticketId}<UiV2Button label="Повторить" variant="chrome" onclick={() => ticketId && void load(ticketId)} />{/if}
        </div>
      {:else if !ticketId && !messages.length}
        <div class="support-hero" in:fly={{ y: 12, duration: 320, easing: cubicOut }}>
          <AgentFace {persona} mood="wave" size={120} />
          <h1 class="support-hero__title">Что случилось?</h1>
          <p class="support-muted support-hero__text">
            Опиши проблему, идею или вопрос по приложению и прикрепи скриншот, если есть.
            {PERSONA_LOOKS[persona].name} посмотрит код приложения и передаст обращение команде, когда нужно. Запросы здесь не тратятся.
          </p>
          <div class="support-cats" role="radiogroup" aria-label="Тема">
            {#each Object.entries(TICKET_CATEGORIES) as [id, name] (id)}
              <button
                type="button"
                role="radio"
                aria-checked={category === id}
                class="support-cat"
                class:support-cat--on={category === id}
                onclick={() => (category = id as TicketCategory)}
              >
                {name}
              </button>
            {/each}
          </div>
        </div>
      {:else}
        <div class="support-thread">
          {#each messages as m (m.id)}
            {#if m.author_kind === 'system'}
              <p class="support-sys" in:fly={{ y: 6, duration: 220 }}>{m.content}</p>
            {:else if m.author_kind === 'bot'}
              <div class="support-msg support-msg--bot" in:fly={{ y: 8, duration: 260 }} style:--msg-accent={PERSONA_LOOKS[personaId(m.persona)].accent}>
                <div class="support-msg__head">
                  <AgentFace persona={personaId(m.persona)} size={34} />
                  <span class="support-msg__name">{authorName(m)}</span>
                  <span class="support-msg__time">{time(m.created_at)}</span>
                </div>
                <div class="support-msg__text">{@html renderAgentMarkdown(m.content)}</div>
              </div>
            {:else}
              {@const mine = m.author_id === viewerId}
              <div class="support-msg" class:support-msg--mine={mine} class:support-msg--admin={m.author_kind === 'admin'} in:fly={{ y: 8, duration: 260 }}>
                {#if !mine}
                  <span class="support-msg__who">
                    {authorName(m)}
                    {#if m.author_kind === 'admin'}<span class="support-team">Команда</span>{/if}
                    <span class="support-msg__time">{time(m.created_at)}</span>
                  </span>
                {/if}
                {#if m.content && m.content !== '(скриншот)'}
                  <div class="support-msg__bubble">{m.content}</div>
                {/if}
                {#if m.images.length}
                  <div class="support-shots">
                    {#each m.images as img, i (img.url)}
                      <button
                        type="button"
                        class="support-shot"
                        title={admin && img.description ? `Помощница видит: ${img.description}` : 'Открыть'}
                        onclick={(e) => openImages(m.images, i, e.currentTarget)}
                      >
                        <img src={ticketImageUrl(img.url)} alt="Скриншот {i + 1}" loading="lazy" />
                      </button>
                    {/each}
                  </div>
                {/if}
                {#if mine}<span class="support-msg__time support-msg__time--mine">{time(m.created_at)}</span>{/if}
              </div>
            {/if}
          {/each}

          {#if live}
            <div class="support-msg support-msg--bot" style:--msg-accent={PERSONA_LOOKS[live.persona].accent}>
              <div class="support-msg__head">
                <AgentFace
                  persona={live.persona}
                  mood={live.status ? moodFromActivity(live.activity ?? undefined) : live.text ? 'write' : 'think'}
                  size={34}
                />
                <span class="support-msg__name">{PERSONA_LOOKS[live.persona].name}</span>
                {#if live.status}<span class="support-live">{live.status}</span>{/if}
              </div>
              {#if live.text}
                <div class="support-msg__text support-msg__text--streaming">{@html renderAgentMarkdown(live.text)}</div>
              {:else if !live.status}
                <span class="support-live">Думает…</span>
              {/if}
            </div>
          {/if}
        </div>
      {/if}
    </div>
  </div>

  {#if !loading && !loadError}
    <footer class="support-composer-wrap">
      {#if banner}
        <div class="support-banner" role="status" transition:fly={{ y: 6, duration: 180 }}>
          {banner}
          <button type="button" aria-label="Скрыть" onclick={() => (banner = '')}>{@html iconX(13)}</button>
        </div>
      {/if}
      {#if closed && !admin}
        <div class="support-closed">
          <span class="support-closed__icon" aria-hidden="true">{@html iconLock(16)}</span>
          <div>
            <b>Обращение закрыто</b>
            {#if ticket?.close_reason}<p>{ticket.close_reason}</p>{/if}
          </div>
          {#if canReopen}
            <UiV2Button label="Открыть снова" variant="chrome" size="sm" onclick={() => void setStatus('reopen')} />
          {/if}
        </div>
      {:else}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          class="support-composer"
          class:support-composer--drag={dragOver}
          ondragover={(e) => {
            e.preventDefault();
            dragOver = true;
          }}
          ondragleave={() => (dragOver = false)}
          ondrop={onDrop}
        >
          {#if attachments.length}
            <div class="support-attach">
              {#each attachments as a (a.key)}
                <div class="support-attach__item" class:support-attach__item--busy={!a.url && !a.error} class:support-attach__item--err={!!a.error} title={a.error ?? ''}>
                  <img src={a.preview} alt="" />
                  <button type="button" class="support-attach__rm" aria-label="Убрать" onclick={() => removeAttachment(a.key)}>{@html iconX(11)}</button>
                </div>
              {/each}
            </div>
          {/if}
          <textarea
            bind:this={textarea}
            bind:value={input}
            rows="1"
            maxlength={MAX_LEN}
            placeholder={ticket
              ? ticket.admin_joined
                ? 'Сообщение… (напиши «Ася» или «Канна», чтобы позвать помощницу)'
                : 'Ответить…'
              : 'Опиши, что случилось: что делал, что ожидал, что произошло…'}
            oninput={resizeTextarea}
            onkeydown={onKeydown}
            onpaste={onPaste}
            aria-label="Сообщение в поддержку"
          ></textarea>
          <div class="support-composer__bar">
            <UiV2Tooltip text="Прикрепить скриншот (можно вставить Ctrl+V)" placement="top">
              <button
                type="button"
                class="support-icon-btn"
                aria-label="Прикрепить скриншот"
                disabled={attachments.length >= MAX_IMAGES}
                onclick={() => fileInput?.click()}
              >
                {@html iconPaperclip(16)}
              </button>
            </UiV2Tooltip>
            <input
              bind:this={fileInput}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              multiple
              hidden
              onchange={(e) => {
                const el = e.currentTarget as HTMLInputElement;
                if (el.files) addFiles(el.files);
                el.value = '';
              }}
            />
            {#if ticket?.admin_joined}
              <span class="support-composer__hint">В обращении команда — помощницы отвечают, только если их позвать</span>
            {/if}
            <button type="button" class="support-send" aria-label="Отправить" disabled={!canSend} onclick={() => void send()}>
              {@html iconArrowUp(18)}
            </button>
          </div>
        </div>
      {/if}
    </footer>
  {/if}
</section>

<style>
  .support {
    position: relative;
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  .support::before {
    content: '';
    position: absolute;
    inset: 0 0 auto;
    height: 14rem;
    background: radial-gradient(60% 100% at 50% 0%, color-mix(in srgb, var(--agent-accent) 8%, transparent), transparent 75%);
    pointer-events: none;
  }

  .support__head {
    position: relative;
    z-index: 1;
    display: flex;
    align-items: center;
    gap: 0.65rem;
    padding: 0.75rem 1rem;
    border-bottom: 1px solid color-mix(in srgb, var(--uikit-v2-text, #fff) 6%, transparent);
  }

  .support__head .support__panel-btn {
    display: none;
  }

  .support__title {
    display: flex;
    flex-direction: column;
    min-width: 0;
    gap: 0.15rem;
  }

  .support__name {
    font-weight: 750;
    font-size: 0.98rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .support__meta {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.76rem;
    color: var(--uikit-v2-muted, #999);
    white-space: nowrap;
  }

  .support__cat {
    padding: 0.05rem 0.3rem;
    border: 1px solid color-mix(in srgb, var(--uikit-v2-text, #fff) 12%, transparent);
    border-radius: 0.4rem;
    background: var(--uikit-v2-surface, #1e1e1e);
    color: var(--uikit-v2-text, #fff);
    font: inherit;
    font-size: 0.74rem;
  }

  .support__actions {
    margin-left: auto;
    display: flex;
    gap: 0.4rem;
    flex: none;
  }

  .support-status {
    padding: 0.05rem 0.45rem;
    border-radius: 999px;
    font-size: 0.7rem;
    font-weight: 700;
    background: color-mix(in srgb, #4caf7a 20%, transparent);
    color: #6fd39b;
  }

  .support-status--pending {
    background: color-mix(in srgb, #e8a33d 22%, transparent);
    color: #f0b75a;
  }

  .support-status--closed {
    background: color-mix(in srgb, var(--uikit-v2-text, #fff) 10%, transparent);
    color: var(--uikit-v2-muted, #999);
  }

  .support-icon-btn {
    display: inline-grid;
    place-items: center;
    width: 2rem;
    height: 2rem;
    border: 0;
    border-radius: 0.55rem;
    background: transparent;
    color: var(--uikit-v2-muted, #999);
    cursor: pointer;
    transition:
      background 0.15s ease,
      color 0.15s ease;
  }

  .support-icon-btn:hover:not(:disabled),
  .support-icon-btn:focus-visible {
    background: color-mix(in srgb, var(--uikit-v2-text, #fff) 9%, transparent);
    color: var(--uikit-v2-text, #fff);
    outline: none;
  }

  .support-icon-btn:disabled {
    opacity: 0.4;
    cursor: default;
  }

  .support-summary {
    position: relative;
    z-index: 1;
    max-width: 47rem;
    width: 100%;
    margin: 0.5rem auto 0;
    padding: 0 1.5rem;
    box-sizing: border-box;
  }

  .support-summary__toggle {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0.3rem 0.6rem;
    border: 1px dashed color-mix(in srgb, var(--agent-accent) 45%, transparent);
    border-radius: 0.6rem;
    background: color-mix(in srgb, var(--agent-accent) 6%, transparent);
    color: var(--uikit-v2-text, #fff);
    font-size: 0.78rem;
    cursor: pointer;
  }

  .support-summary__chev {
    display: inline-flex;
    transition: transform 0.2s ease;
  }

  .support-summary__chev--open {
    transform: rotate(180deg);
  }

  .support-summary__text {
    margin-top: 0.45rem;
    padding: 0.6rem 0.8rem;
    border-radius: 0.7rem;
    background: color-mix(in srgb, var(--uikit-v2-text, #fff) 4%, transparent);
    font-size: 0.84rem;
    line-height: 1.55;
  }

  .support__scroll {
    position: relative;
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    scrollbar-width: thin;
  }

  .support__inner {
    max-width: 47rem;
    min-height: 100%;
    margin: 0 auto;
    padding: 1.25rem 1.5rem 1.5rem;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
  }

  .support-center,
  .support-hero {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.85rem;
    text-align: center;
  }

  .support-hero__title {
    margin: 0;
    font-size: 1.7rem;
    font-weight: 800;
  }

  .support-hero__text {
    max-width: 32rem;
    line-height: 1.6;
  }

  .support-muted {
    margin: 0;
    color: var(--uikit-v2-muted, #999);
  }

  .support-cats {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 0.4rem;
    margin-top: 0.5rem;
  }

  .support-cat {
    padding: 0.45rem 0.9rem;
    border: 1px solid color-mix(in srgb, var(--uikit-v2-text, #fff) 10%, transparent);
    border-radius: 999px;
    background: color-mix(in srgb, var(--uikit-v2-text, #fff) 3%, transparent);
    color: var(--uikit-v2-muted, #999);
    font-size: 0.84rem;
    font-weight: 600;
    cursor: pointer;
    transition:
      background 0.15s ease,
      color 0.15s ease,
      border-color 0.15s ease;
  }

  .support-cat:hover,
  .support-cat:focus-visible {
    color: var(--uikit-v2-text, #fff);
    outline: none;
  }

  .support-cat--on {
    border-color: color-mix(in srgb, var(--agent-accent) 55%, transparent);
    background: color-mix(in srgb, var(--agent-accent) 14%, transparent);
    color: var(--uikit-v2-text, #fff);
  }

  /* ── thread ── */
  .support-thread {
    display: flex;
    flex-direction: column;
    gap: 1.4rem;
  }

  .support-sys {
    margin: 0;
    align-self: center;
    padding: 0.25rem 0.75rem;
    border-radius: 999px;
    background: color-mix(in srgb, var(--uikit-v2-text, #fff) 5%, transparent);
    color: var(--uikit-v2-muted, #999);
    font-size: 0.76rem;
    text-align: center;
  }

  .support-msg {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.35rem;
    max-width: 100%;
  }

  .support-msg--mine {
    align-items: flex-end;
  }

  .support-msg__head {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .support-msg__name {
    font-size: 0.86rem;
    font-weight: 700;
  }

  .support-msg__who {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.78rem;
    font-weight: 650;
    color: var(--uikit-v2-muted, #999);
  }

  .support-team {
    padding: 0.03rem 0.4rem;
    border-radius: 0.35rem;
    background: color-mix(in srgb, var(--uikit-v2-accent, #e35454) 22%, transparent);
    color: var(--uikit-v2-accent, #e35454);
    font-size: 0.66rem;
    font-weight: 750;
  }

  .support-msg__time {
    font-size: 0.7rem;
    font-weight: 500;
    color: var(--uikit-v2-muted, #999);
    opacity: 0.8;
  }

  .support-msg__bubble {
    max-width: min(34rem, 85%);
    padding: 0.65rem 0.95rem;
    border-radius: 1.15rem;
    border: 1px solid color-mix(in srgb, var(--uikit-v2-text, #fff) 6%, transparent);
    background: var(--uikit-v2-surface, #1e1e1e);
    font-size: 0.93rem;
    line-height: 1.55;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  .support-msg--mine .support-msg__bubble {
    background: color-mix(in srgb, var(--agent-accent) 10%, var(--uikit-v2-surface, #1e1e1e));
  }

  .support-msg--admin .support-msg__bubble {
    border-color: color-mix(in srgb, var(--uikit-v2-accent, #e35454) 35%, transparent);
  }

  .support-msg__text {
    font-size: 0.94rem;
    line-height: 1.66;
    overflow-wrap: anywhere;
  }

  .support-msg__text :global(p) {
    margin: 0 0 0.7rem;
  }

  .support-msg__text :global(p:last-child),
  .support-msg__text :global(ul:last-child),
  .support-msg__text :global(ol:last-child) {
    margin-bottom: 0;
  }

  .support-msg__text :global(ul),
  .support-msg__text :global(ol) {
    margin: 0 0 0.7rem;
    padding-left: 1.3rem;
  }

  .support-msg__text :global(li::marker) {
    color: var(--msg-accent);
  }

  .support-msg__text :global(code) {
    padding: 0.05rem 0.35rem;
    border-radius: 0.35rem;
    background: color-mix(in srgb, var(--uikit-v2-text, #fff) 9%, transparent);
    font-family: var(--uikit-v2-mono, monospace);
    font-size: 0.85em;
  }

  .support-msg__text--streaming :global(> :last-child)::after {
    content: '';
    display: inline-block;
    width: 0.55rem;
    height: 0.55rem;
    margin-left: 0.3rem;
    border-radius: 50%;
    background: var(--msg-accent);
    animation: support-caret 1s ease-in-out infinite;
  }

  @keyframes support-caret {
    50% {
      transform: scale(0.55);
      opacity: 0.5;
    }
  }

  .support-live {
    font-size: 0.8rem;
    color: var(--uikit-v2-muted, #999);
    background: linear-gradient(90deg, var(--uikit-v2-muted, #999) 30%, var(--uikit-v2-text, #fff) 50%, var(--uikit-v2-muted, #999) 70%);
    background-size: 200% 100%;
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
    animation: support-shimmer 1.8s linear infinite;
  }

  @keyframes support-shimmer {
    from {
      background-position: 100% 0;
    }
    to {
      background-position: -100% 0;
    }
  }

  .support-shots {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    max-width: min(34rem, 85%);
  }

  .support-msg--mine .support-shots {
    justify-content: flex-end;
  }

  .support-shot {
    width: 9rem;
    height: 6rem;
    padding: 0;
    border: 0;
    border-radius: 0.7rem;
    overflow: hidden;
    background: color-mix(in srgb, var(--uikit-v2-text, #fff) 6%, transparent);
    cursor: zoom-in;
  }

  .support-shot img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    transition: transform 0.25s ease;
  }

  .support-shot:hover img {
    transform: scale(1.05);
  }

  /* ── composer ── */
  .support-composer-wrap {
    max-width: 47rem;
    width: 100%;
    margin: 0 auto;
    padding: 0.25rem 1.5rem 0.85rem;
    box-sizing: border-box;
  }

  .support-banner {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    margin-bottom: 0.5rem;
    padding: 0.5rem 0.75rem;
    border-radius: 0.7rem;
    background: color-mix(in srgb, var(--uikit-v2-danger, #ff5b5b) 14%, transparent);
    font-size: 0.84rem;
  }

  .support-banner button {
    margin-left: auto;
    border: 0;
    background: none;
    color: inherit;
    cursor: pointer;
  }

  .support-closed {
    display: flex;
    align-items: center;
    gap: 0.8rem;
    padding: 0.8rem 1rem;
    border-radius: 1rem;
    background: color-mix(in srgb, var(--uikit-v2-text, #fff) 5%, transparent);
  }

  .support-closed p {
    margin: 0.15rem 0 0;
    font-size: 0.82rem;
    color: var(--uikit-v2-muted, #999);
  }

  .support-closed > :global(:last-child) {
    margin-left: auto;
  }

  .support-closed__icon {
    display: inline-flex;
    color: var(--uikit-v2-muted, #999);
  }

  .support-composer {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    padding: 0.8rem 0.6rem 0.55rem 1rem;
    border: 1px solid color-mix(in srgb, var(--uikit-v2-text, #fff) 10%, transparent);
    border-radius: 1.4rem;
    background: var(--uikit-v2-surface, #1e1e1e);
    box-shadow: 0 10px 34px rgba(0, 0, 0, 0.26);
    transition:
      border-color 0.2s ease,
      box-shadow 0.2s ease;
  }

  .support-composer:focus-within,
  .support-composer--drag {
    border-color: color-mix(in srgb, var(--agent-accent) 50%, transparent);
    box-shadow:
      0 10px 34px rgba(0, 0, 0, 0.26),
      0 0 0 4px color-mix(in srgb, var(--agent-accent) 10%, transparent);
  }

  .support-composer textarea {
    min-height: 1.6rem;
    max-height: 220px;
    padding: 0.1rem 0.4rem 0.1rem 0;
    border: 0;
    outline: none;
    resize: none;
    background: transparent;
    color: var(--uikit-v2-text, #fff);
    font: inherit;
    font-size: 0.95rem;
    line-height: 1.55;
    scrollbar-width: thin;
  }

  .support-composer textarea::placeholder {
    color: var(--uikit-v2-muted, #999);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .support-composer__bar {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-left: -0.45rem;
  }

  .support-composer__hint {
    min-width: 0;
    font-size: 0.72rem;
    color: var(--uikit-v2-muted, #999);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .support-send {
    display: inline-grid;
    place-items: center;
    flex: none;
    margin-left: auto;
    width: 2.3rem;
    height: 2.3rem;
    border: 0;
    border-radius: 0.8rem;
    background: var(--agent-accent);
    color: #fff;
    cursor: pointer;
    transition:
      transform 0.15s ease,
      opacity 0.15s ease;
  }

  .support-send:disabled {
    opacity: 0.3;
    cursor: default;
  }

  .support-send:not(:disabled):hover {
    transform: translateY(-1px) scale(1.04);
  }

  .support-attach {
    display: flex;
    flex-wrap: wrap;
    gap: 0.45rem;
  }

  .support-attach__item {
    position: relative;
    width: 4.2rem;
    height: 3.2rem;
    border-radius: 0.55rem;
    overflow: hidden;
    background: color-mix(in srgb, var(--uikit-v2-text, #fff) 6%, transparent);
  }

  .support-attach__item img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .support-attach__item--busy img {
    opacity: 0.45;
    animation: support-pulse 1.1s ease-in-out infinite;
  }

  .support-attach__item--err {
    outline: 2px solid var(--uikit-v2-danger, #ff5b5b);
  }

  @keyframes support-pulse {
    50% {
      opacity: 0.8;
    }
  }

  .support-attach__rm {
    position: absolute;
    top: 0.15rem;
    right: 0.15rem;
    display: grid;
    place-items: center;
    width: 1.1rem;
    height: 1.1rem;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: rgba(0, 0, 0, 0.7);
    color: #fff;
    cursor: pointer;
  }

  @container (max-width: 760px) {
    .support__head .support__panel-btn {
      display: inline-grid;
    }

    .support__head :global(.uiv2-tooltip__trigger:has(.support__side-btn)) {
      display: none;
    }

    .support__inner,
    .support-composer-wrap,
    .support-summary {
      padding-left: 0.85rem;
      padding-right: 0.85rem;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .support-live,
    .support-attach__item--busy img,
    .support-msg__text--streaming :global(> :last-child)::after {
      animation: none;
    }
  }
</style>
