/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** GitHub App client ID (public); enables "Log in with GitHub". */
  readonly VITE_GITHUB_APP_CLIENT_ID?: string;
  /** GitHub App URL name, for the "choose repositories" link. */
  readonly VITE_GITHUB_APP_SLUG?: string;
  /** The login helper (worker/) URL. */
  readonly VITE_AUTH_HELPER_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
