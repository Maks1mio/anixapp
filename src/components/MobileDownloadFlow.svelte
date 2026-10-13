<script lang="ts">
  /**
   * «Скачать серии» (телефон): озвучка → источник → качество → охват, в одном окне.
   * Вход: страница релиза (⋮), окно «Выберите серию», «Загрузки → Докачать остальные».
   */
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import { showToast } from '../stores/toast';
  import { portal } from '../actions/portal';
  import { downloadItems, episodeStatus, refreshDownloads } from '../stores/mobile-downloads';
  import { listPlayableDubberSources, type DubberSourceRef } from '../utils/dubber-sources';
  import { resolveCdnAssetUrl } from '../utils/posterUrl';
  import {
    QUALITY_CHOICES,
    getDownloadQuality,
    setDownloadQuality,
    queueEpisodes,
    type QueueEp,
  } from '../utils/mobile-download-actions';
  import { episodeListDisplayTotal } from '../utils/episode-display';

  interface Props {
    releaseId: number;
    releaseTitle: string;
    preDubberId?: number;
    preSourceId?: number;
    onClose: () => void;
  }
  let { releaseId, releaseTitle, preDubberId, preSourceId, onClose }: Props = $props();

  interface Dub { id: number; name: string; icon?: string; episodes: number; isSub: boolean }

  let loading = $state(true);
  let error = $state('');
  let dubbers = $state<Dub[]>([]);
  let dubberId = $state<number | null>(preDubberId ?? null);
  let sources = $state<DubberSourceRef[]>([]);
  let sourceId = $state<number | null>(preSourceId ?? null);
  let episodes = $state<QueueEp[]>([]);
  let epsLoading = $state(false);
  let quality = $state(getDownloadQuality());
  let onlyMissing = $state(true);
  let busy = $state(false);

  const dub = $derived(dubbers.find((d) => d.id === dubberId) ?? null);
  const source = $derived(sources.find((s) => s.id === sourceId) ?? null);

  function statusOf(position: number) {
    if (dubberId == null || sourceId == null) return undefined;
    return episodeStatus(get(downloadItems), releaseId, sourceId, dubberId, position);
  }
  const missing = $derived(
    episodes.filter((e) => {
      const st = statusOf(e.position)?.state;
      return !st || st === 'failed';
    }).length,
  );
  const hasSome = $derived(episodes.length > 0 && missing < episodes.length);

  function num(v: unknown): number {
    const n = typeof v === 'number' ? v : parseInt(String(v ?? ''), 10);
    return Number.isFinite(n) ? n : 0;
  }

  async function loadDubbers() {
    try {
      const res = (await window.anixApi.release.getDubbers(releaseId)) as { types?: Array<Record<string, unknown>> };
      dubbers = (res?.types ?? []).map((t) => ({
        id: num(t.id),
        name: String(t.name ?? ''),
        icon: t.icon ? resolveCdnAssetUrl(String(t.icon).replace(/^http:/, 'https:')) : undefined,
        episodes: num(t.episode_count ?? t.episodeCount ?? t.episodes_count ?? t.episodesCount),
        isSub: t.is_sub === true || t.isSub === true,
      })).filter((d) => d.id > 0 && d.name);
      if (dubbers.length === 0) { error = 'Нет доступных озвучек'; return; }
      if (dubberId == null || !dubbers.some((d) => d.id === dubberId)) dubberId = dubbers[0].id;
      await pickDubber(dubberId, preSourceId);
    } catch {
      error = 'Не удалось получить список озвучек. Проверьте подключение.';
    } finally {
      loading = false;
    }
  }

  async function pickDubber(id: number, wantSource?: number) {
    dubberId = id;
    sources = [];
    sourceId = null;
    episodes = [];
    epsLoading = true;
    try {
      sources = await listPlayableDubberSources(releaseId, id);
      if (sources.length === 0) { epsLoading = false; return; }
      const first = wantSource && sources.some((s) => s.id === wantSource) ? wantSource : sources[0].id;
      await pickSource(first);
    } catch {
      epsLoading = false;
    }
  }

  async function pickSource(id: number) {
    if (dubberId == null) return;
    sourceId = id;
    epsLoading = true;
    episodes = [];
    try {
      const res = (await window.anixApi.release.getEpisodes(releaseId, dubberId, id)) as { episodes?: Array<{ position: number; name?: string; url?: string }> };
      episodes = (res?.episodes ?? [])
        .filter((e) => !!e?.url)
        .map((e) => ({ position: e.position, name: e.name || `${e.position} серия`, url: e.url as string }));
      onlyMissing = missing > 0 && missing < episodes.length;
    } catch {
      episodes = [];
    } finally {
      epsLoading = false;
    }
  }

  onMount(() => { void loadDubbers(); });

  async function confirm() {
    if (!dub || !source || episodes.length === 0 || busy) return;
    busy = true;
    setDownloadQuality(quality);
    const list = onlyMissing && hasSome ? episodes.filter((e) => {
      const st = statusOf(e.position)?.state;
      return !st || st === 'failed';
    }) : episodes;
    try {
      const res = await queueEpisodes(
        { releaseId, releaseTitle, sourceId: source.id, sourceName: source.name, dubberId: dub.id, dubberName: dub.name, episodesTotal: episodes.length },
        list,
        quality,
      );
      void refreshDownloads();
      if (res.failed > 0 && res.queued === 0) showToast(res.error ? `Не удалось: ${res.error}` : 'Не удалось поставить в очередь');
      else showToast(res.queued > 0 ? `Загрузка начата: ${res.queued} ${res.queued === 1 ? 'серия' : res.queued < 5 ? 'серии' : 'серий'}` : 'Эти серии уже в загрузках');
      onClose();
    } finally {
      busy = false;
    }
  }

  const toDownload = $derived(onlyMissing && hasSome ? missing : episodes.length);
  /** Последний номер серии для UI (не length при дырах в нумерации). */
  const displayTotal = $derived(episodeListDisplayTotal(episodes));
</script>

<div class="m-flow-scrim" role="presentation" use:portal>
  <button type="button" class="m-flow-scrim__bg" aria-label="Закрыть" onclick={onClose}></button>
  <div class="m-flow" role="dialog" aria-modal="true" aria-label="Скачать серии">
    <h2 class="m-flow__title">Скачать серии</h2>
    <p class="m-flow__sub">{releaseTitle}</p>

    <div class="m-flow__body">
      {#if loading}
        <p class="m-flow__note">Загрузка озвучек…</p>
      {:else if error}
        <p class="m-flow__note">{error}</p>
      {:else}
        <p class="m-flow__label">Озвучка</p>
        <div class="m-flow__dubs" role="radiogroup">
          {#each dubbers as d (d.id)}
            <button type="button" role="radio" aria-checked={d.id === dubberId} class="m-dub" class:m-dub--on={d.id === dubberId} onclick={() => void pickDubber(d.id)}>
              <span class="m-dub__ava" style={d.icon ? `background-image:url(${d.icon})` : ''}></span>
              <span class="m-dub__name">{d.name}</span>
              {#if d.id === dubberId && displayTotal > 0}
                <span class="m-dub__eps">{displayTotal} эп.</span>
              {:else if d.episodes > 0}
                <span class="m-dub__eps">{d.episodes} эп.</span>
              {/if}
              <span class="m-dub__radio" aria-hidden="true"></span>
            </button>
          {/each}
        </div>

        {#if sources.length > 1}
          <p class="m-flow__label">Источник</p>
          <div class="m-flow__pills">
            {#each sources as s (s.id)}
              <button type="button" class="m-pill" class:m-pill--on={s.id === sourceId} onclick={() => void pickSource(s.id)}>{s.name}</button>
            {/each}
          </div>
        {/if}

        <p class="m-flow__label">Качество</p>
        <div class="m-flow__chips" role="radiogroup">
          {#each QUALITY_CHOICES as q (q.id)}
            <button type="button" role="radio" aria-checked={quality === q.id} class="m-chipopt" class:m-chipopt--on={quality === q.id} onclick={() => (quality = q.id)}>
              <span>{q.label}</span><small>{q.hint}</small>
            </button>
          {/each}
        </div>

        {#if hasSome && missing > 0}
          <p class="m-flow__label">Какие серии</p>
          <div class="m-flow__pills">
            <button type="button" class="m-pill" class:m-pill--on={onlyMissing} onclick={() => (onlyMissing = true)}>Недостающие ({missing})</button>
            <button type="button" class="m-pill" class:m-pill--on={!onlyMissing} onclick={() => (onlyMissing = false)}>Все ({displayTotal || episodes.length})</button>
          </div>
        {/if}

        <p class="m-flow__note">
          {#if epsLoading}Получаем список серий…
          {:else if episodes.length === 0}В этой озвучке нет доступных серий.
          {:else if hasSome && missing === 0}Все серии этой озвучки уже скачаны.
          {:else}Будет скачано серий: {toDownload}{/if}
        </p>
      {/if}
    </div>

    <div class="m-flow__actions">
      <button type="button" class="m-flow__btn m-flow__btn--ghost" onclick={onClose}>Отмена</button>
      <button type="button" class="m-flow__btn" disabled={busy || loading || epsLoading || episodes.length === 0 || (hasSome && missing === 0 && onlyMissing)} onclick={confirm}>{busy ? 'Подготовка…' : 'Скачать'}</button>
    </div>
  </div>
</div>

<style lang="scss">
  .m-flow-scrim { position: fixed; inset: 0; z-index: 95; display: flex; align-items: flex-end; justify-content: center; background: rgba(0, 0, 0, 0.6); }
  .m-flow-scrim__bg { position: absolute; inset: 0; border: 0; background: none; padding: 0; }
  .m-flow {
    position: relative; width: 100%; max-width: 520px; max-height: 92dvh; display: flex; flex-direction: column;
    padding: var(--m-space-5) var(--m-space-4) calc(var(--m-space-4) + env(safe-area-inset-bottom));
    border-radius: 28px 28px 0 0; background: var(--m-surface-sheet); color: var(--m-text);
  }
  .m-flow__title { margin: 0; padding: 0 var(--m-space-2); font: 400 22px/1.2 var(--m-font); }
  .m-flow__sub { margin: 4px var(--m-space-2) var(--m-space-2); color: var(--m-text-2); font-size: 14px; display: -webkit-box; -webkit-line-clamp: 1; -webkit-box-orient: vertical; overflow: hidden; }
  .m-flow__body { flex: 1; min-height: 0; overflow-y: auto; padding-bottom: var(--m-space-2); }
  .m-flow__label { margin: var(--m-space-4) var(--m-space-2) var(--m-space-2); color: var(--m-text-2); font-size: 13px; letter-spacing: 0.02em; }
  .m-flow__note { margin: var(--m-space-4) var(--m-space-2) 0; color: var(--m-text-2); font-size: 14px; }

  .m-flow__dubs { display: flex; flex-direction: column; gap: 2px; max-height: 232px; overflow-y: auto; border-radius: 16px; background: var(--m-surface-block); }
  .m-dub {
    display: flex; align-items: center; gap: var(--m-space-3); width: 100%; padding: 10px var(--m-space-3);
    border: 0; background: transparent; color: inherit; text-align: left; font: inherit;
    &--on { background: var(--m-secondary-container); color: var(--m-on-secondary-container); }
    &__ava { flex: none; width: 36px; height: 36px; border-radius: 9px; background: var(--m-surface-raised) center / cover; }
    &__name { flex: 1; min-width: 0; font: 500 16px/1.2 var(--m-font); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    &__eps { flex: none; font-size: 13px; opacity: 0.7; }
    &__radio { flex: none; width: 20px; height: 20px; border-radius: 50%; border: 2px solid var(--m-text-3); position: relative; }
    &--on &__radio { border-color: currentColor; &::after { content: ''; position: absolute; inset: 3px; border-radius: 50%; background: currentColor; } }
  }

  .m-flow__pills { display: flex; flex-wrap: wrap; gap: var(--m-space-2); }
  .m-pill {
    height: 36px; padding: 0 var(--m-space-4); border: 1.5px solid var(--m-outline-variant); border-radius: 18px; background: transparent; color: var(--m-text); font: 500 14px var(--m-font);
    &--on { border-color: transparent; background: var(--m-secondary-container); color: var(--m-on-secondary-container); }
  }
  .m-flow__chips { display: grid; grid-template-columns: repeat(4, 1fr); gap: var(--m-space-2); }
  .m-chipopt {
    display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 10px 4px;
    border: 1.5px solid var(--m-outline-variant); border-radius: 14px; background: transparent; color: inherit; font: 500 15px var(--m-font);
    small { font-size: 10px; color: var(--m-text-3); font-weight: 400; text-align: center; }
    &--on { border-color: var(--m-text); background: var(--m-secondary-container); color: var(--m-on-secondary-container); small { color: inherit; opacity: 0.8; } }
  }

  .m-flow__actions { display: flex; justify-content: flex-end; gap: var(--m-space-2); margin-top: var(--m-space-3); }
  .m-flow__btn {
    border: 0; background: var(--m-text); color: #111; font: 500 15px var(--m-font); padding: 11px 24px; border-radius: 22px;
    &:disabled { opacity: 0.4; }
    &--ghost { background: none; color: var(--m-text); }
  }
</style>
