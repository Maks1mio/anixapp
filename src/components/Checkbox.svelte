<script lang="ts">
  import { iconCheck } from './icons';

  interface Props {
    checked?: boolean;
    disabled?: boolean;
    label?: string;
    id?: string;
    className?: string;
    onchange?: (checked: boolean) => void;
  }

  let {
    checked = $bindable(false),
    disabled = false,
    label,
    id,
    className,
    onchange,
  }: Props = $props();

  function handleChange(e: Event) {
    const next = (e.currentTarget as HTMLInputElement).checked;
    checked = next;
    onchange?.(next);
  }
</script>

<label
  class="anix-checkbox{className ? ' ' + className : ''}{disabled ? ' anix-checkbox--disabled' : ''}"
  {id}
>
  <input
    type="checkbox"
    class="anix-checkbox__input"
    {checked}
    {disabled}
    onchange={handleChange}
  />
  <span class="anix-checkbox__box" aria-hidden="true">
    <span class="anix-checkbox__icon" class:anix-checkbox__icon--visible={checked}>
      {@html iconCheck(13)}
    </span>
  </span>
  {#if label}
    <span class="anix-checkbox__label">{label}</span>
  {/if}
</label>
