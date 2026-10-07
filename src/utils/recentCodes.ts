/**
 * Recent codes: the codes made in this browser, kept so they can be opened
 * again. A code is added when it is downloaded, copied or saved as a
 * configuration file, never on every edit and never from a batch export.
 * Storage lives in recentCodesDb.ts; this file holds what can be worked out
 * without a browser (what to keep, how to label it, how to read it back).
 */
import { BARCODE_FORMATS, barcodeFormat, type BarcodeType } from '@/lib/barcode/formats'
import { detectDataType } from './dataEncoding'
import { isValidQRCodeConfig } from './qrCodePresets'
import { describeScannedContent } from './scannedContent'
import type { QRCodeConfig } from './useQRCodeStorage'

/** How many codes are kept; adding one more drops the oldest. */
export const MAX_RECENT_CODES = 20

/**
 * Logos and frame backgrounds longer than this (as data: URLs) aren't kept
 * with a code. Uploads are shrunk to 1024 / 2048 px, but SVG and GIF files
 * are kept as uploaded and can be any size.
 */
export const MAX_KEPT_IMAGE_LENGTH = 2 * 1024 * 1024

/** Longest text shown for a code in the list. */
const MAX_TITLE_LENGTH = 80

export type OmittedImage = 'logo' | 'background'

export interface RecentQrDetails {
  kind: 'qr'
  config: QRCodeConfig
}

export interface RecentBarcodeDetails {
  kind: 'barcode'
  type: BarcodeType
  data: string
  /** The barcode view's colours and options, as they were. */
  settings: Record<string, unknown>
}

export type RecentCodeDetails = RecentQrDetails | RecentBarcodeDetails

/** What the list shows. The details are read only when a code is opened. */
export interface RecentCodeSummary {
  id: number
  /** Record format, so a later version can tell old records apart. */
  v: 1
  kind: 'qr' | 'barcode'
  /** One entry per kind, type and data: making it again replaces the old one. */
  key: string
  /** The kind of content, e.g. "URL", "WiFi" or "EAN-13". */
  label: string
  /** The content, shortened. Never includes a Wi-Fi password. */
  title: string
  /** Holds a secret (a Wi-Fi password), so the list shows no picture of it. */
  sensitive: boolean
  /** A small picture of the code as a data: URL; absent when sensitive. */
  thumbnail?: string
  /** Images that were too large to keep. */
  omitted: OmittedImage[]
  savedAt: number
  /** Rough size of everything stored for this code, in bytes. */
  size: number
}

export interface NewRecentCode {
  summary: Omit<RecentCodeSummary, 'id'>
  details: RecentCodeDetails
}

export function recentCodeKey(kind: 'qr' | 'barcode', type: string, data: string): string {
  return `${kind}:${type}:${data}`
}

function shorten(text: string): string {
  const oneLine = text.replace(/\s+/g, ' ').trim()
  return oneLine.length > MAX_TITLE_LENGTH
    ? `${oneLine.slice(0, MAX_TITLE_LENGTH - 1).trimEnd()}…`
    : oneLine
}

/**
 * The label and title shown for a QR code's data, using the same parser as
 * the Data templates and the Scan page.
 */
export function describeQrData(data: string): {
  label: string
  title: string
  sensitive: boolean
} {
  const { label } = describeScannedContent(data)
  const { type, parsedData } = detectDataType(data)
  const field = (name: string) => String(parsedData[name] ?? '').trim()
  switch (type) {
    case 'wifi':
      return {
        label,
        title: shorten(field('ssid')),
        sensitive: field('password') !== ''
      }
    case 'vcard': {
      const name = [field('firstName'), field('lastName')].filter(Boolean).join(' ')
      return { label, title: shorten(name || field('org')), sensitive: false }
    }
    case 'event':
      return { label, title: shorten(field('title')), sensitive: false }
    case 'epc': {
      const amount = field('amount')
      return {
        label,
        title: shorten([field('name'), amount && `EUR ${amount}`].filter(Boolean).join(', ')),
        sensitive: false
      }
    }
  }
  return { label, title: shorten(data), sensitive: false }
}

/** Plain JSON copy: drops Vue proxies (IndexedDB can't store them) and undefined. */
function plainCopy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function isOversized(image: unknown): boolean {
  return (
    typeof image === 'string' && image.startsWith('data:') && image.length > MAX_KEPT_IMAGE_LENGTH
  )
}

/**
 * A copy of the config to keep, without images too large to keep.
 * `config.props.image` should be the logo as drawn (a remote address already
 * turned into a data: URL), so the code opens the same way offline.
 */
export function qrConfigToKeep(config: QRCodeConfig): {
  config: QRCodeConfig
  omitted: OmittedImage[]
} {
  const copy = plainCopy(config)
  const omitted: OmittedImage[] = []
  if (isOversized(copy.props.image)) {
    copy.props.image = ''
    omitted.push('logo')
  }
  if (copy.frame && isOversized(copy.frame.style.backgroundImage)) {
    delete copy.frame.style.backgroundImage
    omitted.push('background')
  }
  return { config: copy, omitted }
}

function sizeOf(value: unknown): number {
  return JSON.stringify(value).length
}

export function newRecentQrCode(
  config: QRCodeConfig,
  thumbnail: string | undefined,
  savedAt: number
): NewRecentCode {
  const kept = qrConfigToKeep(config)
  const data = typeof kept.config.props.data === 'string' ? kept.config.props.data : ''
  const { label, title, sensitive } = describeQrData(data)
  const details: RecentQrDetails = { kind: 'qr', config: kept.config }
  const picture = sensitive ? undefined : thumbnail
  return {
    summary: {
      v: 1,
      kind: 'qr',
      key: recentCodeKey('qr', 'qr', data),
      label,
      title,
      sensitive,
      ...(picture ? { thumbnail: picture } : {}),
      omitted: kept.omitted,
      savedAt,
      size: sizeOf(details) + (picture?.length ?? 0)
    },
    details
  }
}

export function newRecentBarcode(
  type: BarcodeType,
  data: string,
  settings: object,
  thumbnail: string | undefined,
  savedAt: number
): NewRecentCode {
  const details: RecentBarcodeDetails = {
    kind: 'barcode',
    type,
    data,
    settings: plainCopy(settings) as Record<string, unknown>
  }
  return {
    summary: {
      v: 1,
      kind: 'barcode',
      key: recentCodeKey('barcode', type, data),
      label: barcodeFormat(type).label,
      title: shorten(data),
      sensitive: false,
      ...(thumbnail ? { thumbnail } : {}),
      omitted: [],
      savedAt,
      size: sizeOf(details) + (thumbnail?.length ?? 0)
    },
    details
  }
}

/**
 * Checks a stored code before it is opened, with the same rules as a loaded
 * configuration file (no javascript: logos and so on). Returns null when it
 * can't be used.
 */
export function readRecentDetails(value: unknown): RecentCodeDetails | null {
  if (!value || typeof value !== 'object') return null
  const details = value as Partial<RecentQrDetails> & Partial<RecentBarcodeDetails>
  if (details.kind === 'qr') {
    return isValidQRCodeConfig(details.config)
      ? { kind: 'qr', config: details.config as QRCodeConfig }
      : null
  }
  if (
    details.kind === 'barcode' &&
    BARCODE_FORMATS.some((f) => f.id === details.type) &&
    typeof details.data === 'string'
  ) {
    const settings =
      details.settings && typeof details.settings === 'object' ? details.settings : {}
    return { kind: 'barcode', type: details.type as BarcodeType, data: details.data, settings }
  }
  return null
}
