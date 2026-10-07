<script setup lang="ts">
/**
 * Shown once, after the first code is added to Recent codes, so keeping codes
 * is never a surprise: says where it went and offers to stop (which also
 * deletes that code).
 */
import { deleteRecentCode, setRememberRecentCodes } from '@/utils/recentCodesDb'
import { recentCodesState } from '@/utils/useRecentCodes'
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

const emit = defineEmits<{ (e: 'view'): void }>()
const { t } = useI18n()
const error = ref('')

function close() {
  recentCodesState.showNotice = false
  recentCodesState.noticeCodeId = undefined
}

function view() {
  close()
  emit('view')
}

async function stop() {
  const id = recentCodesState.noticeCodeId
  const stopped = await setRememberRecentCodes(false)
  const deleted = id === undefined || (await deleteRecentCode(id))
  if (stopped && deleted) {
    recentCodesState.changes++
    close()
  } else {
    error.value = t("Couldn't change this. Open Recent codes to turn it off or delete the code.")
  }
}
</script>

<template>
  <!-- Above the export sheet on phones (its height is published as
       --export-sheet-clearance), so neither covers the other. -->
  <div
    id="recent-codes-notice"
    role="status"
    class="fixed inset-x-4 z-40 mx-auto flex max-w-lg flex-col gap-2 rounded-lg border border-zinc-300 bg-white p-4 text-start text-sm text-zinc-900 shadow-lg dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 sm:left-auto sm:mx-0 sm:max-w-sm"
    style="bottom: calc(var(--export-sheet-clearance, 0px) + 1rem)"
  >
    <p class="text-sm text-zinc-900 dark:text-zinc-100">
      {{
        t(
          'Added to Recent codes, so you can open it again later. It is kept only in this browser and never sent anywhere.'
        )
      }}
    </p>
    <p v-if="error" role="alert" class="text-sm text-red-700 dark:text-red-400">{{ error }}</p>
    <div class="flex flex-row flex-wrap justify-end gap-2">
      <button type="button" class="secondary-button px-3 py-1" @click="stop">
        {{ t("Don't keep codes") }}
      </button>
      <button type="button" class="secondary-button px-3 py-1" @click="view">
        {{ t('View') }}
      </button>
      <button type="button" class="button px-3 py-1" @click="close">
        {{ t('OK') }}
      </button>
    </div>
  </div>
</template>
