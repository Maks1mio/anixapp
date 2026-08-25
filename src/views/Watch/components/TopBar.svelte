<script lang="ts">
  import type { EpisodeItem, DubberItem, DownloadedEpisodeItem, SourceItem } from '../_types';
  import UiV2Button from '../../../components/uikit-v2/UiV2Button.svelte';
  import UiV2RoundButton from '../../../components/uikit-v2/UiV2RoundButton.svelte';
  import UiV2Tooltip from '../../../components/uikit-v2/UiV2Tooltip.svelte';
  import { fade } from 'svelte/transition';
  import { iconChevronDown, iconLobbyCollapse, iconLobbyCreate, iconLobbyExpand } from '../../../components/icons';
  import EpisodesPopover from './EpisodesPopover.svelte';
  import DubbingPopover from './DubbingPopover.svelte';
  import SourcesPopover from './SourcesPopover.svelte';

  interface Props {
    ep: number;
    title: string;
    dubberName: string;
    sourceName: string;
    useVideo: boolean;
    episodes: EpisodeItem[];
    dubbers: DubberItem[];
    sources: SourceItem[];
    downloadedEpisodes: DownloadedEpisodeItem[];
    downloadedPositions: number[];
    localMode: boolean;
    currentDownloadedPath: string;
    currentDubberId: string;
    currentSourceId: string;
    popoverType: 'series' | 'dubbing' | 'source' | 'settings' | null;
    popoverLoading: boolean;
    lastEpisodeTypeUpdateId: number | null;
    inLobby: boolean;
    sidebarOpen?: boolean;
    onopenSeries: () => void;
    onopenDubbing: () => void;
    onopenSource: () => void;
    onopenLobby?: () => void;
    onselectEp: (ep: number) => void;
    onselectDub: (dub: DubberItem) => void;
    onselectSource: (src: SourceItem) => void;
    onselectDownloadedDub: (dubberName: string) => void;
    ontogglePinDub: (dub: DubberItem) => void | Promise<void>;
    onclosePopover: () => void;
  }

  let {
    ep, title, dubberName, sourceName, useVideo,
    episodes, dubbers, sources,
    downloadedEpisodes, downloadedPositions, localMode, currentDownloadedPath,
    currentDubberId, currentSourceId, popoverType, popoverLoading, lastEpisodeTypeUpdateId,
    inLobby, sidebarOpen = false, onopenSeries, onopenDubbing, onopenSource, onopenLobby,
    onselectEp, onselectDub, onselectSource, onselectDownloadedDub,
    ontogglePinDub, onclosePopover,
  }: Props = $props();

  let seriesAnchor = $state<HTMLDivElement | null>(null);
  let dubbingAnchor = $state<HTMLDivElement | null>(null);
  let sourceAnchor = $state<HTMLDivElement | null>(null);
  let seriesX = $state(0);
  let seriesY = $state(0);
  let dubbingX = $state(0);
  let dubbingY = $state(0);
  let sourceX = $state(0);
  let sourceY = $state(0);

  function pointBelow(el: HTMLElement | null): { x: number; y: number } {
    if (!el) return { x: 0, y: 0 };
    const r = el.getBoundingClientRect();
    return { x: r.left, y: r.bottom };
  }

  function syncPoint(type: 'series' | 'dubbing' | 'source') {
    if (type === 'series') {
      const p = pointBelow(seriesAnchor);
      seriesX = p.x;
      seriesY = p.y;
    } else if (type === 'dubbing') {
      const p = pointBelow(dubbingAnchor);
      dubbingX = p.x;
      dubbingY = p.y;
    } else {
      const p = pointBelow(sourceAnchor);
      sourceX = p.x;
      sourceY = p.y;
    }
  }

  function enterTrigger(type: 'series' | 'dubbing' | 'source') {
    syncPoint(type);
    if (popoverType === type) return;
    if (type === 'series') onopenSeries();
    else if (type === 'dubbing') onopenDubbing();
    else onopenSource();
  }

  function toggleTrigger(type: 'series' | 'dubbing' | 'source', e: MouseEvent) {
    e.stopPropagation();
    if (popoverType === type) {
      onclosePopover();
      return;
    }
    enterTrigger(type);
  }

  const lobbyTip = $derived(
    !inLobby ? 'Создать комнату' : sidebarOpen ? 'Свернуть панель' : 'Развернуть панель',
  );
  const lobbyIcon = $derived(
    !inLobby ? iconLobbyCreate(18) : sidebarOpen ? iconLobbyCollapse(18) : iconLobbyExpand(18),
  );
  const episodeLabel = $derived(`${ep} серия`);
  const dubLabel = $derived(dubberName || 'Озвучка');
  const sourceLabel = $derived.by(() => {
    if (localMode) return sourceName || 'Источник';
    const fromList = sources.find((s) => String(s.id) === String(currentSourceId));
    if (fromList?.name) return fromList.name;
    if (sourceName && sourceName !== dubberName) return sourceName;
    return 'Источник';
  });
</script>

<div class="watch-page__top-bar">
  <div class="watch-page__top-main">
    <h1 class="watch-page__title">{title}</h1>
    <div class="watch-page__selects">
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        bind:this={dubbingAnchor}
        class="watch-page__popover-anchor"
        onmouseenter={() => enterTrigger('dubbing')}
      >
        <UiV2Button
          size="sm"
          variant="chrome"
          label={dubLabel}
          ariaHaspopup="menu"
          ariaExpanded={popoverType === 'dubbing'}
          onclick={(e) => toggleTrigger('dubbing', e)}
        >
          {#snippet trailing()}{@html iconChevronDown(14)}{/snippet}
        </UiV2Button>
      </div>

      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        bind:this={sourceAnchor}
        class="watch-page__popover-anchor"
        onmouseenter={() => enterTrigger('source')}
      >
        <UiV2Button
          size="sm"
          variant="chrome"
          label={sourceLabel}
          ariaHaspopup="menu"
          ariaExpanded={popoverType === 'source'}
          onclick={(e) => toggleTrigger('source', e)}
        >
          {#snippet trailing()}{@html iconChevronDown(14)}{/snippet}
        </UiV2Button>
      </div>

      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        bind:this={seriesAnchor}
        class="watch-page__popover-anchor"
        onmouseenter={() => enterTrigger('series')}
      >
        <UiV2Button
          size="sm"
          variant="chrome"
          label={episodeLabel}
          ariaHaspopup="menu"
          ariaExpanded={popoverType === 'series'}
          onclick={(e) => toggleTrigger('series', e)}
        >
          {#snippet trailing()}{@html iconChevronDown(14)}{/snippet}
        </UiV2Button>
      </div>
    </div>
    {#if !useVideo}
      <p class="watch-page__dub-hint">Если не загружается — выберите другую озвучку или источник.</p>
    {/if}
  </div>

  {#if onopenLobby && (!localMode || inLobby)}
    <UiV2Tooltip text={lobbyTip} placement="bottom" showDelay={80}>
      <UiV2RoundButton
        size="md"
        label={lobbyTip}
        class={inLobby ? 'watch-page__lobby-btn watch-page__lobby-btn--on' : 'watch-page__lobby-btn'}
        ariaExpanded={inLobby ? sidebarOpen : undefined}
        onclick={(e) => { e.stopPropagation(); onopenLobby(); }}
      >
        {#key lobbyTip}
          <span class="watch-page__lobby-icon" in:fade={{ duration: 160 }}>
            {@html lobbyIcon}
          </span>
        {/key}
      </UiV2RoundButton>
    </UiV2Tooltip>
  {/if}
</div>

<DubbingPopover
  open={popoverType === 'dubbing'}
  x={dubbingX}
  y={dubbingY}
  anchor={dubbingAnchor}
  {dubbers}
  {downloadedEpisodes}
  {currentDownloadedPath}
  hideDownloaded={inLobby}
  {currentDubberId}
  currentDubberName={dubberName}
  {lastEpisodeTypeUpdateId}
  loading={popoverLoading && popoverType === 'dubbing'}
  onselect={(dub) => { onselectDub(dub); onclosePopover(); }}
  onselectDownloadedDub={(name) => { onselectDownloadedDub(name); onclosePopover(); }}
  ontogglePin={ontogglePinDub}
  onclose={onclosePopover}
/>

<SourcesPopover
  open={popoverType === 'source'}
  x={sourceX}
  y={sourceY}
  anchor={sourceAnchor}
  {sources}
  currentSourceName={sourceName}
  {currentSourceId}
  loading={popoverLoading && popoverType === 'source'}
  onselect={(src) => { onselectSource(src); onclosePopover(); }}
  onclose={onclosePopover}
/>

<EpisodesPopover
  open={popoverType === 'series'}
  x={seriesX}
  y={seriesY}
  anchor={seriesAnchor}
  {episodes}
  {downloadedPositions}
  {localMode}
  currentEp={ep}
  loading={popoverLoading && popoverType === 'series'}
  onselect={(next) => { onselectEp(next); onclosePopover(); }}
  onclose={onclosePopover}
/>
