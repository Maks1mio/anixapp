<script lang="ts">
  import { onMount } from 'svelte';
  import { iconArrowLeft, iconCheck, iconX } from '../components/icons';
  import { navigate } from '../stores/navigation';
  import { showToast } from '../stores/toast';
  import { compressImageForUpload } from '../utils/compressImage';
  import {
    COLLECTION_CREATE_ERROR_MESSAGES,
    COLLECTION_DESCRIPTION_MAX,
    COLLECTION_RELEASES_MAX,
    COLLECTION_TITLE_MAX,
    clearCollectionEditorDraft,
    loadCollectionEditorDraft,
    saveCollectionEditorDraft,
  } from '../utils/collection';
  import { COLLECTION_RULES_FORBIDDEN, COLLECTION_RULES_FOOTER } from '../utils/collectionRules';
  import { ensureProfileId } from '../utils/profile';
  import UiV2Tooltip from '../components/uikit-v2/UiV2Tooltip.svelte';
  import {
    mapReleaseRawToCard,
    releaseCardMeta,
    releaseCardTitle,
    releaseListStatusLabel,
  } from '../utils/release-card';
  import type { ReleaseCardData } from '../types/release';
  import { buildPosterUrl } from '../utils/posterUrl';

  interface Props {
    editId?: number | null;
  }

  let { editId = null }: Props = $props();

  let title = $state('');
  let description = $state('');
  let isPrivate = $state(false);
  let releases = $state<Record<string, unknown>[]>([]);
  let imagePreview = $state<string | null>(null);
  let imageBase64 = $state<string | null>(null);
  let imageFileName = $state<string | null>(null);
  let isSaving = $state(false);
  let isLoading = $state(false);
  let loadError = $state('');
  let dragIndex = $state<number | null>(null);

  let fileInput: HTMLInputElement | undefined = $state();

  const releaseCards = $derived(releases.map((raw) => mapReleaseRawToCard(raw)));
  const pageTitle = $derived(editId ? 'Редактирование коллекции' : 'Создание коллекции');
  const canSave = $derived(title.trim().length > 0 && !isSaving && !isLoading);

  function persistDraft() {
    saveCollectionEditorDraft({
      title,
      description,
      isPrivate,
      releaseIds: releases.map((r) => Number(r.id)).filter((id) => Number.isFinite(id)),
      releases,
      imagePreview,
      imageBase64,
      imageFileName,
      editId,
    });
  }

  function applyDraft() {
    const draft = loadCollectionEditorDraft();
    if (!draft) return;
    if (editId && draft.editId !== editId) return;
    if (!editId && draft.editId) return;
    title = draft.title ?? '';
    description = draft.description ?? '';
    isPrivate = !!draft.isPrivate;
    releases = Array.isArray(draft.releases) ? [...draft.releases] : [];
    imagePreview = draft.imagePreview ?? null;
    imageBase64 = draft.imageBase64 ?? null;
    imageFileName = draft.imageFileName ?? null;
  }

  async function loadForEdit(id: number) {
    if (!window.anixApi) return;
    isLoading = true;
    loadError = '';
    try {
      const selfId = await ensureProfileId();
      const infoRes = (await window.anixApi.collection.info(id)) as Record<string, unknown>;
      const info = (infoRes?.collection ?? infoRes) as Record<string, unknown>;
      const creator = (info?.creator ?? {}) as Record<string, unknown>;
      const ownerId = creator.id ?? creator['@id'];
      if (selfId == null || ownerId !== selfId) {
        loadError = 'Нет прав на редактирование этой коллекции';
        return;
      }

      title = String(info.title ?? '');
      description = String(info.description ?? '');
      isPrivate = !!(info.is_private ?? info.isPrivate);
      const imageRaw = info.image as string | undefined;
      if (imageRaw) {
        imagePreview = buildPosterUrl(imageRaw) || imageRaw;
      }

      const loaded: Record<string, unknown>[] = [];
      let page = 0;
      let hasMore = true;
      while (hasMore) {
        const res = (await window.anixApi.collection.getReleases(id, page)) as Record<string, unknown>;
        let content = res?.content ?? res?.releases;
        if (content && !Array.isArray(content) && Array.isArray((content as Record<string, unknown>).releases)) {
          content = (content as Record<string, unknown>).releases;
        }
        const list = (Array.isArray(content) ? content : []) as Record<string, unknown>[];
        loaded.push(...list.filter((item) => item && typeof item.id === 'number'));
        hasMore = list.length >= 25;
        page += 1;
        if (list.length === 0) hasMore = false;
      }
      releases = loaded;
    } catch (err) {
      loadError = String(err);
    } finally {
      isLoading = false;
    }
  }

  async function onImageSelected(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const compressed = await compressImageForUpload(file);
    imageFileName = compressed.name;
    imagePreview = URL.createObjectURL(compressed);
    const reader = new FileReader();
    reader.onload = () => {
      imageBase64 = typeof reader.result === 'string' ? reader.result : null;
      persistDraft();
    };
    reader.readAsDataURL(compressed);
  }

  function removeRelease(index: number) {
    releases = releases.filter((_, i) => i !== index);
    persistDraft();
  }

  function openPicker() {
    persistDraft();
    const returnPath = editId ? `/collections/edit/${editId}` : '/collections/create';
    navigate(`/collections/pick-release?return=${encodeURIComponent(returnPath)}`);
  }

  function onDragStart(index: number) {
    dragIndex = index;
  }

  function onDragOver(e: DragEvent) {
    e.preventDefault();
  }

  function onDrop(index: number) {
    if (dragIndex == null || dragIndex === index) return;
    const next = [...releases];
    const [moved] = next.splice(dragIndex, 1);
    next.splice(index, 0, moved);
    releases = next;
    dragIndex = null;
    persistDraft();
  }

  async function save() {
    if (!window.anixApi?.collectionMy || !canSave) return;
    isSaving = true;
    const body = {
      title: title.trim(),
      description: description.trim(),
      releases: releases.map((r) => Number(r.id)).filter((id) => Number.isFinite(id)),
      is_private: isPrivate,
    };

    try {
      let res: Record<string, unknown>;
      if (editId) {
        res = (await window.anixApi.collectionMy.edit(editId, body)) as Record<string, unknown>;
      } else {
        res = (await window.anixApi.collectionMy.create(body)) as Record<string, unknown>;
      }

      const code = res?.code as number | undefined;
      if (code != null && code !== 0) {
        showToast(COLLECTION_CREATE_ERROR_MESSAGES[code] ?? 'Не удалось сохранить коллекцию', 'err');
        return;
      }

      const collection = (res?.collection ?? res) as Record<string, unknown>;
      const savedId = (collection?.id ?? editId) as number | undefined;
      if (!savedId) {
        showToast('Не удалось сохранить коллекцию', 'err');
        return;
      }

      if (imageBase64) {
        const imgRes = (await window.anixApi.collectionMy.editImage(
          savedId,
          imageBase64,
          imageFileName ?? 'cover.jpg',
        )) as Record<string, unknown>;
        if (imgRes?.code != null && imgRes.code !== 0) {
          showToast('Коллекция сохранена, но обложка не загрузилась', 'err');
        }
      }

      clearCollectionEditorDraft();
      showToast(editId ? 'Коллекция обновлена' : 'Коллекция создана');
      navigate(`/collection/${savedId}`);
    } catch (err) {
      showToast(String(err), 'err');
    } finally {
      isSaving = false;
    }
  }

  function goBack() {
    if (editId) navigate(`/collection/${editId}`);
    else navigate('/collections');
  }

  onMount(async () => {
    if (editId) {
      const draft = loadCollectionEditorDraft();
      if (draft?.editId === editId) {
        applyDraft();
        isLoading = false;
        return;
      }
      clearCollectionEditorDraft();
      await loadForEdit(editId);
    } else {
      applyDraft();
    }
  });

  $effect(() => {
    if (isLoading) return;
    title;
    description;
    isPrivate;
    releases;
    imagePreview;
    imageBase64;
    imageFileName;
    persistDraft();
  });
</script>

<div class="view collection-editor">
  <div class="collection-editor__toolbar">
    <button type="button" class="collection-editor__back" aria-label="Назад" onclick={goBack}>
      {@html iconArrowLeft(20)}
    </button>
    <h1 class="collection-editor__title">{pageTitle}</h1>
    <button
      type="button"
      class="collection-editor__save"
      aria-label="Сохранить"
      disabled={!canSave}
      onclick={() => void save()}
    >
      {@html iconCheck(20)}
    </button>
  </div>

  {#if isLoading}
    <div class="discover-page__loading">Загрузка…</div>
  {:else if loadError}
    <div class="discover-page__error">
      <p>{loadError}</p>
      <button type="button" class="discover-page__retry" onclick={goBack}>Назад</button>
    </div>
  {:else}
    <div class="collection-editor__cover">
      {#if imagePreview}
        <div class="collection-editor__cover-preview">
          <img src={imagePreview} alt="" />
          <button type="button" class="collection-editor__cover-replace" onclick={() => fileInput?.click()}>
            Заменить обложку
          </button>
        </div>
      {:else}
        <button type="button" class="collection-editor__cover-upload" onclick={() => fileInput?.click()}>
          <span aria-hidden="true">+</span>
          <span>Загрузить обложку</span>
        </button>
      {/if}
      <input bind:this={fileInput} type="file" accept="image/*" hidden onchange={onImageSelected} />
    </div>

    <div class="collection-editor__field">
      <input
        class="collection-editor__input"
        type="text"
        placeholder="Название коллекции"
        maxlength={COLLECTION_TITLE_MAX}
        bind:value={title}
      />
      <div class="collection-editor__counter">{title.length}/{COLLECTION_TITLE_MAX}</div>
    </div>

    <div class="collection-editor__field">
      <textarea
        class="collection-editor__textarea"
        placeholder="Описание"
        maxlength={COLLECTION_DESCRIPTION_MAX}
        bind:value={description}
      ></textarea>
      <div class="collection-editor__counter">{description.length}/{COLLECTION_DESCRIPTION_MAX}</div>
    </div>

    <div class="collection-editor__privacy">
      <span>Доступно только мне</span>
      <label class="settings-toggle-switch" aria-label="Приватная коллекция">
        <input type="checkbox" bind:checked={isPrivate} />
        <span class="settings-toggle-switch__track"></span>
        <span class="settings-toggle-switch__thumb"></span>
      </label>
    </div>

    <div class="collection-editor__rules">
      Создавая коллекцию, Вы подтверждаете, что ознакомлены с
      <UiV2Tooltip placement="top" interactive={true} showDelay={80} hideDelay={150}>
        <button type="button" class="collection-editor__rules-link">правилами</button>
        {#snippet content()}
          <div class="uiv2-rules-popover">
            <p class="uiv2-rules-popover__title">Правила</p>
            <p class="uiv2-rules-popover__heading">Запрещено:</p>
            <ul class="uiv2-rules-popover__list">
              {#each COLLECTION_RULES_FORBIDDEN as rule}
                <li>{rule}</li>
              {/each}
            </ul>
            <p class="uiv2-rules-popover__footer">{COLLECTION_RULES_FOOTER}</p>
          </div>
        {/snippet}
      </UiV2Tooltip>
      »
    </div>

    <div class="collection-editor__divider"></div>

    <div class="collection-editor__releases-head">
      <button type="button" class="collection-editor__add-release" onclick={openPicker}>
        <span aria-hidden="true">+</span>
        <span>Добавить релиз</span>
      </button>
      <span class="collection-editor__releases-count">{releases.length} из {COLLECTION_RELEASES_MAX}</span>
    </div>

    {#each releaseCards as card, index (card.id ?? index)}
      {@const statusLabel = releaseListStatusLabel(card.listStatus)}
      <div
        class="collection-editor__release{dragIndex === index ? ' collection-editor__release--dragging' : ''}"
        draggable="true"
        ondragstart={() => onDragStart(index)}
        ondragover={onDragOver}
        ondrop={() => onDrop(index)}
      >
        <span class="collection-editor__drag" aria-hidden="true">⋮⋮</span>
        <div class="collection-editor__release-poster">
          {#if card.poster}
            <img src={card.poster} alt="" />
          {/if}
          {#if statusLabel}
            <div class="collection-editor__release-badge">{statusLabel}</div>
          {/if}
        </div>
        <div class="collection-editor__release-body">
          <h3 class="collection-editor__release-title">{releaseCardTitle(card)}</h3>
          <p class="collection-editor__release-meta">{releaseCardMeta(card)}</p>
          {#if card.description}
            <p class="collection-editor__release-desc">{card.description}</p>
          {/if}
        </div>
        <button
          type="button"
          class="collection-editor__release-remove"
          aria-label="Удалить релиз"
          onclick={() => removeRelease(index)}
        >
          {@html iconX(18)}
        </button>
      </div>
    {/each}
  {/if}
</div>
