<script lang="ts">
  import { tick } from 'svelte';
  import { scale } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { iconMoreHorizontal, iconCopy, iconCheck, iconHash, iconCodeXml, iconShare, iconDownload } from './icons';
  import { parseAltTitles } from '../utils/titleInfo';
  import { showToast } from '../stores/toast';
  import { DEFAULT_API_ENDPOINT } from '../constants/apiEndpoints';
  import { copyTextToClipboard, releasePublicUrl } from '../utils/release-menu-v2';
  import { portal } from '../actions/portal';
  import { isMobileMode } from '../platform/mobile';
  import UiV2PopupMenu, { type UiV2PopupMenuItem } from './uikit-v2/UiV2PopupMenu.svelte';

  interface Props {
    titleRu?: string;
    titleEn?: string;
    titleAlt?: string;
    /** ID релиза — включает блок «ID / API-запрос / Поделиться» */
    releaseId?: number;
    className?: string;
    /** Телефон и планшет: пункт скачивания серий. */
    onDownload?: () => void;
  }

  let { titleRu = '', titleEn = '', titleAlt = '', releaseId, className = '', onDownload }: Props = $props();

  const GAP = 8;
  const EDGE = 12;

  const ru = $derived(titleRu.trim());
  const en = $derived(titleEn.trim());
  const altTitles = $derived(parseAltTitles(titleAlt));
  const altText = $derived(altTitles.join('\n'));

  type TitleRow = { id: string; label: string; value: string; lines: string[]; toast: string };

  const titleRows = $derived.by(() => {
    const rows: TitleRow[] = [];
    if (ru) rows.push({ id: 'ru', label: 'Название', value: ru, lines: [ru], toast: 'Название скопировано' });
    if (en && en !== ru) {
      rows.push({ id: 'en', label: 'Оригинальное название', value: en, lines: [en], toast: 'Оригинальное название скопировано' });
    }
    if (altTitles.length > 0) {
      rows.push({ id: 'alt', label: 'Альтернативные названия', value: altText, lines: altTitles, toast: 'Альтернативные названия скопированы' });
    }
    return rows;
  });

  const hasRelease = $derived(typeof releaseId === 'number' && releaseId > 0);
  const visible = $derived(titleRows.length > 0 || hasRelease);
  const shareUrl = $derived(hasRelease ? releasePublicUrl(releaseId!) : '');

  let triggerEl = $state<HTMLButtonElement | null>(null);
  let panelEl = $state<HTMLDivElement | null>(null);
  let open = $state(false);
  let panelLeft = $state(0);
  let panelTop = $state(0);
  let openUp = $state(false);

  /** Телефон и планшет: те же действия в общей шторке вместо всплывающей панели. */
  let sheetOpen = $state(false);
  const COPY_LINE = 'copy-line:';

  const titleItems = $derived(titleRows.flatMap((row, rowIndex): UiV2PopupMenuItem[] => [
    { id: `label:${row.id}`, label: row.label, type: 'label', dividerBefore: rowIndex > 0 },
    ...row.lines.map((line, i): UiV2PopupMenuItem => ({
      id: `${COPY_LINE}${rowIndex}:${i}`,
      label: line,
      icon: iconCopy(20),
    })),
  ]));

  const sheetItems = $derived.by((): UiV2PopupMenuItem[] => {
    const items: UiV2PopupMenuItem[] = [];
    if (onDownload) items.push({ id: 'download', label: 'Скачать серии…', icon: iconDownload(22) });
    if (hasRelease) items.push({ id: 'share', label: 'Поделиться', icon: iconShare(22) });
    if (titleItems.length) items.push({ id: 'titles', label: 'Названия', icon: iconCopy(22), children: titleItems });
    if (hasRelease) {
      items.push(
        { id: 'id', label: 'Копировать ID', icon: iconHash(22), valueText: String(releaseId), dividerBefore: items.length > 0 },
        { id: 'api', label: 'Копировать API-запрос', icon: iconCodeXml(22), valueText: 'GET' },
      );
    }
    return items;
  });

  async function onSheetSelect(id: string) {
    if (id === 'download') onDownload?.();
    else if (id === 'share') await share();
    else if (id === 'id') await copy(String(releaseId), 'id', 'ID скопирован');
    else if (id === 'api') await copy(await apiRequestUrl(), 'api', 'API-запрос скопирован');
    else if (id.startsWith(COPY_LINE)) {
      const [rowIndex, lineIndex] = id.slice(COPY_LINE.length).split(':').map(Number);
      const row = titleRows[rowIndex];
      if (row) await copy(row.lines[lineIndex], `title:${row.id}`, row.toast);
    }
  }

  let copiedId = $state<string | null>(null);
  let copyTimer: ReturnType<typeof setTimeout> | undefined;

  function layoutPanel() {
    if (!triggerEl || !panelEl) return;
    const a = triggerEl.getBoundingClientRect();
    const w = panelEl.offsetWidth;
    const h = panelEl.offsetHeight;
    const spaceBelow = window.innerHeight - a.bottom - GAP - EDGE;
    openUp = spaceBelow < h && a.top - GAP - EDGE > spaceBelow;
    panelTop = openUp
      ? Math.max(EDGE, a.top - GAP - h)
      : Math.min(a.bottom + GAP, window.innerHeight - EDGE - h);
    // Правый край панели — по правому краю кнопки (кнопка в конце ряда действий)
    panelLeft = Math.max(EDGE, Math.min(a.right - w, window.innerWidth - EDGE - w));
  }

  async function toggle(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (isMobileMode()) {
      sheetOpen = true;
      return;
    }
    open = !open;
    if (!open) return;
    await tick();
    layoutPanel();
  }

  function close() {
    open = false;
  }

  function onDocumentPointerDown(e: PointerEvent) {
    const t = e.target as Node | null;
    if (t && (panelEl?.contains(t) || triggerEl?.contains(t))) return;
    close();
  }

  function onDocumentKeydown(e: KeyboardEvent) {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    close();
    triggerEl?.focus();
  }

  $effect(() => {
    if (!open) return;
    document.addEventListener('pointerdown', onDocumentPointerDown, true);
    document.addEventListener('keydown', onDocumentKeydown, true);
    window.addEventListener('scroll', layoutPanel, true);
    window.addEventListener('resize', layoutPanel);
    return () => {
      document.removeEventListener('pointerdown', onDocumentPointerDown, true);
      document.removeEventListener('keydown', onDocumentKeydown, true);
      window.removeEventListener('scroll', layoutPanel, true);
      window.removeEventListener('resize', layoutPanel);
    };
  });

  async function copy(value: string, id: string, toast: string) {
    if (!value) return;
    if (!(await copyTextToClipboard(value))) {
      showToast('Не удалось скопировать', 'err');
      return;
    }
    copiedId = id;
    clearTimeout(copyTimer);
    copyTimer = setTimeout(() => {
      copiedId = null;
    }, 1400);
    showToast(toast);
  }

  async function apiRequestUrl(): Promise<string> {
    let base = DEFAULT_API_ENDPOINT;
    try {
      const current = await window.anixApi?.client.getBaseUrl();
      if (current) base = current;
    } catch {
      /* остаёмся на дефолтном эндпоинте */
    }
    return `${base.replace(/\/+$/, '')}/release/${releaseId}`;
  }

  async function share() {
    if (!shareUrl) return;
    if (navigator.share) {
      try {
        await navigator.share({ title: ru || en, url: shareUrl });
        close();
        return;
      } catch (e) {
        if ((e as DOMException)?.name === 'AbortError') return;
      }
    }
    await copy(shareUrl, 'share', 'Ссылка скопирована');
  }
</script>

{#if visible}
  <button
    bind:this={triggerEl}
    type="button"
    class="release-page__actions-chip release-page__actions-chip--more {className}"
    class:release-page__actions-chip--pressed={open}
    aria-label="Ещё"
    aria-haspopup="menu"
    aria-expanded={open}
    onclick={toggle}
  >
    <span class="release-page__actions-chip-icon" aria-hidden="true">{@html iconMoreHorizontal(20)}</span>
  </button>

  <UiV2PopupMenu
    open={sheetOpen}
    x={0}
    y={0}
    items={sheetItems}
    onClose={() => { sheetOpen = false; }}
    onSelect={(id) => void onSheetSelect(id)}
  />

  {#if open}
    <div
      bind:this={panelEl}
      class="uiv2-title-info-panel"
      role="menu"
      style:left="{panelLeft}px"
      style:top="{panelTop}px"
      style:transform-origin={openUp ? '100% 100%' : '100% 0'}
      use:portal={{ lock: false }}
      transition:scale={{ duration: 160, start: 0.96, easing: cubicOut }}
    >
      <div class="uiv2-title-info">
        {#if titleRows.length > 0}
          <div class="uiv2-title-info__group">
            {#each titleRows as row (row.id)}
              <button
                type="button"
                role="menuitem"
                class="uiv2-title-info__row"
                class:uiv2-title-info__row--done={copiedId === row.id}
                aria-label="Скопировать: {row.label}"
                onclick={() => void copy(row.value, row.id, row.toast)}
              >
                <span class="uiv2-title-info__text">
                  <span class="uiv2-title-info__label">{row.label}</span>
                  <span class="uiv2-title-info__value">
                    {#each row.lines as line, i}
                      {#if i > 0}<br />{/if}{line}
                    {/each}
                  </span>
                </span>
                <span class="uiv2-title-info__copy" aria-hidden="true">
                  {@html copiedId === row.id ? iconCheck(15) : iconCopy(15)}
                </span>
              </button>
            {/each}
          </div>
        {/if}

        {#if hasRelease}
          {#if titleRows.length > 0}
            <div class="uiv2-title-info__sep" role="separator"></div>
          {/if}
          <div class="uiv2-title-info__group">
            <button
              type="button"
              role="menuitem"
              class="uiv2-popup-menu__item uiv2-title-info__action"
              onclick={() => void copy(String(releaseId), 'id', 'ID скопирован')}
            >
              <span
                class="uiv2-popup-menu__icon"
                class:uiv2-popup-menu__icon--success={copiedId === 'id'}
                aria-hidden="true"
              >{@html copiedId === 'id' ? iconCheck(18) : iconHash(18)}</span>
              <span class="uiv2-popup-menu__label">Копировать ID</span>
              <span class="uiv2-title-info__chip">{releaseId}</span>
            </button>

            <button
              type="button"
              role="menuitem"
              class="uiv2-popup-menu__item uiv2-title-info__action"
              onclick={async () => void copy(await apiRequestUrl(), 'api', 'API-запрос скопирован')}
            >
              <span
                class="uiv2-popup-menu__icon"
                class:uiv2-popup-menu__icon--success={copiedId === 'api'}
                aria-hidden="true"
              >{@html copiedId === 'api' ? iconCheck(18) : iconCodeXml(18)}</span>
              <span class="uiv2-popup-menu__label">Копировать API-запрос</span>
              <span class="uiv2-title-info__chip">GET</span>
            </button>

            <button
              type="button"
              role="menuitem"
              class="uiv2-popup-menu__item uiv2-title-info__action"
              onclick={() => void share()}
            >
              <span
                class="uiv2-popup-menu__icon"
                class:uiv2-popup-menu__icon--success={copiedId === 'share'}
                aria-hidden="true"
              >{@html copiedId === 'share' ? iconCheck(18) : iconShare(18)}</span>
              <span class="uiv2-popup-menu__label">Поделиться</span>
            </button>
          </div>
        {/if}
      </div>
    </div>
  {/if}
{/if}
