<script lang="ts">
  import SelectEnhanced from './SelectEnhanced.svelte';
  import UiV2Select from './uikit-v2/UiV2Select.svelte';
  import type { SelectProps } from './Select.svelte.ts';

  let {
    label,
    placeholder = 'Выберите…',
    options = [],
    sections = [],
    value = null,
    values = [],
    onChange,
    onValuesChange,
    className,
    id,
    disabled = false,
    compact = false,
    enhanced = false,
    searchable = false,
    multi = false,
    variant = 'default',
    startYear = null,
    endYear = null,
    onYearRangeChange,
    emptyValue = '0',
    resetValue,
  }: SelectProps = $props();

  const useEnhanced = $derived(
    !compact && (
      enhanced ||
      multi ||
      searchable ||
      variant === 'yearRange' ||
      (sections?.length ?? 0) > 0
    ),
  );

  const v2Options = $derived(
    options.map((o) => ({
      value: o.value,
      label: o.label,
      desc: o.desc,
      warning: o.warning,
      disabled: o.disabled,
    })),
  );
</script>

{#if useEnhanced}
  <SelectEnhanced
    {label}
    placeholder={placeholder === 'Выберите…' ? 'Неважно' : placeholder}
    {options}
    {sections}
    value={value ?? '0'}
    {values}
    {multi}
    {searchable}
    {disabled}
    {variant}
    {startYear}
    {endYear}
    onChange={(v) => onChange?.(v)}
    onValuesChange={(v) => onValuesChange?.(v)}
    onYearRangeChange={(a, b) => onYearRangeChange?.(a, b)}
    {emptyValue}
    {resetValue}
  />
{:else}
  <UiV2Select
    {label}
    {placeholder}
    options={v2Options}
    value={value}
    {disabled}
    {compact}
    {id}
    class={className}
    onChange={(v) => onChange?.(v)}
  />
{/if}
