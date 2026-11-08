/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** package.json version, set in vite.config.ts. */
  readonly VITE_APP_VERSION: string
  /** The commit the hosting build was made from, set in vite.config.ts ("" for a local build). */
  readonly VITE_BUILD_COMMIT: string
}
