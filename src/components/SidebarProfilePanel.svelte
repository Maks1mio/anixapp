<script lang="ts">
  import { fly } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { iconX } from './icons';
  import {
    profilePanelBack,
    profilePanelForward,
    profilePanelGoTo,
    profilePanelHistory,
    profilePanelHistoryIndex,
    profilePanelInnerView,
  } from '../stores/profile-panel';
  import ProfilePanelBlock from './ProfilePanelBlock.svelte';
  import UiV2PillBar from './uikit-v2/UiV2PillBar.svelte';
  import UiV2RoundButton from './uikit-v2/UiV2RoundButton.svelte';

  interface Props {
    userId: number;
    onClose: () => void;
  }

  let { userId, onClose }: Props = $props();

  let slideReady = $state(false);

  const history = $derived($profilePanelHistory);
  const historyIndex = $derived($profilePanelHistoryIndex);
  const innerView = $derived($profilePanelInnerView);

  const slides = $derived(
    history.length
      ? history
      : [{ id: userId, login: '' }],
  );
  const activeIndex = $derived(history.length ? historyIndex : 0);
  const multi = $derived(slides.length > 1);
  /** Крошки скрываем на внутренних экранах — иначе перекрывают «назад». */
  const showHistoryNav = $derived(multi && innerView === 'overview');

  const pillItems = $derived(
    slides.map((entry, i) => ({
      id: `${i}-${entry.id}`,
      label: entry.login || `id ${entry.id}`,
    })),
  );

  const trackStyle = $derived(
    `transform:translate3d(${-activeIndex * 100}%,0,0)`,
  );

  $effect(() => {
    const id = requestAnimationFrame(() => {
      slideReady = true;
    });
    return () => cancelAnimationFrame(id);
  });
</script>

<div
  class="profile-panel"
  role="dialog"
  aria-label="Профиль"
>
  <header class="profile-panel__chrome" class:profile-panel__chrome--multi={showHistoryNav}>
    {#if showHistoryNav}
      <div class="profile-panel__nav-slot" transition:fly={{ y: -10, duration: 300, easing: cubicOut }}>
        <UiV2PillBar
          items={pillItems}
          {activeIndex}
          onBack={() => profilePanelBack()}
          onForward={() => profilePanelForward()}
          onSelect={(i) => profilePanelGoTo(i)}
        />
      </div>
    {/if}

    <div class="profile-panel__close">
      <UiV2RoundButton label="Закрыть" onclick={onClose}>
        {@html iconX(18)}
      </UiV2RoundButton>
    </div>
  </header>

  <div class="profile-panel__viewport">
    <div
      class="profile-panel__track"
      class:profile-panel__track--ready={slideReady}
      style={trackStyle}
    >
      {#each slides as entry, i (`${i}-${entry.id}`)}
        <div class="profile-panel__slide">
          <ProfilePanelBlock userId={entry.id} active={i === activeIndex} />
        </div>
      {/each}
    </div>
  </div>
</div>
