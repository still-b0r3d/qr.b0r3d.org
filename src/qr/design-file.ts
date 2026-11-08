// Design files (qr-code-config.json), both ways, as b0r3d QR has always written and read them: on
// this site before, and in the PC app. Writing keeps the keys in their order with every key a reader
// expects; reading refuses what was always refused, and takes the usual default for a missing part.
// The browser keeps the last design the same way, without its text (localStorage "qrCodeConfig").

import { isLength, readColour } from './css'
import { copyDesign, DEFAULT_CAPTION, plainDesign, type QrDesign, type QrFrame } from './design'
import { jsonNumber, jsonText, type JsonValue } from './json'
import { roundHalfAway } from './numbers'
import type { QrLevel } from './tables'

export const DESIGN_FILE_NAME = 'qr-code-config.json'
export const SCHEMA = 1
export const NEWER = 'This file was saved by a newer version of b0r3d QR, so it can’t be opened here.'
export const NOT_A_DESIGN = 'That file isn’t a b0r3d QR configuration.'

/** A design file that can't be opened, and why. */
export class DesignFileError extends Error {}

type JsonObject = { [key: string]: JsonValue }

// ---------- writing ----------

function num(n: number): number {
  return Number.isFinite(n) ? n : 0
}

/** "16px" from 16, as the file writes lengths. */
function px(n: number): string {
  return jsonNumber(n) + 'px'
}

function frameObject(f: QrFrame): JsonObject {
  // an emptied length is written as what it draws, since an empty one isn't taken back
  const length = (v: string, drawn: string) => (v ? v : drawn)
  const style: JsonObject = {
    textColor: f.textColor,
    backgroundColor: f.backgroundColor,
    borderColor: f.borderColor,
    borderWidth: length(f.borderWidth, '2px'),
    borderRadius: length(f.borderRadius, '8px'),
    padding: length(f.padding, '12px')
  }
  if (f.fontFamily) style.fontFamily = f.fontFamily
  if (f.backgroundImage) style.backgroundImage = f.backgroundImage
  return { text: f.text ?? '', position: f.position, style, captionWidth: num(f.captionWidth) }
}

/** The design as the file's object; `withData` false leaves the text out (the kept design). */
export function designObject(d: QrDesign, withData = true): JsonObject {
  const file: JsonObject = { schemaVersion: SCHEMA }
  if (d.utf8Marker) file.useEci26 = true
  const props: JsonObject = {}
  if (withData) props.data = d.data ?? ''
  props.image = d.logo ?? ''
  props.width = num(d.width)
  props.height = num(d.height)
  props.margin = num(d.margin)
  props.dotsOptions = { color: d.dotsColor ?? '#000000', type: d.dotsType ?? 'square' }
  props.cornersSquareOptions = { color: d.cornersSquareColor ?? '#000000', type: d.cornersSquareType ?? 'square' }
  props.cornersDotOptions = { color: d.cornersDotColor ?? '#000000', type: d.cornersDotType ?? 'square' }
  const image: JsonObject = { padding: num(d.logoSpace) }
  if (d.logoSize !== null) image.imageSize = num(d.logoSize)
  props.imageOptions = image
  props.qrOptions = { errorCorrectionLevel: d.level, typeNumber: num(d.version) }
  file.props = props
  file.style = { borderRadius: px(d.borderRadius), background: d.background ?? '#ffffff' }
  file.frame = d.frame ? frameObject(d.frame) : null
  return file
}

/** The design file's text, as it's saved; `withData` false leaves the text out. */
export function writeDesign(d: QrDesign, withData = true): string {
  return jsonText(designObject(d, withData)) + '\n'
}

/** The design as the browser keeps it between visits: without its text, on one line. */
export function keptDesign(d: QrDesign): string {
  return JSON.stringify(designObject(d, false))
}

// ---------- reading ----------

function isObject(v: unknown): v is JsonObject {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function obj(map: unknown, key: string): JsonObject | null {
  if (!isObject(map) || !Object.hasOwn(map, key)) return null
  const v = map[key]
  return isObject(v) ? v : null
}

function str(map: unknown, key: string): string | null
function str(map: unknown, key: string, fallback: string): string
function str(map: unknown, key: string, fallback: string | null = null): string | null {
  if (!isObject(map) || !Object.hasOwn(map, key)) return fallback
  const v = map[key]
  return typeof v === 'string' ? v : fallback
}

function has(map: unknown, key: string): boolean {
  return isObject(map) && Object.hasOwn(map, key)
}

// a number the way the PC app reads one from text: digits, a point, a sign and an exponent
function decimal(text: string): number | null {
  const t = text.trim()
  if (/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(t)) return Number(t)
  if (t === 'Infinity' || t === '+Infinity') return Infinity
  if (t === '-Infinity') return -Infinity
  if (t === 'NaN') return NaN
  return null
}

/** A number, or a number in a string; null otherwise (and for NaN or infinity in a string). */
function numberIn(map: unknown, key: string): number | null {
  if (!isObject(map) || !Object.hasOwn(map, key)) return null
  const v = map[key]
  if (typeof v === 'number') return v
  if (typeof v === 'string') {
    const parsed = decimal(v)
    if (parsed !== null && Number.isFinite(parsed)) return parsed
  }
  return null
}

/**
 * What a sum makes of a value: a number as itself, "" or spaces as 0, a number in a string as that
 * number, true and false as 1 and 0, anything else NaN. Null when the key is missing or null (the
 * default applies).
 */
function asNumber(map: unknown, key: string): number | null {
  if (!isObject(map) || !Object.hasOwn(map, key)) return null
  const v = map[key]
  if (v === null) return null
  if (typeof v === 'number') return v
  if (typeof v === 'boolean') return v ? 1 : 0
  if (typeof v === 'string') {
    const s = v.trim()
    if (s.length === 0) return 0
    return decimal(s) ?? NaN
  }
  return NaN
}

function finite(v: number): boolean {
  return Number.isFinite(v)
}

function size(value: number | null): number {
  return value !== null && value > 0 && !Number.isNaN(value) ? Math.min(value, 100000) : 200
}

// "16px" as 16; "" or "px" as 0
function pixels(css: string): number {
  let v = css.trim()
  if (v.toLowerCase().endsWith('px')) v = v.slice(0, -2)
  const n = decimal(v)
  return n !== null && !Number.isNaN(n) ? Math.max(0, n) : 0
}

function level(text: string): QrLevel {
  const t = text.trim()
  if (/^[LMQH]$/.test(t)) return t as QrLevel
  if (/^[+-]?\d+$/.test(t)) {
    const n = Number(t)
    if (n >= 0 && n <= 3) return (['L', 'M', 'Q', 'H'] as const)[n]
  }
  return 'Q'
}

/**
 * A logo a design file may carry: none, a picture as a data: URL, a web address, or a path on the
 * site (no scheme). Any other scheme (javascript:, file:, data:text/...) refuses the file.
 */
export function safeLogo(logo: string): boolean {
  // read the way a browser reads an address: tabs and line breaks anywhere, and control characters
  // and spaces at either end, don't count (so "\u0001javascript:" is still javascript:)
  let s = ''
  for (const ch of logo) {
    const c = ch.charCodeAt(0)
    if (c !== 0x09 && c !== 0x0a && c !== 0x0d) s += ch
  }
  let start = 0
  let end = s.length
  while (start < end && s.charCodeAt(start) <= 0x20) start++
  while (end > start && s.charCodeAt(end - 1) <= 0x20) end--
  const v = s.slice(start, end)
  if (v.length === 0) return true
  if (/^data:image\//i.test(v)) return true
  if (/^https?:\/\//i.test(v)) return true
  return !/^[A-Za-z][A-Za-z0-9+.-]*:/.test(v)
}

const POSITIONS = ['top', 'bottom', 'left', 'right']

// a frame a design file may carry, or null
function readFrame(f: unknown): QrFrame | null {
  if (!isObject(f)) return null
  const text = f.text
  if (typeof text !== 'string') return null
  const position = str(f, 'position')
  if (position === null || !POSITIONS.includes(position)) return null
  const style = obj(f, 'style')
  if (!style) return null
  const textColor = str(style, 'textColor')
  const background = str(style, 'backgroundColor')
  const border = str(style, 'borderColor')
  if (!readColour(textColor) || !readColour(background) || !readColour(border)) return null
  // an empty length is taken here, and draws the default
  const width = str(style, 'borderWidth')
  const radius = str(style, 'borderRadius')
  const padding = str(style, 'padding')
  const lengthOk = (v: string | null) => v !== null && (v.length === 0 || isLength(v))
  if (!lengthOk(width) || !lengthOk(radius) || !lengthOk(padding)) return null
  if (has(style, 'fontFamily') && typeof style.fontFamily !== 'string') return null
  const picture = str(style, 'backgroundImage')
  if (has(style, 'backgroundImage') && (picture === null || !(/^data:image\//i.test(picture) || /^https?:\/\//i.test(picture)))) return null
  // the frame's width (caption + 200) is rounded and kept to 250-800
  const caption = numberIn(f, 'captionWidth')
  const frameWidth = caption !== null && !Number.isNaN(caption) ? roundHalfAway(caption + 200) : 400
  const captionWidth = Math.trunc(Math.max(250, Math.min(800, frameWidth))) - 200
  return {
    text: text.length === 0 ? DEFAULT_CAPTION : text,
    position,
    textColor: textColor as string,
    backgroundColor: background as string,
    borderColor: border as string,
    borderWidth: width as string,
    borderRadius: radius as string,
    padding: padding as string,
    fontFamily: str(style, 'fontFamily'),
    backgroundImage: picture,
    captionWidth
  }
}

/**
 * The design in a file, on top of `current` (whose data stays when the file has none). Throws
 * DesignFileError for a file that can't be opened.
 */
export function readDesign(text: string, current: QrDesign = plainDesign()): QrDesign {
  let file: unknown
  try {
    file = JSON.parse(text)
  } catch {
    throw new DesignFileError(NOT_A_DESIGN)
  }
  if (!isObject(file)) throw new DesignFileError(NOT_A_DESIGN)
  if (has(file, 'schemaVersion') && file.schemaVersion !== null) {
    if (typeof file.schemaVersion !== 'number') throw new DesignFileError(NOT_A_DESIGN)
    if (file.schemaVersion > SCHEMA) throw new DesignFileError(NEWER)
  }
  const eci = has(file, 'useEci26') ? file.useEci26 : null
  if (eci !== null && typeof eci !== 'boolean') throw new DesignFileError(NOT_A_DESIGN)
  const props = obj(file, 'props')
  const style = obj(file, 'style')
  if (!props || !style || typeof style.borderRadius !== 'string') throw new DesignFileError(NOT_A_DESIGN)
  const image = has(props, 'image') ? props.image : null
  const logo = image === null ? '' : typeof image === 'string' ? image : null
  if (logo === null || !safeLogo(logo)) throw new DesignFileError(NOT_A_DESIGN)
  let frame: QrFrame | null = null
  if (has(file, 'frame') && file.frame !== null) {
    frame = readFrame(file.frame)
    if (!frame) throw new DesignFileError(NOT_A_DESIGN)
  }

  const d = copyDesign(current)
  const data = str(props, 'data')
  if (data) d.data = data
  d.logo = logo
  d.width = size(numberIn(props, 'width'))
  d.height = size(numberIn(props, 'height'))
  // an emptied number field is saved as "", which sums take as 0
  const margin = asNumber(props, 'margin')
  d.margin = margin === null ? 4 : finite(margin) ? Math.max(0, Math.min(40, margin)) : 0
  const dots = obj(props, 'dotsOptions')
  d.dotsColor = str(dots, 'color', '#000000')
  d.dotsType = str(dots, 'type', 'square')
  const squares = obj(props, 'cornersSquareOptions')
  d.cornersSquareColor = str(squares, 'color', '#000000')
  d.cornersSquareType = str(squares, 'type', 'extra-rounded')
  const centres = obj(props, 'cornersDotOptions')
  d.cornersDotColor = str(centres, 'color', '#000000')
  d.cornersDotType = str(centres, 'type', 'square')
  const logoOptions = obj(props, 'imageOptions')
  const space = asNumber(logoOptions, 'padding')
  d.logoSpace = space === null ? 1 : finite(space) ? Math.max(0, space) : 0
  const share = asNumber(logoOptions, 'imageSize')
  d.logoSize = share === null || Number.isNaN(share) ? null : Math.max(0, Math.min(1, share))
  const qr = obj(props, 'qrOptions')
  d.level = level(str(qr, 'errorCorrectionLevel', ''))
  const type = numberIn(qr, 'typeNumber')
  d.version = type !== null && Number.isInteger(type) && type >= 0 && type <= 40 ? type : 0
  d.borderRadius = pixels(style.borderRadius)
  d.background = str(style, 'background', '#ffffff')
  d.utf8Marker = eci === true
  d.frame = frame
  return d
}
