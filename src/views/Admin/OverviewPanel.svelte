<script lang="ts">
  import { onMount } from 'svelte';
  import { uiv2CustomScroll } from '../../actions/uiv2CustomScroll';
  import { clearOverviewCache } from '../../utils/overviewCache';
  import { getAdminToken } from '../../stores/admin';
  import { mapOverviewBanner, type OverviewBanner } from '../../utils/overview';
  import { parseBannerReleaseId } from '../../utils/heroPlayback';
  import { resolveUploadUrl, invalidateOverviewOverridesCache } from '../../services/overview-overrides';
  import {
    deleteOverviewOverride,
    deleteOverviewVideo,
    fetchAdminOverviewOverrides,
    formatTimeSec,
    pruneOverviewOverrides,
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
  let pruneInfo = $state('');

  const customizedCount = $derived(
    banners.filter((b) => {
      const ov = overrides.get(b.id);
      return Boolean(ov?.customBgUrl || ov?.customVideoUrl || ov?.sourceVideoUrl || (ov?.segments?.length ?? 0) > 0);
    }).length
  );

  const selectedBanner = $derived(banners.find((b) => b.id === selectedId) ?? null);
  const selectedOverride = $derived(selectedId != null ? overrides.get(selectedId) ?? null : null);
  const releaseId = $derived(selectedBanner ? parseBannerReleaseId(selectedBanner) : null);
  const bgUrl = $derived(
    resolveUploadUrl(selectedOverride?.customBgUrl ?? null) || selectedBanner?.image || ''
  );
  const renderedUrl = $derived(
    resolveUploadUrl(selectedOverride?.customVideoUrl ?? null, selectedOverride?.updatedAt)
  );
  const segments = $derived(selectedOverride?.segments ?? []);
  const hasCarouselVideo = $derived(
    Boolean(renderedUrl || segments.length > 0 || selectedOverride?.sourceVideoUrl)
  );
  const totalSegDur = $derived(segmentsTotalDuration(segments));

  async function loadBanners() {
    if (!window.anixApi?.discover?.interesting) throw new Error('Anixart API недоступен');
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
      await loadBanners();
      const bannerIds = banners.map((b) => b.id).filter((id) => id > 0);
      const token = getAdminToken();
      if (token && bannerIds.length > 0) {
        const deleted = await pruneOverviewOverrides(token, bannerIds);
        invalidateOverviewOverridesCache();
        clearOverviewCache();
        pruneInfo = deleted.length > 0
          ? `Удалено устаревших кастомизаций: ${deleted.length}`
          : 'Синхронизация: устаревших записей нет';
      } else {
        pruneInfo = '';
      }
      await loadOverrides();
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
    if (!token) { formError = 'Нет сессии админки'; return; }
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

<div class="adm-overview">
  <!-- Banner list sidebar -->
  <aside class="adm-overview__list">
    <div class="adm-overview__list-head">
      <span class="adm-overview__list-title">Карусель</span>
      <div class="adm-overview__list-chips">
        <span class="adm-chip">{banners.length} API</span>
        {#if customizedCount > 0}
          <span class="adm-chip adm-chip--accent">{customizedCount} кастомных</span>
        {/if}
      </div>
    </div>

    {#if pruneInfo}
      <p class="adm-overview__prune">{pruneInfo}</p>
    {/if}

    {#if loadError}
      <p class="adm-msg adm-msg--error" role="alert">{loadError}</p>
    {:else if banners.length === 0}
      <div class="adm-overview__empty-list">
        <p>Баннеры не загружены</p>
      </div>
    {:else}
      <div class="adm-overview__scroll uiv2-scroll-area uiv2-scroll-area--y" use:uiv2CustomScroll={{ axis: 'y' }}>
        <ul class="adm-overview__items uiv2-scroll-area__viewport">
          {#each banners as b (b.id)}
            {@const ov = overrides.get(b.id)}
            <li>
              <button
                type="button"
                class="adm-overview__item"
                class:adm-overview__item--active={selectedId === b.id}
                onclick={() => selectBanner(b.id)}
              >
                <span
                  class="adm-overview__thumb"
                  style:background-image={ov?.customBgUrl
                    ? `url(${resolveUploadUrl(ov.customBgUrl)})`
                    : b.image ? `url(${b.image})` : undefined}
                ></span>
                <span class="adm-overview__item-body">
                  <span class="adm-overview__item-title">{b.title || `Баннер #${b.id}`}</span>
                  <span class="adm-overview__item-chips">
                    {#if ov?.customVideoUrl}<span class="adm-chip">Видео</span>{/if}
                    {#if ov?.customBgUrl}<span class="adm-chip">Фон</span>{/if}
                  </span>
                </span>
              </button>
            </li>
          {/each}
        </ul>
        <div class="uiv2-scroll-area__v-track" aria-hidden="true"><div class="uiv2-scroll-area__v-thumb"></div></div>
      </div>
    {/if}
  </aside>

  <!-- Banner editor -->
  <section class="adm-overview__editor uiv2-scroll-area uiv2-scroll-area--y" use:uiv2CustomScroll={{ axis: 'y' }}>
  <div class="uiv2-scroll-area__viewport adm-overview__editor-vp">
    {#if selectedBanner}
      <header class="adm-editor__head">
        <div>
          <h2 class="adm-editor__title">{selectedBanner.title}</h2>
          <p class="adm-editor__sub">
            ID баннера {selectedBanner.id}
            {#if releaseId} · релиз {releaseId}{/if}
          </p>
        </div>
      </header>

      {#if formError}
        <p class="adm-msg adm-msg--error adm-msg--inline" role="alert">{formError}</p>
      {/if}

      <div class="adm-section">
        <p class="adm-section__label">Фон карусели</p>
        <div class="adm-overview__bg-row">
          {#if bgUrl}
            <img class="adm-overview__bg-preview" src={bgUrl} alt="" />
          {/if}
          <div class="adm-overview__bg-actions">
            <label class="uiv2-btn uiv2-btn--chrome uiv2-btn--md">
              Загрузить фон
              <input type="file" accept="image/png,image/jpeg,image/webp" hidden onchange={onBgFile} />
            </label>
            <p class="adm-section__desc">Заменяет постер в hero-карусели на главной «Обзор»</p>
          </div>
        </div>
      </div>

      <div class="adm-section">
        <p class="adm-section__label">Видео для карусели</p>
        <p class="adm-section__desc">
          Откройте видеоредактор в отдельном окне: нарезка фрагментов, 1 серия с выбором озвучки,
          загрузка своего MP4, плавные переходы и экспорт на сервер.
        </p>
        <div class="adm-overview__video-actions">
          <button type="button" class="uiv2-btn uiv2-btn--primary uiv2-btn--md" onclick={openVideoEditor}>
            Открыть видеоредактор
          </button>
          {#if hasCarouselVideo}
            <button
              type="button"
              class="uiv2-btn uiv2-btn--ghost uiv2-btn--md"
              disabled={busy}
              onclick={() => void deleteVideo()}
            >
              Удалить видео
            </button>
          {/if}
          {#if segments.length > 0}
            <span class="adm-chip">{segments.length} фрагм. · {formatTimeSec(totalSegDur)}</span>
          {/if}
        </div>
        {#if renderedUrl}
          <!-- svelte-ignore a11y_media_has_caption -->
          <video class="adm-overview__video-preview" src={renderedUrl} controls preload="metadata"></video>
        {/if}
      </div>

      <footer class="adm-editor__foot">
        <button type="button" class="uiv2-btn uiv2-btn--ghost uiv2-btn--md adm-editor__delete" disabled={busy} onclick={resetOverride}>
          Сбросить кастомизацию
        </button>
      </footer>
    {:else}
      <div class="adm-empty">
        <div class="adm-empty__icon" aria-hidden="true">🖼</div>
        <h2 class="adm-empty__title">Выберите баннер</h2>
        <p class="adm-empty__text">Слева — актуальный список из Anixart API. Кастомизации хранятся только для баннеров с метками «Видео» / «Фон».</p>
      </div>
    {/if}
  </div>
  <div class="uiv2-scroll-area__v-track" aria-hidden="true"><div class="uiv2-scroll-area__v-thumb"></div></div>
  </section>
</div>

<style lang="scss">
.adm-overview {
  display: grid;
  grid-template-columns: 17rem minmax(0, 1fr);
  grid-template-rows: 1fr;
  height: 100%;
  min-height: 0;
  overflow: hidden;
}

.adm-overview__list {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  border-right: 1px solid var(--uiv2-border-subtle);
}

.adm-overview__list-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.85rem 1rem;
  border-bottom: 1px solid var(--uiv2-border-subtle);
  flex-shrink: 0;
  gap: 0.5rem;
}

.adm-overview__list-title {
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--uiv2-fg-muted);
}

.adm-overview__list-chips {
  display: flex;
  gap: 0.3rem;
}

.adm-overview__prune {
  margin: 0;
  padding: 0.45rem 1rem;
  font-size: 0.75rem;
  color: var(--uiv2-fg-muted);
  border-bottom: 1px solid var(--uiv2-border-subtle);
  flex-shrink: 0;
}

.adm-overview__empty-list {
  padding: 2rem 1rem;
  text-align: center;
  font-size: 0.875rem;
  color: var(--uiv2-fg-muted);
}

.adm-overview__scroll {
  flex: 1 1 auto;
  min-height: 0;
  position: relative;
}

.adm-overview__items {
  list-style: none;
  margin: 0;
  padding: 0.35rem;
}

.adm-overview__item {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  width: 100%;
  padding: 0.5rem 0.7rem;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: background 0.12s ease;

  &:hover { background: var(--uiv2-hover-bg); }
  &--active { background: var(--uiv2-selected-bg); }
}

.adm-overview__thumb {
  width: 3rem;
  height: 2rem;
  border-radius: 6px;
  flex-shrink: 0;
  background-size: cover;
  background-position: center;
  background-color: var(--uiv2-surface-raised);
}

.adm-overview__item-body {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  min-width: 0;
  flex: 1;
}

.adm-overview__item-title {
  font-size: 0.8125rem;
  line-height: 1.3;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.adm-overview__item-chips {
  display: flex;
  gap: 0.25rem;
}

.adm-overview__editor {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  position: relative;
}

.adm-overview__editor :global(.uiv2-scroll-area__viewport) {
  overflow-x: hidden;
  overflow-y: auto;
}

.adm-overview__editor-vp {
  display: block;
  height: auto;
}

.adm-overview__editor-vp > :global(*) {
  flex-shrink: 0;
}

.adm-overview__bg-row {
  display: flex;
  gap: 1rem;
  align-items: flex-start;
}

.adm-overview__bg-preview {
  width: 10rem;
  height: 5.5rem;
  object-fit: cover;
  border-radius: 8px;
  flex-shrink: 0;
  border: 1px solid var(--uiv2-border-subtle);
}

.adm-overview__bg-actions {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.adm-overview__video-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: center;
  margin-bottom: 0.75rem;
}

.adm-overview__video-preview {
  display: block;
  width: 100%;
  max-width: 28rem;
  border-radius: 8px;
  border: 1px solid var(--uiv2-border-subtle);
}

/* Shared across admin panels */
.adm-editor__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  padding: 1.25rem 1.5rem 1rem;
  border-bottom: 1px solid var(--uiv2-border-subtle);
  flex-shrink: 0;
}

.adm-editor__title {
  margin: 0;
  font-size: 1.2rem;
  font-weight: 700;
  letter-spacing: -0.01em;
}

.adm-editor__sub {
  margin: 0.2rem 0 0;
  font-size: 0.8125rem;
  color: var(--uiv2-fg-muted);
}

.adm-editor__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.85rem 1.5rem;
  border-top: 1px solid var(--uiv2-border-subtle);
  flex-shrink: 0;
}

.adm-editor__delete {
  color: color-mix(in srgb, var(--uikit-v2-danger) 80%, #fff);
}

.adm-section {
  padding: 1rem 1.5rem;
  border-bottom: 1px solid var(--uiv2-border-subtle);
  flex-shrink: 0;
}

.adm-section__label {
  margin: 0 0 0.65rem;
  font-size: 0.6875rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--uiv2-fg-muted);
}

.adm-section__desc {
  margin: -0.3rem 0 0.75rem;
  font-size: 0.8rem;
  color: var(--uiv2-fg-muted);
  line-height: 1.45;
}

.adm-chip {
  font-size: 0.67rem;
  font-weight: 600;
  padding: 0.1rem 0.4rem;
  border-radius: 4px;
  background: var(--uiv2-surface-raised);
  color: var(--uiv2-fg-muted);

  &--accent {
    color: var(--uikit-v2-accent);
    background: color-mix(in srgb, var(--uikit-v2-accent) 12%, transparent);
  }
}

.adm-msg {
  padding: 0.55rem 0.85rem;
  border-radius: 8px;
  font-size: 0.8125rem;
  margin: 0;
  flex-shrink: 0;

  &--error {
    color: var(--uikit-v2-danger);
    background: color-mix(in srgb, var(--uikit-v2-danger) 10%, transparent);
    border: 1px solid color-mix(in srgb, var(--uikit-v2-danger) 25%, transparent);
  }

  &--inline {
    margin: 0.5rem 1.5rem;
  }
}

.adm-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  text-align: center;
  padding: 2rem;
  gap: 0.75rem;
}

.adm-empty__icon {
  width: 3.5rem;
  height: 3.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: var(--uiv2-surface-raised);
  font-size: 1.5rem;
}

.adm-empty__title {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 600;
}

.adm-empty__text {
  margin: 0;
  font-size: 0.875rem;
  color: var(--uiv2-fg-muted);
  max-width: 22rem;
}
</style>
