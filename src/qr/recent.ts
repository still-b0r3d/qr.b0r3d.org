// Recent codes, as b0r3d QR keeps them: the last 20 codes saved or copied, newest first, each
// with what the list shows (its kind, a title that's never a Wi-Fi password) and the design that
// opens it again. The site has kept them in the browser in this shape since before this code, so
// the codes visitors kept then still open.

import { MAX_BAR_HEIGHT, MAX_SCALE, MIN_BAR_HEIGHT, MIN_SCALE, paperOf, styledSvg, type BarcodeLook, type BarcodeSvg } from './barcode-svg'
import { barcodeFormat, isBarcodeType, type BarcodeType } from './barcodes'
import { bareDomain } from './checks'
import { readColour } from './css'
import { copyDesign, type QrDesign } from './design'
import { designObject, type JsonObject } from './design-file'
import { formattedFixed } from './numbers'
import { detect, field } from './templates'

export const MOST = 20
/** A logo or frame picture longer than this (as a data: URL) isn't kept. */
export const MOST_IMAGE_LENGTH = 2 * 1024 * 1024
const TITLE_LENGTH = 80
/** 9999-12-31 UTC, the last day a date can show. */
export const LATEST_TIME = 253402214400000

/** One code as the list keeps it. */
export interface RecentRecord {
  /** the record's own shape: 1 */
  v: number
  kind: 'qr' | 'barcode'
  /** the same text again (as the same kind of code) replaces it */
  key: string
  /** "URL", "WiFi", "EAN-13"... */
  label: string
  /** the text shortened, never a Wi-Fi password */
  title: string
  /** holds a Wi-Fi password, so the list shows no picture of it */
  sensitive: boolean
  /** a PNG data: URL of the code, small; none when sensitive */
  thumbnail?: string
  /** "logo", "background": too big to keep */
  omitted: string[]
  /** milliseconds since 1970, UTC */
  savedAt: number
  /** how much it takes, in characters */
  size: number
  id?: number
}

/**
 * What opens a code again: a QR code's design with its text, or a barcode's type, text and
 * settings (as the site keeps them: {kind, type, data, settings}).
 */
export type RecentDetails = { kind: 'qr'; config: JsonObject } | { kind: 'barcode'; type: string; data: string; settings?: JsonObject }

/** The kind of content, as the list names it ("URL", "WiFi", "Contact Card"...). */
export function recentLabel(data: string): string {
  const value = (data ?? '').trim()
  const gs1 = /^\([0-9]{2,4}\)/.exec(value)
  if (gs1 && gs1[0].length < value.length && !/\s/.test(value[gs1[0].length])) return 'GS1 data' // "(01)09506000134352(10)ABC"
  switch (detect(data ?? '').kind) {
    case 'url':
      return 'URL'
    case 'gs1dl':
      return 'Product link (GS1 Digital Link)'
    case 'email':
      return 'Email'
    case 'phone':
      return 'Phone Number'
    case 'sms':
      return 'SMS'
    case 'wifi':
      return 'WiFi'
    case 'vcard':
      return 'Contact Card'
    case 'event':
      return 'Calendar Event'
    case 'location':
      return 'Location'
    case 'epc':
      return 'SEPA Payment'
  }
  if (bareDomain(value)) return 'URL'
  if (/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(value)) return 'Email'
  let digits = 0
  for (const c of value) if (c >= '0' && c <= '9') digits++
  const international = value.length > 1 && value[0] === '+' && [...value.slice(1)].every((c) => (c >= '0' && c <= '9') || /\s/.test(c) || '().-'.includes(c))
  if (international && digits >= 7 && digits <= 15) return 'Phone Number' // only numbers written the international way
  return 'Text'
}

/** The text on one line, at most 80 characters. */
function shorten(text: string): string {
  const line = (text ?? '').replace(/\s+/g, ' ').trim()
  if (line.length <= TITLE_LENGTH) return line
  return line.slice(0, TITLE_LENGTH - 1).trimEnd() + '…'
}

/** What the list shows for a code's text: its kind, a title (never a Wi-Fi password), and whether it holds a secret. */
export function describeRecent(data: string): { label: string; title: string; sensitive: boolean } {
  const label = recentLabel(data)
  const { kind, fields } = detect(data ?? '')
  const get = (name: string): string => field(fields, name).trim()
  switch (kind) {
    case 'wifi':
      return { label, title: shorten(get('ssid')), sensitive: get('password').length > 0 }
    case 'vcard': {
      const name = [get('firstName'), get('lastName')].filter((s) => s.length > 0).join(' ')
      return { label, title: shorten(name.length > 0 ? name : get('org')), sensitive: false }
    }
    case 'event':
      return { label, title: shorten(get('title')), sensitive: false }
    case 'epc': {
      const amount = get('amount')
      return { label, title: shorten([get('name'), amount.length > 0 ? 'EUR ' + amount : ''].filter((s) => s.length > 0).join(', ')), sensitive: false }
    }
    default:
      return { label, title: shorten(data), sensitive: false }
  }
}

const tooBig = (picture: string | null | undefined): boolean => !!picture && picture.startsWith('data:') && picture.length > MOST_IMAGE_LENGTH

/** A code to keep: the design with its text, without pictures too big to keep (the thumbnail comes with the page). */
export function newRecent(design: QrDesign, savedAt: number): { record: RecentRecord; details: RecentDetails; design: QrDesign } {
  const kept = copyDesign(design)
  const omitted: string[] = []
  if (tooBig(kept.logo)) {
    kept.logo = ''
    omitted.push('logo')
  }
  if (kept.frame && tooBig(kept.frame.backgroundImage)) {
    kept.frame.backgroundImage = null
    omitted.push('background')
  }
  const { label, title, sensitive } = describeRecent(kept.data)
  const config = designObject(kept, true)
  return {
    record: { v: 1, kind: 'qr', key: 'qr:qr:' + kept.data, label, title, sensitive, omitted, savedAt, size: JSON.stringify(config).length },
    details: { kind: 'qr', config },
    design: kept
  }
}

/**
 * A barcode to keep: its type, the text as typed and the settings it was made with, listed by its
 * type's name and a title as a QR code's is (never a Wi-Fi password: a network with one gets the
 * padlock and no picture), with its picture (the barcode drawn as an SVG, one pixel a module). The
 * PC app's next version does the same; until then it lists a barcode's whole text.
 */
export function newRecentBarcode(type: BarcodeType, text: string, look: BarcodeLook, barcode: BarcodeSvg | null, savedAt: number): { record: RecentRecord; details: RecentDetails } {
  const format = barcodeFormat(type)
  const { title, sensitive } = describeRecent(text)
  const settings: JsonObject = {
    color: look.color,
    background: look.background,
    transparent: look.transparent,
    scale: look.scale,
    showText: look.showText,
    allowRectangular: look.allowRectangular,
    barHeight: look.barHeight,
    quietZones: look.quietZones
  }
  const details: RecentDetails = { kind: 'barcode', type: format.id, data: text, settings }
  const thumbnail = barcode && !sensitive ? 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(styledSvg(barcode, look.color, paperOf(look), 1)) : undefined
  const record: RecentRecord = { v: 1, kind: 'barcode', key: `barcode:${format.id}:${text}`, label: format.label, title, sensitive, omitted: [], savedAt, size: 0 }
  if (thumbnail) record.thumbnail = thumbnail
  record.size = JSON.stringify(details).length + (thumbnail?.length ?? 0)
  return { record, details }
}

/** A barcode's type and text as kept, or null when this site can't make it again. */
export function keptBarcode(details: RecentDetails): { type: BarcodeType; text: string } | null {
  if (details.kind !== 'barcode' || !isBarcodeType(details.type) || typeof details.data !== 'string') return null
  return { type: details.type, text: details.data }
}

const kept = (x: unknown, least: number, most: number): number | null =>
  typeof x === 'number' && !Number.isNaN(x) ? Math.max(least, Math.min(most, Math.round(x))) : null

/**
 * A barcode's settings as kept, taken back as the site takes them: only the known ones of the right
 * kind (sizes kept in range, colours that aren't colours left out), the rest as they are now.
 */
export function barcodeSettings(saved: unknown, current: BarcodeLook): BarcodeLook {
  const look = { ...current }
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return look
  const s = saved as Record<string, unknown>
  if (typeof s.color === 'string' && readColour(s.color)) look.color = s.color
  if (typeof s.background === 'string' && readColour(s.background)) look.background = s.background
  if (typeof s.transparent === 'boolean') look.transparent = s.transparent
  look.scale = kept(s.scale, MIN_SCALE, MAX_SCALE) ?? look.scale
  if (typeof s.showText === 'boolean') look.showText = s.showText
  if (typeof s.allowRectangular === 'boolean') look.allowRectangular = s.allowRectangular
  look.barHeight = kept(s.barHeight, MIN_BAR_HEIGHT, MAX_BAR_HEIGHT) ?? look.barHeight
  if (typeof s.quietZones === 'boolean') look.quietZones = s.quietZones
  return look
}

/** The list's name for a code: its kind and title. */
export const recentName = (r: Pick<RecentRecord, 'label' | 'title'>): string => (r.title.length > 0 ? `${r.label}: ${r.title}` : r.label)

/** "16 KB", "1.5 MB" */
export function sizeText(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.floor(bytes / 1024 + 0.5))} KB`
  return `${formattedFixed(bytes / (1024 * 1024), 1)} MB`
}

const whole = (x: unknown, least: number, most: number): x is number => typeof x === 'number' && x >= least && x <= most && Math.floor(x) === x

/** A record as kept, checked: null when it isn't whole (it's then left out of the list). */
export function readRecord(value: unknown): (RecentRecord & { id: number }) | null {
  if (!value || typeof value !== 'object') return null
  const r = value as Record<string, unknown>
  if (!whole(r.id, 1, Number.MAX_SAFE_INTEGER) || typeof r.key !== 'string' || !whole(r.savedAt, 0, LATEST_TIME)) return null
  if (typeof r.v === 'number' && r.v > 1) return null // a later site's, left as it is
  return {
    id: r.id,
    v: 1,
    kind: r.kind === 'barcode' ? 'barcode' : 'qr',
    key: r.key,
    label: typeof r.label === 'string' ? r.label : 'Text',
    title: typeof r.title === 'string' ? r.title : '',
    sensitive: r.sensitive === true,
    thumbnail: typeof r.thumbnail === 'string' && r.thumbnail.startsWith('data:image/') ? r.thumbnail : undefined,
    omitted: Array.isArray(r.omitted) ? r.omitted.filter((o): o is string => typeof o === 'string') : [],
    savedAt: r.savedAt,
    size: typeof r.size === 'number' && Number.isFinite(r.size) && r.size >= 0 ? r.size : 0
  }
}

/** Newest first; the later id first for the same moment. */
export const newestFirst = <T extends { savedAt: number; id?: number }>(codes: T[]): T[] =>
  [...codes].sort((a, b) => b.savedAt - a.savedAt || (b.id ?? 0) - (a.id ?? 0))
