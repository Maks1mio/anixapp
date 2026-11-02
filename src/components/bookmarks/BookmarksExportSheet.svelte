<script lang="ts">
  import { fade, scale } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { portal } from '../../actions/portal';
  import UiV2Button from '../uikit-v2/UiV2Button.svelte';
  import UiV2Toggle from '../uikit-v2/UiV2Toggle.svelte';
  import UiV2SettingsRow from '../uikit-v2/UiV2SettingsRow.svelte';
  import { showToast } from '../../stores/toast';
  import {
    EXPORT_PROFILE_LISTS,
    EXPORT_EXTRA_FIELDS,
    EXPORT_SORTS,
    buildBookmarksExport,
    downloadTextFile,
    type ExportFormat,
  } from '../../utils/bookmarks-export';

  type Props = {
    onClose: () => void;
  };

  let { onClose }: Props = $props();

  const titleId = 'bookmarks-export-title';
  const FORMATS: { value: ExportFormat; label: string; description: string }[] = [
    { value: 'csv', label: 'Таблица CSV', description: 'Откроется в Excel или Google Таблицах' },
    { value: 'txt', label: 'Текстовый документ', description: 'Простой список, по строке на тайтл' },
  ];

  let lists = $state<number[]>([1, 2, 3, 4, 5]);
  let extra = $state<number[]>([0, 2]);
  let format = $state<ExportFormat>('csv');
  let sort = $state(0);
  let busy = $state(false);
  let error = $state('');

  function toggle(arr: number[], value: number, on: boolean): number[] {
    return on ? [...new Set([...arr, value])] : arr.filter((v) => v !== value);
  }

  async function run() {
    if (!lists.length || busy) return;
    if (!window.anixApi?.bookmarks) {
      error = 'Экспорт недоступен';
      return;
    }
    busy = true;
    error = '';
    try {
      const res = await window.anixApi.bookmarks.export([...lists].sort(), sort);
      if (res?.code === 2) throw new Error('Выбраны недопустимые списки');
      const releases = Array.isArray(res?.releases) ? res.releases : [];
      if (!releases.length) {
        error = 'В выбранных списках пока ничего нет';
        return;
      }
      const text = buildBookmarksExport(releases, format, extra);
      const stamp = new Date().toISOString().slice(0, 10);
      downloadTextFile(
        text,
        `anixart-bookmarks-${stamp}.${format}`,
        format === 'csv' ? 'text/csv' : 'text/plain',
      );
      showToast(`Экспортировано тайтлов: ${releases.length}`);
      onClose();
    } catch (err) {
      error = err instanceof Error && err.message ? err.message : 'Не удалось выгрузить закладки';
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
    <h3 id={titleId} class="uiv2-choice-sheet__title">Экспорт закладок</h3>

    <section class="bm-sheet__group">
      <h4 class="bm-sheet__label">Списки</h4>
      {#each EXPORT_PROFILE_LISTS as l (l.value)}
        <UiV2SettingsRow title={l.label}>
          <UiV2Toggle
            label={l.label}
            checked={lists.includes(l.value)}
            onChange={(on) => (lists = toggle(lists, l.value, on))}
          />
        </UiV2SettingsRow>
      {/each}
    </section>

    <section class="bm-sheet__group">
      <h4 class="bm-sheet__label">Формат</h4>
      <ul class="uiv2-choice-sheet__list" role="radiogroup" aria-label="Формат">
        {#each FORMATS as f (f.value)}
          <li>
            <button
              type="button"
              class="uiv2-choice-sheet__option"
              class:uiv2-choice-sheet__option--on={format === f.value}
              role="radio"
              aria-checked={format === f.value}
              onclick={() => (format = f.value)}
            >
              <span class="uiv2-choice-sheet__radio" aria-hidden="true"></span>
              <span class="uiv2-choice-sheet__body">
                <span class="uiv2-choice-sheet__label">{f.label}</span>
                <span class="uiv2-choice-sheet__description">{f.description}</span>
              </span>
            </button>
          </li>
        {/each}
      </ul>
    </section>

    <section class="bm-sheet__group">
      <h4 class="bm-sheet__label">Дополнительные данные</h4>
      {#each EXPORT_EXTRA_FIELDS as x (x.value)}
        <UiV2SettingsRow title={x.label}>
          <UiV2Toggle
            label={x.label}
            checked={extra.includes(x.value)}
            onChange={(on) => (extra = toggle(extra, x.value, on))}
          />
        </UiV2SettingsRow>
      {/each}
    </section>

    <section class="bm-sheet__group">
      <h4 class="bm-sheet__label">Сортировка</h4>
      <div class="bm-sheet__chips" role="radiogroup" aria-label="Сортировка">
        {#each EXPORT_SORTS as s (s.value)}
          <button
            type="button"
            class="bm-sheet__chip"
            class:bm-sheet__chip--on={sort === s.value}
            role="radio"
            aria-checked={sort === s.value}
            onclick={() => (sort = s.value)}
          >{s.label}</button>
        {/each}
      </div>
    </section>

    {#if error}
      <p class="bm-sheet__error" role="alert">{error}</p>
    {/if}

    <div class="bm-sheet__actions">
      <UiV2Button label="Отмена" variant="chrome" size="lg" disabled={busy} onclick={onClose} />
      <UiV2Button
        label={busy ? 'Выгружаем…' : 'Экспортировать'}
        variant="primary"
        size="lg"
        disabled={busy || !lists.length}
        onclick={() => void run()}
      />
    </div>
  </div>
</div>
