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
import { parseCSV, readCSVFile } from '@/utils/csv'
import { processCsvDataForBarcodeBatch, type BarcodeBatchItem } from '@/utils/csvBatchProcessing'
import { createPdfBlob } from '@/utils/pdf'
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
import { newRecentBarcode } from '@/utils/recentCodes'
import { isRecentCodesSupported } from '@/utils/recentCodesDb'
import { recordRecentCode, takeRestore } from '@/utils/useRecentCodes'
import { storageGet, storageSet } from '@/utils/safeStorage'
import { getScanWarnings } from '@/utils/scanCheck'
import { computed, onUnmounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

const codeType = defineModel<CodeType>('codeType', { required: true })
const props = defineProps<{
  /**
   * Data to start with, e.g. from "Create a code with this data" on the Scan
   * page. A code opened from Recent codes also brings its settings, applied
   * once per `restoreId`.
   */
  initialData?: {
    type: BarcodeType
    data: string
    settings?: Record<string, unknown>
    restoreId?: number
  } | null
}>()
const emit = defineEmits<{ (e: 'open-recent-codes'): void }>()
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

enum ExportMode {
  Single = 'single',
  Batch = 'batch'
}
const exportMode = ref<ExportMode>(ExportMode.Single)
const batchFile = ref<File | null>(null)
const batchItems = ref<BarcodeBatchItem[]>([])
const batchPreviewIndex = ref(0)
const isExportingBatch = ref(false)
const batchExportProgress = ref<number | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)
const batchValidationError = ref<string | null>(null)

//#region Settings, remembered in this browser
interface BarcodeSettings {
  color: string
  background: string
  transparent: boolean
  /** Pixels per module for screen downloads. */
  scale: number
  showText: boolean
  allowRectangular: boolean
  /** 1D barcode height in modules (default 50). */
  barHeight: number
  /** Include quiet zones margins around barcode (default true). */
  quietZones: boolean
}
const DEFAULT_SETTINGS: BarcodeSettings = {
  color: '#000000',
  background: '#ffffff',
  transparent: false,
  scale: 4,
  showText: true,
  allowRectangular: false,
  barHeight: 50,
  quietZones: true
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

// An opened code brings back its colours and options; only known settings of
// the right type are taken.
watch(
  () => props.initialData,
  (initial) => {
    if (!initial?.settings || initial.restoreId === undefined) return
    if (!takeRestore(initial.restoreId)) return
    const next: Record<string, unknown> = { ...settings.value }
    for (const [key, fallback] of Object.entries(DEFAULT_SETTINGS)) {
      const saved = initial.settings[key]
      if (typeof saved === typeof fallback) next[key] = saved
    }
    settings.value = next as unknown as BarcodeSettings
  },
  { immediate: true }
)

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
  /** The text as typed. */
  text: string
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
      allowRectangular: settings.value.allowRectangular,
      barHeight: settings.value.barHeight,
      quietZones: settings.value.quietZones
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
      text,
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
  () => [
    data.value,
    type.value,
    settings.value.showText,
    settings.value.allowRectangular,
    settings.value.barHeight,
    settings.value.quietZones
  ],
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

async function rasterizeBarcode(
  barcodeSvg: BarcodeSvg,
  mimeType: 'image/png' | 'image/jpeg'
): Promise<Blob> {
  const blob = await rasterizeSvg({
    svgString: styleBarcodeSvg(barcodeSvg, { ...colors.value, scale: exportScale.value }),
    width: barcodeSvg.width * exportScale.value,
    height: barcodeSvg.height * exportScale.value,
    mimeType,
    quality: 0.95,
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

async function rasterExport(mimeType: 'image/png' | 'image/jpeg'): Promise<Blob> {
  return rasterizeBarcode(barcode.value!, mimeType)
}

async function exportPdf(targetBarcode = barcode.value!): Promise<Blob> {
  const guidance = printGuidance.value
  const dpi = printSettings.value.enabled ? printSettings.value.dpi : 72
  const widthMm = guidance
    ? guidance.actualWidthMm
    : (targetBarcode.width * exportScale.value * 25.4) / dpi
  const heightMm = guidance
    ? (guidance.actualWidthMm * targetBarcode.height) / targetBarcode.width
    : (targetBarcode.height * exportScale.value * 25.4) / dpi

  const imgBlob = await rasterizeBarcode(targetBarcode, 'image/jpeg')
  const jpegBytes = new Uint8Array(await imgBlob.arrayBuffer())

  return createPdfBlob({
    widthMm,
    heightMm,
    jpegBytes,
    imageWidthPx: targetBarcode.width * exportScale.value,
    imageHeightPx: targetBarcode.height * exportScale.value,
    title: exportName.value
  })
}

async function onBatchUpload(event: Event | DragEvent) {
  let file: File | null = null
  const target = event.target as HTMLInputElement
  if (target?.files?.[0]) {
    file = target.files[0]
  } else {
    const dt = (event as DragEvent).dataTransfer
    if (dt?.files?.[0]) file = dt.files[0]
  }
  if (!file) return
  batchFile.value = file
  try {
    const content = await readCSVFile(file)
    const parsed = parseCSV(content)
    if (!parsed.isValid) {
      batchValidationError.value = t('The CSV file could not be read.')
      return
    }
    const items = processCsvDataForBarcodeBatch(parsed.data)
    if (items.length === 0) {
      batchValidationError.value = t('No barcode data found in the CSV.')
      return
    }
    batchItems.value = items
    batchPreviewIndex.value = 0
    batchValidationError.value = null
    data.value = items[0].data
  } catch {
    batchValidationError.value = t('Error reading CSV file.')
  }
}

function setBatchRow(idx: number) {
  if (idx < 0 || idx >= batchItems.value.length) return
  batchPreviewIndex.value = idx
  data.value = batchItems.value[idx].data
}

async function generateBatchBarcodes(kind: 'png' | 'jpg' | 'svg' | 'pdf') {
  if (batchItems.value.length === 0 || isExporting.value) return
  isExporting.value = true
  isExportingBatch.value = true
  exportError.value = null
  try {
    const { default: JSZip } = await import('jszip')
    const zip = new JSZip()
    const usedNames = new Set<string>()

    for (let i = 0; i < batchItems.value.length; i++) {
      batchExportProgress.value = i + 1
      const item = batchItems.value[i]
      const result = await makeBarcode(item.data, type.value, {
        showText: settings.value.showText,
        allowRectangular: settings.value.allowRectangular,
        barHeight: settings.value.barHeight,
        quietZones: settings.value.quietZones
      })
      if (!result.ok) continue

      let baseName = (item.fileName || item.data).replace(/[^a-zA-Z0-9_-]/g, '_')
      if (usedNames.has(baseName)) {
        baseName = `${baseName}_${i + 1}`
      }
      usedNames.add(baseName)

      if (kind === 'svg') {
        const svgStr = styleBarcodeSvg(result, { ...colors.value, scale: exportScale.value })
        zip.file(`${baseName}.svg`, svgStr)
      } else if (kind === 'pdf') {
        const pdfBlob = await exportPdf(result)
        zip.file(`${baseName}.pdf`, pdfBlob)
      } else {
        const mime = kind === 'png' ? 'image/png' : 'image/jpeg'
        const blob = await rasterizeBarcode(result, mime)
        zip.file(`${baseName}.${kind}`, blob)
      }
    }

    const zipContent = await zip.generateAsync({ type: 'blob' })
    downloadBlob(zipContent, `${exportName.value}-batch.zip`)
  } catch (err) {
    console.error('Batch barcode export failed:', err)
    exportError.value = t("Couldn't create the batch ZIP file.")
  } finally {
    isExporting.value = false
    isExportingBatch.value = false
    batchExportProgress.value = null
  }
}

// The barcode being exported, copied when the button is pressed.
function snapshotForRecentCodes() {
  const current = encoded.value
  if (!current || !isRecentCodesSupported()) return null
  return {
    type: current.type,
    text: current.text,
    settings: JSON.parse(JSON.stringify(settings.value)) as BarcodeSettings,
    thumbnail: svgDataUrl(styleBarcodeSvg(current.barcode, { ...colors.value, scale: 1 }))
  }
}

function addToRecentCodes(snapshot: ReturnType<typeof snapshotForRecentCodes>) {
  if (!snapshot) return
  void recordRecentCode(() =>
    newRecentBarcode(
      snapshot.type,
      snapshot.text,
      snapshot.settings,
      snapshot.thumbnail,
      Date.now()
    )
  )
}

async function download(kind: 'png' | 'jpg' | 'svg' | 'pdf') {
  if (exportMode.value === ExportMode.Batch) {
    return generateBatchBarcodes(kind)
  }
  if (!barcode.value || isExporting.value) return
  isExporting.value = true
  exportError.value = null
  const snapshot = snapshotForRecentCodes()
  try {
    if (kind === 'svg') {
      downloadBlob(
        new Blob([exportSvg()], { type: 'image/svg+xml;charset=utf-8' }),
        `${exportName.value}.svg`
      )
    } else if (kind === 'pdf') {
      const blob = await exportPdf()
      downloadBlob(blob, `${exportName.value}.pdf`)
    } else {
      const blob = await rasterExport(kind === 'png' ? 'image/png' : 'image/jpeg')
      downloadBlob(blob, `${exportName.value}.${kind}`)
    }
    addToRecentCodes(snapshot)
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
  const snapshot = snapshotForRecentCodes()
  try {
    const blob = await rasterExport('image/png')
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
    addToRecentCodes(snapshot)
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
      <div class="flex w-full flex-col gap-2">
        <div class="flex items-center gap-4">
          <label for="barcode-data">{{ t('Data to encode') }}</label>
          <div class="flex grow items-center gap-2">
            <button
              :class="[
                'secondary-button',
                { 'opacity-50': exportMode === ExportMode.Single }
              ]"
              @click="exportMode = ExportMode.Single"
            >
              {{ t('Single export') }}
            </button>
            <button
              :class="[
                'secondary-button',
                { 'opacity-50': exportMode === ExportMode.Batch }
              ]"
              @click="exportMode = ExportMode.Batch"
            >
              {{ t('Batch export') }}
            </button>
          </div>
        </div>

        <div v-if="exportMode === ExportMode.Single" class="flex flex-col gap-1">
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

        <div v-else class="flex flex-col gap-3">
          <div v-if="!batchFile" class="flex flex-col gap-2">
            <button
              class="!ms-0 flex items-center justify-center rounded-lg border-2 border-dashed border-zinc-300 p-4 text-center text-input dark:border-zinc-700"
              :aria-label="t('Choose a CSV file containing data to encode')"
              @click="fileInput?.click()"
              @dragover.prevent
              @drop.prevent="onBatchUpload"
            >
              <div class="flex flex-col items-center">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="36"
                  height="36"
                  viewBox="0 0 24 24"
                  class="mb-2 text-zinc-400"
                >
                  <path
                    fill="currentColor"
                    d="M11 16V7.85l-2.6 2.6L7 9l5-5l5 5l-1.4 1.45l-2.6-2.6V16h-2Zm-5 4q-.825 0-1.413-.588T4 18v-3h2v3h12v-3h2v3q0 .825-.588 1.413T18 20H6Z"
                  />
                </svg>
                <p class="text-sm font-medium">{{ t('Upload a CSV file') }}</p>
                <p class="text-xs text-zinc-500">{{ t('Columns: data (or code, barcode), optional fileName') }}</p>
              </div>
            </button>
            <input
              ref="fileInput"
              type="file"
              accept=".csv,.txt"
              class="hidden"
              @change="onBatchUpload"
            />
          </div>
          <div
            v-else
            class="flex flex-col gap-2 rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900"
          >
            <div class="flex items-center justify-between">
              <span class="text-sm font-semibold">
                {{ t('Batch rows: {count}', { count: batchItems.length }) }}
              </span>
              <button
                class="secondary-button text-xs"
                @click="batchFile = null; batchItems = []"
              >
                {{ t('Start new batch export') }}
              </button>
            </div>
            <div class="flex items-center justify-between gap-2 border-t border-zinc-200 pt-2 dark:border-zinc-800">
              <div class="flex items-center gap-2">
                <button
                  class="secondary-button px-2 py-1 text-xs"
                  :disabled="batchPreviewIndex <= 0"
                  @click="setBatchRow(batchPreviewIndex - 1)"
                >
                  ←
                </button>
                <span class="text-xs text-zinc-500">
                  {{ batchPreviewIndex + 1 }} / {{ batchItems.length }}
                </span>
                <button
                  class="secondary-button px-2 py-1 text-xs"
                  :disabled="batchPreviewIndex >= batchItems.length - 1"
                  @click="setBatchRow(batchPreviewIndex + 1)"
                >
                  →
                </button>
              </div>
              <code class="truncate rounded bg-zinc-200 px-2 py-0.5 font-mono text-xs dark:bg-zinc-800">
                {{ batchItems[batchPreviewIndex]?.data }}
              </code>
            </div>
          </div>
          <p
            v-if="batchValidationError"
            role="alert"
            class="text-sm text-red-700 dark:text-red-400"
          >
            {{ batchValidationError }}
          </p>
        </div>
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
          class="section-heading mx-auto mt-[-30px] bg-white px-4 text-zinc-900 dark:bg-b0r3d-bg dark:text-zinc-100"
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
            id="barcode-download-pdf"
            class="button px-4"
            :disabled="!barcode || isExporting"
            @click="download('pdf')"
          >
            PDF
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
        <p v-if="isExportingBatch" class="text-center text-sm font-medium text-cyan-600 dark:text-cyan-400">
          {{ t('Exporting {current} of {total}…', { current: batchExportProgress ?? 0, total: batchItems.length }) }}
        </p>
        <button
          v-if="isRecentCodesSupported()"
          id="barcode-recent-codes-button"
          class="secondary-button self-center"
          @click="emit('open-recent-codes')"
        >
          {{ t('Recent codes') }}
        </button>
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
      <div v-if="format.linear" class="flex flex-col gap-3">
        <label class="flex items-center gap-2 !text-base">
          <input id="barcode-show-text" v-model="settings.showText" type="checkbox" />
          {{ t('Show the text under the bars') }}
        </label>
        <label class="flex items-center gap-2 !text-base">
          <input id="barcode-quiet-zones" v-model="settings.quietZones" type="checkbox" />
          {{ t('Include quiet zones (margins)') }}
        </label>
        <div class="flex flex-col gap-1">
          <label for="barcode-height">{{ t('Bar height (modules)') }}</label>
          <div class="flex items-center gap-3">
            <input
              id="barcode-height"
              v-model.number="settings.barHeight"
              type="number"
              min="20"
              max="150"
              step="5"
              class="!ms-0 !w-24 text-input"
            />
            <span class="text-sm text-zinc-500 dark:text-zinc-400">
              {{ t('Default: 50 modules') }}
            </span>
          </div>
        </div>
      </div>
      <div v-else-if="format.writeFormat === 'DataMatrix'" class="flex flex-col gap-2">
        <label class="flex items-center gap-2 !text-base">
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
