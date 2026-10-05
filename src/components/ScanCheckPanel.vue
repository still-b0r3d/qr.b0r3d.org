<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { ScanWarning } from '@/utils/scanCheck'

export type ScanStatus = 'idle' | 'checking' | 'ok' | 'mismatch' | 'unreadable' | 'error'

defineProps<{
  status: ScanStatus
  /** What the test decode read, for a mismatch. */
  decoded: string | null
  warnings: ScanWarning[]
  /** A barcode other than QR, which has no dots, logo or error correction to adjust. */
  barcode?: boolean
  /** Element id; defaults to scan-check. */
  id?: string
}>()

const { t } = useI18n()

function warningText(w: ScanWarning): string {
  switch (w.key) {
    case 'inverted':
      return t("Light code on a dark background: many phone cameras can't read inverted codes.")
    case 'lowContrast':
      return t(
        'Low contrast ({ratio}:1) between the code and its background. Dark on light with at least 4:1 scans best.',
        { ratio: w.ratio }
      )
    case 'quietZone':
      return t(
        'Only {modules} modules of blank space around the code. Leave at least 4 (Margin), or place it on a plain light area.',
        { modules: w.modules }
      )
    case 'transparent':
      return t('Transparent background: put the code on a plain, light surface.')
  }
}
</script>

<template>
  <div :id="id ?? 'scan-check'" class="flex w-80 max-w-full flex-col gap-1 text-start text-sm">
    <div aria-live="polite" class="flex items-start gap-2">
      <template v-if="status === 'checking'">
        <span class="text-zinc-500 dark:text-zinc-400">{{ t('Checking that it scans…') }}</span>
      </template>
      <template v-else-if="status === 'ok'">
        <span aria-hidden="true" class="scan-ok">✓</span>
        <span class="scan-ok">{{ t('Scans. A test decode matches your data exactly.') }}</span>
      </template>
      <template v-else-if="status === 'unreadable'">
        <span aria-hidden="true" class="scan-bad">✗</span>
        <span class="scan-bad">{{
          barcode
            ? t("Didn't scan in a test decode. Try more contrast or a larger size.")
            : t(
                "Didn't scan in a test decode. Try more contrast, plainer dots, a smaller logo or more error correction."
              )
        }}</span>
      </template>
      <template v-else-if="status === 'mismatch'">
        <span aria-hidden="true" class="scan-bad">✗</span>
        <span class="scan-bad break-all">{{
          t('Scans, but reads as different text: {text}', { text: decoded ?? '' })
        }}</span>
      </template>
      <template v-else-if="status === 'error'">
        <span class="text-zinc-500 dark:text-zinc-400">{{
          t("Couldn't run the scan check.")
        }}</span>
      </template>
    </div>
    <ul v-if="warnings.length" class="flex flex-col gap-1">
      <li v-for="w in warnings" :key="w.key" class="scan-warn flex items-start gap-2">
        <span aria-hidden="true">⚠</span>
        <span>{{ warningText(w) }}</span>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.scan-ok {
  color: #047857;
}
.scan-bad {
  color: #b91c1c;
}
.scan-warn {
  color: #b45309;
}
:global(.dark .scan-ok) {
  color: var(--mint);
}
:global(.dark .scan-bad) {
  color: #f87171;
}
:global(.dark .scan-warn) {
  color: #fcd34d;
}
</style>
