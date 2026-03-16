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

declare global {
  interface Window {
    electron?: {
      window: ElectronWindowAPI;
      openPlayerWindow: (params: { releaseId: string; sourceId: string; ep: string; title: string; sourceName: string; dubberId?: string }) => Promise<void>;
      closePlayerWindow: () => void;
      togglePlayerFullScreen: () => Promise<boolean>;
      openExternal: (url: string) => void;
      syncPlayerState: (playback: LobbyPlaybackPayload) => void;
      sendPlayerState: (playback: LobbyPlaybackPayload) => void;
    };
  }
}

export {};
