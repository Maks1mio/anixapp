<script lang="ts">
  import type { LobbyParticipant, LobbyActivityEntry, ProposalData, VoteState } from '../_types';
  import LobbyVote from '../components/LobbyVote.svelte';
  import PlayerChrome, { type PlayerChromeProps } from './PlayerChrome.svelte';

  interface Props extends PlayerChromeProps {
    participants: LobbyParticipant[];
    activityLog: LobbyActivityEntry[];
    voteState: VoteState;
    voteProposal: ProposalData | null;
    waitingTitle: string;
    resultText: string;
    resultType: 'accepted' | 'rejected';
    onvote: (proposalId: string, accept: boolean) => void;
  }

  let {
    overlayVisible,
    participants: _participants,
    activityLog: _activityLog,
    voteState,
    voteProposal,
    waitingTitle,
    resultText,
    resultType,
    onvote,
    ...chrome
  }: Props = $props();
</script>

<PlayerChrome {...chrome} {overlayVisible} />

<LobbyVote
  status={voteState}
  proposal={voteProposal}
  {waitingTitle}
  {resultText}
  {resultType}
  {onvote}
/>
