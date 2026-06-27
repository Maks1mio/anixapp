<script lang="ts">
  import WrappedScreenShell from '../components/WrappedScreenShell.svelte';
  import type { WrappedData } from '../shared/wrapped-load';
  import { bingeStatSteps } from '../shared/rewind-steps';

  interface Props {
    data: WrappedData;
    bingeStep?: number;
  }
  let { data, bingeStep = 0 }: Props = $props();

  const steps = $derived(bingeStatSteps(data));
  const step = $derived(steps[bingeStep] ?? steps[0]);
</script>

{#if step}
  <WrappedScreenShell id="binge" hideCornerLogo>
    <div class="rewind-stat rewind-stat--binge">
      <p class="rewind-stat__eyebrow" data-wrapped-animate>{step.eyebrow}</p>
      <span class="rewind-stat__huge" data-stat-value={step.value} data-wrapped-animate>
        {step.value}
      </span>
      <span class="rewind-stat__label" data-wrapped-animate>{step.label}</span>
      {#if step.note}
        <p class="rewind-stat__note" data-wrapped-animate>{step.note}</p>
      {/if}
    </div>
  </WrappedScreenShell>
{/if}
