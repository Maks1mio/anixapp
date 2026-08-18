<script lang="ts">
  import { untrack } from 'svelte';
  import UiV2Button from './uikit-v2/UiV2Button.svelte';
  import UiV2OutlinedField from './uikit-v2/UiV2OutlinedField.svelte';

  type Props = {
    createLoading?: boolean;
    joinLoading?: boolean;
    joinHint?: string;
    joinHintError?: boolean;
    initialCode?: string;
    onCreate: () => void;
    onJoin: (code: string) => void;
  };

  let {
    createLoading = false,
    joinLoading = false,
    joinHint = '',
    joinHintError = false,
    initialCode = '',
    onCreate,
    onJoin,
  }: Props = $props();

  let codeInput = $state(untrack(() => String(initialCode || '').toUpperCase().replace(/[^A-Z0-9]/g, '')));
  const busy = $derived(createLoading || joinLoading);

  function normalizeCode(raw: string): string {
    return raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
  }

  function handleCodeInput(e: Event) {
    codeInput = normalizeCode((e.target as HTMLInputElement).value);
  }

  function handleJoin() {
    onJoin(codeInput.trim());
  }
</script>

<div class="lobby-chooser">
  <div class="lobby-chooser__welcome">
    <div class="lobby-chooser__welcome-icon" aria-hidden="true">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <rect x="2" y="3" width="20" height="14" rx="2"/>
        <line x1="8" y1="21" x2="16" y2="21"/>
        <line x1="12" y1="17" x2="12" y2="21"/>
        <polygon points="10 8 16 11 10 14 10 8" fill="currentColor" stroke="none"/>
      </svg>
    </div>
    <p class="lobby-chooser__welcome-text">Смотрите аниме вместе с друзьями в реальном времени</p>
  </div>

  <div class="lobby-chooser__actions">
    <UiV2Button
      label={createLoading ? 'Создаём…' : 'Создать комнату'}
      variant="primary"
      size="lg"
      block
      disabled={busy}
      onclick={() => onCreate()}
    >
      {#snippet icon()}
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="16"/>
          <line x1="8" y1="12" x2="16" y2="12"/>
        </svg>
      {/snippet}
    </UiV2Button>

    <div class="lobby-chooser__divider">
      <span class="lobby-chooser__divider-line"></span>
      <span class="lobby-chooser__divider-text">или</span>
      <span class="lobby-chooser__divider-line"></span>
    </div>

    <form
      class="lobby-chooser__join"
      onsubmit={(e) => { e.preventDefault(); handleJoin(); }}
    >
      <UiV2OutlinedField
        label="Присоединиться по коду"
        bind:value={codeInput}
        maxlength={12}
        autocomplete="off"
        spellcheck={false}
        disabled={busy}
        error={joinHintError}
        hint={joinHint}
        hintTone={joinHintError ? 'error' : 'default'}
        oninput={handleCodeInput}
      />

      <UiV2Button
        label={joinLoading ? 'Входим…' : 'Войти'}
        variant="primary"
        size="md"
        block
        disabled={busy}
        onclick={handleJoin}
      >
        {#snippet icon()}
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>
            <polyline points="10 17 15 12 10 7"/>
            <line x1="15" y1="12" x2="3" y2="12"/>
          </svg>
        {/snippet}
      </UiV2Button>
    </form>
  </div>
</div>
