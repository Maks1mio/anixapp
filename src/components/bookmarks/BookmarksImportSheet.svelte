<script lang="ts">
  import { onMount } from 'svelte';
  import { fade, scale } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { portal } from '../../actions/portal';
  import UiV2Button from '../uikit-v2/UiV2Button.svelte';
  import { iconFolder } from '../icons';
  import { showToast } from '../../stores/toast';
  import {
    IMPORT_TARGET_LISTS,
    buildImportBody,
    countShikimori,
    parseShikimoriExport,
    type ImportTargetList,
    type ShikimoriParsed,
  } from '../../utils/shikimori-import';

  type Props = {
    onClose: () => void;
    /** После успешного импорта — перезагрузить списки */
    onImported?: () => void;
  };

  let { onClose, onImported }: Props = $props();

  const titleId = 'bookmarks-import-title';
  const IMPORT_LIMIT_REACHED = 2;

  let fileInput = $state<HTMLInputElement | null>(null);
  let fileName = $state('');
  let parsed = $state<ShikimoriParsed | null>(null);
  let rewatchingTo = $state<ImportTargetList>('watching');
  let busy = $state(false);
  let error = $state('');
  let limitReached = $state(false);

  const total = $derived(parsed ? countShikimori(parsed) : 0);
  const summary = $derived(
    parsed
      ? IMPORT_TARGET_LISTS
        .map((l) => ({ label: l.label, count: parsed![l.value].length }))
        .filter((l) => l.count > 0)
      : [],
  );

  async function onPick(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    error = '';
    try {
      const next = parseShikimoriExport(await file.text());
      if (!countShikimori(next)) throw new Error('empty');
      parsed = next;
      fileName = file.name;
    } catch {
      parsed = null;
      fileName = '';
      error = 'Файл не похож на выгрузку Shikimori в формате JSON';
    }
  }

  async function run() {
    if (!parsed || busy || limitReached) return;
    if (!window.anixApi?.bookmarks) {
      error = 'Импорт недоступен';
      return;
    }
    busy = true;
    error = '';
    try {
      const res = await window.anixApi.bookmarks.import(buildImportBody(parsed, rewatchingTo));
      if (res?.code === IMPORT_LIMIT_REACHED) {
        limitReached = true;
        return;
      }
      if (res?.code && res.code !== 0) throw new Error();
      showToast('Импорт запущен — закладки появятся в течение нескольких минут');
      onImported?.();
      onClose();
    } catch {
      error = 'Не удалось перенести закладки, попробуйте позже';
    } finally {
      busy = false;
    }
  }

  function onWindowKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && !busy) {
      e.preventDefault();
      onClose();
    }
  }

  onMount(() => {
    void window.anixApi?.bookmarks?.importStatus()
      .then((res) => {
        if (res?.code === IMPORT_LIMIT_REACHED) limitReached = true;
      })
      .catch(() => {});
  });
</script>

<svelte:window onkeydown={onWindowKeydown} />

<div class="uiv2-choice-sheet" role="dialog" aria-modal="true" aria-labelledby={titleId} use:portal>
  <button
    type="button"
    class="uiv2-choice-sheet__backdrop"
    aria-label="Закрыть"
    onclick={() => !busy && onClose()}
    transition:fade={{ duration: 160 }}
  ></button>

  <div
    class="uiv2-choice-sheet__panel uiv2-choice-sheet__panel--form bm-sheet"
    transition:scale={{ duration: 220, start: 0.94, easing: cubicOut }}
  >
    <h3 id={titleId} class="uiv2-choice-sheet__title">Импорт из Shikimori</h3>
    <p class="bm-sheet__lead">
      На Shikimori откройте настройки профиля → «Список аниме и манги» → «Экспортировать список» → JSON
      и выберите скачанный файл.
    </p>

    <input bind:this={fileInput} type="file" accept=".json,application/json" hidden onchange={onPick} />
    <button type="button" class="bm-sheet__drop" class:bm-sheet__drop--done={!!parsed} onclick={() => fileInput?.click()}>
      <span class="bm-sheet__drop-icon" aria-hidden="true">{@html iconFolder(20)}</span>
      <span class="bm-sheet__drop-text">
        {#if parsed}
          <strong>{fileName}</strong>
          <span>Найдено тайтлов: {total} · выбрать другой файл</span>
        {:else}
          <strong>Выбрать файл</strong>
          <span>JSON-выгрузка списка аниме</span>
        {/if}
      </span>
    </button>

    {#if summary.length}
      <ul class="bm-sheet__summary">
        {#each summary as s (s.label)}
          <li><span>{s.label}</span><span>{s.count}</span></li>
        {/each}
      </ul>
    {/if}

    {#if parsed?.rewatching.length}
      <section class="bm-sheet__group">
        <h4 class="bm-sheet__label">«Пересматриваю» ({parsed.rewatching.length}) — такого списка нет, куда перенести?</h4>
        <div class="bm-sheet__chips" role="radiogroup" aria-label="Список для «Пересматриваю»">
          {#each IMPORT_TARGET_LISTS as l (l.value)}
            <button
              type="button"
              class="bm-sheet__chip"
              class:bm-sheet__chip--on={rewatchingTo === l.value}
              role="radio"
              aria-checked={rewatchingTo === l.value}
              onclick={() => (rewatchingTo = l.value)}
            >{l.label}</button>
          {/each}
        </div>
      </section>
    {/if}

    {#if limitReached}
      <p class="bm-sheet__error" role="alert">Импорт уже был в этом месяце — следующий будет доступен позже.</p>
    {:else}
      <p class="bm-sheet__note">Импорт доступен раз в месяц.</p>
    {/if}
    {#if error}
      <p class="bm-sheet__error" role="alert">{error}</p>
    {/if}

    <div class="bm-sheet__actions">
      <UiV2Button label="Отмена" variant="chrome" size="lg" disabled={busy} onclick={onClose} />
      <UiV2Button
        label={busy ? 'Переносим…' : 'Перенести'}
        variant="primary"
        size="lg"
        disabled={busy || !parsed || limitReached}
        onclick={() => void run()}
      />
    </div>
  </div>
</div>
