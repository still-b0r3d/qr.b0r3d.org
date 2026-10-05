<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  DPI_OPTIONS,
  formatDistance,
  formatSmallLength,
  MIN_MODULE_MM,
  type PrintGuidance,
  type PrintSettings,
  type PrintSettingsProblem
} from '@/utils/printSize'

const settings = defineModel<PrintSettings>({ required: true })
const props = defineProps<{
  guidance: PrintGuidance | null
  problem: PrintSettingsProblem | null
}>()
const { t } = useI18n()

const update = (patch: Partial<PrintSettings>) => {
  settings.value = { ...settings.value, ...patch }
}

const problemText = computed(() => {
  switch (props.problem) {
    case 'width':
      return t('Enter a width above 0 and up to 1000 mm (39 in).')
    case 'dpi':
      return t('Enter a resolution between 72 and 2400 DPI.')
    case 'tooLarge':
      return t('That would be over 10,000 pixels wide. Use a smaller width or resolution.')
    default:
      return ''
  }
})
</script>

<template>
  <div id="print-size" class="flex w-full flex-col gap-2 text-start">
    <label class="flex items-center gap-2 !text-base">
      <input
        id="print-size-enabled"
        type="checkbox"
        :checked="settings.enabled"
        @change="update({ enabled: ($event.target as HTMLInputElement).checked })"
      />
      {{ t('Size for print') }}
    </label>
    <template v-if="settings.enabled">
      <div class="flex flex-wrap items-end gap-2">
        <div class="flex flex-col">
          <label for="print-width" class="!text-sm">{{ t('Width') }}</label>
          <input
            id="print-width"
            type="number"
            min="1"
            step="any"
            class="!ms-0 !w-24 !p-2 text-input"
            :value="settings.width"
            @input="update({ width: Number(($event.target as HTMLInputElement).value) })"
          />
        </div>
        <div class="flex flex-col">
          <label for="print-unit" class="sr-only">{{ t('Unit') }}</label>
          <select
            id="print-unit"
            class="!ms-0 !w-20 !p-2 text-input"
            :value="settings.unit"
            @change="
              update({ unit: ($event.target as HTMLSelectElement).value as PrintSettings['unit'] })
            "
          >
            <option value="mm">mm</option>
            <option value="in">in</option>
          </select>
        </div>
        <div class="flex flex-col">
          <label for="print-dpi" class="!text-sm">{{ t('Resolution') }}</label>
          <select
            id="print-dpi"
            class="!ms-0 !w-28 !p-2 text-input"
            :value="settings.dpi"
            @change="update({ dpi: Number(($event.target as HTMLSelectElement).value) })"
          >
            <option v-for="dpi in DPI_OPTIONS" :key="dpi" :value="dpi">{{ dpi }} DPI</option>
          </select>
        </div>
      </div>
      <p v-if="problem" role="alert" class="print-problem text-xs">{{ problemText }}</p>
      <template v-else-if="guidance">
        <p id="print-guidance" class="text-xs text-zinc-600 dark:text-zinc-400">
          {{
            t('{w} × {h} px. Each module is {module}; scans from up to about {distance}.', {
              w: guidance.widthPx,
              h: guidance.heightPx,
              module: formatSmallLength(guidance.moduleMm, settings.unit),
              distance: formatDistance(guidance.scanDistanceMm, settings.unit)
            })
          }}
        </p>
        <p v-if="guidance.tooSmall" role="status" class="print-problem text-xs">
          ⚠
          {{
            t(
              'Modules under about {min} are hard to print and scan. Make it bigger, or store less data or use lower error correction.',
              { min: formatSmallLength(MIN_MODULE_MM, settings.unit) }
            )
          }}
        </p>
      </template>
      <p class="text-xs text-zinc-500 dark:text-zinc-400">
        {{ t('Applies to PNG, JPG and SVG downloads, including batch exports.') }}
      </p>
    </template>
  </div>
</template>

<style scoped>
.print-problem {
  color: #b45309;
}
:global(.dark .print-problem) {
  color: #fcd34d;
}
</style>
