<script lang="ts">
  import type { LobbyParticipant, LobbyActivityEntry } from '../_types';
  import { lobbyActionText } from '../_utils';

  interface Props {
    participants: LobbyParticipant[];
    activityLog:  LobbyActivityEntry[];
  }
  let { participants, activityLog }: Props = $props();

  const MAX_SHOWN = 7;
  const shown     = $derived(participants.slice(0, MAX_SHOWN));
  const overflow  = $derived(participants.length > MAX_SHOWN ? participants.length - MAX_SHOWN : 0);
</script>

{#if participants.length > 0}
  <div class="watch-lobby-panel">
    <div class="watch-lobby-panel__avatars">
      {#each shown as p (p.login)}
        <div class="watch-lobby-avatar" data-tooltip={p.login}>
          {#if p.avatar}
            <img
              src={p.avatar}
              alt={p.login}
              class="watch-lobby-avatar__img"
              onerror={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
            />
          {:else}
            {(p.login[0] ?? '?').toUpperCase()}
          {/if}
        </div>
      {/each}
      {#if overflow > 0}
        <div class="watch-lobby-avatar watch-lobby-avatar--more">+{overflow}</div>
      {/if}
    </div>

    {#if activityLog.length > 0}
      <div class="watch-lobby-panel__log">
        {#each activityLog as entry (entry)}
          <div class="watch-lobby-log__entry">
            <span class="watch-lobby-log__name">{entry.login}</span>
            <span class="watch-lobby-log__action">{lobbyActionText(entry.type)}</span>
          </div>
        {/each}
      </div>
    {/if}
  </div>
{/if}
