<script lang="ts">
  /**
   * Настройки → Обновление на телефоне: проверка последнего релиза GitHub, как на ПК,
   * скачивание APK с прогрессом и запуск системного установщика.
   */
  import { onMount } from 'svelte';
  import { iconCircleCheck, iconDownload, iconRefreshCw, iconChevronRight } from '../components/icons';
  import { requestOpenExternal } from '../utils/external-link';
  import {
    RELEASES_URL,
    cancelMobileUpdate,
    checkMobileUpdate,
    currentAppVersion,
    formatBytes,
    installMobileUpdate,
    mobileUpdate,
  } from '../stores/mobile-update';

  const s = $derived($mobileUpdate);
  const dl = $derived(s.download);
  const checking = $derived(s.status === 'checking');

  function fmtDate(iso: string | null | undefined): string {
    if (!iso) return '';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  function fmtChecked(at: number | null): string {
    if (!at) return '';
    return new Date(at).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  }

  /** Markdown списка изменений без разметки — читается и так. */
  const notes = $derived(
    (s.latest?.body ?? '')
      .replace(/\r/g, '')
      // Картинки и прочий HTML из описания релиза на GitHub
      .replace(/<[^>]+>/g, '')
      .replace(/!\[[^\]]*\]\([^)]+\)/g, '')
      .replace(/^#{1,6}\s*/gm, '')
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/^\s*[-*]\s+/gm, '• ')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/\n{3,}/g, '\n\n')
      .trim(),
  );

  onMount(() => {
    void checkMobileUpdate();
  });
</script>

<div class="m-update">
  <div class="m-update__head">
    {#if checking}
      <span class="m-update__icon m-update__icon--spin" aria-hidden="true">{@html iconRefreshCw(22)}</span>
    {:else if s.available}
      <span class="m-update__icon" aria-hidden="true">{@html iconDownload(22)}</span>
    {:else}
      <span class="m-update__icon m-update__icon--ok" aria-hidden="true">{@html iconCircleCheck(22)}</span>
    {/if}
    <div class="m-update__meta">
      {#if checking}
        <span class="m-update__title">Проверяем обновления…</span>
      {:else if s.available && s.latest}
        <span class="m-update__title">Доступна версия {s.latest.version}</span>
      {:else if s.status === 'error'}
        <span class="m-update__title">Не удалось проверить</span>
      {:else}
        <span class="m-update__title">Установлена последняя версия</span>
      {/if}
      <span class="m-update__sub">Сейчас {currentAppVersion || '—'}</span>
      {#if s.status === 'error' && s.error}
        <span class="m-update__sub">{s.error}</span>
      {:else if s.available && s.latest}
        <span class="m-update__sub">
          {[fmtDate(s.latest.publishedAt), formatBytes(s.latest.apkSize)].filter(Boolean).join(' · ')}
        </span>
      {:else if s.checkedAt}
        <span class="m-update__sub">Проверено {fmtChecked(s.checkedAt)}</span>
      {/if}
    </div>
  </div>

  {#if dl.state === 'downloading'}
    <div class="m-update__bar" aria-hidden="true"><span style:width="{dl.percent}%"></span></div>
    <p class="m-update__sub" style="margin: 6px 0 0">
      Скачивание… {dl.percent}%{dl.total ? ` из ${formatBytes(dl.total)}` : ''}
    </p>
  {/if}

  <div class="m-update__actions">
    {#if s.available}
      {#if dl.state === 'downloading'}
        <button type="button" class="m-update__btn m-update__btn--tonal" onclick={cancelMobileUpdate}>Отмена</button>
      {:else}
        <button type="button" class="m-update__btn" onclick={() => void installMobileUpdate()}>
          {dl.state === 'downloaded' ? 'Установить' : 'Скачать и установить'}
        </button>
      {/if}
    {/if}
    {#if dl.state !== 'downloading'}
      <button
        type="button"
        class="m-update__btn m-update__btn--tonal"
        disabled={checking}
        onclick={() => void checkMobileUpdate(true)}
      >
        Проверить
      </button>
    {/if}
  </div>
</div>

{#if s.available && notes}
  <h2 class="m-pref-cat">Что нового в {s.latest?.version}</h2>
  <div class="m-update-notes">{notes}</div>
{/if}

<button type="button" class="m-pref" onclick={() => requestOpenExternal(s.latest?.url ?? RELEASES_URL)}>
  <span class="m-pref__text">
    <span class="m-pref__title">Все выпуски на GitHub</span>
    <span class="m-pref__summary">Список изменений и прошлые версии</span>
  </span>
  <span class="m-pref__chevron" aria-hidden="true">{@html iconChevronRight(18)}</span>
</button>
