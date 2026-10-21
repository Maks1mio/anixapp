<script lang="ts">
  import { onDestroy, onMount, tick } from 'svelte';
  import { fade, fly } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import {
    AgentApiError,
    deleteConversation,
    fetchAgentMe,
    fetchConversation,
    fetchConversations,
    renameConversation,
    resetAgentSession,
    attachAgentLive,
    sendClientToolResult,
    sendFeedback,
    stopAgentAnswer,
    streamAgentChat,
    type AgentAction,
    type AgentLiveEvent,
    type AgentConversation,
    type AgentMe,
    type AgentMessage,
    type AgentQuota,
    type AgentStreamEvent,
  } from '../../services/agent-api';
  import { fetchBadgeCatalog } from '../../services/badges-api';
  import { getAgentProfileSnapshot, resetAgentProfileSnapshot } from '../../services/agent-profile';
  import { runAgentClientTool } from '../../services/agent-client-tools';
  import { runAgentAction } from './agent-actions';
  import { isAuthenticated, requireAuth } from '../../stores/auth';
  import { openSupportModal } from '../../stores/support-promo';
  import {
    iconArrowUp,
    iconFlag,
    iconLayoutList,
    iconMessageCircle,
    iconLock,
    iconPencil,
    iconPlus,
    iconTrash2,
    iconUser,
    iconX,
  } from '../../components/icons';
  import UiV2Button from '../../components/uikit-v2/UiV2Button.svelte';
  import UiV2Toggle from '../../components/uikit-v2/UiV2Toggle.svelte';
  import UiV2Tooltip from '../../components/uikit-v2/UiV2Tooltip.svelte';
  import AgentFace from './AgentFace.svelte';
  import AgentMessageView from './AgentMessageView.svelte';
  import SupportView from './SupportView.svelte';
  import { agentMode, openSupportTicket, requestedTicket, type AgentMode } from './support-store';
  import { TICKET_CATEGORIES, TICKET_STATUSES, fetchTickets, type Ticket } from '../../services/support-api';
  import {
    PERSONA_LOOKS,
    PERSONA_ORDER,
    moodFromActivity,
    personaId,
    type FaceMood,
    type PersonaId,
  } from './personas';
  import type { ViewMessage } from './types';

  const MAX_LEN = 2000;
  /** Survives leaving the tab: the open chat is restored on return. */
  const LAST_CHAT_KEY = 'anixapp.agent.lastChat';
  const PROFILE_PREF_KEY = 'anixapp.agent.allowProfile';
  const PERSONA_PREF_KEY = 'anixapp.agent.persona';
  const SIDE_PREF_KEY = 'anixapp.agent.sideCollapsed';

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
  let sideCollapsed = $state(readPref(SIDE_PREF_KEY) === '1');
  let renamingId = $state<string | null>(null);
  let renameText = $state('');
  let tierLimits = $state<Array<{ name: string; limit: number }>>([]);
  let allowProfile = $state(readPref(PROFILE_PREF_KEY) !== '0');
  let persona = $state<PersonaId>(personaId(readPref(PERSONA_PREF_KEY)));
  let heroHover = $state(false);

  // support
  let tickets = $state<Ticket[]>([]);
  let ticketsLoading = $state(false);
  let supportAdmin = $state(false);
  let supportUnread = $state(0);
  let ticketScope = $state<'mine' | 'all'>('mine');
  let ticketFilter = $state<'active' | 'closed'>('active');
  let activeTicket = $state<string | null>(null);
  const mode = $derived($agentMode);

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
    abort?.abort(); // only stops reading — the server keeps writing, resume() picks it up again
    abort = null;
    sending = false;
  }

  const look = $derived(PERSONA_LOOKS[persona]);
  const personaInfo = $derived(me?.personas?.find((p) => p.id === persona) ?? null);
  const agentName = $derived(personaInfo?.name ?? look.name);
  const tagline = $derived(personaInfo?.tagline ?? look.tagline);
  const starters = $derived(personaInfo?.starters ?? look.starters);
  const locked = $derived(!!quota && quota.limit <= 0);
  const outOfQuota = $derived(!!quota && quota.limit > 0 && quota.remaining <= 0);
  const canSend = $derived(!sending && !locked && !outOfQuota && input.trim().length > 0 && boot === 'ready');
  const lastAssistant = $derived([...messages].reverse().find((m) => m.role === 'assistant') ?? null);
  const resetTime = $derived(
    quota ? new Date(quota.resets_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '',
  );

  /** Header face: follows what the answer in flight is doing. */
  const headMood = $derived.by<FaceMood>(() => {
    if (boot === 'error') return 'sad';
    if (locked) return 'sleep';
    const live = sending ? lastAssistant : null;
    if (!live?.streaming) return 'idle';
    if (live.status) return moodFromActivity(live.activity);
    return live.content ? 'write' : 'think';
  });

  const headStatus = $derived.by(() => {
    const live = sending ? lastAssistant : null;
    if (!live?.streaming) return tagline;
    return live.status ?? (live.content ? 'печатает…' : 'думает…');
  });

  function readPref(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  function writePref(key: string, value: string) {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* storage blocked */
    }
  }

  function setAllowProfile(next: boolean) {
    allowProfile = next;
    writePref(PROFILE_PREF_KEY, next ? '1' : '0');
  }

  function setPersona(next: PersonaId) {
    if (next === persona || sending) return;
    persona = next;
    writePref(PERSONA_PREF_KEY, next);
    void tick().then(() => textarea?.focus());
  }

  function toggleSide() {
    sideCollapsed = !sideCollapsed;
    writePref(SIDE_PREF_KEY, sideCollapsed ? '1' : '0');
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
      images: m.attachments?.images ?? [],
      feedback: m.feedback,
      persona: personaId(m.persona),
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

  function clientInfo() {
    const ua = navigator.userAgent;
    const platform = /Android/i.test(ua)
      ? 'Android'
      : /Windows/i.test(ua)
        ? 'Windows'
        : /Mac OS X/i.test(ua)
          ? 'macOS'
          : /Linux/i.test(ua)
            ? 'Linux'
            : null;
    const version = typeof __ANIXAPP_VERSION__ === 'string' && __ANIXAPP_VERSION__ ? __ANIXAPP_VERSION__ : null;
    return { version, platform, route: null };
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
      supportAdmin = meRes.support?.admin ?? false;
      supportUnread = meRes.support?.unread ?? 0;
      if ($agentMode === 'support') void loadTickets();
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

  // Leaving the tab mid-answer does NOT stop the answer: anixback keeps writing it, and
  // coming back re-attaches to the live stream (resume) or loads the saved answer.
  // «Открыть обращение» from a chat answer (or elsewhere in the app).
  const unsubRequested = requestedTicket.subscribe((id) => {
    if (!id) return;
    activeTicket = id;
    panelOpen = false;
    requestedTicket.set(null);
    if (boot === 'ready') void loadTickets();
  });

  onDestroy(() => {
    unsubAuth();
    unsubRequested();
    detachStream();
  });

  // ── conversations ───────────────────────────────────────────────────────

  // ── support ─────────────────────────────────────────────────────────────

  function setMode(next: AgentMode) {
    agentMode.set(next);
    panelOpen = false;
    if (next === 'support') void loadTickets();
  }

  async function loadTickets() {
    if (boot !== 'ready') return;
    ticketsLoading = true;
    try {
      const res = await fetchTickets({ scope: ticketScope, status: ticketFilter === 'closed' ? 'closed' : 'active' });
      tickets = res.tickets;
      supportAdmin = res.admin;
      supportUnread = res.unread;
    } catch (err) {
      banner = describe(err);
    } finally {
      ticketsLoading = false;
    }
  }

  function setTicketScope(next: 'mine' | 'all') {
    if (next === ticketScope) return;
    ticketScope = next;
    void loadTickets();
  }

  function setTicketFilter(next: 'active' | 'closed') {
    if (next === ticketFilter) return;
    ticketFilter = next;
    void loadTickets();
  }

  function newTicket() {
    activeTicket = null;
    panelOpen = false;
  }

  function openTicket(id: string) {
    activeTicket = id;
    panelOpen = false;
    const t = tickets.find((x) => x.id === id);
    if (t?.unread) {
      tickets = tickets.map((x) => (x.id === id ? { ...x, unread: false } : x));
      supportUnread = Math.max(0, supportUnread - 1);
    }
  }

  /** Created or changed in the open ticket → keep the list in sync without a refetch. */
  function onTicketChanged(t: Ticket, created: boolean) {
    const fits = ticketFilter === 'closed' ? t.status === 'closed' : t.status !== 'closed';
    const rest = tickets.filter((x) => x.id !== t.id);
    tickets = fits ? [{ ...t, unread: false }, ...rest] : rest;
    if (created) activeTicket = t.id;
  }

  // The list (badges, statuses) refreshes by itself while support is open.
  $effect(() => {
    if (mode !== 'support' || boot !== 'ready') return;
    const timer = setInterval(() => void loadTickets(), 30_000);
    return () => clearInterval(timer);
  });

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
    const conv = conversations.find((c) => c.id === id);
    if (conv?.persona) persona = personaId(conv.persona);
    try {
      const res = await fetchConversation(id);
      if (activeId !== id) return;
      messages = res.messages.map(toView);
      loadingConv = false; // render the thread first, then jump to its end
      stickBottom = true;
      await scrollToBottom();
      void resume(id);
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

  function bumpConversation(id: string, title: string, who: PersonaId) {
    const now = new Date().toISOString();
    const existing = conversations.find((c) => c.id === id);
    const updated: AgentConversation = existing
      ? { ...existing, updated_at: now, messages: existing.messages + 2, persona: who }
      : { id, title, created_at: now, updated_at: now, messages: 2, persona: who };
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

  function pushLiveBubble(who: PersonaId) {
    messages.push({
      key: key(),
      id: null,
      role: 'assistant',
      content: '',
      releases: [],
      actions: [],
      feedback: null,
      persona: who,
      streaming: true,
      steps: [],
    });
  }

  /** anixback asks the app for data only the user's own Anixart session can read. */
  async function answerClientTool(e: Extract<AgentStreamEvent, { type: 'client_tool' }>) {
    const result = await runAgentClientTool(e.name, e.args ?? {});
    await sendClientToolResult(e.call_id, result).catch(() => undefined);
  }

  /**
   * One handler for a fresh answer and for one re-attached after coming back: the
   * server keeps writing while the user is away, the replay brings the text so far.
   */
  function streamHandler(opts: { who: PersonaId; userKey: string | null; visible: () => boolean }) {
    const { who, userKey, visible } = opts;
    let navigation: AgentAction | null = null;
    return (e: AgentLiveEvent) => {
      // Tools run even if the chat is off screen — the answer waits for them.
      if (e.type === 'client_tool') {
        void answerClientTool(e);
        return;
      }
      if (!visible()) {
        // Answer for a chat that's no longer on screen: just keep the list order fresh.
        if (e.type === 'meta') bumpConversation(e.conversation_id, e.title, who);
        if (e.type === 'done') quota = e.quota;
        return;
      }
      switch (e.type) {
        case 'meta':
          if (!activeId) {
            activeId = e.conversation_id;
            rememberChat(e.conversation_id);
          }
          if (!e.replay) bumpConversation(e.conversation_id, e.title, who);
          if (userKey && e.user_message_id != null) {
            const idx = messages.findIndex((m) => m.key === userKey);
            if (idx >= 0) messages[idx] = { ...messages[idx], id: e.user_message_id };
          }
          break;
        case 'status':
          patchLast((m) => ({
            ...m,
            status: e.text,
            activity: e.activity,
            steps: m.steps?.at(-1) === e.text ? m.steps : [...(m.steps ?? []), e.text],
          }));
          break;
        case 'delta':
          patchLast((m) => ({ ...m, content: m.content + e.text, status: undefined, activity: undefined }));
          break;
        case 'cards':
          patchLast((m) => ({ ...m, releases: e.releases }));
          break;
        case 'actions':
          patchLast((m) => ({ ...m, actions: e.actions }));
          break;
        case 'images':
          patchLast((m) => ({ ...m, images: e.images }));
          break;
        case 'navigate':
          // Only for an answer watched live — coming back later must not yank the user away.
          if (!e.replay) navigation = e.action;
          break;
        case 'done': {
          // Same key: the bubble stays mounted (no re-entry animation), steps are kept.
          patchLast((m) => ({ ...toView(e.message), key: m.key, persona: personaId(e.message.persona ?? who), steps: m.steps }));
          quota = e.quota;
          // The answer moved the talk into a support ticket — follow it there (a beat later, so the reply is seen).
          const moved = e.message.attachments?.actions?.find((a) => a.kind === 'open_ticket' && a.ticket_id);
          if (moved?.ticket_id) {
            const id = moved.ticket_id;
            setTimeout(() => {
              if (visible() && $agentMode === 'chat') openSupportTicket(id);
            }, 1400);
          } else if (navigation) {
            const nav = navigation;
            setTimeout(() => {
              if (visible() && $agentMode === 'chat') void runAgentAction(nav);
            }, 900);
          }
          break;
        }
        case 'error':
          patchLast((m) => ({ ...m, streaming: false, status: undefined, error: e.message }));
          if (e.quota) quota = e.quota;
          break;
      }
      void scrollToBottom();
    };
  }

  /** Coming back to a chat whose answer is still being written: pick the stream up. */
  async function resume(id: string) {
    if (sending) return;
    const ctrl = new AbortController();
    const myView = viewSeq;
    const visible = () => viewSeq === myView;
    const last = messages.at(-1);
    let handler: ((e: AgentLiveEvent) => void) | null = null;
    let attached = false;
    try {
      attached = await attachAgentLive(
        id,
        (e) => {
          if (!handler) {
            if (!visible()) return;
            const who = personaId((e.type === 'meta' ? e.persona : null) ?? persona);
            abort = ctrl;
            sending = true;
            stickBottom = true;
            pushLiveBubble(who);
            handler = streamHandler({ who, userKey: null, visible });
          }
          handler(e);
        },
        ctrl.signal,
      );
    } catch {
      /* no live answer to pick up */
    }
    if (!visible()) return;
    if (handler) {
      if (abort === ctrl) abort = null;
      sending = false;
      const reason = ctrl.signal.aborted ? 'Остановлено' : 'Соединение прервалось';
      patchLast((m) => (m.streaming ? { ...m, streaming: false, status: undefined, error: reason } : m));
      void scrollToBottom();
    } else if (!attached && last?.role === 'user') {
      // Finished between loading the chat and re-attaching — the answer is saved by now.
      const res = await fetchConversation(id).catch(() => null);
      if (res && visible() && res.messages.length > messages.length) {
        messages = res.messages.map(toView);
        await scrollToBottom();
      }
    }
  }

  async function run(body: { message?: string; regenerate?: boolean }, userText: string | null) {
    sending = true;
    banner = '';
    stickBottom = true;
    const who = persona;
    const userKey = userText != null ? key() : null;
    if (userText != null && userKey) {
      messages.push({ key: userKey, id: null, role: 'user', content: userText, releases: [], actions: [], feedback: null, persona: who });
    }
    pushLiveBubble(who);
    await scrollToBottom(true);

    abort = new AbortController();
    const ctrl = abort;
    const myView = viewSeq;
    const visible = () => viewSeq === myView;
    const onEvent = streamHandler({ who, userKey, visible });

    try {
      // Profile data comes from the app itself (anixback never holds the Anixart token).
      const profile = allowProfile ? await getAgentProfileSnapshot() : null;
      await streamAgentChat(
        {
          ...body,
          conversation_id: activeId,
          allow_profile: allowProfile,
          profile: profile ?? undefined,
          persona: who,
          client: clientInfo(),
        },
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

  /** Closing the stream no longer stops the answer on the server — ask it to. */
  function stop() {
    if (activeId) void stopAgentAnswer(activeId).catch(() => undefined);
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
      textarea.style.height = `${Math.min(textarea.scrollHeight, 220)}px`;
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

<div
  class="view agent-page"
  class:agent-page--panel-open={panelOpen}
  class:agent-page--side-collapsed={sideCollapsed}
  style:--agent-accent={look.accent}
>
  <!-- conversations -->
  <aside class="agent-side" aria-label={mode === 'support' ? 'Обращения' : 'Чаты'}>
    <nav class="agent-modes" aria-label="Разделы">
      <button type="button" class="agent-mode" class:agent-mode--on={mode === 'chat'} onclick={() => setMode('chat')}>
        <span class="agent-mode__icon" aria-hidden="true">{@html iconMessageCircle(16)}</span>
        Чаты
      </button>
      <button type="button" class="agent-mode" class:agent-mode--on={mode === 'support'} onclick={() => setMode('support')}>
        <span class="agent-mode__icon" aria-hidden="true">{@html iconFlag(16)}</span>
        Поддержка
        {#if supportUnread > 0}<span class="agent-mode__badge">{supportUnread > 99 ? '99+' : supportUnread}</span>{/if}
      </button>
      <button type="button" class="agent-icon-btn agent-side__close" aria-label="Скрыть список" onclick={() => (panelOpen = false)}>
        {@html iconX(16)}
      </button>
    </nav>

    {#if mode === 'support'}
      <div class="agent-side__head">
        <UiV2Button label="Новое обращение" variant="chrome" size="sm" block onclick={newTicket}>
          {#snippet icon()}{@html iconPlus(15)}{/snippet}
        </UiV2Button>
      </div>
      <div class="agent-ticket-filters">
        {#if supportAdmin}
          <div class="agent-seg" role="radiogroup" aria-label="Чьи обращения">
            <button type="button" role="radio" aria-checked={ticketScope === 'mine'} class:on={ticketScope === 'mine'} onclick={() => setTicketScope('mine')}>Мои</button>
            <button type="button" role="radio" aria-checked={ticketScope === 'all'} class:on={ticketScope === 'all'} onclick={() => setTicketScope('all')}>Все</button>
          </div>
        {/if}
        <div class="agent-seg" role="radiogroup" aria-label="Статус">
          <button type="button" role="radio" aria-checked={ticketFilter === 'active'} class:on={ticketFilter === 'active'} onclick={() => setTicketFilter('active')}>Активные</button>
          <button type="button" role="radio" aria-checked={ticketFilter === 'closed'} class:on={ticketFilter === 'closed'} onclick={() => setTicketFilter('closed')}>Закрытые</button>
        </div>
      </div>
      <div class="agent-side__list">
        {#if !ticketsLoading && tickets.length === 0}
          <p class="agent-side__empty">{ticketFilter === 'closed' ? 'Закрытых обращений нет' : 'Обращений пока нет'}</p>
        {/if}
        {#each tickets as t (t.id)}
          <button
            type="button"
            class="agent-ticket"
            class:agent-ticket--active={t.id === activeTicket}
            onclick={() => openTicket(t.id)}
          >
            <span class="agent-ticket__top">
              <span class="agent-ticket__status agent-ticket__status--{t.status}" title={TICKET_STATUSES[t.status]}></span>
              <span class="agent-ticket__title">{t.title}</span>
              {#if t.unread}<span class="agent-ticket__unread" aria-label="Есть новое"></span>{/if}
            </span>
            <span class="agent-ticket__meta">
              #{t.number} · {TICKET_CATEGORIES[t.category]}{#if ticketScope === 'all' && t.login} · {t.login}{/if}
            </span>
          </button>
        {/each}
      </div>
    {:else}
    <div class="agent-side__head">
      <UiV2Button label="Новый чат" variant="chrome" size="sm" block onclick={newChat}>
        {#snippet icon()}{@html iconPlus(15)}{/snippet}
      </UiV2Button>
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
              <button type="button" class="agent-conv__title" onclick={() => void openConversation(c.id)}>
                <span
                  class="agent-conv__dot"
                  style:--dot={PERSONA_LOOKS[personaId(c.persona)].accent}
                  title={PERSONA_LOOKS[personaId(c.persona)].name}
                ></span>
                <span class="agent-conv__text">{c.title}</span>
              </button>
              <span class="agent-conv__tools">
                <button type="button" class="agent-icon-btn" aria-label="Переименовать" onclick={() => startRename(c)}>{@html iconPencil(13)}</button>
                <button type="button" class="agent-icon-btn" aria-label="Удалить" onclick={() => void removeConversation(c)}>{@html iconTrash2(13)}</button>
              </span>
            {/if}
          </div>
        {/each}
      {/each}
    </div>
    {/if}
  </aside>
  {#if panelOpen}
    <button type="button" class="agent-scrim" aria-label="Закрыть список" onclick={() => (panelOpen = false)}></button>
  {/if}

  {#if mode === 'support' && boot === 'ready'}
    <SupportView
      ticketId={activeTicket}
      {persona}
      admin={supportAdmin}
      {sideCollapsed}
      client={clientInfo()}
      onToggleSide={toggleSide}
      onOpenPanel={() => (panelOpen = true)}
      onTicket={onTicketChanged}
    />
  {:else}
  <!-- chat -->
  <section class="agent-chat">
    <header class="agent-chat__head">
      <UiV2Tooltip text={sideCollapsed ? 'Показать чаты' : 'Скрыть чаты'} placement="bottom">
        <button type="button" class="agent-icon-btn agent-chat__side-btn" aria-label="Список чатов" onclick={toggleSide}>
          {@html iconLayoutList(17)}
        </button>
      </UiV2Tooltip>
      <button type="button" class="agent-icon-btn agent-chat__panel-btn" aria-label="Список чатов" onclick={() => (panelOpen = true)}>
        {@html iconLayoutList(17)}
      </button>
      {#key persona}
        <span class="agent-chat__face" in:fly={{ y: 6, duration: 260, easing: cubicOut }}>
          <AgentFace {persona} mood={headMood} size={46} />
        </span>
      {/key}
      <div class="agent-chat__who">
        <span class="agent-chat__name">{agentName} <span class="agent-chat__beta">beta</span></span>
        {#key headStatus}
          <span class="agent-chat__sub" in:fade={{ duration: 180 }}>{headStatus}</span>
        {/key}
      </div>
      <div class="agent-chat__head-end">
        {#if quota && quota.limit > 0}
          <UiV2Tooltip text={`Сброс в ${resetTime} (по Москве)`} placement="bottom">
            <span class="agent-quota" class:agent-quota--low={quota.remaining <= 3}>
              {quota.remaining} / {quota.limit}
            </span>
          </UiV2Tooltip>
        {/if}
        {#if messages.length}
          <UiV2Tooltip text="Новый чат" placement="bottom">
            <button type="button" class="agent-icon-btn" aria-label="Новый чат" onclick={newChat}>{@html iconPlus(17)}</button>
          </UiV2Tooltip>
        {/if}
      </div>
    </header>

    <div class="agent-chat__scroll" bind:this={scroller} onscroll={onScroll}>
      <div class="agent-chat__inner">
        {#if boot === 'loading' || loadingConv}
          <div class="agent-center"><AgentFace {persona} mood="think" size={88} /></div>
        {:else if boot === 'guest'}
          <div class="agent-center agent-hero">
            <AgentFace {persona} mood="wave" size={120} />
            <h1 class="agent-hero__title">Привет! Я {agentName}</h1>
            <p class="agent-hero__text">Войди в аккаунт Anixart — и я помогу подобрать аниме и разобраться в приложении.</p>
            <UiV2Button label="Войти" variant="primary" onclick={() => requireAuth()} />
          </div>
        {:else if boot === 'error'}
          <div class="agent-center agent-hero">
            <AgentFace {persona} mood="sad" size={110} />
            <p class="agent-hero__text">{bootError || 'Не удалось подключиться'}</p>
            <UiV2Button label="Повторить" variant="chrome" onclick={() => void load()} />
          </div>
        {:else if messages.length === 0}
          {#key persona}
            <div class="agent-hero" in:fly={{ y: 14, duration: 380, easing: cubicOut }}>
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <span
                class="agent-hero__face"
                onmouseenter={() => (heroHover = true)}
                onmouseleave={() => (heroHover = false)}
              >
                <AgentFace {persona} mood={locked ? 'sleep' : heroHover ? 'happy' : 'wave'} size={136} />
              </span>
              <h1 class="agent-hero__title">
                Привет{me?.login ? `, ${me.login}` : ''}! Я <span class="agent-hero__name">{agentName}</span>
              </h1>
              <p class="agent-hero__text">
                {#if persona === 'asya'}
                  Подберу аниме под твой вкус без лишнего шума, разберу любую настройку приложения и найду, где что лежит. Спрашивай.
                {:else}
                  Подберу аниме под настроение, расскажу о любом тайтле без спойлеров, гляну расписание и помогу с чем угодно в приложении!
                {/if}
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
                  {#each starters as s, i (s)}
                    <button
                      type="button"
                      class="agent-starter"
                      style:--i={i}
                      disabled={outOfQuota}
                      onclick={() => void send(s)}
                    >
                      {s}
                    </button>
                  {/each}
                </div>
              {/if}
            </div>
          {/key}
        {:else}
          <div class="agent-thread">
            {#each messages as m (m.key)}
              <AgentMessageView
                message={m}
                canRegenerate={!sending && m === lastAssistant && !!activeId}
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
          <div class="agent-banner" role="status" transition:fly={{ y: 6, duration: 180 }}>
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
                : persona === 'asya'
                  ? 'Спроси Асю — про аниме или приложение…'
                  : 'Спроси Канну о чём угодно из мира аниме…'}
            disabled={locked || outOfQuota}
            oninput={resizeTextarea}
            onkeydown={onKeydown}
            aria-label="Сообщение"
          ></textarea>

          <div class="agent-composer__bar">
            <div class="agent-persona" role="radiogroup" aria-label="Помощница">
              <span
                class="agent-persona__thumb"
                style:--idx={PERSONA_ORDER.indexOf(persona)}
                aria-hidden="true"
              ></span>
              {#each PERSONA_ORDER as id (id)}
                {@const p = PERSONA_LOOKS[id]}
                <UiV2Tooltip text={`${p.name} — девочка-${p.kind}`} placement="top">
                  <button
                    type="button"
                    role="radio"
                    class="agent-persona__opt"
                    class:agent-persona__opt--on={persona === id}
                    style:--p-accent={p.accent}
                    aria-checked={persona === id}
                    disabled={sending}
                    onclick={() => setPersona(id)}
                  >
                    <AgentFace persona={id} mood={persona === id ? 'idle' : 'sleep'} size={26} />
                    <span>{p.name}</span>
                  </button>
                </UiV2Tooltip>
              {/each}
            </div>

            <UiV2Tooltip
              text={`${agentName} сможет смотреть твои списки, историю и оценки, чтобы советовать точнее`}
              placement="top"
            >
              <span class="agent-profile-chip" class:agent-profile-chip--on={allowProfile}>
                <span class="agent-profile-chip__icon" aria-hidden="true">{@html iconUser(14)}</span>
                <span class="agent-profile-chip__text">Профиль</span>
                <UiV2Toggle label="Доступ к профилю" checked={allowProfile} onChange={setAllowProfile} />
              </span>
            </UiV2Tooltip>

            <div class="agent-composer__end">
              {#if input.length > MAX_LEN - 200}
                <span class="agent-composer__count">{input.length} / {MAX_LEN}</span>
              {/if}
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
          </div>
        </div>
        <p class="agent-composer__hint">
          Enter — отправить, Shift+Enter — новая строка · {agentName} может ошибаться
        </p>
      </footer>
    {/if}
  </section>
  {/if}
</div>

<style>
  .agent-page {
    --agent-accent: var(--uikit-v2-accent, #e5484d);

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
    overflow: hidden;
    transition:
      width 0.28s cubic-bezier(0.2, 0.8, 0.2, 1),
      opacity 0.2s ease;
  }

  .agent-page--side-collapsed .agent-side {
    width: 0;
    opacity: 0;
    border-right-width: 0;
  }

  .agent-side__head {
    display: flex;
    gap: 0.4rem;
    min-width: 16rem;
    box-sizing: border-box;
    padding: 0.9rem 0.75rem 0.5rem;
  }

  .agent-side .agent-side__close {
    display: none;
  }

  /* ── sections: Чаты / Поддержка (like a nav in the sidebar) ── */
  .agent-modes {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    min-width: 16rem;
    box-sizing: border-box;
    padding: 0.75rem 0.5rem 0.35rem;
  }

  .agent-mode {
    position: relative;
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.5rem 0.65rem;
    border: 0;
    border-radius: 0.6rem;
    background: transparent;
    color: var(--uikit-v2-muted, #999);
    font: inherit;
    font-size: 0.88rem;
    font-weight: 600;
    text-align: left;
    cursor: pointer;
    transition:
      background 0.15s ease,
      color 0.15s ease;
  }

  .agent-mode:hover,
  .agent-mode:focus-visible {
    background: color-mix(in srgb, var(--uikit-v2-text, #fff) 6%, transparent);
    color: var(--uikit-v2-text, #fff);
    outline: none;
  }

  .agent-mode--on {
    background: color-mix(in srgb, var(--uikit-v2-text, #fff) 8%, transparent);
    color: var(--uikit-v2-text, #fff);
  }

  .agent-mode__icon {
    display: inline-flex;
  }

  .agent-mode--on .agent-mode__icon {
    color: var(--agent-accent);
  }

  .agent-mode__badge {
    margin-left: auto;
    min-width: 1.2rem;
    padding: 0.05rem 0.35rem;
    border-radius: 999px;
    background: var(--uikit-v2-accent, #e35454);
    color: #fff;
    font-size: 0.68rem;
    font-weight: 800;
    text-align: center;
    box-sizing: border-box;
  }

  .agent-modes .agent-side__close {
    position: absolute;
    top: 0.75rem;
    right: 0.5rem;
  }

  .agent-ticket-filters {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
    min-width: 16rem;
    box-sizing: border-box;
    padding: 0.1rem 0.75rem 0.4rem;
  }

  .agent-seg {
    display: inline-flex;
    padding: 0.15rem;
    border-radius: 0.6rem;
    background: color-mix(in srgb, var(--uikit-v2-text, #fff) 5%, transparent);
  }

  .agent-seg button {
    padding: 0.22rem 0.6rem;
    border: 0;
    border-radius: 0.45rem;
    background: transparent;
    color: var(--uikit-v2-muted, #999);
    font-size: 0.74rem;
    font-weight: 650;
    cursor: pointer;
    transition:
      background 0.15s ease,
      color 0.15s ease;
  }

  .agent-seg button.on {
    background: color-mix(in srgb, var(--agent-accent) 20%, var(--uikit-v2-elevated, #2a2a2a));
    color: var(--uikit-v2-text, #fff);
  }

  .agent-ticket {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    width: 100%;
    padding: 0.5rem 0.6rem;
    border: 0;
    border-radius: 0.6rem;
    background: transparent;
    color: var(--uikit-v2-text, #fff);
    text-align: left;
    cursor: pointer;
    transition: background 0.15s ease;
  }

  .agent-ticket:hover,
  .agent-ticket--active {
    background: color-mix(in srgb, var(--uikit-v2-text, #fff) 7%, transparent);
  }

  .agent-ticket__top {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-width: 0;
  }

  .agent-ticket__title {
    flex: 1;
    min-width: 0;
    font-size: 0.85rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .agent-ticket__status {
    flex: none;
    width: 0.45rem;
    height: 0.45rem;
    border-radius: 50%;
    background: #6fd39b;
  }

  .agent-ticket__status--pending {
    background: #f0b75a;
  }

  .agent-ticket__status--closed {
    background: var(--uikit-v2-muted, #999);
  }

  .agent-ticket__unread {
    flex: none;
    width: 0.5rem;
    height: 0.5rem;
    border-radius: 50%;
    background: var(--uikit-v2-accent, #e35454);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--uikit-v2-accent, #e35454) 25%, transparent);
  }

  .agent-ticket__meta {
    padding-left: 0.95rem;
    font-size: 0.72rem;
    color: var(--uikit-v2-muted, #999);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .agent-side__list {
    flex: 1;
    min-height: 0;
    min-width: 16rem;
    box-sizing: border-box;
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
    transition: background 0.15s ease;
  }

  .agent-conv:hover,
  .agent-conv--active {
    background: color-mix(in srgb, var(--uikit-v2-text, #fff) 7%, transparent);
  }

  .agent-conv__title {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.6rem;
    border: 0;
    background: none;
    color: var(--uikit-v2-text, #fff);
    font-size: 0.85rem;
    text-align: left;
    cursor: pointer;
  }

  .agent-conv__text {
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .agent-conv__dot {
    flex: none;
    width: 0.45rem;
    height: 0.45rem;
    border-radius: 50%;
    background: var(--dot);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--dot) 18%, transparent);
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
    border: 1px solid var(--agent-accent);
    border-radius: 0.45rem;
    background: var(--uikit-v2-surface, #1e1e1e);
    color: var(--uikit-v2-text, #fff);
    font: inherit;
    font-size: 0.85rem;
  }

  .agent-icon-btn {
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

  .agent-icon-btn:hover,
  .agent-icon-btn:focus-visible {
    background: color-mix(in srgb, var(--uikit-v2-text, #fff) 9%, transparent);
    color: var(--uikit-v2-text, #fff);
    outline: none;
  }

  .agent-conv__tools .agent-icon-btn {
    width: 1.75rem;
    height: 1.75rem;
  }

  .agent-scrim {
    display: none;
  }

  /* ── chat ── */
  .agent-chat {
    position: relative;
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  /* soft persona glow at the top of the chat */
  .agent-chat::before {
    content: '';
    position: absolute;
    inset: 0 0 auto;
    height: 14rem;
    background: radial-gradient(
      60% 100% at 50% 0%,
      color-mix(in srgb, var(--agent-accent) 9%, transparent),
      transparent 75%
    );
    pointer-events: none;
    transition: background 0.5s ease;
  }

  .agent-chat__head {
    position: relative;
    z-index: 1;
    display: flex;
    align-items: center;
    gap: 0.65rem;
    padding: 0.65rem 1rem;
  }

  .agent-chat__head .agent-chat__panel-btn {
    display: none;
  }

  .agent-chat__face {
    display: inline-flex;
  }

  .agent-chat__who {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .agent-chat__name {
    font-weight: 750;
    font-size: 1rem;
    letter-spacing: 0.01em;
  }

  .agent-chat__beta {
    margin-left: 0.3rem;
    padding: 0.05rem 0.35rem;
    border-radius: 0.35rem;
    background: color-mix(in srgb, var(--agent-accent) 20%, transparent);
    color: var(--agent-accent);
    font-size: 0.62rem;
    font-weight: 700;
    vertical-align: 0.15em;
    transition:
      background 0.4s ease,
      color 0.4s ease;
  }

  .agent-chat__sub {
    font-size: 0.76rem;
    color: var(--uikit-v2-muted, #999);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .agent-chat__head-end {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 0.5rem;
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

  .agent-chat__scroll {
    position: relative;
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    scrollbar-width: thin;
  }

  .agent-chat__inner {
    max-width: 47rem;
    min-height: 100%;
    margin: 0 auto;
    padding: 1.25rem 1.5rem 1.5rem;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
  }

  .agent-thread {
    display: flex;
    flex-direction: column;
    gap: 1.75rem;
  }

  .agent-center {
    flex: 1;
    display: grid;
    place-items: center;
    align-content: center;
    gap: 1rem;
  }

  /* ── empty chat ── */
  .agent-hero {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.85rem;
    text-align: center;
    padding: 1rem 0 2rem;
  }

  .agent-hero__face {
    display: inline-flex;
    margin-bottom: 0.3rem;
    filter: drop-shadow(0 10px 28px color-mix(in srgb, var(--agent-accent) 30%, transparent));
  }

  .agent-hero__title {
    margin: 0;
    font-size: 1.75rem;
    font-weight: 800;
    letter-spacing: -0.01em;
  }

  .agent-hero__name {
    color: var(--agent-accent);
  }

  .agent-hero__text {
    margin: 0;
    max-width: 32rem;
    color: var(--uikit-v2-muted, #999);
    line-height: 1.6;
  }

  .agent-starters {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.6rem;
    width: 100%;
    max-width: 38rem;
    margin-top: 1rem;
  }

  .agent-starter {
    padding: 0.8rem 0.95rem;
    border: 1px solid color-mix(in srgb, var(--uikit-v2-text, #fff) 9%, transparent);
    border-radius: 0.9rem;
    background: color-mix(in srgb, var(--uikit-v2-text, #fff) 3%, transparent);
    color: var(--uikit-v2-text, #fff);
    font-size: 0.87rem;
    text-align: left;
    line-height: 1.4;
    cursor: pointer;
    animation: agent-starter-in 0.4s cubic-bezier(0.2, 0.8, 0.2, 1) both;
    animation-delay: calc(80ms + var(--i, 0) * 45ms);
    transition:
      border-color 0.15s ease,
      background 0.15s ease,
      transform 0.15s ease;
  }

  @keyframes agent-starter-in {
    from {
      opacity: 0;
      transform: translateY(8px);
    }
  }

  .agent-starter:hover:not(:disabled),
  .agent-starter:focus-visible {
    border-color: color-mix(in srgb, var(--agent-accent) 50%, transparent);
    background: color-mix(in srgb, var(--agent-accent) 9%, transparent);
    transform: translateY(-1px);
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
    color: var(--agent-accent);
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
    border: 1px solid color-mix(in srgb, var(--agent-accent) 35%, transparent);
    border-radius: 1rem;
    background: color-mix(in srgb, var(--agent-accent) 8%, transparent);
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
    background: color-mix(in srgb, var(--agent-accent) 22%, transparent);
    color: var(--agent-accent);
  }

  /* ── composer ── */
  .agent-composer-wrap {
    max-width: 47rem;
    width: 100%;
    margin: 0 auto;
    padding: 0.25rem 1.5rem 0.85rem;
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
    flex-direction: column;
    gap: 0.35rem;
    padding: 0.8rem 0.6rem 0.55rem 1rem;
    border: 1px solid color-mix(in srgb, var(--uikit-v2-text, #fff) 10%, transparent);
    border-radius: 1.4rem;
    background: var(--uikit-v2-surface, #1e1e1e);
    box-shadow:
      0 10px 34px rgba(0, 0, 0, 0.26),
      0 1px 0 color-mix(in srgb, var(--uikit-v2-text, #fff) 5%, transparent) inset;
    transition:
      border-color 0.2s ease,
      box-shadow 0.2s ease;
  }

  .agent-composer:focus-within {
    border-color: color-mix(in srgb, var(--agent-accent) 50%, transparent);
    box-shadow:
      0 10px 34px rgba(0, 0, 0, 0.26),
      0 0 0 4px color-mix(in srgb, var(--agent-accent) 10%, transparent);
  }

  .agent-composer--disabled {
    opacity: 0.6;
  }

  .agent-composer textarea {
    min-height: 1.6rem;
    max-height: 220px;
    padding: 0.1rem 0.4rem 0.1rem 0;
    scrollbar-width: thin;
    border: 0;
    outline: none;
    resize: none;
    background: transparent;
    color: var(--uikit-v2-text, #fff);
    font: inherit;
    font-size: 0.95rem;
    line-height: 1.55;
  }

  .agent-composer textarea::placeholder {
    color: var(--uikit-v2-muted, #999);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .agent-composer__bar {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-left: -0.45rem;
  }

  .agent-composer__end {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .agent-composer__count {
    font-size: 0.72rem;
    color: var(--uikit-v2-muted, #999);
    font-variant-numeric: tabular-nums;
  }

  /* persona switcher: segmented control with a sliding thumb */
  .agent-persona {
    position: relative;
    display: inline-grid;
    grid-template-columns: 1fr 1fr;
    padding: 0.18rem;
    border-radius: 0.8rem;
    background: color-mix(in srgb, var(--uikit-v2-text, #fff) 5%, transparent);
  }

  .agent-persona__thumb {
    position: absolute;
    top: 0.18rem;
    bottom: 0.18rem;
    left: 0.18rem;
    width: calc(50% - 0.18rem);
    border-radius: 0.65rem;
    background: color-mix(in srgb, var(--agent-accent) 22%, var(--uikit-v2-elevated, #2a2a2a));
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--agent-accent) 40%, transparent);
    transform: translateX(calc(var(--idx, 0) * 100%));
    transition:
      transform 0.32s cubic-bezier(0.34, 1.3, 0.64, 1),
      background 0.35s ease,
      box-shadow 0.35s ease;
  }

  .agent-persona :global(.uiv2-tooltip__trigger) {
    position: relative;
    display: flex;
  }

  .agent-persona__opt {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.35rem;
    width: 100%;
    padding: 0.2rem 0.65rem 0.2rem 0.35rem;
    border: 0;
    border-radius: 0.65rem;
    background: transparent;
    color: var(--uikit-v2-muted, #999);
    font-size: 0.8rem;
    font-weight: 650;
    cursor: pointer;
    transition: color 0.2s ease;
  }

  .agent-persona__opt:hover:not(:disabled),
  .agent-persona__opt:focus-visible {
    color: var(--uikit-v2-text, #fff);
    outline: none;
  }

  .agent-persona__opt--on {
    color: var(--uikit-v2-text, #fff);
  }

  .agent-persona__opt:disabled {
    cursor: default;
  }

  .agent-persona__opt:disabled:not(.agent-persona__opt--on) {
    opacity: 0.5;
  }

  /* profile access chip */
  .agent-profile-chip {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.22rem 0.3rem 0.22rem 0.6rem;
    border-radius: 0.8rem;
    background: color-mix(in srgb, var(--uikit-v2-text, #fff) 5%, transparent);
    color: var(--uikit-v2-muted, #999);
    font-size: 0.8rem;
    font-weight: 600;
    transition:
      background 0.25s ease,
      color 0.25s ease;
  }

  .agent-profile-chip--on {
    background: color-mix(in srgb, var(--agent-accent) 12%, transparent);
    color: var(--uikit-v2-text, #fff);
  }

  .agent-profile-chip__icon {
    display: inline-flex;
  }

  .agent-profile-chip--on .agent-profile-chip__icon {
    color: var(--agent-accent);
  }

  .agent-send {
    display: inline-grid;
    place-items: center;
    flex: none;
    width: 2.3rem;
    height: 2.3rem;
    border: 0;
    border-radius: 0.8rem;
    background: var(--agent-accent);
    color: #fff;
    cursor: pointer;
    transition:
      transform 0.15s ease,
      opacity 0.15s ease,
      background 0.35s ease;
  }

  .agent-send:disabled {
    opacity: 0.3;
    cursor: default;
  }

  .agent-send:not(:disabled):hover {
    transform: translateY(-1px) scale(1.04);
  }

  .agent-send:not(:disabled):active {
    transform: scale(0.95);
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

  /* ── narrow: conversations become a drawer ── */
  @container (max-width: 760px) {
    .agent-side,
    .agent-page--side-collapsed .agent-side {
      position: absolute;
      inset: 0 auto 0 0;
      z-index: 5;
      width: min(18rem, 85%);
      opacity: 1;
      border-right-width: 1px;
      background: var(--uikit-v2-surface, #1e1e1e);
      transform: translateX(-100%);
      transition: transform 0.22s ease;
    }

    .agent-page--panel-open .agent-side {
      transform: none;
      box-shadow: 0 0 40px rgba(0, 0, 0, 0.45);
    }

    .agent-side__head,
    .agent-side__list,
    .agent-modes,
    .agent-ticket-filters {
      min-width: 0;
    }

    .agent-side .agent-side__close,
    .agent-chat__head .agent-chat__panel-btn {
      display: inline-grid;
    }

    .agent-chat__head :global(.uiv2-tooltip__trigger:has(.agent-chat__side-btn)) {
      display: none;
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

    .agent-chat__inner,
    .agent-composer-wrap {
      padding-left: 0.85rem;
      padding-right: 0.85rem;
    }

    .agent-profile-chip__text {
      display: none;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .agent-starter {
      animation: none;
    }
  }
</style>
