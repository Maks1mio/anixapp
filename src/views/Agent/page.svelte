<script lang="ts">
  import { onDestroy, onMount, tick } from 'svelte';
  import {
    AgentApiError,
    deleteConversation,
    fetchAgentMe,
    fetchConversation,
    fetchConversations,
    renameConversation,
    resetAgentSession,
    sendFeedback,
    streamAgentChat,
    type AgentConversation,
    type AgentMe,
    type AgentMessage,
    type AgentQuota,
    type AgentStreamEvent,
  } from '../../services/agent-api';
  import { fetchBadgeCatalog } from '../../services/badges-api';
  import { getAgentProfileSnapshot, resetAgentProfileSnapshot } from '../../services/agent-profile';
  import { isAuthenticated, requireAuth } from '../../stores/auth';
  import { navigate } from '../../stores/navigation';
  import { openSupportModal } from '../../stores/support-promo';
  import {
    iconArrowUp,
    iconCheck,
    iconLayoutList,
    iconLock,
    iconPencil,
    iconPlus,
    iconTrash2,
    iconX,
  } from '../../components/icons';
  import UiV2Button from '../../components/uikit-v2/UiV2Button.svelte';
  import UiV2Toggle from '../../components/uikit-v2/UiV2Toggle.svelte';
  import UiV2Tooltip from '../../components/uikit-v2/UiV2Tooltip.svelte';
  import AgentOrb from './AgentOrb.svelte';
  import AgentMessageView from './AgentMessageView.svelte';
  import type { ViewMessage } from './types';

  const MAX_LEN = 2000;
  /** Survives leaving the tab: the open chat is restored on return. */
  const LAST_CHAT_KEY = 'anixapp.agent.lastChat';
  const PROFILE_PREF_KEY = 'anixapp.agent.allowProfile';

  type Boot = 'loading' | 'ready' | 'guest' | 'error';

  let boot = $state<Boot>('loading');
  let bootError = $state('');
  let me = $state<AgentMe | null>(null);
  let quota = $state<AgentQuota | null>(null);
  let conversations = $state<AgentConversation[]>([]);
  let activeId = $state<string | null>(null);
  let messages = $state<ViewMessage[]>([]);
  let loadingConv = $state(false);
  let sending = $state(false);
  let input = $state('');
  let banner = $state('');
  let panelOpen = $state(false);
  let renamingId = $state<string | null>(null);
  let renameText = $state('');
  let tierLimits = $state<Array<{ name: string; limit: number }>>([]);
  let allowProfile = $state(readProfilePref());

  let scroller = $state<HTMLDivElement | null>(null);
  let textarea = $state<HTMLTextAreaElement | null>(null);
  let stickBottom = true;
  let abort: AbortController | null = null;
  let keySeq = 0;
  /** Bumped when the visible chat changes: a stream started for another view stops touching the screen. */
  let viewSeq = 0;

  /** Switch views without killing an answer in flight — anixback still finishes and saves it. */
  function detachStream() {
    viewSeq += 1;
    abort = null;
    sending = false;
  }

  const agentName = $derived(me?.name ?? 'Канна');
  const locked = $derived(!!quota && quota.limit <= 0);
  const outOfQuota = $derived(!!quota && quota.limit > 0 && quota.remaining <= 0);
  const canSend = $derived(!sending && !locked && !outOfQuota && input.trim().length > 0 && boot === 'ready');
  const lastAssistant = $derived([...messages].reverse().find((m) => m.role === 'assistant') ?? null);
  const resetTime = $derived(
    quota ? new Date(quota.resets_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '',
  );

  function readProfilePref(): boolean {
    try {
      return localStorage.getItem(PROFILE_PREF_KEY) !== '0';
    } catch {
      return true;
    }
  }

  function setAllowProfile(next: boolean) {
    allowProfile = next;
    try {
      localStorage.setItem(PROFILE_PREF_KEY, next ? '1' : '0');
    } catch {
      /* storage blocked */
    }
  }

  function readLastChat(): string | null {
    try {
      return sessionStorage.getItem(LAST_CHAT_KEY);
    } catch {
      return null;
    }
  }

  function rememberChat(id: string | null) {
    try {
      if (id) sessionStorage.setItem(LAST_CHAT_KEY, id);
      else sessionStorage.removeItem(LAST_CHAT_KEY);
    } catch {
      /* storage blocked */
    }
  }

  function key(): string {
    keySeq += 1;
    return `m${Date.now()}-${keySeq}`;
  }

  function toView(m: AgentMessage): ViewMessage {
    return {
      key: `s${m.id}`,
      id: m.id,
      role: m.role,
      content: m.content,
      releases: m.attachments?.releases ?? [],
      actions: m.attachments?.actions ?? [],
      feedback: m.feedback,
    };
  }

  function requestsWord(n: number): string {
    const m10 = n % 10;
    const m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return 'запрос';
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 'запроса';
    return 'запросов';
  }

  function describe(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
  }

  // ── boot ────────────────────────────────────────────────────────────────

  async function load() {
    boot = 'loading';
    bootError = '';
    if (!$isAuthenticated) {
      boot = 'guest';
      return;
    }
    try {
      const [meRes, convs] = await Promise.all([fetchAgentMe(), fetchConversations()]);
      me = meRes;
      quota = meRes.quota;
      conversations = convs;
      boot = 'ready';
      if (meRes.quota.limit <= 0) void loadTierLimits();
      const last = readLastChat();
      if (last && convs.some((c) => c.id === last) && !activeId) void openConversation(last);
    } catch (err) {
      if (err instanceof AgentApiError && err.code === 'not_logged_in') {
        boot = 'guest';
        return;
      }
      bootError = describe(err);
      boot = 'error';
    }
  }

  async function loadTierLimits() {
    const types = await fetchBadgeCatalog();
    tierLimits = types
      .filter((t) => t.slug.startsWith('teer-') && typeof t.agent_daily_limit === 'number')
      .map((t) => ({ name: t.name, limit: t.agent_daily_limit as number }));
  }

  // Account switch / logout → start over with a fresh session.
  let lastAuth: boolean | null = null;
  const unsubAuth = isAuthenticated.subscribe((v) => {
    if (lastAuth !== null && v !== lastAuth) {
      resetAgentSession();
      resetAgentProfileSnapshot();
      newChat();
      void load();
    }
    lastAuth = v;
  });

  onMount(() => {
    void load();
  });

  // Leaving the tab mid-answer does NOT abort: anixback finishes and saves the answer,
  // and the chat is reloaded from the server when the user comes back.
  onDestroy(() => {
    unsubAuth();
  });

  // ── conversations ───────────────────────────────────────────────────────

  function newChat() {
    detachStream();
    activeId = null;
    rememberChat(null);
    messages = [];
    banner = '';
    panelOpen = false;
    void tick().then(() => textarea?.focus());
  }

  async function openConversation(id: string) {
    if (id === activeId && messages.length) {
      panelOpen = false;
      return;
    }
    detachStream();
    activeId = id;
    rememberChat(id);
    messages = [];
    banner = '';
    panelOpen = false;
    loadingConv = true;
    try {
      const res = await fetchConversation(id);
      if (activeId !== id) return;
      messages = res.messages.map(toView);
      loadingConv = false; // render the thread first, then jump to its end
      stickBottom = true;
      await scrollToBottom();
    } catch (err) {
      banner = describe(err);
    } finally {
      loadingConv = false;
    }
  }

  async function removeConversation(c: AgentConversation) {
    if (!confirm(`Удалить чат «${c.title}»?`)) return;
    try {
      await deleteConversation(c.id);
      conversations = conversations.filter((x) => x.id !== c.id);
      if (activeId === c.id) newChat();
    } catch (err) {
      banner = describe(err);
    }
  }

  function startRename(c: AgentConversation) {
    renamingId = c.id;
    renameText = c.title;
  }

  async function commitRename() {
    const id = renamingId;
    const title = renameText.replace(/\s+/g, ' ').trim();
    renamingId = null;
    if (!id || !title) return;
    const prev = conversations;
    conversations = conversations.map((c) => (c.id === id ? { ...c, title } : c));
    try {
      await renameConversation(id, title);
    } catch (err) {
      conversations = prev;
      banner = describe(err);
    }
  }

  function bumpConversation(id: string, title: string) {
    const now = new Date().toISOString();
    const existing = conversations.find((c) => c.id === id);
    const updated: AgentConversation = existing
      ? { ...existing, updated_at: now, messages: existing.messages + 2 }
      : { id, title, created_at: now, updated_at: now, messages: 2 };
    conversations = [updated, ...conversations.filter((c) => c.id !== id)];
  }

  // ── sending ─────────────────────────────────────────────────────────────

  async function scrollToBottom(smooth = false) {
    await tick();
    if (!scroller || !stickBottom) return;
    scroller.scrollTo({ top: scroller.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  }

  function onScroll() {
    if (!scroller) return;
    stickBottom = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 120;
  }

  function patchLast(fn: (m: ViewMessage) => ViewMessage) {
    const i = messages.length - 1;
    if (i < 0 || messages[i].role !== 'assistant') return;
    messages[i] = fn(messages[i]);
  }

  async function run(body: { message?: string; regenerate?: boolean }, userText: string | null) {
    sending = true;
    banner = '';
    stickBottom = true;
    const userKey = userText != null ? key() : null;
    if (userText != null && userKey) {
      messages.push({ key: userKey, id: null, role: 'user', content: userText, releases: [], actions: [], feedback: null });
    }
    messages.push({ key: key(), id: null, role: 'assistant', content: '', releases: [], actions: [], feedback: null, streaming: true });
    await scrollToBottom(true);

    abort = new AbortController();
    const ctrl = abort;
    const myView = viewSeq;
    const visible = () => viewSeq === myView;
    const onEvent = (e: AgentStreamEvent) => {
      if (!visible()) {
        // Answer for a chat that's no longer on screen: just keep the list order fresh.
        if (e.type === 'meta') bumpConversation(e.conversation_id, e.title);
        if (e.type === 'done') quota = e.quota;
        return;
      }
      switch (e.type) {
        case 'meta':
          if (!activeId) {
            activeId = e.conversation_id;
            rememberChat(e.conversation_id);
          }
          bumpConversation(e.conversation_id, e.title);
          if (userKey && e.user_message_id != null) {
            const idx = messages.findIndex((m) => m.key === userKey);
            if (idx >= 0) messages[idx] = { ...messages[idx], id: e.user_message_id };
          }
          break;
        case 'status':
          patchLast((m) => ({ ...m, status: e.text }));
          break;
        case 'delta':
          patchLast((m) => ({ ...m, content: m.content + e.text, status: undefined }));
          break;
        case 'cards':
          patchLast((m) => ({ ...m, releases: e.releases }));
          break;
        case 'actions':
          patchLast((m) => ({ ...m, actions: e.actions }));
          break;
        case 'done':
          patchLast(() => toView(e.message));
          quota = e.quota;
          break;
        case 'error':
          patchLast((m) => ({ ...m, streaming: false, status: undefined, error: e.message }));
          if (e.quota) quota = e.quota;
          break;
      }
      void scrollToBottom();
    };

    try {
      // Profile data comes from the app itself (anixback never holds the Anixart token).
      const profile = allowProfile ? await getAgentProfileSnapshot() : null;
      await streamAgentChat(
        { ...body, conversation_id: activeId, allow_profile: allowProfile, profile: profile ?? undefined },
        onEvent,
        ctrl.signal,
      );
      if (!visible()) return;
      if (ctrl.signal.aborted) {
        patchLast((m) => ({
          ...m,
          streaming: false,
          status: undefined,
          error: m.content ? 'Ответ остановлен — он не сохранится в истории' : 'Остановлено',
        }));
      } else {
        // Stream ended without done/error (proxy cut it) — don't leave a spinner.
        patchLast((m) => (m.streaming ? { ...m, streaming: false, status: undefined, error: 'Соединение прервалось' } : m));
      }
    } catch (err) {
      if (!visible()) return;
      const e = err instanceof AgentApiError ? err : new AgentApiError('network', describe(err));
      if (e.code === 'limit_reached' || e.code === 'no_tier') {
        // Nothing was saved server-side: undo the optimistic bubbles, give the text back.
        messages = messages.filter((m) => !(m.key === userKey || (m.role === 'assistant' && m.streaming)));
        if (userText != null) input = userText;
        banner = e.message;
        try {
          quota = (await fetchAgentMe()).quota;
        } catch {
          /* keep old quota */
        }
      } else {
        patchLast((m) => ({ ...m, streaming: false, status: undefined, error: e.message }));
      }
    } finally {
      if (visible()) {
        if (abort === ctrl) abort = null;
        sending = false;
        void scrollToBottom();
      }
    }
  }

  async function send(text?: string) {
    const message = (text ?? input).trim().slice(0, MAX_LEN);
    if (!message || sending || locked || outOfQuota) return;
    input = '';
    resizeTextarea();
    await run({ message }, message);
  }

  async function regenerate() {
    if (sending || !activeId) return;
    const i = messages.length - 1;
    if (i >= 0 && messages[i].role === 'assistant') messages = messages.slice(0, i);
    await run({ regenerate: true }, null);
  }

  function stop() {
    abort?.abort();
  }

  async function feedback(m: ViewMessage, value: -1 | 1) {
    if (m.id == null) return;
    const next = m.feedback === value ? 0 : value;
    const idx = messages.findIndex((x) => x.key === m.key);
    if (idx >= 0) messages[idx] = { ...messages[idx], feedback: next || null };
    try {
      await sendFeedback(m.id, next as -1 | 0 | 1);
    } catch {
      /* not critical */
    }
  }

  // ── composer ────────────────────────────────────────────────────────────

  function resizeTextarea() {
    void tick().then(() => {
      if (!textarea) return;
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
    });
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      void send();
    } else if (e.key === 'Escape' && sending) {
      stop();
    }
  }

  function groupLabel(iso: string): string {
    const d = new Date(iso);
    const now = new Date();
    const days = Math.floor((new Date(now.toDateString()).getTime() - new Date(d.toDateString()).getTime()) / 86_400_000);
    if (days <= 0) return 'Сегодня';
    if (days === 1) return 'Вчера';
    if (days < 7) return 'На этой неделе';
    return 'Раньше';
  }

  const grouped = $derived.by(() => {
    const out: Array<{ label: string; items: AgentConversation[] }> = [];
    for (const c of conversations) {
      const label = groupLabel(c.updated_at);
      const g = out.find((x) => x.label === label);
      if (g) g.items.push(c);
      else out.push({ label, items: [c] });
    }
    return out;
  });
</script>

<div class="view agent-page" class:agent-page--panel-open={panelOpen}>
  <!-- conversations -->
  <aside class="agent-side" aria-label="Чаты">
    <div class="agent-side__head">
      <UiV2Button label="Новый чат" variant="chrome" size="sm" block onclick={newChat}>
        {#snippet icon()}{@html iconPlus(15)}{/snippet}
      </UiV2Button>
      <button type="button" class="agent-icon-btn agent-side__close" aria-label="Скрыть чаты" onclick={() => (panelOpen = false)}>
        {@html iconX(16)}
      </button>
    </div>
    <div class="agent-side__list">
      {#if boot === 'ready' && conversations.length === 0}
        <p class="agent-side__empty">Здесь появятся ваши разговоры</p>
      {/if}
      {#each grouped as g (g.label)}
        <p class="agent-side__group">{g.label}</p>
        {#each g.items as c (c.id)}
          <div class="agent-conv" class:agent-conv--active={c.id === activeId}>
            {#if renamingId === c.id}
              <!-- svelte-ignore a11y_autofocus -->
              <input
                class="agent-conv__rename"
                bind:value={renameText}
                maxlength="120"
                autofocus
                aria-label="Название чата"
                onkeydown={(e) => {
                  if (e.key === 'Enter') void commitRename();
                  if (e.key === 'Escape') renamingId = null;
                }}
                onblur={() => void commitRename()}
              />
            {:else}
              <button type="button" class="agent-conv__title" onclick={() => void openConversation(c.id)}>{c.title}</button>
              <span class="agent-conv__tools">
                <button type="button" class="agent-icon-btn" aria-label="Переименовать" onclick={() => startRename(c)}>{@html iconPencil(13)}</button>
                <button type="button" class="agent-icon-btn" aria-label="Удалить" onclick={() => void removeConversation(c)}>{@html iconTrash2(13)}</button>
              </span>
            {/if}
          </div>
        {/each}
      {/each}
    </div>
  </aside>
  {#if panelOpen}
    <button type="button" class="agent-scrim" aria-label="Закрыть список чатов" onclick={() => (panelOpen = false)}></button>
  {/if}

  <!-- chat -->
  <section class="agent-chat">
    <header class="agent-chat__head">
      <button type="button" class="agent-icon-btn agent-chat__panel-btn" aria-label="Список чатов" onclick={() => (panelOpen = true)}>
        {@html iconLayoutList(17)}
      </button>
      <AgentOrb size={34} thinking={sending} />
      <div class="agent-chat__who">
        <span class="agent-chat__name">{agentName} <span class="agent-chat__beta">beta</span></span>
        <span class="agent-chat__sub">{sending ? 'печатает…' : 'ИИ-помощница AnixApp'}</span>
      </div>
      <div class="agent-chat__head-end">
        {#if quota && quota.limit > 0}
          <UiV2Tooltip text={`Сброс в ${resetTime} (по Москве)`} placement="bottom">
            <span class="agent-quota" class:agent-quota--low={quota.remaining <= 3}>
              {quota.remaining} / {quota.limit}
            </span>
          </UiV2Tooltip>
        {/if}
        <UiV2Tooltip text="Канна сможет смотреть твои списки, историю и оценки, чтобы советовать точнее" placement="bottom">
          <span class="agent-profile-toggle">
            <span class="agent-profile-toggle__text">Профиль</span>
            <UiV2Toggle label="Доступ к профилю" checked={allowProfile} onChange={setAllowProfile} />
          </span>
        </UiV2Tooltip>
      </div>
    </header>

    <div class="agent-chat__scroll" bind:this={scroller} onscroll={onScroll}>
      <div class="agent-chat__inner">
        {#if boot === 'loading' || loadingConv}
          <div class="agent-center"><AgentOrb size={56} thinking /></div>
        {:else if boot === 'guest'}
          <div class="agent-center agent-hero">
            <AgentOrb size={72} />
            <h1 class="agent-hero__title">Привет! Я {agentName}</h1>
            <p class="agent-hero__text">Войди в аккаунт Anixart — и я помогу подобрать аниме и разобраться в приложении.</p>
            <UiV2Button label="Войти" variant="primary" onclick={() => requireAuth()} />
          </div>
        {:else if boot === 'error'}
          <div class="agent-center agent-hero">
            <AgentOrb size={64} />
            <p class="agent-hero__text">{bootError || 'Не удалось подключиться'}</p>
            <UiV2Button label="Повторить" variant="chrome" onclick={() => void load()} />
          </div>
        {:else if messages.length === 0}
          <div class="agent-hero">
            <AgentOrb size={76} />
            <h1 class="agent-hero__title">Привет{me?.login ? `, ${me.login}` : ''}! Я {agentName}</h1>
            <p class="agent-hero__text">
              Подберу аниме под настроение, расскажу о любом тайтле без спойлеров и подскажу, где что найти в приложении.
            </p>
            {#if locked}
              <div class="agent-locked">
                <span class="agent-locked__icon" aria-hidden="true">{@html iconLock(18)}</span>
                <div>
                  <b>{agentName} доступна с Anix+</b>
                  <p>
                    Разовая оплата, доступ навсегда.
                    {#if tierLimits.length}
                      {tierLimits.map((t) => `${t.name} — ${t.limit} запросов в день`).join(' · ')}
                    {/if}
                  </p>
                </div>
                <UiV2Button label="Оформить Anix+" variant="primary" size="sm" onclick={openSupportModal} />
              </div>
            {:else}
              {#if quota && !quota.tier}
                <p class="agent-free-hint">
                  Без значка — {quota.limit} {requestsWord(quota.limit)} в день.
                  <button type="button" onclick={openSupportModal}>С Anix+ запросов больше</button>
                </p>
              {/if}
              <div class="agent-starters">
                {#each me?.starters ?? [] as s (s)}
                  <button type="button" class="agent-starter" disabled={outOfQuota} onclick={() => void send(s)}>{s}</button>
                {/each}
              </div>
            {/if}
          </div>
        {:else}
          <div class="agent-thread">
            {#each messages as m (m.key)}
              <AgentMessageView
                message={m}
                {agentName}
                canRegenerate={!sending && m === lastAssistant && !!activeId}
                onOpenRelease={(id) => navigate(`/release/${id}`)}
                onFeedback={(v) => void feedback(m, v)}
                onRegenerate={() => void regenerate()}
                onRetry={m === lastAssistant && m.error && !sending ? () => void regenerate() : undefined}
              />
            {/each}
          </div>
        {/if}
      </div>
    </div>

    {#if boot === 'ready'}
      <footer class="agent-composer-wrap">
        {#if banner}
          <div class="agent-banner" role="status">
            {banner}
            {#if locked || !quota?.tier}<button type="button" onclick={openSupportModal}>Anix+</button>{/if}
            <button type="button" aria-label="Скрыть" onclick={() => (banner = '')}>{@html iconX(13)}</button>
          </div>
        {/if}
        <div class="agent-composer" class:agent-composer--disabled={locked || outOfQuota}>
          <textarea
            bind:this={textarea}
            bind:value={input}
            rows="1"
            maxlength={MAX_LEN}
            placeholder={locked
              ? `${agentName} доступна с Anix+`
              : outOfQuota
                ? `Лимит на сегодня исчерпан — обновится в ${resetTime}`
                : 'Спроси о чём угодно из мира аниме…'}
            disabled={locked || outOfQuota}
            oninput={resizeTextarea}
            onkeydown={onKeydown}
            aria-label="Сообщение"
          ></textarea>
          {#if sending}
            <button type="button" class="agent-send agent-send--stop" aria-label="Остановить" onclick={stop}>
              <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><rect width="12" height="12" rx="2" fill="currentColor" /></svg>
            </button>
          {:else}
            <button type="button" class="agent-send" aria-label="Отправить" disabled={!canSend} onclick={() => void send()}>
              {@html iconArrowUp(18)}
            </button>
          {/if}
        </div>
        <p class="agent-composer__hint">
          {#if input.length > MAX_LEN - 200}{input.length} / {MAX_LEN} · {/if}Enter — отправить, Shift+Enter — новая строка ·
          {agentName} может ошибаться
          {#if allowProfile}<span class="agent-composer__dot">{@html iconCheck(11)}</span> видит профиль{/if}
        </p>
      </footer>
    {/if}
  </section>
</div>

<style>
  .agent-page {
    position: relative;
    display: flex;
    flex: 1;
    min-height: 0;
    height: 100%;
    width: 100%;
    overflow: hidden;
    container-type: inline-size;
  }

  /* ── conversations panel ── */
  .agent-side {
    flex: none;
    width: 16rem;
    display: flex;
    flex-direction: column;
    min-height: 0;
    border-right: 1px solid color-mix(in srgb, var(--uikit-v2-text, #fff) 7%, transparent);
    background: color-mix(in srgb, var(--uikit-v2-text, #fff) 2%, transparent);
  }

  .agent-side__head {
    display: flex;
    gap: 0.4rem;
    padding: 0.9rem 0.75rem 0.5rem;
  }

  .agent-side__close {
    display: none;
  }

  .agent-side__list {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 0 0.5rem 1rem;
    scrollbar-width: thin;
  }

  .agent-side__empty {
    margin: 1rem 0.5rem;
    font-size: 0.82rem;
    color: var(--uikit-v2-muted, #999);
  }

  .agent-side__group {
    margin: 0.9rem 0.5rem 0.3rem;
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: var(--uikit-v2-muted, #999);
  }

  .agent-conv {
    position: relative;
    display: flex;
    align-items: center;
    border-radius: 0.6rem;
  }

  .agent-conv:hover,
  .agent-conv--active {
    background: color-mix(in srgb, var(--uikit-v2-text, #fff) 7%, transparent);
  }

  .agent-conv__title {
    flex: 1;
    min-width: 0;
    padding: 0.5rem 0.6rem;
    border: 0;
    background: none;
    color: var(--uikit-v2-text, #fff);
    font-size: 0.85rem;
    text-align: left;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    cursor: pointer;
  }

  .agent-conv__tools {
    display: none;
    padding-right: 0.25rem;
  }

  .agent-conv:hover .agent-conv__tools,
  .agent-conv:focus-within .agent-conv__tools {
    display: inline-flex;
  }

  .agent-conv__rename {
    flex: 1;
    margin: 0.2rem;
    padding: 0.3rem 0.45rem;
    border: 1px solid var(--uikit-v2-accent, #8f7bff);
    border-radius: 0.45rem;
    background: var(--uikit-v2-surface, #1e1e1e);
    color: var(--uikit-v2-text, #fff);
    font: inherit;
    font-size: 0.85rem;
  }

  .agent-icon-btn {
    display: inline-grid;
    place-items: center;
    width: 1.75rem;
    height: 1.75rem;
    border: 0;
    border-radius: 0.5rem;
    background: transparent;
    color: var(--uikit-v2-muted, #999);
    cursor: pointer;
  }

  .agent-icon-btn:hover,
  .agent-icon-btn:focus-visible {
    background: color-mix(in srgb, var(--uikit-v2-text, #fff) 9%, transparent);
    color: var(--uikit-v2-text, #fff);
    outline: none;
  }

  .agent-scrim {
    display: none;
  }

  /* ── chat ── */
  .agent-chat {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  .agent-chat__head {
    display: flex;
    align-items: center;
    gap: 0.7rem;
    padding: 0.75rem 1.25rem;
    border-bottom: 1px solid color-mix(in srgb, var(--uikit-v2-text, #fff) 7%, transparent);
  }

  .agent-chat__panel-btn {
    display: none;
  }

  .agent-chat__who {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .agent-chat__name {
    font-weight: 750;
    font-size: 1rem;
    letter-spacing: 0.02em;
  }

  .agent-chat__beta {
    margin-left: 0.3rem;
    padding: 0.05rem 0.35rem;
    border-radius: 0.35rem;
    background: color-mix(in srgb, var(--uikit-v2-accent, #8f7bff) 20%, transparent);
    color: var(--uikit-v2-accent, #8f7bff);
    font-size: 0.62rem;
    font-weight: 700;
    vertical-align: 0.15em;
  }

  .agent-chat__sub {
    font-size: 0.78rem;
    color: var(--uikit-v2-muted, #999);
  }

  .agent-chat__head-end {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 0.9rem;
  }

  .agent-quota {
    padding: 0.25rem 0.6rem;
    border-radius: 999px;
    background: color-mix(in srgb, var(--uikit-v2-text, #fff) 7%, transparent);
    font-size: 0.78rem;
    font-weight: 650;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .agent-quota--low {
    background: color-mix(in srgb, var(--uikit-v2-danger, #ff5b5b) 20%, transparent);
  }

  .agent-profile-toggle {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    font-size: 0.8rem;
    color: var(--uikit-v2-muted, #999);
  }

  .agent-chat__scroll {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    scrollbar-width: thin;
  }

  .agent-chat__inner {
    max-width: 50rem;
    min-height: 100%;
    margin: 0 auto;
    padding: 1.5rem 1.25rem 1rem;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
  }

  .agent-thread {
    display: flex;
    flex-direction: column;
    gap: 1.4rem;
  }

  .agent-center {
    flex: 1;
    display: grid;
    place-items: center;
    align-content: center;
    gap: 1rem;
  }

  .agent-hero {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.9rem;
    text-align: center;
    padding: 1rem 0 2rem;
  }

  .agent-hero__title {
    margin: 0.4rem 0 0;
    font-size: 1.55rem;
    font-weight: 800;
  }

  .agent-hero__text {
    margin: 0;
    max-width: 30rem;
    color: var(--uikit-v2-muted, #999);
    line-height: 1.55;
  }

  .agent-starters {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.55rem;
    width: 100%;
    max-width: 36rem;
    margin-top: 0.8rem;
  }

  .agent-starter {
    padding: 0.75rem 0.9rem;
    border: 1px solid color-mix(in srgb, var(--uikit-v2-text, #fff) 9%, transparent);
    border-radius: 0.85rem;
    background: color-mix(in srgb, var(--uikit-v2-text, #fff) 3%, transparent);
    color: var(--uikit-v2-text, #fff);
    font-size: 0.86rem;
    text-align: left;
    line-height: 1.35;
    cursor: pointer;
    transition:
      border-color 0.15s ease,
      background 0.15s ease;
  }

  .agent-starter:hover:not(:disabled),
  .agent-starter:focus-visible {
    border-color: color-mix(in srgb, var(--uikit-v2-accent, #8f7bff) 50%, transparent);
    background: color-mix(in srgb, var(--uikit-v2-accent, #8f7bff) 9%, transparent);
    outline: none;
  }

  .agent-starter:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .agent-free-hint {
    margin: 0;
    font-size: 0.82rem;
    color: var(--uikit-v2-muted, #999);
  }

  .agent-free-hint button {
    padding: 0;
    border: 0;
    background: none;
    color: var(--uikit-v2-accent, #8f7bff);
    font: inherit;
    cursor: pointer;
  }

  .agent-free-hint button:hover {
    text-decoration: underline;
  }

  .agent-locked {
    display: flex;
    align-items: center;
    gap: 0.9rem;
    max-width: 36rem;
    margin-top: 0.6rem;
    padding: 0.9rem 1rem;
    border: 1px solid color-mix(in srgb, var(--uikit-v2-accent, #8f7bff) 35%, transparent);
    border-radius: 1rem;
    background: color-mix(in srgb, var(--uikit-v2-accent, #8f7bff) 8%, transparent);
    text-align: left;
  }

  .agent-locked p {
    margin: 0.2rem 0 0;
    font-size: 0.82rem;
    color: var(--uikit-v2-muted, #999);
  }

  .agent-locked__icon {
    display: inline-grid;
    place-items: center;
    flex: none;
    width: 2.2rem;
    height: 2.2rem;
    border-radius: 50%;
    background: color-mix(in srgb, var(--uikit-v2-accent, #8f7bff) 22%, transparent);
    color: var(--uikit-v2-accent, #8f7bff);
  }

  /* ── composer ── */
  .agent-composer-wrap {
    max-width: 50rem;
    width: 100%;
    margin: 0 auto;
    padding: 0.4rem 1.25rem 0.9rem;
    box-sizing: border-box;
  }

  .agent-banner {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    margin-bottom: 0.5rem;
    padding: 0.5rem 0.75rem;
    border-radius: 0.7rem;
    background: color-mix(in srgb, var(--uikit-v2-danger, #ff5b5b) 14%, transparent);
    font-size: 0.84rem;
  }

  .agent-banner button {
    margin-left: auto;
    border: 0;
    border-radius: 999px;
    padding: 0.2rem 0.55rem;
    background: color-mix(in srgb, var(--uikit-v2-text, #fff) 12%, transparent);
    color: inherit;
    font-size: 0.78rem;
    cursor: pointer;
  }

  .agent-banner button + button {
    margin-left: 0;
  }

  .agent-composer {
    display: flex;
    align-items: flex-end;
    gap: 0.5rem;
    padding: 0.45rem 0.45rem 0.45rem 1rem;
    border: 1px solid color-mix(in srgb, var(--uikit-v2-text, #fff) 11%, transparent);
    border-radius: 1.3rem;
    background: var(--uikit-v2-surface, #1e1e1e);
    box-shadow: 0 8px 28px rgba(0, 0, 0, 0.22);
    transition: border-color 0.15s ease;
  }

  .agent-composer:focus-within {
    border-color: color-mix(in srgb, var(--uikit-v2-accent, #8f7bff) 55%, transparent);
  }

  .agent-composer--disabled {
    opacity: 0.6;
  }

  .agent-composer textarea {
    flex: 1;
    min-height: 1.5rem;
    max-height: 200px;
    padding: 0.45rem 0;
    border: 0;
    outline: none;
    resize: none;
    background: transparent;
    color: var(--uikit-v2-text, #fff);
    font: inherit;
    font-size: 0.93rem;
    line-height: 1.5;
  }

  .agent-composer textarea::placeholder {
    color: var(--uikit-v2-muted, #999);
  }

  .agent-send {
    display: inline-grid;
    place-items: center;
    flex: none;
    width: 2.25rem;
    height: 2.25rem;
    border: 0;
    border-radius: 50%;
    background: var(--uikit-v2-accent, #8f7bff);
    color: #111;
    cursor: pointer;
    transition:
      transform 0.15s ease,
      opacity 0.15s ease;
  }

  .agent-send:disabled {
    opacity: 0.35;
    cursor: default;
  }

  .agent-send:not(:disabled):hover {
    transform: scale(1.06);
  }

  .agent-send--stop {
    background: var(--uikit-v2-text, #fff);
    color: var(--uikit-v2-bg, #111);
  }

  .agent-composer__hint {
    margin: 0.45rem 0 0;
    font-size: 0.72rem;
    color: var(--uikit-v2-muted, #999);
    text-align: center;
  }

  .agent-composer__dot {
    display: inline-flex;
    vertical-align: -0.1em;
    color: var(--uikit-v2-accent, #8f7bff);
  }

  /* ── narrow: conversations become a drawer ── */
  @container (max-width: 760px) {
    .agent-side {
      position: absolute;
      inset: 0 auto 0 0;
      z-index: 5;
      width: min(18rem, 85%);
      background: var(--uikit-v2-surface, #1e1e1e);
      transform: translateX(-100%);
      transition: transform 0.22s ease;
    }

    .agent-page--panel-open .agent-side {
      transform: none;
      box-shadow: 0 0 40px rgba(0, 0, 0, 0.45);
    }

    .agent-side__close,
    .agent-chat__panel-btn {
      display: inline-grid;
    }

    .agent-scrim {
      display: block;
      position: absolute;
      inset: 0;
      z-index: 4;
      border: 0;
      background: rgba(0, 0, 0, 0.4);
    }

    .agent-starters {
      grid-template-columns: 1fr;
    }

    .agent-chat__head {
      padding: 0.6rem 0.75rem;
    }

  }
</style>
