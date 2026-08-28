/// <reference types="svelte" />
/// <reference types="vite/client" />
/// <reference path="./types/api.d.ts" />
/// <reference path="./types/electron.d.ts" />

interface ImportMetaEnv {
  readonly VITE_TV_MODE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
