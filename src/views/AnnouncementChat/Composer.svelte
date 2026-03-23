<script lang="ts">
  import type { Announcement } from '../../services/announcements';
  import { TYPE_CONFIG } from './_types';
  import type { ReplyTo, SlashResult } from './_types';
  import { getSelf } from './_utils';
  import Page from '../../components/Page.svelte';
  import { scrollIntoViewIfActive } from '../../actions/scrollIntoViewIfActive';
  import GifPicker from './components/GifPicker.svelte';

  interface Props {
    announcement: Announcement | null;
    text: string;
    sending: boolean;
    sendError: string;
    replyTo: ReplyTo | null;
    slashResults: SlashResult[];
    slashLoading: boolean;
    showSlash: boolean;
    slashActiveIdx: number;
    profileCache: Record<number, { login: string; avatar: string | null }>;
    inputEl?: HTMLTextAreaElement;
    onSubmit: () => void;
    onClearReply: () => void;
    onSelectTitle: (r: SlashResult) => void;
    onSlashKey: (e: KeyboardEvent) => void;
    onAutoResize: (e: Event) => void;
    onTextInput: (val: string) => void;
    onActiveIdxChange: (idx: number) => void;
    onSelectGif: (url: string) => void;
  }

  let {
    announcement, text, sending, sendError, replyTo,
    slashResults, slashLoading, showSlash, slashActiveIdx,
    profileCache, inputEl = $bindable(),
    onSubmit, onClearReply, onSelectTitle, onSlashKey,
    onAutoResize, onTextInput, onActiveIdxChange, onSelectGif,
  }: Props = $props();

  const MAX_LEN = 500;

  const self = $derived(getSelf());
  const hasSlash = $derived(showSlash || slashResults.length > 0);
  const charCount = $derived(text.length);
  const charNearLimit = $derived(charCount >= 400);
  const charAtLimit   = $derived(charCount >= MAX_LEN);
  let gifOpen = $state(false);

  function handleKey(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      if (gifOpen) gifOpen = false;
      else onClearReply();
      return;
    }
    onSlashKey(e);
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSubmit(); }
  }

  function handleSelectGif(url: string) {
    gifOpen = false;
    onSelectGif(url);
  }

  function handleInput(e: Event) {
    const ta = e.currentTarget as HTMLTextAreaElement;
    // enforce hard limit
    if (ta.value.length > MAX_LEN) {
      ta.value = ta.value.slice(0, MAX_LEN);
    }
    onAutoResize(e);
    onTextInput(ta.value);
  }
</script>

{#if announcement?.commentsEnabled}
  <div class="dc-composer" style="--hc: {(TYPE_CONFIG[announcement?.type ?? 'NOTE'] ?? TYPE_CONFIG.NOTE).color}">
    {#if announcement.commentsLocked}
      <div class="dc-notice">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2"/>
          <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
        </svg>
        Комментарии закрыты
      </div>
    {:else if !self}
      <div class="dc-notice">Войдите, чтобы написать сообщение</div>
    {:else}

      <!-- /slash command panel -->
      {#if hasSlash}
        <div class="dc-slash">
          <div class="dc-slash__head">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
            Команды — <strong>/title</strong> — поиск аниме
            <kbd class="dc-slash__kbd">Tab — выбрать</kbd>
          </div>

          {#if slashLoading}
            <div class="dc-slash__status">
              <span class="dc-spinner dc-spinner--sm"></span>
              Поиск…
            </div>
          {:else if slashResults.length === 0}
            <div class="dc-slash__status">Ничего не найдено</div>
          {:else}
            <div class="dc-slash__list-wrap">
              <Page scrollId="slash-results" noPadding={true} extraClass="dc-slash__page">
                {#each slashResults as r, ri (r.id)}
                  <button
                    class="dc-slash__item"
                    class:dc-slash__item--active={ri === slashActiveIdx}
                    onclick={() => onSelectTitle(r)}
                    onmouseenter={() => onActiveIdxChange(ri)}
                    use:scrollIntoViewIfActive={ri === slashActiveIdx}
                  >
                    {#if r.poster}
                      <img class="dc-slash__poster" src={r.poster} alt={r.title} />
                    {:else}
                      <div class="dc-slash__poster dc-slash__poster--empty"></div>
                    {/if}
                    <span class="dc-slash__title">{r.title}</span>
                    {#if r.year}<span class="dc-slash__year">{r.year}</span>{/if}
                    <span class="dc-slash__id">#{r.id}</span>
                  </button>
                {/each}
              </Page>
            </div>
          {/if}
        </div>
      {/if}

      <!-- Reply preview bar -->
      {#if replyTo}
        {@const rp = profileCache[replyTo.userId]}
        <div class="dc-reply-bar" class:dc-reply-bar--after-slash={hasSlash}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="dc-reply-bar__icon">
            <polyline points="9 14 4 9 9 4"/>
            <path d="M20 20v-7a4 4 0 0 0-4-4H4"/>
          </svg>
          <span class="dc-reply-bar__label">Ответ <strong>{rp?.login ?? replyTo.userId}</strong>:</span>
          <span class="dc-reply-bar__text">{replyTo.message.slice(0, 80)}{replyTo.message.length > 80 ? '…' : ''}</span>
          <button class="dc-reply-bar__close" onclick={onClearReply} title="Отмена">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      {/if}

      <!-- Input — Cursor-style box -->
      <div
        class="dc-input-wrap"
        class:dc-input-wrap--top-slash={hasSlash && !replyTo}
        class:dc-input-wrap--top-reply={replyTo && !hasSlash}
        class:dc-input-wrap--top-both={hasSlash && replyTo}
        class:dc-input-wrap--at-limit={charAtLimit}
      >
        {#if text === '/'}
          <div class="dc-cmd-hint">
            <span class="dc-cmd-hint__tag">/title</span>
            <span class="dc-cmd-hint__desc">Поделиться аниме</span>
          </div>
        {/if}

        <!-- Textarea -->
        <textarea
          class="dc-input"
          placeholder="Написать сообщение…"
          value={text}
          bind:this={inputEl}
          onkeydown={handleKey}
          oninput={handleInput}
          rows="1"
          maxlength={MAX_LEN}
          disabled={sending}
        ></textarea>

        <!-- Bottom toolbar -->
        <div class="dc-input-toolbar">
          <!-- Left: GIF -->
          <div class="dc-input-toolbar__left">
            <GifPicker
              open={gifOpen}
              onSelect={handleSelectGif}
              onClose={() => { gifOpen = false; }}
            />
            <button
              class="dc-gif-btn"
              type="button"
              title="GIF"
              aria-label="Выбрать GIF"
              onclick={() => { gifOpen = !gifOpen; }}
              class:dc-gif-btn--active={gifOpen}
            >
              <span class="dc-gif-btn__label">GIF</span>
            </button>
          </div>

          <!-- Right: char count + send -->
          <div class="dc-input-toolbar__right">
            {#if charNearLimit}
              <span class="dc-char-count" class:dc-char-count--warn={charAtLimit}>
                {charCount}/{MAX_LEN}
              </span>
            {/if}
            <button
              class="dc-send-btn"
              type="button"
              title="Отправить (Enter)"
              aria-label="Отправить"
              onclick={onSubmit}
              disabled={sending || !text.trim()}
            >
              {#if sending}
                <span class="dc-send-btn__spinner"></span>
              {:else}
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="12" y1="19" x2="12" y2="5"/>
                  <polyline points="5 12 12 5 19 12"/>
                </svg>
              {/if}
            </button>
          </div>
        </div>
      </div>

      {#if sendError}
        <p class="dc-send-error">{sendError}</p>
      {/if}
    {/if}
  </div>
{/if}

<style lang="scss">
@use '../../styles/variables' as *;

// ── Composer shell ────────────────────────────────────────────────────────────

// Discord-style input area
.dc-composer {
  position: sticky;
  bottom: 0;
  margin-top: auto;
  padding: 0 1rem 1rem;
  z-index: 1;
  background: $color-bg;

  &::before {
    content: '';
    position: absolute;
    top: -2rem;
    left: 0; right: 0;
    height: 2rem;
    background: linear-gradient(to bottom, transparent 0%, $color-bg 80%);
    pointer-events: none;
  }
}

.dc-notice {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  padding: 0.75rem 1rem;
  background: $color-surface;
  border: 1px solid $color-border;
  border-radius: $radius-lg;
  font-size: 0.82rem;
  color: $color-text-muted;
}

// ── /slash panel ─────────────────────────────────────────────────────────────

.dc-slash {
  background: $color-surface;
  border: 1px solid $color-border;
  border-radius: 10px 10px 0 0;
  border-bottom: none;
  overflow: hidden;
}

.dc-slash__head {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.4rem 0.75rem;
  font-size: 0.7rem;
  color: $color-text-muted;
  background: $color-surface-hover;
  border-bottom: 1px solid $color-border;

  strong { color: var(--hc); font-weight: 700; }
}

.dc-slash__kbd {
  margin-left: auto;
  font-family: $font-mono;
  font-size: 0.62rem;
  background: rgba(0,0,0,0.3);
  color: $color-text-muted;
  padding: 0.1rem 0.38rem;
  border-radius: 3px;
  border: 1px solid $color-border;
}

.dc-slash__status {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.55rem 0.75rem;
  font-size: 0.8rem;
  color: $color-text-muted;
}

.dc-slash__list-wrap {
  max-height: 240px;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.dc-slash__list-wrap :global(.dc-slash__page) {
  flex: 1;
  min-height: 0;
}

.dc-slash__item {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  width: 100%;
  padding: 0.42rem 0.75rem;
  background: none;
  border: none;
  cursor: pointer;
  text-align: left;
  transition: background $transition;

  &:hover, &--active { background: $color-surface-hover; }
}

.dc-slash__poster {
  width: 30px;
  height: 43px;
  border-radius: 3px;
  object-fit: cover;
  flex-shrink: 0;
  background: $color-border;

  &--empty { background: $color-border; }
}

.dc-slash__title {
  flex: 1;
  min-width: 0;
  font-size: 0.82rem;
  color: $color-text;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dc-slash__year { font-size: 0.7rem; color: $color-text-muted; flex-shrink: 0; }
.dc-slash__id   { font-size: 0.65rem; color: $color-border; flex-shrink: 0; font-variant-numeric: tabular-nums; }

// ── Reply bar ─────────────────────────────────────────────────────────────────

.dc-reply-bar {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0.42rem 0.85rem;
  background: $color-surface;
  border: 1px solid $color-border;
  border-bottom: none;
  border-radius: 10px 10px 0 0;
  font-size: 0.76rem;
  overflow: hidden;

  &--after-slash { border-radius: 0; }

  &__icon { flex-shrink: 0; color: var(--hc); opacity: 0.9; }
  &__label {
    flex-shrink: 0;
    color: $color-text-muted;
    strong { color: $color-text; font-weight: 600; }
  }
  &__text {
    flex: 1; min-width: 0;
    color: $color-text-muted;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  &__close {
    flex-shrink: 0;
    display: flex; align-items: center; justify-content: center;
    width: 20px; height: 20px;
    background: none; border: none; border-radius: $radius-sm;
    color: $color-text-muted; cursor: pointer;
    transition: color $transition, background $transition;
    &:hover { color: $color-text; background: $color-surface-hover; }
  }
}

// ── Input wrap — Cursor-style box ─────────────────────────────────────────────

.dc-input-wrap {
  display: flex;
  flex-direction: column;
  background: $color-surface;
  border: 1.5px solid $color-border;
  border-radius: 12px;
  transition: border-color 0.18s ease, box-shadow 0.18s ease;

  &--top-slash  { border-radius: 0 0 12px 12px; }
  &--top-reply  { border-radius: 0 0 12px 12px; }
  &--top-both   { border-radius: 0 0 12px 12px; }

  &:focus-within {
    border-color: color-mix(in srgb, $color-accent 70%, $color-border);
    box-shadow: 0 0 0 3px color-mix(in srgb, $color-accent 12%, transparent);
  }

  &--at-limit {
    border-color: color-mix(in srgb, $color-error 60%, $color-border) !important;
    box-shadow: 0 0 0 3px color-mix(in srgb, $color-error 10%, transparent) !important;
  }
}

// ── Cmd hint ──────────────────────────────────────────────────────────────────

.dc-cmd-hint {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.85rem 0;
  font-size: 0.76rem;

  &__tag {
    background: color-mix(in srgb, var(--hc) 18%, transparent);
    color: var(--hc);
    padding: 0.08rem 0.4rem;
    border-radius: 4px;
    font-weight: 600;
    font-family: $font-mono;
  }
  &__desc { color: $color-text-muted; }
}

// ── Textarea ──────────────────────────────────────────────────────────────────

.dc-input {
  display: block;
  width: 100%;
  box-sizing: border-box;
  background: transparent;
  border: none;
  outline: none;
  color: $color-text;
  font-size: 0.9rem;
  line-height: 1.55;
  resize: none;
  min-height: 44px;
  max-height: 180px;
  overflow-y: auto;
  scrollbar-width: thin;
  font-family: $font-sans;
  padding: 0.7rem 0.85rem 0.3rem;

  &::placeholder { color: $color-text-muted; opacity: 0.7; }
  &:disabled { opacity: 0.45; }
}

// ── Bottom toolbar ─────────────────────────────────────────────────────────────

.dc-input-toolbar {
  position: relative;   // containing block for GifPicker popover
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.3rem 0.5rem 0.4rem 0.45rem;
  gap: 0.4rem;

  &__left  { display: flex; align-items: center; gap: 0.25rem; }
  &__right { display: flex; align-items: center; gap: 0.5rem; flex-shrink: 0; }
}

// ── GIF button ─────────────────────────────────────────────────────────────────

.dc-gif-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 0.45rem;
  height: 28px;
  flex-shrink: 0;
  background: none;
  border: 1px solid transparent;
  color: $color-text-muted;
  cursor: pointer;
  border-radius: 6px;
  transition: color $transition, background $transition, border-color $transition;

  &:hover {
    color: $color-text;
    background: $color-surface-hover;
    border-color: $color-border;
  }
  &--active {
    color: $color-accent;
    background: color-mix(in srgb, $color-accent 12%, transparent);
    border-color: color-mix(in srgb, $color-accent 30%, transparent);
  }
}

.dc-gif-btn__label {
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  font-variant-numeric: tabular-nums;
}

// ── Char count ─────────────────────────────────────────────────────────────────

.dc-char-count {
  font-size: 0.68rem;
  color: $color-text-muted;
  font-variant-numeric: tabular-nums;
  opacity: 0.75;
  transition: color 0.15s;

  &--warn { color: $color-error; opacity: 1; font-weight: 600; }
}

// ── Send button ────────────────────────────────────────────────────────────────

.dc-send-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: 8px;
  border: none;
  background: $color-accent;
  color: #fff;
  cursor: pointer;
  flex-shrink: 0;
  transition: opacity $transition, background $transition, transform 0.1s;

  &:hover:not(:disabled) {
    opacity: 0.88;
    transform: scale(1.05);
  }
  &:active:not(:disabled) { transform: scale(0.95); }
  &:disabled {
    background: $color-border;
    color: $color-text-muted;
    cursor: default;
    opacity: 0.6;
  }

  &__spinner {
    display: block;
    width: 12px; height: 12px;
    border: 1.5px solid rgba(255,255,255,0.4);
    border-top-color: #fff;
    border-radius: 50%;
    animation: dc-spin 0.6s linear infinite;
  }
}

// ── Spinner ───────────────────────────────────────────────────────────────────

.dc-spinner {
  display: inline-block;
  width: 18px; height: 18px;
  border: 2px solid $color-border;
  border-top-color: $color-text-muted;
  border-radius: 50%;
  animation: dc-spin 0.7s linear infinite;
  flex-shrink: 0;

  &--sm { width: 12px; height: 12px; border-width: 1.5px; }
}

@keyframes dc-spin { to { transform: rotate(360deg); } }

.dc-send-error {
  margin: 0.3rem 0 0;
  font-size: 0.72rem;
  color: $color-error;
}
</style>
