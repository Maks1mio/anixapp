<script lang="ts">
  type Props = {
    checked?: boolean;
    disabled?: boolean;
    label: string;
    class?: string;
    onChange?: (next: boolean) => void;
  };

  let {
    checked = false,
    disabled = false,
    label,
    class: className = '',
    onChange,
  }: Props = $props();
</script>

<label class="uiv2-toggle {className}" class:uiv2-toggle--disabled={disabled}>
  <input
    type="checkbox"
    {checked}
    {disabled}
    aria-label={label}
    onchange={(e) => onChange?.((e.currentTarget as HTMLInputElement).checked)}
  />
  <span class="uiv2-toggle__ui" aria-hidden="true"></span>
</label>
