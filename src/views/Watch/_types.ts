export interface WatchState {
  releaseId:  string;
  sourceId:   string;
  ep:         number;
  title:      string;
  sourceName: string;
  dubberId:   string;
}

export interface EpisodeItem {
  position:    number;
  name:        string;
  is_watched?: boolean;
}

export interface DubberItem {
  id:            number;
  name:          string;
  /** Team icon/avatar URL */
  icon?:         string;
  /** Total episodes in this dub */
  episode_count?: number;
  /** Total view count */
  view_count?:   number;
  /** 0 = dub, 1 = sub (if provided by API) */
  type?:         number;
}

export interface SourceItem {
  id:   number;
  name: string;
}

export interface LobbyParticipant {
  login:   string;
  avatar?: string | null;
  peerId?: string | null;
}

export interface ProposalData {
  proposalId:     string;
  proposerLogin:  string;
  playback: { title?: string; ep?: string; sourceName?: string };
}

export interface LobbyActivityEntry {
  type:    string;
  login:   string;
  avatar?: string | null;
}

export type PopoverType      = 'series' | 'dubbing' | null;
export type PlayerLoadState  = 'loading' | 'ready' | 'error';
export type VoteState        = 'hidden' | 'vote' | 'waiting' | 'result';
