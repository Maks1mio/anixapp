<script lang="ts">
  import type { Snippet } from 'svelte';
  import { onMount } from 'svelte';
  import { iconChevronLeft } from './icons';
  import UiV2RoundButton from './uikit-v2/UiV2RoundButton.svelte';
  import { isMobileMode } from '../platform/mobile';

  interface Props {
    title: string;
    subtitle?: string;
    backLabel?: string;
    onBack?: () => void;
    actions?: Snippet;
    /** Аватар слева от заголовка (страница чужого профиля: «Коллекции» пользователя) */
    avatarUrl?: string;
    /** Клик по аватару / заголовку — открыть профиль */
    onTitleClick?: () => void;
    /** Ник в строке под заголовком (жирным, как в шапке закладок): «ник · subtitle» */
    login?: string;
    /** Полоса под заголовком (вкладки) — при прокрутке закрепляется у верхнего края */
    children?: Snippet;
  }

  let { title, subtitle, backLabel = 'Назад', onBack, actions, avatarUrl, onTitleClick, login, children }: Props = $props();

  /** Шапка ушла под верхний край — показываем её полосу поверх контента */
  let docked = $state(false);
  let heroEl: HTMLElement | undefined = $state();
  let dockEl: HTMLElement | undefined = $state();
  let barEl: HTMLElement | undefined = $state();

  onMount(() => {
    if (!heroEl || !dockEl || !barEl) return;
    const hero = heroEl;
    const dock = dockEl;
    const bar = barEl;
    const root = (hero.closest('.page__scroll') as HTMLElement | null)
      ?? document.getElementById('content');
    // Панель не меняет раскладку (лежит поверх), поэтому прокрутка не дёргается.
    // Она появляется, когда низ настоящих вкладок дошёл до её низа. Место панели берётся по факту:
    // на телефоне верхняя панель уезжает и закреплённые вкладки поднимаются под строку состояния,
    // а порог, замеренный один раз, давал две полосы вкладок или пустоту до «стыковки».
    const fallbackH = isMobileMode() ? 48 : 52;
    let frame = 0;
    const update = () => {
      frame = 0;
      const barBottom = bar.getBoundingClientRect().top + (bar.offsetHeight || fallbackH);
      docked = hero.getBoundingClientRect().bottom <= barBottom;
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    root?.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    // Верхняя панель уехала/вернулась — вкладки доехали до нового места уже без прокрутки
    dock.addEventListener('transitionend', schedule);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      root?.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      dock.removeEventListener('transitionend', schedule);
    };
  });
</script>

<div class="discover-hero-dock" bind:this={dockEl}>
  <div
    bind:this={barEl}
    class="discover-hero-dock__bar"
    class:discover-hero-dock__bar--visible={docked}
    aria-hidden={!docked}
    inert={!docked}
  >
    {#if children}
      <div class="discover-hero__foot">
        {@render children()}
      </div>
    {/if}
  </div>
</div>

<header class="discover-hero" bind:this={heroEl}>
  <div class="discover-hero__head">
    <div class="discover-hero__lead">
      {#if onBack}
        <UiV2RoundButton label={backLabel} class="discover-hero__back" onclick={onBack}>
          {@html iconChevronLeft(20)}
        </UiV2RoundButton>
      {/if}
      {#if avatarUrl !== undefined}
        <!-- Тот же вид, что у шапки закладок (bm-head): аватар, заголовок, «ник · подпись», подсветка при наведении -->
        <button type="button" class="bm-head__profile discover-hero__profile" onclick={() => onTitleClick?.()}>
          <span
            class="bm-head__avatar"
            style={avatarUrl ? `background-image:url('${avatarUrl}')` : undefined}
            aria-hidden="true"
          ></span>
          <span class="bm-head__text">
            <span class="bm-head__title">{title}</span>
            <span class="bm-head__meta">
              {#if login}<span class="bm-head__login">{login}</span>{/if}
              {#if login && subtitle}<span class="bm-head__dot" aria-hidden="true">·</span>{/if}
              {#if subtitle}<span>{subtitle}</span>{/if}
            </span>
          </span>
        </button>
      {:else}
        <div class="discover-hero__text">
          <h1 class="discover-hero__title">{title}</h1>
          {#if subtitle}
            <p class="discover-hero__subtitle">{subtitle}</p>
          {/if}
        </div>
      {/if}
    </div>
    {#if actions}
      <div class="discover-hero__actions">
        {@render actions()}
      </div>
    {/if}
  </div>

  {#if children}
    <div class="discover-hero__foot">
      {@render children()}
    </div>
  {/if}
</header>
