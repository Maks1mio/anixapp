<script lang="ts">
  import { tvSystemMenuOpen } from '../../services/tv-input';
  import { exitTvApp, scheduleFocusTvOverlayContent } from '../../services/tv-navigation';
  import { exitBigPicture, isBigPictureMode } from '../../platform/tv';

  type MenuItem = { id: string; label: string; icon: string; run: () => void };

  const ICON_ATTRS = 'viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
  const ICONS = {
    minimize: `<svg ${ICON_ATTRS}><path d="M5 18h14"/></svg>`,
    window: `<svg ${ICON_ATTRS}><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 9h18"/></svg>`,
    power: `<svg ${ICON_ATTRS}><path d="M12 2v10"/><path d="M18.4 6.6a9 9 0 1 1-12.77.04"/></svg>`,
    cancel: `<svg ${ICON_ATTRS}><path d="M18 6 6 18M6 6l12 12"/></svg>`,
  };

  function close() {
    tvSystemMenuOpen.set(false);
  }

  const cancel: MenuItem = { id: 'cancel', label: 'Отмена', icon: ICONS.cancel, run: close };

  const groups: MenuItem[][] = isBigPictureMode()
    ? [
        [
          { id: 'exit-bp', label: 'Выйти из режима большого экрана', icon: ICONS.window, run: () => { close(); exitBigPicture(); } },
          { id: 'minimize', label: 'Свернуть AnixApp', icon: ICONS.minimize, run: () => { close(); window.electron?.window?.minimize(); } },
          { id: 'quit', label: 'Закрыть AnixApp', icon: ICONS.power, run: () => { close(); void exitTvApp(); } },
        ],
        [cancel],
      ]
    : [
        [{ id: 'quit', label: 'Выйти из приложения', icon: ICONS.power, run: () => { close(); void exitTvApp(); } }],
        [cancel],
      ];

  $effect(() => {
    if ($tvSystemMenuOpen) scheduleFocusTvOverlayContent();
  });
</script>

{#if $tvSystemMenuOpen}
  <!-- Разметка и стили TV-диалогов (.tv-release-page__dialog, tv.scss) -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div
    class="tv-release-page__dialog tv-system-menu"
    role="dialog"
    aria-modal="true"
    aria-labelledby="tv-system-menu-title"
    tabindex="-1"
    onclick={(e) => { if (e.target === e.currentTarget) close(); }}
  >
    <div class="tv-release-page__dialog-panel tv-system-menu__panel">
      <div class="tv-release-page__dialog-head">
        <h2 id="tv-system-menu-title">Выход</h2>
      </div>
      <div class="tv-release-page__dialog-list">
        {#each groups as group, gi (gi)}
          {#if gi > 0}<div class="tv-system-menu__divider" aria-hidden="true"></div>{/if}
          {#each group as item (item.id)}
            <button type="button" class="tv-release-page__dialog-item tv-system-menu__item" onclick={item.run}>
              <span class="tv-system-menu__icon" aria-hidden="true">{@html item.icon}</span>
              {item.label}
            </button>
          {/each}
        {/each}
      </div>
    </div>
  </div>
{/if}

<style lang="scss">
  .tv-system-menu {
    z-index: 200;
  }

  .tv-system-menu__panel {
    animation: tv-system-menu-in 0.2s cubic-bezier(0.22, 1, 0.36, 1);
  }

  .tv-system-menu__item {
    display: flex;
    align-items: center;
    gap: 0.85rem;
    width: 100%;
  }

  .tv-system-menu__icon {
    display: inline-flex;
    opacity: 0.85;
    line-height: 0;
  }

  .tv-system-menu__divider {
    height: 1px;
    margin: 0.3rem 0.25rem;
    background: rgba(255, 255, 255, 0.08);
  }

  @keyframes tv-system-menu-in {
    from {
      opacity: 0;
      transform: scale(0.96);
    }
  }
</style>
