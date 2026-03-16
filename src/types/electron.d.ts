export interface ElectronWindowAPI {
  minimize: () => void;
  maximize: () => void;
  close: () => void;
}

export interface LobbyPlaybackPayload {
  releaseId: string;
  sourceId: string;
  ep: string;
  dubberId?: string;
  title: string;
  sourceName: string;
  paused: boolean;
  currentTime: number;
}

export interface AppUpdateProgress {
  state: 'idle' | 'downloading' | 'ready' | 'error';
  percent: number;
  received: number;
  total: number;
  filePath?: string;
  errorMessage?: string;
}

declare global {
  interface Window {
    electron?: {
      getAppVersion: () => Promise<string>;
      window: ElectronWindowAPI;
      openPlayerWindow: (params: { releaseId: string; sourceId: string; ep: string; title: string; sourceName: string; dubberId?: string }) => Promise<void>;
      closePlayerWindow: () => void;
      togglePlayerFullScreen: () => Promise<boolean>;
      openExternal: (url: string) => void;
      syncPlayerState: (playback: LobbyPlaybackPayload) => void;
      sendPlayerState: (playback: LobbyPlaybackPayload) => void;
      startUpdateDownload?: () => Promise<void>;
      installUpdate?: () => Promise<void>;
    };
  }
}

export {};
