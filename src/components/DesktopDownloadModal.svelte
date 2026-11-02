<script lang="ts">
  /**
   * «Скачать серии» (ПК) из экрана серий: озвучка и источник уже выбраны там,
   * здесь — какие серии и в каком качестве. Ставит в очередь через `episode-download:queue`.
   */
  import { onDestroy, onMount } from 'svelte';
  import { portal } from '../actions/portal';
  import { showToast } from '../stores/toast';
  import { navigate } from '../stores/navigation';
  import { downloads } from '../stores/downloads';
  import { episodeDisplayNumber } from '../utils/episode-display';
  import {
    buildDownloadFolder,
    buildEpisodeFilename,
    resolveQueueItem,
    type QueueDownloadItem,
  } from '../utils/download-queue-client';
  import UiV2Button from './uikit-v2/UiV2Button.svelte';
  import { iconX, iconCheck, iconDownload } from './icons';

  interface Ep { position: number; name: string; url: string; iframe: boolean }

  interface Props {
    releaseId: number;
    releaseTitle: string;
    dubberId: number;
    dubberName: string;
    sourceId: number;
    sourceName: string;
    episodes: Ep[];
    onClose: () => void;
  }
  const { releaseId, releaseTitle, dubberId, dubberName, sourceId, sourceName, episodes, onClose }: Props = $props();

  const QUALITY_KEY = 'anix:desktopDlQuality';
  const QUALITY_HINTS: Record<number, string> = { 720: 'Рекомендуется', 480: 'Экономия', 360: 'Минимум места' };

  let onDisk = $state<Record<number, boolean>>({});
  let selected = $state<Record<number, boolean>>({});
  let lastClicked = $state<number | null>(null);
  /** Качества, которые реально отдаёт источник (по убыванию); пусто — только «лучшее доступное». */
  let qualities = $state<number[]>([]);
  let qualityLoading = $state(true);
  let quality = $state<number | null>(null);
  let busy = $state('');

  const canQueue = typeof window !== 'undefined' && !!window.electron?.queueEpisodeDownloads;
  const closeIcon = iconX(16);
  const checkIcon = iconCheck(12);
  const folderHint = $derived(buildDownloadFolder(releaseTitle, dubberName, sourceName));
  const maxQuality = $derived(qualities[0] ?? null);

  /** Серии этой озвучки, уже стоящие в очереди / качающиеся. */
  const inQueue = $derived.by(() => {
    const map: Record<number, boolean> = {};
    for (const d of $downloads) {
      if (d.releaseId !== releaseId || d.dubberId !== dubberId || d.episodePosition == null) continue;
      if (d.status === 'queued' || d.status === 'starting' || d.status === 'downloading' || d.status === 'paused') {
        map[d.episodePosition] = true;
      }
    }
    return map;
  });
  const missing = $derived(episodes.filter((e) => !onDisk[e.position] && !inQueue[e.position]));
  const selectedList = $derived(episodes.filter((e) => selected[e.position]));
  const selectedHaveFile = $derived(selectedList.filter((e) => onDisk[e.position]).length);

  function seriesWord(n: number): string {
    const m10 = n % 10;
    const m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return 'серия';
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 'серии';
    return 'серий';
  }

  function epLabel(ep: Ep): string {
    const n = episodeDisplayNumber(ep, episodes);
    return n != null ? String(n) : (ep.name || String(ep.position));
  }

  function embedOf(ep: Ep): string {
    return ep.url.startsWith('http') ? ep.url : `https:${ep.url}`;
  }

  function qualityOptions(map: Record<string, string> | undefined): Array<{ q: number; url: string }> {
    return Object.entries(map ?? {})
      .map(([k, url]) => ({ q: parseInt(k, 10), url }))
      .filter((o) => Number.isFinite(o.q) && typeof o.url === 'string' && !!o.url)
      .sort((a, b) => b.q - a.q);
  }

  /** Спрашиваем у источника, какие качества есть (по последней серии — обычно самая свежая). */
  async function probeQualities() {
    qualityLoading = true;
    try {
      const sample = episodes[episodes.length - 1];
      if (!sample) return;
      const direct = await window.anixApi?.release?.getDirectVideoLink(embedOf(sample));
      qualities = [...new Set(qualityOptions(direct?.qualityMap).map((o) => o.q))];
    } catch {
      qualities = [];
    } finally {
      qualityLoading = false;
      let saved: number | null = null;
      try { saved = parseInt(localStorage.getItem(QUALITY_KEY) ?? '', 10) || null; } catch { /* ignore */ }
      quality = saved != null && qualities.includes(saved) ? saved : (qualities[0] ?? null);
    }
  }

  function setQuality(q: number) {
    quality = q;
    try { localStorage.setItem(QUALITY_KEY, String(q)); } catch { /* ignore */ }
  }

  async function refreshOnDisk() {
    if (!window.electron?.checkDownloadFiles || episodes.length === 0) {
      onDisk = {};
      return;
    }
    try {
      const items = episodes.map((ep) => ({
        folder: folderHint,
        filename: buildEpisodeFilename(releaseTitle, dubberName, ep.position, sourceName),
      }));
      const results = await window.electron.checkDownloadFiles({ items });
      const next: Record<number, boolean> = {};
      results.forEach((r, i) => { if (r.exists) next[episodes[i].position] = true; });
      onDisk = next;
    } catch {
      onDisk = {};
    }
  }

  function selectOnly(list: Ep[]) {
    const next: Record<number, boolean> = {};
    for (const e of list) next[e.position] = true;
    selected = next;
    lastClicked = null;
  }

  /** Клик — переключить серию, Shift+клик — диапазон от прошлой. */
  function toggleEpisode(ep: Ep, e: MouseEvent) {
    if (busy) return;
    if (e.shiftKey && lastClicked != null) {
      const from = episodes.findIndex((x) => x.position === lastClicked);
      const to = episodes.findIndex((x) => x.position === ep.position);
      if (from >= 0 && to >= 0) {
        const value = !selected[ep.position];
        const next = { ...selected };
        for (let i = Math.min(from, to); i <= Math.max(from, to); i++) next[episodes[i].position] = value;
        selected = next;
        lastClicked = ep.position;
        return;
      }
    }
    selected = { ...selected, [ep.position]: !selected[ep.position] };
    lastClicked = ep.position;
  }

  /** Ссылка выбранного качества (или ближайшего ниже); null — качать максимум штатным путём. */
  async function resolveWithQuality(ep: Ep): Promise<QueueDownloadItem | null> {
    const want = quality;
    if (want == null || want === maxQuality) return null;
    const direct = await window.anixApi?.release?.getDirectVideoLink(embedOf(ep));
    const options = qualityOptions(direct?.qualityMap);
    const pick = options.find((o) => o.q <= want) ?? options[options.length - 1];
    if (!pick) return null;
    let url = pick.url.replace(/:hls:manifest\.m3u8$/, '').replace(/:hls:hls\.m3u8$/, '');
    if (!url.startsWith('http')) url = `https:${url}`;
    return {
      url,
      filename: buildEpisodeFilename(releaseTitle, dubberName, ep.position, sourceName),
      folder: folderHint,
      headers: direct?.downloadHeaders ?? {},
      releaseId,
      sourceId,
      dubberId,
      episodePosition: ep.position,
      releaseTitle,
      dubberName,
      sourceName,
      skip: direct?.skip ?? null,
    };
  }

  async function resolveItem(ep: Ep): Promise<QueueDownloadItem | null> {
    try {
      const picked = await resolveWithQuality(ep);
      if (picked) return picked;
    } catch { /* fallback к максимальному качеству */ }
    return resolveQueueItem(releaseId, sourceId, dubberId, releaseTitle, dubberName, sourceName, ep.position, ep.url, ep.iframe);
  }

  async function confirm() {
    if (selectedList.length === 0 || busy || !canQueue) return;
    const list = selectedList;
    const items: QueueDownloadItem[] = [];
    let failed = 0;
    for (let i = 0; i < list.length; i++) {
      busy = `Подготовка ${i + 1} из ${list.length}…`;
      try {
        const item = await resolveItem(list[i]);
        if (item) items.push(item);
        else failed++;
      } catch {
        failed++;
      }
    }
    try {
      if (items.length === 0) {
        showToast('Не удалось получить ссылки на серии — попробуйте другой источник', 'err');
        return;
      }
      await window.electron!.queueEpisodeDownloads!({ items });
      showToast(
        failed > 0
          ? `В загрузках: ${items.length}, не удалось: ${failed}`
          : `Добавлено в загрузки: ${items.length} ${seriesWord(items.length)}`,
      );
      onClose();
      navigate('/downloads');
    } catch {
      showToast('Не удалось поставить в очередь', 'err');
    } finally {
      busy = '';
    }
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key !== 'Escape') return;
    // Escape закрывает только это окно, а не «Смотреть» под ним.
    e.stopImmediatePropagation();
    if (!busy) onClose();
  }

  onMount(() => {
    window.addEventListener('keydown', onKeydown, true);
    const onProgress = (e: Event) => {
      if ((e as CustomEvent).detail?.status === 'done') void refreshOnDisk();
    };
    window.addEventListener('episode-download:progress', onProgress);
    void refreshOnDisk().then(() => selectOnly(missing));
    void probeQualities();
    return () => window.removeEventListener('episode-download:progress', onProgress);
  });

  onDestroy(() => window.removeEventListener('keydown', onKeydown, true));
</script>

<div class="dl-modal" role="presentation" use:portal>
  <button type="button" class="dl-modal__backdrop" aria-label="Закрыть" onclick={() => { if (!busy) onClose(); }}></button>
  <div class="dl-modal__panel" role="dialog" aria-modal="true" aria-label="Скачать серии">
    <header class="dl-modal__head">
      <div class="dl-modal__head-text">
        <h2 class="dl-modal__title">Скачать серии</h2>
        <p class="dl-modal__subtitle">{dubberName} · {sourceName}</p>
      </div>
      <button type="button" class="dl-modal__close" aria-label="Закрыть" onclick={onClose} disabled={!!busy}>{@html closeIcon}</button>
    </header>

    <div class="dl-modal__body">
      <section class="dl-modal__section">
        <div class="dl-modal__section-head">
          <h3 class="dl-modal__label">Серии</h3>
          <div class="dl-modal__pills">
            <button type="button" class="dl-modal__pill" disabled={!!busy} onclick={() => selectOnly(episodes)}>Все ({episodes.length})</button>
            {#if missing.length > 0 && missing.length < episodes.length}
              <button type="button" class="dl-modal__pill" disabled={!!busy} onclick={() => selectOnly(missing)}>Докачать остальные ({missing.length})</button>
            {/if}
            <button type="button" class="dl-modal__pill" disabled={!!busy || selectedList.length === 0} onclick={() => selectOnly([])}>Снять выбор</button>
          </div>
        </div>
        {#if episodes.length === 0}
          <p class="dl-modal__note">В этом источнике нет доступных серий.</p>
        {:else}
          <div class="dl-modal__eps">
            {#each episodes as ep (ep.position)}
              {@const on = !!selected[ep.position]}
              <button
                type="button"
                class="dl-modal__ep"
                class:dl-modal__ep--on={on}
                class:dl-modal__ep--disk={onDisk[ep.position]}
                aria-pressed={on}
                disabled={!!busy}
                onclick={(e) => toggleEpisode(ep, e)}
              >
                <span class="dl-modal__ep-num">{epLabel(ep)}</span>
                {#if onDisk[ep.position]}
                  <span class="dl-modal__ep-mark dl-modal__ep-mark--disk" aria-label="Скачана">{@html checkIcon}</span>
                {:else if inQueue[ep.position]}
                  <span class="dl-modal__ep-mark dl-modal__ep-mark--queue" aria-label="В загрузках"></span>
                {/if}
              </button>
            {/each}
          </div>
          <p class="dl-modal__hint">Клик — выбрать серию, Shift+клик — диапазон. Зелёным отмечены скачанные серии.</p>
        {/if}
      </section>

      <section class="dl-modal__section">
        <h3 class="dl-modal__label">Качество</h3>
        {#if qualityLoading}
          <p class="dl-modal__note">Узнаём, какое качество отдаёт {sourceName}…</p>
        {:else if qualities.length === 0}
          <p class="dl-modal__note">Источник не сообщает доступные качества — скачается лучшее, какое он отдаст.</p>
        {:else}
          <div class="dl-modal__quality" role="radiogroup" aria-label="Качество">
            {#each qualities as q, i (q)}
              <button
                type="button"
                role="radio"
                aria-checked={quality === q}
                class="dl-modal__qopt"
                class:dl-modal__qopt--on={quality === q}
                disabled={!!busy}
                onclick={() => setQuality(q)}
              >
                <span>{q}p</span><small>{i === 0 ? 'Максимум' : (QUALITY_HINTS[q] ?? '')}</small>
              </button>
            {/each}
          </div>
          {#if qualities.length === 1}
            <p class="dl-modal__hint">В {sourceName} для этой озвучки есть только {qualities[0]}p.</p>
          {/if}
        {/if}
      </section>
    </div>

    <footer class="dl-modal__foot">
      <div class="dl-modal__summary">
        {#if busy}
          {busy}
        {:else if selectedList.length > 0}
          Скачается: {selectedList.length} {seriesWord(selectedList.length)}{#if quality != null}&nbsp;· {quality}p{/if}{#if selectedHaveFile > 0}<span class="dl-modal__summary-warn">&nbsp;· {selectedHaveFile} уже на диске — будет новая копия</span>{/if}
          <span class="dl-modal__summary-folder">{canQueue ? folderHint : 'Скачивание доступно только в приложении для ПК'}</span>
        {:else if !canQueue}
          Скачивание доступно только в приложении для ПК
        {:else if episodes.length > 0 && missing.length === 0}
          Все серии уже скачаны или в загрузках
        {:else}
          Выберите серии
        {/if}
      </div>
      <UiV2Button label="Отмена" variant="ghost" disabled={!!busy} onclick={onClose} />
      <UiV2Button
        label={busy ? 'Подготовка…' : 'Скачать'}
        variant="primary"
        disabled={!canQueue || !!busy || qualityLoading || selectedList.length === 0}
        onclick={() => void confirm()}
      >
        {#snippet icon()}{@html iconDownload(16)}{/snippet}
      </UiV2Button>
    </footer>
  </div>
</div>

<style lang="scss">
  @use '../styles/variables' as *;

  .dl-modal {
    --dl-card: color-mix(in srgb, #{$color-text} 6%, transparent);
    --dl-card-hover: color-mix(in srgb, #{$color-text} 10%, transparent);

    position: fixed;
    inset: 0;
    z-index: 10000;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
  }

  .dl-modal__backdrop {
    position: absolute;
    inset: 0;
    border: 0;
    padding: 0;
    background: rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(6px);
    cursor: pointer;
  }

  .dl-modal__panel {
    position: relative;
    width: min(44rem, 100%);
    max-height: min(90vh, 46rem);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: color-mix(in srgb, #{$color-surface} 94%, black);
    border: 1px solid color-mix(in srgb, #{$color-border} 82%, transparent);
    border-radius: 22px;
    box-shadow: 0 24px 70px rgba(0, 0, 0, 0.68);
    animation: dl-modal-in 0.22s cubic-bezier(0.16, 1, 0.3, 1);
  }

  @keyframes dl-modal-in {
    from { opacity: 0; transform: translateY(0.75rem) scale(0.98); }
    to { opacity: 1; transform: none; }
  }

  .dl-modal__head {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 1.25rem 1.5rem 0.5rem;
  }

  .dl-modal__head-text {
    flex: 1;
    min-width: 0;
  }

  .dl-modal__title {
    margin: 0;
    font-size: 1.5rem;
    font-weight: 800;
    line-height: 1.2;
    color: $color-text;
  }

  .dl-modal__subtitle {
    margin: 0.3rem 0 0;
    color: $color-text-muted;
    font-size: 0.9rem;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .dl-modal__close {
    width: 2.25rem;
    height: 2.25rem;
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 0;
    border-radius: 50%;
    background: var(--dl-card);
    color: $color-text-muted;
    cursor: pointer;
    transition: background $transition, color $transition;

    &:hover:not(:disabled) {
      background: var(--dl-card-hover);
      color: $color-text;
    }
  }

  .dl-modal__body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 0.25rem 1.5rem 1.1rem;
    scrollbar-width: thin;
  }

  .dl-modal__section {
    margin-top: 1.2rem;

    &:first-child {
      margin-top: 0.4rem;
    }
  }

  .dl-modal__section-head {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.6rem 1rem;
    margin-bottom: 0.7rem;

    .dl-modal__label {
      margin: 0;
    }
  }

  .dl-modal__label {
    margin: 0 0 0.7rem;
    color: $color-text;
    font-size: 1rem;
    font-weight: 800;
  }

  .dl-modal__note {
    margin: 0.25rem 0;
    color: $color-text-muted;
    font-size: 0.9rem;
  }

  .dl-modal__hint {
    margin: 0.55rem 0 0;
    color: $color-text-muted;
    font-size: 0.78rem;
  }

  .dl-modal__pills {
    display: flex;
    flex-wrap: wrap;
    gap: 0.45rem;
  }

  .dl-modal__pill {
    display: inline-flex;
    align-items: center;
    min-height: 2rem;
    padding: 0 0.85rem;
    border: 0;
    border-radius: 10px;
    background: var(--dl-card);
    color: color-mix(in srgb, #{$color-text} 80%, transparent);
    font: inherit;
    font-size: 0.82rem;
    font-weight: 700;
    white-space: nowrap;
    cursor: pointer;
    transition: background $transition, color $transition;

    &:hover:not(:disabled) {
      background: var(--dl-card-hover);
      color: $color-text;
    }

    &:disabled {
      opacity: 0.45;
      cursor: default;
    }
  }

  .dl-modal__eps {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(4rem, 1fr));
    gap: 0.5rem;
  }

  .dl-modal__ep {
    position: relative;
    height: 3.4rem;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 0;
    border-radius: 14px;
    background: var(--dl-card);
    color: $color-text-muted;
    font: inherit;
    font-size: 1.2rem;
    font-weight: 800;
    cursor: pointer;
    user-select: none;
    transition: background $transition, color $transition, box-shadow $transition;

    &:hover:not(:disabled) {
      background: var(--dl-card-hover);
      color: $color-text;
    }

    &--on {
      background: color-mix(in srgb, #{$color-accent} 22%, transparent);
      box-shadow: inset 0 0 0 2px $color-accent;
      color: $color-text;

      &:hover:not(:disabled) {
        background: color-mix(in srgb, #{$color-accent} 30%, transparent);
      }
    }

    &--disk:not(.dl-modal__ep--on) {
      color: $color-success;
    }

    &:disabled {
      cursor: default;
    }
  }

  .dl-modal__ep-num {
    max-width: 100%;
    padding: 0 0.3rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .dl-modal__ep-mark {
    position: absolute;
    top: 0.3rem;
    right: 0.3rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1rem;
    height: 1rem;
    border-radius: 50%;

    &--disk {
      background: color-mix(in srgb, #{$color-success} 22%, transparent);
      color: $color-success;

      :global(svg) {
        width: 0.65rem;
        height: 0.65rem;
      }
    }

    &--queue {
      width: 0.5rem;
      height: 0.5rem;
      top: 0.45rem;
      right: 0.45rem;
      background: $color-accent;
    }
  }

  .dl-modal__quality {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(7.5rem, 1fr));
    gap: 0.5rem;
  }

  .dl-modal__qopt {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.15rem;
    padding: 0.65rem 0.4rem;
    border: 0;
    border-radius: 14px;
    background: var(--dl-card);
    color: $color-text;
    font: inherit;
    font-size: 1rem;
    font-weight: 800;
    cursor: pointer;
    transition: background $transition, box-shadow $transition;

    small {
      min-height: 0.9rem;
      color: $color-text-muted;
      font-size: 0.72rem;
      font-weight: 600;
    }

    &:hover:not(:disabled) {
      background: var(--dl-card-hover);
    }

    &--on {
      background: var(--dl-card-hover);
      box-shadow: inset 0 0 0 2px color-mix(in srgb, #{$color-text} 90%, transparent);
    }

    &:disabled {
      cursor: default;
    }
  }

  .dl-modal__foot {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.9rem 1.5rem 1.1rem;
    border-top: 1px solid color-mix(in srgb, #{$color-border} 70%, transparent);
  }

  .dl-modal__summary {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    color: $color-text;
    font-size: 0.9rem;
    font-weight: 600;
  }

  .dl-modal__summary-warn {
    color: $color-text-muted;
  }

  .dl-modal__summary-folder {
    flex-basis: 100%;
    color: $color-text-muted;
    font-size: 0.75rem;
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
</style>
