<script lang="ts">
  import { onMount } from 'svelte';
  import { fade, scale } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { portal } from '../actions/portal';
  import UiV2Button from './uikit-v2/UiV2Button.svelte';
  import { iconTrash2, iconBan } from './icons';
  import {
    PROFILE_HEALTH_INFO_HTML,
    COMMENT_RULES_URL,
    normalizeHealthStatus,
    normalizeEnforcementList,
    normalizeEnforcement,
    healthStatusTitle,
    healthStatusNote,
    blogSuspensionLine,
    blogMuteLine,
    isCurrentlyBanned,
    enforcementListTitle,
    enforcementTimeLabel,
    enforcementDetailTitle,
    enforcementDetailBody,
    formatEnforcementContentHtml,
    type HealthTab,
    type ProfileHealthStatus,
    type ProfileEnforcementItem,
  } from '../utils/profile-health';
  import { requestOpenExternal } from '../utils/external-link';

  type Props = {
    avatarUrl?: string;
  };

  let { avatarUrl = '' }: Props = $props();

  let loadState = $state<'loading' | 'ready' | 'error'>('loading');
  let status = $state<ProfileHealthStatus | null>(null);
  let tab = $state<HealthTab>('account');
  let accountItems = $state<ProfileEnforcementItem[]>([]);
  let contentItems = $state<ProfileEnforcementItem[]>([]);
  let accountState = $state<'idle' | 'loading' | 'ready' | 'error'>('idle');
  let contentState = $state<'idle' | 'loading' | 'ready' | 'error'>('idle');
  let infoOpen = $state(false);
  let detailOpen = $state(false);
  let detailLoading = $state(false);
  let detailItem = $state<ProfileEnforcementItem | null>(null);

  const banned = $derived(status ? isCurrentlyBanned(status) : false);
  const title = $derived(status ? healthStatusTitle(status) : '…');
  const note = $derived(status ? healthStatusNote(status) : '');
  const suspensionLine = $derived(status ? blogSuspensionLine(status) : '');
  const muteLine = $derived(status ? blogMuteLine(status) : '');
  const items = $derived(tab === 'account' ? accountItems : contentItems);
  const listState = $derived(tab === 'account' ? accountState : contentState);

  async function loadStatus() {
    if (!window.anixApi?.profileHealth?.status) {
      loadState = 'error';
      return;
    }
    loadState = 'loading';
    try {
      const res = await window.anixApi.profileHealth.status();
      status = normalizeHealthStatus(res as Record<string, unknown>);
      loadState = 'ready';
    } catch {
      loadState = 'error';
    }
  }

  async function loadList(kind: HealthTab) {
    const api = window.anixApi?.profileHealth;
    if (!api) {
      if (kind === 'account') accountState = 'error';
      else contentState = 'error';
      return;
    }
    if (kind === 'account') accountState = 'loading';
    else contentState = 'loading';
    try {
      const data = kind === 'account' ? await api.account(0) : await api.content(0);
      const list = normalizeEnforcementList(data);
      if (kind === 'account') {
        accountItems = list;
        accountState = 'ready';
      } else {
        contentItems = list;
        contentState = 'ready';
      }
    } catch {
      if (kind === 'account') {
        accountItems = [];
        accountState = 'error';
      } else {
        contentItems = [];
        contentState = 'error';
      }
    }
  }

  function setTab(next: HealthTab) {
    tab = next;
    const state = next === 'account' ? accountState : contentState;
    if (state === 'idle' || state === 'error') void loadList(next);
  }

  async function openDetails(item: ProfileEnforcementItem) {
    detailItem = item;
    detailOpen = true;
    detailLoading = true;
    try {
      const res = await window.anixApi?.profileHealth?.enforcement?.(item.id);
      const raw = (res?.enforcement ?? null) as Record<string, unknown> | null;
      if (raw) detailItem = normalizeEnforcement(raw);
    } catch {
      /* keep list item */
    } finally {
      detailLoading = false;
    }
  }

  function closeDetails() {
    detailOpen = false;
    detailItem = null;
  }

  function openRules(e: MouseEvent) {
    e.preventDefault();
    requestOpenExternal(COMMENT_RULES_URL);
  }

  function onWindowKeydown(e: KeyboardEvent) {
    if (e.key !== 'Escape') return;
    if (detailOpen) {
      e.preventDefault();
      closeDetails();
      return;
    }
    if (infoOpen) {
      e.preventDefault();
      infoOpen = false;
    }
  }

  onMount(() => {
    void loadStatus();
    void loadList('account');
    void loadList('content');
  });
</script>

<svelte:window onkeydown={onWindowKeydown} />

<div class="pp-health">
  {#if loadState === 'loading'}
    <p class="pp-health__hint">Загрузка…</p>
  {:else if loadState === 'error' || !status}
    <p class="pp-health__hint pp-health__hint--err">Не удалось загрузить статус аккаунта</p>
  {:else}
    <section
      class="pp-health__card"
      class:pp-health__card--bad={banned}
      aria-label="Статус здоровья аккаунта"
    >
      <div
        class="pp-health__avatar"
        style={avatarUrl ? `background-image:url('${avatarUrl}')` : undefined}
        aria-hidden="true"
      ></div>
      <h2 class="pp-health__title">{title}</h2>
      <p class="pp-health__note">{note}</p>

      <div class="pp-health__stats">
        <div class="pp-health__stat">
          <span class="pp-health__stat-num">{status.banCount}</span>
          <span class="pp-health__stat-label">банов</span>
          <span class="pp-health__stat-sub">за все время</span>
        </div>
        <div class="pp-health__stat">
          <span class="pp-health__stat-num">{status.banFor3MonthCount}</span>
          <span class="pp-health__stat-label">банов</span>
          <span class="pp-health__stat-sub">за 3 месяца</span>
        </div>
      </div>

      <ul class="pp-health__limits">
        <li>{suspensionLine}</li>
        <li>{muteLine}</li>
      </ul>

      <button
        type="button"
        class="pp-health__mean"
        onclick={() => (infoOpen = true)}
      >
        Что это значит?
      </button>
    </section>
  {/if}

  <div class="pp-health__tabs" role="tablist" aria-label="Разделы">
    <button
      type="button"
      role="tab"
      class="pp-health__tab"
      class:pp-health__tab--on={tab === 'account'}
      aria-selected={tab === 'account'}
      onclick={() => setTab('account')}
    >
      Ограничения
    </button>
    <button
      type="button"
      role="tab"
      class="pp-health__tab"
      class:pp-health__tab--on={tab === 'content'}
      aria-selected={tab === 'content'}
      onclick={() => setTab('content')}
    >
      Действия с контентом
    </button>
  </div>

  <div class="pp-health__list" role="tabpanel">
    {#if listState === 'loading' || listState === 'idle'}
      <p class="pp-health__hint">Загрузка…</p>
    {:else if listState === 'error'}
      <p class="pp-health__hint pp-health__hint--err">Не удалось загрузить список</p>
      <div class="pp-health__retry">
        <UiV2Button
          label="Повторить"
          size="md"
          variant="chrome"
          onclick={() => void loadList(tab)}
        />
      </div>
    {:else if items.length === 0}
      <p class="pp-health__empty">Нет данных для отображения</p>
    {:else}
      <ul class="pp-health__items">
        {#each items as item (item.id)}
          {@const isBan =
            item.type === 'profile_ban'
            || item.type === 'channel_suspension'
            || item.type === 'channel_mute'}
          <li class="pp-health__item">
            <span class="pp-health__item-icon" aria-hidden="true">
              {@html isBan ? iconBan(18) : iconTrash2(18)}
            </span>
            <div class="pp-health__item-body">
              <p class="pp-health__item-title">{enforcementListTitle(item)}</p>
              {#if enforcementTimeLabel(item)}
                <p class="pp-health__item-time">{enforcementTimeLabel(item)}</p>
              {/if}
              {#if item.reason}
                <p class="pp-health__item-reason">{item.reason}</p>
              {/if}
              <div class="pp-health__more-wrap">
                <UiV2Button
                  label="Подробнее"
                  size="sm"
                  variant="chrome"
                  onclick={() => void openDetails(item)}
                />
              </div>
            </div>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
</div>

{#if infoOpen}
  <div class="pp-health-sheet" role="dialog" aria-modal="true" aria-labelledby="pp-health-info-title" use:portal>
    <button
      type="button"
      class="pp-health-sheet__backdrop"
      aria-label="Закрыть"
      onclick={() => (infoOpen = false)}
      transition:fade={{ duration: 160 }}
    ></button>
    <div
      class="pp-health-sheet__panel"
      transition:scale={{ duration: 220, start: 0.94, easing: cubicOut }}
    >
      <h3 id="pp-health-info-title" class="pp-health-sheet__title">Здоровье аккаунта</h3>
      <div class="pp-health-sheet__body">
        {@html PROFILE_HEALTH_INFO_HTML}
      </div>
      <UiV2Button
        label="Закрыть"
        size="lg"
        block
        variant="chrome"
        onclick={() => (infoOpen = false)}
      />
    </div>
  </div>
{/if}

{#if detailOpen && detailItem}
  {@const detail = enforcementDetailBody(detailItem)}
  <div class="pp-health-sheet" role="dialog" aria-modal="true" aria-labelledby="pp-health-detail-title" use:portal>
    <button
      type="button"
      class="pp-health-sheet__backdrop"
      aria-label="Закрыть"
      onclick={closeDetails}
      transition:fade={{ duration: 160 }}
    ></button>
    <div
      class="pp-health-sheet__panel"
      transition:scale={{ duration: 220, start: 0.94, easing: cubicOut }}
    >
      <h3 id="pp-health-detail-title" class="pp-health-sheet__title">
        {enforcementDetailTitle(detailItem)}
      </h3>
      <div class="pp-health-sheet__body">
        {#if detailLoading}
          <p>Загрузка…</p>
        {:else}
          <p>{detail.lead}</p>
          {#if detail.contentLabel && detail.content}
            <p class="pp-health-sheet__content-label">{detail.contentLabel}</p>
            <div class="pp-health-sheet__content">{@html formatEnforcementContentHtml(detail.content)}</div>
          {/if}
          {#if detailItem.reason}
            <p class="pp-health-sheet__reason">{detailItem.reason}</p>
          {/if}
          <p class="pp-health-sheet__tip">
            Рекомендуем повторно ознакомиться с
            <a href={COMMENT_RULES_URL} onclick={openRules}>правилами сообщества</a>.
          </p>
        {/if}
      </div>
      <UiV2Button
        label="Закрыть"
        size="lg"
        block
        variant="chrome"
        onclick={closeDetails}
      />
    </div>
  </div>
{/if}

<style>
  .pp-health {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: 0.5rem 1.1rem 1.5rem;
    font-family: var(--uikit-v2-font, inherit);
    color: var(--uikit-v2-text, #fff);
  }

  .pp-health__hint,
  .pp-health__empty {
    margin: 1rem 0;
    color: var(--pp-fg-muted, var(--uiv2-fg-muted));
    font-size: 0.9rem;
    text-align: center;
  }

  .pp-health__hint--err {
    color: var(--uikit-v2-danger, #e57373);
  }

  .pp-health__retry {
    display: flex;
    justify-content: center;
  }

  .pp-health__card {
    --pp-health-accent: #81c784;
    --pp-health-counter-bg: #293b26;
    --pp-health-fg: #e0e0e0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0;
    padding: 1rem 1rem 1.15rem;
    border-radius: 2rem;
    border: none;
    background: linear-gradient(225deg, #2a382a 0%, #213023 48%, #1e2e1f 100%);
    text-align: center;
  }

  .pp-health__card--bad {
    --pp-health-accent: #e57373;
    --pp-health-counter-bg: color-mix(in srgb, #3e1515 88%, #000);
    background: linear-gradient(225deg, #3e1515 0%, #302121 48%, #2e0c0c 100%);
  }

  .pp-health__avatar {
    width: 6rem;
    height: 6rem;
    border-radius: 50%;
    border: 2px solid color-mix(in srgb, #fff 10%, transparent);
    background: var(--pp-surface, #1a1a1a) center / cover no-repeat;
  }

  .pp-health__title {
    margin: 1.5rem 0 0;
    font-size: 1.375rem;
    font-weight: 700;
    line-height: 1.2;
    color: var(--pp-health-fg);
  }

  .pp-health__note {
    margin: 0.125rem 0 0;
    font-size: 0.875rem;
    color: var(--pp-health-fg);
  }

  .pp-health__card--bad .pp-health__note {
    color: var(--pp-health-fg);
  }

  .pp-health__stats {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1.375rem;
    width: calc(100% - 0.5rem);
    max-width: 22rem;
    margin-top: 1.5rem;
  }

  .pp-health__stat {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.125rem;
    padding: 0.85rem 0.65rem 0.75rem;
    border-radius: 1rem;
    background: var(--pp-health-counter-bg);
    border: none;
  }

  .pp-health__stat-num {
    font-size: 1.375rem;
    font-weight: 600;
    line-height: 1.15;
    color: var(--pp-health-accent);
  }

  .pp-health__card--bad .pp-health__stat-num {
    color: var(--pp-health-accent);
  }

  .pp-health__stat-label {
    font-size: 0.82rem;
    font-weight: 500;
    color: var(--pp-health-accent);
  }

  .pp-health__stat-sub {
    font-size: 0.78rem;
    color: var(--pp-health-accent);
  }

  .pp-health__card--bad .pp-health__stat-sub {
    color: var(--pp-health-accent);
  }

  .pp-health__limits {
    list-style: none;
    margin: 1.5rem 0 0;
    padding: 0;
    width: min(100%, 18.75rem);
    text-align: center;
    font-size: 0.875rem;
    line-height: 1.4;
    color: var(--pp-health-fg);
  }

  .pp-health__limits li + li {
    margin-top: 0.75rem;
  }

  .pp-health__mean {
    margin-top: 1.125rem;
    padding: 0.55rem 0.85rem;
    min-height: 2.4rem;
    border: none;
    border-radius: 0.5rem;
    background: var(--pp-health-counter-bg);
    color: var(--pp-health-accent);
    font: inherit;
    font-size: 0.8125rem;
    font-weight: 600;
    cursor: pointer;
  }

  .pp-health__mean:hover {
    filter: brightness(1.08);
  }

  .pp-health__mean:focus-visible {
    outline: 2px solid var(--pp-health-accent);
    outline-offset: 2px;
  }

  .pp-health__tabs {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.55rem;
  }

  .pp-health__tab {
    min-height: 2.55rem;
    padding: 0.55rem 0.85rem;
    border-radius: 999px;
    border: 1px solid var(--pp-border-strong, var(--uiv2-border-strong));
    background: transparent;
    color: var(--pp-btn-fg, var(--uikit-v2-text));
    font: inherit;
    font-size: 0.86rem;
    font-weight: 600;
    cursor: pointer;
  }

  .pp-health__tab:hover {
    background: var(--pp-surface-hover, var(--uiv2-hover-bg));
  }

  .pp-health__tab--on {
    background: var(--pp-btn-bg, var(--uiv2-chrome-bg));
    border-color: transparent;
  }

  .pp-health__tab:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--uikit-v2-accent, #e57373) 50%, transparent);
    outline-offset: 2px;
  }

  .pp-health__items {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.95rem;
  }

  .pp-health__item {
    display: flex;
    gap: 0.75rem;
    align-items: flex-start;
  }

  .pp-health__item-icon {
    flex: 0 0 auto;
    display: grid;
    place-items: center;
    width: 2.25rem;
    height: 2.25rem;
    border-radius: 50%;
    background: var(--pp-surface, var(--uiv2-surface-subtle));
    color: var(--pp-fg-soft, var(--uiv2-fg-soft));
  }

  .pp-health__item-body {
    min-width: 0;
    flex: 1;
  }

  .pp-health__item-title {
    margin: 0;
    font-size: 0.92rem;
    font-weight: 600;
    color: var(--uiv2-fg-strong, #fff);
  }

  .pp-health__item-time,
  .pp-health__item-reason {
    margin: 0.25rem 0 0;
    font-size: 0.78rem;
    color: var(--pp-fg-muted, var(--uiv2-fg-muted));
    line-height: 1.35;
  }

  .pp-health__more-wrap {
    margin-top: 0.5rem;
  }

  .pp-health-sheet {
    position: fixed;
    inset: 0;
    z-index: 1200;
    display: grid;
    place-items: center;
    padding: 1.25rem;
  }

  .pp-health-sheet__backdrop {
    position: absolute;
    inset: 0;
    border: 0;
    background: var(--uiv2-overlay, rgba(0, 0, 0, 0.62));
    cursor: pointer;
  }

  .pp-health-sheet__panel {
    position: relative;
    z-index: 1;
    width: min(26rem, 100%);
    max-height: min(80vh, 40rem);
    overflow: auto;
    padding: 1.15rem;
    border-radius: 1rem;
    border: 1px solid var(--uiv2-panel-border, rgba(255, 255, 255, 0.08));
    background: var(--uiv2-panel-bg, #1c1c1e);
    color: var(--uikit-v2-text, #fff);
    box-shadow: var(--uiv2-panel-shadow, 0 24px 64px rgba(0, 0, 0, 0.55));
  }

  .pp-health-sheet__title {
    margin: 0 0 0.75rem;
    font-size: 1.05rem;
    font-weight: 700;
  }

  .pp-health-sheet__body {
    margin-bottom: 1rem;
    font-size: 0.9rem;
    line-height: 1.5;
    color: var(--uiv2-fg-soft, #d7d7db);
  }

  .pp-health-sheet__body :global(p) {
    margin: 0 0 0.65rem;
  }

  .pp-health-sheet__body :global(ul) {
    margin: 0 0 0.75rem;
    padding-left: 1.15em;
  }

  .pp-health-sheet__content-label {
    margin-top: 0.75rem !important;
    color: var(--uiv2-fg-muted, #aaa);
  }

  .pp-health-sheet__content {
    font-weight: 600;
    color: var(--uikit-v2-text, #fff);
    line-height: 1.45;
    word-break: break-word;
  }

  .pp-health-sheet__content :global(a) {
    color: var(--uikit-v2-accent, #8ab4f8);
  }

  .pp-health-sheet__reason {
    margin-top: 0.5rem;
    color: var(--uiv2-fg-muted, #aaa);
    font-size: 0.82rem;
  }

  .pp-health-sheet__tip {
    margin-top: 0.75rem;
    font-size: 0.82rem;
    color: var(--uiv2-fg-muted, #aaa);
  }

  .pp-health-sheet__tip a {
    color: var(--uikit-v2-accent, #8ab4f8);
  }
</style>
