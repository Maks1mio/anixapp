<script lang="ts">
  import Select from '../Select.svelte';
  import { COLLECTION_SORT_OPTIONS } from '../../utils/collection';

  interface Props {
    value: number;
    onChange: (sort: number) => void;
  }

  let { value, onChange }: Props = $props();

  const options = COLLECTION_SORT_OPTIONS.map((o) => ({
    value: String(o.value),
    label: o.label,
  }));
</script>

<div class="collections-sort">
  <Select
    value={String(value)}
    {options}
    onChange={(v) => onChange(Number(v))}
    className="collections-sort__select"
  />
</div>
