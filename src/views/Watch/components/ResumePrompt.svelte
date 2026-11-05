<script lang="ts">
  import UiV2Button from '../../../components/uikit-v2/UiV2Button.svelte';
  import { fmtTime } from '../_utils';

  interface Props {
    position: number;
    duration: number;
    onaccept: () => void;
    ondecline: () => void;
  }

  let { position, duration, onaccept, ondecline }: Props = $props();

  const pct = $derived(duration > 0 ? Math.min(100, (position / duration) * 100) : 0);

  function focusFirstButton(el: HTMLElement) {
    el.querySelector('button')?.focus();
  }
</script>

<!-- Handlers only keep clicks from reaching the video under the card. -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<div
  class="resume-prompt"
  role="dialog"
  tabindex="-1"
  aria-label="Продолжить просмотр"
  onclick={(e) => e.stopPropagation()}
  onpointerdown={(e) => e.stopPropagation()}
>
  <div class="resume-prompt__text">
    <strong class="resume-prompt__title">Продолжить с {fmtTime(position)}?</strong>
    <span class="resume-prompt__sub">Вы остановились на {fmtTime(position)} из {fmtTime(duration)}</span>
  </div>
  <div class="resume-prompt__bar" aria-hidden="true">
    <span class="resume-prompt__bar-fill" style:width="{pct}%"></span>
  </div>
  <div class="resume-prompt__actions" use:focusFirstButton>
    <UiV2Button label="Продолжить" variant="primary" block onclick={onaccept} />
    <UiV2Button label="С начала" block onclick={ondecline} />
  </div>
</div>

<style>
  .resume-prompt {
    position: absolute;
    left: 50%;
    bottom: clamp(6.75rem, 15vh, 10rem);
    z-index: 13;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    width: min(calc(100% - 2rem), 22rem);
    padding: 1rem;
    border: 1px solid color-mix(in srgb, #fff 10%, transparent);
    border-radius: 1.1rem;
    background: color-mix(in srgb, #141414 92%, transparent);
    box-shadow: 0 16px 40px color-mix(in srgb, #000 50%, transparent);
    color: #fff;
    transform: translateX(-50%);
    animation: resume-prompt-in 0.28s cubic-bezier(0.22, 1, 0.36, 1) both;
  }

  .resume-prompt__text {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }

  .resume-prompt__title {
    font-size: 1rem;
    font-weight: 650;
  }

  .resume-prompt__sub {
    font-size: 0.82rem;
    color: color-mix(in srgb, #fff 62%, transparent);
  }

  .resume-prompt__bar {
    overflow: hidden;
    height: 4px;
    border-radius: 999px;
    background: color-mix(in srgb, #fff 16%, transparent);
  }

  .resume-prompt__bar-fill {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: var(--uikit-v2-accent, #e65454);
  }

  .resume-prompt__actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.5rem;
  }

  @keyframes resume-prompt-in {
    from { opacity: 0; transform: translate(-50%, 8px); }
    to { opacity: 1; transform: translate(-50%, 0); }
  }

  @media (prefers-reduced-motion: reduce) {
    .resume-prompt {
      animation: none;
    }
  }
</style>
