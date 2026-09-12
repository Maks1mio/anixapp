<script lang="ts">
  import type { Snippet } from 'svelte';

  type Size = 'sm' | 'md' | 'lg';

  type Props = {
    /** Подпись / placeholder */
    label: string;
    value?: string;
    size?: Size;
    type?: 'text' | 'search' | 'email' | 'url' | 'password';
    name?: string;
    id?: string;
    maxlength?: number;
    autocomplete?: string;
    inputmode?: 'text' | 'email' | 'numeric' | 'tel' | 'url' | 'search' | 'none' | 'decimal';
    spellcheck?: boolean;
    disabled?: boolean;
    error?: boolean;
    class?: string;
    /** Иконка слева */
    icon?: Snippet;
    oninput?: (e: Event) => void;
    onkeydown?: (e: KeyboardEvent) => void;
  };

  let {
    label,
    value = $bindable(''),
    size = 'md',
    type = 'text',
    name,
    id = `uiv2-pill-${Math.random().toString(36).slice(2, 9)}`,
    maxlength,
    autocomplete,
    inputmode,
    spellcheck = true,
    disabled = false,
    error = false,
    class: className = '',
    icon,
    oninput,
    onkeydown,
  }: Props = $props();

  let focused = $state(false);
</script>

<div
  class="uiv2-pill-field uiv2-pill-field--{size} {className}"
  class:uiv2-pill-field--focused={focused}
  class:uiv2-pill-field--disabled={disabled}
  class:uiv2-pill-field--error={error}
  class:uiv2-pill-field--icon={!!icon}
>
  {#if icon}
    <span class="uiv2-pill-field__icon" aria-hidden="true">{@render icon()}</span>
  {/if}
  <input
    {id}
    {name}
    {type}
    {maxlength}
    {autocomplete}
    {inputmode}
    {disabled}
    {spellcheck}
    class="uiv2-pill-field__input"
    bind:value
    placeholder={label}
    aria-label={label}
    aria-invalid={error || undefined}
    onfocus={() => { focused = true; }}
    onblur={() => { focused = false; }}
    {oninput}
    {onkeydown}
  />
</div>
