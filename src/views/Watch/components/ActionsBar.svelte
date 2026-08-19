<script lang="ts">
  import UiV2RoundButton from '../../../components/uikit-v2/UiV2RoundButton.svelte';
  import UiV2Tooltip from '../../../components/uikit-v2/UiV2Tooltip.svelte';
  import SettingsPopover from './SettingsPopover.svelte';
  import type { Anime4kIntensity, Anime4kType } from '../core/anime4k-presets';
  import {
    iconPlay,
    iconPause,
    iconVolume2,
    iconVolume1,
    iconVolume,
    iconVolumeX,
    iconRotateCcw,
    iconRotateCw,
    iconSettings,
    iconMaximize2,
    iconMinimize2,
  } from '../../../components/icons';

  interface Props {
    paused: boolean;
    muted: boolean;
    volume: number;
    isFullscreen: boolean;
    popoverType: 'series' | 'dubbing' | 'source' | 'settings' | null;
    useVideo: boolean;
    gpuAvailable: boolean;
    upscaleEnabled: boolean;
    upscaleType: Anime4kType;
    upscaleIntensity: Anime4kIntensity;
    playbackRate: number;
    aspectRatio: string;
    availableQualities: Record<string, string>;
    currentQuality: string;
    speedLocked?: boolean;
    currentTime: string;
    totalTime: string;
    seekSeconds: number;
    ontogglePlay: () => void;
    ontoggleMute: () => void;
    onvolumechange: (e: Event) => void;
    onchangeAnime4k: (type: Anime4kType, intensity: Anime4kIntensity) => void;
    onopenSettings: () => void;
    onclosePopover: () => void;
    onfullscreen: () => void;
    onchangeRate: (r: number) => void;
    onchangeAspect: (a: string) => void;
    onchangeQuality: (q: string) => void;
    onseekBack: () => void;
    onseekForward: () => void;
  }

  let {
    paused, muted, volume, isFullscreen, popoverType, useVideo,
    gpuAvailable, upscaleEnabled, upscaleType, upscaleIntensity,
    playbackRate, aspectRatio, availableQualities, currentQuality,
    speedLocked = false, currentTime, totalTime, seekSeconds,
    ontogglePlay, ontoggleMute, onvolumechange, onchangeAnime4k,
    onopenSettings, onclosePopover, onfullscreen,
    onchangeRate, onchangeAspect, onchangeQuality,
    onseekBack, onseekForward,
  }: Props = $props();

  const sliderValue = $derived(muted ? 0 : volume);
  const volumeIcon = $derived.by(() => {
    if (muted || volume === 0) return iconVolumeX(18);
    if (volume < 33) return iconVolume(18);
    if (volume < 66) return iconVolume1(18);
    return iconVolume2(18);
  });

  let settingsAnchor = $state<HTMLDivElement | null>(null);
  let settingsX = $state(0);
  let settingsY = $state(0);

  function syncSettingsPoint() {
    const el = settingsAnchor;
    if (!el) return;
    const r = el.getBoundingClientRect();
    settingsX = r.right;
    settingsY = r.top;
  }

  function enterSettings() {
    syncSettingsPoint();
    if (popoverType !== 'settings') onopenSettings();
  }

  function toggleSettings(e: MouseEvent) {
    e.stopPropagation();
    if (popoverType === 'settings') {
      onclosePopover();
      return;
    }
    enterSettings();
  }

  /** Не даём клику по громкости всплыть до плеера (play/pause), без a11y-роли на обёртке. */
  function stopPlayerToggle(node: HTMLElement) {
    const stop = (e: Event) => e.stopPropagation();
    node.addEventListener('click', stop);
    node.addEventListener('pointerdown', stop);
    return {
      destroy() {
        node.removeEventListener('click', stop);
        node.removeEventListener('pointerdown', stop);
      },
    };
  }
</script>

<div class="watch-page__btn-row">
  <div class="watch-page__btns-left">
    <UiV2Tooltip text={paused ? 'Воспроизвести' : 'Пауза'} placement="top" showDelay={80}>
      <UiV2RoundButton
        size="md"
        label={paused ? 'Воспроизвести' : 'Пауза'}
        onclick={(e) => { e.stopPropagation(); ontogglePlay(); }}
      >
        {@html paused ? iconPlay(18) : iconPause(18)}
      </UiV2RoundButton>
    </UiV2Tooltip>

    <div class="watch-page__vol-wrap" use:stopPlayerToggle>
      <UiV2Tooltip text={muted ? 'Включить звук' : 'Выключить звук'} placement="top" showDelay={80}>
        <UiV2RoundButton
          size="md"
          label={muted ? 'Включить звук' : 'Выключить звук'}
          onclick={ontoggleMute}
        >
          {@html volumeIcon}
        </UiV2RoundButton>
      </UiV2Tooltip>
      <div class="watch-page__vol-slider-wrap">
        <input type="range" class="watch-page__vol-slider" min="0" max="100" value={sliderValue} oninput={onvolumechange} />
      </div>
    </div>

    {#if useVideo}
      <UiV2Tooltip text={`Назад на ${seekSeconds} с`} placement="top" showDelay={80}>
        <UiV2RoundButton
          size="md"
          label={`Назад на ${seekSeconds} секунд`}
          onclick={(e) => { e.stopPropagation(); onseekBack(); }}
        >
          {@html iconRotateCcw(18)}
        </UiV2RoundButton>
      </UiV2Tooltip>
      <UiV2Tooltip text={`Вперёд на ${seekSeconds} с`} placement="top" showDelay={80}>
        <UiV2RoundButton
          size="md"
          label={`Вперёд на ${seekSeconds} секунд`}
          onclick={(e) => { e.stopPropagation(); onseekForward(); }}
        >
          {@html iconRotateCw(18)}
        </UiV2RoundButton>
      </UiV2Tooltip>
    {/if}
  </div>

  <div class="watch-page__btns-right">
    <span class="watch-page__time-pill" aria-hidden="false">{currentTime} / {totalTime}</span>

    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      bind:this={settingsAnchor}
      class="watch-page__popover-anchor"
      onmouseenter={enterSettings}
    >
      <UiV2RoundButton
        size="md"
        label="Настройки"
        ariaHaspopup="menu"
        ariaExpanded={popoverType === 'settings'}
        onclick={toggleSettings}
      >
        {@html iconSettings(18)}
      </UiV2RoundButton>
    </div>

    <UiV2Tooltip
      text={isFullscreen ? 'Выйти из полного экрана (F)' : 'Полный экран (F)'}
      placement="top"
      showDelay={80}
    >
      <UiV2RoundButton
        size="md"
        label={isFullscreen ? 'Выйти из полного экрана' : 'Полный экран'}
        onclick={(e) => { e.stopPropagation(); onfullscreen(); }}
      >
        {@html isFullscreen ? iconMinimize2(18) : iconMaximize2(18)}
      </UiV2RoundButton>
    </UiV2Tooltip>
  </div>
</div>

<SettingsPopover
  open={popoverType === 'settings'}
  x={settingsX}
  y={settingsY}
  anchor={settingsAnchor}
  {gpuAvailable}
  {upscaleEnabled}
  {upscaleType}
  {upscaleIntensity}
  {playbackRate}
  {aspectRatio}
  {availableQualities}
  {currentQuality}
  {speedLocked}
  {onchangeAnime4k}
  {onchangeRate}
  {onchangeAspect}
  {onchangeQuality}
  onclose={onclosePopover}
/>
