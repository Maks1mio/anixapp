<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { getCurrentRoomId, getCurrentParticipants, proposeAnimeChange, getLastPlayback } from '../services/lobby-state';
  import Select from './Select.svelte';
  import type { SelectOption } from './Select.svelte';
  import Page from './Page.svelte';

  interface Props {
    releaseId: number;
    releaseTitle: string;
    onClose: () => void;
  }

  const { releaseId, releaseTitle, onClose }: Props = $props();

  // ── types ─────────────────────────────────────────────────────────────────────
  interface Dubber {
    id: number;
    name: string;
    icon?: string;
    view_count?: number;
    viewCount?: number;
    episode_count?: number;
    episodeCount?: number;
    episodes_count?: number;
    episodesCount?: number;
    [key: string]: unknown;
  }

  interface Source {
    id: number;
    name: string;
    episode_count?: number;
    episodeCount?: number;
    [key: string]: unknown;
  }

  interface Episode {
    position: number;
    name: string;
    url: string;
    iframe: boolean;
    is_watched?: boolean;
  }

  // ── state ─────────────────────────────────────────────────────────────────────
  type View = 'sources' | 'episodes';

  let currentView = $state<View>('sources');

  // sources view
  let sourcesLoading = $state(true);
  let sourcesError = $state('');
  let dubbers = $state<Dubber[]>([]);

  // episodes view
  let episodesLoading = $state(false);
  let episodesLoadText = $state('Загрузка серий…');
  let episodes = $state<Episode[]>([]);
  let episodesError = $state('');
  let selectedDubber = $state<{ id: number; name: string } | null>(null);
  let selectedSource = $state<{ id: number; name: string } | null>(null);
  let selectedEpisodePos = $state<number | null>(null);
  let sources = $state<Source[]>([]);
  let searchInput = $state('');

  // confirm dialog
  let confirmEpLabel = $state('');
  let showConfirm = $state(false);
  let confirmCallback = $state<(() => void) | null>(null);

  // Source selector (Svelte Select component)
  let sourceSelectOptions = $state<SelectOption[]>([]);
  let sourceSelectValue = $state('');

  // DOM refs
  let episodesListEl = $state<HTMLElement | null>(null);

  // ── helpers ───────────────────────────────────────────────────────────────────
  const micIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm-1-9c0-.55.45-1 1-1s1 .45 1 1v6c0 .55-.45 1-1 1s-1-.45-1-1V5zm6 6c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/></svg>`;

  function ensureHttps(url: string): string {
    if (!url || typeof url !== 'string') return url;
    return url.replace(/^http:\/\//i, 'https://');
  }

  function normalizeEpisodeCount(d: Record<string, unknown>): number | null {
    const raw = d.episode_count ?? d.episodeCount ?? d.episodes_count ?? d.episodesCount;
    if (typeof raw === 'number' && !Number.isNaN(raw)) return raw;
    if (typeof raw === 'string') {
      const n = parseInt(raw, 10);
      if (!Number.isNaN(n)) return n;
    }
    return null;
  }

  function formatNum(n: number): string {
    return n.toLocaleString('ru-RU');
  }

  function isInLobbyWithOthers(): boolean {
    const roomId = getCurrentRoomId();
    if (!roomId) return false;
    return getCurrentParticipants().length > 1;
  }

  // ── episode list DOM management ───────────────────────────────────────────────
  function buildEpisodeList(eps: Episode[]) {
    if (!episodesListEl) return;
    episodesListEl.innerHTML = '';
    eps.forEach((ep) => {
      const item = document.createElement('button');
      item.type = 'button';
      const isWatched = !!ep.is_watched;
      item.className = 'watch-modal__episode-item' + (isWatched ? ' watch-modal__episode-item--watched' : '');
      item.dataset.position = String(ep.position);

      const numSpan = document.createElement('span');
      numSpan.className = 'watch-modal__episode-num';
      numSpan.textContent = String(ep.position);
      item.appendChild(numSpan);

      if (isWatched) {
        const check = document.createElement('span');
        check.className = 'watch-modal__episode-watched';
        check.title = 'Просмотрено';
        check.textContent = '✓';
        item.appendChild(check);
      }

      item.addEventListener('click', () => {
        episodesListEl?.querySelectorAll('.watch-modal__episode-item--active').forEach((el) => {
          el.classList.remove('watch-modal__episode-item--active');
        });
        item.classList.add('watch-modal__episode-item--active');
        selectedEpisodePos = ep.position;
        handleEpisodePlay(ep.position);

        if (!ep.is_watched && selectedSource) {
          ep.is_watched = true;
          item.classList.add('watch-modal__episode-item--watched', 'watch-modal__episode-item--marking');
          if (!item.querySelector('.watch-modal__episode-watched')) {
            const check = document.createElement('span');
            check.className = 'watch-modal__episode-watched';
            check.title = 'Просмотрено';
            check.textContent = '✓';
            item.appendChild(check);
          }
          const srcId = selectedSource.id;
          window.anixApi?.history?.markWatched?.(releaseId, srcId, ep.position)
            .then(() => { item.classList.remove('watch-modal__episode-item--marking'); })
            .catch(() => {
              ep.is_watched = false;
              item.classList.remove('watch-modal__episode-item--watched', 'watch-modal__episode-item--marking');
              item.querySelector('.watch-modal__episode-watched')?.remove();
            });
        }
      });

      episodesListEl!.appendChild(item);
    });
  }

  function scrollToEpisode(position: number) {
    if (!episodesListEl) return;
    const target = episodesListEl.querySelector<HTMLButtonElement>(`.watch-modal__episode-item[data-position="${position}"]`);
    if (!target) return;
    target.scrollIntoView({ block: 'center', behavior: 'auto' });
    target.classList.add('watch-modal__episode-item--highlight');
    window.setTimeout(() => {
      target?.classList.remove('watch-modal__episode-item--highlight');
    }, 1200);
  }

  // ── source selector ───────────────────────────────────────────────────────────
  function buildSourceSelector(srcs: Source[], currentSrcId: number) {
    if (srcs.length <= 1) {
      sourceSelectOptions = [];
      sourceSelectValue = '';
      return;
    }
    sourceSelectOptions = srcs.map((s) => {
      const srcEp = normalizeEpisodeCount(s as Record<string, unknown>);
      const srcEpText = srcEp != null ? `${srcEp} эп.` : '';
      return { value: String(s.id), label: srcEpText ? `${s.name} (${srcEpText})` : s.name };
    });
    sourceSelectValue = String(currentSrcId);
  }

  function handleSourceSelectChange(value: string) {
    const s = sources.find((x) => String(x.id) === value);
    if (!s) return;
    sourceSelectValue = String(s.id);
    selectSource(s);
  }

  // ── actions ───────────────────────────────────────────────────────────────────
  function handleEpisodePlay(epPosition: number) {
    if (!selectedSource) return;
    const params = {
      releaseId: String(releaseId),
      sourceId: String(selectedSource.id),
      ep: String(epPosition),
      title: releaseTitle,
      sourceName: selectedDubber ? selectedDubber.name : selectedSource.name,
      ...(selectedDubber ? { dubberId: String(selectedDubber.id) } : {}),
    };

    const doOpenPlayer = () => {
      if (!window.electron?.openPlayerWindow) return;
      window.electron.openPlayerWindow(params).then(() => close()).catch(() => {});
    };

    if (isInLobbyWithOthers()) {
      const currentPlayback = getLastPlayback();
      const isDifferentAnime = currentPlayback != null && String(currentPlayback.releaseId) !== String(releaseId);
      if (isDifferentAnime) {
        confirmEpLabel = params.ep;
        confirmCallback = () => {
          proposeAnimeChange(params);
          window.electron?.sendProposalToPlayer?.({
            type: 'waiting',
            newPlayback: { title: releaseTitle, ep: params.ep },
          });
          close();
        };
        showConfirm = true;
      } else {
        doOpenPlayer();
      }
      return;
    }
    doOpenPlayer();
  }

  function selectDubber(dubber: Dubber) {
    selectedDubber = { id: dubber.id, name: dubber.name };
    selectedSource = null;
    selectedEpisodePos = null;
    episodes = [];
    episodesLoading = true;
    episodesLoadText = 'Загрузка серий…';
    episodesError = '';
    currentView = 'episodes';

    const api = window.anixApi;
    if (!api) return;

    api.release.getDubberSources(releaseId, dubber.id)
      .then((res: { sources?: Source[] }) => {
        const srcs = res?.sources ?? [];
        sources = srcs;
        if (srcs.length === 0) {
          episodesLoading = false;
          episodesError = 'Нет источников';
          return;
        }
        buildSourceSelector(srcs, srcs[0].id);
        selectSource(srcs[0]);
      })
      .catch(() => {
        episodesLoading = false;
        episodesError = 'Ошибка загрузки';
      });
  }

  function selectSource(source: Source) {
    selectedSource = { id: source.id, name: source.name };
    selectedEpisodePos = null;
    episodesLoading = true;
    episodesLoadText = 'Загрузка серий…';
    episodesError = '';

    const api = window.anixApi;
    if (!api || !selectedDubber) return;

    api.release.getEpisodes(releaseId, selectedDubber.id, source.id)
      .then((res: { episodes?: Episode[] }) => {
        const eps = res?.episodes ?? [];
        episodes = eps;
        episodesLoading = false;

        // Build episode list imperatively (for watched marking logic)
        setTimeout(() => {
          buildEpisodeList(eps);
          // Auto-scroll to last watched
          let lastWatchedPos: number | null = null;
          for (let i = eps.length - 1; i >= 0; i--) {
            if (eps[i].is_watched) { lastWatchedPos = eps[i].position; break; }
          }
          if (lastWatchedPos != null) {
            setTimeout(() => scrollToEpisode(lastWatchedPos!), 0);
          }
        }, 0);
      })
      .catch(() => {
        episodesLoading = false;
        episodesError = 'Ошибка загрузки серий';
      });
  }

  function handleBack() {
    selectedDubber = null;
    selectedSource = null;
    selectedEpisodePos = null;
    episodes = [];
    sources = [];
    episodesLoading = false;
    episodesError = '';
    currentView = 'sources';
  }

  function handleSearchEpisode() {
    const num = Number(searchInput.trim());
    if (!Number.isFinite(num) || num <= 0) return;
    scrollToEpisode(num);
  }

  function handleLastWatched() {
    if (!episodes.length) return;
    let lastWatched: number | null = null;
    episodes.forEach((ep) => {
      if (ep.is_watched) {
        if (lastWatched == null || ep.position > lastWatched) lastWatched = ep.position;
      }
    });
    if (lastWatched != null) scrollToEpisode(lastWatched);
  }

  function handleConfirmYes() {
    showConfirm = false;
    confirmCallback?.();
    confirmCallback = null;
  }

  function handleConfirmNo() {
    showConfirm = false;
    confirmCallback = null;
  }

  // ── close / keyboard ──────────────────────────────────────────────────────────
  function close() {
    document.body.style.overflow = '';
    onClose();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') close();
  }

  onMount(() => {
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', handleKeydown);

    const api = window.anixApi;
    if (!api?.release?.getDubbers) {
      sourcesLoading = false;
      sourcesError = 'API недоступно';
      return;
    }

    api.release.getDubbers(releaseId)
      .then((res: { types?: Dubber[] }) => {
        const types = res?.types ?? [];
        sourcesLoading = false;
        if (types.length === 0) {
          sourcesError = 'Нет озвучек';
        } else {
          dubbers = types;
        }
      })
      .catch(() => {
        sourcesLoading = false;
        sourcesError = 'Ошибка загрузки';
      });
  });

  onDestroy(() => {
    document.body.style.overflow = '';
    document.removeEventListener('keydown', handleKeydown);
  });
</script>

<div class="watch-modal" role="dialog" aria-modal="true">
  <div
    class="watch-modal__backdrop"
    role="presentation"
    onclick={close}
    onkeydown={undefined}
  ></div>
  <div class="watch-modal__panel">
    <div class="watch-modal__head">
      <h2 class="watch-modal__title">
        {currentView === 'sources' ? 'Выбор озвучки' : 'Выбор эпизода'}
      </h2>
      <button type="button" class="watch-modal__close" aria-label="Закрыть" onclick={close}></button>
    </div>

    <div class="watch-modal__body">
      <!-- Sources view -->
      <div class="watch-modal__view watch-modal__view--sources" hidden={currentView !== 'sources'}>
        <div class="watch-modal__col watch-modal__col--sources">
          <h3 class="watch-modal__col-title">Озвучка</h3>
          {#if sourcesLoading}
            <div class="watch-modal__loading">Загрузка…</div>
          {:else if sourcesError}
            <div class="watch-modal__loading">{sourcesError}</div>
          {:else}
            <Page noPadding extraClass="watch-modal__page">
              <div class="watch-modal__sources-list">
                {#each dubbers as d}
                  {@const viewCountRaw = d.view_count ?? d.viewCount ?? 0}
                  {@const viewCount = typeof viewCountRaw === 'number' ? viewCountRaw : parseInt(String(viewCountRaw), 10) || 0}
                  {@const epCount = normalizeEpisodeCount(d as Record<string, unknown>)}
                  {@const epText = epCount != null ? `${epCount} эп.` : '— эп.'}
                  {@const iconUrl = d.icon ? ensureHttps(String(d.icon)) : ''}
                  <button
                    type="button"
                    class="watch-modal__source-item"
                    onclick={() => selectDubber(d)}
                  >
                    {#if iconUrl}
                      <span class="watch-modal__source-avatar" style="background-image:url({iconUrl})"></span>
                    {:else}
                      <span class="watch-modal__source-avatar watch-modal__source-avatar--mic">{@html micIconSvg}</span>
                    {/if}
                    <span class="watch-modal__source-info">
                      <span class="watch-modal__source-name">{d.name}</span>
                      <span class="watch-modal__source-meta">{formatNum(viewCount)} просмотров · {epText}</span>
                    </span>
                  </button>
                {/each}
              </div>
            </Page>
          {/if}
        </div>
      </div>

      <!-- Episodes view -->
      <div class="watch-modal__view watch-modal__view--episodes" hidden={currentView !== 'episodes'}>
        <div class="watch-modal__back-row">
          <button type="button" class="watch-modal__back" aria-label="Назад к выбору озвучки" onclick={handleBack}>
            ← Назад
          </button>
        </div>

        <div class="watch-modal__episodes-toolbar">
          <div class="watch-modal__episodes-search">
            <input
              type="number"
              min="1"
              class="watch-modal__episodes-search-input"
              placeholder="Найти серию по номеру"
              bind:value={searchInput}
              onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleSearchEpisode(); } }}
            />
            <button type="button" class="watch-modal__episodes-search-btn" onclick={handleSearchEpisode}>
              Найти
            </button>
          </div>
          <button type="button" class="watch-modal__episodes-last-watched-btn" onclick={handleLastWatched}>
            К последней отмеченной
          </button>
        </div>

        {#if sourceSelectOptions.length > 1}
          <div class="watch-modal__source-selector-wrap">
            <Select
              options={sourceSelectOptions}
              value={sourceSelectValue}
              placeholder="Источник"
              onChange={handleSourceSelectChange}
            />
          </div>
        {/if}

        <div class="watch-modal__col watch-modal__col--episodes">
          <h3 class="watch-modal__col-title">
            Серии
            {#if !episodesLoading && !episodesError && episodes.length > 0}
              <span class="watch-modal__col-count">({episodes.length})</span>
            {/if}
          </h3>

          {#if episodesLoading}
            <div class="watch-modal__loading">{episodesLoadText}</div>
          {:else if episodesError}
            <div class="watch-modal__loading">{episodesError}</div>
          {:else}
            <Page noPadding extraClass="watch-modal__page">
              <div class="watch-modal__episodes" bind:this={episodesListEl}></div>
            </Page>
          {/if}
        </div>
      </div>
    </div>

    <!-- Lobby confirmation dialog -->
    {#if showConfirm}
      <div class="watch-modal__confirm">
        <div class="watch-modal__confirm-inner">
          <div class="watch-modal__confirm-title">Предложить серию {confirmEpLabel}?</div>
          <div class="watch-modal__confirm-text">Все участники увидят предложение сменить аниме. Продолжить?</div>
          <div class="watch-modal__confirm-actions">
            <button type="button" class="watch-modal__confirm-btn watch-modal__confirm-btn--secondary" onclick={handleConfirmNo}>
              Отмена
            </button>
            <button type="button" class="watch-modal__confirm-btn watch-modal__confirm-btn--primary" onclick={handleConfirmYes}>
              Предложить
            </button>
          </div>
        </div>
      </div>
    {/if}
  </div>
</div>
