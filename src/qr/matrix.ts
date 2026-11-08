// Placing a QR code's modules, as the QR standard lays them out: the three finder patterns with
// their separators, the alignment and timing patterns, the always-dark module, the format and
// version information, then the data and error correction bits in their zigzag, masked.
// The grid is indexed [y * size + x]: x is the column, y the row.

import { alignmentCentres, sizeOf, type QrLevel } from './tables'

/** A grid being built: -1 not set yet, 0 light, 1 dark. */
export type Grid = Int8Array

// the two bits each level writes into the format information
const LEVEL_BITS: Record<QrLevel, number> = { L: 1, M: 0, Q: 3, H: 2 }

function bitLength(value: number): number {
  return 32 - Math.clz32(value)
}

// the BCH code of `value` for a generator polynomial: the remainder once value is shifted up by the
// generator's degree
function bch(value: number, poly: number): number {
  const degree = bitLength(poly) - 1
  let v = value << degree
  while (bitLength(v) > degree) v ^= poly << (bitLength(v) - bitLength(poly))
  return v
}

/** The 15 format information bits for a level and mask, masked with 101010000010010. */
export function formatBits(level: QrLevel, mask: number): number {
  const info = (LEVEL_BITS[level] << 3) | mask
  return ((info << 10) | bch(info, 0x537)) ^ 0x5412
}

/** The 18 version information bits (versions 7 and up). */
export function versionBits(version: number): number {
  return (version << 12) | bch(version, 0x1f25)
}

function finder(grid: Grid, size: number, left: number, top: number): void {
  for (let dy = -1; dy <= 7; dy++) {
    for (let dx = -1; dx <= 7; dx++) {
      const x = left + dx
      const y = top + dy
      if (x < 0 || y < 0 || x >= size || y >= size) continue
      // the 7 x 7 pattern (a ring, a gap, a 3 x 3 centre) and its light separator around it
      const inside = dx >= 0 && dx <= 6 && dy >= 0 && dy <= 6
      const ring = dx === 0 || dx === 6 || dy === 0 || dy === 6
      const centre = dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4
      grid[y * size + x] = inside && (ring || centre) ? 1 : 0
    }
  }
}

function alignment(grid: Grid, size: number, cx: number, cy: number): void {
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      grid[(cy + dy) * size + cx + dx] = Math.max(Math.abs(dx), Math.abs(dy)) !== 1 ? 1 : 0
    }
  }
}

/** Whether a mask flips the module at column x, row y. */
export function maskFlips(mask: number, x: number, y: number): boolean {
  switch (mask) {
    case 0:
      return (x + y) % 2 === 0
    case 1:
      return y % 2 === 0
    case 2:
      return x % 3 === 0
    case 3:
      return (x + y) % 3 === 0
    case 4:
      return (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0
    case 5:
      return ((x * y) % 2) + ((x * y) % 3) === 0
    case 6:
      return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0
    default:
      return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0
  }
}

/** The grid with every pattern, the format and version information, but no data yet. */
export function patterns(version: number, level: QrLevel, mask: number): Grid {
  const size = sizeOf(version)
  const grid: Grid = new Int8Array(size * size).fill(-1)
  finder(grid, size, 0, 0)
  finder(grid, size, size - 7, 0)
  finder(grid, size, 0, size - 7)
  grid[(size - 8) * size + 8] = 1 // the always-dark module
  const centres = alignmentCentres(version)
  for (const cy of centres) {
    for (const cx of centres) {
      // none over a finder: their centres would land on one
      if (grid[cy * size + cx] === -1) alignment(grid, size, cx, cy)
    }
  }
  for (let i = 8; i < size - 8; i++) {
    const bit = (i + 1) % 2
    if (grid[6 * size + i] === -1) grid[6 * size + i] = bit
    if (grid[i * size + 6] === -1) grid[i * size + 6] = bit
  }
  // the format information, lowest bit first: down column 8 and along row 8 by the top-left
  // finder, and again under the top-right finder and beside the bottom-left one
  const format = formatBits(level, mask)
  const nearTopLeft = [
    [8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 7], [8, 8],
    [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8]
  ]
  for (let i = 0; i < 15; i++) {
    const bit = (format >> i) & 1
    const [x, y] = nearTopLeft[i]
    grid[y * size + x] = bit
    if (i < 8) grid[8 * size + size - 1 - i] = bit
    else grid[(size - 7 + i - 8) * size + 8] = bit
  }
  if (version >= 7) {
    const bits = versionBits(version)
    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < 3; j++) {
        const bit = (bits >> (i * 3 + j)) & 1
        grid[(size - 11 + j) * size + i] = bit // beside the bottom-left finder
        grid[i * size + size - 11 + j] = bit // above the top-right finder
      }
    }
  }
  return grid
}

/** The whole code: patterns, then the bits (most significant first) placed and masked. */
export function buildGrid(bits: Uint8Array, bitCount: number, version: number, level: QrLevel, mask: number): Grid {
  const size = sizeOf(version)
  const grid = patterns(version, level, mask)
  let at = 0
  let up = true
  for (let right = size - 1; right > 0; right -= 2) {
    if (right === 6) right = 5 // the vertical timing pattern takes column 6
    for (let k = 0; k < size; k++) {
      const y = up ? size - 1 - k : k
      for (let dx = 0; dx < 2; dx++) {
        const x = right - dx
        if (grid[y * size + x] !== -1) continue
        let bit = 0
        if (at < bitCount) {
          bit = (bits[at >> 3] >> (7 - (at & 7))) & 1
          at++
        }
        if (maskFlips(mask, x, y)) bit ^= 1
        grid[y * size + x] = bit
      }
    }
    up = !up
  }
  return grid
}
