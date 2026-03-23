<script lang="ts">
  import type { Announcement } from "../../services/announcements";

  interface Props {
    announcement: Announcement;
    count: number;
    cfg: { label: string; color: string };
    loadState: "loading" | "ready";
  }

  let { announcement, count, cfg, loadState }: Props = $props();

  function msgPlural(n: number): string {
    if (n === 1) return "сообщение";
    if (n < 5) return "сообщения";
    return "сообщений";
  }

  // Короткое название канала: первые слова message или тип
  const channelName = $derived(
    announcement.message.length <= 40 ? announcement.message : cfg.label,
  );
</script>

<!-- Discord-style sticky header: # + название + разделитель + описание + badge -->
<header class="dc-header" style="--hc: {cfg.color}">
  <span class="dc-header__hash">#</span>
  <h1 class="dc-header__title">{channelName}</h1>
  <span class="dc-header__sep"></span>
  <div class="dc-header__desc">
    {#if announcement.link?.url}
      {#if announcement.message}
        <span class="dc-header__desc-text">{announcement.message}</span>
        <span class="dc-header__desc-in"> в </span>
      {/if}
      <a
        class="dc-header__badge"
        href={announcement.link.url}
        onclick={(e) => {
          e.preventDefault();
          (window as any).electron?.openExternal?.(announcement.link!.url);
        }}
      >
        # {announcement.link.label || "Подробнее"}
      </a>
    {:else}
      <span class="dc-header__desc-text">{announcement.message}</span>
    {/if}
  </div>

  {#if announcement.commentsLocked}
    <span class="dc-header__lock">
      <svg
        width="10"
        height="10"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2.5"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <rect x="3" y="11" width="18" height="11" rx="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
      Закрыто
    </span>
  {/if}

  {#if loadState === "ready"}
    <div class="dc-header__stat">
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path
          d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"
        />
      </svg>
      <strong>{count}</strong>
      <span>{msgPlural(count)}</span>
    </div>
  {/if}
</header>

<style lang="scss">
  @use "../../styles/variables" as *;

  // Discord-style channel header: sticky, горизонтальная полоса
  .dc-header {
    position: sticky;
    top: 0;
    z-index: 10;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-height: 48px;
    padding: 0 1rem;
    background: var(--color-surface);
    flex-shrink: 0;
  }

  .dc-header__hash {
    flex-shrink: 0;
    font-size: 1.25rem;
    font-weight: 600;
    color: $color-text-muted;
    margin-right: 0.15rem;
  }

  .dc-header__title {
    flex-shrink: 0;
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
    color: $color-text;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 180px;
  }

  .dc-header__sep {
    flex-shrink: 0;
    width: 1px;
    height: 20px;
    background: $color-border;
    margin: 0 0.25rem;
  }

  .dc-header__desc {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.15rem;
    font-size: 0.8rem;
    color: $color-text-muted;
    overflow: hidden;
  }

  .dc-header__desc-text {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 100%;
  }

  .dc-header__badge {
    display: inline-flex;
    align-items: center;
    padding: 0.15rem 0.5rem;
    background: color-mix(in srgb, var(--hc) 25%, $color-surface);
    color: var(--hc);
    border-radius: 4px;
    font-weight: 600;
    font-size: 0.75rem;
    text-decoration: none;
    white-space: nowrap;
    transition:
      background $transition,
      color $transition;

    &:hover {
      background: color-mix(in srgb, var(--hc) 35%, $color-surface);
      color: var(--hc);
    }
  }

  .dc-header__desc-in {
    color: $color-text-muted;
    flex-shrink: 0;
  }

  .dc-header__lock {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    font-size: 0.7rem;
    color: $color-text-muted;
    padding: 0.2rem 0.5rem;
    border-radius: 4px;
    background: rgba(0, 0, 0, 0.2);
    flex-shrink: 0;
  }

  .dc-header__stat {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.75rem;
    color: $color-text-muted;
    flex-shrink: 0;

    svg {
      color: var(--hc);
      opacity: 0.9;
    }

    strong {
      color: var(--hc);
      font-weight: 600;
      font-variant-numeric: tabular-nums;
    }
  }
</style>
