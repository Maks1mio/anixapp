<script lang="ts">
  import UiV2PopupMenu, { type UiV2PopupMenuItem } from '../../../components/uikit-v2/UiV2PopupMenu.svelte';
  import { iconAudioLines, iconSettings, iconSparkles, iconTv } from '../../../components/icons';
  import {
    DEFAULT_PLAYBACK_RATE,
    PLAYBACK_RATE_MAX,
    PLAYBACK_RATE_MIN,
    PLAYBACK_RATE_STEP,
    PLAYBACK_RATE_WARN,
    clampPlaybackRate,
    formatPlaybackRate,
  } from '../../../utils/player-hotkeys';
  import {
    ANIME4K_INTENSITIES,
    ANIME4K_TYPES,
    type Anime4kIntensity,
    type Anime4kType,
  } from '../core/anime4k-presets';
  import {
    SURROUND_GROUPS,
    surroundModeDisplayLabel,
    surroundModeMeta,
    surroundModeShort,
    type EqBandId,
    type EqGains,
    type SurroundMode,
  } from '../core/surround-audio';
  import EqualizerPanel from './EqualizerPanel.svelte';

  interface Props {
    open: boolean;
    x: number;
    y: number;
    anchor?: HTMLElement | null;
    gpuAvailable: boolean;
    upscaleEnabled: boolean;
    upscaleType: Anime4kType;
    upscaleIntensity: Anime4kIntensity;
    playbackRate: number;
    aspectRatio: string;
    surroundMode: SurroundMode;
    eqGains: EqGains;
    eqLevel: number;
    availableQualities: Record<string, string>;
    currentQuality: string;
    speedLocked?: boolean;
    onchangeAnime4k: (type: Anime4kType, intensity: Anime4kIntensity) => void;
    onchangeRate: (r: number) => void;
    onchangeAspect: (a: string) => void;
    onchangeSurround: (mode: SurroundMode) => void;
    onchangeEq: (band: EqBandId, gainDb: number) => void;
    onchangeEqLevel: (gainDb: number) => void;
    onresetEq?: () => void;
    onchangeQuality: (q: string) => void;
    onclose: () => void;
  }

  let {
    open, x, y, anchor = null,
    gpuAvailable, upscaleType, upscaleIntensity,
    playbackRate, aspectRatio, surroundMode, eqGains, eqLevel,
    availableQualities, currentQuality,
    speedLocked = false,
    onchangeAnime4k, onchangeRate, onchangeAspect, onchangeSurround, onchangeEq, onchangeEqLevel, onresetEq,
    onchangeQuality, onclose,
  }: Props = $props();

  const ASPECTS = [
    { value: 'auto', label: 'Авто' },
    { value: '16/9', label: '16:9' },
    { value: '4/3',  label: '4:3'  },
    { value: '21/9', label: '21:9' },
  ];

  const sortedQualities = $derived.by(() => {
    return Object.keys(availableQualities).sort((a, b) => {
      const numA = parseInt(a, 10) || 0;
      const numB = parseInt(b, 10) || 0;
      return numB - numA;
    });
  });

  const hasQualities = $derived(sortedQualities.length > 1);
  const rate = $derived(clampPlaybackRate(playbackRate));

  const items = $derived.by((): UiV2PopupMenuItem[] => {
    const next: UiV2PopupMenuItem[] = [];

    if (hasQualities) {
      next.push({
        id: 'quality',
        label: currentQuality ? `Качество · ${currentQuality}p` : 'Качество',
        icon: iconSettings(18),
        children: sortedQualities.map((q) => ({
          id: `quality:${q}`,
          label: `${q}p`,
          type: 'radio' as const,
          checked: currentQuality === q,
          keepOpen: true,
        })),
      });
    }

    const a4kTypeLabel = ANIME4K_TYPES.find((t) => t.id === upscaleType)?.label;
    next.push({
      id: 'anime4k',
      label: gpuAvailable && upscaleType !== 'off' && a4kTypeLabel ? `Anime4K · ${a4kTypeLabel}` : 'Anime4K',
      icon: iconSparkles(18),
      children: gpuAvailable
        ? [
            ...ANIME4K_TYPES.map((opt, i) => ({
              id: `a4k-type:${opt.id}`,
              label: opt.recommended ? `${opt.label} ★` : opt.label,
              type: 'radio' as const,
              checked: upscaleType === opt.id,
              keepOpen: true,
              dividerBefore: i === 0 ? false : undefined,
            })),
            ...ANIME4K_INTENSITIES.map((opt, i) => ({
              id: `a4k-intensity:${opt.id}`,
              label: opt.label,
              type: 'radio' as const,
              checked: upscaleIntensity === opt.id,
              disabled: upscaleType === 'off',
              keepOpen: true,
              dividerBefore: i === 0,
            })),
          ]
        : [{ id: 'a4k-unavailable', label: 'Нет WebGPU — фильтр недоступен', disabled: true }],
    });

    const aspectLabel = ASPECTS.find((a) => a.value === aspectRatio)?.label;
    next.push({
      id: 'aspect',
      label: aspectLabel ? `Соотношение сторон · ${aspectLabel}` : 'Соотношение сторон',
      icon: iconTv(18),
      children: ASPECTS.map((opt) => ({
        id: `aspect:${opt.value}`,
        label: opt.label,
        type: 'radio' as const,
        checked: aspectRatio === opt.value,
        keepOpen: true,
      })),
    });

    const surroundShort = surroundModeShort(surroundMode);
    const eqOpt = surroundModeMeta('equalizer');
    const surroundChildren: UiV2PopupMenuItem[] = [
      {
        id: 'surround:equalizer',
        label: eqOpt
          ? surroundModeDisplayLabel('equalizer', true)
          : 'Эквалайзер · 2.0',
        type: 'radio',
        checked: surroundMode === 'equalizer',
        keepOpen: true,
        customSubmenu: true,
        submenuWide: true,
      },
      {
        id: 'surround:off',
        label: surroundModeDisplayLabel('off'),
        type: 'radio',
        checked: surroundMode === 'off',
        keepOpen: true,
      },
      ...SURROUND_GROUPS.flatMap((group, gi) => {
        const rows: UiV2PopupMenuItem[] = [
          {
            id: `surround-group:${group.label}`,
            label: group.label,
            type: 'label',
            dividerBefore: gi === 0,
          },
        ];
        for (const id of group.modes) {
          const opt = surroundModeMeta(id);
          if (!opt) continue;
          rows.push({
            id: `surround:${opt.id}`,
            label: surroundModeDisplayLabel(opt.id, true),
            type: 'radio',
            checked: surroundMode === opt.id,
            keepOpen: true,
          });
        }
        return rows;
      }),
    ];

    next.push({
      id: 'surround',
      label: surroundShort ? `Объёмный звук · ${surroundShort}` : 'Объёмный звук',
      icon: iconAudioLines(18),
      children: surroundChildren,
    });

    next.push({
      id: 'playback-rate',
      label: 'Скорость',
      type: 'slider',
      value: rate,
      valueText: formatPlaybackRate(rate),
      min: PLAYBACK_RATE_MIN,
      max: PLAYBACK_RATE_MAX,
      step: PLAYBACK_RATE_STEP,
      minLabel: `${PLAYBACK_RATE_MIN}×`,
      maxLabel: `${PLAYBACK_RATE_MAX}×`,
      warnAt: PLAYBACK_RATE_WARN,
      warnText: speedLocked
        ? 'В совместном просмотре скорость всегда 1×.'
        : 'Выше 2× плеер может не успевать буферизировать видео.',
      showReset: true,
      resetValue: DEFAULT_PLAYBACK_RATE,
      disabled: speedLocked,
      keepOpen: true,
      dividerBefore: true,
    });

    return next;
  });

  function onSelect(id: string) {
    if (id.startsWith('quality:')) {
      onchangeQuality(id.slice('quality:'.length));
      return;
    }
    if (id.startsWith('a4k-type:')) {
      onchangeAnime4k(id.slice('a4k-type:'.length) as Anime4kType, upscaleIntensity);
      return;
    }
    if (id.startsWith('a4k-intensity:')) {
      onchangeAnime4k(upscaleType, id.slice('a4k-intensity:'.length) as Anime4kIntensity);
      return;
    }
    if (id.startsWith('aspect:')) {
      onchangeAspect(id.slice('aspect:'.length));
      return;
    }
    if (id.startsWith('surround:')) {
      onchangeSurround(id.slice('surround:'.length) as SurroundMode);
    }
  }

  function onMenuValueChange(id: string, value: number) {
    if (id === 'playback-rate') onchangeRate(value);
  }
</script>

<UiV2PopupMenu
  {open}
  {x}
  {y}
  {anchor}
  {items}
  wide
  placement="anchor"
  onClose={onclose}
  onSelect={onSelect}
  onValueChange={onMenuValueChange}
>
  {#snippet submenuContent(item)}
    {#if item.id === 'surround:equalizer'}
      <EqualizerPanel
        gains={eqGains}
        level={eqLevel}
        onchange={onchangeEq}
        onchangeLevel={onchangeEqLevel}
        onreset={onresetEq}
      />
    {/if}
  {/snippet}
</UiV2PopupMenu>
