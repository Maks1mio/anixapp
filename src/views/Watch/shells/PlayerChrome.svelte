<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { EpisodeItem, DubberItem, DownloadedEpisodeItem, NextEpAltDub, PopoverType, SourceItem } from '../_types';
  import type { Anime4kIntensity, Anime4kTargetRes, Anime4kType } from '../core/anime4k-presets';
  import type { SurroundMode, EqGains, EqBandId } from '../core/surround-audio';
  import type { SkipMarkKind, TimelineSausage } from '../_skipMarks';
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
    bufferedRanges?: { startPct: number; endPct: number }[];
    duration?: number;
    sausages?: TimelineSausage[];
    skipPrompt?: SkipMarkKind | null;
    skipNextEp?: number | null;
    skipCountdownPct?: number;
    watchCountdownPct?: number;
    muted: boolean;
    volume: number;
    isFullscreen: boolean;
    episodes: EpisodeItem[];
    dubbers: DubberItem[];
    sources: SourceItem[];
    downloadedEpisodes: DownloadedEpisodeItem[];
    downloadedPositions: number[];
    localMode: boolean;
    currentDownloadedPath: string;
    currentDubberId: string;
    currentSourceId: string;
    popoverType: PopoverType;
    popoverLoading: boolean;
    gpuAvailable: boolean;
    upscaleEnabled: boolean;
    upscaleType: Anime4kType;
    upscaleIntensity: Anime4kIntensity;
    upscaleTargetRes: Anime4kTargetRes;
    playbackRate: number;
    aspectRatio: string;
    surroundMode: SurroundMode;
    eqGains: EqGains;
    eqLevel: number;
    availableQualities: Record<string, string>;
    currentQuality: string;
    speedLocked: boolean;
    lastEpisodeTypeUpdateId: number | null;
    seekSeconds: number;
    onprevEp: () => void;
    onnextEp: () => void;
    onnextAltDub: (alt: NextEpAltDub) => void;
    ontogglePlay: () => void;
    onplay: () => void;
    onseek: (e: MouseEvent) => void;
    /** Mute — тот же on* паттерн, что ontogglePlay (spread через SoloShell). */
    ontoggleMute: () => void;
    onvolumechange: (e: Event) => void;
    onchangeAnime4k: (type: Anime4kType, intensity: Anime4kIntensity) => void;
    onchangeAnime4kTargetRes: (res: Anime4kTargetRes) => void;
    onskipMark: () => void;
    onwatchSkip: () => void;
    onopenSeries: () => void;
    onopenDubbing: () => void;
    onopenSource: () => void;
    onopenSettings: () => void;
    onselectEp: (ep: number) => void;
    onselectDub: (dub: DubberItem) => void;
    onselectSource: (src: SourceItem) => void;
    onselectDownloadedDub: (dubberName: string) => void;
    ontogglePinDub: (dub: DubberItem) => void | Promise<void>;
    onclosePopover: () => void;
    onfullscreen: () => void;
    onchangeRate: (r: number) => void;
    onchangeAspect: (a: string) => void;
    onchangeSurround: (mode: SurroundMode) => void;
    onchangeEq: (band: EqBandId, gainDb: number) => void;
    onchangeEqLevel: (gainDb: number) => void;
    onresetEq: () => void;
    onchangeQuality: (q: string) => void;
    onseekBack: () => void;
    onseekForward: () => void;
    inLobby?: boolean;
    sidebarOpen?: boolean;
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
    episodes={props.episodes}
    dubbers={props.dubbers}
    sources={props.sources}
    downloadedEpisodes={props.downloadedEpisodes}
    downloadedPositions={props.downloadedPositions}
    localMode={props.localMode}
    currentDownloadedPath={props.currentDownloadedPath}
    currentDubberId={props.currentDubberId}
    currentSourceId={props.currentSourceId}
    popoverType={props.popoverType}
    popoverLoading={props.popoverLoading}
    lastEpisodeTypeUpdateId={props.lastEpisodeTypeUpdateId}
    inLobby={props.inLobby === true}
    sidebarOpen={props.sidebarOpen === true}
    onopenSeries={props.onopenSeries}
    onopenDubbing={props.onopenDubbing}
    onopenSource={props.onopenSource}
    onopenLobby={props.onopenLobby}
    onselectEp={props.onselectEp}
    onselectDub={props.onselectDub}
    onselectSource={props.onselectSource}
    onselectDownloadedDub={props.onselectDownloadedDub}
    ontogglePinDub={props.ontogglePinDub}
    onclosePopover={props.onclosePopover}
  />

  <div
    class="watch-page__tap-layer"
    role="presentation"
    onclick={(e) => {
      props.ontogglePlay();
      // Не оставляем фокус на зоне клика — иначе Space срабатывает дважды.
      const ae = document.activeElement;
      if (ae instanceof HTMLElement && (ae === e.currentTarget || e.currentTarget.contains(ae))) {
        ae.blur();
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
      bufferedRanges={props.bufferedRanges ?? []}
      duration={props.duration ?? 0}
      sausages={props.sausages ?? []}
      skipPrompt={props.skipPrompt ?? null}
      skipNextEp={props.skipNextEp ?? null}
      skipCountdownPct={props.skipCountdownPct ?? 0}
      watchCountdownPct={props.watchCountdownPct ?? 0}
      onseek={props.onseek}
      onskipMark={props.onskipMark}
      onwatchSkip={props.onwatchSkip}
    />
    <ActionsBar
      paused={props.paused}
      muted={props.muted}
      volume={props.volume}
      isFullscreen={props.isFullscreen}
      popoverType={props.popoverType}
      useVideo={props.useVideo}
      gpuAvailable={props.gpuAvailable}
      upscaleEnabled={props.upscaleEnabled}
      upscaleType={props.upscaleType}
      upscaleIntensity={props.upscaleIntensity}
      upscaleTargetRes={props.upscaleTargetRes}
      playbackRate={props.playbackRate}
      aspectRatio={props.aspectRatio}
      surroundMode={props.surroundMode}
      eqGains={props.eqGains}
      eqLevel={props.eqLevel}
      availableQualities={props.availableQualities}
      currentQuality={props.currentQuality}
      speedLocked={props.speedLocked}
      currentTime={props.currentTime}
      totalTime={props.totalTime}
      seekSeconds={props.seekSeconds}
      ontogglePlay={props.ontogglePlay}
      ontoggleMute={props.ontoggleMute}
      onvolumechange={props.onvolumechange}
      onchangeAnime4k={props.onchangeAnime4k}
      onchangeAnime4kTargetRes={props.onchangeAnime4kTargetRes}
      onopenSettings={props.onopenSettings}
      onclosePopover={props.onclosePopover}
      onfullscreen={props.onfullscreen}
      onchangeRate={props.onchangeRate}
      onchangeAspect={props.onchangeAspect}
      onchangeSurround={props.onchangeSurround}
      onchangeEq={props.onchangeEq}
      onchangeEqLevel={props.onchangeEqLevel}
      onresetEq={props.onresetEq}
      onchangeQuality={props.onchangeQuality}
      onseekBack={props.onseekBack}
      onseekForward={props.onseekForward}
    />
  </div>
</div>
