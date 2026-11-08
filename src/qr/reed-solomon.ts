// Reed-Solomon error correction as QR codes use it: arithmetic in GF(256) built on the polynomial
// x^8 + x^4 + x^3 + x^2 + 1, and a block's correction codewords as the remainder of its data
// divided by the generator polynomial (x - a^0)(x - a^1)...(x - a^(n-1)).

const EXP = new Uint8Array(512) // a^i, twice over so a product's index needs no wrapping
const LOG = new Uint8Array(256)
{
  let x = 1
  for (let i = 0; i < 255; i++) {
    EXP[i] = x
    LOG[x] = i
    x <<= 1
    if (x & 0x100) x ^= 0x11d
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255]
}

function multiply(a: number, b: number): number {
  return a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]
}

// generator polynomials by degree, highest power first, kept once made
const generators = new Map<number, Uint8Array>()

function generator(degree: number): Uint8Array {
  const known = generators.get(degree)
  if (known) return known
  let g = new Uint8Array([1])
  for (let i = 0; i < degree; i++) {
    // times (x - a^i), which in GF(256) is (x + a^i)
    const next: Uint8Array<ArrayBuffer> = new Uint8Array(g.length + 1)
    for (let j = 0; j < g.length; j++) {
      next[j] ^= g[j]
      next[j + 1] ^= multiply(g[j], EXP[i])
    }
    g = next
  }
  generators.set(degree, g)
  return g
}

/** The `count` error correction codewords for a block of data codewords. */
export function correctionCodewords(data: ArrayLike<number>, count: number): Uint8Array {
  const g = generator(count)
  const remainder = new Uint8Array(count)
  for (let i = 0; i < data.length; i++) {
    const factor = data[i] ^ remainder[0]
    remainder.copyWithin(0, 1)
    remainder[count - 1] = 0
    if (factor !== 0) for (let j = 0; j < count; j++) remainder[j] ^= multiply(g[j + 1], factor)
  }
  return remainder
}
