<script setup lang="ts">
/**
 * Barcodes other than QR. Loaded on demand from App.vue when a type other
 * than QR is picked, together with the encoder (zint via zxing-wasm, ~730 KB
 * gzipped), so the QR page never pays for it.
 *
 * Codes are plain: colours and size only. QR's dots, corners, logo and frame
 * styling don't apply to these symbologies.
 */
import CodeTypePicker from '@/components/CodeTypePicker.vue'
import PrintSizeSettings from '@/components/PrintSizeSettings.vue'
import ScanCheckPanel, { type ScanStatus } from '@/components/ScanCheckPanel.vue'
import { makeBarcode, testReadBarcode, type BarcodeResult } from '@/lib/barcode/create'
import { barcodeFormat, type BarcodeType, type CodeType } from '@/lib/barcode/formats'
import { styleBarcodeSvg, svgDataUrl, type BarcodeSvg } from '@/lib/barcode/svg'
import { rasterizeSvg } from '@/lib/qr-code'
import { IS_COPY_IMAGE_TO_CLIPBOARD_SUPPORTED } from '@/utils/clipboard'
import { downloadBlob } from '@/utils/download'
import {
  barcodePrintGuidance,
  checkPrintSettings,
  DEFAULT_PRINT_SETTINGS,
  setJpegDpi,
  setPngDpi,
  setSvgPrintSize,
  fromMillimetres,
  type PrintSettings
} from '@/utils/printSize'
import { storageGet, storageSet } from '@/utils/safeStorage'
import { getScanWarnings } from '@/utils/scanCheck'
import { computed, onUnmounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

const codeType = defineModel<CodeType>('codeType', { required: true })
const props = defineProps<{
  /** Data to start with, e.g. from "Create a code with this data" on the Scan page. */
  initialData?: { type: BarcodeType; data: string } | null
}>()
const { t } = useI18n()

const type = computed(() => codeType.value as BarcodeType)
const format = computed(() => barcodeFormat(type.value))

//#region Data, one value per type so switching back and forth keeps each
const dataByType = reactive<Partial<Record<BarcodeType, string>>>({})
const data = computed({
  get: () => dataByType[type.value] ?? format.value.example,
  set: (value: string) => {
    dataByType[type.value] = value
  }
})
watch(
  () => props.initialData,
  (initial) => {
    if (initial) dataByType[initial.type] = initial.data
  },
  { immediate: true }
)
//#endregion

//#region Settings, remembered in this browser
interface BarcodeSettings {
  color: string
  background: string
  transparent: boolean
  /** Pixels per module for screen downloads. */
  scale: number
  showText: boolean
  allowRectangular: boolean
}
const DEFAULT_SETTINGS: BarcodeSettings = {
  color: '#000000',
  background: '#ffffff',
  transparent: false,
  scale: 4,
  showText: true,
  allowRectangular: false
}
const SETTINGS_KEY = 'b0r3d-qr.barcode-settings'
const PRINT_KEY = 'b0r3d-qr.barcode-print-settings'

function load<T extends object>(key: string, defaults: T): T {
  try {
    const saved = JSON.parse(storageGet(key) ?? 'null')
    return saved && typeof saved === 'object' ? { ...defaults, ...saved } : { ...defaults }
  } catch {
    return { ...defaults }
  }
}
const settings = ref<BarcodeSettings>(load(SETTINGS_KEY, DEFAULT_SETTINGS))
watch(settings, (value) => storageSet(SETTINGS_KEY, JSON.stringify(value)), { deep: true })
const printSettings = ref<PrintSettings>(load(PRINT_KEY, DEFAULT_PRINT_SETTINGS))
watch(printSettings, (value) => storageSet(PRINT_KEY, JSON.stringify(value)), { deep: true })

const MIN_SCALE = 1
const MAX_SCALE = 20
const scale = computed(() =>
  Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.round(Number(settings.value.scale) || 4)))
)
const colors = computed(() => ({
  color: settings.value.color,
  background: settings.value.transparent ? 'transparent' : settings.value.background
}))
//#endregion

//#region Encoding
// The last good result, with the type and text it was made from, so the
// preview, scan check and info always describe the same barcode.
interface Encoded {
  barcode: BarcodeSvg
  type: BarcodeType
  /** What a scanner should read back (check digits added etc.). */
  expected: string
  /** What was encoded, before any check digit was added. */
  prepared: string
}
const encoded = ref<Encoded | null>(null)
const encodeError = ref<string | null>(null)
const isEncoding = ref(true)
let encodeRun = 0
let encodeTimer: ReturnType<typeof setTimeout> | undefined

async function encode() {
  const run = ++encodeRun
  const forType = type.value
  const forFormat = format.value
  const text = data.value
  let result: BarcodeResult
  try {
    result = await makeBarcode(text, forType, {
      showText: settings.value.showText,
      allowRectangular: settings.value.allowRectangular
    })
  } catch (err) {
    console.error('Barcode encoding failed:', err)
    result = { ok: false, error: t("Couldn't load the barcode maker. Check your connection.") }
  }
  if (run !== encodeRun) return
  isEncoding.value = false
  if (result.ok) {
    const prepared = forFormat.prepare(text)
    const { ok: _ok, ...barcode } = result
    encoded.value = {
      barcode,
      type: forType,
      prepared,
      expected: forFormat.expectedText(prepared)
    }
    encodeError.value = null
  } else {
    encoded.value = null
    encodeError.value = result.error
  }
}
watch(
  () => [data.value, type.value, settings.value.showText, settings.value.allowRectangular],
  (_, previous) => {
    clearTimeout(encodeTimer)
    // Typing waits a moment; picking a type or option redraws at once.
    const typing = previous && previous[1] === type.value && previous[0] !== data.value
    encodeTimer = setTimeout(encode, typing ? 250 : 0)
  },
  { immediate: true }
)
onUnmounted(() => clearTimeout(encodeTimer))

const barcode = computed(() => encoded.value?.barcode ?? null)
const addedCheckDigit = computed(() => {
  const current = encoded.value
  return current && current.expected !== current.prepared
    ? current.expected.slice(current.prepared.length)
    : null
})

const previewSvg = computed(() =>
  barcode.value ? styleBarcodeSvg(barcode.value, { ...colors.value, scale: scale.value }) : null
)
const previewSrc = computed(() => (previewSvg.value ? svgDataUrl(previewSvg.value) : null))
// Small 2D codes are shown larger than their download size, wide ones scaled down.
const previewWidth = computed(() =>
  barcode.value ? Math.min(360, Math.max(200, barcode.value.width * 3)) : 0
)
//#endregion

//#region Will it scan?
const scanStatus = ref<ScanStatus>('idle')
const scanDecoded = ref<string | null>(null)
let scanRun = 0
let scanTimer: ReturnType<typeof setTimeout> | undefined
const scanWarnings = computed(() =>
  getScanWarnings({
    colors: [colors.value.color],
    background: colors.value.background,
    margin: 4, // zint always adds the symbology's quiet zones
    hasFrame: false
  })
)
watch(
  [encoded, colors],
  () => {
    clearTimeout(scanTimer)
    const run = ++scanRun
    const current = encoded.value
    if (!current) {
      scanStatus.value = 'idle'
      return
    }
    scanStatus.value = 'checking'
    scanTimer = setTimeout(async () => {
      try {
        const read = await testReadBarcode(current.barcode, current.type, colors.value)
        if (run !== scanRun) return
        scanDecoded.value = read
        scanStatus.value =
          read === null ? 'unreadable' : read === current.expected ? 'ok' : 'mismatch'
      } catch (err) {
        if (run !== scanRun) return
        console.error('Barcode scan check failed:', err)
        scanStatus.value = 'error'
      }
    }, 300)
  },
  { immediate: true }
)
onUnmounted(() => clearTimeout(scanTimer))
//#endregion

//#region Export
const fileName = ref('')
const exportName = computed(() =>
  (fileName.value.trim() || type.value).replace(/[^a-zA-Z0-9_-]/g, '_')
)
const printProblem = computed(() =>
  printSettings.value.enabled ? checkPrintSettings(printSettings.value) : null
)
const printGuidance = computed(() =>
  printSettings.value.enabled && !printProblem.value && barcode.value
    ? barcodePrintGuidance(printSettings.value, barcode.value.width, barcode.value.height)
    : null
)
const exportScale = computed(() => printGuidance.value?.modulePx ?? scale.value)
const isExporting = ref(false)
const exportError = ref<string | null>(null)

function exportSvg(): string {
  const svg = styleBarcodeSvg(barcode.value!, { ...colors.value, scale: exportScale.value })
  const guidance = printGuidance.value
  if (!guidance) return svg
  const unit = printSettings.value.unit
  return setSvgPrintSize(svg, fromMillimetres(guidance.actualWidthMm, unit), unit)
}

async function rasterExport(mimeType: 'image/png' | 'image/jpeg'): Promise<Blob> {
  const current = barcode.value!
  const blob = await rasterizeSvg({
    svgString: styleBarcodeSvg(current, { ...colors.value, scale: exportScale.value }),
    width: current.width * exportScale.value,
    height: current.height * exportScale.value,
    mimeType,
    quality: 0.95,
    // JPEG has no transparency: a transparent code goes on white.
    background:
      mimeType === 'image/jpeg'
        ? colors.value.background === 'transparent'
          ? '#ffffff'
          : colors.value.background
        : undefined
  })
  if (!printGuidance.value) return blob
  const bytes = new Uint8Array(await blob.arrayBuffer())
  const dpi = printSettings.value.dpi
  return new Blob([mimeType === 'image/png' ? setPngDpi(bytes, dpi) : setJpegDpi(bytes, dpi)], {
    type: mimeType
  })
}

async function download(kind: 'png' | 'jpg' | 'svg') {
  if (!barcode.value || isExporting.value) return
  isExporting.value = true
  exportError.value = null
  try {
    if (kind === 'svg') {
      downloadBlob(
        new Blob([exportSvg()], { type: 'image/svg+xml;charset=utf-8' }),
        `${exportName.value}.svg`
      )
    } else {
      const blob = await rasterExport(kind === 'png' ? 'image/png' : 'image/jpeg')
      downloadBlob(blob, `${exportName.value}.${kind}`)
    }
  } catch (err) {
    console.error('Barcode export failed:', err)
    exportError.value = t("Couldn't create the file. Try again, or try another format.")
  } finally {
    isExporting.value = false
  }
}

const copied = ref(false)
async function copyToClipboard() {
  if (!barcode.value) return
  try {
    const blob = await rasterExport('image/png')
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
    copied.value = true
    setTimeout(() => (copied.value = false), 2000)
  } catch (err) {
    console.error('Copying the barcode failed:', err)
    exportError.value = t("Couldn't copy the image. Download it instead.")
  }
}
//#endregion
</script>

<template>
  <div
    id="barcode-create"
    class="grid w-full grid-cols-1 gap-8 md:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] md:grid-rows-[auto_1fr] md:gap-x-6 lg:gap-x-12"
  >
    <!-- Type and data: first on phones, top of the settings column on wider screens -->
    <section
      class="order-1 flex w-full flex-col gap-4 text-start md:order-none md:col-start-2 md:row-start-1"
      aria-labelledby="barcode-data-title"
    >
      <h2 id="barcode-data-title" class="sr-only">{{ t('Barcode data') }}</h2>
      <CodeTypePicker v-model="codeType" />
      <div class="flex w-full flex-col gap-1">
        <label for="barcode-data">{{ t('Data to encode') }}</label>
        <textarea
          id="barcode-data"
          v-model="data"
          rows="2"
          class="!ms-0 text-input"
          :class="format.linear && !format.gs1 ? 'font-mono' : ''"
          :aria-invalid="Boolean(encodeError)"
          aria-describedby="barcode-data-hint barcode-data-error"
          spellcheck="false"
          autocomplete="off"
        ></textarea>
        <p id="barcode-data-hint" class="text-sm text-zinc-600 dark:text-zinc-400">
          {{ t(format.hint) }}
        </p>
        <p
          v-if="encodeError"
          id="barcode-data-error"
          role="alert"
          class="text-sm text-red-700 dark:text-red-400"
        >
          {{ encodeError }}
        </p>
      </div>
    </section>

    <!-- Preview and export: left column, kept in view while scrolling -->
    <section
      class="order-2 flex w-full flex-col items-center gap-4 md:sticky md:top-0 md:order-none md:col-start-1 md:row-span-2 md:row-start-1 md:self-start"
      aria-labelledby="barcode-preview-title"
    >
      <h2 id="barcode-preview-title" class="sr-only">{{ t('Preview and download') }}</h2>
      <div
        id="barcode-preview"
        class="grid min-h-[180px] w-full place-items-center rounded-lg p-4"
        :class="settings.transparent ? 'checkerboard' : ''"
      >
        <img
          v-if="previewSrc"
          :src="previewSrc"
          :alt="t('{format} barcode', { format: t(format.label) })"
          :style="{ width: `${previewWidth}px` }"
          class="h-auto max-w-full"
        />
        <p v-else-if="isEncoding" class="text-sm text-zinc-500 dark:text-zinc-400">
          {{ t('Loading the barcode maker…') }}
        </p>
        <p v-else class="text-sm text-zinc-500 dark:text-zinc-400">
          {{ t('Fix the data to see the barcode.') }}
        </p>
      </div>

      <ScanCheckPanel
        v-if="barcode"
        :status="scanStatus"
        :decoded="scanDecoded"
        :warnings="scanWarnings"
        barcode
        id="barcode-scan-check"
      />

      <details v-if="encoded" id="barcode-info" class="w-80 max-w-full text-start text-sm">
        <summary class="cursor-pointer font-semibold">{{ t("What's in this code") }}</summary>
        <dl class="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
          <dt class="text-zinc-500 dark:text-zinc-400">{{ t('Type') }}</dt>
          <dd>
            {{ t(barcodeFormat(encoded.type).label)
            }}{{ barcodeFormat(encoded.type).gs1 ? ` (${t('GS1 data')})` : '' }}
          </dd>
          <dt class="text-zinc-500 dark:text-zinc-400">{{ t('Stored') }}</dt>
          <dd id="barcode-stored" class="break-all font-mono">{{ encoded.expected }}</dd>
          <template v-if="addedCheckDigit">
            <dt class="text-zinc-500 dark:text-zinc-400">{{ t('Check digit') }}</dt>
            <dd>{{ t('{digit}, added for you', { digit: addedCheckDigit }) }}</dd>
          </template>
          <dt class="text-zinc-500 dark:text-zinc-400">{{ t('Size') }}</dt>
          <dd>
            {{
              t('{w} × {h} modules, blank margin included', {
                w: encoded.barcode.width,
                h: encoded.barcode.height
              })
            }}
          </dd>
        </dl>
      </details>

      <section
        id="barcode-export"
        class="mt-3 flex w-full max-w-sm flex-col gap-4 rounded-lg border border-zinc-300 p-4 dark:border-zinc-700"
        aria-labelledby="barcode-export-title"
      >
        <h3
          id="barcode-export-title"
          class="section-heading mx-auto -mt-[30px] bg-white px-4 text-zinc-900 dark:bg-b0r3d-bg dark:text-zinc-100"
        >
          {{ t('Download') }}
        </h3>
        <div class="flex w-full flex-col gap-2">
          <label for="barcode-filename" class="label">{{ t('File name') }}</label>
          <input
            id="barcode-filename"
            v-model="fileName"
            type="text"
            class="!ms-0 text-input"
            :placeholder="type"
          />
        </div>
        <PrintSizeSettings
          v-model="printSettings"
          :guidance="null"
          :problem="printProblem"
          :barcode-guidance="printGuidance"
          id-prefix="barcode-print"
        />
        <div class="flex flex-row flex-wrap items-center justify-center gap-2">
          <button
            id="barcode-download-png"
            class="button px-4"
            :disabled="!barcode || isExporting"
            @click="download('png')"
          >
            PNG
          </button>
          <button
            id="barcode-download-jpg"
            class="button px-4"
            :disabled="!barcode || isExporting"
            @click="download('jpg')"
          >
            JPG
          </button>
          <button
            id="barcode-download-svg"
            class="button px-4"
            :disabled="!barcode || isExporting"
            @click="download('svg')"
          >
            SVG
          </button>
          <button
            v-if="IS_COPY_IMAGE_TO_CLIPBOARD_SUPPORTED"
            id="barcode-copy"
            class="button px-4"
            :disabled="!barcode || isExporting"
            @click="copyToClipboard"
          >
            {{ copied ? t('Copied') : t('Copy') }}
          </button>
        </div>
        <p v-if="exportError" role="alert" class="text-sm text-red-700 dark:text-red-400">
          {{ exportError }}
        </p>
      </section>
      <p class="max-w-sm text-center text-xs text-zinc-500 dark:text-zinc-400">
        {{ t('Barcodes are made with zint and checked with ZXing-C++.') }}
        <a href="./third-party-licenses.txt" class="underline" target="_blank">{{
          t('Licenses')
        }}</a>
      </p>
    </section>

    <!-- Look and size -->
    <section
      class="order-3 flex w-full flex-col gap-6 text-start md:order-none md:col-start-2 md:row-start-2"
      aria-labelledby="barcode-style-title"
    >
      <h2
        id="barcode-style-title"
        class="section-heading text-2xl text-gray-700 dark:text-gray-100"
      >
        {{ t('Barcode settings') }}
      </h2>
      <div v-if="format.linear || format.writeFormat === 'DataMatrix'" class="flex flex-col gap-2">
        <label v-if="format.linear" class="flex items-center gap-2 !text-base">
          <input id="barcode-show-text" v-model="settings.showText" type="checkbox" />
          {{ t('Show the text under the bars') }}
        </label>
        <label v-else class="flex items-center gap-2 !text-base">
          <input id="barcode-rectangular" v-model="settings.allowRectangular" type="checkbox" />
          {{ t('Allow a rectangular code (narrower; fewer scanners read it)') }}
        </label>
      </div>
      <div class="flex flex-row flex-wrap items-center gap-x-6 gap-y-3">
        <div class="flex flex-row items-center gap-2">
          <label for="barcode-color" class="!self-center">{{ t('Bars') }}</label>
          <input id="barcode-color" v-model="settings.color" type="color" class="color-input" />
        </div>
        <div
          class="flex flex-row items-center gap-2"
          :class="settings.transparent && 'opacity-30'"
          :inert="settings.transparent"
        >
          <label for="barcode-background" class="!self-center">{{ t('Background') }}</label>
          <input
            id="barcode-background"
            v-model="settings.background"
            type="color"
            class="color-input"
          />
        </div>
        <label class="flex items-center gap-2 !text-base">
          <input id="barcode-transparent" v-model="settings.transparent" type="checkbox" />
          {{ t('Transparent background') }}
        </label>
      </div>
      <div class="flex flex-col gap-1">
        <label for="barcode-scale">{{ t('Size (pixels per module)') }}</label>
        <input
          id="barcode-scale"
          v-model.number="settings.scale"
          type="number"
          :min="MIN_SCALE"
          :max="MAX_SCALE"
          step="1"
          class="!ms-0 !w-28 text-input"
        />
        <p class="text-sm text-zinc-600 dark:text-zinc-400">
          {{
            barcode
              ? t('Downloads are {w} × {h} px. Use Size for print for a physical size.', {
                  w: barcode.width * scale,
                  h: barcode.height * scale
                })
              : t('A module is the narrowest bar or square.')
          }}
        </p>
      </div>
    </section>
  </div>
</template>

<style scoped>
.checkerboard {
  background-color: #ffffff;
  background-image:
    linear-gradient(45deg, #e4e4e7 25%, transparent 25%),
    linear-gradient(-45deg, #e4e4e7 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #e4e4e7 75%),
    linear-gradient(-45deg, transparent 75%, #e4e4e7 75%);
  background-size: 16px 16px;
  background-position:
    0 0,
    0 8px,
    8px -8px,
    -8px 0;
}
</style>
