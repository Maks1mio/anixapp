<script lang="ts">
  import { onMount } from 'svelte';
  import {
    createIcons,
    Info, Lightbulb, Zap, TriangleAlert, ShieldAlert,
    ArrowUpRight, ThumbsUp, ThumbsDown, MessageCircle,
  } from 'lucide';
  import { navigate } from '../stores/navigation';
  import type { Announcement } from '../services/announcements';
  import { fetchReactions, sendReaction } from '../services/announcements';
  import type { Reaction, ReactionsResult } from '../services/announcements';

  interface Props { announcement: Announcement; }
  let { announcement }: Props = $props();

  const TYPE_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
    NOTE:       { label: 'Заметка',        color: '#60a5fa', icon: 'info' },
    TIP:        { label: 'Совет',          color: '#4ade80', icon: 'lightbulb' },
    IMPORTANT:  { label: 'Важно',          color: '#a78bfa', icon: 'zap' },
    WARNING:    { label: 'Предупреждение', color: '#fbbf24', icon: 'triangle-alert' },
    CAUTION:    { label: 'Внимание',       color: '#f87171', icon: 'shield-alert' },
    DISCUSSION: { label: 'Обсуждение',     color: '#38bdf8', icon: 'message-circle' },
  };
  const cfg = $derived(TYPE_CONFIG[announcement.type] ?? TYPE_CONFIG.NOTE);

  function getSelfId(): number | undefined {
    return (window as any).__anixProfile?.id;
  }

  // ── Reactions ─────────────────────────────────────────────────────────────
  let reactions    = $state<ReactionsResult>({ likes: 0, dislikes: 0, userReaction: null });
  let reactionBusy = $state(false);

  async function loadReactions() {
    try { reactions = await fetchReactions(announcement.id, getSelfId()); } catch { /* ignore */ }
  }

  async function react(r: Reaction) {
    const uid = getSelfId();
    if (!uid || reactionBusy) return;
    reactionBusy = true;
    try { reactions = await sendReaction(announcement.id, uid, r); } catch { /* ignore */ } finally { reactionBusy = false; }
  }

  // ── Commenters avatars — resolved from IDs the API already gave us ────────
  interface Commenter { id: number; login: string; avatar: string | null; }
  let commenters = $state<Commenter[]>([]);

  async function resolveCommenters() {
    const ids = announcement.lastCommenterIds ?? [];
    if (ids.length === 0) return;
    const results = await Promise.all(ids.map(async uid => {
      try {
        const data = await (window as any).anixApi?.profile?.info?.(uid);
        const p = data?.profile;
        return {
          id: uid,
          login: p?.login ?? p?.nickname ?? String(uid),
          avatar: p?.avatar ?? null,
        } as Commenter;
      } catch {
        return { id: uid, login: String(uid), avatar: null } as Commenter;
      }
    }));
    commenters = results;
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  function openChat() { navigate(`/announcement/${announcement.id}/chat`); }

  function handleLink(e: Event) {
    e.preventDefault();
    if (announcement.link?.url) (window as any).electron?.openExternal?.(announcement.link.url);
  }

  function commentLabel(n: number): string {
    if (n % 100 >= 11 && n % 100 <= 14) return `${n} комментариев`;
    const m = n % 10;
    if (m === 1) return `${n} комментарий`;
    if (m >= 2 && m <= 4) return `${n} комментария`;
    return `${n} комментариев`;
  }

  const commentCount    = $derived(announcement.commentCount ?? 0);
  const showCommentsBar = $derived(announcement.commentsEnabled && commentCount > 0);
  const showAvatars     = $derived(commenters.length >= 2);

  // ── Parse lastMessage into { type, text } for rich preview ───────────────
  type PreviewKind = 'text' | 'gif' | 'release' | 'sticker';
  interface MsgPreview { kind: PreviewKind; text: string; }

  const lastPreview = $derived.by((): MsgPreview | null => {
    const raw = announcement.lastMessage;
    if (!raw) return null;
    // Strip reply prefix <<uuid>>\n
    let msg = raw.replace(/^<<[0-9a-f-]{8}-[0-9a-f-]{4}-[0-9a-f-]{4}-[0-9a-f-]{4}-[0-9a-f-]{12}>>\n?/i, '');
    // Release-only
    if (/^<<release:\d+>>$/i.test(msg.trim())) return { kind: 'release', text: 'Аниме' };
    // GIF
    if (/<<gif:[^>]+>>/i.test(msg)) return { kind: 'gif', text: 'GIF' };
    // Plain text — strip any remaining tags
    const text = msg.replace(/<<[^>]*>>/g, '').trim().slice(0, 72);
    return text ? { kind: 'text', text } : null;
  });

  let rootEl: HTMLElement;
  onMount(() => {
    createIcons({ icons: { Info, Lightbulb, Zap, TriangleAlert, ShieldAlert, ArrowUpRight, ThumbsUp, ThumbsDown, MessageCircle }, root: rootEl });
    loadReactions();
    resolveCommenters();
  });
</script>

<div class="ann" style="--c:{cfg.color}" bind:this={rootEl}>
  <div class="ann__stripe"></div>

  <div class="ann__body" class:ann__body--no-bar={!showCommentsBar}>

    <!-- Type badge -->
    <div class="ann__type">
      <i data-lucide={cfg.icon}></i>
      <span>{cfg.label}</span>
    </div>

    <!-- Message -->
    <p class="ann__msg">{announcement.message}</p>

    <!-- External link -->
    {#if announcement.link?.url}
      <a class="ann__link" href={announcement.link.url} onclick={handleLink}>
        {announcement.link.label || 'Подробнее'}
        <i data-lucide="arrow-up-right"></i>
      </a>
    {/if}

    <!-- Reactions -->
    <div class="ann__reactions">
      <button
        class="ann__pill"
        class:ann__pill--like-active={reactions.userReaction === 'like'}
        onclick={() => react('like')}
        disabled={reactionBusy || !getSelfId()}
        title="Нравится"
      >
        <i data-lucide="thumbs-up"></i>
        {#if reactions.likes > 0}<span>{reactions.likes}</span>{/if}
      </button>

      <button
        class="ann__pill ann__pill--dislike"
        class:ann__pill--dislike-active={reactions.userReaction === 'dislike'}
        onclick={() => react('dislike')}
        disabled={reactionBusy || !getSelfId()}
        title="Не нравится"
      >
        <i data-lucide="thumbs-down"></i>
        {#if reactions.dislikes > 0}<span>{reactions.dislikes}</span>{/if}
      </button>
    </div>

    <!-- Comments strip -->
    {#if showCommentsBar}
      <button class="ann__cbar" onclick={openChat}>

        {#if showAvatars}
          <!-- Stacked avatars -->
          <div class="ann__avstack">
            {#each commenters as u (u.id)}
              <div
                class="ann__av"
                style={u.avatar
                  ? `background-image:url(${u.avatar})`
                  : `--fc:${cfg.color}`}
              >{#if !u.avatar}{u.login.charAt(0).toUpperCase()}{/if}</div>
            {/each}
          </div>
        {:else}
          <i class="ann__cbar-ico" data-lucide="message-circle"></i>
        {/if}

        <div class="ann__cbar-text">
          <span class="ann__cbar-count">{commentLabel(commentCount)}</span>
          {#if lastPreview}
            <span class="ann__cbar-preview">
              {#if lastPreview.kind === 'gif'}
                <!-- GIF icon -->
                <svg class="ann__preview-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="2" y="6" width="20" height="12" rx="3"/>
                  <path d="M10 9v6M10 12h2.5a1.5 1.5 0 0 1 0 3H10"/>
                  <path d="M17 12h-1.5a1.5 1.5 0 0 0 0 3H17"/>
                  <path d="M17 9v1.5"/>
                  <path d="M7 9a3 3 0 0 0 0 6h.5"/>
                  <path d="M7 12h2"/>
                </svg>
                GIF
              {:else if lastPreview.kind === 'release'}
                <!-- Film icon -->
                <svg class="ann__preview-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="2" y="2" width="20" height="20" rx="2.18"/>
                  <line x1="7" y1="2" x2="7" y2="22"/>
                  <line x1="17" y1="2" x2="17" y2="22"/>
                  <line x1="2" y1="12" x2="22" y2="12"/>
                  <line x1="2" y1="7" x2="7" y2="7"/>
                  <line x1="2" y1="17" x2="7" y2="17"/>
                  <line x1="17" y1="17" x2="22" y2="17"/>
                  <line x1="17" y1="7" x2="22" y2="7"/>
                </svg>
                Аниме
              {:else}
                {lastPreview.text}
              {/if}
            </span>
          {/if}
        </div>

        <svg class="ann__cbar-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M9 18l6-6-6-6"/>
        </svg>
      </button>
    {/if}

  </div>
</div>

<style lang="scss">
.ann {
  display: grid;
  grid-template-columns: 3px 1fr;
  border-radius: 2px;
  overflow: hidden;
  background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.06);
  animation: ann-in 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  transition: border-color 0.2s;
  &:hover { border-color: color-mix(in srgb, var(--c) 22%, transparent); }
}

@keyframes ann-in {
  from { opacity: 0; transform: translateY(-5px); }
  to   { opacity: 1; transform: translateY(0); }
}

.ann__stripe {
  background: var(--c);
  box-shadow: 2px 0 10px color-mix(in srgb, var(--c) 50%, transparent);
}

.ann__body {
  padding: 0.75rem 0.95rem 0 0.9rem;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  min-width: 0;

  // Нет comments bar — добавляем нижний отступ равный верхнему
  &--no-bar { padding-bottom: 0.75rem; }
}

// ── Type badge ─────────────────────────────────────────────────────────────

.ann__type {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  color: var(--c);
  font-size: 0.66rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  i { width: 12px; height: 12px; }
  :global(svg) { width: 12px; height: 12px; stroke: currentColor; }
}

// ── Message ───────────────────────────────────────────────────────────────

.ann__msg {
  margin: 0;
  font-size: 0.875rem;
  line-height: 1.55;
  color: #dde1f0;
  white-space: pre-wrap;
  word-break: break-word;
}

// ── Link ──────────────────────────────────────────────────────────────────

.ann__link {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.18rem 0.5rem;
  font-size: 0.73rem;
  font-weight: 600;
  color: var(--c);
  background: color-mix(in srgb, var(--c) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--c) 20%, transparent);
  border-radius: 5px;
  text-decoration: none;
  width: fit-content;
  transition: background 0.15s;
  :global(svg) { width: 11px; height: 11px; stroke: currentColor; }
  &:hover { background: color-mix(in srgb, var(--c) 18%, transparent); }
}

// ── Reaction pills ────────────────────────────────────────────────────────

.ann__reactions {
  display: flex;
  align-items: center;
  gap: 0.2rem;
  margin-top: 0.1rem;
}

.ann__pill {
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
  padding: 0.2rem 0.5rem;
  border: 1px solid transparent;
  border-radius: 20px;
  background: rgba(255,255,255,0.05);
  color: rgba(255,255,255,0.4);
  font-size: 0.7rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
  :global(svg) { width: 12px; height: 12px; stroke: currentColor; }

  &:hover:not(:disabled) { background: rgba(255,255,255,0.09); color: rgba(255,255,255,0.7); }
  &:disabled { opacity: 0.35; cursor: default; }

  &--like-active {
    background: color-mix(in srgb, var(--c) 15%, transparent) !important;
    border-color: color-mix(in srgb, var(--c) 30%, transparent) !important;
    color: var(--c) !important;
  }
  &--dislike-active {
    background: rgba(248,113,113,0.12) !important;
    border-color: rgba(248,113,113,0.3) !important;
    color: #f87171 !important;
  }
}

// ── Comments strip ────────────────────────────────────────────────────────

.ann__cbar {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  // stretch edge-to-edge (undo body padding)
  width: calc(100% + 0.95rem + 0.9rem);
  margin: 0.3rem -0.95rem 0 -0.9rem;
  padding: 0.55rem 0.9rem;
  border: none;
  border-top: 1px solid rgba(255,255,255,0.06);
  background: rgba(255,255,255,0.02);
  cursor: pointer;
  transition: background 0.15s;
  text-align: left;

  &:hover {
    background: color-mix(in srgb, var(--c) 7%, rgba(255,255,255,0.025));
    .ann__cbar-count { color: rgba(255,255,255,0.8); }
    .ann__cbar-chevron { color: rgba(255,255,255,0.5); transform: translateX(2px); }
  }
}

// Stacked avatars
.ann__avstack {
  display: flex;
  flex-direction: row-reverse;
  flex-shrink: 0;
}

.ann__av {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: 2px solid #14151d;
  background-color: color-mix(in srgb, var(--fc, var(--c)) 25%, #1e2030);
  background-size: cover;
  background-position: center;
  color: var(--fc, var(--c));
  font-size: 0.52rem;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  margin-left: -7px;
  &:last-child { margin-left: 0; }
}

.ann__cbar-ico {
  width: 16px; height: 16px; flex-shrink: 0;
  color: rgba(255,255,255,0.3);
  :global(svg) { width: 16px; height: 16px; stroke: currentColor; }
}

.ann__cbar-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.05rem;
}

.ann__cbar-count {
  font-size: 0.78rem;
  font-weight: 600;
  color: rgba(255,255,255,0.45);
  transition: color 0.15s;
  line-height: 1.2;
}

.ann__cbar-preview {
  display: flex;
  align-items: center;
  gap: 0.28rem;
  font-size: 0.7rem;
  color: rgba(255,255,255,0.28);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.2;
}

.ann__preview-icon {
  flex-shrink: 0;
  width: 12px;
  height: 12px;
  stroke: rgba(255,255,255,0.35);
  color: rgba(255,255,255,0.35);
}

.ann__cbar-chevron {
  flex-shrink: 0;
  color: rgba(255,255,255,0.2);
  transition: color 0.15s, transform 0.15s;
}
</style>
