<script lang="ts">
  import { iconEye, iconEyeOff } from '../icons';

  type HintTone = 'default' | 'error' | 'ok';

  type Props = {
    label: string;
    value?: string;
    type?: 'text' | 'email' | 'password' | 'url' | 'search';
    autocomplete?: string;
    inputmode?: 'text' | 'email' | 'numeric' | 'tel' | 'url' | 'search' | 'none' | 'decimal';
    name?: string;
    maxlength?: number;
    required?: boolean;
    disabled?: boolean;
    /** Показать кнопку показать/скрыть пароль */
    revealable?: boolean;
    multiline?: boolean;
    rows?: number;
    hint?: string;
    hintTone?: HintTone;
    error?: boolean;
    spellcheck?: boolean;
    id?: string;
    class?: string;
    oninput?: (e: Event) => void;
  };

  let {
    label,
    value = $bindable(''),
    type = 'text',
    autocomplete,
    inputmode,
    name,
    maxlength,
    required = false,
    disabled = false,
    revealable = false,
    multiline = false,
    rows = 4,
    hint = '',
    hintTone = 'default',
    error = false,
    spellcheck = true,
    id = `uiv2-field-${Math.random().toString(36).slice(2, 9)}`,
    class: className = '',
    oninput,
  }: Props = $props();

  let focused = $state(false);
  let revealed = $state(false);

  const floated = $derived(focused || String(value ?? '').length > 0);
  const inputType = $derived(
    revealable ? (revealed ? 'text' : 'password') : type,
  );
  const hintId = $derived(hint ? `${id}-hint` : undefined);
</script>

<div class="uiv2-outlined-wrap {className}">
  <div
    class="uiv2-outlined-field"
    class:uiv2-outlined-field--focused={focused}
    class:uiv2-outlined-field--floated={floated}
    class:uiv2-outlined-field--disabled={disabled}
    class:uiv2-outlined-field--revealable={revealable}
    class:uiv2-outlined-field--error={error}
    class:uiv2-outlined-field--multiline={multiline}
  >
    {#if multiline}
      <textarea
        {id}
        class="uiv2-outlined-field__input uiv2-outlined-field__input--area"
        {rows}
        {name}
        {maxlength}
        {required}
        {disabled}
        {spellcheck}
        aria-invalid={error || undefined}
        aria-describedby={hintId}
        bind:value
        onfocus={() => { focused = true; }}
        onblur={() => { focused = false; }}
        oninput={oninput}
      ></textarea>
    {:else}
      <input
        {id}
        class="uiv2-outlined-field__input"
        type={inputType}
        {autocomplete}
        {inputmode}
        {name}
        {maxlength}
        {required}
        {disabled}
        {spellcheck}
        aria-invalid={error || undefined}
        aria-describedby={hintId}
        bind:value
        onfocus={() => { focused = true; }}
        onblur={() => { focused = false; }}
        oninput={oninput}
      />
    {/if}
    <label class="uiv2-outlined-field__label" for={id}>{label}</label>
    {#if revealable}
      <button
        type="button"
        class="uiv2-outlined-field__reveal"
        tabindex="-1"
        disabled={disabled}
        aria-label={revealed ? 'Скрыть пароль' : 'Показать пароль'}
        onclick={() => { revealed = !revealed; }}
      >
        {@html revealed ? iconEyeOff(18) : iconEye(18)}
      </button>
    {/if}
  </div>

  {#if hint}
    <p
      id={hintId}
      class="uiv2-outlined-field__hint"
      class:uiv2-outlined-field__hint--error={hintTone === 'error'}
      class:uiv2-outlined-field__hint--ok={hintTone === 'ok'}
      role="status"
    >
      {hint}
    </p>
  {/if}
</div>
