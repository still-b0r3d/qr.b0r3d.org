<script setup lang="ts">
import { BARCODE_FORMATS, BARCODE_GROUPS, type CodeType } from '@/lib/barcode/formats'
import { useI18n } from 'vue-i18n'

// QR is the default; every other type sits behind this one menu.
const codeType = defineModel<CodeType>({ required: true })
const { t } = useI18n()

const groups = BARCODE_GROUPS.map((group) => ({
  group,
  formats: BARCODE_FORMATS.filter((f) => f.group === group)
}))
</script>

<template>
  <div class="flex w-full flex-row flex-wrap items-center gap-x-3 gap-y-1">
    <label for="code-type" class="!self-center !text-base">{{ t('Code type') }}</label>
    <div class="relative">
      <select
        id="code-type"
        v-model="codeType"
        class="!ms-0 !w-auto cursor-pointer !py-2 !pe-9 !ps-3 text-input"
      >
        <option value="qr">{{ t('QR code') }}</option>
        <optgroup v-for="{ group, formats } in groups" :key="group" :label="t(group)">
          <option v-for="format in formats" :key="format.id" :value="format.id">
            {{ t(format.label) }}
          </option>
        </optgroup>
      </select>
      <svg
        aria-hidden="true"
        class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 opacity-60"
        width="14"
        height="14"
        viewBox="0 0 24 24"
      >
        <path
          fill="none"
          stroke="currentColor"
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2.5"
          d="m6 9l6 6l6-6"
        />
      </svg>
    </div>
  </div>
</template>
