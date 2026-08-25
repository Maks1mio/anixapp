export interface WatchState {
  releaseId:  string;
  sourceId:   string;
  ep:         number;
  title:      string;
  sourceName: string;
  /** Озвучка / команда — для заголовка вместо имени источника (Kodik и т.п.) */
  dubberName: string;
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
  is_sub?:       boolean;
  pinned?:       boolean;
  /** 1 = 1080p, 2 = QHD, 3 = 4K */
  quality?:      number;
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

export interface LobbyChatMessage {
  id: string;
  text: string;
  login: string;
  avatar?: string | null;
  ts: number;
  self?: boolean;
  system?: boolean;
}

export interface NextEpAltDub {
  targetEp:   number;
  dubber:     DubberItem;
  sourceId:   number;
  sourceName: string;
}

export interface PlaybackAlt {
  sourceId:   number;
  sourceName: string;
  dubberId:   number;
  dubberName: string;
  ep:         number;
  sameDubber: boolean;
}

export interface DownloadedEpisodeItem {
  episodePosition: number;
  filePath: string;
  label: string;
  name: string;
  dubberName: string;
  sourceName: string;
  dubberId?: number | null;
  sourceId?: number | null;
}

export type PopoverType      = 'series' | 'dubbing' | 'source' | 'settings' | null;
export type PlayerLoadState  = 'loading' | 'ready' | 'error';
export type VoteState        = 'hidden' | 'vote' | 'waiting' | 'result';
