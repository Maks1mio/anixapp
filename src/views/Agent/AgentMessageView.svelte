<script lang="ts">
  import { slide } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import type { ViewMessage } from './types';
  import type { AgentAction, AgentReleaseCard } from '../../services/agent-api';
  import type { ReleaseCardData } from '../../types/release';
  import { renderAgentMarkdown } from '../../utils/agent-markdown';
  import {
    iconCheck,
    iconChevronDown,
    iconCopy,
    iconRefreshCw,
    iconThumbsDown,
    iconThumbsUp,
  } from '../../components/icons';
  import UiV2Tooltip from '../../components/uikit-v2/UiV2Tooltip.svelte';
  import UiV2ReleaseCarousel from '../../components/uikit-v2/UiV2ReleaseCarousel.svelte';
  import ReleaseCardUiV2 from '../../components/ReleaseCardUiV2.svelte';
  import AgentFace from './AgentFace.svelte';
  import { agentActionIcon, isAgentMutation, runAgentAction } from './agent-actions';
  import { openFeedMediaLightbox } from '../../utils/feed-media-lightbox';
  import { toCdnProxyUrl } from '../../utils/posterUrl';
  import { PERSONA_LOOKS, moodFromActivity, type FaceMood } from './personas';

  interface Props {
    message: ViewMessage;
    canRegenerate?: boolean;
    onFeedback?: (value: -1 | 1) => void;
    onRegenerate?: () => void;
    onRetry?: () => void;
  }

  let { message, canRegenerate = false, onFeedback, onRegenerate, onRetry }: Props = $props();

  /** Notes the model sometimes copied from its history («[Показаны карточки: …]»). */
  const SERVICE_NOTE = /\n*\[(?:Показаны карточки|Под ответом были карточки)[^\]]*\]\s*/g;

  let copied = $state(false);
  let stepsOpen = $state(false);
  let celebrating = $state(false);
  let actionState = $state<Record<number, 'busy' | 'done'>>({});
  /** Pictures that failed to load are dropped from the gallery. */
  let brokenImages = $state<Record<string, true>>({});

  const GALLERY_TILES = 6;
  const SOURCE_NAMES: Record<string, string> = {
    anixart: 'Anixart',
    shikimori: 'Shikimori',
    anilist: 'AniList',
    wikimedia: 'Wikimedia Commons',
    web: 'интернет',
  };

  const images = $derived((message.images ?? []).filter((img) => !brokenImages[img.url]));
  const imageSources = $derived([...new Set(images.map((img) => SOURCE_NAMES[img.source] ?? img.source))]);

  function openImage(i: number, el: HTMLElement) {
    openFeedMediaLightbox(
      images.map((img) => ({ url: toCdnProxyUrl(img.url), kind: 'image' as const })),
      i,
      el,
    );
  }

  const look = $derived(PERSONA_LOOKS[message.persona]);
  const content = $derived(message.content.replace(SERVICE_NOTE, '\n').trimEnd());
  const html = $derived(message.role === 'assistant' ? renderAgentMarkdown(content) : '');
  const waiting = $derived(message.streaming && !content);
  const steps = $derived(message.steps ?? []);

  const mood = $derived.by<FaceMood>(() => {
    if (message.error) return 'sad';
    if (message.streaming) return message.status ? moodFromActivity(message.activity) : content ? 'write' : 'think';
    return celebrating ? (message.releases.length ? 'cards' : 'happy') : 'idle';
  });

  // A short happy moment right after an answer lands.
  let wasStreaming = false;
  $effect(() => {
    const streaming = !!message.streaming;
    if (wasStreaming && !streaming && !message.error) {
      celebrating = true;
      const t = setTimeout(() => (celebrating = false), 2200);
      wasStreaming = streaming;
      return () => clearTimeout(t);
    }
    wasStreaming = streaming;
  });

  function parseEpisodes(value: string | null): { released?: number; total?: number } {
    if (!value) return {};
    const match = /^(\d+|\?)\s+из\s+(\d+|\?)$/.exec(value.trim());
    if (!match) return {};
    const num = (part: string) => (part === '?' ? undefined : Number(part));
    return { released: num(match[1]), total: num(match[2]) };
  }

  function statusId(status: string | null): number | undefined {
    switch ((status ?? '').toLowerCase()) {
      case 'вышел':
        return 1;
      case 'выходит':
        return 2;
      case 'анонс':
        return 3;
      default:
        return undefined;
    }
  }

  function toCardData(card: AgentReleaseCard): ReleaseCardData {
    const episodes = parseEpisodes(card.episodes);
    return {
      id: card.id,
      titleRu: card.title,
      titleEn: card.title_original ?? undefined,
      year: card.year != null ? String(card.year) : undefined,
      poster: card.image ?? undefined,
      rating: card.grade ?? undefined,
      voteCount: card.votes ?? undefined,
      episodesReleased: episodes.released,
      episodesTotal: episodes.total,
      genres: card.genres.join(', '),
      status: card.status ?? undefined,
      statusId: statusId(card.status),
      category: card.category ?? undefined,
      isAdult: card.adult === true,
      ageRating: card.adult ? 5 : undefined,
    };
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(content);
      copied = true;
      setTimeout(() => (copied = false), 1500);
    } catch {
      /* clipboard blocked */
    }
  }

  async function act(a: AgentAction, i: number) {
    if (actionState[i]) return;
    if (!isAgentMutation(a)) {
      void runAgentAction(a);
      return;
    }
    actionState[i] = 'busy';
    const ok = await runAgentAction(a);
    if (ok) actionState[i] = 'done';
    else delete actionState[i];
  }
</script>

{#if message.role === 'user'}
  <div class="agent-msg agent-msg--user">
    <div class="agent-msg__bubble">{message.content}</div>
  </div>
{:else}
  <div class="agent-msg agent-msg--assistant" aria-busy={message.streaming} style:--msg-accent={look.accent}>
    <div class="agent-msg__head">
      <AgentFace persona={message.persona} {mood} size={40} />
      <span class="agent-msg__name">{look.name}</span>
      {#if message.streaming && message.status && content}
        <span class="agent-msg__status agent-msg__status--inline">{message.status}</span>
      {/if}
    </div>

    <div class="agent-msg__main">
      {#if waiting}
        <div class="agent-msg__status">{message.status ?? 'Думаю…'}</div>
      {:else if content}
        <div class="agent-msg__text" class:agent-msg__text--streaming={message.streaming}>
          {@html html}
        </div>
      {/if}

      {#if message.releases.length}
        <div class="agent-showcase" role="group" aria-label="Подборка релизов">
          <UiV2ReleaseCarousel
            class="agent-showcase__carousel"
            measureKey={message.releases.length}
            scrollbar={false}
          >
            {#each message.releases as r, i (r.id)}
              <div class="uiv2-carousel__item agent-showcase__item" style:--i={i}>
                <ReleaseCardUiV2 data={toCardData(r)} variant="vertical" showMenu={false} />
                {#if r.adult}
                  <span class="agent-showcase__adult" title="18+">18+</span>
                {/if}
              </div>
            {/each}
          </UiV2ReleaseCarousel>
        </div>
      {/if}

      {#if images.length}
        <div class="agent-gallery" class:agent-gallery--single={images.length === 1} role="group" aria-label="Картинки">
          {#each images.slice(0, GALLERY_TILES) as img, i (img.url)}
            <button
              type="button"
              class="agent-gallery__tile"
              style:--i={i}
              title={img.title ?? ''}
              onclick={(e) => openImage(i, e.currentTarget)}
            >
              <img
                src={toCdnProxyUrl(img.thumb ?? img.url)}
                alt={img.title ?? 'Картинка'}
                loading="lazy"
                referrerpolicy="no-referrer"
                onerror={() => (brokenImages[img.url] = true)}
              />
              {#if i === GALLERY_TILES - 1 && images.length > GALLERY_TILES}
                <span class="agent-gallery__more">+{images.length - GALLERY_TILES}</span>
              {/if}
            </button>
          {/each}
        </div>
        <p class="agent-gallery__credit">Источник: {imageSources.join(' · ')}</p>
      {/if}

      {#if message.actions.length}
        <div class="agent-msg__actions">
          {#each message.actions as a, i (i)}
            <button
              type="button"
              class="agent-msg__action"
              class:agent-msg__action--done={actionState[i] === 'done'}
              disabled={!!actionState[i]}
              style:--i={i}
              onclick={() => void act(a, i)}
            >
              <span aria-hidden="true">{@html actionState[i] === 'done' ? iconCheck(14) : agentActionIcon(a)}</span>{a.label}
            </button>
          {/each}
        </div>
      {/if}

      {#if message.error}
        <div class="agent-msg__error" role="alert">
          {message.error}
          {#if onRetry}<button type="button" class="agent-msg__retry" onclick={onRetry}>Повторить</button>{/if}
        </div>
      {/if}

      {#if !message.streaming && content && message.id != null}
        <div class="agent-msg__tools">
          <UiV2Tooltip text={copied ? 'Скопировано' : 'Копировать'} placement="top">
            <button type="button" class="agent-msg__tool" aria-label="Копировать" onclick={() => void copy()}>
              {@html copied ? iconCheck(14) : iconCopy(14)}
            </button>
          </UiV2Tooltip>
          {#if onFeedback}
            <UiV2Tooltip text="Хороший ответ" placement="top">
              <button
                type="button"
                class="agent-msg__tool"
                class:agent-msg__tool--on={message.feedback === 1}
                aria-label="Хороший ответ"
                aria-pressed={message.feedback === 1}
                onclick={() => onFeedback?.(1)}
              >
                {@html iconThumbsUp(14)}
              </button>
            </UiV2Tooltip>
            <UiV2Tooltip text="Плохой ответ" placement="top">
              <button
                type="button"
                class="agent-msg__tool"
                class:agent-msg__tool--on={message.feedback === -1}
                aria-label="Плохой ответ"
                aria-pressed={message.feedback === -1}
                onclick={() => onFeedback?.(-1)}
              >
                {@html iconThumbsDown(14)}
              </button>
            </UiV2Tooltip>
          {/if}
          {#if canRegenerate && onRegenerate}
            <UiV2Tooltip text="Ответить заново" placement="top">
              <button type="button" class="agent-msg__tool" aria-label="Ответить заново" onclick={onRegenerate}>
                {@html iconRefreshCw(14)}
              </button>
            </UiV2Tooltip>
          {/if}
          {#if steps.length}
            <button
              type="button"
              class="agent-msg__steps-btn"
              aria-expanded={stepsOpen}
              onclick={() => (stepsOpen = !stepsOpen)}
            >
              Шаги · {steps.length}
              <span class="agent-msg__chev" class:agent-msg__chev--open={stepsOpen} aria-hidden="true">{@html iconChevronDown(12)}</span>
            </button>
          {/if}
        </div>
        {#if stepsOpen && steps.length}
          <ol class="agent-msg__steps" transition:slide={{ duration: 200, easing: cubicOut }}>
            {#each steps as s, i (i)}
              <li>{s.replace(/…$/, '')}</li>
            {/each}
          </ol>
        {/if}
      {/if}
    </div>
  </div>
{/if}

<style>
  .agent-msg {
    display: flex;
    max-width: 100%;
    animation: agent-rise 0.32s cubic-bezier(0.2, 0.8, 0.2, 1);
  }

  @keyframes agent-rise {
    from {
      opacity: 0;
      transform: translateY(8px);
    }
  }

  /* ── user ── */
  .agent-msg--user {
    justify-content: flex-end;
  }

  .agent-msg__bubble {
    max-width: min(34rem, 82%);
    padding: 0.7rem 1rem;
    border-radius: 1.25rem;
    background: color-mix(in srgb, var(--agent-accent, var(--uikit-v2-accent)) 10%, var(--uikit-v2-surface, #1e1e1e));
    border: 1px solid color-mix(in srgb, var(--uikit-v2-text, #fff) 6%, transparent);
    color: var(--uikit-v2-text, #fff);
    font-size: 0.94rem;
    line-height: 1.55;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    transition: background 0.4s ease;
  }

  /* ── assistant: no bubble, face + name on top ── */
  .agent-msg--assistant {
    flex-direction: column;
    gap: 0.55rem;
  }

  .agent-msg__head {
    display: flex;
    align-items: center;
    gap: 0.55rem;
    min-width: 0;
  }

  .agent-msg__name {
    font-size: 0.86rem;
    font-weight: 700;
    color: var(--uikit-v2-text, #fff);
  }

  .agent-msg__main {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.65rem;
  }

  .agent-msg__text {
    font-size: 0.95rem;
    line-height: 1.68;
    color: color-mix(in srgb, var(--uikit-v2-text, #fff) 92%, transparent);
    overflow-wrap: anywhere;
  }

  .agent-msg__text :global(p) {
    margin: 0 0 0.75rem;
  }

  .agent-msg__text :global(p:last-child),
  .agent-msg__text :global(ul:last-child),
  .agent-msg__text :global(ol:last-child) {
    margin-bottom: 0;
  }

  .agent-msg__text :global(ul),
  .agent-msg__text :global(ol) {
    margin: 0 0 0.75rem;
    padding-left: 1.3rem;
  }

  .agent-msg__text :global(li) {
    margin: 0.3rem 0;
    padding-left: 0.15rem;
  }

  .agent-msg__text :global(li::marker) {
    color: var(--msg-accent);
  }

  .agent-msg__text :global(h4) {
    margin: 0.6rem 0 0.4rem;
    font-size: 1rem;
  }

  .agent-msg__text :global(strong) {
    font-weight: 700;
    color: var(--uikit-v2-text, #fff);
  }

  .agent-msg__text :global(a) {
    color: var(--msg-accent);
  }

  .agent-msg__text :global(code) {
    padding: 0.05rem 0.35rem;
    border-radius: 0.35rem;
    background: color-mix(in srgb, var(--uikit-v2-text, #fff) 9%, transparent);
    font-family: var(--uikit-v2-mono, monospace);
    font-size: 0.85em;
  }

  .agent-msg__text--streaming :global(> :last-child)::after {
    content: '';
    display: inline-block;
    width: 0.55rem;
    height: 0.55rem;
    margin-left: 0.3rem;
    border-radius: 50%;
    background: var(--msg-accent);
    vertical-align: 0.05em;
    animation: agent-caret 1s ease-in-out infinite;
  }

  @keyframes agent-caret {
    50% {
      transform: scale(0.55);
      opacity: 0.5;
    }
  }

  .agent-msg__status {
    font-size: 0.88rem;
    color: var(--uikit-v2-muted, #999);
    background: linear-gradient(90deg, var(--uikit-v2-muted, #999) 30%, var(--uikit-v2-text, #fff) 50%, var(--uikit-v2-muted, #999) 70%);
    background-size: 200% 100%;
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
    animation: agent-shimmer 1.8s linear infinite;
  }

  .agent-msg__status--inline {
    font-size: 0.78rem;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  @keyframes agent-shimmer {
    from {
      background-position: 100% 0;
    }
    to {
      background-position: -100% 0;
    }
  }

  /* ── cards ── */
  .agent-showcase {
    position: relative;
    margin: 0.1rem 0 0;
  }

  .agent-showcase__item {
    position: relative;
    animation: agent-card-in 0.42s cubic-bezier(0.2, 0.8, 0.2, 1) both;
    animation-delay: calc(var(--i, 0) * 55ms);
  }

  @keyframes agent-card-in {
    from {
      opacity: 0;
      transform: translateY(10px) scale(0.96);
    }
  }

  .agent-showcase :global(.uiv2-carousel__scroll) {
    padding: 0.2rem 0.1rem 0.4rem;
    gap: 0.7rem;
  }

  .agent-showcase :global(.release-page__carousel-fade--left) {
    background: linear-gradient(
      to right,
      var(--uikit-v2-bg, #111) 0%,
      color-mix(in srgb, var(--uikit-v2-bg, #111) 86%, transparent) 55%,
      transparent 100%
    );
  }

  .agent-showcase :global(.release-page__carousel-fade--right) {
    background: linear-gradient(
      to left,
      var(--uikit-v2-bg, #111) 0%,
      color-mix(in srgb, var(--uikit-v2-bg, #111) 86%, transparent) 55%,
      transparent 100%
    );
  }

  .agent-showcase__adult {
    position: absolute;
    top: 0.45rem;
    right: 0.45rem;
    z-index: 3;
    padding: 0.15rem 0.4rem;
    border-radius: 999px;
    background: rgba(190, 32, 58, 0.92);
    color: #fff;
    font-size: 0.65rem;
    font-weight: 800;
    letter-spacing: 0.02em;
    pointer-events: none;
    backdrop-filter: blur(6px);
  }

  /* ── action buttons ── */
  /* ── gallery ── */
  .agent-gallery {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    grid-auto-rows: 7.2rem;
    gap: 0.4rem;
    max-width: 36rem;
  }

  .agent-gallery__tile:first-child:not(:only-child) {
    grid-column: span 2;
    grid-row: span 2;
  }

  .agent-gallery--single {
    grid-template-columns: 1fr;
    grid-auto-rows: auto;
    max-width: 30rem;
  }

  .agent-gallery__tile {
    position: relative;
    display: block;
    min-width: 0;
    padding: 0;
    border: 0;
    border-radius: 0.7rem;
    overflow: hidden;
    background: color-mix(in srgb, var(--uikit-v2-text, #fff) 6%, transparent);
    cursor: zoom-in;
    animation: agent-card-in 0.42s cubic-bezier(0.2, 0.8, 0.2, 1) both;
    animation-delay: calc(var(--i, 0) * 55ms);
  }

  .agent-gallery__tile img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
    transition: transform 0.3s ease;
  }

  .agent-gallery--single .agent-gallery__tile img {
    height: auto;
    max-height: 22rem;
  }

  .agent-gallery__tile:hover img,
  .agent-gallery__tile:focus-visible img {
    transform: scale(1.04);
  }

  .agent-gallery__tile:focus-visible {
    outline: 2px solid var(--msg-accent);
    outline-offset: 2px;
  }

  .agent-gallery__more {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    background: rgba(0, 0, 0, 0.55);
    color: #fff;
    font-size: 1.2rem;
    font-weight: 800;
  }

  .agent-gallery__credit {
    margin: -0.3rem 0 0;
    font-size: 0.72rem;
    color: var(--uikit-v2-muted, #999);
  }

  .agent-msg__actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.45rem;
  }

  .agent-msg__action {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    padding: 0.48rem 0.85rem;
    border: 1px solid color-mix(in srgb, var(--uikit-v2-text, #fff) 10%, transparent);
    border-radius: 0.75rem;
    background: color-mix(in srgb, var(--uikit-v2-text, #fff) 4%, transparent);
    color: var(--uikit-v2-text, #fff);
    font-size: 0.83rem;
    font-weight: 600;
    cursor: pointer;
    animation: agent-card-in 0.3s ease-out both;
    animation-delay: calc(var(--i, 0) * 60ms);
    transition:
      background 0.15s ease,
      border-color 0.15s ease,
      transform 0.15s ease;
  }

  .agent-msg__action:hover:not(:disabled),
  .agent-msg__action:focus-visible {
    border-color: color-mix(in srgb, var(--msg-accent) 55%, transparent);
    background: color-mix(in srgb, var(--msg-accent) 12%, transparent);
    outline: none;
  }

  .agent-msg__action:active:not(:disabled) {
    transform: scale(0.97);
  }

  .agent-msg__action:disabled {
    cursor: default;
    opacity: 0.75;
  }

  .agent-msg__action--done {
    border-color: color-mix(in srgb, var(--msg-accent) 45%, transparent);
    opacity: 1 !important;
  }

  .agent-msg__action span {
    display: inline-flex;
    color: var(--msg-accent);
  }

  .agent-msg__error {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.6rem;
    padding: 0.55rem 0.8rem;
    border-radius: 0.7rem;
    background: color-mix(in srgb, var(--uikit-v2-danger, #ff5b5b) 14%, transparent);
    color: var(--uikit-v2-text, #fff);
    font-size: 0.85rem;
  }

  .agent-msg__retry {
    padding: 0.2rem 0.6rem;
    border: 0;
    border-radius: 999px;
    background: color-mix(in srgb, var(--uikit-v2-text, #fff) 14%, transparent);
    color: inherit;
    font-size: 0.8rem;
    font-weight: 600;
    cursor: pointer;
  }

  /* ── footer tools ── */
  .agent-msg__tools {
    display: flex;
    align-items: center;
    gap: 0.15rem;
    margin-left: -0.35rem;
    opacity: 0.6;
    transition: opacity 0.15s ease;
  }

  .agent-msg:hover .agent-msg__tools,
  .agent-msg__tools:focus-within {
    opacity: 1;
  }

  .agent-msg__tool {
    display: inline-grid;
    place-items: center;
    width: 1.85rem;
    height: 1.85rem;
    border: 0;
    border-radius: 0.5rem;
    background: transparent;
    color: var(--uikit-v2-muted, #999);
    cursor: pointer;
  }

  .agent-msg__tool:hover,
  .agent-msg__tool:focus-visible {
    background: color-mix(in srgb, var(--uikit-v2-text, #fff) 8%, transparent);
    color: var(--uikit-v2-text, #fff);
    outline: none;
  }

  .agent-msg__tool--on {
    color: var(--msg-accent);
  }

  .agent-msg__steps-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    margin-left: 0.35rem;
    padding: 0.25rem 0.5rem;
    border: 0;
    border-radius: 0.5rem;
    background: transparent;
    color: var(--uikit-v2-muted, #999);
    font-size: 0.75rem;
    cursor: pointer;
  }

  .agent-msg__steps-btn:hover,
  .agent-msg__steps-btn:focus-visible {
    background: color-mix(in srgb, var(--uikit-v2-text, #fff) 8%, transparent);
    color: var(--uikit-v2-text, #fff);
    outline: none;
  }

  .agent-msg__chev {
    display: inline-flex;
    transition: transform 0.2s ease;
  }

  .agent-msg__chev--open {
    transform: rotate(180deg);
  }

  .agent-msg__steps {
    margin: 0;
    padding: 0.55rem 0.8rem 0.55rem 2rem;
    border-left: 2px solid color-mix(in srgb, var(--msg-accent) 45%, transparent);
    color: var(--uikit-v2-muted, #999);
    font-size: 0.8rem;
    line-height: 1.7;
  }

  @media (prefers-reduced-motion: reduce) {
    .agent-msg,
    .agent-msg__status,
    .agent-showcase__item,
    .agent-gallery__tile,
    .agent-msg__action,
    .agent-msg__text--streaming :global(> :last-child)::after {
      animation: none;
    }
  }
</style>
