<script lang="ts" module>
  export type ProfileMediaKind = 'avatar' | 'cover';

  /** Данные шапки профиля для предпросмотра (как в ProfilePanelBlock) */
  export type ProfileMediaPreviewInfo = {
    status?: string;
    badgeUrl?: string | null;
    badgeName?: string | null;
    verified?: boolean;
    online?: boolean;
    level?: number | null;
    meta?: string;
    roles?: { name?: string; color?: string }[];
  };
</script>

<script lang="ts">
  /**
   * Смена фото профиля / обложки. Слева — предпросмотр той же разметкой, что шапка
   * профиля (и комментарий для аватара), справа — полотно: рамка кадра по центру,
   * изображение двигается под ней, колесо/слайдер — масштаб.
   */
  import { onDestroy, onMount } from 'svelte';
  import { fade, scale } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { portal } from '../../actions/portal';
  import UiV2Button from '../uikit-v2/UiV2Button.svelte';
  import UiV2ScrollArea from '../uikit-v2/UiV2ScrollArea.svelte';
  import UserBadge from '../UserBadge.svelte';
  import { iconImage, iconMinus, iconPlus, iconMoreHorizontal } from '../icons';

  interface Props {
    kind: ProfileMediaKind;
    login: string;
    avatarUrl?: string | null;
    coverUrl?: string | null;
    preview?: ProfileMediaPreviewInfo;
    /** Есть что сбрасывать (своя обложка / фото) */
    canReset?: boolean;
    busy?: boolean;
    onClose: () => void;
    /** Готовое кадрированное изображение (JPEG data URL) */
    onSave: (dataUrl: string, name: string) => void | Promise<void>;
    onReset?: () => void | Promise<void>;
  }

  let {
    kind,
    login,
    avatarUrl = null,
    coverUrl = null,
    preview = {},
    canReset = false,
    busy = false,
    onClose,
    onSave,
    onReset,
  }: Props = $props();

  /** Пропорции как у шапки профиля (.profile-panel__banner) */
  const COVER_ASPECT = 3.47;
  const MAX_ZOOM = 4;
  /** Отступ рамки кадра от краёв полотна, px */
  const FRAME_PAD = 28;

  const titleId = `pp-media-${Math.random().toString(36).slice(2, 8)}`;
  const isAvatar = $derived(kind === 'avatar');
  const aspect = $derived(isAvatar ? 1 : COVER_ASPECT);

  let fileInputEl = $state<HTMLInputElement | undefined>();
  let stageEl = $state<HTMLDivElement | undefined>();
  let stageW = $state(0);
  let stageH = $state(0);

  let srcUrl = $state<string | null>(null);
  let srcName = $state('image.jpg');
  let imgEl: HTMLImageElement | null = null;
  let imgW = $state(0);
  let imgH = $state(0);
  let zoom = $state(1);
  let cx = $state(0);
  let cy = $state(0);
  let dragging = $state(false);
  let dropActive = $state(false);
  let loadError = $state('');

  const hasImage = $derived(!!srcUrl && imgW > 0 && imgH > 0);

  /** Ширина предпросмотра = ширина открытой панели профиля (в узких рамках) */
  let previewW = $state(0);
  onMount(() => {
    const panel = [...document.querySelectorAll<HTMLElement>('.profile-panel')]
      .find((el) => !el.classList.contains('pp-media__profile') && el.clientWidth > 0);
    if (panel) previewW = Math.min(Math.max(panel.clientWidth, 300), 440);
  });

  // Кадр в пикселях исходника: максимальный прямоугольник нужных пропорций / zoom
  const crop = $derived.by(() => {
    if (!hasImage) return null;
    const baseW = Math.min(imgW, imgH * aspect);
    const w = baseW / zoom;
    const h = w / aspect;
    const x = Math.min(Math.max(cx - w / 2, 0), imgW - w);
    const y = Math.min(Math.max(cy - h / 2, 0), imgH - h);
    return { x, y, w, h };
  });

  // Рамка кадра, вписанная в полотно
  const frame = $derived.by(() => {
    const availW = Math.max(0, stageW - FRAME_PAD * 2);
    const availH = Math.max(0, stageH - FRAME_PAD * 2);
    const w = Math.min(availW, availH * aspect);
    const h = w / aspect;
    return { w, h, left: (stageW - w) / 2, top: (stageH - h) / 2 };
  });

  // Всё изображение на полотне: кадр совпадает с рамкой
  const canvasImgStyle = $derived.by(() => {
    if (!crop || frame.w <= 0) return '';
    const k = frame.w / crop.w;
    return `width:${imgW * k}px;height:${imgH * k}px;left:${frame.left - crop.x * k}px;top:${frame.top - crop.y * k}px;`;
  });

  const frameStyle = $derived(`width:${frame.w}px;height:${frame.h}px;left:${frame.left}px;top:${frame.top}px;`);

  /** Фон для любого блока с теми же пропорциями, что и кадр */
  const cropBg = $derived.by(() => {
    if (!crop || !srcUrl) return '';
    const size = (imgW / crop.w) * 100;
    const px = imgW - crop.w > 0.5 ? (crop.x / (imgW - crop.w)) * 100 : 50;
    const py = imgH - crop.h > 0.5 ? (crop.y / (imgH - crop.h)) * 100 : 50;
    return `background-image:url('${srcUrl}');background-size:${size}% auto;background-position:${px}% ${py}%;`;
  });

  const urlBg = (url: string | null | undefined) => (url ? `background-image:url('${url}')` : '');

  const previewAvatarStyle = $derived(isAvatar && hasImage ? cropBg : urlBg(avatarUrl));
  const previewCoverStyle = $derived(!isAvatar && hasImage ? cropBg : urlBg(coverUrl));
  const hasPreviewCover = $derived(isAvatar ? !!coverUrl : hasImage || !!coverUrl);
  const firstRoleColor = $derived(preview.roles?.[0]?.color);
  const emptyBannerStyle = $derived(
    firstRoleColor ? `background:linear-gradient(160deg, ${firstRoleColor} 0%, #1a1a1a 70%)` : '',
  );

  function setCenter(nx: number, ny: number) {
    if (!hasImage) return;
    const baseW = Math.min(imgW, imgH * aspect);
    const w = baseW / zoom;
    const h = w / aspect;
    cx = Math.min(Math.max(nx, w / 2), imgW - w / 2);
    cy = Math.min(Math.max(ny, h / 2), imgH - h / 2);
  }

  function setZoom(next: number) {
    zoom = Math.min(Math.max(next, 1), MAX_ZOOM);
    setCenter(cx, cy);
  }

  function revokeSrc() {
    if (srcUrl) URL.revokeObjectURL(srcUrl);
  }

  function loadFile(file: File | null | undefined) {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      loadError = 'Нужен файл изображения';
      return;
    }
    loadError = '';
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      revokeSrc();
      imgEl = img;
      srcUrl = url;
      srcName = (file.name.replace(/\.[^.]+$/, '') || (isAvatar ? 'avatar' : 'cover')) + '.jpg';
      imgW = img.naturalWidth;
      imgH = img.naturalHeight;
      zoom = 1;
      cx = imgW / 2;
      cy = imgH / 2;
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      loadError = 'Не удалось открыть изображение';
    };
    img.src = url;
  }

  function pickFile() {
    if (!busy) fileInputEl?.click();
  }

  function onFileChange(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    loadFile(input.files?.[0]);
    input.value = '';
  }

  // ── Перетаскивание изображения под рамкой ──
  let dragStart: { x: number; y: number; cx: number; cy: number } | null = null;

  function onStagePointerDown(e: PointerEvent) {
    if (!hasImage || busy || e.button !== 0) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragStart = { x: e.clientX, y: e.clientY, cx, cy };
    dragging = true;
  }

  function onStagePointerMove(e: PointerEvent) {
    if (!dragStart || !crop || frame.w <= 0) return;
    const k = crop.w / frame.w;
    setCenter(dragStart.cx - (e.clientX - dragStart.x) * k, dragStart.cy - (e.clientY - dragStart.y) * k);
  }

  function onStagePointerUp() {
    dragStart = null;
    dragging = false;
  }

  // wheel в Svelte 5 пассивный — вешаем вручную, чтобы не скроллить страницу
  $effect(() => {
    const el = stageEl;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!hasImage) return;
      e.preventDefault();
      setZoom(zoom * Math.exp(-e.deltaY * 0.0015));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  });

  function onStageKeydown(e: KeyboardEvent) {
    if (!crop) return;
    const step = crop.w * 0.04;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const m = moves[e.key];
    if (m) {
      e.preventDefault();
      setCenter(cx + m[0], cy + m[1]);
    } else if (e.key === '+' || e.key === '=') {
      setZoom(zoom * 1.1);
    } else if (e.key === '-') {
      setZoom(zoom / 1.1);
    }
  }

  // ── Drop файла на окно ──
  function onDragOver(e: DragEvent) {
    if (!e.dataTransfer?.types.includes('Files')) return;
    e.preventDefault();
    dropActive = true;
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    dropActive = false;
    if (!busy) loadFile(e.dataTransfer?.files?.[0]);
  }

  // ── Вставка из буфера обмена (Ctrl + V) ──
  function onWindowPaste(e: ClipboardEvent) {
    if (busy) return;
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (!file) continue;
        e.preventDefault();
        loadFile(file);
        return;
      }
    }
  }

  function renderCrop(): string | null {
    if (!crop || !imgEl) return null;
    const maxW = isAvatar ? 1024 : 1920;
    const outW = Math.max(1, Math.round(Math.min(crop.w, maxW)));
    const outH = Math.max(1, Math.round(outW / aspect));
    const canvas = document.createElement('canvas');
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(imgEl, crop.x, crop.y, crop.w, crop.h, 0, 0, outW, outH);
    return canvas.toDataURL('image/jpeg', 0.92);
  }

  async function save() {
    if (busy) return;
    const dataUrl = renderCrop();
    if (!dataUrl) {
      loadError = 'Не удалось подготовить изображение';
      return;
    }
    await onSave(dataUrl, srcName);
  }

  function onWindowKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && !busy) {
      e.preventDefault();
      onClose();
    }
  }

  onDestroy(revokeSrc);
</script>

<svelte:window onkeydown={onWindowKeydown} onpaste={onWindowPaste} />

<div class="uiv2-choice-sheet" role="dialog" aria-modal="true" aria-labelledby={titleId} use:portal>
  <button
    type="button"
    class="uiv2-choice-sheet__backdrop"
    aria-label="Закрыть"
    onclick={() => { if (!busy) onClose(); }}
    transition:fade={{ duration: 160 }}
  ></button>

  <div
    class="uiv2-choice-sheet__panel pp-media"
    style={previewW ? `--pp-preview-w:${previewW}px` : undefined}
    class:pp-media--drop={dropActive}
    role="presentation"
    ondragover={onDragOver}
    ondragleave={() => (dropActive = false)}
    ondrop={onDrop}
    transition:scale={{ duration: 220, start: 0.94, easing: cubicOut }}
  >
    <!-- Предпросмотр: та же разметка, что у шапки профиля и комментария -->
    <aside class="pp-media__preview" aria-label="Предпросмотр">
      <UiV2ScrollArea class="pp-media__preview-scroll">
        <div class="profile-panel pp-media__profile">
          <section class="profile-panel__top">
            <div
              class="profile-panel__banner"
              class:profile-panel__banner--empty={!hasPreviewCover && !firstRoleColor}
              style={hasPreviewCover ? previewCoverStyle : emptyBannerStyle}
            ></div>
            <div class="profile-panel__head">
              <div class="profile-panel__identity">
                <div class="profile-panel__avatar-wrap">
                  <div class="profile-panel__avatar" style={previewAvatarStyle}></div>
                  <span
                    class="profile-panel__online"
                    class:profile-panel__online--on={preview.online}
                    aria-hidden="true"
                  ></span>
                </div>
                <div class="profile-panel__identity-main">
                  <h2 class="profile-panel__name">
                    <span class="profile-panel__name-text">{login}</span>
                    {#if preview.badgeUrl}
                      <UserBadge url={preview.badgeUrl} name={preview.badgeName} size="md" showTooltip={false} />
                    {/if}
                    {#if preview.verified}
                      <span class="profile-panel__verified">✓</span>
                    {/if}
                  </h2>
                  {#if preview.status}
                    <p class="profile-panel__bio">{preview.status}</p>
                  {/if}
                  {#if preview.level != null || preview.meta}
                    <div class="profile-panel__meta">
                      {#if preview.level != null}
                        <span class="profile-panel__level">{preview.level}</span>
                      {/if}
                      {#if preview.level != null && preview.meta}
                        <span class="profile-panel__meta-dot" aria-hidden="true">·</span>
                      {/if}
                      {#if preview.meta}
                        <span class="profile-panel__meta-text">{preview.meta}</span>
                      {/if}
                    </div>
                  {/if}
                  {#if preview.roles?.length}
                    <div class="profile-panel__roles">
                      {#each preview.roles as role}
                        <span
                          class="profile-panel__role"
                          style="--role-color:{role.color || '#888'};border-color:{role.color || '#888'};color:{role.color || '#888'};"
                        >
                          <i class="profile-panel__role-dot" style="background:{role.color || '#888'}"></i>
                          {role.name}
                        </span>
                      {/each}
                    </div>
                  {/if}
                </div>
              </div>
            </div>
          </section>

          {#if isAvatar}
            <div class="pp-media__comments">
              <article class="uiv2-comment">
                <div class="uiv2-comment__avatar">
                  <span class="user-avatar pp-media__comment-avatar" style={previewAvatarStyle}></span>
                </div>
                <div class="uiv2-comment__main">
                  <div class="uiv2-comment__head">
                    <div class="uiv2-comment__head-start">
                      <div class="uiv2-comment__head-line">
                        <span class="uiv2-comment__author">
                          {login}
                          {#if preview.badgeUrl}
                            <UserBadge
                              url={preview.badgeUrl}
                              name={preview.badgeName}
                              size="sm"
                              showTooltip={false}
                              class="uiv2-comment__badge"
                            />
                          {/if}
                        </span>
                      </div>
                      <span class="uiv2-comment__time">только что</span>
                    </div>
                    <span class="uiv2-comment__more-slot pp-media__comment-more" aria-hidden="true">
                      {@html iconMoreHorizontal(16)}
                    </span>
                  </div>
                  <div class="uiv2-comment__body">Так вас увидят в комментариях</div>
                </div>
              </article>
            </div>
          {/if}
        </div>
      </UiV2ScrollArea>
    </aside>

    <!-- Полотно -->
    <div class="pp-media__editor">
      <h3 id={titleId} class="uiv2-choice-sheet__title pp-media__title">
        {isAvatar ? 'Фото профиля' : 'Обложка профиля'}
      </h3>

      <div
        bind:this={stageEl}
        bind:clientWidth={stageW}
        bind:clientHeight={stageH}
        class="pp-media__stage"
        class:pp-media__stage--ready={hasImage}
        class:pp-media__stage--dragging={dragging}
        role="application"
        aria-label="Полотно: перетащите изображение, колесо — масштаб"
        tabindex={hasImage ? 0 : -1}
        onpointerdown={onStagePointerDown}
        onpointermove={onStagePointerMove}
        onpointerup={onStagePointerUp}
        onpointercancel={onStagePointerUp}
        onkeydown={onStageKeydown}
      >
        {#if hasImage && srcUrl}
          <img class="pp-media__canvas-img" src={srcUrl} alt="" draggable="false" style={canvasImgStyle} />
          <div class="pp-media__frame" class:pp-media__frame--round={isAvatar} style={frameStyle}></div>
        {:else}
          <button type="button" class="pp-media__drop" disabled={busy} onclick={pickFile}>
            <span class="pp-media__drop-icon" aria-hidden="true">{@html iconImage(26)}</span>
            <span class="pp-media__drop-title">Выберите изображение</span>
            <span class="pp-media__drop-sub">перетащите файл сюда или вставьте Ctrl + V</span>
          </button>
        {/if}
      </div>

      {#if loadError}
        <p class="pp-media__error" role="alert">{loadError}</p>
      {/if}

      <div class="pp-media__zoom" class:pp-media__zoom--off={!hasImage}>
        <button
          type="button"
          class="pp-media__zoom-btn"
          aria-label="Уменьшить"
          disabled={!hasImage || zoom <= 1 || busy}
          onclick={() => setZoom(zoom / 1.2)}
        >{@html iconMinus(16)}</button>
        <input
          class="pp-media__range"
          type="range"
          min="1"
          max={MAX_ZOOM}
          step="0.01"
          value={zoom}
          disabled={!hasImage || busy}
          aria-label="Масштаб"
          style="--fill:{((zoom - 1) / (MAX_ZOOM - 1)) * 100}%"
          oninput={(e) => setZoom(Number(e.currentTarget.value))}
        />
        <button
          type="button"
          class="pp-media__zoom-btn"
          aria-label="Увеличить"
          disabled={!hasImage || zoom >= MAX_ZOOM || busy}
          onclick={() => setZoom(zoom * 1.2)}
        >{@html iconPlus(16)}</button>
      </div>

      <div class="pp-media__actions">
        <div class="pp-media__actions-start">
          {#if hasImage}
            <UiV2Button label="Другое изображение" size="md" variant="chrome" disabled={busy} onclick={pickFile} />
          {:else if canReset && onReset}
            <UiV2Button
              label={isAvatar ? 'Сбросить фото' : 'Сбросить обложку'}
              size="md"
              variant="danger"
              disabled={busy}
              onclick={() => void onReset?.()}
            />
          {/if}
        </div>
        <UiV2Button label="Отмена" size="md" variant="chrome" disabled={busy} onclick={onClose} />
        <UiV2Button
          label={busy ? 'Сохранение…' : 'Сохранить'}
          size="md"
          variant="primary"
          disabled={!hasImage || busy}
          onclick={() => void save()}
        />
      </div>
    </div>

    <input
      bind:this={fileInputEl}
      type="file"
      accept="image/png,image/jpeg,image/webp,image/gif"
      hidden
      onchange={onFileChange}
    />
  </div>
</div>

<style lang="scss">
  .pp-media {
    display: grid;
    grid-template-columns: var(--pp-preview-w, 21rem) minmax(0, 1fr);
    gap: 1rem;
    width: min(100%, 60rem);
    height: min(calc(100vh - 2.5rem), 36rem);
    padding: 0.85rem;

    &--drop {
      outline: 2px dashed color-mix(in srgb, var(--uikit-v2-accent) 70%, transparent);
      outline-offset: -6px;
    }

    @media (max-width: 760px) {
      grid-template-columns: minmax(0, 1fr);
      grid-template-rows: minmax(0, 0.9fr) minmax(0, 1.1fr);
    }
  }

  /* Слева — «окно профиля»: фон и ширина как у панели профиля */
  .pp-media__preview {
    overflow: hidden;
    min-height: 0;
    border-radius: 14px;
    background: var(--color-bg);
    box-shadow: inset 0 0 0 1px var(--uiv2-panel-border);

    :global(.pp-media__preview-scroll) {
      height: 100%;
    }
  }

  .pp-media__profile {
    flex: none;
    padding-bottom: 0.75rem;
  }

  .pp-media__comments {
    margin: 0.6rem 0.9rem 0;
    padding: 0 0.85rem;
    border-radius: 20px;
    background: var(--uiv2-card-bg);
  }

  .pp-media__comment-avatar {
    background-position: center;
    background-size: cover;
    background-repeat: no-repeat;
  }

  .pp-media__comment-more {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
    color: var(--uiv2-fg-muted);
  }

  .pp-media__editor {
    display: flex;
    flex-direction: column;
    gap: 0.7rem;
    min-width: 0;
    min-height: 0;
  }

  .pp-media__title {
    margin: 0;
    padding: 0.15rem 0.1rem 0;
  }

  /* Полотно: рамка по центру, снаружи затемнение, изображение двигается под ней */
  .pp-media__stage {
    position: relative;
    flex: 1 1 auto;
    min-height: 12rem;
    overflow: hidden;
    border-radius: 14px;
    background:
      repeating-conic-gradient(
        color-mix(in srgb, var(--uikit-v2-text) 5%, transparent) 0% 25%,
        transparent 0% 50%
      ) 0 0 / 22px 22px,
      var(--color-bg);
    user-select: none;
    touch-action: none;

    &--ready {
      cursor: grab;
    }

    &--dragging {
      cursor: grabbing;
    }

    &:focus-visible {
      outline: 2px solid color-mix(in srgb, var(--uikit-v2-accent) 70%, transparent);
      outline-offset: 2px;
    }
  }

  .pp-media__canvas-img {
    position: absolute;
    max-width: none;
    pointer-events: none;
  }

  .pp-media__frame {
    position: absolute;
    border-radius: 6px;
    box-shadow:
      0 0 0 9999px rgba(0, 0, 0, 0.6),
      inset 0 0 0 1.5px rgba(255, 255, 255, 0.85);
    pointer-events: none;

    &--round {
      border-radius: 50%;
    }
  }

  .pp-media__drop {
    position: absolute;
    inset: 0.6rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.35rem;
    border: 1.5px dashed var(--uiv2-chrome-separator);
    border-radius: 10px;
    background: transparent;
    color: var(--uiv2-fg-muted);
    font: inherit;
    cursor: pointer;
    transition: background 0.15s ease, border-color 0.15s ease;

    &:hover:not(:disabled) {
      border-color: color-mix(in srgb, var(--uikit-v2-text) 35%, transparent);
      background: var(--uiv2-surface-subtle);
    }
  }

  .pp-media__drop-icon {
    display: inline-flex;
    color: var(--uikit-v2-text);
  }

  .pp-media__drop-title {
    color: var(--uikit-v2-text);
    font-size: 0.95rem;
    font-weight: 600;
  }

  .pp-media__drop-sub {
    font-size: 0.8rem;
  }

  .pp-media__error {
    margin: 0;
    color: #ff8b7a;
    font-size: 0.8rem;
    text-align: center;
  }

  .pp-media__zoom {
    display: flex;
    align-items: center;
    gap: 0.5rem;

    &--off {
      opacity: 0.4;
    }
  }

  .pp-media__zoom-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: 2rem;
    height: 2rem;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: var(--uiv2-surface-raised);
    color: var(--uikit-v2-text);
    cursor: pointer;
    transition: background 0.15s ease, opacity 0.15s ease;

    &:hover:not(:disabled) {
      background: var(--uiv2-chrome-separator);
    }

    &:disabled {
      cursor: default;
    }
  }

  .pp-media__range {
    flex: 1 1 auto;
    min-width: 0;
    height: 1.4rem;
    margin: 0;
    background: transparent;
    appearance: none;
    cursor: pointer;

    &:disabled {
      cursor: default;
    }

    &::-webkit-slider-runnable-track {
      height: 0.28rem;
      border-radius: 999px;
      background: linear-gradient(
        to right,
        var(--uikit-v2-text) var(--fill),
        color-mix(in srgb, var(--uikit-v2-text) 16%, transparent) var(--fill)
      );
    }

    &::-webkit-slider-thumb {
      width: 0.95rem;
      height: 0.95rem;
      margin-top: -0.335rem;
      border: 0;
      border-radius: 50%;
      background: var(--uikit-v2-text);
      appearance: none;
    }
  }

  .pp-media__actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .pp-media__actions-start {
    display: flex;
    flex: 1 1 auto;
    min-width: 0;
  }
</style>
