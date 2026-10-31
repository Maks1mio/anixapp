<script lang="ts">
  import { fade, scale } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { portal } from '../actions/portal';
  import UiV2Button from './uikit-v2/UiV2Button.svelte';
  import UserAvatar from './UserAvatar.svelte';
  import { fetchBadgeCatalog } from '../services/badges-api';
  import { requestOpenExternal } from '../utils/external-link';
  import { showToast } from '../stores/toast';
  import { closeSupportModal, SUPPORT_BOT_USERNAME, supportModalOpen } from '../stores/support-promo';
  import { SUPPORT_TIERS, mergeRemoteTiers, supportTierPerks as perks, type SupportTier } from '../utils/support-tiers';
  import defaultBadgeImg from '../assets/media/default.png';

  const open = $derived($supportModalOpen);
  const titleId = 'support-modal-title';

  let tiers = $state<SupportTier[]>(SUPPORT_TIERS);
  let selected = $state('teer-2');
  const current = $derived(tiers.find((t) => t.slug === selected) ?? tiers[0]);

  // Prices / descriptions may change on the server — images stay bundled (no network needed).
  $effect(() => {
    if (!open) return;
    void fetchBadgeCatalog().then((types) => {
      tiers = mergeRemoteTiers(types);
    });
  });

  const me = $derived.by(() => {
    void open; // re-read when the modal opens
    const p = (window as { __anixProfile?: { id?: number; login?: string; avatar?: string | null } }).__anixProfile;
    const id = Number(p?.id ?? 0);
    return {
      id: Number.isFinite(id) && id > 0 ? id : null,
      login: p?.login || 'Ваш ник',
      avatar: p?.avatar ?? null,
    };
  });

  function support() {
    requestOpenExternal(`https://t.me/${SUPPORT_BOT_USERNAME}`);
  }

  async function copyId() {
    if (!me.id) return;
    try {
      await navigator.clipboard.writeText(String(me.id));
      showToast('ID скопирован', 'ok');
    } catch {
      /* clipboard denied */
    }
  }

  function onWindowKeydown(e: KeyboardEvent) {
    if (open && e.key === 'Escape') {
      e.preventDefault();
      closeSupportModal();
    }
  }
</script>

<svelte:window onkeydown={onWindowKeydown} />

{#if open}
  <div class="support-modal" role="dialog" aria-modal="true" aria-labelledby={titleId} use:portal>
    <button
      type="button"
      class="support-modal__backdrop"
      aria-label="Закрыть"
      onclick={closeSupportModal}
      transition:fade={{ duration: 160 }}
    ></button>

    <div class="support-modal__panel" transition:scale={{ duration: 200, start: 0.96, easing: cubicOut }}>
      <header class="support-modal__head">
        <div>
          <h3 id={titleId} class="support-modal__title">Anix+</h3>
          <p class="support-modal__lead">
            AnixApp развивает небольшая команда, без рекламы. Поддержка идёт на развитие приложения,
            а у вашего ника навсегда появляется значок и открывается чат-агент.
          </p>
        </div>
        <button type="button" class="support-modal__close" aria-label="Закрыть" onclick={closeSupportModal}>
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
        </button>
      </header>

      <div class="support-modal__tiers" role="radiogroup" aria-label="Уровень">
        {#each tiers as t (t.slug)}
          <button
            type="button"
            class="support-modal__tier"
            class:support-modal__tier--on={selected === t.slug}
            role="radio"
            aria-checked={selected === t.slug}
            onclick={() => (selected = t.slug)}
          >
            <span class="support-modal__tier-top">
              <img src={t.image} alt="" width="28" height="28" />
              <span class="support-modal__tier-name">{t.name}</span>
            </span>
            <span class="support-modal__tier-price">{t.price} ₽ <small class="support-modal__tier-term">в ∞ лет</small></span>
            <ul class="support-modal__perks">
              {#each perks(t) as p (p)}<li>{p}</li>{/each}
            </ul>
          </button>
        {/each}
      </div>

      <section class="support-modal__preview" aria-label="Предпросмотр">
        <span class="support-modal__label">Как это будет выглядеть</span>
        <div class="support-modal__comment">
          <span class="support-modal__avatar"><UserAvatar src={me.avatar} label={me.login} /></span>
          <div class="support-modal__comment-main">
            <span class="support-modal__author">
              {me.login}
              <img src={defaultBadgeImg} alt="" title="В AnixApp" width="16" height="16" />
              <img src={current.image} alt="" title={current.name} width="16" height="16" />
            </span>
            <span class="support-modal__comment-text">Значок виден в комментариях, ленте, профиле и списках друзей.</span>
          </div>
        </div>
      </section>

      <p class="support-modal__how">
        Оформляется в Telegram-боте <b>@{SUPPORT_BOT_USERNAME}</b>: выберите уровень и укажите ID профиля
        {#if me.id}
          <button type="button" class="support-modal__id" title="Скопировать ID" onclick={() => void copyId()}>
            {me.id}
            <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true">
              <rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" />
            </svg>
          </button>
        {/if}. Можно оформить и в подарок другу.
      </p>

      <div class="support-modal__actions">
        <UiV2Button label="Позже" size="lg" variant="chrome" onclick={closeSupportModal} />
        <UiV2Button label={`Поддержать · ${current.price} ₽`} size="lg" variant="primary" onclick={support} />
      </div>
    </div>
  </div>
{/if}

<style>
  .support-modal {
    position: fixed;
    inset: 0;
    z-index: 10040;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1.25rem;
    pointer-events: none;
  }

  .support-modal__backdrop {
    position: absolute;
    inset: 0;
    border: 0;
    padding: 0;
    background: var(--uiv2-overlay);
    cursor: pointer;
    pointer-events: auto;
  }

  .support-modal__panel {
    position: relative;
    z-index: 1;
    display: flex;
    flex-direction: column;
    gap: 1rem;
    width: min(100%, 42rem);
    max-height: calc(100vh - 2.5rem);
    overflow-y: auto;
    padding: 1.35rem 1.35rem 1.2rem;
    border-radius: 20px;
    border: 1px solid var(--uiv2-panel-border);
    background: var(--uiv2-panel-bg);
    box-shadow: var(--uiv2-panel-shadow), var(--uiv2-chrome-shadow);
    pointer-events: auto;
  }

  .support-modal__head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
  }

  .support-modal__title {
    margin: 0 0 0.35rem;
    font-size: 1.35rem;
    font-weight: 700;
    color: var(--uikit-v2-text);
  }

  .support-modal__lead {
    margin: 0;
    font-size: 0.9rem;
    line-height: 1.5;
    color: var(--uiv2-fg-muted);
  }

  .support-modal__close {
    flex: none;
    display: grid;
    place-items: center;
    width: 2rem;
    height: 2rem;
    border: 0;
    border-radius: 999px;
    background: var(--uiv2-surface-subtle);
    color: var(--uiv2-fg-muted);
    cursor: pointer;
  }

  .support-modal__close:hover {
    background: var(--uiv2-hover-bg);
    color: var(--uikit-v2-text);
  }

  .support-modal__close svg,
  .support-modal__id svg {
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .support-modal__tiers {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.6rem;
  }

  .support-modal__tier {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.4rem;
    padding: 0.8rem;
    border-radius: 14px;
    border: 1px solid var(--uiv2-border-subtle);
    background: var(--uiv2-surface-subtle);
    color: var(--uikit-v2-text);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  .support-modal__tier:hover {
    background: var(--uiv2-hover-bg);
  }

  .support-modal__tier--on {
    border-color: var(--uikit-v2-accent);
    background: var(--uiv2-chrome-active-bg);
  }

  .support-modal__tier:focus-visible {
    outline: 2px solid var(--uikit-v2-accent);
    outline-offset: 2px;
  }

  .support-modal__tier-top {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .support-modal__tier-top img {
    flex: none;
    object-fit: contain;
  }

  .support-modal__tier-name {
    font-weight: 650;
    font-size: 0.95rem;
    white-space: nowrap;
  }

  .support-modal__tier-price {
    font-size: 1.2rem;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }

  .support-modal__tier-term {
    font-size: 0.85rem;
    font-weight: 600;
    opacity: 0.6;
  }

  .support-modal__perks {
    margin: 0;
    padding: 0 0 0 1rem;
    display: grid;
    gap: 0.2rem;
    font-size: 0.8rem;
    line-height: 1.35;
    color: var(--uiv2-fg-muted);
  }

  .support-modal__preview {
    display: grid;
    gap: 0.5rem;
  }

  .support-modal__label {
    font-size: 0.78rem;
    font-weight: 600;
    color: var(--uiv2-fg-muted);
  }

  .support-modal__comment {
    display: flex;
    align-items: flex-start;
    gap: 0.7rem;
    padding: 0.75rem 0.85rem;
    border-radius: 14px;
    border: 1px solid var(--uiv2-border-subtle);
  }

  .support-modal__avatar {
    flex: none;
    width: 2.25rem;
    height: 2.25rem;
    border-radius: 50%;
    overflow: hidden;
  }

  .support-modal__avatar :global(*) {
    width: 100%;
    height: 100%;
  }

  .support-modal__comment-main {
    display: grid;
    gap: 0.15rem;
    min-width: 0;
  }

  .support-modal__author {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    font-weight: 650;
    font-size: 0.94rem;
    color: var(--uikit-v2-text);
  }

  .support-modal__author img {
    object-fit: contain;
  }

  .support-modal__comment-text {
    font-size: 0.86rem;
    color: var(--uiv2-fg-soft);
  }

  .support-modal__how {
    margin: 0;
    font-size: 0.84rem;
    line-height: 1.55;
    color: var(--uiv2-fg-muted);
  }

  .support-modal__how b {
    color: var(--uikit-v2-text);
    font-weight: 600;
  }

  .support-modal__id {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0 0.4rem;
    border: 1px solid var(--uiv2-border-subtle);
    border-radius: 6px;
    background: var(--uiv2-surface-subtle);
    color: var(--uikit-v2-text);
    font: inherit;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    cursor: pointer;
  }

  .support-modal__id:hover {
    background: var(--uiv2-hover-bg);
  }

  .support-modal__actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
  }

  @media (max-width: 40rem) {
    .support-modal__tiers {
      grid-template-columns: minmax(0, 1fr);
    }

    .support-modal__actions > :global(*) {
      flex: 1;
    }
  }
</style>
