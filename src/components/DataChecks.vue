<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { DataCheck } from '@/utils/linkChecks'

defineProps<{ checks: DataCheck[] }>()
const emit = defineEmits<{ (e: 'apply', fixed: string): void }>()
const { t } = useI18n()

function message(check: DataCheck): string {
  switch (check.key) {
    case 'bareDomain':
      return t(
        'This looks like a web address without https://. Many phone cameras will show it as plain text instead of opening it.'
      )
    case 'trackingParams':
      return t('This link has tracking parameters: {params}.', {
        params: check.params.join(', ')
      })
    case 'outerWhitespace':
      return t('Starts or ends with spaces or line breaks, which are stored in the code too.')
  }
}

function action(check: DataCheck): string {
  switch (check.key) {
    case 'bareDomain':
      return t('Add https://')
    case 'trackingParams':
      return t('Remove them')
    case 'outerWhitespace':
      return t('Trim')
  }
}
</script>

<template>
  <ul v-if="checks.length" id="data-checks" class="flex w-full flex-col gap-2" aria-live="polite">
    <li
      v-for="check in checks"
      :key="check.key"
      class="data-check flex flex-wrap items-center gap-x-3 gap-y-1 rounded px-3 py-2 text-sm"
    >
      <span class="flex-1">⚠ {{ message(check) }}</span>
      <button
        type="button"
        class="secondary-button shrink-0 px-2 text-sm"
        :data-check="check.key"
        @click="emit('apply', check.fixed)"
      >
        {{ action(check) }}
      </button>
    </li>
  </ul>
</template>

<style scoped>
.data-check {
  border: 1px solid #b45309;
  color: #7c2d12;
}
:global(.dark .data-check) {
  border-color: #fcd34d;
  color: #fde68a;
}
</style>
