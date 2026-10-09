<script setup lang="ts">
/**
 * Camera scanning: the browser's camera stream in a <video>, with frames read
 * by ZXing-C++ (zxing-wasm, served from this site). Reads QR codes and every
 * other common barcode, including the types this app can make.
 */
import { storageGet, storageSet } from '@/utils/safeStorage'
import { onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

const emit = defineEmits<{
  'qr-detected': [data: string, format?: string]
  cancel: []
}>()

const { t } = useI18n()
const errorMessage = ref<string | null>(null)
const isLoading = ref(false)
const isScanning = ref(false)
const hasMultipleCameras = ref(false)
const videoDevices = ref<MediaDeviceInfo[]>([])
const currentDeviceIndex = ref(0)
const supportsTorch = ref(false)
const isTorchOn = ref(false)
const video = ref<HTMLVideoElement | null>(null)

const CAMERA_PREFERENCE_KEY = 'qr-scanner-camera-preference'
const isFrontCamera = ref(storageGet(CAMERA_PREFERENCE_KEY) === 'front')

// Frames are read at most this often, and scaled down to this size first:
// plenty for a code that fills a fair part of the view, and light on phones.
const FRAME_INTERVAL_MS = 120
const MAX_FRAME_SIDE = 1280

let stream: MediaStream | null = null
let session = 0

function stopStream() {
  isTorchOn.value = false
  supportsTorch.value = false
  stream?.getTracks().forEach((track) => track.stop())
  stream = null
  if (video.value) video.value.srcObject = null
}

const stopScanner = () => {
  session++
  isScanning.value = false
  stopStream()
}

const stopScanning = () => {
  stopScanner()
  emit('cancel')
}

const toggleCamera = () => {
  if (videoDevices.value.length > 1) {
    currentDeviceIndex.value = (currentDeviceIndex.value + 1) % videoDevices.value.length
    const label = videoDevices.value[currentDeviceIndex.value]?.label ?? ''
    isFrontCamera.value = /front|user/i.test(label)
  } else {
    isFrontCamera.value = !isFrontCamera.value
  }
  storageSet(CAMERA_PREFERENCE_KEY, isFrontCamera.value ? 'front' : 'back')
  startScanning()
}

async function toggleTorch() {
  const track = stream?.getVideoTracks()[0]
  if (!track || !supportsTorch.value) return
  try {
    const nextState = !isTorchOn.value
    await (
      track as MediaStreamTrack & { applyConstraints: (c: unknown) => Promise<void> }
    ).applyConstraints({
      advanced: [{ torch: nextState }]
    })
    isTorchOn.value = nextState
  } catch (err) {
    console.warn('Failed to toggle torch:', err)
  }
}

function cameraErrorMessage(err: unknown): string {
  const name = (err as { name?: string } | null)?.name
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return t('Camera access denied. Please allow camera access in your browser settings.')
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    return t('No camera found on this device')
  }
  if (name === 'NotReadableError') return t('Camera is already in use by another application')
  return t('Could not start QR code scanner')
}

async function startScanning() {
  stopScanner()
  const current = ++session
  errorMessage.value = null
  isLoading.value = true
  // Start loading the decoder while the camera starts up.
  const decoder = import('@/lib/barcode/zxing')
  try {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw Object.assign(new Error('No camera API'), { name: 'NotFoundError' })
    }

    const videoConstraints: MediaTrackConstraints = {
      width: { ideal: 1280 },
      height: { ideal: 720 }
    }
    if (videoDevices.value.length > 1 && videoDevices.value[currentDeviceIndex.value]?.deviceId) {
      videoConstraints.deviceId = { exact: videoDevices.value[currentDeviceIndex.value].deviceId }
    } else {
      videoConstraints.facingMode = { ideal: isFrontCamera.value ? 'user' : 'environment' }
    }

    let media: MediaStream
    try {
      media = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: videoConstraints
      })
    } catch {
      // If specific deviceId or facingMode constraint fails, fall back to basic video
      media = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: isFrontCamera.value ? 'user' : 'environment' } }
      })
    }
    if (current !== session) {
      media.getTracks().forEach((track) => track.stop())
      return
    }
    stream = media
    const el = video.value!
    el.srcObject = media
    await el.play()

    const track = media.getVideoTracks()[0]
    const capabilities = (track?.getCapabilities?.() ?? {}) as Record<string, unknown>
    supportsTorch.value = Boolean(capabilities.torch)
    isTorchOn.value = false

    const devices = await navigator.mediaDevices.enumerateDevices()
    const foundVideo = devices.filter((d) => d.kind === 'videoinput')
    videoDevices.value = foundVideo
    hasMultipleCameras.value = foundVideo.length > 1

    const { readBarcodes } = await decoder
    if (current !== session) return
    isScanning.value = true
    isLoading.value = false
    readFrames(current, readBarcodes)
  } catch (err) {
    if (current !== session) return
    console.error('Error starting the camera scanner:', err)
    stopStream()
    errorMessage.value = cameraErrorMessage(err)
    isLoading.value = false
  }
}

async function readFrames(
  current: number,
  readBarcodes: typeof import('@/lib/barcode/zxing').readBarcodes
) {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return
  while (current === session) {
    const el = video.value
    if (el && el.readyState >= 2 && el.videoWidth > 0) {
      const scale = Math.min(1, MAX_FRAME_SIDE / Math.max(el.videoWidth, el.videoHeight))
      canvas.width = Math.round(el.videoWidth * scale)
      canvas.height = Math.round(el.videoHeight * scale)
      ctx.drawImage(el, 0, 0, canvas.width, canvas.height)
      try {
        const [found] = await readBarcodes(ctx.getImageData(0, 0, canvas.width, canvas.height), {
          tryHarder: true,
          maxNumberOfSymbols: 1
        })
        if (found && current === session) {
          stopScanner()
          emit('qr-detected', found.text, found.format)
          return
        }
      } catch (err) {
        console.warn('Frame could not be read:', err)
      }
    }
    await new Promise((resolve) => setTimeout(resolve, FRAME_INTERVAL_MS))
  }
}

onMounted(startScanning)
onUnmounted(stopScanner)

defineExpose({
  startScanning,
  stopScanning
})
</script>

<template>
  <div class="camera-scanner">
    <div v-if="errorMessage" role="alert" class="error-message mb-4 text-center text-red-500">
      {{ errorMessage }}
    </div>

    <div v-show="!errorMessage" class="scanner-container relative mb-4 overflow-hidden rounded-lg">
      <video
        ref="video"
        class="mx-auto block w-full max-w-md"
        :class="isFrontCamera && 'mirrored'"
        playsinline
        muted
        :aria-label="t('Camera view')"
      ></video>
      <!-- A frame to aim with; any part of the view is read -->
      <div v-if="isScanning" aria-hidden="true" class="viewfinder"></div>
      <p
        v-if="isLoading"
        class="absolute inset-0 grid place-items-center text-sm text-white"
        role="status"
      >
        {{ t('Starting the camera…') }}
      </p>

      <div v-if="isScanning" class="absolute end-2 top-2 flex gap-2">
        <button
          v-if="supportsTorch"
          class="rounded-full bg-white/80 p-2 text-black shadow-md transition-colors hover:bg-white/90 dark:bg-black/80 dark:text-white dark:hover:bg-black/90"
          :class="isTorchOn && 'text-amber-500 dark:text-amber-400'"
          @click="toggleTorch"
          type="button"
          :aria-label="isTorchOn ? t('Turn off flashlight') : t('Turn on flashlight')"
          :title="isTorchOn ? t('Turn off flashlight') : t('Turn on flashlight')"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24">
            <path fill="currentColor" d="M7 2v11h3v9l7-12h-4l4-8z" />
          </svg>
        </button>
        <button
          v-if="hasMultipleCameras"
          class="rounded-full bg-white/80 p-2 text-black shadow-md transition-colors hover:bg-white/90 dark:bg-black/80 dark:text-white dark:hover:bg-black/90"
          @click="toggleCamera"
          type="button"
          :aria-label="t('Switch camera')"
          :title="t('Switch camera')"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24">
            <path
              fill="currentColor"
              d="M20 5h-3.17L15.5 3.12C15.12 2.44 14.33 2 13.5 2h-3c-.83 0-1.62.44-2 1.12L7.17 5H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2m-5 11.5V13H9v3.5L5.5 12L9 7.5V11h6V7.5l3.5 4.5z"
            />
          </svg>
        </button>
        <button
          class="rounded-full bg-white/80 p-2 text-black shadow-md transition-colors hover:bg-white/90 dark:bg-black/80 dark:text-white dark:hover:bg-black/90"
          @click="stopScanning"
          type="button"
          :aria-label="t('Close scanner')"
          :title="t('Close scanner')"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24">
            <path
              fill="currentColor"
              d="M19 6.41L17.59 5L12 10.59L6.41 5L5 6.41L10.59 12L5 17.59L6.41 19L12 13.41L17.59 19L19 17.59L13.41 12L19 6.41z"
            />
          </svg>
        </button>
      </div>
    </div>

    <button class="button mt-4" type="button" @click="stopScanning">
      {{ t('Cancel') }}
    </button>
  </div>
</template>

<style scoped>
.camera-scanner {
  width: 100%;
  position: relative;
}

.scanner-container {
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  background-color: #000;
  min-height: 300px;
}

video {
  border-radius: 8px;
  object-fit: cover;
}

/* The front camera is shown mirrored, as people expect from a selfie view. */
.mirrored {
  transform: scaleX(-1);
}

.viewfinder {
  position: absolute;
  inset: 15% 10%;
  border: 2px solid rgba(255, 255, 255, 0.8);
  border-radius: 12px;
  box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.25);
  pointer-events: none;
}

.error-message {
  max-width: 90%;
  margin-left: auto;
  margin-right: auto;
}

.button {
  @apply rounded-lg bg-zinc-100 px-4 py-2 transition-colors hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700;
}
</style>
