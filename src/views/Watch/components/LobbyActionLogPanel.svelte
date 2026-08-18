<script lang="ts">
  import { onMount } from 'svelte';
  import {
    type LobbyActionEntry,
    type LobbyActionOrigin,
    subscribeLobbyActionLog,
    formatLobbyActionLine,
    downloadLobbyActionLog,
    copyLobbyLogsFolderPath,
  } from '../../../services/lobby-action-log';
  import { iconDownload, iconFolder, iconCopy } from '../../../components/icons';
  import UiV2Button from '../../../components/uikit-v2/UiV2Button.svelte';
  import { uiv2CustomScroll } from '../../../actions/uiv2CustomScroll';

  type Props = {
    onclose: () => void;
  };

  let { onclose }: Props = $props();

  let entries = $state<LobbyActionEntry[]>([]);
  let filterOrigin = $state<'all' | LobbyActionOrigin>('all');
  let filterText = $state('');
  let logViewport: HTMLDivElement | null = $state(null);
  let pathHint = $state('');
  let lobbyFileHint = $state('');
  let pathCopied = $state(false);
  let downloadDone = $state(false);

  const filtered = $derived(
    entries.filter((e) => {
      if (filterOrigin !== 'all' && e.origin !== filterOrigin) return false;
      if (!filterText.trim()) return true;
      const q = filterText.trim().toLowerCase();
      const line = formatLobbyActionLine(e).toLowerCase();
      return line.includes(q) || e.action.toLowerCase().includes(q);
    }),
  );

  $effect(() => {
    filtered.length;
    queueMicrotask(() => {
      const el = logViewport;
      if (el) el.scrollTop = el.scrollHeight;
    });
  });

  function originClass(origin: LobbyActionOrigin): string {
    return `watch-lobby-log__row--${origin}`;
  }

  async function handleDownload() {
    await downloadLobbyActionLog();
    downloadDone = true;
    window.setTimeout(() => { downloadDone = false; }, 1800);
  }

  async function handleCopyPath() {
    const res = await copyLobbyLogsFolderPath();
    pathHint = res.path;
    pathCopied = res.copied;
    window.setTimeout(() => { pathCopied = false; }, 2200);
  }

  onMount(() => {
    subscribeLobbyActionLog((list) => { entries = list; });
    (window.electron as { logGetLobbyPath?: () => Promise<string | null> } | undefined)
      ?.logGetLobbyPath?.()
      .then((p) => { if (p) lobbyFileHint = p; })
      .catch(() => {});
  });
</script>

<section class="watch-lobby-log" aria-label="Журнал действий">
  <header class="watch-lobby-log__header">
    <div>
      <h3 class="watch-lobby-log__title">Журнал действий</h3>
      <p class="watch-lobby-log__hint">Локальные, серверные и действия других участников</p>
      {#if lobbyFileHint}
        <p class="watch-lobby-log__file" title={lobbyFileHint}>Файл: {lobbyFileHint}</p>
      {/if}
    </div>
    <button type="button" class="watch-lobby-log__close" onclick={onclose} aria-label="Закрыть журнал">×</button>
  </header>

  <div class="watch-lobby-log__filters" role="group" aria-label="Фильтр источника">
    {#each [
      { id: 'all', label: 'Все' },
      { id: 'local', label: 'Вы' },
      { id: 'server', label: 'Сервер' },
      { id: 'peer', label: 'Другие' },
      { id: 'system', label: 'Система' },
    ] as f (f.id)}
      <button
        type="button"
        class="watch-lobby-log__filter"
        class:watch-lobby-log__filter--active={filterOrigin === f.id}
        onclick={() => { filterOrigin = f.id as typeof filterOrigin; }}
      >{f.label}</button>
    {/each}
  </div>

  <input
    class="watch-lobby-log__search"
    type="search"
    placeholder="Поиск по действию…"
    bind:value={filterText}
    autocomplete="off"
  />

  <div
    class="watch-lobby-log__list uiv2-scroll-area uiv2-scroll-area--y"
    use:uiv2CustomScroll={{ axis: 'y' }}
  >
    <div class="uiv2-scroll-area__viewport" data-uiv2-scroll bind:this={logViewport}>
      {#if filtered.length === 0}
        <p class="watch-lobby-log__empty">Пока нет записей — начните воспроизведение или дождитесь событий комнаты.</p>
      {:else}
        {#each filtered as row (row.id)}
          <div class="watch-lobby-log__row {originClass(row.origin)}">
            <code class="watch-lobby-log__line">{formatLobbyActionLine(row)}</code>
          </div>
        {/each}
      {/if}
    </div>
    <div class="uiv2-scroll-area__v-track" aria-hidden="true">
      <div class="uiv2-scroll-area__v-thumb"></div>
    </div>
  </div>

  <footer class="watch-lobby-log__footer">
    <UiV2Button
      label={downloadDone ? 'Скачано' : 'Скачать журнал'}
      variant="ghost"
      size="sm"
      onclick={handleDownload}
    >
      {#snippet icon()}{@html iconDownload(14)}{/snippet}
    </UiV2Button>
    <UiV2Button
      label={pathCopied ? 'Путь скопирован' : 'Путь к логам'}
      variant="ghost"
      size="sm"
      onclick={handleCopyPath}
    >
      {#snippet icon()}{@html iconFolder(14)}{/snippet}
    </UiV2Button>
  </footer>

  {#if pathHint}
    <p class="watch-lobby-log__path" title={pathHint}>
      {@html iconCopy(12)}
      <span>{pathHint}</span>
    </p>
  {/if}
</section>
