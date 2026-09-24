/// <reference types="vite/client" />

declare const __APP_VERSION__: string;
declare const __APP_DISPLAY__: string;
declare const __APP_COMMIT__: string;
declare const __APP_COMMIT_FULL__: string;
declare const __APP_BUILD_TIME__: string;

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_APP_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
