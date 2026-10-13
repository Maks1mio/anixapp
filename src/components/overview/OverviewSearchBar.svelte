<script lang="ts">
  import { iconSearch } from '../icons';

  function focusGlobalSearch() {
    window.dispatchEvent(new CustomEvent('anix:openSearchIsland'));
  }
</script>

<button type="button" class="overview-search" onclick={focusGlobalSearch}>
  <span class="overview-search__icon">{@html iconSearch(18)}</span>
  <span class="overview-search__placeholder">Поиск аниме</span>
</button>
