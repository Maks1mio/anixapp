<script lang="ts">
  import { onDestroy } from 'svelte';
  import type { ProposalData } from '../_types';

  interface Props {
    status:      'hidden' | 'vote' | 'waiting' | 'result';
    proposal?:   ProposalData | null;
    waitingTitle?: string;
    resultText?:   string;
    resultType?:   'accepted' | 'rejected';
    onvote:      (proposalId: string, accept: boolean) => void;
  }

  let { status, proposal, waitingTitle = '', resultText = '', resultType = 'accepted', onvote }: Props = $props();

  const VOTE_TIMEOUT = 30;
  let countdown   = $state(VOTE_TIMEOUT);
  let votedAccept = $state<boolean | null>(null);
  let timer: ReturnType<typeof setInterval> | null = null;
  let durationSec = VOTE_TIMEOUT;
  let armedProposalId = '';
  let tickDeadline = 0;

  $effect(() => {
    if (status === 'vote' && proposal?.proposalId) {
      // Повторная доставка того же proposal (IPC flush) не сбрасывает голос/таймер
      if (armedProposalId === proposal.proposalId && timer) return;
      armedProposalId = proposal.proposalId;
      const expiresAt = typeof proposal.expiresAt === 'number'
        ? proposal.expiresAt
        : Date.now() + VOTE_TIMEOUT * 1000;
      tickDeadline = expiresAt;
      const remaining = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
      durationSec = Math.max(1, remaining);
      countdown = remaining;
      votedAccept = null;
      clearTimer();
      timer = setInterval(() => {
        countdown = Math.max(0, Math.ceil((tickDeadline - Date.now()) / 1000));
        if (countdown <= 0) clearTimer();
      }, 250);
    } else {
      armedProposalId = '';
      clearTimer();
    }
  });

  function clearTimer() {
    if (timer) { clearInterval(timer); timer = null; }
  }

  onDestroy(clearTimer);

  const progress = $derived(Math.max(0, countdown / durationSec));

  function vote(accept: boolean) {
    if (!proposal) return;
    votedAccept = accept;
    onvote(proposal.proposalId, accept);
    if (!accept) clearTimer();
  }
</script>

{#if status !== 'hidden'}
  <div class="player-vote player-vote--visible {status === 'waiting' ? 'player-vote--waiting' : ''} {status === 'result' ? `player-vote--toast player-vote--toast-${resultType}` : ''}">

    {#if status === 'result'}
      <div class="player-vote__toast">{resultText}</div>

    {:else if status === 'waiting'}
      <div class="player-vote__card">
        <div class="player-vote__header">
          <div class="player-vote__icon player-vote__icon--waiting">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
            </svg>
          </div>
          <span class="player-vote__label">Ожидание</span>
        </div>
        <div class="player-vote__body">
          <div class="player-vote__waiting-text">Ожидаем ответа на смену:</div>
          <div class="player-vote__anime">
            <div class="player-vote__anime-title">{waitingTitle}</div>
          </div>
          <div class="player-vote__spinner"></div>
        </div>
      </div>

    {:else if status === 'vote' && proposal}
      {@const animeTitle = proposal.playback?.title || 'Неизвестное аниме'}
      {@const epText     = proposal.playback?.ep ? `${proposal.playback.ep} серия` : ''}
      {@const srcText    = proposal.playback?.sourceName || ''}
      {@const meta       = [epText, srcText].filter(Boolean).join(' · ')}
      <div class="player-vote__card">
        <div class="player-vote__header">
          <div class="player-vote__icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
          </div>
          <span class="player-vote__label">Голосование</span>
          <div class="player-vote__timer">{countdown}</div>
        </div>
        <div class="player-vote__body">
          <div class="player-vote__proposer">
            <span class="player-vote__name">{proposal.proposerLogin}</span> предлагает:
          </div>
          <div class="player-vote__anime">
            <div class="player-vote__anime-title">{animeTitle}</div>
            {#if meta}<div class="player-vote__anime-meta">{meta}</div>{/if}
          </div>
          <div class="player-vote__progress">
            <div class="player-vote__progress-bar" style="transform: scaleX({progress})"></div>
          </div>
        </div>
        <div class="player-vote__actions">
          <button
            class="player-vote__btn player-vote__btn--accept {votedAccept === true ? 'player-vote__btn--voted' : ''}"
            disabled={votedAccept !== null}
            onclick={() => vote(true)}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            {votedAccept === true ? 'Голос принят' : 'Принять'}
          </button>
          <button
            class="player-vote__btn player-vote__btn--reject"
            disabled={votedAccept !== null}
            onclick={() => vote(false)}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            Отмена
          </button>
        </div>
      </div>
    {/if}

  </div>
{/if}
