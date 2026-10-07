<script setup lang="ts">
/**
 * The Recent codes list: codes made in this browser, newest first, each with
 * Open and Delete; whether to keep adding them; Clear all. Shown inside a
 * dialog on wide screens and a drawer on phones (RecentCodesDialog.vue).
 */
import {
  MAX_RECENT_CODES,
  type RecentCodeDetails,
  type RecentCodeSummary
} from '@/utils/recentCodes'
import {
  clearRecentCodes,
  deleteRecentCode,
  getRecentCode,
  listRecentCodes,
  setRememberRecentCodes
} from '@/utils/recentCodesDb'
import { recentCodesState } from '@/utils/useRecentCodes'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

const emit = defineEmits<{ (e: 'open', details: RecentCodeDetails): void }>()
const { t } = useI18n()

const isLoading = ref(true)
const isAvailable = ref(true)
const codes = ref<RecentCodeSummary[]>([])
const remember = ref(true)
const isConfirmingClear = ref(false)
const message = ref('')

async function refresh() {
  const list = await listRecentCodes()
  isAvailable.value = list.available
  codes.value = list.codes
  remember.value = list.remember
  isLoading.value = false
}

// Another tab may have added or removed codes while this one was hidden.
function onVisibilityChange() {
  if (document.visibilityState === 'visible') void refresh()
}
onMounted(() => {
  void refresh()
  document.addEventListener('visibilitychange', onVisibilityChange)
})
onUnmounted(() => document.removeEventListener('visibilitychange', onVisibilityChange))
watch(
  () => recentCodesState.changes,
  () => void refresh()
)

const totalSize = computed(() => codes.value.reduce((sum, code) => sum + (code.size || 0), 0))
function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return t('{n} KB', { n: Math.max(1, Math.round(bytes / 1024)) })
  return t('{n} MB', { n: (bytes / (1024 * 1024)).toFixed(1) })
}

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })

// Barcode labels are format names ("EAN-13"); QR labels are app strings.
function labelOf(code: RecentCodeSummary): string {
  return code.kind === 'qr' ? t(code.label) : code.label
}
function nameOf(code: RecentCodeSummary): string {
  return code.title ? `${labelOf(code)}: ${code.title}` : labelOf(code)
}

async function open(code: RecentCodeSummary) {
  isConfirmingClear.value = false
  const details = await getRecentCode(code.id)
  if (!details) {
    message.value = t("That code isn't here any more. It may have been deleted in another tab.")
    await refresh()
    return
  }
  emit('open', details)
}

async function remove(code: RecentCodeSummary) {
  isConfirmingClear.value = false
  message.value = (await deleteRecentCode(code.id))
    ? t('Deleted {name}.', { name: nameOf(code) })
    : t("Couldn't delete it. Try again.")
  await refresh()
}

async function clearAll() {
  if (!isConfirmingClear.value) {
    isConfirmingClear.value = true
    return
  }
  isConfirmingClear.value = false
  message.value = (await clearRecentCodes())
    ? t('All recent codes deleted.')
    : t("Couldn't delete them. Try again.")
  recentCodesState.storageFull = false
  await refresh()
}

async function setRemember(event: Event) {
  const checked = (event.target as HTMLInputElement).checked
  if (await setRememberRecentCodes(checked)) {
    remember.value = checked
    message.value = checked
      ? t('New codes will be added here.')
      : t('New codes won’t be added. The ones above stay until you delete them.')
  } else {
    ;(event.target as HTMLInputElement).checked = remember.value
    message.value = t("Couldn't change this setting. Try again.")
  }
}
</script>

<template>
  <div class="flex flex-col gap-3 text-start text-sm">
    <p v-if="isLoading" class="text-zinc-500 dark:text-zinc-400">{{ t('Loading…') }}</p>
    <p v-else-if="!isAvailable" role="status">
      {{
        t(
          "This browser isn't keeping recent codes: it may be blocking storage for this site, or be in a private window that doesn't allow it."
        )
      }}
    </p>
    <template v-else>
      <p
        v-if="recentCodesState.storageFull"
        role="alert"
        class="text-amber-700 dark:text-amber-300"
      >
        {{
          t(
            "Storage for this site is full, so the last code wasn't kept. Delete some codes, or free up space on this device."
          )
        }}
      </p>
      <p v-if="codes.length === 0" class="text-zinc-500 dark:text-zinc-400">
        {{ t('Codes you download, copy or save will appear here.') }}
      </p>
      <ul v-else id="recent-codes-list" class="flex flex-col">
        <li
          v-for="code in codes"
          :key="code.id"
          class="recent-code flex flex-row items-center gap-3 border-b border-zinc-200 py-2 last:border-b-0 dark:border-zinc-700"
        >
          <img
            v-if="code.thumbnail"
            :src="code.thumbnail"
            alt=""
            width="64"
            height="64"
            class="size-16 shrink-0 rounded bg-white object-contain p-0.5"
          />
          <div
            v-else
            class="flex size-16 shrink-0 items-center justify-center rounded bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
            aria-hidden="true"
          >
            <!-- Tabler Icons "lock" (MIT) -->
            <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24">
              <g
                fill="none"
                stroke="currentColor"
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
              >
                <path d="M5 13a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z" />
                <path d="M11 16a1 1 0 1 0 2 0a1 1 0 0 0-2 0m-3-5V7a4 4 0 1 1 8 0v4" />
              </g>
            </svg>
          </div>
          <div class="min-w-0 flex-1">
            <p class="recent-code-name break-words font-semibold">{{ nameOf(code) }}</p>
            <p class="text-xs text-zinc-500 dark:text-zinc-400">
              <time :datetime="new Date(code.savedAt).toISOString()">{{
                dateFormat.format(code.savedAt)
              }}</time>
              <template v-if="code.sensitive"> · {{ t('picture and password hidden') }}</template>
            </p>
            <p v-if="code.omitted.length" class="text-xs text-amber-700 dark:text-amber-300">
              {{
                code.omitted.includes('logo')
                  ? t('The logo was too large to keep; add it again after opening.')
                  : t('The frame background was too large to keep; add it again after opening.')
              }}
            </p>
          </div>
          <div class="flex shrink-0 flex-col gap-1 sm:flex-row">
            <button
              type="button"
              class="button recent-code-open px-3 py-1"
              :aria-label="t('Open {name}', { name: nameOf(code) })"
              @click="open(code)"
            >
              {{ t('Open') }}
            </button>
            <button
              type="button"
              class="secondary-button recent-code-delete px-3 py-1"
              :aria-label="t('Delete {name}', { name: nameOf(code) })"
              @click="remove(code)"
            >
              {{ t('Delete') }}
            </button>
          </div>
        </li>
      </ul>

      <p role="status" class="min-h-[1lh] text-xs">{{ message }}</p>

      <label class="flex flex-row items-center gap-2 text-sm font-normal">
        <input
          id="recent-codes-remember"
          type="checkbox"
          :checked="remember"
          @change="setRemember"
        />
        {{ t('Add codes I download, copy or save') }}
      </label>
      <p class="text-xs text-zinc-500 dark:text-zinc-400">
        {{
          t(
            'Kept only in this browser and never sent anywhere. Opening a code here shows everything in it, Wi-Fi passwords included. The browser can delete these: when site data is cleared, when a private window closes, or (in Safari) after some days without a visit. Download anything you need to keep.'
          )
        }}
      </p>
      <div class="flex flex-row flex-wrap items-center justify-between gap-2">
        <span class="text-xs text-zinc-500 dark:text-zinc-400">
          {{
            t('{count} of {max} codes, about {size}', {
              count: codes.length,
              max: MAX_RECENT_CODES,
              size: formatSize(totalSize)
            })
          }}
        </span>
        <div v-if="codes.length" class="flex flex-row gap-2">
          <button
            v-if="isConfirmingClear"
            type="button"
            class="secondary-button px-3 py-1"
            @click="isConfirmingClear = false"
          >
            {{ t('Cancel') }}
          </button>
          <button
            id="recent-codes-clear"
            type="button"
            class="secondary-button px-3 py-1"
            :class="{ 'text-red-700 dark:text-red-400': isConfirmingClear }"
            @click="clearAll"
          >
            {{
              isConfirmingClear
                ? t('Delete all {count} codes', { count: codes.length })
                : t('Clear all')
            }}
          </button>
        </div>
      </div>
    </template>
  </div>
</template>
