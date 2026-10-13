<script lang="ts">
  import { onMount } from 'svelte';
  import { uiv2CustomScroll } from '../../actions/uiv2CustomScroll';
  import UiV2Button from '../../components/uikit-v2/UiV2Button.svelte';
  import {
    listBetaReleases,
    uploadBetaBuild,
    deleteBetaBuild,
    type AppReleaseInfo,
  } from '../../services/update-checker';
  import { getAdminToken } from '../../stores/admin';

  let builds = $state<AppReleaseInfo[]>([]);
  let loadError = $state('');
  let formError = $state('');
  let formOk = $state('');
  let busy = $state(false);
  let uploadVersion = $state('');
  let uploadNotes = $state('');
  let uploadFile = $state<File | null>(null);
  let fileInputEl = $state<HTMLInputElement | null>(null);

  function formatDate(iso: string | null | undefined): string {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleDateString('ru-RU', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return '';
    }
  }

  function formatSize(bytes: number | undefined): string {
    if (!bytes || bytes <= 0) return '';
    return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
  }

  async function load() {
    loadError = '';
    try {
      builds = await listBetaReleases();
    } catch (e) {
      builds = [];
      loadError = e instanceof Error ? e.message : 'Ошибка загрузки';
    }
  }

  function onPickFile(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    formError = '';
    formOk = '';
    if (file && !/\.exe$/i.test(file.name)) {
      uploadFile = null;
      input.value = '';
      formError = 'Только Windows .exe';
      return;
    }
    uploadFile = file;
    if (uploadFile && !uploadVersion) {
      const m = uploadFile.name.match(/(\d+\.\d+\.\d+(?:[-.][\w]+)?)/);
      if (m?.[1]) uploadVersion = m[1];
    }
  }

  async function publish() {
    formError = '';
    formOk = '';
    if (!getAdminToken()) {
      formError = 'Сессия админки не найдена';
      return;
    }
    if (!uploadFile) {
      formError = 'Выберите .exe файл';
      return;
    }
    if (!uploadVersion.trim()) {
      formError = 'Укажите версию';
      return;
    }
    busy = true;
    try {
      await uploadBetaBuild({
        file: uploadFile,
        version: uploadVersion,
        notes: uploadNotes,
      });
      formOk = `Опубликовано v${uploadVersion.replace(/^v/i, '')}`;
      uploadFile = null;
      uploadNotes = '';
      if (fileInputEl) fileInputEl.value = '';
      await load();
    } catch (e) {
      formError = e instanceof Error ? e.message : String(e);
    } finally {
      busy = false;
    }
  }

  async function removeBuild(id: string) {
    if (!id || busy) return;
    busy = true;
    formError = '';
    formOk = '';
    try {
      await deleteBetaBuild(id);
      formOk = 'Сборка удалена';
      await load();
    } catch (e) {
      formError = e instanceof Error ? e.message : String(e);
    } finally {
      busy = false;
    }
  }

  onMount(() => {
    void load();
  });
</script>

<div class="upd">
  <aside class="upd__list">
    <div class="upd__head">
      <span class="upd__title">Beta-сборки</span>
      <div class="upd__head-actions">
        {#if loadError}<span class="upd__err-dot" title={loadError}>!</span>{/if}
        <button type="button" class="uiv2-btn uiv2-btn--ghost uiv2-btn--sm" disabled={busy} onclick={() => { void load(); }}>
          Обновить
        </button>
      </div>
    </div>

    {#if builds.length === 0}
      <div class="upd__empty">
        <p>Бета-сборок пока нет</p>
        <p class="upd__hint">Загрузите .exe справа — появится у пользователей Windows в канале Beta.</p>
      </div>
    {:else}
      <div class="upd__scroll uiv2-scroll-area uiv2-scroll-area--y" use:uiv2CustomScroll={{ axis: 'y' }}>
        <ul class="upd__items uiv2-scroll-area__viewport">
          {#each builds as b (b.id || b.tag)}
            <li class="upd__row">
              <div class="upd__row-main">
                <span class="upd__ver">v{b.version}</span>
                {#if b.publishedAt}
                  <span class="upd__meta">{formatDate(b.publishedAt)}</span>
                {/if}
                {#if b.name && b.name !== `Beta ${b.version}`}
                  <span class="upd__notes">{b.name}</span>
                {/if}
              </div>
              <button
                type="button"
                class="uiv2-btn uiv2-btn--ghost uiv2-btn--sm"
                disabled={busy || !b.id}
                onclick={() => { if (b.id) void removeBuild(b.id); }}
              >
                Удалить
              </button>
            </li>
          {/each}
        </ul>
      </div>
    {/if}
  </aside>

  <section class="upd__editor">
    <div class="upd__head">
      <span class="upd__title">Публикация beta</span>
    </div>
    <div class="upd__scroll uiv2-scroll-area uiv2-scroll-area--y" use:uiv2CustomScroll={{ axis: 'y' }}>
      <div class="upd__form uiv2-scroll-area__viewport">
        <p class="upd__lead">
          Только Windows .exe. Stable по-прежнему с GitHub anixapp — сюда загружаются только беты.
        </p>

        <label class="upd__field">
          <span class="upd__label">Версия</span>
          <input
            class="upd__input"
            type="text"
            placeholder="0.1.58-beta.1"
            bind:value={uploadVersion}
            disabled={busy}
          />
        </label>

        <label class="upd__field">
          <span class="upd__label">Заметка</span>
          <input
            class="upd__input"
            type="text"
            placeholder="Что нового в бете"
            bind:value={uploadNotes}
            disabled={busy}
          />
        </label>

        <label class="upd__field">
          <span class="upd__label">Установщик (.exe)</span>
          <input
            bind:this={fileInputEl}
            class="upd__file"
            type="file"
            accept=".exe,application/x-msdownload,application/octet-stream"
            disabled={busy}
            onchange={onPickFile}
          />
          {#if uploadFile}
            <span class="upd__meta">
              {uploadFile.name}
              {#if uploadFile.size}
                · {formatSize(uploadFile.size)}
              {/if}
            </span>
          {/if}
        </label>

        <div class="upd__actions">
          <UiV2Button
            label={busy ? 'Загрузка…' : 'Опубликовать beta'}
            size="sm"
            variant="primary"
            disabled={busy || !uploadFile || !uploadVersion.trim()}
            onclick={() => { void publish(); }}
          />
        </div>

        {#if formError}
          <p class="upd__msg upd__msg--err">{formError}</p>
        {/if}
        {#if formOk}
          <p class="upd__msg upd__msg--ok">{formOk}</p>
        {/if}
      </div>
    </div>
  </section>
</div>

<style>
  .upd {
    display: flex;
    flex: 1;
    min-height: 0;
    width: 100%;
    height: 100%;
  }

  .upd__list {
    width: min(22rem, 38%);
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    min-height: 0;
    border-right: 1px solid color-mix(in srgb, var(--uikit-v2-text, #fff) 10%, transparent);
    background: color-mix(in srgb, var(--uikit-v2-surface, #121212) 96%, #000);
  }

  .upd__editor {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
  }

  .upd__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.85rem 1rem;
    border-bottom: 1px solid color-mix(in srgb, var(--uikit-v2-text, #fff) 10%, transparent);
    flex-shrink: 0;
  }

  .upd__title {
    font-size: 0.92rem;
    font-weight: 700;
    color: var(--uikit-v2-text, #fff);
  }

  .upd__head-actions {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }

  .upd__err-dot {
    display: inline-flex;
    width: 1.1rem;
    height: 1.1rem;
    align-items: center;
    justify-content: center;
    border-radius: 999px;
    font-size: 0.7rem;
    font-weight: 800;
    color: #fff;
    background: #ef4444;
  }

  .upd__empty {
    padding: 1.25rem 1rem;
    color: var(--uikit-v2-muted, #9ca3af);
    font-size: 0.88rem;
  }

  .upd__hint {
    margin: 0.4rem 0 0;
    font-size: 0.8rem;
    line-height: 1.4;
    color: var(--uikit-v2-muted, #9ca3af);
  }

  .upd__scroll {
    flex: 1;
    min-height: 0;
  }

  .upd__items {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .upd__row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.75rem 1rem;
    border-bottom: 1px solid color-mix(in srgb, var(--uikit-v2-text, #fff) 8%, transparent);
  }

  .upd__row-main {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    min-width: 0;
  }

  .upd__ver {
    font-size: 0.92rem;
    font-weight: 700;
    color: var(--uikit-v2-text, #fff);
  }

  .upd__meta,
  .upd__notes {
    font-size: 0.75rem;
    color: var(--uikit-v2-muted, #9ca3af);
  }

  .upd__notes {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .upd__form {
    display: flex;
    flex-direction: column;
    gap: 0.85rem;
    padding: 1rem 1.15rem 1.5rem;
    max-width: 28rem;
  }

  .upd__lead {
    margin: 0;
    font-size: 0.82rem;
    line-height: 1.45;
    color: var(--uikit-v2-muted, #9ca3af);
  }

  .upd__field {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .upd__label {
    font-size: 0.75rem;
    font-weight: 650;
    color: var(--uikit-v2-muted, #9ca3af);
  }

  .upd__input {
    appearance: none;
    border: 1px solid color-mix(in srgb, var(--uikit-v2-text, #fff) 14%, transparent);
    border-radius: 8px;
    background: color-mix(in srgb, var(--uikit-v2-surface, #1a1a1a) 92%, #000);
    color: var(--uikit-v2-text, #fff);
    font: inherit;
    font-size: 0.9rem;
    padding: 0.55rem 0.7rem;
  }

  .upd__input:focus {
    outline: 2px solid color-mix(in srgb, var(--uikit-v2-accent, #ef4444) 55%, transparent);
    outline-offset: 1px;
  }

  .upd__file {
    font: inherit;
    font-size: 0.82rem;
    color: var(--uikit-v2-text, #fff);
  }

  .upd__actions {
    display: flex;
    gap: 0.5rem;
  }

  .upd__msg {
    margin: 0;
    font-size: 0.82rem;
  }

  .upd__msg--err {
    color: #f87171;
  }

  .upd__msg--ok {
    color: #4ade80;
  }
</style>
