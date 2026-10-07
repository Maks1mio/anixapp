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
  import { showToast } from '../stores/toast';

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
  let step = $state<'main' | 'external'>('main');
  let installed = $state<ExternalPlayerOption[]>([]);
  let loadingPlayers = $state(true);
  let preferred = $state<ExternalPlayerId | null>(getPreferredExternalPlayerId());

  const MAIN_OPTIONS = $derived.by((): UiV2ChoiceOption[] => [
    { value: 'web', label: 'Веб-плеер', description: 'Просмотр в плеере источника. Стандартный вариант.' },
    { value: 'builtin', label: 'Встроенный плеер', description: 'Прямой поток в приложении — быстрый и без лишних окон.' },
    {
      value: 'external',
      label: 'Сторонний плеер',
      description: loadingPlayers
        ? 'Проверяем установленные плееры…'
        : installed.length
          ? installed.map((p) => p.label).join(', ')
          : 'Не найден VLC или mpv. Установите один из них.',
    },
  ]);

  const externalOptions = $derived.by((): UiV2ChoiceOption[] =>
    installed.map((p) => ({
      value: p.id,
      label: p.label,
      description: p.description,
    })),
  );

  async function refreshInstalled(fresh = false) {
    loadingPlayers = true;
    try {
      const res = await listExternalPlayers({ fresh });
      installed = res.installed;
      if (preferred && !installed.some((p) => p.id === preferred)) preferred = installed[0]?.id ?? null;
      else if (!preferred && installed[0]) preferred = installed[0].id;
    } catch {
      installed = [];
    } finally {
      loadingPlayers = false;
    }
  }

  onMount(() => {
    void refreshInstalled(true);
  });

  async function pickMain(v: string | number) {
    const next = String(v) as MobilePlayerKind;
    kind = next;
    if (next === 'external') {
      if (loadingPlayers) return;
      // Live-детект перед показом списка (реестр / новый install).
      await refreshInstalled(true);
      if (!installed.length) {
        showToast('Не найден VLC или mpv. Установите один из них и повторите.');
        return;
      }
      if (installed.length === 1) {
        finishExternal(installed[0].id);
        return;
      }
      step = 'external';
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
    const id = String(v) as ExternalPlayerId;
    finishExternal(id);
  }

  function closeExternalStep() {
    step = 'main';
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
{:else}
  <UiV2ChoiceSheet
    title="Сторонний плеер"
    options={externalOptions}
    value={preferred || installed[0]?.id || ''}
    cancelLabel="Назад"
    onSelect={onExternalSelect}
    onClose={closeExternalStep}
  />
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
</style>
