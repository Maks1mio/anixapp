<script lang="ts">
  import { onMount, onDestroy, tick } from 'svelte';
  import { navigate } from '../../stores/navigation';
  import { fetchComments, sendComment, fetchAnnouncements, deleteComment, fetchUserPermissions } from '../../services/announcements';
  import type { Announcement, Comment } from '../../services/announcements';

  import { TYPE_CONFIG } from './_types';
  import type { ReplyTo, SlashResult, ReleaseEmbed } from './_types';
  import { getSelf, parseMessage, extractPosterUrl } from './_utils';

  import Header from './Header.svelte';
  import Composer from './Composer.svelte';
  import { ChatFeed } from './components';
  import type { ReleaseCardData } from '../../types/release';

  interface Props { id: string; }
  let { id }: Props = $props();

  let announcement = $state<Announcement | null>(null);
  const cfg = $derived(TYPE_CONFIG[announcement?.type ?? 'NOTE'] ?? TYPE_CONFIG.NOTE);

  interface UserRole { id: number; name: string; color: string; }
  let profileCache = $state<Record<number, { login: string; avatar: string | null; roles?: UserRole[] }>>({});
  let releaseCache = $state<Record<number, ReleaseEmbed | 'loading' | 'error'>>({});
  let comments = $state<Comment[]>([]);
  let loadState = $state<'loading' | 'ready'>('loading');
  let pollTimer: ReturnType<typeof setInterval> | null = null;

  let text = $state('');
  let sending = $state(false);
  let sendError = $state('');
  let inputEl: HTMLTextAreaElement | undefined = $state();
  let replyTo = $state<ReplyTo | null>(null);
  let userPermissions = $state<string[]>([]);
  const canModerate = $derived(userPermissions.includes('delete_any_comment'));

  let slashResults = $state<SlashResult[]>([]);
  let slashLoading = $state(false);
  let slashActiveIdx = $state(0);
  let slashTimer: ReturnType<typeof setTimeout> | null = null;

  const slashMatch = $derived(text.match(/^\/title\s+(.*)/s));
  const slashQuery = $derived(slashMatch ? slashMatch[1].trim() : '');
  const showSlash = $derived(!!slashMatch && !/^\d+$/.test(slashQuery) && slashQuery.length > 0);

  async function enrichProfiles(ids: number[]) {
    const missing = [...new Set(ids)].filter(i => !(i in profileCache));
    await Promise.allSettled(missing.map(async uid => {
      try {
        const [profileData, rolesData] = await Promise.allSettled([
          (window as any).anixApi?.profile?.info?.(uid),
          fetch(`https://nhapp-api.onrender.com/api/users/${uid}/roles`, { signal: AbortSignal.timeout(4000) }).then(r => r.ok ? r.json() : null).catch(() => null),
        ]);
        const p = profileData.status === 'fulfilled' ? profileData.value?.profile : undefined;
        const roles: UserRole[] = rolesData.status === 'fulfilled' ? (rolesData.value?.roles ?? []).map((r: any) => ({ id: r.id, name: r.name, color: r.color })) : [];
        if (p) profileCache = { ...profileCache, [uid]: { login: p.login ?? p.nickname ?? String(uid), avatar: p.avatar ?? null, roles } };
      } catch { /* ignore */ }
    }));
  }

  async function fetchRelease(releaseId: number) {
    if (releaseId in releaseCache) return;
    releaseCache = { ...releaseCache, [releaseId]: 'loading' };
    try {
      const data = await (window as any).anixApi?.release?.info?.(releaseId, true) as any;
      const r = data?.release as Record<string, any> | undefined;
      if (!r) { releaseCache = { ...releaseCache, [releaseId]: 'error' }; return; }
      releaseCache = { ...releaseCache, [releaseId]: {
        id: releaseId,
        titleRu: r.title_ru ?? r.titleRu,
        titleEn: r.title_original ?? r.titleEn,
        poster: extractPosterUrl(r),
        rating: typeof r.grade === 'number' ? r.grade : (typeof r.rating === 'number' ? r.rating : undefined),
        voteCount: typeof r.vote_count === 'number' ? r.vote_count : undefined,
        episodesReleased: typeof r.episodes_released === 'number' ? r.episodes_released : undefined,
        episodesTotal: typeof r.episodes_total === 'number' ? r.episodes_total : undefined,
        year: r.year != null ? String(r.year) : undefined,
        category: (r.category as any)?.name,
        status: (r.status as any)?.name,
        genres: typeof r.genres === 'string' ? r.genres : undefined,
      }};
    } catch {
      releaseCache = { ...releaseCache, [releaseId]: 'error' };
    }
  }

  function scrollToBottom(smooth = false) {
    const el = document.getElementById('content');
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'instant' });
  }

  async function loadMessages(autoScroll = false) {
    try {
      const list = await fetchComments(id);
      const el = document.getElementById('content');
      const wasAtBottom = !el || (el.scrollHeight - el.scrollTop - el.clientHeight < 100);
      comments = list;
      await enrichProfiles(list.map(c => c.userId));
      for (const c of list) {
        const m = parseMessage(c.message);
        if (m.releaseId) fetchRelease(m.releaseId);
        // Preload release embed for replied-to messages (needed for quote thumbnail)
        if (m.replyId) {
          const parent = list.find(x => x.id === m.replyId);
          if (parent) {
            const pm = parseMessage(parent.message);
            if (pm.releaseId) fetchRelease(pm.releaseId);
          }
        }
      }
      if (autoScroll || wasAtBottom) {
        await tick();
        scrollToBottom(false);
        requestAnimationFrame(() => requestAnimationFrame(() => scrollToBottom(false)));
        setTimeout(() => scrollToBottom(false), 100);
        setTimeout(() => scrollToBottom(false), 400);
        setTimeout(() => scrollToBottom(false), 800);
      }
    } catch { /* ignore */ }
  }

  function setReply(c: Comment) {
    const parsed = parseMessage(c.message);
    replyTo = { id: c.id, userId: c.userId, message: parsed.text || '📎 Вложение' };
    inputEl?.focus();
  }

  function mentionUser(userId: number) {
    const tag = `@[${userId}]`;
    if (!text.includes(tag)) text = text ? `${text} ${tag} ` : `${tag} `;
    inputEl?.focus();
  }

  $effect(() => {
    const q = slashQuery;
    if (!showSlash) { slashResults = []; return; }
    if (slashTimer) clearTimeout(slashTimer);
    slashTimer = setTimeout(() => doSlashSearch(q), 280);
    return () => { if (slashTimer) clearTimeout(slashTimer); };
  });

  async function doSlashSearch(query: string) {
    if (!query.trim()) { slashResults = []; return; }
    slashLoading = true;
    slashActiveIdx = 0;
    try {
      const api = (window as any).anixApi;
      if (!api?.search?.releases) { slashResults = []; return; }
      const data = await api.search.releases(query.trim(), 0) as any;
      let content: unknown = data?.content ?? data?.releases ?? data?.data ?? (Array.isArray(data) ? data : []);
      if (content && !Array.isArray(content)) {
        const obj = content as Record<string, unknown>;
        content = Array.isArray(obj?.releases) ? obj.releases : [];
      }
      const items = Array.isArray(content) ? content : [];
      slashResults = items.slice(0, 7).map((r: any) => ({
        id: r.id,
        title: r.title_ru || r.title_original || r.title || 'Без названия',
        poster: extractPosterUrl(r) ?? '',
        year: r.year != null ? String(r.year) : undefined,
      }));
    } catch { slashResults = []; } finally { slashLoading = false; }
  }

  async function sendGif(url: string) {
    const self = getSelf();
    if (!self || !announcement?.commentsEnabled || announcement?.commentsLocked || sending) return;
    const body = replyTo ? `<<${replyTo.id}>>\n<<gif:${url}>>` : `<<gif:${url}>>`;
    sending = true;
    sendError = '';
    try {
      const c = await sendComment(id, self.id, body);
      replyTo = null;
      comments = [...comments, c];
      profileCache = { ...profileCache, [self.id]: { login: self.login, avatar: self.avatar } };
      await tick();
      scrollToBottom(true);
    } catch (e: any) {
      sendError = e.message ?? 'Ошибка';
    } finally {
      sending = false;
    }
  }

  function selectSlashTitle(result: SlashResult) {
    text = `/title ${result.id}`;
    slashResults = [];
    inputEl?.focus();
  }

  function handleSlashKey(e: KeyboardEvent) {
    if (!showSlash && !slashResults.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); slashActiveIdx = (slashActiveIdx + 1) % slashResults.length; }
    else if (e.key === 'ArrowUp') { e.preventDefault(); slashActiveIdx = (slashActiveIdx - 1 + slashResults.length) % slashResults.length; }
    else if (e.key === 'Tab' && slashResults.length) { e.preventDefault(); selectSlashTitle(slashResults[slashActiveIdx]); }
  }

  async function submit() {
    const self = getSelf();
    if (!self || sending) return;
    if (!announcement?.commentsEnabled || announcement?.commentsLocked) return;

    let body = text.trim();
    if (!body) return;
    const titleMatch = body.match(/^\/title\s+(\d+)$/);
    if (titleMatch) body = `<<release:${titleMatch[1]}>>`;
    if (replyTo) body = `<<${replyTo.id}>>\n${body}`;

    sending = true;
    sendError = '';
    try {
      const c = await sendComment(id, self.id, body);
      text = '';
      replyTo = null;
      slashResults = [];
      if (inputEl) inputEl.style.height = 'auto';
      comments = [...comments, c];
      profileCache = { ...profileCache, [self.id]: { login: self.login, avatar: self.avatar } };
      const parsed = parseMessage(c.message);
      if (parsed.releaseId) fetchRelease(parsed.releaseId);
      await tick();
      scrollToBottom(true);
    } catch (e: any) {
      sendError = e.message ?? 'Ошибка';
    } finally {
      sending = false;
    }
  }

  function autoResize(e: Event) {
    const t = e.currentTarget as HTMLTextAreaElement;
    t.style.height = 'auto';
    t.style.height = Math.min(t.scrollHeight, 200) + 'px';
  }

  function openProfile(userId: number) { navigate(`/profile/${userId}`); }

  async function removeComment(commentId: string) {
    const self = getSelf();
    if (!self) return;
    try {
      await deleteComment(id, commentId, self.id);
      comments = comments.filter(c => c.id !== commentId);
    } catch (e: any) {
      console.error('Delete failed:', e.message);
    }
  }

  function embedToCardData(embed: ReleaseEmbed): ReleaseCardData {
    return {
      id: embed.id,
      titleRu: embed.titleRu,
      titleEn: embed.titleEn,
      poster: embed.poster,
      rating: embed.rating,
      voteCount: embed.voteCount ?? (embed.rating != null && embed.rating > 0 ? 1 : undefined),
      episodesReleased: embed.episodesReleased,
      episodesTotal: embed.episodesTotal,
      year: embed.year,
      status: embed.status,
      category: embed.category,
      genres: embed.genres,
    };
  }

  onMount(async () => {
    const list = await fetchAnnouncements();
    announcement = list.find(a => a.id === id) ?? null;
    await loadMessages(true);
    loadState = 'ready';
    const self = getSelf();
    if (self) {
      userPermissions = await fetchUserPermissions(self.id);
    }
    pollTimer = setInterval(() => loadMessages(false), 5000);
    requestAnimationFrame(() => scrollToBottom(false));
    setTimeout(() => scrollToBottom(false), 300);
    setTimeout(() => scrollToBottom(false), 900);
  });

  onDestroy(() => { if (pollTimer) clearInterval(pollTimer); });
</script>

<div class="dc" style="--hc: {cfg.color}">
  <div class="dc__bg"></div>

  {#if announcement}
    <Header {announcement} count={comments.length} {cfg} {loadState} />
  {/if}

  <ChatFeed
    {comments}
    {loadState}
    {profileCache}
    {releaseCache}
    {announcement}
    accentColor={cfg.color}
    onReply={setReply}
    onMention={mentionUser}
    onOpenProfile={openProfile}
    {embedToCardData}
    {canModerate}
    onDelete={removeComment}
  />

  <Composer
    {announcement}
    {text}
    {sending}
    {sendError}
    {replyTo}
    {slashResults}
    {slashLoading}
    {showSlash}
    {slashActiveIdx}
    {profileCache}
    bind:inputEl
    onSubmit={submit}
    onClearReply={() => { replyTo = null; }}
    onSelectTitle={selectSlashTitle}
    onSlashKey={handleSlashKey}
    onAutoResize={autoResize}
    onTextInput={(val) => { text = val; }}
    onActiveIdxChange={(idx) => { slashActiveIdx = idx; }}
    onSelectGif={sendGif}
  />
</div>

<style lang="scss">
@use '../../styles/variables' as *;

.dc {
  position: relative;
  margin: 0 auto;
  width: 100%;
  min-height: 100%;
  display: flex;
  flex-direction: column;
  background: $color-bg;
}

.dc__bg {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: linear-gradient(to bottom, color-mix(in srgb, var(--hc) 6%, transparent) 0%, transparent 40%);
  z-index: 0;
}

.dc > :not(.dc__bg) {
  position: relative;
  z-index: 1;
}
</style>
