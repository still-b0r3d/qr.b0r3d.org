<script setup lang="ts">
// The Source link is the GPL's pointer to the source code for what this page
// delivers, so it stays. Mini QR's own footer had no license notice, so the
// credit to it lives in README.md rather than on screen.
const SOURCE_URL = 'https://github.com/still-b0r3d/qr.b0r3d.org'
const LICENSE_URL = `${SOURCE_URL}/blob/main/LICENSE`
// Both come from vite.config.js; a build without them shows "dev".
const VERSION = import.meta.env.VITE_APP_VERSION || 'dev'
const COMMIT = import.meta.env.VITE_BUILD_COMMIT || ''
</script>

<template>
  <footer class="app-footer text-zinc-600 dark:text-zinc-400">
    <a href="https://b0r3d.org" class="back-link">← b0r3d.org</a>
    <div data-testid="app-version">
      b0r3d QR v{{ VERSION }}
      <template v-if="COMMIT">
        <span aria-hidden="true"> · </span>
        build {{ COMMIT.slice(0, 7) }}
      </template>
      <span aria-hidden="true"> · </span>
      <a :href="SOURCE_URL" target="_blank" rel="noopener noreferrer">Source</a>
      <span aria-hidden="true"> · </span>
      <a :href="LICENSE_URL" target="_blank" rel="noopener noreferrer">GPL-3.0</a>
    </div>
  </footer>
</template>

<style scoped>
.app-footer {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  /* On phones the export sheet is fixed to the bottom of the screen;
     QRCodeCreate publishes its height so the footer can clear it. */
  padding: 2rem 1rem max(2.5rem, var(--export-sheet-clearance, 0px));
  font-size: 0.875rem;
  line-height: 1.5;
  text-align: center;
}

.back-link {
  font-family: var(--brand-font);
  font-size: 1rem;
  letter-spacing: 1px;
}
:global(.dark .app-footer a:hover) {
  text-shadow: 0 0 10px rgba(0, 255, 255, 0.6);
}
</style>
