<script lang="ts">
  import { onMount } from 'svelte';
  import { fade, fly } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { formatHistoryViewTime } from '../utils/historyFormat';
  import UiV2BackBar from './uikit-v2/UiV2BackBar.svelte';

  interface Props {
    profileId: number;
    login: string;
    onBack: () => void;
  }

  let { profileId, login, onBack }: Props = $props();

  type Item = { id: number; login: string; timestamp: number };

  let items = $state<Item[]>([]);
  let loadState = $state<'loading' | 'ready' | 'empty' | 'error'>('loading');

  function fmtTime(ts: number): string {
    if (!ts) return 'при регистрации';
    return formatHistoryViewTime(ts);
  }

  async function load() {
    if (!window.anixApi?.profile?.getLoginHistory) {
      loadState = 'error';
      return;
    }
    loadState = 'loading';
    try {
      const res = await window.anixApi.profile.getLoginHistory(profileId, 0);
      const rows = Array.isArray(res?.content) ? res.content : [];
      items = rows.map((row, i) => {
        const r = row as Record<string, unknown>;
        return {
          id: Number(r.id ?? i),
          login: String(r.newLogin ?? r.new_login ?? ''),
          timestamp: Number(r.timestamp ?? 0),
        };
      }).filter((row) => row.login);
      loadState = items.length ? 'ready' : 'empty';
    } catch {
      items = [];
      loadState = 'error';
    }
  }

  onMount(() => {
    void load();
  });
</script>

<div class="profile-panel__edit-view">
  <header class="profile-panel__friends-head">
    <UiV2BackBar
      segments={[
        { label: 'История никнейма', active: true },
        { label: login },
      ]}
      onBack={onBack}
    />
  </header>

  <div class="profile-panel__subpage-body">
    {#if loadState === 'loading'}
      <p class="profile-panel__state" transition:fade={{ duration: 140 }}>Загрузка…</p>
    {:else if loadState === 'error'}
      <p class="profile-panel__state" transition:fade={{ duration: 140 }}>Не удалось загрузить историю</p>
    {:else if loadState === 'empty'}
      <p class="profile-panel__state" transition:fade={{ duration: 140 }}>Изменений нет</p>
    {:else}
      <ul class="profile-panel__login-history-card">
        {#each items as item, i (item.id)}
          <li
            class="profile-panel__login-history-row"
            in:fly={{ y: 10, duration: 240, delay: Math.min(i * 28, 220), easing: cubicOut }}
          >
            <span class="profile-panel__login-history-name">{item.login}</span>
            <span class="profile-panel__login-history-date">{fmtTime(item.timestamp)}</span>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
</div>
