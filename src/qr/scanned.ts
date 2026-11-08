// A code a scan found, as b0r3d QR shows it on the Scan tab (the PC app's FoundCode, from its
// Reader): what it is and holds, worded for people, where it was in the picture, and how the Create
// tab makes it again. Also the lines a batch of pictures gets for the ones with no code, and the
// line that sums up a scan.

import { askFor } from './barcode-make'
import { defaultLook } from './barcode-svg'
import { barcodeFormat, forScanned, type BarcodeType } from './barcodes'
import { describeCode, formatName, webLink } from './kinds'
import { roundHalfEven } from './numbers'
import type { QrLevel } from './tables'
import type { FoundRead } from '../scan/protocol'

export interface Box {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export interface ScannedCode {
  readonly text: string
  /** "Link", "Wi-Fi network", "Product number"... ("No code found" for a picture with none) */
  readonly kind: string
  /** "b0r3d.org", "network home, WPA": never a password */
  readonly detail: string
  /** "QR code", "EAN-13"... */
  readonly format: string
  /** "photo.jpg", "the copied picture", the camera's name */
  readonly source: string
  readonly isWebLink: boolean
  /** a plain QR code, or a barcode the Create tab makes and that takes the text */
  readonly canMakeAgain: boolean
  /** the type a barcode is made again as (null for a QR code) */
  readonly barcode: BarcodeType | null
  /** a QR code's error correction, to make it again the same */
  readonly level: QrLevel | null
  /** a picture with no code, or one that couldn't be opened */
  readonly isProblem: boolean
  /** where it was in its picture (its middle), for reading order */
  readonly x: number
  readonly y: number
  /** the part of the picture it takes up, with some room, for its thumbnail */
  readonly box: Box | null
}

/** "QR code · b0r3d.org · photo.png" */
export const summaryOf = (c: Pick<ScannedCode, 'format' | 'detail' | 'source'>): string => [c.format, c.detail, c.source].filter((p) => p.length > 0).join(' · ')

/** What a screen reader calls it: "Link, b0r3d.org" (no password, as in the detail line). */
export const labelOf = (c: Pick<ScannedCode, 'kind' | 'detail'>): string => (c.detail.length > 0 ? `${c.kind}, ${c.detail}` : c.kind)

const GS1_IDS = new Set([']C1', ']d2', ']Q3', ']Q4'])

/**
 * The reader's name and text for a code as the PC app reads them: an EAN-13 that starts with 0 is
 * the UPC-A it stands for, and a UPC-A or UPC-E (which the reader writes out as 13 digits) has its
 * own 12 or 8.
 */
export function readAs(format: string, text: string): { format: string; text: string } {
  if (format === 'EAN13' && /^0[0-9]{12}$/.test(text)) format = 'UPCA'
  if (format === 'UPCA') return { format, text: barcodeFormat('upca').normalizeRead(text) }
  if (format === 'UPCE') return { format, text: barcodeFormat('upce').normalizeRead(text) }
  return { format, text }
}

/** The code as the Scan tab shows it, from what the reader read in a picture `width` × `height`. */
export function scannedCode(read: FoundRead, source: string, width: number, height: number): ScannedCode {
  const id = read.identifier.length > 0 ? read.identifier : null
  const gs1 = id !== null && GS1_IDS.has(id)
  const { format, text } = readAs(read.format, read.text)
  const qr = format.startsWith('QRCode')
  const barcode = qr ? null : makeableAs(format, text, gs1)
  const { kind, detail } = describeCode(text, format)
  const where = cropOf(read.corners, width, height)
  return {
    text,
    kind,
    detail,
    format: formatName(qr ? 'QRCode' : format, text, id),
    source,
    isWebLink: webLink(text) !== null,
    canMakeAgain: qr ? id === null || id === ']Q1' || id === ']Q2' : barcode !== null,
    barcode,
    level: qr && /^[LMQH]$/.test(read.level) ? (read.level as QrLevel) : null,
    isProblem: false,
    x: where.x,
    y: where.y,
    box: where.box
  }
}

/** A picture in a batch that gave no code: "No code found", "Couldn't open"... */
export function problemLine(kind: string, detail: string, source: string): ScannedCode {
  return { text: '', kind, detail, format: '', source, isWebLink: false, canMakeAgain: false, barcode: null, level: null, isProblem: true, x: 0, y: 0, box: null }
}

/** The type the Create tab makes a scanned barcode again as: the first that takes its text as read. */
function makeableAs(format: string, text: string, gs1: boolean): BarcodeType | null {
  for (const type of forScanned(format, text, gs1)) if (!('error' in askFor(type, barcodeFormat(type).normalizeRead(text), defaultLook()))) return type
  return null
}

/**
 * Where a code was: its middle, and the part of the picture round its corners with some room (a
 * barcode read along a line opened up across it), as the PC app crops its thumbnail.
 */
export function cropOf(corners: readonly (readonly [number, number])[], width: number, height: number): { x: number; y: number; box: Box | null } {
  if (corners.length === 0) return { x: 0, y: 0, box: null }
  const xs = corners.map((c) => c[0])
  const ys = corners.map((c) => c[1])
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const span = Math.max(maxX - minX, maxY - minY, 8)
  const line = maxY - minY < span * 0.2 || maxX - minX < span * 0.2
  const along = Math.max(span * 0.3, 12)
  const across = line ? Math.max(span * 0.35, 16) : along
  const wide = maxX - minX >= maxY - minY
  const padX = wide ? along : across
  const padY = wide ? across : along
  const clamp = (v: number, least: number, most: number) => Math.max(least, Math.min(most, v))
  const x0 = clamp(Math.trunc(minX - padX), 0, width - 1)
  const y0 = clamp(Math.trunc(minY - padY), 0, height - 1)
  const x1 = clamp(Math.ceil(maxX + padX), x0 + 1, width)
  const y1 = clamp(Math.ceil(maxY + padY), y0 + 1, height)
  return { x: (minX + maxX) / 2, y: (minY + maxY) / 2, box: { x: x0, y: y0, width: x1 - x0, height: y1 - y0 } }
}

/** Reading order: rows from the top, then left to right. */
export const inReadingOrder = <T extends Pick<ScannedCode, 'x' | 'y'>>(codes: T[]): T[] =>
  codes
    .map((c, i) => ({ c, i, row: roundHalfEven(c.y / 64) }))
    .sort((a, b) => a.row - b.row || a.c.x - b.c.x || a.i - b.i)
    .map((e) => e.c)

/** "1 code", "3 codes" */
export const codeCount = (n: number): string => (n === 1 ? '1 code' : `${n} codes`)

/** What a read of picture files found, in one line, as the PC app sums it up. */
export function filesSummary(files: { name: string; codes: number; problem: string | null }[]): string {
  if (files.length === 1) {
    const f = files[0]
    if (f.problem !== null) return `Couldn't open ${f.name}: ${f.problem}.`
    if (f.codes === 0) return `No code in ${f.name}. If the code is small in the picture, crop closer to it and try again.`
    return `${codeCount(f.codes)} in ${f.name}`
  }
  const codes = files.reduce((n, f) => n + f.codes, 0)
  const withCodes = files.filter((f) => f.codes > 0).length
  const empty = files.filter((f) => f.problem === null && f.codes === 0).length
  const unreadable = files.filter((f) => f.problem !== null).length
  const parts = [`${codeCount(codes)} in ${withCodes} of ${files.length} pictures`]
  if (empty > 0) parts.push(`no code in ${empty}`)
  if (unreadable > 0) parts.push(`${unreadable} couldn't be opened`)
  return parts.join('; ') + '.'
}

/** What a read of one picture without a file name found ("the copied picture"). */
export function pictureSummary(where: string, codes: number, problem: string | null): string {
  if (problem !== null) return `Couldn't read ${where} (${problem}).`
  return codes === 0 ? `No code in ${where}.` : `${codeCount(codes)} in ${where}`
}
