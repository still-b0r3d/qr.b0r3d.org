<script setup lang="ts">
const UPSTREAM_URL = 'https://github.com/lyqht/mini-qr'
const SOURCE_URL = 'https://github.com/still-b0r3d/qr.b0r3d.org'
const LICENSE_URL = `${SOURCE_URL}/blob/main/LICENSE`
</script>

<template>
  <footer class="app-footer">
    <a href="https://b0r3d.org" class="back-link">← b0r3d.org</a>
    <div class="credit">
      Based on
      <a :href="UPSTREAM_URL" target="_blank" rel="noopener noreferrer">Mini QR</a>
      by Estee Tey
      <span aria-hidden="true">·</span>
      <a :href="LICENSE_URL" target="_blank" rel="noopener noreferrer">GPL-3.0</a>
      <span aria-hidden="true">·</span>
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
  padding: 2rem 1rem 2.5rem;
  font-size: 0.875rem;
  line-height: 1.5;
  text-align: center;
}

.back-link {
  font-family: 'Courier New', Courier, monospace;
  font-size: 1rem;
  letter-spacing: 1px;
}
</style>
