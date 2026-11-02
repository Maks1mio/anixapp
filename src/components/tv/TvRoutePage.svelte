<script lang="ts">
  import ScheduleTv from '../../views/Schedule.tv.svelte';
  import CollectionsListTv from '../../views/CollectionsList.tv.svelte';
  import CollectionTv from '../../views/Collection.tv.svelte';
  import PopularCategoryTv from '../../views/PopularCategory.tv.svelte';
  import ProfileTv from '../../views/Profile.tv.svelte';
  import SettingsTv from '../../views/Settings.tv.svelte';

  /** Страница по ключу keep-alive `page:*` (см. `tvKeptPageKeys`). */
  interface Props {
    pageKey: string;
  }

  let { pageKey }: Props = $props();

  const section = $derived(pageKey.split('/')[0] ?? '');
  const param = $derived(pageKey.split('/')[1] ?? '');
  const id = $derived(Number.parseInt(param, 10));
</script>

{#if section === 'schedule'}
  <ScheduleTv />
{:else if section === 'collections'}
  <CollectionsListTv />
{:else if section === 'collection' && id > 0}
  <CollectionTv {id} />
{:else if section === 'popular'}
  <PopularCategoryTv tab={param} />
{:else if section === 'profile'}
  <ProfileTv userId={id > 0 ? id : undefined} />
{:else if section === 'settings'}
  <SettingsTv />
{/if}
