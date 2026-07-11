<script lang="ts">
  import { onMount } from 'svelte';
  import {
    downloads,
    downloadSettings,
    downloadLibrary,
    type DownloadEntry,
    type DownloadLibraryGroup,
    type DownloadLibraryFile,
  } from '../stores/downloads';
  import { formatDownloadErrorMessage } from '../utils/download-errors';
  import { queueMissingEpisodes } from '../utils/download-queue-client';
  import { navigate } from '../stores/navigation';
  import {
    iconDownload,
    iconRefreshCw,
    iconTriangleAlert,
    iconFolder,
    iconFileVideo,
    iconChevronRight,
    iconSettings,
    iconPlay,
    iconX,
    iconTrash2,
    iconFilm,
  } from '../components/icons';

  let expandedGroups = $state<Record<string, boolean>>({});
  let pickingDir = $state(false);
  let seasonBusy = $state<string | null>(null);

  onMount(() => downloads.init());

  const activeItems = $derived(
    $downloads.filter(x => x.status === 'queued' || x.status === 'downloading' || x.status === 'error'),
  );
  const activeCount = $derived(
    $downloads.filter(x => x.status === 'queued' || x.status === 'downloading').length,
  );
  const errorCount = $derived($downloads.filter(x => x.status === 'error').length);
  const libraryGroups = $derived($downloadLibrary);
  const libraryFileCount = $derived(libraryGroups.reduce((n, g) => n + g.files.length, 0));
  const downloadDir = $derived($downloadSettings.directory || '—');

  function progressPercent(entry: DownloadEntry): number {
    if (entry.status === 'error') return 100;
    if (!entry.total) return entry.received > 0 ? 12 : 0;
    return Math.min(99, Math.round((entry.received / entry.total) * 100));
  }

  function statusLabel(entry: DownloadEntry): string {
    if (entry.status === 'error') return 'Ошибка';
    if (entry.status === 'queued') return 'В очереди';
    const pct = progressPercent(entry);
    return pct > 0 ? `${pct}%` : 'Загрузка…';
  }

  function formatBytes(n: number): string {
    if (!n || n <= 0) return '—';
    if (n < 1024) return `${n} Б`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} КБ`;
    if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} МБ`;
    return `${(n / (1024 * 1024 * 1024)).toFixed(2)} ГБ`;
  }

  function formatDate(ts: number): string {
    if (!ts) return '—';
    return new Date(ts).toLocaleString('ru-RU', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function groupSize(group: DownloadLibraryGroup): number {
    return group.files.reduce((s, f) => s + f.size, 0);
  }

  function toggleGroup(id: string) {
    const open = expandedGroups[id] !== false;
    expandedGroups = { ...expandedGroups, [id]: !open };
  }

  function isExpanded(id: string): boolean {
    return expandedGroups[id] !== false;
  }

  async function pickFolder() {
    pickingDir = true;
    try {
      await downloads.pickDirectory();
    } finally {
      pickingDir = false;
    }
  }

  function openFolder() {
    window.electron?.openDownloadDirectory?.(downloadDir);
  }

  function showInFolder(file: DownloadLibraryFile) {
    window.electron?.showDownloadFile?.(file.path);
  }

  async function playInApp(payload: {
    filePath: string;
    title?: string;
    releaseId?: number | null;
    sourceId?: number | null;
    dubberId?: number | null;
    episodePosition?: number | null;
    sourceName?: string;
    allowPartial?: boolean;
    status?: string;
  }) {
    await window.electron?.playDownloadInApp?.({
      filePath: payload.filePath,
      title: payload.title,
      releaseId: payload.releaseId ?? undefined,
      sourceId: payload.sourceId ?? undefined,
      dubberId: payload.dubberId ?? undefined,
      episodePosition: payload.episodePosition ?? undefined,
      sourceName: payload.sourceName,
      allowPartial: payload.allowPartial,
      status: payload.status,
    });
  }

  function openRelease(releaseId?: number | null) {
    if (releaseId) navigate(`/release/${releaseId}`);
  }

  async function downloadRestOfSeason(group: DownloadLibraryGroup) {
    if (!group.releaseId || !group.sourceId || !group.dubberId) return;
    seasonBusy = group.id;
    try {
      const positions = group.files
        .map(f => f.episodePosition)
        .filter((p): p is number => typeof p === 'number');
      const n = await queueMissingEpisodes({
        releaseId: group.releaseId,
        sourceId: group.sourceId,
        dubberId: group.dubberId,
        releaseTitle: group.releaseTitle || group.name,
        dubberName: group.dubberName || '',
        sourceName: group.sourceName || '',
        existingPositions: positions,
      });
      if (n > 0) navigate('/downloads');
    } finally {
      seasonBusy = null;
    }
  }

  function canPlayEntry(entry: DownloadEntry): boolean {
    if (
      entry.status === 'downloading'
      && entry.releaseId != null
      && entry.sourceId != null
      && entry.episodePosition != null
    ) {
      return true;
    }
    return !!entry.filePath && (entry.playable || entry.status === 'done');
  }
</script>

<div class="view view-downloads">
  <div class="view-header">
    <h1 class="view-header__title">Загрузки</h1>
    <p class="view-header__subtitle">
      {#if activeCount > 0}
        Скачивается {activeCount} {activeCount === 1 ? 'файл' : activeCount < 5 ? 'файла' : 'файлов'} · по одному
        {#if libraryFileCount > 0}
          · в библиотеке {libraryFileCount}
        {/if}
      {:else if libraryFileCount > 0}
        В библиотеке {libraryFileCount} {libraryFileCount === 1 ? 'файл' : libraryFileCount < 5 ? 'файла' : 'файлов'}
      {:else}
        Скачивай серии через меню просмотра аниме
      {/if}
    </p>
  </div>

  <section class="dl-panel dl-panel--settings" aria-label="Настройки загрузок">
    <div class="dl-panel__head">
      <span class="dl-panel__icon">{@html iconSettings(18)}</span>
      <h2 class="dl-panel__title">Папка сохранения</h2>
    </div>
    <div class="dl-settings">
      <div class="dl-settings__path" title={downloadDir}>
        <span class="dl-settings__path-icon">{@html iconFolder(16)}</span>
        <span class="dl-settings__path-text">{downloadDir}</span>
      </div>
      <div class="dl-settings__actions">
        <button class="btn btn-secondary btn-sm" disabled={pickingDir} onclick={pickFolder}>
          {pickingDir ? 'Выбор…' : 'Изменить'}
        </button>
        <button class="btn btn-secondary btn-sm" onclick={openFolder}>Открыть папку</button>
        <button class="btn btn-secondary btn-sm" onclick={() => downloads.loadLibrary()}>Обновить</button>
        {#if activeCount > 0}
          <button class="btn btn-secondary btn-sm" onclick={() => downloads.cancelAllActive()}>Остановить все</button>
        {/if}
        {#if errorCount > 0}
          <button class="btn btn-secondary btn-sm" onclick={() => downloads.clearErrors()}>Очистить ошибки</button>
        {/if}
      </div>
    </div>
  </section>

  {#if activeItems.length > 0}
    <section class="dl-panel" aria-label="Активные загрузки">
      <div class="dl-panel__head">
        <span class="dl-panel__icon dl-panel__icon--accent">{@html iconDownload(18)}</span>
        <h2 class="dl-panel__title">Скачивается</h2>
        <span class="dl-panel__meta">{activeItems.length}</span>
      </div>

      <div class="dl-explorer">
        <div class="dl-explorer__head" aria-hidden="true">
          <span class="dl-col dl-col--icon"></span>
          <span class="dl-col dl-col--name">Файл</span>
          <span class="dl-col dl-col--size">Размер</span>
          <span class="dl-col dl-col--status">Статус</span>
          <span class="dl-col dl-col--actions"></span>
        </div>

        {#each activeItems as entry (entry.id)}
          {@const pct = progressPercent(entry)}
          <div class="dl-row dl-row--{entry.status}">
            <span class="dl-row__icon" class:dl-row__icon--spin={entry.status === 'downloading'} aria-hidden="true">
              {#if entry.status === 'error'}
                {@html iconTriangleAlert(16)}
              {:else if entry.status === 'downloading'}
                {@html iconRefreshCw(16)}
              {:else}
                {@html iconDownload(16)}
              {/if}
            </span>
            <div class="dl-row__main">
              <div class="dl-row__top">
                {#if entry.releaseId}
                  <button type="button" class="dl-row__name dl-row__name--link" title={entry.filename} onclick={() => openRelease(entry.releaseId)}>
                    {entry.filename}
                  </button>
                {:else}
                  <span class="dl-row__name" title={entry.filename}>{entry.filename}</span>
                {/if}
                <span class="dl-row__size">
                  {#if entry.total > 0}
                    {formatBytes(entry.received)} / {formatBytes(entry.total)}
                  {:else}
                    {formatBytes(entry.received)}
                  {/if}
                </span>
                <span class="dl-row__status">{statusLabel(entry)}</span>
                <span class="dl-row__actions">
                  {#if canPlayEntry(entry)}
                    <button
                      type="button"
                      class="dl-action-btn"
                      title={entry.status === 'downloading' ? 'Смотреть с подгрузкой' : 'Смотреть в плеере'}
                      onclick={() => playInApp({
                      filePath: entry.filePath!,
                      title: entry.releaseTitle || entry.filename,
                      releaseId: entry.releaseId,
                      sourceId: entry.sourceId,
                      dubberId: entry.dubberId,
                      episodePosition: entry.episodePosition,
                      sourceName: entry.sourceName,
                      allowPartial: true,
                      status: entry.status,
                    })}
                    >
                      {@html iconPlay(14)}
                    </button>
                  {/if}
                  {#if entry.status === 'queued' || entry.status === 'downloading'}
                    <button type="button" class="dl-action-btn" title="Остановить" onclick={() => downloads.cancelEntry(entry.id)}>
                      {@html iconX(14)}
                    </button>
                  {/if}
                  {#if entry.status === 'error'}
                    <button type="button" class="dl-action-btn" title="Убрать из списка" onclick={() => downloads.removeEntry(entry.id)}>
                      {@html iconTrash2(14)}
                    </button>
                  {/if}
                </span>
              </div>
              <div class="dl-row__track">
                <div class="dl-row__fill" style="width: {pct}%"></div>
              </div>
              {#if entry.status === 'error' && entry.error}
                <p class="dl-row__error" title={entry.error}>{formatDownloadErrorMessage(entry.error)}</p>
              {/if}
            </div>
          </div>
        {/each}
      </div>
    </section>
  {/if}

  <section class="dl-panel" aria-label="Скачанные файлы">
    <div class="dl-panel__head">
      <span class="dl-panel__icon">{@html iconFolder(18)}</span>
      <h2 class="dl-panel__title">Скачано</h2>
      <span class="dl-panel__meta">{libraryFileCount}</span>
    </div>

    {#if libraryGroups.length === 0}
      <div class="dl-empty">
        <div class="dl-empty__icon">{@html iconFileVideo(32)}</div>
        <p class="dl-empty__title">Пока нет скачанных серий</p>
        <p class="dl-empty__sub">Файлы появятся здесь после завершения загрузки</p>
      </div>
    {:else}
      <div class="dl-explorer dl-explorer--library">
        <div class="dl-explorer__head" aria-hidden="true">
          <span class="dl-col dl-col--icon"></span>
          <span class="dl-col dl-col--name">Тайтл / файл</span>
          <span class="dl-col dl-col--size">Размер</span>
          <span class="dl-col dl-col--date">Дата</span>
          <span class="dl-col dl-col--actions"></span>
        </div>

        {#each libraryGroups as group (group.id)}
          <div class="dl-folder">
            <div class="dl-folder__head">
              <button
                type="button"
                class="dl-folder__chevron-btn"
                onclick={() => toggleGroup(group.id)}
                aria-expanded={isExpanded(group.id)}
                aria-label={isExpanded(group.id) ? 'Свернуть' : 'Развернуть'}
              >
                <span class="dl-folder__chevron" class:dl-folder__chevron--open={isExpanded(group.id)}>
                  {@html iconChevronRight(16)}
                </span>
              </button>
              <span class="dl-folder__icon" aria-hidden="true">{@html iconFolder(16)}</span>
              {#if group.releaseId}
                <button type="button" class="dl-folder__name dl-folder__name--link" onclick={() => openRelease(group.releaseId)}>
                  {group.name}
                </button>
              {:else}
                <span class="dl-folder__name">{group.name}</span>
              {/if}
              <button type="button" class="dl-folder__meta-toggle" onclick={() => toggleGroup(group.id)}>
                {group.files.length} {group.files.length === 1 ? 'файл' : group.files.length < 5 ? 'файла' : 'файлов'}
                · {formatBytes(groupSize(group))}
              </button>
              <div class="dl-folder__actions">
                {#if group.releaseId}
                  <button type="button" class="dl-action-btn" title="Страница тайтла" onclick={() => openRelease(group.releaseId)}>
                    {@html iconFilm(14)}
                  </button>
                {/if}
                {#if group.releaseId && group.sourceId && group.dubberId}
                  <button
                    type="button"
                    class="dl-action-btn"
                    title="Докачать остальные серии"
                    disabled={seasonBusy === group.id}
                    onclick={() => downloadRestOfSeason(group)}
                  >
                    {@html iconDownload(14)}
                  </button>
                {/if}
              </div>
            </div>

            {#if isExpanded(group.id)}
              {#each group.files as file (file.path)}
                <div class="dl-row dl-row--done dl-row--nested">
                  <span class="dl-row__icon dl-row__icon--done" aria-hidden="true">{@html iconFileVideo(16)}</span>
                  <div class="dl-row__main dl-row__main--flat">
                    <span class="dl-row__name" title={file.name}>{file.name}</span>
                    <span class="dl-row__size">{formatBytes(file.size)}</span>
                    <span class="dl-row__date">{formatDate(file.modifiedAt)}</span>
                    <span class="dl-row__actions">
                      <button type="button" class="dl-action-btn" title="Смотреть в плеере" onclick={() => playInApp({
                        filePath: file.path,
                        title: group.releaseTitle || group.name,
                        releaseId: group.releaseId,
                        sourceId: group.sourceId,
                        dubberId: group.dubberId,
                        episodePosition: file.episodePosition,
                        sourceName: group.sourceName,
                      })}>
                        {@html iconPlay(14)}
                      </button>
                      <button type="button" class="dl-action-btn" title="Показать в папке" onclick={() => showInFolder(file)}>
                        {@html iconFolder(14)}
                      </button>
                    </span>
                  </div>
                </div>
              {/each}
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  </section>
</div>
