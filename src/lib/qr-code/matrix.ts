import qrcode from 'qrcode-generator'
import type { ECLevel } from './types'
import { utf8StringToBytes } from './utf8'

let overrideInstalled = false

function ensureUtf8Override(): void {
  if (overrideInstalled) return
  const factory = qrcode as unknown as {
    stringToBytes: (s: string) => number[]
    stringToBytesFuncs?: Record<string, (s: string) => number[]>
  }
  factory.stringToBytes = utf8StringToBytes
  // v1.x exposed `stringToBytesFuncs`; v2.x dropped it. Keep both paths so
  // future SJIS callers still get UTF-8 for Byte mode.
  if (factory.stringToBytesFuncs) {
    factory.stringToBytesFuncs['UTF-8'] = utf8StringToBytes
  }
  overrideInstalled = true
}

export interface QRMatrix {
  matrix: boolean[][]
  count: number
  /** QR version actually used (1-40); the matrix is 17 + 4 * version wide. */
  version: number
  /** How the text was split into encoding modes. */
  segments: Segment[]
}

export const MIN_QR_VERSION = 1
export const MAX_QR_VERSION = 40

export type SegmentMode = 'Numeric' | 'Alphanumeric' | 'Byte'
export interface Segment {
  mode: SegmentMode
  text: string
}

const MODES: SegmentMode[] = ['Byte', 'Alphanumeric', 'Numeric']
const ALPHANUMERIC_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:'

// Width of each mode's character-count field for versions 1-9, 10-26 and
// 27-40 (ISO/IEC 18004 table 3).
const COUNT_BITS: Record<SegmentMode, readonly [number, number, number]> = {
  Numeric: [10, 12, 14],
  Alphanumeric: [9, 11, 13],
  Byte: [8, 16, 16]
}

type VersionGroup = 0 | 1 | 2
const versionGroup = (version: number): VersionGroup => (version <= 9 ? 0 : version <= 26 ? 1 : 2)

function canEncode(mode: SegmentMode, ch: string): boolean {
  if (mode === 'Numeric') return ch >= '0' && ch <= '9'
  if (mode === 'Alphanumeric') return ALPHANUMERIC_CHARS.includes(ch)
  return true
}

/**
 * Splits ASCII text into numeric, alphanumeric and byte segments so the
 * encoded bit stream is as short as possible for the given version group,
 * the same optimisation zint makes. Digits pack at 10 bits per 3 and
 * capitals/digits/` $%*+-./:` at 11 bits per 2, against 8 bits per character
 * in byte mode, but every segment costs a 4-bit mode indicator plus a
 * character count, so only runs long enough to pay for that get their own
 * segment.
 *
 * Dynamic programme over characters in units of 1/6 bit so the per-character
 * costs (20, 33 and 48 sixths) stay integers; a segment's cost is rounded up
 * to whole bits when it ends, which makes the totals exact.
 */
export function optimalSegments(text: string, group: VersionGroup): Segment[] {
  const chars = Array.from(text)
  if (chars.length === 0) return []
  const headCost = (mode: SegmentMode) => (4 + COUNT_BITS[mode][group]) * 6
  const charCost: Record<SegmentMode, number> = { Numeric: 20, Alphanumeric: 33, Byte: 48 }
  const roundUpToBit = (sixths: number) => Math.ceil(sixths / 6) * 6

  // prev[m]: cheapest encoding of the characters so far that leaves mode m
  // open (its header already paid). via[i][m]: the mode character i was
  // encoded in on that cheapest path.
  let prev = MODES.map(headCost)
  const via: (SegmentMode | null)[][] = []
  for (const ch of chars) {
    // Encode this character in the mode that is already open...
    const kept = MODES.map((mode, j) => (canEncode(mode, ch) ? prev[j] + charCost[mode] : Infinity))
    const cur = kept.slice()
    const step = MODES.map((mode, j) => (Number.isFinite(kept[j]) ? mode : null))
    // ...or close that segment after this character and open another mode.
    for (let j = 0; j < MODES.length; j++) {
      for (let k = 0; k < MODES.length; k++) {
        if (!Number.isFinite(kept[k])) continue
        const switched = roundUpToBit(kept[k]) + headCost(MODES[j])
        if (switched < cur[j]) {
          cur[j] = switched
          step[j] = MODES[k]
        }
      }
    }
    via.push(step)
    prev = cur
  }

  // Walk back from the cheapest final state to recover each character's mode.
  let state = MODES[prev.indexOf(Math.min(...prev))]
  const charModes: SegmentMode[] = new Array(chars.length)
  for (let i = chars.length - 1; i >= 0; i--) {
    const mode = via[i][MODES.indexOf(state)] as SegmentMode
    charModes[i] = mode
    state = mode
  }

  const segments: Segment[] = []
  chars.forEach((ch, i) => {
    const last = segments[segments.length - 1]
    if (last && last.mode === charModes[i]) last.text += ch
    else segments.push({ mode: charModes[i], text: ch })
  })
  return segments
}

type QRCodeModel = ReturnType<typeof qrcode>

function makeQR(segments: Segment[], ecLevel: ECLevel, version: number): QRCodeModel {
  const qr = qrcode(version as Parameters<typeof qrcode>[0], ecLevel)
  for (const segment of segments) qr.addData(segment.text, segment.mode)
  qr.make()
  return qr
}

const versionOf = (qr: QRCodeModel) => (qr.getModuleCount() - 17) / 4

/**
 * Builds the QR matrix for `data`.
 *
 * ASCII data is split into numeric/alphanumeric/byte segments (see
 * optimalSegments); text with any non-ASCII character stays a single UTF-8
 * byte segment so readers see the whole string at once when they detect its
 * character set.
 *
 * `minVersion` (1-40) fixes the size: the code uses that version, or the
 * smallest larger one when the data doesn't fit. 0 or undefined picks the
 * smallest version that fits.
 */
export function buildMatrix(data: string, ecLevel: ECLevel, minVersion = 0): QRMatrix {
  if (!data) {
    throw new Error('QR code data must be a non-empty string')
  }
  ensureUtf8Override()
  const min = Number.isFinite(minVersion)
    ? Math.min(MAX_QR_VERSION, Math.max(0, Math.trunc(minVersion)))
    : 0
  const ascii = !Array.from(data).some((ch) => (ch.codePointAt(0) ?? 0) > 0x7f)
  const segmentsFor = (group: VersionGroup): Segment[] =>
    ascii ? optimalSegments(data, group) : [{ mode: 'Byte', text: data }]

  let qr: QRCodeModel | undefined
  let segments: Segment[] = []
  try {
    if (min > 0) {
      try {
        segments = segmentsFor(versionGroup(min))
        qr = makeQR(segments, ecLevel, min)
      } catch {
        // Too much data for the requested version: grow below.
      }
    }
    // Each version group has its own count-field widths, so try the
    // segmentation that is optimal for a group; if the code lands in a bigger
    // group, redo it with that group's segmentation.
    for (let group = versionGroup(Math.max(min, 1)); !qr && group <= 2; group++) {
      const candidateSegments = segmentsFor(group as VersionGroup)
      const candidate = makeQR(candidateSegments, ecLevel, 0)
      if (versionGroup(versionOf(candidate)) <= group || group === 2) {
        qr = candidate
        segments = candidateSegments
      }
    }
  } catch (err) {
    throw new Error(
      `Failed to build QR matrix for input of byte-length ${
        utf8StringToBytes(data).length
      } at EC level ${ecLevel}: ${(err as Error).message ?? err}`
    )
  }
  if (!qr) throw new Error('Failed to build QR matrix')

  const count = qr.getModuleCount()
  const matrix: boolean[][] = []
  for (let r = 0; r < count; r++) {
    const row: boolean[] = []
    for (let c = 0; c < count; c++) row.push(qr.isDark(r, c))
    matrix.push(row)
  }
  return { matrix, count, version: versionOf(qr), segments }
}
