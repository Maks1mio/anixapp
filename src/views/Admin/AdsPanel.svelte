<script lang="ts">
  import { onMount } from 'svelte';
  import { uiv2CustomScroll } from '../../actions/uiv2CustomScroll';
  import AdFigmaEditor from '../../components/uikit-v2/AdFigmaEditor.svelte';
  import {
    AD_SLOT_OPTIONS,
    adEmbedUrlById,
    adEmbedUrlBySlot,
    adIframeSnippet,
    blankAdDraft,
    createAd,
    deleteAd,
    ensureAdDesign,
    fetchAds,
    fileToDataUrl,
    resolveAdImageUrl,
    setCoverImage,
    updateAd,
    uploadAdImage,
    type CrtAdCreative,
  } from '../../services/ads-api';
  import { getAdminToken } from '../../stores/admin';
  import {
    type CrtScreenStates,
  } from '../../utils/crtScreen';
  import { type VpnBannerStates } from '../../utils/vpnSponsorBanner';
  import {
    type AdDesignStates,
  } from '../../utils/adDesignDoc';
  import { cloneDesignStatesAligned } from '../../utils/adDesignMotion';

  type FormState = Omit<CrtAdCreative, 'id' | 'createdAt' | 'updatedAt'> & { id: string | null };

  let ads = $state<CrtAdCreative[]>([]);
  let loadError = $state('');
  let formError = $state('');
  let busy = $state(false);
  let selectedId = $state<string | null>(null);
  let creating = $state(false);
  let designMode = $state(false);
  let iframeKey = $state(0);
  let formUpdatedAt = $state('');

  let formTitle = $state('Новая реклама');
  let formSlot = $state('connection');
  let formHref = $state('');
  let formActive = $state(true);
  let formWidth = $state('100%');
  let formHeight = $state('auto');
  let formAspect = $state('16 / 11');
  let formImageUrl = $state<string | null>(null);
  let formCrt = $state<CrtScreenStates>(blankAdDraft().crt);
  let formOverlay = $state<VpnBannerStates>(blankAdDraft().overlay);
  let formDesign = $state<AdDesignStates>(blankAdDraft().design);
  let pendingImage = $state<File | null>(null);

  const selected = $derived(selectedId ? ads.find((a) => a.id === selectedId) ?? null : null);
  const panelOpen = $derived(creating || selected != null);
  const slotLabel = $derived(
    (AD_SLOT_OPTIONS.find((s) => s.value === formSlot)?.label ?? formSlot) || 'слот',
  );
  const slotTaken = $derived(
    formActive
      && ads.some((a) => a.active && a.slot === formSlot.trim() && a.id !== selectedId),
  );
  const embedBySlot = $derived(adIframeSnippet({ slot: formSlot.trim() || 'connection', width: formWidth, aspectRatio: formAspect }));
  const embedById = $derived(
    selectedId && !creating
      ? adIframeSnippet({ id: selectedId, width: formWidth, aspectRatio: formAspect })
      : '',
  );
  const livePlayerSrc = $derived(
    selectedId && !creating
      ? `${adEmbedUrlById(selectedId)}?t=${encodeURIComponent(formUpdatedAt || String(iframeKey))}`
      : formSlot
        ? `${adEmbedUrlBySlot(formSlot.trim())}?t=${encodeURIComponent(formUpdatedAt || String(iframeKey))}`
        : '',
  );

  function coverUrl(imageUrl = formImageUrl, stamp = formUpdatedAt) {
    return resolveAdImageUrl(imageUrl, stamp) || imageUrl;
  }

  function emptyForm(): FormState {
    const draft = blankAdDraft();
    return { ...draft, id: null };
  }

  function applyForm(next: FormState & { updatedAt?: string }) {
    formTitle = next.title;
    formSlot = next.slot;
    formHref = next.href;
    formActive = next.active;
    formWidth = next.width;
    formHeight = next.height;
    formAspect = next.aspectRatio;
    formImageUrl = next.imageUrl;
    formCrt = next.crt;
    formOverlay = next.overlay;
    formDesign = ensureAdDesign({
      design: next.design,
      overlay: next.overlay,
      crt: next.crt,
      imageUrl: coverUrl(next.imageUrl, next.updatedAt || ''),
    });
    formUpdatedAt = next.updatedAt || '';
    pendingImage = null;
    formError = '';
    designMode = false;
  }

  async function load(selectId?: string | null) {
    loadError = '';
    const token = getAdminToken();
    if (!token) return;
    try {
      ads = await fetchAds(token);
      const id = selectId === undefined ? selectedId : selectId;
      const row = id ? ads.find((a) => a.id === id) : undefined;
      if (row) {
        selectedId = row.id;
        creating = false;
        applyForm({ ...row, id: row.id });
        iframeKey += 1;
      } else if (ads[0] && !creating) {
        selectAd(ads[0].id);
      } else if (ads.length === 0) {
        startCreate();
      }
    } catch (e) {
      loadError = e instanceof Error ? e.message : 'Ошибка загрузки';
    }
  }

  onMount(() => {
    void load();
  });

  function startCreate() {
    creating = true;
    selectedId = null;
    applyForm(emptyForm());
    openEditor();
  }

  function selectAd(id: string) {
    const row = ads.find((a) => a.id === id);
    if (!row) return;
    creating = false;
    selectedId = id;
    applyForm({ ...row, id: row.id });
    iframeKey += 1;
  }

  function openEditor() {
    const cover = coverUrl();
    formDesign = cloneDesignStatesAligned(ensureAdDesign({
      design: formDesign,
      overlay: formOverlay,
      crt: formCrt,
      imageUrl: cover,
    }));
    designMode = true;
  }

  function setFormDesign(next: AdDesignStates) {
    formDesign = cloneDesignStatesAligned(next);
  }

  async function onImageFile(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (selectedId && !creating) {
      busy = true;
      formError = '';
      try {
        const token = getAdminToken();
        if (!token) throw new Error('Нет сессии');
        const dataUrl = await fileToDataUrl(file);
        const updated = await uploadAdImage(selectedId, dataUrl, token);
        ads = ads.map((a) => (a.id === updated.id ? updated : a));
        formImageUrl = updated.imageUrl;
        formUpdatedAt = updated.updatedAt;
        const cover = coverUrl(updated.imageUrl, updated.updatedAt);
        if (cover) formDesign = setCoverImage(cloneDesignStatesAligned(formDesign), cover);
        iframeKey += 1;
      } catch (err) {
        formError = err instanceof Error ? err.message : 'Не удалось загрузить картинку';
      } finally {
        busy = false;
      }
      return;
    }
    pendingImage = file;
    try {
      formImageUrl = await fileToDataUrl(file);
      if (formImageUrl) formDesign = setCoverImage(cloneDesignStatesAligned(formDesign), formImageUrl);
    } catch {
      formError = 'Не удалось прочитать файл';
    }
  }

  async function save() {
    if (busy) return;
    if (!formTitle.trim()) {
      formError = 'Введите название';
      return;
    }
    if (!formSlot.trim()) {
      formError = 'Укажите слот embed';
      return;
    }
    busy = true;
    formError = '';
    try {
      const token = getAdminToken();
      if (!token) throw new Error('Нет сессии');
      const payload = {
        title: formTitle.trim(),
        slot: formSlot.trim(),
        href: formHref.trim(),
        active: formActive,
        width: formWidth.trim() || '100%',
        height: formHeight.trim() || 'auto',
        aspectRatio: formAspect.trim() || '16 / 11',
        crt: formCrt,
        overlay: formOverlay,
        design: cloneDesignStatesAligned(formDesign),
      };
      let saved: CrtAdCreative;
      if (creating || !selectedId) saved = await createAd(payload, token);
      else saved = await updateAd(selectedId, payload, token);
      if (pendingImage) {
        const dataUrl = pendingImage.type.startsWith('image/')
          ? await fileToDataUrl(pendingImage)
          : '';
        if (dataUrl) saved = await uploadAdImage(saved.id, dataUrl, token);
        pendingImage = null;
      }
      creating = false;
      selectedId = saved.id;
      designMode = false;
      formUpdatedAt = saved.updatedAt || new Date().toISOString();
      iframeKey += 1;
      await load(saved.id);
    } catch (e) {
      formError = e instanceof Error ? e.message : 'Ошибка сохранения';
    } finally {
      busy = false;
    }
  }

  async function removeCurrent() {
    if (!selectedId || creating) return;
    if (!confirm('Удалить эту рекламу?')) return;
    busy = true;
    try {
      const token = getAdminToken();
      if (!token) throw new Error('Нет сессии');
      await deleteAd(selectedId, token);
      selectedId = null;
      creating = false;
      designMode = false;
      await load(null);
    } catch (e) {
      formError = e instanceof Error ? e.message : 'Не удалось удалить';
    } finally {
      busy = false;
    }
  }

  async function copyText(text: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      formError = 'Не удалось скопировать';
    }
  }
</script>

<div class="adm-ads" class:adm-ads--design={designMode && panelOpen}>
  <aside class="adm-ads__list">
    <div class="adm-ads__list-head">
      <span class="adm-ads__list-title">Реклама</span>
      <button type="button" class="uiv2-btn uiv2-btn--primary uiv2-btn--sm" onclick={startCreate}>
        + Создать
      </button>
    </div>

    {#if loadError}
      <p class="adm-msg adm-msg--error" role="alert">{loadError}</p>
    {:else if ads.length === 0 && !creating}
      <div class="adm-ads__empty-list">
        <p>Рекламы пока нет</p>
        <button type="button" class="uiv2-btn uiv2-btn--ghost uiv2-btn--sm" onclick={startCreate}>
          Создать первую
        </button>
      </div>
    {:else}
      <div class="adm-ads__scroll uiv2-scroll-area uiv2-scroll-area--y" use:uiv2CustomScroll={{ axis: 'y' }}>
        <ul class="adm-ads__items uiv2-scroll-area__viewport">
          {#each ads as a (a.id)}
            <li>
              <button
                type="button"
                class="adm-ads__item"
                class:adm-ads__item--active={selectedId === a.id && !creating}
                onclick={() => selectAd(a.id)}
              >
                <span
                  class="adm-ads__thumb"
                  style:background-image={a.imageUrl
                    ? `url(${resolveAdImageUrl(a.imageUrl, a.updatedAt)})`
                    : undefined}
                ></span>
                <span class="adm-ads__item-body">
                  <span class="adm-ads__item-title">{a.title}</span>
                  <span class="adm-ads__item-chips">
                    <span class="adm-chip">{a.slot}</span>
                    {#if !a.active}<span class="adm-chip adm-chip--muted">Скрыто</span>{/if}
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

  {#if panelOpen && designMode}
    <div class="adm-ads__workspace">
      <header class="adm-ads__ws-head">
        <div>
          <h2 class="adm-editor__title">{creating ? 'Новая реклама' : formTitle || 'Реклама'}</h2>
          <p class="adm-editor__sub">Один холст · Rest/Hover как в Figma · Preview как публичный iframe</p>
        </div>
        <div class="adm-ads__ws-actions">
          <button type="button" class="uiv2-btn uiv2-btn--ghost uiv2-btn--sm" onclick={() => { designMode = false; }}>
            Закрыть редактор
          </button>
          <button type="button" class="uiv2-btn uiv2-btn--primary uiv2-btn--sm" disabled={busy} onclick={() => void save()}>
            {busy ? '…' : 'Сохранить'}
          </button>
        </div>
      </header>

      {#if formError}
        <p class="adm-msg adm-msg--error adm-msg--inline" role="alert">{formError}</p>
      {/if}

      <div class="adm-ads__ws-body adm-ads__ws-body--figma">
        <AdFigmaEditor
          states={formDesign}
          onStatesChange={setFormDesign}
          crt={formCrt}
          onCrtChange={(next) => { formCrt = next; }}
        />
      </div>
    </div>
  {:else}
    <section class="adm-ads__editor uiv2-scroll-area uiv2-scroll-area--y" use:uiv2CustomScroll={{ axis: 'y' }}>
      <div class="uiv2-scroll-area__viewport adm-ads__editor-vp">
        {#if panelOpen}
          <header class="adm-editor__head">
            <div>
              <h2 class="adm-editor__title">{creating ? 'Новая реклама' : formTitle || 'Реклама'}</h2>
              <p class="adm-editor__sub">
                Слот «{slotLabel}» · iframe-плеер
                {#if selectedId && !creating} · ID {selectedId.slice(0, 8)}{/if}
              </p>
            </div>
            <button type="button" class="uiv2-btn uiv2-btn--primary uiv2-btn--md" onclick={openEditor}>
              Редактировать
            </button>
          </header>

          {#if formError}
            <p class="adm-msg adm-msg--error adm-msg--inline" role="alert">{formError}</p>
          {/if}

          <div class="adm-section">
            <p class="adm-section__label">Публичный iframe</p>
            <p class="adm-section__desc">
              Так баннер увидят сайт и приложение. После правок в редакторе нажмите «Сохранить» — превью обновится.
            </p>
            {#if selectedId && !creating && livePlayerSrc}
              <div class="adm-ads__preview">
                {#key livePlayerSrc}
                  <iframe
                    class="adm-ads__player"
                    src={livePlayerSrc}
                    title={formTitle || 'Реклама'}
                    loading="lazy"
                    referrerpolicy="no-referrer"
                  ></iframe>
                {/key}
              </div>
            {:else}
              <p class="adm-section__desc">Сохраните креатив — появится публичный iframe.</p>
            {/if}
          </div>

          <div class="adm-section">
            <p class="adm-section__label">Картинка</p>
            <div class="adm-ads__upload">
              <label class="uiv2-btn uiv2-btn--chrome uiv2-btn--md">
                {pendingImage ? 'Файл выбран — сохраните' : 'Загрузить картинку'}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  hidden
                  onchange={onImageFile}
                />
              </label>
              {#if pendingImage}
                <span class="adm-chip">{pendingImage.name}</span>
              {/if}
            </div>
          </div>

          <div class="adm-section">
            <p class="adm-section__label">Размещение</p>
            <div class="adm-ads__fields">
              <label class="adm-field">
                <span class="adm-field__label">Название</span>
                <input class="adm-field__input" type="text" bind:value={formTitle} placeholder="67 VPN" />
              </label>
              <label class="adm-field">
                <span class="adm-field__label">Слот embed</span>
                <input class="adm-field__input" type="text" bind:value={formSlot} placeholder="connection" />
              </label>
            </div>
            <div class="adm-ads__chips">
              {#each AD_SLOT_OPTIONS as s}
                <button
                  type="button"
                  class="adm-chip"
                  class:adm-chip--accent={formSlot === s.value}
                  onclick={() => { formSlot = s.value; }}
                >
                  {s.label}
                </button>
              {/each}
            </div>
            {#if slotTaken}
              <p class="adm-section__desc">В этом слоте уже есть другая активная реклама — покажется последняя сохранённая.</p>
            {/if}
            <label class="adm-field">
              <span class="adm-field__label">Ссылка по клику</span>
              <input class="adm-field__input" type="url" bind:value={formHref} placeholder="https://…" />
            </label>
            <label class="adm-toggle">
              <span class="adm-toggle__info">
                <span class="adm-toggle__name">Активна</span>
                <span class="adm-toggle__desc">Отдавать в публичном плеере</span>
              </span>
              <span class="uiv2-popup-menu__switch" class:uiv2-popup-menu__switch--on={formActive} aria-hidden="true">
                <span class="uiv2-popup-menu__switch-thumb"></span>
              </span>
              <input type="checkbox" class="adm-sr-only" bind:checked={formActive} />
            </label>
          </div>

          <div class="adm-section">
            <p class="adm-section__label">Размер блока</p>
            <div class="adm-ads__fields adm-ads__fields--3">
              <label class="adm-field">
                <span class="adm-field__label">Ширина</span>
                <input class="adm-field__input" type="text" bind:value={formWidth} placeholder="100%" />
              </label>
              <label class="adm-field">
                <span class="adm-field__label">Высота</span>
                <input class="adm-field__input" type="text" bind:value={formHeight} placeholder="auto" />
              </label>
              <label class="adm-field">
                <span class="adm-field__label">Пропорции</span>
                <input class="adm-field__input" type="text" bind:value={formAspect} placeholder="16 / 11" />
              </label>
            </div>
          </div>

          <div class="adm-section">
            <p class="adm-section__label">Embed HTML</p>
            <p class="adm-section__desc">Вставьте на сайт или в любое приложение. Креатив рендерится с AnixBack.</p>
            {#if embedById}
              <p class="adm-field__label">По ID</p>
              <div class="adm-ads__embed">
                <code class="adm-ads__code">{embedById}</code>
                <button type="button" class="uiv2-btn uiv2-btn--ghost uiv2-btn--sm" onclick={() => void copyText(embedById)}>Копировать</button>
              </div>
            {/if}
            <p class="adm-field__label">По слоту</p>
            <div class="adm-ads__embed">
              <code class="adm-ads__code">{embedBySlot}</code>
              <button type="button" class="uiv2-btn uiv2-btn--ghost uiv2-btn--sm" onclick={() => void copyText(embedBySlot)}>Копировать</button>
            </div>
            {#if selectedId && !creating}
              <p class="adm-section__desc">Ссылки: <code>{adEmbedUrlById(selectedId)}</code> · <code>{adEmbedUrlBySlot(formSlot.trim())}</code></p>
            {/if}
          </div>

          <footer class="adm-editor__foot">
            {#if selectedId && !creating}
              <button
                type="button"
                class="uiv2-btn uiv2-btn--ghost uiv2-btn--md adm-editor__delete"
                disabled={busy}
                onclick={() => void removeCurrent()}
              >
                Удалить
              </button>
            {:else}
              <span></span>
            {/if}
            <button type="button" class="uiv2-btn uiv2-btn--primary uiv2-btn--md" disabled={busy} onclick={() => void save()}>
              {busy ? 'Сохранение…' : 'Сохранить'}
            </button>
          </footer>
        {:else}
          <div class="adm-empty">
            <div class="adm-empty__icon" aria-hidden="true">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
            </div>
            <h2 class="adm-empty__title">Выберите рекламу</h2>
            <p class="adm-empty__text">Создайте креатив, настройте как в Figma и вставьте iframe на сайт или в приложение.</p>
            <button type="button" class="uiv2-btn uiv2-btn--primary uiv2-btn--md" onclick={startCreate}>Создать</button>
          </div>
        {/if}
      </div>
      <div class="uiv2-scroll-area__v-track" aria-hidden="true"><div class="uiv2-scroll-area__v-thumb"></div></div>
    </section>
  {/if}
</div>

<style lang="scss">
.adm-ads {
  display: grid;
  grid-template-columns: 17rem minmax(0, 1fr);
  grid-template-rows: 1fr;
  height: 100%;
  min-height: 0;
  overflow: hidden;

  &--design {
    grid-template-columns: minmax(0, 1fr);

    .adm-ads__list { display: none; }
  }
}

.adm-ads__list {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  border-right: 1px solid var(--uiv2-border-subtle);
  background: var(--uikit-v2-surface);
}

.adm-ads__list-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.85rem 1rem;
  border-bottom: 1px solid var(--uiv2-border-subtle);
  flex-shrink: 0;
  gap: 0.5rem;
}

.adm-ads__list-title {
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--uiv2-fg-muted);
}

.adm-ads__empty-list {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.65rem;
  padding: 2.5rem 1rem;
  text-align: center;
  font-size: 0.875rem;
  color: var(--uiv2-fg-muted);
}

.adm-ads__scroll {
  flex: 1 1 0;
  min-height: 0;
  position: relative;
}

.adm-ads__items {
  list-style: none;
  margin: 0;
  padding: 0.35rem;
}

.adm-ads__item {
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

.adm-ads__thumb {
  width: 3rem;
  height: 2rem;
  border-radius: 6px;
  flex-shrink: 0;
  background-size: cover;
  background-position: center;
  background-color: var(--uiv2-surface-raised);
}

.adm-ads__item-body {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  min-width: 0;
  flex: 1;
}

.adm-ads__item-title {
  font-size: 0.8125rem;
  line-height: 1.3;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.adm-ads__item-chips {
  display: flex;
  gap: 0.25rem;
  flex-wrap: wrap;
}

.adm-ads__editor {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  position: relative;
}

.adm-ads__editor :global(.uiv2-scroll-area__viewport) {
  overflow-x: hidden;
  overflow-y: auto;
}

.adm-ads__editor-vp {
  display: block;
  height: auto;
}

.adm-ads__ws-body--figma {
  display: flex;
  flex-direction: column;
  padding: 0;
  min-height: 0;
  overflow: hidden;
  flex: 1 1 0;
}

.adm-ads__ws-body--figma :global(.figma) {
  flex: 1 1 0;
  height: 100%;
  min-height: 0;
  border: 0;
  border-radius: 0;
}

.adm-ads__preview-variants {
  display: inline-flex;
  gap: 0.25rem;
  margin: 0 0 0.65rem;
  padding: 0.2rem;
  border-radius: 8px;
  background: var(--uiv2-hover-bg);
}

.adm-ads__player {
  display: block;
  width: 100%;
  aspect-ratio: 16 / 11;
  border: 1px solid var(--uiv2-border-subtle);
  border-radius: 14px;
  background: #050506;
}

.adm-ads__upload,
.adm-ads__chips,
.adm-ads__embed {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
}

.adm-ads__fields {
  display: flex;
  gap: 0.75rem;
  margin-bottom: 0.75rem;

  &--3 { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); }
}

.adm-ads__code {
  flex: 1 1 12rem;
  min-width: 0;
  padding: 0.5rem 0.7rem;
  border-radius: 9px;
  background: var(--uikit-v2-bg);
  border: 1px solid var(--uiv2-border-subtle);
  font-size: 0.7rem;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-all;
}

.adm-ads__workspace {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
  background: var(--uikit-v2-bg);
}

.adm-ads__ws-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.85rem 1.25rem;
  border-bottom: 1px solid var(--uiv2-border-subtle);
  flex-shrink: 0;
}

.adm-ads__ws-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.adm-ads__variants {
  display: inline-flex;
  padding: 0.15rem;
  border-radius: 9px;
  background: var(--uiv2-surface-raised);
  border: 1px solid var(--uiv2-border-subtle);
}

.adm-ads__variant {
  appearance: none;
  border: 0;
  background: transparent;
  color: var(--uiv2-fg-muted);
  font: inherit;
  font-size: 0.75rem;
  font-weight: 600;
  padding: 0.35rem 0.7rem;
  border-radius: 7px;
  cursor: pointer;

  &--on {
    background: var(--uikit-v2-surface);
    color: var(--uikit-v2-text);
  }
}

.adm-ads__ws-body {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 18rem;
  flex: 1 1 0;
  min-height: 0;
  overflow: hidden;
}

.adm-ads__canvas-stage {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  padding: 1.25rem;
  min-height: 0;
  overflow: auto;
  background:
    linear-gradient(90deg, color-mix(in srgb, var(--uiv2-border-subtle) 55%, transparent) 1px, transparent 1px),
    linear-gradient(color-mix(in srgb, var(--uiv2-border-subtle) 55%, transparent) 1px, transparent 1px);
  background-size: 18px 18px;
  background-color: color-mix(in srgb, var(--uikit-v2-bg) 92%, #000);
}

.adm-ads__canvas-frame {
  width: min(100%, 26rem);

  &--figma {
    width: min(100%, 42rem);
    max-width: 100%;
  }
}

.adm-ads__inspector {
  border-left: 1px solid var(--uiv2-border-subtle);
  background: var(--uikit-v2-surface);
  min-height: 0;
  position: relative;
}

.adm-ads__inspector :global(.uiv2-scroll-area__viewport) {
  overflow-x: hidden;
  overflow-y: auto;
}

.adm-ads__inspector-vp {
  padding: 0.85rem 1rem 1.5rem;
}

.adm-ads__icons {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  margin-bottom: 0.85rem;
}

.adm-ads__icon {
  width: 2rem;
  height: 2rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  border: 1px solid var(--uiv2-border-subtle);
  background: var(--uikit-v2-bg);
  color: var(--uikit-v2-text);
  cursor: pointer;
  padding: 0;

  :global(svg) {
    width: 1rem;
    height: 1rem;
  }

  &--on {
    border-color: var(--uikit-v2-accent);
    background: color-mix(in srgb, var(--uikit-v2-accent) 14%, transparent);
  }
}

.adm-ads__slider {
  display: grid;
  grid-template-columns: 5.5rem minmax(0, 1fr) 3rem;
  align-items: center;
  gap: 0.4rem;
  margin-bottom: 0.45rem;
}

.adm-ads__slider-label {
  font-size: 0.7rem;
  color: var(--uiv2-fg-muted);
}

.adm-ads__slider-val {
  font-size: 0.68rem;
  text-align: right;
  color: var(--uiv2-fg-muted);
  font-variant-numeric: tabular-nums;
}

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
  appearance: none;
  font: inherit;
  font-size: 0.67rem;
  font-weight: 600;
  padding: 0.1rem 0.4rem;
  border-radius: 4px;
  background: var(--uiv2-surface-raised);
  color: var(--uiv2-fg-muted);
  border: 0;
  cursor: pointer;

  &--accent {
    color: var(--uikit-v2-accent);
    background: color-mix(in srgb, var(--uikit-v2-accent) 12%, transparent);
  }

  &--muted { opacity: 0.6; cursor: default; }
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

  &--inline { margin: 0.5rem 1.5rem; }
}

.adm-field {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  flex: 1 1 0;
  min-width: 0;
  margin: 0 0 0.75rem;
}

.adm-field__label {
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--uiv2-fg-muted);
}

.adm-field__input,
.adm-field__textarea {
  width: 100%;
  box-sizing: border-box;
  padding: 0.5rem 0.7rem;
  border: 1px solid var(--uiv2-border-subtle);
  border-radius: 9px;
  background: var(--uikit-v2-bg);
  color: var(--uikit-v2-text);
  font: inherit;
  font-size: 0.9rem;
  outline: none;

  &:focus { border-color: var(--uikit-v2-accent); }
}

.adm-field__textarea {
  resize: vertical;
  min-height: 3.5rem;
  line-height: 1.4;
}

.adm-toggle {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.35rem 0;
  cursor: pointer;
}

.adm-toggle__info {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  flex: 1;
  min-width: 0;
}

.adm-toggle__name {
  font-size: 0.875rem;
  font-weight: 500;
}

.adm-toggle__desc {
  font-size: 0.72rem;
  color: var(--uiv2-fg-muted);
}

.adm-sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
}

.adm-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  min-height: 18rem;
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
  color: var(--uiv2-fg-muted);
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
