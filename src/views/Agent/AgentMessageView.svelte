<script lang="ts">
  import type { ViewMessage } from './types';
  import { renderAgentMarkdown } from '../../utils/agent-markdown';
  import { iconCheck, iconCopy, iconRefreshCw, iconThumbsDown, iconThumbsUp } from '../../components/icons';
  import UiV2Tooltip from '../../components/uikit-v2/UiV2Tooltip.svelte';
  import AgentOrb from './AgentOrb.svelte';
  import AgentReleaseCardView from './AgentReleaseCard.svelte';
  import { agentActionIcon, runAgentAction } from './agent-actions';

  interface Props {
    message: ViewMessage;
    agentName: string;
    canRegenerate?: boolean;
    onOpenRelease: (id: number) => void;
    onFeedback?: (value: -1 | 1) => void;
    onRegenerate?: () => void;
    onRetry?: () => void;
  }

  let { message, agentName, canRegenerate = false, onOpenRelease, onFeedback, onRegenerate, onRetry }: Props = $props();

  let copied = $state(false);
  const html = $derived(message.role === 'assistant' ? renderAgentMarkdown(message.content) : '');
  const waiting = $derived(message.streaming && !message.content);

  async function copy() {
    try {
      await navigator.clipboard.writeText(message.content);
      copied = true;
      setTimeout(() => (copied = false), 1500);
    } catch {
      /* clipboard blocked */
    }
  }
</script>

{#if message.role === 'user'}
  <div class="agent-msg agent-msg--user">
    <div class="agent-msg__bubble">{message.content}</div>
  </div>
{:else}
  <div class="agent-msg agent-msg--assistant" aria-busy={message.streaming}>
    <AgentOrb size={30} thinking={message.streaming} />
    <div class="agent-msg__main">
      <span class="agent-msg__name">{agentName}</span>

      {#if waiting}
        <div class="agent-msg__status">
          <span class="agent-msg__dots" aria-hidden="true"><i></i><i></i><i></i></span>
          {message.status ?? 'Думаю…'}
        </div>
      {:else if message.content}
        <div class="agent-msg__text" class:agent-msg__text--streaming={message.streaming}>
          {@html html}
        </div>
        {#if message.streaming && message.status}
          <div class="agent-msg__status agent-msg__status--inline">
            <span class="agent-msg__dots" aria-hidden="true"><i></i><i></i><i></i></span>
            {message.status}
          </div>
        {/if}
      {/if}

      {#if message.releases.length}
        <div class="agent-msg__cards" role="list" aria-label="Подборка релизов">
          {#each message.releases as r (r.id)}
            <div role="listitem"><AgentReleaseCardView release={r} onOpen={onOpenRelease} /></div>
          {/each}
        </div>
      {/if}

      {#if message.actions.length}
        <div class="agent-msg__actions">
          {#each message.actions as a, i (i)}
            <button type="button" class="agent-msg__action" onclick={() => runAgentAction(a)}>
              <span aria-hidden="true">{@html agentActionIcon(a)}</span>{a.label}
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

      {#if !message.streaming && message.content && message.id != null}
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
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .agent-msg {
    display: flex;
    gap: 0.75rem;
    max-width: 100%;
  }

  .agent-msg--user {
    justify-content: flex-end;
  }

  .agent-msg__bubble {
    max-width: min(36rem, 85%);
    padding: 0.65rem 0.95rem;
    border-radius: 1.1rem 1.1rem 0.35rem 1.1rem;
    background: color-mix(in srgb, var(--uikit-v2-accent, #8f7bff) 22%, var(--uikit-v2-surface, #1e1e1e));
    color: var(--uikit-v2-text, #fff);
    font-size: 0.92rem;
    line-height: 1.5;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  .agent-msg--assistant {
    align-items: flex-start;
  }

  .agent-msg__main {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .agent-msg__name {
    font-size: 0.78rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    color: var(--uikit-v2-muted, #999);
    margin-top: 0.3rem;
  }

  .agent-msg__text {
    font-size: 0.93rem;
    line-height: 1.6;
    color: var(--uikit-v2-text, #fff);
    overflow-wrap: anywhere;
  }

  .agent-msg__text :global(p) {
    margin: 0 0 0.6rem;
  }

  .agent-msg__text :global(p:last-child),
  .agent-msg__text :global(ul:last-child),
  .agent-msg__text :global(ol:last-child) {
    margin-bottom: 0;
  }

  .agent-msg__text :global(ul),
  .agent-msg__text :global(ol) {
    margin: 0 0 0.6rem;
    padding-left: 1.25rem;
  }

  .agent-msg__text :global(li) {
    margin: 0.2rem 0;
  }

  .agent-msg__text :global(h4) {
    margin: 0.4rem 0 0.35rem;
    font-size: 0.95rem;
  }

  .agent-msg__text :global(strong) {
    font-weight: 700;
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
    width: 0.5rem;
    height: 1em;
    margin-left: 0.15rem;
    vertical-align: -0.12em;
    border-radius: 2px;
    background: var(--uikit-v2-accent, #8f7bff);
    animation: agent-caret 1s steps(2) infinite;
  }

  @keyframes agent-caret {
    50% {
      opacity: 0;
    }
  }

  .agent-msg__status {
    display: inline-flex;
    align-items: center;
    gap: 0.55rem;
    font-size: 0.85rem;
    color: var(--uikit-v2-muted, #999);
    background: linear-gradient(90deg, var(--uikit-v2-muted, #999) 30%, var(--uikit-v2-text, #fff) 50%, var(--uikit-v2-muted, #999) 70%);
    background-size: 200% 100%;
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
    animation: agent-shimmer 1.8s linear infinite;
  }

  .agent-msg__status--inline {
    font-size: 0.8rem;
  }

  @keyframes agent-shimmer {
    from {
      background-position: 100% 0;
    }
    to {
      background-position: -100% 0;
    }
  }

  .agent-msg__dots {
    display: inline-flex;
    gap: 3px;
    -webkit-text-fill-color: initial;
  }

  .agent-msg__dots i {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--uikit-v2-accent, #8f7bff);
    animation: agent-dot 1.2s infinite ease-in-out;
  }

  .agent-msg__dots i:nth-child(2) {
    animation-delay: 0.15s;
  }

  .agent-msg__dots i:nth-child(3) {
    animation-delay: 0.3s;
  }

  @keyframes agent-dot {
    0%,
    80%,
    100% {
      transform: translateY(0);
      opacity: 0.4;
    }
    40% {
      transform: translateY(-4px);
      opacity: 1;
    }
  }

  .agent-msg__cards {
    display: flex;
    gap: 0.65rem;
    overflow-x: auto;
    padding: 0.15rem 0.1rem 0.5rem;
    scrollbar-width: thin;
    animation: agent-pop 0.25s ease-out;
  }

  @keyframes agent-pop {
    from {
      opacity: 0;
      transform: translateY(4px);
    }
  }

  .agent-msg__actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.45rem;
    animation: agent-pop 0.25s ease-out;
  }

  .agent-msg__action {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.42rem 0.8rem;
    border: 1px solid color-mix(in srgb, var(--uikit-v2-accent, #8f7bff) 40%, transparent);
    border-radius: 999px;
    background: color-mix(in srgb, var(--uikit-v2-accent, #8f7bff) 10%, transparent);
    color: var(--uikit-v2-text, #fff);
    font-size: 0.82rem;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s ease;
  }

  .agent-msg__action:hover,
  .agent-msg__action:focus-visible {
    background: color-mix(in srgb, var(--uikit-v2-accent, #8f7bff) 22%, transparent);
    outline: none;
  }

  .agent-msg__action span {
    display: inline-flex;
    color: var(--uikit-v2-accent, #8f7bff);
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

  .agent-msg__tools {
    display: flex;
    gap: 0.15rem;
    opacity: 0.55;
    transition: opacity 0.15s ease;
  }

  .agent-msg:hover .agent-msg__tools,
  .agent-msg__tools:focus-within {
    opacity: 1;
  }

  .agent-msg__tool {
    display: inline-grid;
    place-items: center;
    width: 1.8rem;
    height: 1.8rem;
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
    color: var(--uikit-v2-accent, #8f7bff);
  }

  @media (prefers-reduced-motion: reduce) {
    .agent-msg__status,
    .agent-msg__dots i,
    .agent-msg__text--streaming :global(> :last-child)::after {
      animation: none;
    }
  }
</style>
