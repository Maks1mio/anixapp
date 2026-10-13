<script lang="ts">
  /** Блокирующий оверлей подготовки M3U для VLC/mpv — только «Отменить». */
  import { fade, scale } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { portal } from '../actions/portal';
  import UiV2Button from './uikit-v2/UiV2Button.svelte';

  interface Props {
    done: number;
    total: number;
    title?: string;
    onCancel: () => void;
  }
  let { done, total, title = 'Подготовка плейлиста', onCancel }: Props = $props();

  const pct = $derived(total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0);
  const status = $derived(
    total > 0 ? `${done} из ${total}` : 'Считаем серии…',
  );

  function onWindowKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onCancel();
    }
  }
</script>

<svelte:window onkeydown={onWindowKeydown} />

<div
  class="epp"
  role="alertdialog"
  aria-modal="true"
  aria-labelledby="epp-title"
  aria-describedby="epp-status"
  aria-busy="true"
  use:portal
  transition:fade={{ duration: 140 }}
>
  <div class="epp__shade" aria-hidden="true"></div>
  <div class="epp__panel" transition:scale={{ duration: 200, start: 0.96, easing: cubicOut }}>
    <h3 id="epp-title" class="epp__title">{title}</h3>
    <p id="epp-status" class="epp__status">{status}</p>
    <div class="epp__bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
      <div class="epp__bar-fill" style={`width:${pct}%`}></div>
    </div>
    <p class="epp__hint">Приложение недоступно, пока готовится плейлист</p>
    <UiV2Button label="Отменить" size="lg" block variant="chrome" onclick={onCancel} />
  </div>
</div>

<style lang="scss">
  .epp {
    position: fixed;
    inset: 0;
    z-index: 10050;
    display: grid;
    place-items: center;
    padding: 1.25rem;
    pointer-events: auto;
  }
  .epp__shade {
    position: absolute;
    inset: 0;
    background: color-mix(in srgb, #000 72%, transparent);
    backdrop-filter: blur(2px);
  }
  .epp__panel {
    position: relative;
    width: min(22rem, 100%);
    padding: 1.25rem 1.15rem 1rem;
    border-radius: 1rem;
    background: var(--uikit-v2-surface, #1c1c1e);
    color: var(--uikit-v2-text, #f2f2f7);
    box-shadow: 0 16px 48px rgba(0, 0, 0, 0.45);
  }
  .epp__title {
    margin: 0 0 0.4rem;
    font-size: 1.05rem;
    font-weight: 650;
  }
  .epp__status {
    margin: 0 0 0.75rem;
    font-size: 0.9rem;
    color: var(--uikit-v2-text-muted, #aeaeb2);
  }
  .epp__bar {
    height: 0.45rem;
    border-radius: 999px;
    background: color-mix(in srgb, var(--uikit-v2-text, #fff) 12%, transparent);
    overflow: hidden;
    margin-bottom: 0.65rem;
  }
  .epp__bar-fill {
    height: 100%;
    border-radius: inherit;
    background: var(--uikit-v2-accent, #ff3b5c);
    transition: width 160ms ease;
  }
  .epp__hint {
    margin: 0 0 1rem;
    font-size: 0.78rem;
    line-height: 1.35;
    color: var(--uikit-v2-text-muted, #aeaeb2);
  }
</style>
