<script lang="ts">
  import type { Comment } from "../../../services/announcements";
  import type { ReleaseEmbed } from "../_types";
  import type { ReleaseCardData } from "../../../types/release";
  import ReleaseCardV from "../../../components/ReleaseCardV.svelte";
  import { parseMessage, renderText, timeStr, fullTime } from "../_utils";

  interface UserRole { id: number; name: string; color: string; }
  interface Profile { login: string; avatar: string | null; roles?: UserRole[]; }

  interface Props {
    comment: Comment;
    grouped: boolean;
    showAvatar: boolean;
    isMine: boolean;
    profile: Profile | undefined;
    embed: ReleaseEmbed | "loading" | "error" | undefined;
    replied: Comment | null;
    repliedProfile: Profile | undefined;
    repliedEmbed: ReleaseEmbed | "loading" | "error" | undefined;
    showActions: boolean;
    profileCache: Record<number, Profile>;
    onReply: (c: Comment) => void;
    onMention: (userId: number) => void;
    onOpenProfile: (userId: number) => void;
    embedToCardData: (e: ReleaseEmbed) => ReleaseCardData;
    canDelete: boolean;
    onDelete: (commentId: string) => void;
  }

  let {
    comment,
    grouped,
    showAvatar,
    isMine,
    profile,
    embed,
    replied,
    repliedProfile,
    repliedEmbed,
    showActions,
    profileCache,
    onReply,
    onMention,
    onOpenProfile,
    embedToCardData,
    canDelete,
    onDelete,
  }: Props = $props();

  const parsed        = $derived(parseMessage(comment.message));
  const repliedParsed = $derived(replied ? parseMessage(replied.message) : null);

  // What text to show in the quote preview
  const quotePreview = $derived.by(() => {
    if (!repliedParsed) return "";
    if (repliedParsed.releaseId != null) return "Аниме";
    if (repliedParsed.gifUrl) return "GIF";
    return repliedParsed.text?.slice(0, 100) || "";
  });

  const quoteHasMedia = $derived(
    repliedParsed?.releaseId != null || !!repliedParsed?.gifUrl,
  );

  // Poster URL from the replied embed (for compact quote thumb)
  const repliedPosterUrl = $derived.by((): string | null => {
    if (!repliedEmbed || repliedEmbed === "loading" || repliedEmbed === "error") return null;
    const p = (repliedEmbed as any)?.release?.poster as Record<string, { url?: string }> | undefined;
    return p?.medium?.url ?? p?.small?.url ?? p?.original?.url ?? null;
  });

  const selfId = $derived(
    (window as any).__anixProfile?.id as number | undefined,
  );
  const isMentioned = $derived(
    typeof selfId === "number" &&
      !isMine &&
      !!parsed.text?.includes(`@[${selfId}]`),
  );

  // Deterministic avatar colour fallback from userId
  const FALLBACK_COLORS = [
    "#60a5fa","#4ade80","#a78bfa","#fbbf24","#f87171",
    "#38bdf8","#fb923c","#e879f9","#34d399","#f472b6",
  ];
  function userColor(uid: number): string {
    return FALLBACK_COLORS[uid % FALLBACK_COLORS.length]!;
  }

  function scrollToReplied() {
    if (!replied) return;
    const el = document.getElementById(`msg-${replied.id}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    setTimeout(() => {
      el.classList.remove("dc-row--flash");
      void el.offsetWidth;
      el.classList.add("dc-row--flash");
    }, 400);
  }

  function openExternal(url: string) {
    (window as any).electron?.openExternal?.(url);
  }
</script>

<!--
  CSS Grid layout (2 columns: avatar-col | body-col):
  With reply:    connector | quote    (row 1)
                 avatar    | body     (row 2)
  Without reply: avatar    | body     (row 1)
-->
<div
  class="dc-row"
  id="msg-{comment.id}"
  class:dc-row--grouped={grouped}
  class:dc-row--has-reply={!!replied}
  class:dc-row--mention={isMentioned}
>
  {#if replied && repliedParsed}
    <!-- col 1, row 1: connector -->
    <div class="dc-row__connector" aria-hidden="true"></div>

    <!-- col 2, row 1: quote preview -->
    <button
      type="button"
      class="dc-row__quote"
      onclick={scrollToReplied}
      title="Перейти к сообщению"
    >
      <!-- Avatar of replied user -->
      <span class="dc-row__quote-av">
        {#if repliedProfile?.avatar}
          <img src={repliedProfile.avatar} alt="" />
        {:else}
          <span
            class="dc-row__quote-av-fallback"
            style="background:color-mix(in srgb,{userColor(replied.userId)} 22%,#1e2030);color:{userColor(replied.userId)}"
          >
            {(repliedProfile?.login ?? String(replied.userId)).charAt(0).toUpperCase()}
          </span>
        {/if}
      </span>

      <span class="dc-row__quote-name">
        {repliedProfile?.login ?? replied.userId}
      </span>

      {#if quoteHasMedia}
        {#if repliedParsed.gifUrl}
          <!-- Mini GIF thumbnail in quote -->
          <span class="dc-row__quote-media">
            <img src={repliedParsed.gifUrl} alt="GIF" loading="lazy" />
          </span>
          <span class="dc-row__quote-tag">GIF</span>
        {:else if repliedParsed.releaseId != null}
          {#if repliedPosterUrl}
            <!-- Mini release poster in quote -->
            <span class="dc-row__quote-media">
              <img src={repliedPosterUrl} alt="Аниме" loading="lazy" />
            </span>
          {:else}
            <svg class="dc-row__quote-icon" width="13" height="13" viewBox="0 0 24 24"
              fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
          {/if}
          <span class="dc-row__quote-text">Аниме</span>
        {/if}
      {:else if quotePreview}
        <span class="dc-row__quote-text">{quotePreview}{quotePreview.length >= 100 ? "…" : ""}</span>
      {/if}
    </button>
  {/if}

  <!-- col 1, row 2: avatar / time-ghost -->
  <div class="dc-row__av-col">
    {#if showAvatar}
      <button
        class="dc-row__av-btn"
        onclick={() => onOpenProfile(comment.userId)}
        title="Профиль"
      >
        {#if profile?.avatar}
          <img class="dc-row__av" src={profile.avatar} alt={profile.login} />
        {:else}
          <div
            class="dc-row__av dc-row__av--fallback"
            style="background:color-mix(in srgb,{userColor(comment.userId)} 18%,#1c1d28);color:{userColor(comment.userId)}"
          >
            {(profile?.login ?? String(comment.userId)).charAt(0).toUpperCase()}
          </div>
        {/if}
      </button>
    {:else}
      <span class="dc-row__time-ghost">{timeStr(comment.createdAt)}</span>
    {/if}
  </div>

  <!-- col 2, row 2: meta + content -->
  <div class="dc-row__body">
    {#if !grouped}
      <div class="dc-row__meta">
        <button
          class="dc-row__author"
          style="color:{profile?.roles?.[0]?.color ?? userColor(comment.userId)}"
          onclick={() => onOpenProfile(comment.userId)}
        >
          {profile?.login ?? comment.userId}
        </button>
        {#if profile?.roles?.length}
          {#each profile.roles as role (role.id)}
            <span class="dc-row__role-tag" style="color:{role.color};background:color-mix(in srgb,{role.color} 18%,transparent)">
              {role.name}
            </span>
          {/each}
        {/if}
        <time class="dc-row__time" title={fullTime(comment.createdAt)}>
          {timeStr(comment.createdAt)}
        </time>
      </div>
    {/if}

    <!-- Release embed -->
    {#if parsed.releaseId !== null}
      {#if embed === "error"}
        <div class="dc-row__card--error">Не удалось загрузить аниме</div>
      {:else}
        <div class="dc-row__release-embed">
          <ReleaseCardV
            data={embed && embed !== "loading" ? embedToCardData(embed) : undefined}
            loading={embed === "loading"}
          />
        </div>
      {/if}
    {/if}

    <!-- GIF — compact card with thumbnail -->
    {#if parsed.gifUrl}
      <button
        class="dc-row__gif-card"
        onclick={() => openExternal(parsed.gifUrl!)}
        title="Открыть GIF"
      >
        <img class="dc-row__gif-thumb" src={parsed.gifUrl} alt="GIF" loading="lazy" />
        <span class="dc-row__gif-badge">GIF</span>
      </button>
    {/if}

    <!-- Text -->
    {#if parsed.text}
      <p class="dc-row__text">{@html renderText(parsed.text, profileCache)}</p>
    {/if}
  </div>

  {#if showActions}
    <div class="dc-row__actions">
      <button class="dc-row__action" onclick={() => onReply(comment)} title="Ответить">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="9 14 4 9 9 4" />
          <path d="M20 20v-7a4 4 0 0 0-4-4H4" />
        </svg>
      </button>
      <button class="dc-row__action" onclick={() => onMention(comment.userId)} title="Упомянуть">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="4" />
          <path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-3.92 7.94" />
        </svg>
      </button>
      {#if canDelete}
        <button class="dc-row__action dc-row__action--danger" onclick={() => onDelete(comment.id)} title="Удалить">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
            <path d="M10 11v6M14 11v6" />
            <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
          </svg>
        </button>
      {/if}
    </div>
  {/if}
</div>

<style lang="scss">
  @use "../../../styles/variables" as *;

  $av: 36px;
  $gap: 0.75rem;

  // ── Row grid ────────────────────────────────────────────────────────────────

  .dc-row {
    position: relative;
    display: grid;
    grid-template-columns: $av 1fr;
    column-gap: $gap;
    width: 100%;
    padding: 0.2rem 1.25rem;
    transition: background 0.15s ease;

    &:hover {
      background: color-mix(in srgb, $color-surface 70%, transparent);
      .dc-row__time-ghost { opacity: 1; }
      .dc-row__actions { opacity: 1; pointer-events: auto; }
    }

    &--grouped   { margin-top: 0.1rem; padding-top: 0.1rem; }
    &--has-reply { padding-top: 0.35rem; }

    &:global(.dc-row--flash) {
      animation: dc-row-flash 2.4s cubic-bezier(0.4, 0, 0.2, 1) forwards;
    }

    &--mention {
      background: color-mix(in srgb, $color-accent 9%, transparent);
      transition: none;
      &::before {
        content: "";
        position: absolute;
        left: 0; top: 0; bottom: 0;
        width: 3px;
        background: $color-accent;
        border-radius: 0 2px 2px 0;
        z-index: 1;
      }
      &:hover { background: color-mix(in srgb, $color-accent 14%, transparent); }
    }
  }

  // ── Connector ───────────────────────────────────────────────────────────────

  .dc-row__connector {
    position: relative;
    &::before {
      content: "";
      position: absolute;
      left: calc($av / 2);
      right: calc(-1 * $gap);
      top: 50%;
      bottom: -20px;
      border-top: 2px solid color-mix(in srgb, $color-text-muted 40%, transparent);
      border-left: 2px solid color-mix(in srgb, $color-text-muted 40%, transparent);
      border-radius: 8px 0 0 0;
    }
  }

  // ── Quote preview ────────────────────────────────────────────────────────────

  .dc-row__quote {
    display: flex;
    align-items: center;
    width: max-content;
    max-width: 100%;
    gap: 0.35rem;
    min-width: 0;
    padding: 0.1rem 0.4rem 0.1rem 0.2rem;
    border: none;
    background: none;
    cursor: pointer;
    text-align: left;
    font: inherit;
    border-radius: $radius-sm;
    align-self: center;
    transition: background 0.12s;
    &:hover { background: color-mix(in srgb, $color-text-muted 10%, transparent); }
  }

  // Mini avatar circle in quote
  .dc-row__quote-av {
    flex-shrink: 0;
    width: 16px; height: 16px;
    border-radius: 50%;
    overflow: hidden;
    display: flex; align-items: center; justify-content: center;
    font-size: 0.55rem; font-weight: 700;
    background: color-mix(in srgb, $color-text-muted 22%, $color-surface);
    color: $color-text-muted;
    img { width: 100%; height: 100%; object-fit: cover; display: block; }
  }

  .dc-row__quote-av-fallback {
    width: 100%; height: 100%;
    border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-size: 0.55rem; font-weight: 700;
  }

  // Mini media thumbnail (GIF or poster) inside quote
  .dc-row__quote-media {
    flex-shrink: 0;
    width: 28px; height: 20px;
    border-radius: 3px;
    overflow: hidden;
    display: flex; align-items: center; justify-content: center;
    background: rgba(255,255,255,0.06);
    img { width: 100%; height: 100%; object-fit: cover; display: block; }
  }

  .dc-row__quote-name {
    flex-shrink: 0;
    font-size: 0.78rem; font-weight: 600;
    color: $color-text; white-space: nowrap;
  }

  .dc-row__quote-tag {
    flex-shrink: 0;
    font-size: 0.6rem; font-weight: 700;
    color: $color-text-muted;
    background: $color-border;
    padding: 0.06rem 0.28rem;
    border-radius: 3px;
    font-family: $font-mono;
    letter-spacing: 0.04em;
  }

  .dc-row__quote-icon {
    flex-shrink: 0;
    color: $color-text-muted; opacity: 0.65;
  }

  .dc-row__quote-text {
    flex: 1; min-width: 0;
    font-size: 0.8rem;
    color: $color-text-muted;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    line-height: 1.3;
  }

  // ── Avatar column ────────────────────────────────────────────────────────────

  .dc-row__av-col {
    display: flex; justify-content: center;
    padding-top: 0.15rem;
    align-self: flex-start;
    z-index: 1;
  }

  .dc-row__av-btn {
    background: none; border: none; padding: 0;
    cursor: pointer; border-radius: 50%;
    transition: opacity $transition;
    &:hover { opacity: 0.8; }
  }

  .dc-row__av {
    width: $av; height: $av;
    border-radius: 50%; object-fit: cover; display: block;

    &--fallback {
      display: flex; align-items: center; justify-content: center;
      font-size: 0.9rem; font-weight: 700;
    }
  }

  .dc-row__time-ghost {
    font-size: 0.6rem; color: $color-text-muted;
    opacity: 0; transition: opacity 0.12s;
    white-space: nowrap; padding-top: 0.28rem; user-select: none;
  }

  // ── Body ─────────────────────────────────────────────────────────────────────

  .dc-row__body {
    min-width: 0;
    padding-top: 0.1rem;
    padding-right: 3.5rem;
    padding-bottom: 0.1rem;
  }

  .dc-row__meta {
    display: flex; align-items: center;
    gap: 0.45rem; margin-bottom: 0.15rem;
    flex-wrap: nowrap;
  }

  .dc-row__author {
    background: none; border: none; padding: 0;
    font-size: 0.9rem; font-weight: 600;
    cursor: pointer; line-height: 1;
    transition: opacity 0.15s;
    white-space: nowrap;
    &:hover { opacity: 0.85; text-decoration: underline; }
  }

  .dc-row__role-tag {
    display: inline-flex; align-items: center;
    font-size: 0.64rem; font-weight: 700;
    padding: 0.1em 0.55em;
    border-radius: 4px;
    letter-spacing: 0.03em;
    flex-shrink: 0;
    white-space: nowrap;
  }

  .dc-row__time {
    font-size: 0.65rem; color: $color-text-muted;
    cursor: default; user-select: none; flex-shrink: 0;
  }

  // ── Message content ───────────────────────────────────────────────────────────

  .dc-row__text {
    margin: 0;
    font-size: 0.92rem; line-height: 1.5;
    color: $color-text; word-break: break-word;
    :global(.dc-mention) {
      color: $color-accent;
      background: color-mix(in srgb, $color-accent 20%, transparent);
      border-radius: 3px;
      padding: 0.05em 0.35em;
      font-weight: 500;
    }
  }

  // Release embed
  .dc-row__release-embed {
    max-width: 220px; width: 100%;
    margin: 0.2rem 0;
  }

  // ── GIF — compact card ────────────────────────────────────────────────────────

  .dc-row__gif-card {
    position: relative;
    display: inline-block;
    border: none;
    padding: 0;
    cursor: pointer;
    border-radius: 10px;
    overflow: hidden;
    margin: 0.2rem 0;
    max-width: 280px;
    background: rgba(255,255,255,0.04);

    &:hover .dc-row__gif-badge { opacity: 1; }
    &:hover .dc-row__gif-thumb { opacity: 0.85; }
  }

  .dc-row__gif-thumb {
    display: block;
    max-width: 280px;
    max-height: 200px;
    width: auto; height: auto;
    border-radius: 10px;
    transition: opacity 0.15s;
  }

  .dc-row__gif-badge {
    position: absolute;
    bottom: 6px; left: 7px;
    font-size: 0.58rem; font-weight: 800;
    letter-spacing: 0.06em;
    color: #fff;
    background: rgba(0,0,0,0.55);
    backdrop-filter: blur(4px);
    padding: 0.1rem 0.35rem;
    border-radius: 4px;
    pointer-events: none;
    opacity: 0.75;
    transition: opacity 0.15s;
  }

  // ── Error ────────────────────────────────────────────────────────────────────

  .dc-row__card--error {
    display: block;
    padding: 0.55rem 0.75rem;
    font-size: 0.8rem; color: $color-text-muted;
    max-width: 280px;
    background: $color-surface;
    border: 1px solid $color-border;
    border-radius: $radius-md;
  }

  // ── Hover actions ─────────────────────────────────────────────────────────────

  .dc-row__actions {
    position: absolute; top: 0.2rem; right: 0.5rem;
    display: flex; align-items: center; gap: 0.15rem;
    background: $color-surface;
    border: 1px solid $color-border;
    border-radius: $radius-md;
    padding: 0.2rem 0.25rem;
    opacity: 0; pointer-events: none;
    transition: opacity 0.15s;
    box-shadow: 0 2px 10px rgba(0,0,0,0.4);
    z-index: 2;
  }

  .dc-row__action {
    display: flex; align-items: center; justify-content: center;
    width: 28px; height: 28px;
    background: none; border: none;
    border-radius: $radius-sm;
    color: $color-text-muted; cursor: pointer;
    transition: background $transition, color $transition;
    &:hover { background: $color-surface-hover; color: $color-text; }
    &--danger:hover {
      background: color-mix(in srgb, $color-error 15%, transparent);
      color: $color-error;
    }
  }

  @keyframes dc-row-flash {
    0%   { background: transparent; }
    12%  { background: color-mix(in srgb, $color-accent 28%, transparent); }
    35%  { background: color-mix(in srgb, $color-accent 22%, transparent); }
    100% { background: transparent; }
  }
</style>
