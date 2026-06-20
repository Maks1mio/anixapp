<script lang="ts">
  import { onMount } from 'svelte';
  import { getAdminToken } from '../../stores/admin';
  import { mapOverviewBanner, type OverviewBanner } from '../../utils/overview';
  import { parseBannerReleaseId } from '../../utils/heroPlayback';
  import { resolveUploadUrl, invalidateOverviewOverridesCache } from '../../services/overview-overrides';
  import {
    deleteOverviewOverride,
    deleteOverviewVideo,
    fetchAdminOverviewOverrides,
    formatTimeSec,
    segmentsTotalDuration,
    uploadOverviewBackground,
    type OverviewOverrideAdmin,
  } from '../../services/overview-admin-api';
  import type { VideoSegment } from '../../services/overview-overrides';

  let banners = $state<OverviewBanner[]>([]);
  let overrides = $state<Map<number, OverviewOverrideAdmin>>(new Map());
  let selectedId = $state<number | null>(null);
  let loadError = $state('');
  let formError = $state('');
  let busy = $state(false);

  const selectedBanner = $derived(banners.find((b) => b.id === selectedId) ?? null);
  const selectedOverride = $derived(selectedId != null ? overrides.get(selectedId) ?? null : null);
  const releaseId = $derived(selectedBanner ? parseBannerReleaseId(selectedBanner) : null);
  const bgUrl = $derived(
    resolveUploadUrl(selectedOverride?.customBgUrl ?? null) || selectedBanner?.image || ''
  );
  const renderedUrl = $derived(resolveUploadUrl(selectedOverride?.customVideoUrl ?? null));
  const segments = $derived(selectedOverride?.segments ?? []);
  const hasCarouselVideo = $derived(
    Boolean(renderedUrl || segments.length > 0 || selectedOverride?.sourceVideoUrl)
  );
  const totalSegDur = $derived(segmentsTotalDuration(segments));

  async function loadBanners() {
    if (!window.anixApi?.discover?.interesting) {
      throw new Error('Anixart API недоступен');
    }
    const raw = await window.anixApi.discover.interesting();
    const list = Array.isArray(raw) ? raw : (raw as { content?: unknown[] })?.content ?? [];
    banners = list
      .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
      .map((item) => mapOverviewBanner(item))
      .filter((b): b is OverviewBanner => b != null);
  }

  async function loadOverrides() {
    const token = getAdminToken();
    if (!token) return;
    const rows = await fetchAdminOverviewOverrides(token);
    overrides = new Map(rows.map((r) => [r.bannerId, r]));
  }

  async function load() {
    loadError = '';
    try {
      await Promise.all([loadBanners(), loadOverrides()]);
      if (!selectedId && banners.length > 0) selectBanner(banners[0]!.id);
    } catch (e) {
      loadError = e instanceof Error ? e.message : 'Ошибка загрузки';
    }
  }

  onMount(() => {
    void load();
    const onDone = () => {
      invalidateOverviewOverridesCache();
      void loadOverrides();
    };
    window.addEventListener('anix:overviewEditorDone', onDone);
    return () => window.removeEventListener('anix:overviewEditorDone', onDone);
  });

  function selectBanner(id: number) {
    selectedId = id;
    formError = '';
  }

  async function runWithBusy(fn: () => Promise<void>) {
    if (busy) return;
    busy = true;
    formError = '';
    try {
      await fn();
      await loadOverrides();
    } catch (e) {
      formError = e instanceof Error ? e.message : 'Ошибка';
    } finally {
      busy = false;
    }
  }

  async function onBgFile(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file || selectedId == null) return;
    await runWithBusy(async () => {
      const token = getAdminToken();
      if (!token) throw new Error('Нет сессии');
      await uploadOverviewBackground(token, selectedId!, file);
    });
  }

  function openVideoEditor() {
    if (!selectedBanner || selectedId == null) return;
    const token = getAdminToken();
    if (!token) {
      formError = 'Нет сессии админки';
      return;
    }
    const ov = overrides.get(selectedId);
    void window.electron?.openOverviewVideoEditor?.({
      bannerId: selectedId,
      releaseId,
      title: selectedBanner.title || `Баннер #${selectedId}`,
      segments: ov?.segments ?? [],
      sourceVideoUrl: ov?.sourceVideoUrl ?? null,
      adminToken: token,
      crossfade: 0.5,
    });
  }

  async function deleteVideo() {
    if (selectedId == null) return;
    if (!confirm('Удалить кастомное видео и все фрагменты? Фон карусели останется.')) return;
    await runWithBusy(async () => {
      const token = getAdminToken();
      if (!token) throw new Error('Нет сессии');
      await deleteOverviewVideo(token, selectedId!);
      invalidateOverviewOverridesCache();
    });
  }

  async function resetOverride() {
    if (selectedId == null || !confirm('Сбросить все кастомизации для этого баннера?')) return;
    await runWithBusy(async () => {
      const token = getAdminToken();
      if (!token) throw new Error('Нет сессии');
      await deleteOverviewOverride(token, selectedId!);
      invalidateOverviewOverridesCache();
    });
  }
</script>

<div class="admin-workspace overview-admin">
  <aside class="admin-list" aria-label="Баннеры обзора">
    <div class="admin-list__toolbar">
      <p class="admin-list__title">Карусель</p>
      <span class="admin-list__chip">{banners.length}</span>
    </div>

    {#if banners.length === 0}
      <div class="admin-list__empty">
        <p>Баннеры не загружены</p>
      </div>
    {:else}
      <ul class="admin-list__items">
        {#each banners as b (b.id)}
          {@const ov = overrides.get(b.id)}
          <li>
            <button
              type="button"
              class="admin-list__item"
              class:admin-list__item--active={selectedId === b.id}
              onclick={() => selectBanner(b.id)}
            >
              <span class="overview-admin__thumb" style:background-image={ov?.customBgUrl ? `url(${resolveUploadUrl(ov.customBgUrl)})` : b.image ? `url(${b.image})` : undefined}></span>
              <span class="admin-list__preview">{b.title || `Баннер #${b.id}`}</span>
              <span class="admin-list__meta">
                {#if ov?.customVideoUrl}<span class="admin-list__chip">Видео</span>{/if}
                {#if ov?.customBgUrl}<span class="admin-list__chip">Фон</span>{/if}
              </span>
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  </aside>

  <section class="admin-editor overview-admin__editor" aria-label="Редактор баннера">
    {#if selectedBanner}
      <div class="admin-editor__head">
        <div>
          <h2 class="admin-editor__title">{selectedBanner.title}</h2>
          <p class="admin-editor__sub">
            ID баннера {selectedBanner.id}
            {#if releaseId} · релиз {releaseId}{/if}
          </p>
        </div>
      </div>

      {#if formError}
        <p class="admin-page__error admin-page__error--inline" role="alert">{formError}</p>
      {/if}

      <div class="settings-section admin-editor__section">
        <p class="settings-section__label">Фон карусели</p>
        <div class="settings-section__body overview-admin__bg-row">
          {#if bgUrl}
            <img class="overview-admin__bg-preview" src={bgUrl} alt="" />
          {/if}
          <div class="overview-admin__actions">
            <label class="btn btn-secondary btn-sm">
              Загрузить фон
              <input type="file" accept="image/png,image/jpeg,image/webp" hidden onchange={onBgFile} />
            </label>
            <p class="settings-row__desc">Заменяет постер в hero-карусели на главной «Обзор»</p>
          </div>
        </div>
      </div>

      <div class="settings-section admin-editor__section">
        <p class="settings-section__label">Видео для карусели</p>
        <div class="settings-section__body">
          <p class="settings-row__desc">
            Откройте видеоредактор в отдельном окне: нарезка фрагментов, 1 серия с выбором озвучки,
            загрузка своего MP4, плавные переходы и экспорт на сервер.
          </p>
          <div class="overview-admin__actions">
            <button type="button" class="btn btn-primary" onclick={openVideoEditor}>
              Открыть видеоредактор
            </button>
            {#if hasCarouselVideo}
              <button
                type="button"
                class="btn btn-secondary btn-sm"
                disabled={busy}
                onclick={() => void deleteVideo()}
              >
                Удалить видео
              </button>
            {/if}
            {#if segments.length > 0}
              <span class="admin-list__chip">{segments.length} фрагм. · {formatTimeSec(totalSegDur)}</span>
            {/if}
          </div>
          {#if renderedUrl}
            <!-- svelte-ignore a11y_media_has_caption -->
            <video class="overview-admin__video overview-admin__video--rendered" src={renderedUrl} controls preload="metadata"></video>
          {/if}
        </div>
      </div>

      <footer class="admin-editor__foot">
        <button type="button" class="btn btn-secondary" disabled={busy} onclick={resetOverride}>
          Сбросить кастомизацию
        </button>
      </footer>
    {:else}
      <div class="admin-editor__empty">
        <h2 class="admin-editor__empty-title">Выберите баннер</h2>
        <p class="admin-editor__empty-text">Слева — все баннеры из Anixart API (discover.interesting).</p>
      </div>
    {/if}
  </section>
</div>

{#if loadError}
  <p class="admin-page__error" role="alert">{loadError}</p>
{/if}
