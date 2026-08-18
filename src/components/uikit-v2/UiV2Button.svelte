<script lang="ts">
  import type { Snippet } from 'svelte';

  type Size = 'sm' | 'md' | 'lg';
  type Variant = 'chrome' | 'primary' | 'ghost' | 'danger' | 'light';

  type Props = {
    /** Видимый текст кнопки */
    label: string;
    size?: Size;
    variant?: Variant;
    disabled?: boolean;
    /** Растянуть на всю доступную ширину */
    block?: boolean;
    /** Иконка слева от текста */
    icon?: Snippet;
    /** Иконка справа (шеврон селекта) */
    trailing?: Snippet;
    class?: string;
    title?: string;
    ariaHaspopup?: 'dialog' | 'menu' | 'listbox' | 'tree' | 'grid' | boolean;
    ariaExpanded?: boolean;
    onclick?: (e: MouseEvent) => void;
  };

  let {
    label,
    size = 'md',
    variant = 'chrome',
    disabled = false,
    block = false,
    icon,
    trailing,
    class: className = '',
    title,
    ariaHaspopup,
    ariaExpanded,
    onclick,
  }: Props = $props();
</script>

<button
  type="button"
  class="uiv2-btn uiv2-btn--{size} uiv2-btn--{variant} {className}"
  class:uiv2-btn--icon={!!icon}
  class:uiv2-btn--trailing={!!trailing}
  class:uiv2-btn--block={block}
  {disabled}
  {title}
  aria-haspopup={ariaHaspopup}
  aria-expanded={ariaExpanded}
  {onclick}
>
  {#if icon}
    <span class="uiv2-btn__icon" aria-hidden="true">
      {@render icon()}
    </span>
  {/if}
  <span class="uiv2-btn__label">{label}</span>
  {#if trailing}
    <span class="uiv2-btn__trailing" aria-hidden="true">
      {@render trailing()}
    </span>
  {/if}
</button>
