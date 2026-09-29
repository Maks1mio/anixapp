/// <reference types="svelte" />
/// <reference types="vite/client" />
/// <reference path="./types/api.d.ts" />
/// <reference path="./types/electron.d.ts" />

interface ImportMetaEnv {
  readonly VITE_TV_MODE?: string;
  readonly VITE_PHONE_MODE?: string;
  readonly VITE_ANIXART_PROXY_APP_KEY?: string;
  readonly VITE_VPN_67_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
