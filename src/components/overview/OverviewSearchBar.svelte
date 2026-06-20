<script lang="ts">
  import { iconSearch } from '../icons';

  function focusGlobalSearch() {
    const input = document.getElementById('titlebar-search-input') as HTMLInputElement | null;
    if (input) {
      input.focus();
      input.select();
      return;
    }
    window.dispatchEvent(new CustomEvent('anix:focusSearch'));
  }
</script>

<button type="button" class="overview-search" onclick={focusGlobalSearch}>
  <span class="overview-search__icon">{@html iconSearch(18)}</span>
  <span class="overview-search__placeholder">Поиск аниме</span>
</button>
