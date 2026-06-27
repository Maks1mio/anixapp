<script lang="ts">
  import WrappedScreenShell from '../components/WrappedScreenShell.svelte';
  import RewindLogo from '../components/RewindLogo.svelte';
  import { sceneFor } from '../shared/rewind-scenes';
  import type { WrappedData } from '../shared/wrapped-load';

  interface Props { data: WrappedData; }
  let { data }: Props = $props();

  const ink = sceneFor('welcome').ink;
</script>

<WrappedScreenShell id="welcome" hideCornerLogo>
  <div class="rewind-welcome">
    <span class="rewind-welcome__mark" data-wrapped-animate>
      <RewindLogo color={ink} size={30} />
    </span>
    <h1 class="rewind-welcome__title" data-wrapped-animate>Итоги года</h1>
    <span class="rewind-welcome__year" data-wrapped-animate>{data.year}</span>
    <p class="rewind-welcome__sub" data-wrapped-animate>
      Давай посмотрим чем насыщен этот уходящий год.
    </p>
  </div>
</WrappedScreenShell>
