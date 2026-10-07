<script setup lang="ts">
/**
 * Shown once, after the first code is added to Recent codes, so keeping codes
 * is never a surprise: says where they went and offers to stop.
 */
import { setRememberRecentCodes } from '@/utils/recentCodesDb'
import { recentCodesState } from '@/utils/useRecentCodes'
import { useI18n } from 'vue-i18n'

const emit = defineEmits<{ (e: 'view'): void }>()
const { t } = useI18n()

function view() {
  recentCodesState.showNotice = false
  emit('view')
}

async function stop() {
  recentCodesState.showNotice = false
  await setRememberRecentCodes(false)
}
</script>

<template>
  <div
    id="recent-codes-notice"
    role="status"
    class="fixed inset-x-4 bottom-4 z-40 mx-auto flex max-w-lg flex-col gap-2 rounded-lg border border-zinc-300 bg-white p-4 text-start text-sm text-zinc-900 shadow-lg dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 sm:left-auto sm:mx-0 sm:max-w-sm"
  >
    <p class="text-sm text-zinc-900 dark:text-zinc-100">
      {{
        t(
          'Added to Recent codes, so you can open it again later. It is kept only in this browser and never sent anywhere.'
        )
      }}
    </p>
    <div class="flex flex-row flex-wrap justify-end gap-2">
      <button type="button" class="secondary-button px-3 py-1" @click="stop">
        {{ t("Don't keep codes") }}
      </button>
      <button type="button" class="secondary-button px-3 py-1" @click="view">
        {{ t('View') }}
      </button>
      <button type="button" class="button px-3 py-1" @click="recentCodesState.showNotice = false">
        {{ t('OK') }}
      </button>
    </div>
  </div>
</template>
