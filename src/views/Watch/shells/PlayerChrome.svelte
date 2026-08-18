<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { EpisodeItem, DubberItem, DownloadedEpisodeItem, NextEpAltDub, PopoverType } from '../_types';
  import type { Anime4kIntensity, Anime4kType } from '../core/anime4k-presets';
  import ControlsBar from '../components/ControlsBar.svelte';
  import ActionsBar from '../components/ActionsBar.svelte';
  import TopBar from '../components/TopBar.svelte';
  import CenterPlay from '../components/CenterPlay.svelte';

  export interface PlayerChromeProps {
    overlayVisible: boolean;
    ep: number;
    title: string;
    dubberName: string;
    sourceName: string;
    useVideo: boolean;
    hasPrevEp: boolean;
    hasNextEp: boolean;
    prevEp: number | null;
    nextEp: number | null;
    nextEpAltDub: NextEpAltDub | null;
    currentDubLabel: string;
    paused: boolean;
    currentTime: string;
    totalTime: string;
    progressPct: number;
    bufferedPct: number;
    muted: boolean;
    volume: number;
    isFullscreen: boolean;
    episodes: EpisodeItem[];
    dubbers: DubberItem[];
    downloadedEpisodes: DownloadedEpisodeItem[];
    downloadedPositions: number[];
    localMode: boolean;
    currentDownloadedPath: string;
    currentDubberId: string;
    popoverType: PopoverType;
    popoverLoading: boolean;
    gpuAvailable: boolean;
    upscaleEnabled: boolean;
    upscaleType: Anime4kType;
    upscaleIntensity: Anime4kIntensity;
    playbackRate: number;
    aspectRatio: string;
    availableQualities: Record<string, string>;
    currentQuality: string;
    speedLocked: boolean;
    lastEpisodeTypeUpdateId: number | null;
    onprevEp: () => void;
    onnextEp: () => void;
    onnextAltDub: (alt: NextEpAltDub) => void;
    ontogglePlay: () => void;
    onplay: () => void;
    onseek: (e: MouseEvent) => void;
    ontoggleMute: () => void;
    onvolumechange: (e: Event) => void;
    onchangeAnime4k: (type: Anime4kType, intensity: Anime4kIntensity) => void;
    onskipOpening: () => void;
    onopenSeries: () => void;
    onopenDubbing: () => void;
    onopenSettings: () => void;
    onselectEp: (ep: number) => void;
    onselectDub: (dub: DubberItem) => void;
    onselectDownloadedMode: () => void;
    ontogglePinDub: (dub: DubberItem) => void | Promise<void>;
    onclosePopover: () => void;
    onfullscreen: () => void;
    onchangeRate: (r: number) => void;
    onchangeAspect: (a: string) => void;
    onchangeQuality: (q: string) => void;
    inLobby?: boolean;
    onopenLobby?: () => void;
    lobby?: Snippet;
  }

  let { lobby, ...props }: PlayerChromeProps = $props();
</script>

<div class="watch-page__gui-overlay">
  <TopBar
    ep={props.ep}
    title={props.title}
    dubberName={props.dubberName}
    sourceName={props.sourceName}
    useVideo={props.useVideo}
    hasPrevEp={props.hasPrevEp}
    hasNextEp={props.hasNextEp}
    prevEp={props.prevEp}
    nextEp={props.nextEp}
    nextEpAltDub={props.nextEpAltDub}
    currentDubLabel={props.currentDubLabel}
    onprevEp={props.onprevEp}
    onnextEp={props.onnextEp}
    onnextAltDub={props.onnextAltDub}
  />

  <div
    class="watch-page__tap-layer"
    role="button"
    tabindex="0"
    onclick={props.ontogglePlay}
    onkeydown={(e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        props.ontogglePlay();
      }
    }}
  ></div>

  {@render lobby?.()}

  <CenterPlay paused={props.paused} onplay={props.onplay} />

  <div class="watch-page__bottom-controls">
    <ControlsBar
      currentTime={props.currentTime}
      totalTime={props.totalTime}
      progressPct={props.progressPct}
      bufferedPct={props.bufferedPct}
      onseek={props.onseek}
    />
    <ActionsBar
      paused={props.paused}
      muted={props.muted}
      volume={props.volume}
      isFullscreen={props.isFullscreen}
      episodes={props.episodes}
      dubbers={props.dubbers}
      downloadedEpisodes={props.downloadedEpisodes}
      downloadedPositions={props.downloadedPositions}
      localMode={props.localMode}
      currentDownloadedPath={props.currentDownloadedPath}
      currentEp={props.ep}
      currentDubberId={props.currentDubberId}
      popoverType={props.popoverType}
      popoverLoading={props.popoverLoading}
      useVideo={props.useVideo}
      gpuAvailable={props.gpuAvailable}
      upscaleEnabled={props.upscaleEnabled}
      upscaleType={props.upscaleType}
      upscaleIntensity={props.upscaleIntensity}
      playbackRate={props.playbackRate}
      aspectRatio={props.aspectRatio}
      availableQualities={props.availableQualities}
      currentQuality={props.currentQuality}
      speedLocked={props.speedLocked}
      lastEpisodeTypeUpdateId={props.lastEpisodeTypeUpdateId}
      ontogglePlay={props.ontogglePlay}
      ontoggleMute={props.ontoggleMute}
      onvolumechange={props.onvolumechange}
      onchangeAnime4k={props.onchangeAnime4k}
      onskipOpening={props.onskipOpening}
      onopenSeries={props.onopenSeries}
      onopenDubbing={props.onopenDubbing}
      onopenSettings={props.onopenSettings}
      onselectEp={props.onselectEp}
      onselectDub={props.onselectDub}
      onselectDownloadedMode={props.onselectDownloadedMode}
      ontogglePinDub={props.ontogglePinDub}
      onclosePopover={props.onclosePopover}
      onfullscreen={props.onfullscreen}
      onchangeRate={props.onchangeRate}
      onchangeAspect={props.onchangeAspect}
      onchangeQuality={props.onchangeQuality}
      inLobby={props.inLobby}
      onopenLobby={props.onopenLobby}
    />
  </div>
</div>
