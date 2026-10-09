<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ErrorCorrectionLevel, Segment } from '@/lib/qr-code'

export interface EncodedInfo {
  text: string
  version: number
  count: number
  segments: Segment[]
  ecLevel: ErrorCorrectionLevel
  /** Error correction was raised for a logo. */
  ecBoosted: boolean
  /** The text is marked as UTF-8 (ECI 26). */
  eci?: boolean
}

const props = defineProps<{
  info: EncodedInfo | null
  /** The data field is empty and the preview shows sample text. */
  isPlaceholder: boolean
}>()

const { t } = useI18n()

const EC_LABELS: Record<ErrorCorrectionLevel, string> = {
  L: 'Low (7%)',
  M: 'Medium (15%)',
  Q: 'High (25%)',
  H: 'Highest (30%)'
}
function modeLabel(mode: Segment['mode']): string {
  if (mode === 'Numeric') return t('numbers')
  if (mode === 'Alphanumeric') return t('capitals and digits')
  return t('text')
}

const stats = computed(() => {
  const text = props.info?.text ?? ''
  return {
    bytes: new TextEncoder().encode(text).length,
    characters: Array.from(text).length,
    lines: text === '' ? 0 : text.split(/\r\n|\r|\n/).length
  }
})

const encoding = computed(() =>
  props.info?.eci
    ? t('text, marked as UTF-8 (ECI 26)')
    : (props.info?.segments ?? [])
        .map((s) => `${modeLabel(s.mode)} (${Array.from(s.text).length})`)
        .join(' + ')
)
</script>

<template>
  <details id="code-info" class="code-info w-80 max-w-full text-start text-sm">
    <summary class="cursor-pointer select-none font-semibold">
      {{ t("What's in this code") }}
    </summary>
    <div v-if="info" class="mt-2 flex flex-col gap-2">
      <p v-if="isPlaceholder" class="text-xs text-zinc-500 dark:text-zinc-400">
        {{ t('Nothing entered yet, so the preview shows sample text.') }}
      </p>
      <pre
        class="code-info-text max-h-40 overflow-auto whitespace-pre-wrap break-all rounded p-2 text-xs"
        :aria-label="t('Exact text stored in the code')"
        >{{ info.text }}</pre
      >
      <dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        <dt>{{ t('Stored') }}</dt>
        <dd>
          {{
            t('{bytes} bytes, {characters} characters', {
              bytes: stats.bytes,
              characters: stats.characters
            })
          }}<template v-if="stats.lines > 1">, {{ t('{n} lines', { n: stats.lines }) }}</template>
        </dd>
        <dt>{{ t('Size') }}</dt>
        <dd>
          {{
            t('Version {version}, {count} × {count} modules', {
              version: info.version,
              count: info.count
            })
          }}
        </dd>
        <dt>{{ t('Error correction') }}</dt>
        <dd>
          {{ t(EC_LABELS[info.ecLevel])
          }}<template v-if="info.ecBoosted">, {{ t('raised for the logo') }}</template>
        </dd>
        <dt>{{ t('Encoding') }}</dt>
        <dd>{{ encoding }}</dd>
      </dl>
      <p class="text-xs text-zinc-500 dark:text-zinc-400">
        {{
          t(
            "That's everything: no link to this site, no tracking. Scanning shows exactly this text."
          )
        }}
      </p>
    </div>
  </details>
</template>

<style scoped>
.code-info dt {
  color: #555;
}
:global(.dark .code-info dt) {
  color: var(--muted);
}
.code-info-text {
  background: #f4f4f4;
  color: #131313;
  font-family: var(--brand-font);
}
:global(.dark .code-info-text) {
  background: var(--panel-2);
  color: var(--text);
}
</style>
