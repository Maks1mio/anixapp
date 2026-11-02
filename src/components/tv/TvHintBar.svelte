<script lang="ts">
  import { onMount } from 'svelte';
  import TvInputGlyph, { type TvGlyphButton } from './TvInputGlyph.svelte';
  import { tvGamepadCaptureActive, tvGamepadSeen, tvInputDevice, tvSystemMenuOpen } from '../../services/tv-input';
  import { isTvOverlayOpen, isTvRailEngaged, TV_LONGPRESS_ACTIVE_ATTR, TV_LONGPRESS_ATTR } from '../../services/tv-navigation';
  import { isBigPictureMode, isTvBuild } from '../../platform/tv';
  import { isTvShellPath } from '../../tv/nav';
  import { getPath } from '../../router';

  interface Props {
    /** Плеер — полоса подсказок не нужна. */
    hidden?: boolean;
  }

  let { hidden = false }: Props = $props();

  type Hint = { id: string; buttons: TvGlyphButton[]; label: string; hold?: boolean; filling?: boolean };

  // Страница пары для телефона (?ref=…) — не TV-экран.
  const pairPage = new URLSearchParams(window.location.search).has('ref');
  const enabled = !pairPage && (isBigPictureMode() || isTvBuild());
  const visible = $derived(!hidden && (enabled || $tvGamepadSeen));

  // Контекст (маршрут, фокус, диалоги) живёт в DOM — пересчитываем по событиям.
  let revision = $state(0);
  let bumpQueued = 0;
  const bump = () => {
    if (bumpQueued) return;
    bumpQueued = window.requestAnimationFrame(() => {
      bumpQueued = 0;
      revision += 1;
    });
  };

  function holdHint(): Hint | null {
    const focused = document.activeElement;
    if (!(focused instanceof HTMLElement) || !focused.hasAttribute(TV_LONGPRESS_ATTR)) return null;
    const label = focused.dataset.tvLongpressHint || 'Доп. действие';
    return { id: 'hold', buttons: ['select'], label, hold: true, filling: focused.hasAttribute(TV_LONGPRESS_ACTIVE_ATTR) };
  }

  const hints = $derived.by((): { left: Hint[]; right: Hint[] } => {
    void revision;
    const remote = $tvInputDevice === 'remote';
    const nav: Hint[] = remote ? [{ id: 'nav', buttons: ['navigate'], label: 'Навигация' }] : [];
    const menu: Hint[] = remote ? [] : [{ id: 'menu', buttons: ['menu'], label: 'Меню' }];
    const search: Hint[] = remote ? [] : [{ id: 'search', buttons: ['search'], label: 'Поиск' }];
    const select = (label = 'Выбрать'): Hint => ({ id: 'select', buttons: ['select'], label });
    const back = (label: string): Hint => ({ id: 'back', buttons: ['back'], label });
    const hold = holdHint();
    const extra = hold ? [hold] : [];

    if ($tvSystemMenuOpen) {
      return { left: [], right: [...nav, select(), back('Закрыть')] };
    }
    // Круговой ввод в поиске: триггеры печатают, B прячет колёса.
    if ($tvGamepadCaptureActive) {
      return {
        left: menu,
        right: [
          { id: 'type', buttons: ['prev-ep', 'next-ep'], label: 'Ввести букву' },
          { id: 'erase', buttons: ['play'], label: 'Стереть' },
          { id: 'space', buttons: ['search'], label: 'Пробел' },
          { id: 'layout', buttons: ['prev'], label: 'Раскладка' },
          { id: 'results', buttons: ['navigate'], label: 'Результаты' },
          back('Закрыть клавиатуру'),
        ],
      };
    }
    if (isTvRailEngaged()) {
      return { left: [], right: [...nav, select('Открыть'), back('Закрыть меню')] };
    }
    if (isTvOverlayOpen()) {
      return { left: [], right: [...nav, ...extra, select(), back('Назад')] };
    }
    if (isTvShellPath(getPath())) {
      const sections: Hint[] = remote ? [] : [{ id: 'sections', buttons: ['prev', 'next'], label: 'Разделы' }];
      return { left: menu, right: [...sections, ...search, ...nav, ...extra, select(), back('Выход')] };
    }
    return { left: menu, right: [...nav, ...extra, select(), back('Назад')] };
  });

  $effect(() => {
    document.documentElement.classList.toggle('tv-hints', visible);
  });

  onMount(() => {
    const events = ['focusin', 'anix:navigate', 'popstate'];
    for (const name of events) window.addEventListener(name, bump);
    const unsubMenu = tvSystemMenuOpen.subscribe(bump);
    // Рейл раскрывается атрибутом на <html>; подписи удержания меняются на месте (закрепил → открепить).
    const observer = new MutationObserver(bump);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-tv-rail-expanded'],
    });
    observer.observe(document.body, {
      subtree: true,
      attributes: true,
      attributeFilter: ['data-tv-longpress-hint', TV_LONGPRESS_ACTIVE_ATTR, 'role'],
      childList: true,
    });
    return () => {
      for (const name of events) window.removeEventListener(name, bump);
      unsubMenu();
      observer.disconnect();
      document.documentElement.classList.remove('tv-hints');
    };
  });

  /** Полоса живёт на <html>, вне body: body сжат над ней и служит контейнером для fixed-слоёв. */
  function mountOnRoot(node: HTMLElement) {
    document.documentElement.appendChild(node);
    return { destroy: () => node.remove() };
  }
</script>

{#snippet hintList(list: Hint[])}
  {#each list as hint (hint.id)}
    <span class="tv-hint-bar__hint">
      {#each hint.buttons as button (button)}
        <TvInputGlyph {button} device={$tvInputDevice} hold={hint.hold} filling={hint.filling} />
      {/each}
      {#if hint.hold}<span class="tv-hint-bar__hold">Удерживать</span>{/if}
      {hint.label}
    </span>
  {/each}
{/snippet}

{#if visible}
  <footer class="tv-hint-bar" aria-hidden="true" use:mountOnRoot>
    <div class="tv-hint-bar__group">{@render hintList(hints.left)}</div>
    <div class="tv-hint-bar__group">{@render hintList(hints.right)}</div>
  </footer>
{/if}

<style lang="scss">
  .tv-hint-bar {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 210;
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: var(--tv-hints-h, 3.4rem);
    padding: 0 2.25rem 0 1.15rem;
    background: var(--tv-rail-bg, #0d0d0d);
    box-shadow: 0 -1px 0 rgba(255, 255, 255, 0.06);
    color: var(--uiv2-fg-muted, color-mix(in srgb, var(--uikit-v2-text, #fff) 70%, transparent));
    font-family: var(--font-sans, system-ui, sans-serif);
    pointer-events: none;
  }

  .tv-hint-bar__group {
    display: flex;
    align-items: center;
    gap: 1.6rem;
  }

  .tv-hint-bar__hint {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.9rem;
    font-weight: 500;
    white-space: nowrap;
  }

  .tv-hint-bar__hold {
    opacity: 0.65;
  }
</style>
