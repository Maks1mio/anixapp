<script lang="ts">
  /**
   * «Загрузки» (телефон): что скачано и что нет, прогресс, управление, просмотр без сети.
   * Данные — нативный Media3 (метаданные тайтла хранятся в загрузке, поэтому экран работает офлайн).
   */
  import { onMount } from 'svelte';
  import { navigate } from '../stores/navigation';
  import { showToast } from '../stores/toast';
  import {
    titleGroups,
    downloadStorage,
    hasActiveDownloads,
    isOnline,
    downloadsReady,
    watchDownloads,
    refreshDownloads,
    type TitleGroup,
    type EpisodeEntry,
  } from '../stores/mobile-downloads';
  import {
    downloadsAvailable,
    pauseAll,
    resumeAll,
    removeDownload,
    playOffline,
    posterSrc,
  } from '../native/anix-downloads';
  import { fetchDubEpisodes, queueEpisodes, getDownloadQuality } from '../utils/mobile-download-actions';
  import MobileDownloadFlow from '../components/MobileDownloadFlow.svelte';

  let open = $state<Record<string, boolean>>({});
  let paused = $state(false);
  let confirmDel = $state<{ title: string; text: string; run: () => void } | null>(null);
  let dialogFor = $state<{ g: TitleGroup; missing: number; total: number } | null>(null);
  let busyKey = $state('');

  onMount(() => {
    const stop = watchDownloads();
    // С открытого экрана без сети и без загрузок смысла нет — но показываем пустое состояние, а не ошибку.
    return stop;
  });

  function fmtBytes(n: number): string {
    if (!n || n <= 0) return '0 МБ';
    const gb = n / 1024 ** 3;
    if (gb >= 1) return `${gb.toFixed(gb >= 10 ? 0 : 1).replace('.', ',')} ГБ`;
    const mb = n / 1024 ** 2;
    return `${Math.max(1, Math.round(mb))} МБ`;
  }

  function epWord(n: number): string {
    const m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return 'серия';
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 'серии';
    return 'серий';
  }

  function episodeStatusText(e: EpisodeEntry): string {
    switch (e.state) {
      case 'completed': return `Скачано · ${fmtBytes(e.bytes)}`;
      case 'downloading':
      case 'restarting': return `${Math.round(e.percent)}% · ${fmtBytes(e.bytes)}`;
      case 'queued': return 'В очереди';
      case 'stopped': return paused ? 'На паузе' : `Остановлено · ${Math.round(e.percent)}%`;
      case 'failed': return 'Ошибка загрузки';
      default: return '…';
    }
  }

  function groupSummary(g: TitleGroup): string {
    const parts: string[] = [];
    if (g.done > 0) parts.push(`Скачано ${g.done}${g.total > g.done ? ` из ${g.total}` : ''}`);
    if (g.active > 0) parts.push(`загружается ${g.active}`);
    if (g.failed > 0) parts.push(`ошибок ${g.failed}`);
    const missing = Math.max(0, g.total - g.episodes.length);
    if (missing > 0) parts.push(`не скачано ${missing}`);
    if (parts.length === 0) parts.push('—');
    return parts.join(' · ');
  }

  function groupProgress(g: TitleGroup): number {
    if (g.episodes.length === 0) return 0;
    const sum = g.episodes.reduce((a, e) => a + (e.state === 'completed' ? 100 : e.percent), 0);
    return Math.round(sum / Math.max(g.total, g.episodes.length));
  }

  const totalBytes = $derived($titleGroups.reduce((a, g) => a + g.bytes, 0));
  const hasAny = $derived($titleGroups.length > 0);

  async function togglePause() {
    if (paused) { await resumeAll(); paused = false; }
    else { await pauseAll(); paused = true; }
    void refreshDownloads();
  }

  async function deleteEpisodes(list: EpisodeEntry[]) {
    for (const e of list) await removeDownload(e.downloadId);
    await new Promise((r) => setTimeout(r, 250));
    await refreshDownloads();
  }

  function askDeleteGroup(g: TitleGroup) {
    confirmDel = {
      title: 'Удалить загрузки?',
      text: `«${g.releaseTitle}» · ${g.meta.dubberName}: будет удалено серий — ${g.episodes.length}.`,
      run: () => void deleteEpisodes(g.episodes),
    };
  }

  function askDeleteEpisode(g: TitleGroup, e: EpisodeEntry) {
    confirmDel = { title: 'Удалить серию?', text: `${g.releaseTitle} · ${e.name}`, run: () => void deleteEpisodes([e]) };
  }

  function askDeleteAll() {
    confirmDel = {
      title: 'Удалить все загрузки?',
      text: 'Скачанные серии будут удалены с телефона.',
      run: () => void deleteEpisodes($titleGroups.flatMap((g) => g.episodes)),
    };
  }

  async function watch(g: TitleGroup, from?: EpisodeEntry) {
    const done = g.episodes.filter((e) => e.state === 'completed');
    if (done.length === 0) { showToast('Нет скачанных серий'); return; }
    try {
      await playOffline(
        g.releaseTitle,
        done.map((e) => ({ downloadId: e.downloadId, id: e.downloadId, name: e.name })),
        (from ?? done[0]).downloadId,
      );
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Не удалось открыть плеер');
    }
  }

  function prepareMissing(g: TitleGroup) {
    if (!$isOnline) { showToast('Нужна сеть, чтобы докачать недостающие серии'); return; }
    dialogFor = { g, missing: 0, total: 0 };
  }

  async function retry(g: TitleGroup, e: EpisodeEntry) {
    if (!$isOnline) { showToast('Нет сети'); return; }
    try {
      const eps = await fetchDubEpisodes({ releaseId: g.releaseId, dubberId: g.meta.dubberId, sourceId: g.meta.sourceId });
      const ep = eps.find((x) => x.position === e.position);
      if (!ep) { showToast('Серия недоступна'); return; }
      await removeDownload(e.downloadId);
      await new Promise((r) => setTimeout(r, 300));
      await queueEpisodes(
        { releaseId: g.releaseId, releaseTitle: g.releaseTitle, sourceId: g.meta.sourceId, sourceName: g.meta.sourceName,
          dubberId: g.meta.dubberId, dubberName: g.meta.dubberName, episodesTotal: g.total },
        [ep], getDownloadQuality(),
      );
    } catch { showToast('Не удалось повторить'); }
  }
</script>

<div class="m-dl">
  <h1 class="m-dl__title">Загрузки</h1>

  {#if !$isOnline}
    <div class="m-dl__offline" role="status">
      <strong>Нет подключения к сети</strong>
      <span>Скачанные серии доступны без интернета.</span>
    </div>
  {/if}

  {#if !downloadsAvailable()}
    <p class="m-dl__empty">Загрузки доступны только в приложении для телефона.</p>
  {:else if !$downloadsReady}
    <p class="m-dl__empty">Загрузка списка…</p>
  {:else}
    <div class="m-dl__storage">
      <div class="m-dl__storage-row">
        <span>Занято загрузками</span>
        <strong>{fmtBytes(totalBytes)}</strong>
      </div>
      {#if $downloadStorage}
        <div class="m-dl__bar"><i style="width:{Math.min(100, ((($downloadStorage.totalBytes - $downloadStorage.freeBytes) / Math.max(1, $downloadStorage.totalBytes)) * 100))}%"></i></div>
        <div class="m-dl__storage-row m-dl__storage-row--dim">
          <span>Свободно на телефоне</span>
          <span>{fmtBytes($downloadStorage.freeBytes)} из {fmtBytes($downloadStorage.totalBytes)}</span>
        </div>
      {/if}
    </div>

    {#if hasAny}
      <div class="m-dl__tools">
        {#if $hasActiveDownloads || paused}
          <button type="button" class="m-dl__tool" onclick={togglePause}>{paused ? 'Продолжить все' : 'Пауза'}</button>
        {/if}
        <button type="button" class="m-dl__tool m-dl__tool--danger" onclick={askDeleteAll}>Удалить все</button>
      </div>
    {/if}

    {#if !hasAny}
      <div class="m-dl__blank">
        <p class="m-dl__blank-title">Пока ничего не скачано</p>
        <p class="m-dl__empty">Откройте тайтл → «Воспроизвести» → выберите озвучку → «Скачать все серии». Серии будут доступны без интернета.</p>
      </div>
    {/if}

    {#each $titleGroups as g (g.key)}
      {@const poster = posterSrc(g.meta)}
      {@const isOpen = !!open[g.key]}
      <section class="m-dl-card" class:m-dl-card--open={isOpen}>
        <button type="button" class="m-dl-card__head" aria-expanded={isOpen} onclick={() => (open[g.key] = !isOpen)}>
          <span class="m-poster m-dl-card__poster">{#if poster}<img src={poster} alt="" loading="lazy" />{/if}</span>
          <span class="m-dl-card__info">
            <span class="m-dl-card__title">{g.releaseTitle}</span>
            <span class="m-dl-card__sub">{g.meta.dubberName} · {g.meta.sourceName}</span>
            <span class="m-dl-card__stat">{groupSummary(g)}</span>
            <span class="m-dl-card__size">{fmtBytes(g.bytes)}</span>
            {#if g.active > 0}
              <span class="m-dl__bar m-dl__bar--thin"><i style="width:{groupProgress(g)}%"></i></span>
            {/if}
          </span>
          <svg class="m-dl-card__chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
        </button>

        {#if isOpen}
          <div class="m-dl-card__actions">
            <button type="button" class="m-dl__pill m-dl__pill--fill" disabled={g.done === 0} onclick={() => void watch(g)}>Смотреть</button>
            <button type="button" class="m-dl__pill" onclick={() => prepareMissing(g)}>Докачать / другая озвучка</button>
            <button type="button" class="m-dl__pill" onclick={() => navigate(`/release/${g.releaseId}`)}>О тайтле</button>
            <button type="button" class="m-dl__pill m-dl__pill--danger" onclick={() => askDeleteGroup(g)}>Удалить</button>
          </div>

          <ul class="m-dl-eps">
            {#each g.episodes as e (e.downloadId)}
              <li class="m-dl-ep" class:m-dl-ep--done={e.state === 'completed'} class:m-dl-ep--fail={e.state === 'failed'}>
                <button type="button" class="m-dl-ep__main" disabled={e.state !== 'completed'} onclick={() => void watch(g, e)}>
                  <span class="m-dl-ep__icon" aria-hidden="true">
                    {#if e.state === 'completed'}
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="m8.5 12.5 2.5 2.5 4.5-5"/></svg>
                    {:else if e.state === 'failed'}
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.5v.01"/></svg>
                    {:else}
                      <span class="m-dl-ep__ring" style="--p:{Math.round(e.percent)}"></span>
                    {/if}
                  </span>
                  <span class="m-dl-ep__text">
                    <span class="m-dl-ep__name">{e.name}</span>
                    <span class="m-dl-ep__status">{episodeStatusText(e)}</span>
                  </span>
                </button>
                {#if e.state === 'failed'}
                  <button type="button" class="m-dl-ep__act" onclick={() => void retry(g, e)}>Повторить</button>
                {/if}
                <button type="button" class="m-dl-ep__act m-dl-ep__act--icon" aria-label="Удалить серию" onclick={() => askDeleteEpisode(g, e)}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-12M9 7V4h6v3"/></svg>
                </button>
              </li>
            {/each}
          </ul>
        {/if}
      </section>
    {/each}
  {/if}
</div>

{#if confirmDel}
  <div class="m-dl-scrim" role="presentation">
    <button type="button" class="m-dl-scrim__bg" aria-label="Закрыть" onclick={() => (confirmDel = null)}></button>
    <div class="m-dl-confirm" role="alertdialog" aria-modal="true">
      <h2>{confirmDel.title}</h2>
      <p>{confirmDel.text}</p>
      <div class="m-dl-confirm__actions">
        <button type="button" onclick={() => (confirmDel = null)}>Отмена</button>
        <button type="button" class="m-dl-confirm__danger" onclick={() => { const r = confirmDel?.run; confirmDel = null; r?.(); }}>Удалить</button>
      </div>
    </div>
  </div>
{/if}

{#if dialogFor}
  <MobileDownloadFlow
    releaseId={dialogFor.g.releaseId}
    releaseTitle={dialogFor.g.releaseTitle}
    preDubberId={dialogFor.g.meta.dubberId}
    preSourceId={dialogFor.g.meta.sourceId}
    onClose={() => (dialogFor = null)}
  />
{/if}
