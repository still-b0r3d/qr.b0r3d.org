<script setup lang="ts">
const UPSTREAM_URL = 'https://github.com/lyqht/mini-qr'
const SOURCE_URL = 'https://github.com/still-b0r3d/qr.b0r3d.org'
const LICENSE_URL = `${SOURCE_URL}/blob/main/LICENSE`
</script>

<template>
  <footer class="app-footer text-zinc-600 dark:text-zinc-400">
    <a href="https://b0r3d.org" class="back-link">← b0r3d.org</a>
    <div class="credit">
      Based on
      <a :href="UPSTREAM_URL" target="_blank" rel="noopener noreferrer">Mini QR</a>
      by Estee Tey
      <span aria-hidden="true"> · </span>
      <a :href="LICENSE_URL" target="_blank" rel="noopener noreferrer">GPL-3.0</a>
      <span aria-hidden="true"> · </span>
      <a :href="SOURCE_URL" target="_blank" rel="noopener noreferrer">Source</a>
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
