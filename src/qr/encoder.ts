// Turns text into a QR code's modules exactly as b0r3d QR always has (on this website before and
// in the PC app), so the same text, level and size give the same code everywhere:
// - Plain ASCII is split into digit, capital-letter and byte parts, whichever adds up to the fewest
//   bits for the version's size group, ties settled one fixed way; any other character makes the
//   whole text one part of UTF-8 bytes.
// - The version is the smallest that holds it, from the one asked for, if any.
// - Of the eight masks, the one with the lowest score on a scale of crowded modules, 2 x 2 blocks,
//   finder-like runs and the dark share, scored before the format and version information are
//   drawn in.
// Codes with the UTF-8 marker (ECI 26) follow zint's rules instead (marked, below), as they always
// have here.

import { buildGrid, type Grid } from './matrix'
import { correctionCodewords } from './reed-solomon'
import { blocksFor, dataCodewords, sizeOf, type QrLevel } from './tables'

/** One of QR's ways to write characters: digits, capitals (and a few signs), or bytes. */
export type QrMode = 'numeric' | 'alphanumeric' | 'byte'

/** One part of a code's data in one mode. */
export interface QrSegment {
  readonly mode: QrMode
  readonly text: string
}

export interface Encoded {
  /** Modules row by row, true = dark. */
  readonly dark: boolean[]
  readonly version: number
  readonly size: number
  readonly segments: readonly QrSegment[]
  readonly mask: number
}

const NUMERIC = 0
const ALPHANUMERIC = 1
const BYTE = 2
const MODES: readonly QrMode[] = ['numeric', 'alphanumeric', 'byte']
// the bits for each mode's character count in versions 1-9, 10-26 and 27-40
const COUNT_BITS = [
  [10, 12, 14],
  [9, 11, 13],
  [8, 16, 16]
]
// sixths of a bit a character costs in each mode, so 10 bits per 3 digits and 11 per 2 capitals stay whole
const CHAR_SIXTHS = [20, 33, 48]
const ALPHANUMERICS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:'
// the order the modes are tried in, which settles ties
const ORDER = [BYTE, ALPHANUMERIC, NUMERIC]
// zint's order, which settles its ties
const ZINT_ORDER = [NUMERIC, ALPHANUMERIC, BYTE]

const utf8 = new TextEncoder()
const fromUtf8 = new TextDecoder()

function group(version: number): number {
  return version <= 9 ? 0 : version <= 26 ? 1 : 2
}

function canHold(mode: number, c: string): boolean {
  if (mode === BYTE) return true
  if (mode === NUMERIC) return c >= '0' && c <= '9'
  return ALPHANUMERICS.includes(c)
}

/** Whether every character is plain ASCII (U+0000 to U+007F). */
export function isPlainAscii(text: string): boolean {
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) > 0x7f) return false
  return true
}

// ---------- the parts ----------

/**
 * The cheapest split of plain ASCII into parts for a size group: costs in sixths of a bit, each
 * part's rounded up to whole bits when the next part starts. On a tie the open part carries on, a
 * new part prefers to follow a byte part, then capitals, then digits, and the text prefers to end
 * in bytes, then capitals, then digits.
 */
export function split(text: string, sizeGroup: number): QrSegment[] {
  const n = text.length
  const segments: QrSegment[] = []
  if (n === 0) return segments
  const head = (m: number) => (4 + COUNT_BITS[m][sizeGroup]) * 6
  // open[m]: the least it costs to have written the characters so far with mode m's part open
  let open = [0, 0, 0]
  for (const m of ORDER) open[m] = head(m)
  // the mode each character was written in, on each open mode's best path
  const cameFrom = new Uint8Array(n * 3)
  for (let i = 0; i < n; i++) {
    const kept = [0, 0, 0]
    const next = [0, 0, 0]
    const c = text[i]
    for (const m of ORDER) {
      kept[m] = canHold(m, c) ? open[m] + CHAR_SIXTHS[m] : Infinity
      next[m] = kept[m]
      cameFrom[i * 3 + m] = m
    }
    for (const to of ORDER) {
      for (const from of ORDER) {
        if (kept[from] === Infinity) continue
        const switched = Math.floor((kept[from] + 5) / 6) * 6 + head(to)
        if (switched < next[to]) {
          next[to] = switched
          cameFrom[i * 3 + to] = from
        }
      }
    }
    open = next
  }
  let state = ORDER[0]
  for (const m of ORDER) if (open[m] < open[state]) state = m
  const modes = new Uint8Array(n)
  for (let i = n - 1; i >= 0; i--) {
    modes[i] = cameFrom[i * 3 + state]
    state = modes[i]
  }
  let start = 0
  for (let i = 1; i <= n; i++) {
    if (i < n && modes[i] === modes[start]) continue
    segments.push({ mode: MODES[modes[start]], text: text.slice(start, i) })
    start = i
  }
  return segments
}

// ---------- the version ----------

function modeIndex(mode: QrMode): number {
  return mode === 'numeric' ? NUMERIC : mode === 'alphanumeric' ? ALPHANUMERIC : BYTE
}

function lengthOf(s: QrSegment): number {
  return s.mode === 'byte' ? utf8.encode(s.text).length : s.text.length
}

function dataBits(s: QrSegment): number {
  const length = lengthOf(s)
  switch (s.mode) {
    case 'numeric':
      return Math.floor(length / 3) * 10 + (length % 3 === 2 ? 7 : length % 3 === 1 ? 4 : 0)
    case 'alphanumeric':
      return Math.floor(length / 2) * 11 + (length % 2) * 6
    default:
      return length * 8
  }
}

// the bits of the parts in a version (mode, count and data; no terminator)
function bitsFor(segments: readonly QrSegment[], version: number): number {
  let bits = 0
  for (const s of segments) bits += 4 + COUNT_BITS[modeIndex(s.mode)][group(version)] + dataBits(s)
  return bits
}

function fits(segments: readonly QrSegment[], version: number, level: QrLevel): boolean {
  return bitsFor(segments, version) <= dataCodewords(version, level) * 8
}

// The version asked for, if it holds the text; otherwise, size group by size group, the smallest
// version that holds that group's split, kept when it lands in the group (or the last). null when
// nothing holds it.
function chooseVersion(
  text: string,
  level: QrLevel,
  least: number
): { version: number; segments: QrSegment[] } | null {
  const ascii = isPlainAscii(text)
  const forGroup = (g: number): QrSegment[] => (ascii ? split(text, g) : [{ mode: 'byte', text }])
  if (least > 0) {
    const asked = forGroup(group(least))
    if (fits(asked, least, level)) return { version: least, segments: asked }
  }
  for (let g = group(Math.max(least, 1)); g <= 2; g++) {
    const segments = forGroup(g)
    let version = 1
    while (version < 40 && !fits(segments, version, level)) version++
    if (!fits(segments, version, level)) return null // too much even for version 40
    if (group(version) <= g || g === 2) return { version, segments }
  }
  return null
}

// ---------- the bits ----------

class Bits {
  bytes = new Uint8Array(64)
  length = 0

  add(value: number, count: number): void {
    for (let i = count - 1; i >= 0; i--) {
      if (this.length >> 3 >= this.bytes.length) {
        const grown = new Uint8Array(this.bytes.length * 2)
        grown.set(this.bytes)
        this.bytes = grown
      }
      if ((value >> i) & 1) this.bytes[this.length >> 3] |= 0x80 >> (this.length & 7)
      this.length++
    }
  }
}

function dataStream(segments: readonly QrSegment[], version: number, level: QrLevel, eci: boolean): Uint8Array {
  const bits = new Bits()
  if (eci) {
    bits.add(0x7, 4) // ECI
    bits.add(26, 8) // UTF-8
  }
  for (const s of segments) {
    const m = modeIndex(s.mode)
    bits.add(m === NUMERIC ? 1 : m === ALPHANUMERIC ? 2 : 4, 4)
    bits.add(lengthOf(s), COUNT_BITS[m][group(version)])
    if (m === NUMERIC) {
      for (let i = 0; i < s.text.length; i += 3) {
        const digits = Math.min(3, s.text.length - i)
        bits.add(Number(s.text.slice(i, i + digits)), digits === 3 ? 10 : digits === 2 ? 7 : 4)
      }
    } else if (m === ALPHANUMERIC) {
      for (let i = 0; i < s.text.length; i += 2) {
        const first = ALPHANUMERICS.indexOf(s.text[i])
        if (i + 1 < s.text.length) bits.add(first * 45 + ALPHANUMERICS.indexOf(s.text[i + 1]), 11)
        else bits.add(first, 6)
      }
    } else {
      for (const b of utf8.encode(s.text)) bits.add(b, 8)
    }
  }
  const capacity = dataCodewords(version, level) * 8
  if (bits.length + 4 <= capacity) bits.add(0, 4) // the terminator, when all of it fits
  while (bits.length % 8 !== 0) bits.add(0, 1)
  for (let pad = 0; bits.length < capacity; pad++) bits.add(pad % 2 === 0 ? 0xec : 0x11, 8)
  return bits.bytes.slice(0, capacity / 8)
}

// the data split into the version's blocks, each with its error correction, interleaved
function interleave(data: Uint8Array, version: number, level: QrLevel): Uint8Array {
  const { ecPerBlock, groups } = blocksFor(version, level)
  const dataBlocks: Uint8Array[] = []
  const ecBlocks: Uint8Array[] = []
  let at = 0
  for (const g of groups) {
    for (let k = 0; k < g.count; k++) {
      const block = data.subarray(at, at + g.data)
      at += g.data
      dataBlocks.push(block)
      ecBlocks.push(correctionCodewords(block, ecPerBlock))
    }
  }
  const out: number[] = []
  const longest = Math.max(...dataBlocks.map((d) => d.length))
  for (let i = 0; i < longest; i++) for (const d of dataBlocks) if (i < d.length) out.push(d[i])
  for (let i = 0; i < ecPerBlock; i++) for (const e of ecBlocks) out.push(e[i])
  return Uint8Array.from(out)
}

// ---------- the modules ----------

function finished(final: Uint8Array, version: number, level: QrLevel, mask: number, segments: QrSegment[]): Encoded {
  const grid = buildGrid(final, final.length * 8, version, level, mask)
  const dark = Array.from(grid, (v) => v === 1)
  return { dark, version, size: sizeOf(version), segments, mask }
}

/**
 * The code for some text at a level: `leastVersion` 1-40 asks for that size at least, 0 for the
 * smallest that fits; `eci` starts it with the UTF-8 marker. null when it doesn't fit.
 */
export function encode(text: string, level: QrLevel, leastVersion: number, eci: boolean): Encoded | null {
  if (eci) return marked(text, level, leastVersion)
  const chosen = chooseVersion(text, level, leastVersion)
  if (!chosen) return null
  const { version, segments } = chosen
  const final = interleave(dataStream(segments, version, level, false), version, level)
  let best = 0
  let lowest = 0
  for (let mask = 0; mask < 8; mask++) {
    const trial = buildGrid(final, final.length * 8, version, level, mask)
    blank(trial, version)
    const score = websiteScore(trial, sizeOf(version))
    if (mask === 0 || score < lowest) {
      lowest = score
      best = mask
    }
  }
  return finished(final, version, level, best, segments)
}

// The format information, the version information and the always-dark module are left light
// while the masks are scored.
function blank(m: Grid, version: number): void {
  const n = sizeOf(version)
  const at = (x: number, y: number) => y * n + x
  for (let i = 0; i <= 8; i++) {
    if (i !== 6) {
      m[at(i, 8)] = 0 // row 8, the first copy's columns
      m[at(8, i)] = 0 // column 8, the first copy's rows
    }
  }
  for (let i = 0; i < 8; i++) m[at(n - 1 - i, 8)] = 0 // row 8, the second copy
  for (let i = 0; i < 7; i++) m[at(8, n - 1 - i)] = 0 // column 8, the second copy
  m[at(8, n - 8)] = 0 // the dark module
  if (version >= 7) {
    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < 3; j++) {
        m[at(n - 11 + j, i)] = 0
        m[at(i, n - 11 + j)] = 0
      }
    }
  }
}

// The mask score b0r3d QR has always used for codes without the marker: crowded modules, 2 x 2
// blocks of one colour, finder-like runs, and how far the dark share is from half.
function websiteScore(m: Grid, n: number): number {
  const dark = (x: number, y: number) => m[y * n + x] === 1
  let points = 0
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const here = dark(x, y)
      let same = 0
      for (let dy = -1; dy <= 1; dy++) {
        if (y + dy < 0 || y + dy >= n) continue
        for (let dx = -1; dx <= 1; dx++) {
          if (x + dx < 0 || x + dx >= n || (dx === 0 && dy === 0)) continue
          if (dark(x + dx, y + dy) === here) same++
        }
      }
      if (same > 5) points += 3 + same - 5
    }
  }
  for (let y = 0; y < n - 1; y++) {
    for (let x = 0; x < n - 1; x++) {
      const count = m[y * n + x] + m[y * n + x + 1] + m[(y + 1) * n + x] + m[(y + 1) * n + x + 1]
      if (count === 0 || count === 4) points += 3
    }
  }
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n - 6; x++) {
      if (dark(x, y) && !dark(x + 1, y) && dark(x + 2, y) && dark(x + 3, y) && dark(x + 4, y) && !dark(x + 5, y) && dark(x + 6, y)) points += 40
    }
  }
  for (let x = 0; x < n; x++) {
    for (let y = 0; y < n - 6; y++) {
      if (dark(x, y) && !dark(x, y + 1) && dark(x, y + 2) && dark(x, y + 3) && dark(x, y + 4) && !dark(x, y + 5) && dark(x, y + 6)) points += 40
    }
  }
  let darkCount = 0
  for (let i = 0; i < n * n; i++) if (m[i] === 1) darkCount++
  const ratio = Math.abs((100 * darkCount) / n / n - 50) / 5
  return points + ratio * 10
}

// ---------- codes with the UTF-8 marker, made by zint's rules ----------

/**
 * A code with the UTF-8 marker, as zint makes it:
 * - the text's UTF-8 bytes split into digit, capital-letter and byte parts by zint's costs;
 * - the smallest version that holds version 40's split, then smaller ones while their own split
 *   still fits; a version asked for is used when it's at least that big;
 * - the mask ISO 18004 scores lowest on the finished code, format and version information
 *   included, as zint counts it; ties go to the lower mask.
 */
function marked(text: string, level: QrLevel, least: number): Encoded | null {
  const data = utf8.encode(text)
  if (data.length === 0) return null
  let modes = zintModes(data, 40)
  let bits = zintBits(data, modes, 40)
  if (bits > dataCodewords(40, level) * 8) return null
  let version = 1
  while (dataCodewords(version, level) * 8 < bits) version++
  if (version !== 40) {
    const own = zintModes(data, version)
    const ownBits = zintBits(data, own, version)
    if (ownBits <= bits) {
      // zint keeps version 40's split if its own came out longer
      modes = own
      bits = ownBits
    }
  }
  while (version > 1) {
    const smaller = zintModes(data, version - 1)
    const smallerBits = zintBits(data, smaller, version - 1)
    if (dataCodewords(version - 1, level) * 8 < smallerBits) break
    version--
    modes = smaller
  }
  if (least > version) {
    version = least
    modes = zintModes(data, least)
  }

  const segments: QrSegment[] = []
  for (let start = 0, i = 1; i <= data.length; i++) {
    if (i < data.length && modes[i] === modes[start]) continue
    // a part only ever starts or ends beside a digit or capital, so it holds whole characters
    segments.push({ mode: MODES[modes[start]], text: fromUtf8.decode(data.subarray(start, i)) })
    start = i
  }
  const final = interleave(dataStream(segments, version, level, true), version, level)
  let best = 0
  let lowest = 0
  for (let mask = 0; mask < 8; mask++) {
    const trial = buildGrid(final, final.length * 8, version, level, mask)
    const score = isoScore(trial, sizeOf(version))
    if (mask === 0 || score < lowest) {
      lowest = score
      best = mask
    }
  }
  return finished(final, version, level, best, segments)
}

function isDigit(b: number): boolean {
  return b >= 0x30 && b <= 0x39
}

function isCapital(b: number): boolean {
  return b < 0x80 && ALPHANUMERICS.includes(String.fromCharCode(b))
}

/**
 * zint's split of the bytes into modes for a version's size group, cheapest first, in sixths of a
 * bit: digits in threes from the start of a run (20 each in a three, 21 in a pair, 24 alone),
 * capitals in pairs (33 each, 36 alone or for the very last byte), bytes 48, and a new part its
 * header, with no rounding to whole bits. A tie keeps the open part; the text prefers to end in
 * digits, then capitals, then bytes.
 */
export function zintModes(data: Uint8Array, version: number): Uint8Array {
  const n = data.length
  const g = group(version)
  const head = (m: number) => (4 + COUNT_BITS[m][g]) * 6
  let open = [0, 0, 0]
  for (const m of ZINT_ORDER) open[m] = head(m)
  const cameFrom = new Uint8Array(n * 3)
  let digitsEnd = 0
  let digitCost = 0
  let capitalsEnd = 0
  let capitalCost = 0
  for (let i = 0; i < n; i++) {
    const next = [0, 0, 0]
    const possible = [false, false, false]
    const last = i + 1 === n

    if (i < digitsEnd) possible[NUMERIC] = true
    else {
      let count = 0
      while (count < 3 && i + count < n && isDigit(data[i + count])) count++
      digitsEnd = count === 0 ? 0 : i + count
      digitCost = count === 1 ? 24 : count === 2 ? 21 : 20
      possible[NUMERIC] = count > 0
    }
    if (i < capitalsEnd) {
      capitalCost = last ? 36 : 33
      possible[ALPHANUMERIC] = true
    } else if (!isCapital(data[i])) capitalsEnd = 0
    else {
      const pair = !last && isCapital(data[i + 1])
      capitalsEnd = pair ? i + 2 : i + 1
      capitalCost = pair ? 33 : 36
      possible[ALPHANUMERIC] = true
    }
    possible[BYTE] = true

    if (possible[NUMERIC]) next[NUMERIC] = open[NUMERIC] + digitCost
    if (possible[ALPHANUMERIC]) next[ALPHANUMERIC] = open[ALPHANUMERIC] + capitalCost
    next[BYTE] = open[BYTE] + 48
    for (let m = 0; m < 3; m++) cameFrom[i * 3 + m] = m
    for (const to of ZINT_ORDER) {
      for (const from of ZINT_ORDER) {
        if (to === from || !possible[from]) continue
        const switched = next[from] + head(to)
        if (!possible[to] || switched < next[to]) {
          next[to] = switched
          cameFrom[i * 3 + to] = from
          possible[to] = true
        }
      }
    }
    open = next
  }
  let state = ZINT_ORDER[0]
  for (const m of ZINT_ORDER) if (open[m] < open[state]) state = m
  const modes = new Uint8Array(n)
  for (let i = n - 1; i >= 0; i--) {
    modes[i] = cameFrom[i * 3 + state]
    state = modes[i]
  }
  return modes
}

// the bits of the marker and the parts in a version (no terminator)
function zintBits(data: Uint8Array, modes: Uint8Array, version: number): number {
  let bits = 12
  const g = group(version)
  for (let start = 0, i = 1; i <= data.length; i++) {
    if (i < data.length && modes[i] === modes[start]) continue
    const length = i - start
    bits += 4 + COUNT_BITS[modes[start]][g]
    switch (modes[start]) {
      case NUMERIC:
        bits += Math.floor(length / 3) * 10 + (length % 3 === 2 ? 7 : length % 3 === 1 ? 4 : 0)
        break
      case ALPHANUMERIC:
        bits += Math.floor(length / 2) * 11 + (length % 2) * 6
        break
      default:
        bits += length * 8
    }
    start = i
  }
  return bits
}

/**
 * ISO 18004's mask score, as zint counts it on the finished code: runs of five or more of one
 * colour along the rows and columns (3, and 1 more for each module past five), 2 x 2 blocks of one
 * colour (3 each), dark-light-dark-dark-dark-light-dark with four light modules (or the edge)
 * before or after it (40 each; the search goes on 4 modules further on), and 10 for each whole 5 %
 * the dark modules are off half.
 */
export function isoScore(m: Grid, n: number): number {
  let points = 0
  let dark = 0
  for (let line = 0; line < n; line++) {
    for (let across = 0; across < 2; across++) {
      let run = 0
      let colour = 2
      for (let i = 0; i < n; i++) {
        const here = across === 0 ? m[line * n + i] : m[i * n + line]
        if (across === 0 && here === 1) dark++
        if (here === colour) run++
        else {
          if (run >= 5) points += run - 2
          run = 1
          colour = here
        }
      }
      if (run >= 5) points += run - 2
    }
  }
  for (let x = 0; x < n - 1; x++) {
    for (let y = 0; y < n - 1; y++) {
      const k = m[y * n + x]
      if (k === m[y * n + x + 1] && k === m[(y + 1) * n + x] && k === m[(y + 1) * n + x + 1]) points += 3
    }
  }
  for (let line = 0; line < n; line++) {
    for (let across = 0; across < 2; across++) {
      const d = (i: number) => (across === 0 ? m[line * n + i] : m[i * n + line]) === 1
      for (let i = 0; i <= n - 7; i++) {
        if (!(d(i) && !d(i + 1) && d(i + 2) && d(i + 3) && d(i + 4) && !d(i + 5) && d(i + 6))) continue
        if (light(d, i - 1, -1, n) || light(d, i + 7, 1, n)) points += 40
        i += 3
      }
    }
  }
  points += 10 * Math.floor((10 * Math.abs(2 * dark - n * n)) / (n * n))
  return points
}

// four light modules from `from` going `step`, the edge counting as light
function light(dark: (i: number) => boolean, from: number, step: number, n: number): boolean {
  for (let k = 0, i = from; k < 4; k++, i += step) {
    if (i < 0 || i >= n) return true
    if (dark(i)) return false
  }
  return true
}
