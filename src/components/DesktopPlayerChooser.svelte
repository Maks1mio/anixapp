<script lang="ts">
  /** Диалог «Выберите плеер» (ПК): веб / встроенный / сторонний → список установленных интеграций. */
  import { onMount } from 'svelte';
  import UiV2ChoiceSheet, { type UiV2ChoiceOption } from './uikit-v2/UiV2ChoiceSheet.svelte';
  import UiV2Toggle from './uikit-v2/UiV2Toggle.svelte';
  import { getMobilePlayerPrefs, type MobilePlayerKind } from '../utils/mobile-player';
  import {
    getPreferredExternalPlayerId,
    listExternalPlayers,
    setPreferredExternalPlayerId,
    type ExternalPlayerId,
    type ExternalPlayerOption,
  } from '../utils/player-integration';
  import { requestOpenExternal } from '../utils/external-link';

  const GITHUB_ISSUES = 'https://github.com/Maks1mio/anixapp/issues';
  const DISCORD_INVITE = 'https://discord.gg/qdFMFxzU9A';

  interface Props {
    onChoose: (kind: MobilePlayerKind, remember: boolean, playerId?: ExternalPlayerId) => void;
    onClose: () => void;
  }
  let { onChoose, onClose }: Props = $props();

  const initial = getMobilePlayerPrefs();
  let kind = $state<MobilePlayerKind>(
    initial.kind === 'web' || initial.kind === 'external' ? initial.kind : 'builtin',
  );
  let remember = $state(initial.ask === false);
  let step = $state<'main' | 'external' | 'suggest'>('main');
  let installed = $state<ExternalPlayerOption[]>([]);
  /** Все плееры, поддерживаемые на этой ОС (установленные и нет). */
  let supported = $state<ExternalPlayerOption[]>([]);

  /** ['A', 'B', 'C'] → «A, B или C» */
  function joinOr(labels: string[]): string {
    if (labels.length < 2) return labels.join('');
    return `${labels.slice(0, -1).join(', ')} или ${labels[labels.length - 1]}`;
  }
  let loadingPlayers = $state(true);
  let preferred = $state<ExternalPlayerId | null>(getPreferredExternalPlayerId());

  const MAIN_OPTIONS = $derived.by((): UiV2ChoiceOption[] => [
    { value: 'web', label: 'Веб-плеер', description: 'Просмотр в плеере источника. Стандартный вариант.' },
    { value: 'builtin', label: 'Встроенный плеер', description: 'Прямой поток в приложении — быстрый и без лишних окон.' },
    {
      value: 'external',
      label: 'Сторонний плеер',
      description: loadingPlayers && !installed.length
        ? 'Проверяем установленные плееры…'
        : installed.length
          ? installed.map((p) => p.label).join(', ')
          : supported.length
            ? `Не найден ${joinOr(supported.map((p) => p.label))}.`
            : 'Не найдено поддерживаемых плееров.',
      warning: 'Не помечается просмотренным в приложении при выборе серий в плеере.',
    },
  ]);

  const externalOptions = $derived.by((): UiV2ChoiceOption[] =>
    installed.map((p) => ({
      value: p.id,
      label: p.label,
      description: p.description,
    })),
  );

  function applyInstalled(list: ExternalPlayerOption[]) {
    installed = list;
    if (preferred && !installed.some((p) => p.id === preferred)) preferred = installed[0]?.id ?? null;
    else if (!preferred && installed[0]) preferred = installed[0].id;
  }

  async function refreshInstalled(fresh = false, opts?: { silent?: boolean }) {
    if (!opts?.silent) loadingPlayers = true;
    try {
      const res = await listExternalPlayers({ fresh });
      supported = res.players;
      applyInstalled(res.installed);
    } catch {
      if (!opts?.silent) installed = [];
    } finally {
      loadingPlayers = false;
    }
  }

  onMount(() => {
    void (async () => {
      await refreshInstalled(false);
      void refreshInstalled(true, { silent: true });
    })();
  });

  async function pickMain(v: string | number) {
    const next = String(v) as MobilePlayerKind;
    kind = next;
    if (next === 'external') {
      if (!installed.length) await refreshInstalled(true);
      // Всегда список (даже 1 плеер) — иначе не видно «Нет в списке!»
      step = 'external';
      void refreshInstalled(true, { silent: true });
      return;
    }
    onChoose(next, remember);
  }

  function finishExternal(id: ExternalPlayerId) {
    preferred = id;
    if (remember) setPreferredExternalPlayerId(id);
    onChoose('external', remember, id);
  }

  function onExternalSelect(v: string | number) {
    finishExternal(String(v) as ExternalPlayerId);
  }

  function closeExternalStep() {
    step = 'main';
  }

  function openSuggest() {
    step = 'suggest';
  }

  function closeSuggest() {
    step = 'external';
    // Пользователь мог как раз поставить плеер по ссылке.
    void refreshInstalled(true, { silent: true });
  }

  function openLink(url: string) {
    requestOpenExternal(url);
  }
</script>

{#if step === 'main'}
  <UiV2ChoiceSheet
    title="Выберите плеер"
    options={MAIN_OPTIONS}
    value={kind}
    cancelLabel="Отмена"
    disabled={loadingPlayers && kind === 'external'}
    onSelect={pickMain}
    {onClose}
  >
    {#snippet footer()}
      <div class="dpc-remember">
        <span class="dpc-remember__text">Запомнить выбор</span>
        <UiV2Toggle
          label="Запомнить выбор"
          checked={remember}
          onChange={(next) => (remember = next)}
        />
      </div>
    {/snippet}
  </UiV2ChoiceSheet>
{:else if step === 'external'}
  <UiV2ChoiceSheet
    title="Сторонний плеер"
    options={externalOptions}
    value={preferred || installed[0]?.id || ''}
    cancelLabel="Назад"
    onSelect={onExternalSelect}
    onClose={closeExternalStep}
  >
    {#snippet footer()}
      <div class="dpc-missing">
        {#if !installed.length}
          <p class="dpc-missing__hint">На устройстве не найдено поддерживаемых плееров.</p>
        {/if}
        <div class="dpc-missing__row">
          {#if supported.length}
            <span class="dpc-missing__count">Найдено {installed.length} из {supported.length}</span>
          {/if}
          <button type="button" class="dpc-missing__link" onclick={openSuggest}>
            Какие плееры поддерживаются?
          </button>
        </div>
      </div>
    {/snippet}
  </UiV2ChoiceSheet>
{:else}
  <UiV2ChoiceSheet
    title="Поддерживаемые плееры"
    options={[]}
    value=""
    cancelLabel="Назад"
    onClose={closeSuggest}
  >
    {#snippet footer()}
      <div class="dpc-suggest">
        {#if supported.length}
          <p class="dpc-suggest__lead">Установите любой — он появится в списке.</p>
          <ul class="dpc-supported">
            {#each supported as p (p.id)}
              <li class="dpc-supported__row">
                <span class="dpc-supported__body">
                  <span class="dpc-supported__name">{p.label}</span>
                  <span class="dpc-supported__mode">
                    {p.playlist ? 'Плейлист серий' : 'Только текущая серия'}
                  </span>
                </span>
                {#if p.installed}
                  <span class="dpc-supported__status">{p.note || 'Установлен'}</span>
                {:else if p.downloadUrl}
                  <button
                    type="button"
                    class="dpc-supported__download"
                    onclick={() => openLink(p.downloadUrl!)}
                  >
                    Скачать
                  </button>
                {:else}
                  <span class="dpc-supported__missing">Не найден</span>
                {/if}
              </li>
            {/each}
          </ul>
        {/if}
        <p class="dpc-suggest__text">
          Нужен другой плеер? Напишите issue на GitHub или в Discord <strong>#баги-запросы</strong>.
        </p>
        <ul class="dpc-suggest__links">
          <li>
            <button type="button" class="dpc-suggest__btn" onclick={() => openLink(GITHUB_ISSUES)}>
              GitHub Issues
            </button>
          </li>
          <li>
            <button type="button" class="dpc-suggest__btn" onclick={() => openLink(DISCORD_INVITE)}>
              Discord · #баги-запросы
            </button>
          </li>
        </ul>
      </div>
    {/snippet}
  </UiV2ChoiceSheet>
{/if}

<style lang="scss">
  .dpc-remember {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
  }
  .dpc-remember__text {
    font-size: 0.88rem;
    color: var(--uikit-v2-text);
  }

  .dpc-missing {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.45rem;
  }
  .dpc-missing__hint {
    margin: 0;
    font-size: 0.82rem;
    line-height: 1.35;
    color: var(--uikit-v2-text-muted, #aeaeb2);
  }
  .dpc-missing__link {
    border: 0;
    padding: 0;
    background: none;
    font: inherit;
    font-size: 0.9rem;
    font-weight: 600;
    color: var(--uikit-v2-accent, #ff3b5c);
    text-decoration: underline;
    text-underline-offset: 0.15em;
    cursor: pointer;
  }
  .dpc-missing__link:hover {
    opacity: 0.9;
  }
  .dpc-missing__row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    width: 100%;
  }
  .dpc-missing__count {
    font-size: 0.82rem;
    color: var(--uikit-v2-muted, #aeaeb2);
  }

  .dpc-suggest__lead {
    margin: 0;
    font-size: 0.85rem;
    color: var(--uikit-v2-muted, #aeaeb2);
  }
  .dpc-supported {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .dpc-supported__row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.6rem 0;
    border-top: 1px solid color-mix(in srgb, var(--uikit-v2-text, #fff) 10%, transparent);
  }
  .dpc-supported__body {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-width: 0;
  }
  .dpc-supported__name {
    font-size: 0.92rem;
    font-weight: 600;
    color: var(--uikit-v2-text, #f2f2f7);
  }
  .dpc-supported__mode {
    font-size: 0.8rem;
    color: var(--uikit-v2-muted, #aeaeb2);
  }
  .dpc-supported__status {
    font-size: 0.82rem;
    color: var(--uikit-v2-success, var(--color-success, #22c55e));
    white-space: nowrap;
  }
  .dpc-supported__missing {
    font-size: 0.82rem;
    color: var(--uikit-v2-muted, #aeaeb2);
    white-space: nowrap;
  }
  .dpc-supported__download {
    border: 0;
    padding: 0;
    background: none;
    font: inherit;
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--uikit-v2-accent, #ff3b5c);
    white-space: nowrap;
    cursor: pointer;
  }
  .dpc-supported__download:hover {
    text-decoration: underline;
  }
  .dpc-supported__download:focus-visible {
    outline: 2px solid var(--uikit-v2-accent, #ff3b5c);
    outline-offset: 2px;
  }
  .dpc-missing__link:focus-visible {
    outline: 2px solid var(--uikit-v2-accent, #ff3b5c);
    outline-offset: 2px;
    border-radius: 2px;
  }

  .dpc-suggest {
    display: flex;
    flex-direction: column;
    gap: 0.85rem;
  }
  .dpc-suggest__text {
    margin: 0;
    font-size: 0.9rem;
    line-height: 1.45;
    color: var(--uikit-v2-text, #f2f2f7);
  }
  .dpc-suggest__text strong {
    font-weight: 650;
  }
  .dpc-suggest__links {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .dpc-suggest__btn {
    width: 100%;
    border: 1px solid color-mix(in srgb, var(--uikit-v2-text, #fff) 14%, transparent);
    border-radius: 0.75rem;
    padding: 0.7rem 0.9rem;
    background: color-mix(in srgb, var(--uikit-v2-text, #fff) 6%, transparent);
    color: var(--uikit-v2-accent, #ff3b5c);
    font: inherit;
    font-size: 0.9rem;
    font-weight: 600;
    text-align: left;
    cursor: pointer;
  }
  .dpc-suggest__btn:hover {
    background: color-mix(in srgb, var(--uikit-v2-text, #fff) 10%, transparent);
  }
  .dpc-suggest__btn:focus-visible {
    outline: 2px solid var(--uikit-v2-accent, #ff3b5c);
    outline-offset: 2px;
  }
</style>
