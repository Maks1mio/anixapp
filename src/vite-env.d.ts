/// <reference types="svelte" />
/// <reference types="vite/client" />
/// <reference path="./types/api.d.ts" />
/// <reference path="./types/electron.d.ts" />

declare const __ANIXART_PROXY_KEY__: string | undefined;

interface ImportMetaEnv {
  readonly VITE_TV_MODE?: string;
  readonly VITE_MOBILE_MODE?: string;
  readonly VITE_VPN_67_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

