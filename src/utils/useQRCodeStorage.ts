import type { Options as StyledQRCodeProps } from '@/lib/qr-code'
import type { FrameStyle } from './framePresets'
import { isValidQRCodeConfig } from './qrCodePresets'
import { storageGet, storageSet } from './safeStorage'
import { sanitizeSimpleFields, type QRViewMode, type SimpleFieldKey } from './simpleModeFields'

export interface QRCodeFrameConfig {
  text: string
  position: 'top' | 'bottom' | 'left' | 'right'
  style: FrameStyle
  /** Side captions only: caption column width in px (default 200). */
  captionWidth?: number
}

export interface QRCodeConfig {
  props: StyledQRCodeProps & { name?: string }
  style: {
    borderRadius: string
    background?: string
  }
  frame?: QRCodeFrameConfig | null
}

export const QR_CODE_STORAGE_KEY = 'qrCodeConfig'
export const LAST_LOADED_LOCALLY_PRESET_KEY = 'Last saved locally'
export const LOADED_FROM_FILE_PRESET_KEY = 'Loaded from file'
export const RECENT_CODES_PRESET_KEY = 'Opened from Recent codes'
export const CUSTOM_LOADED_PRESET_KEYS = [
  LAST_LOADED_LOCALLY_PRESET_KEY,
  LOADED_FROM_FILE_PRESET_KEY,
  RECENT_CODES_PRESET_KEY
] as const

export function isLocalStorageEnabled(): boolean {
  return import.meta.env?.VITE_DISABLE_LOCAL_STORAGE !== 'true'
}

export function hasStoredQRConfig(): boolean {
  return storageGet(QR_CODE_STORAGE_KEY) !== null
}

export function serializeQRConfig(
  props: StyledQRCodeProps & { name?: string },
  style: { borderRadius: string; background?: string },
  frame: QRCodeFrameConfig | null
): QRCodeConfig {
  return { props, style, frame }
}

/**
 * Remembers the current design between visits. The data is left out: it is
 * never read back (each visit starts with an empty field), and leaving it
 * out means Recent codes is the one place codes are kept, so clearing that
 * really clears them.
 */
export function saveQRConfig(config: QRCodeConfig): void {
  const { data: _data, ...props } = config.props
  storageSet(QR_CODE_STORAGE_KEY, JSON.stringify({ ...config, props }))
}

export function loadQRConfig(): QRCodeConfig | null {
  const stored = storageGet(QR_CODE_STORAGE_KEY)
  if (!stored) return null
  try {
    const parsed: unknown = JSON.parse(stored)
    if (!isValidQRCodeConfig(parsed)) return null
    return parsed as QRCodeConfig
  } catch {
    return null
  }
}

// --- Simple Mode view preferences -----------------------------------------
// Persisted separately from the QR config so toggling the view never mutates
// the stored design. Both reads tolerate missing/corrupt values by returning a
// safe default, mirroring loadQRConfig.

export const QR_VIEW_MODE_STORAGE_KEY = 'qrViewMode'
export const QR_SIMPLE_FIELDS_STORAGE_KEY = 'qrSimpleFields'

export function saveViewMode(mode: QRViewMode): void {
  storageSet(QR_VIEW_MODE_STORAGE_KEY, mode)
}

export function loadViewMode(): QRViewMode | null {
  const stored = storageGet(QR_VIEW_MODE_STORAGE_KEY)
  return stored === 'simple' || stored === 'full' ? stored : null
}

export function saveSimpleFields(keys: SimpleFieldKey[]): void {
  storageSet(QR_SIMPLE_FIELDS_STORAGE_KEY, JSON.stringify(keys))
}

export function loadSimpleFields(): SimpleFieldKey[] {
  const stored = storageGet(QR_SIMPLE_FIELDS_STORAGE_KEY)
  if (!stored) return []
  try {
    return sanitizeSimpleFields(JSON.parse(stored))
  } catch {
    return []
  }
}
