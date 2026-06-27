<script lang="ts">
  import { navigate } from '../../../stores/navigation';
  import WrappedScreenShell from '../components/WrappedScreenShell.svelte';
  import type { WrappedData } from '../shared/wrapped-load';
  import { releaseTitle } from '../shared/wrapped-utils';

  interface Props { data: WrappedData; }
  let { data }: Props = $props();

  const comments = $derived(data.topComments.slice(0, 3));

  function openRelease(id: number) {
    if (id > 0) navigate(`/release/${id}`);
  }
</script>

<WrappedScreenShell id="comments">
  <div class="rewind-comments">
    <h2 class="rewind-comments__title" data-wrapped-animate>Комментарии, что зашли</h2>
    <ul class="rewind-comments__list">
      {#each comments as c, i (c.id)}
        {@const title = c.release ? releaseTitle(c.release) : ''}
        {@const relId = Number(c.release?.id ?? 0)}
        <li class="rewind-comment" data-wrapped-animate style="--i:{i}">
          <button
            type="button"
            class="rewind-comment__body"
            disabled={relId <= 0}
            onclick={() => openRelease(relId)}
          >
            <span class="rewind-comment__text" class:rewind-comment__text--spoiler={c.isSpoiler}>
              «{c.message}»
            </span>
            {#if title}<span class="rewind-comment__src">{title}</span>{/if}
          </button>
          <span class="rewind-comment__likes">
            <span class="rewind-comment__heart">♥</span>
            <b>{c.likes}</b>
          </span>
        </li>
      {/each}
    </ul>
  </div>
</WrappedScreenShell>
