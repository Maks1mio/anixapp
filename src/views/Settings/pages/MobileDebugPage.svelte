<script lang="ts">
  /** Android: журнал приложения — ошибки, сеть, АниксПлеер. Копирование и «Поделиться» для отчёта о баге. */
  import { onDestroy } from 'svelte';
  import UiV2Button from '../../../components/uikit-v2/UiV2Button.svelte';
  import { subscribeLog, clearLog, exportLogText, type LogEntry, type LogChannel } from '../../../services/mobile-log';

  type Filter = 'all' | 'error' | LogChannel;
  const FILTERS: { id: Filter; label: string }[] = [
    { id: 'all', label: 'Все' },
    { id: 'error', label: 'Ошибки' },
    { id: 'player', label: 'Плеер' },
    { id: 'network', label: 'Сеть' },
    { id: 'app', label: 'Приложение' },
  ];
  const CHANNEL_LABEL: Record<LogChannel, string> = { app: 'Приложение', network: 'Сеть', player: 'Плеер', system: 'Система' };

  let entries = $state<LogEntry[]>([]);
  let filter = $state<Filter>('all');
  let feedback = $state('');
  const unsub = subscribeLog((e) => { entries = [...e]; });
  onDestroy(unsub);

  const match = (e: LogEntry) => filter === 'all' || (filter === 'error' ? e.level !== 'info' : e.channel === filter);
  const shown = $derived(entries.filter(match).slice().reverse());
  const errorCount = $derived(entries.filter((e) => e.level === 'error').length);

  function time(ts: number) {
    const d = new Date(ts);
    return d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  function flash(msg: string) {
    feedback = msg;
    setTimeout(() => { if (feedback === msg) feedback = ''; }, 2500);
  }

  async function copy() {
    const text = exportLogText(match);
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    flash('Журнал скопирован');
  }

  async function share() {
    const p = (window as unknown as { Capacitor?: { Plugins?: { AnixPlayer?: { shareText?: (o: { text: string; title?: string }) => Promise<void> } } } })
      .Capacitor?.Plugins?.AnixPlayer;
    if (!p?.shareText) { await copy(); return; }
    try { await p.shareText({ text: exportLogText(match), title: 'Журнал AnixApp' }); } catch { flash('Не удалось поделиться'); }
  }

  function clear() {
    clearLog();
    flash('Журнал очищен');
  }
</script>

<div class="uiv2-settings">
  <section class="uiv2-settings__block">
    <h3 class="uiv2-settings__title">Журнал</h3>
    <p class="mdbg__lead">
      Записей: {entries.length}{errorCount ? `, ошибок: ${errorCount}` : ''}. Хранится только на этом устройстве;
      ссылки записываются без параметров, токены и пароли не попадают.
    </p>
    <div class="mdbg__actions">
      <UiV2Button label="Поделиться" variant="primary" size="sm" onclick={share} disabled={!entries.length} />
      <UiV2Button label="Скопировать" variant="chrome" size="sm" onclick={copy} disabled={!entries.length} />
      <UiV2Button label="Очистить" variant="chrome" size="sm" onclick={clear} disabled={!entries.length} />
    </div>
    {#if feedback}<p class="mdbg__feedback" role="status">{feedback}</p>{/if}
    <div class="mdbg__filters" role="tablist" aria-label="Фильтр журнала">
      {#each FILTERS as f (f.id)}
        <button type="button" role="tab" aria-selected={filter === f.id} class="mdbg__chip" class:mdbg__chip--on={filter === f.id} onclick={() => (filter = f.id)}>
          {f.label}
        </button>
      {/each}
    </div>
  </section>

  <section class="uiv2-settings__block">
    {#if shown.length}
      <ul class="mdbg__list">
        {#each shown as e (e.ts + e.message)}
          <li class="mdbg__item mdbg__item--{e.level}">
            <div class="mdbg__meta">
              <span class="mdbg__badge">{e.level === 'error' ? 'Ошибка' : e.level === 'warn' ? 'Внимание' : 'Инфо'}</span>
              <span>{CHANNEL_LABEL[e.channel]}</span>
              <span class="mdbg__time">{time(e.ts)}</span>
            </div>
            <p class="mdbg__msg">{e.message}</p>
          </li>
        {/each}
      </ul>
    {:else}
      <p class="mdbg__empty">Здесь пока пусто.</p>
    {/if}
  </section>
</div>

<style>
  .mdbg__lead, .mdbg__feedback, .mdbg__empty {
    margin: 0 0 12px;
    font-size: 13px;
    line-height: 1.45;
    opacity: 0.75;
  }
  .mdbg__feedback { opacity: 1; color: var(--m-primary, #d0bcff); }

  .mdbg__actions { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }

  .mdbg__filters { display: flex; gap: 8px; overflow-x: auto; scrollbar-width: none; padding-bottom: 2px; }
  .mdbg__chip {
    flex: none;
    min-height: 36px;
    padding: 0 14px;
    border: 1px solid var(--m-outline-variant, rgba(255, 255, 255, 0.16));
    border-radius: 18px;
    background: none;
    color: inherit;
    font: inherit;
    font-size: 14px;
  }
  .mdbg__chip--on { border-color: var(--m-primary, #d0bcff); background: var(--m-secondary-container, rgba(208, 188, 255, 0.16)); }

  .mdbg__list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
  .mdbg__item {
    padding: 10px 12px;
    border-radius: 12px;
    background: var(--m-surface-container, rgba(255, 255, 255, 0.05));
    border-left: 3px solid var(--m-outline-variant, rgba(255, 255, 255, 0.2));
    min-width: 0;
  }
  .mdbg__item--warn { border-left-color: #f57c00; }
  .mdbg__item--error { border-left-color: #e53935; }
  .mdbg__meta { display: flex; flex-wrap: wrap; gap: 4px 10px; font-size: 12px; opacity: 0.75; margin-bottom: 4px; }
  .mdbg__badge { font-weight: 600; }
  .mdbg__time { margin-left: auto; font-variant-numeric: tabular-nums; }
  .mdbg__msg {
    margin: 0;
    font: 12.5px/1.45 ui-monospace, 'Roboto Mono', monospace;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
</style>
