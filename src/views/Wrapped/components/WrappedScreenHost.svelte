<script lang="ts">
  import type { WrappedData } from '../shared/wrapped-load';
  import WelcomeScreen from '../screens/WelcomeScreen.svelte';
  import TimeScreen from '../screens/TimeScreen.svelte';
  import BingeScreen from '../screens/BingeScreen.svelte';
  import ActivityScreen from '../screens/ActivityScreen.svelte';
  import TopThreeScreen from '../screens/TopThreeScreen.svelte';
  import GenresScreen from '../screens/GenresScreen.svelte';
  import PreferencesScreen from '../screens/PreferencesScreen.svelte';
  import CollectionsScreen from '../screens/CollectionsScreen.svelte';
  import TopRatedScreen from '../screens/TopRatedScreen.svelte';
  import YearStatsScreen from '../screens/YearStatsScreen.svelte';
  import CommentsScreen from '../screens/CommentsScreen.svelte';
  import CommunityScreen from '../screens/CommunityScreen.svelte';
  import FinalScreen from '../screens/FinalScreen.svelte';
  import PrivacyScreen from '../screens/PrivacyScreen.svelte';
  import EmptyScreen from '../screens/EmptyScreen.svelte';

  export type WrappedScreenId =
    | 'welcome'
    | 'time'
    | 'binge'
    | 'activity'
    | 'top-three'
    | 'genres'
    | 'preferences'
    | 'collections'
    | 'top-rated'
    | 'year-stats'
    | 'comments'
    | 'community'
    | 'final'
    | 'privacy'
    | 'empty';

  interface Props {
    screenId: WrappedScreenId;
    data: WrappedData;
    onHome: () => void;
    bingeStep?: number;
  }

  let { screenId, data, onHome, bingeStep = 0 }: Props = $props();
</script>

{#if screenId === 'welcome'}
  <WelcomeScreen {data} />
{:else if screenId === 'time'}
  <TimeScreen {data} />
{:else if screenId === 'binge'}
  <BingeScreen {data} {bingeStep} />
{:else if screenId === 'activity'}
  <ActivityScreen {data} />
{:else if screenId === 'top-three'}
  <TopThreeScreen {data} />
{:else if screenId === 'genres'}
  <GenresScreen {data} />
{:else if screenId === 'preferences'}
  <PreferencesScreen {data} />
{:else if screenId === 'collections'}
  <CollectionsScreen {data} />
{:else if screenId === 'top-rated'}
  <TopRatedScreen {data} />
{:else if screenId === 'year-stats'}
  <YearStatsScreen {data} />
{:else if screenId === 'comments'}
  <CommentsScreen {data} />
{:else if screenId === 'community'}
  <CommunityScreen {data} />
{:else if screenId === 'final'}
  <FinalScreen {data} {onHome} />
{:else if screenId === 'privacy'}
  <PrivacyScreen {data} {onHome} />
{:else}
  <EmptyScreen {onHome} />
{/if}
