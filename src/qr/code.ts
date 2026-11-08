// A QR code's grid of modules for some text, made the same way b0r3d QR makes it everywhere.

import { encode, isPlainAscii, type QrSegment } from './encoder'
import type { QrLevel } from './tables'

/** What went wrong making a code, worded for the person typing. */
export class QrError extends Error {}

const utf8 = new TextEncoder()

export interface QrCode {
  readonly text: string
  /** The level it was made at. */
  readonly level: QrLevel
  /** 1-40. */
  readonly version: number
  /** Modules across: 17 + 4 * version. */
  readonly size: number
  /** The smallest version asked for, or 0 for "as small as it goes". */
  readonly askedVersion: number
  /** Starts with ECI 26: "this text is UTF-8". */
  readonly utf8Marker: boolean
  /** The marker was asked for, but there was no room for it. */
  readonly markerLeftOut: boolean
  readonly segments: readonly QrSegment[]
  readonly mask: number
  /** Row by row, true = dark. */
  readonly modules: readonly boolean[]
  /** Whether the module at a row and column is dark. */
  dark(row: number, column: number): boolean
}

/** The most bytes of text one code holds at each level (version 40, all in byte mode). */
export function maxBytes(level: QrLevel): number {
  return level === 'L' ? 2953 : level === 'M' ? 2331 : level === 'Q' ? 1663 : 1273
}

/**
 * The most characters one code holds at each level, all digits (version 40). Plain ASCII text
 * longer than this can't fit whatever it is.
 */
export function maxDigits(level: QrLevel): number {
  return level === 'L' ? 7089 : level === 'M' ? 5596 : level === 'Q' ? 3993 : 3057
}

/** A whole number with commas between thousands, the same on every computer. */
export function grouped(n: number): string {
  return String(Math.trunc(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

function tooMuch(text: string, level: QrLevel): string {
  const bytes = utf8.encode(text).length
  const advice =
    level === 'L' ? 'so it needs to be shorter.' : 'so shorten it or pick a lower error correction level.'
  return (
    `Too much for one QR code: ${grouped(bytes)} bytes. At level ${level} a code holds up to ` +
    `${grouped(maxBytes(level))} bytes of text (more if it's only numbers or capitals), ${advice}`
  )
}

/**
 * The code for some text: `version` 1-40 asks for that size at least (a bigger one when the text
 * doesn't fit), 0 for the smallest that fits; `utf8Marker` starts the code with ECI 26.
 * Throws QrError with a reason when it can't be made.
 */
export function makeQrCode(text: string, level: QrLevel, version = 0, utf8Marker = false): QrCode {
  if (!text) throw new QrError('Type something to make a code.')
  const ascii = isPlainAscii(text)
  // a huge paste is refused at once, before any work on it
  if (ascii ? text.length > maxDigits(level) : utf8.encode(text).length > maxBytes(level)) {
    throw new QrError(tooMuch(text, level))
  }
  const asked = Math.max(0, Math.min(40, Math.trunc(version) || 0))
  let made = encode(text, level, asked, utf8Marker)
  let leftOut = false
  if (made === null && utf8Marker) {
    // the text fits, but not with the marker: it's made without one, and the page says so
    made = encode(text, level, asked, false)
    leftOut = made !== null
  }
  if (made === null) throw new QrError(tooMuch(text, level))
  const { dark, size } = made
  return {
    text,
    level,
    version: made.version,
    size,
    askedVersion: asked,
    utf8Marker: utf8Marker && !leftOut,
    markerLeftOut: leftOut,
    segments: made.segments,
    mask: made.mask,
    modules: dark,
    dark: (row, column) => dark[row * size + column]
  }
}

/** Characters as people count them: code points, so an emoji is one. */
export function characterCount(text: string): number {
  let count = 0
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i)
    if (c >= 0xd800 && c <= 0xdbff && i + 1 < text.length) {
      const d = text.charCodeAt(i + 1)
      if (d >= 0xdc00 && d <= 0xdfff) i++
    }
    count++
  }
  return count
}
