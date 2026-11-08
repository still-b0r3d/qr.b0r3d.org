import { describe, expect, it } from 'vitest'
import fixtures from '../test/website-matrices.json'
import { drawGrid, readQr } from '../test/zxing'
import { characterCount, grouped, makeQrCode, maxBytes, QrError } from './code'
import { patterns } from './matrix'
import { correctionCodewords } from './reed-solomon'
import { LEVELS, sizeOf, totalCodewords, type QrLevel } from './tables'

// Codes made by b0r3d QR before this rebuild: today's website ran its encoder over these texts
// (its codes with the UTF-8 marker came from zint), and the PC app's tests carry the same ones.
interface PlainCase {
  text: string
  level: QrLevel
  minVersion: number
  version: number
  segments: string
  modules: string
}
interface MarkedCase {
  text: string
  level: QrLevel
  minVersion: number
  version: number
  mask: number
  modules: string
}

function packed(modules: readonly boolean[]): string {
  const bytes = new Uint8Array(Math.ceil(modules.length / 8))
  modules.forEach((dark, bit) => {
    if (dark) bytes[bit >> 3] |= 0x80 >> (bit & 7)
  })
  return Buffer.from(bytes).toString('base64')
}

const LETTER = { numeric: 'N', alphanumeric: 'A', byte: 'B' } as const

describe('the encoder makes the same codes as before', () => {
  it.each((fixtures.plain as PlainCase[]).map((c) => [c.text.slice(0, 40), c] as const))('%s', (_, c) => {
    const code = makeQrCode(c.text, c.level, c.minVersion, false)
    expect(code.version).toBe(c.version)
    expect(code.segments.map((s) => LETTER[s.mode] + s.text.length).join(' ')).toBe(c.segments)
    expect(packed(code.modules)).toBe(c.modules)
  })

  it.each((fixtures.marked as MarkedCase[]).map((c) => [c.text.slice(0, 40), c] as const))('with the UTF-8 marker: %s', (_, c) => {
    const code = makeQrCode(c.text, c.level, c.minVersion, true)
    expect(code.utf8Marker).toBe(true)
    expect(code.version).toBe(c.version)
    expect(code.mask).toBe(c.mask)
    expect(packed(code.modules)).toBe(c.modules)
  })
})

describe('the tables', () => {
  it('every version has room for exactly its codewords, at every level', () => {
    for (let version = 1; version <= 40; version++) {
      const grid = patterns(version, 'L', 0)
      const free = grid.filter((v) => v === -1).length
      const totals = LEVELS.map((level) => totalCodewords(version, level))
      expect(new Set(totals).size, `version ${version}`).toBe(1)
      expect(Math.floor(free / 8), `version ${version}`).toBe(totals[0])
      expect(free % 8, `version ${version}`).toBeLessThan(8)
    }
  })

  it('Reed-Solomon matches a worked example', () => {
    // version 1-M "01234567" from the QR standard's annex: data codewords and their correction
    const data = [0x10, 0x20, 0x0c, 0x56, 0x61, 0x80, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11]
    expect(Array.from(correctionCodewords(data, 10))).toEqual([0xa5, 0x24, 0xd4, 0xc1, 0xed, 0x36, 0xc7, 0x87, 0x2c, 0x55])
  })
})

describe('every size and level reads back', () => {
  // short capitals and digits fit even version 1 at level H; each version is asked for
  const texts = (version: number) => {
    const out: [number, QrLevel, string][] = []
    for (const level of LEVELS) out.push([version, level, 'B0R3D ' + version + ' ' + level])
    return out
  }
  const cases = Array.from({ length: 40 }, (_, i) => texts(i + 1)).flat()
  it.each(cases)('version %i, level %s', async (version, level, text) => {
    const code = makeQrCode(text, level, version)
    expect(code.version).toBe(version)
    expect(code.size).toBe(sizeOf(version))
    const [read] = await readQr(drawGrid(code.dark, code.size, 2))
    expect(read?.text).toBe(text)
    expect(read?.ecLevel).toBe(level)
  })

  it('a full code reads back', async () => {
    const text = 'b0r3d'.repeat(600).slice(0, maxBytes('L'))
    const code = makeQrCode(text, 'L')
    expect(code.version).toBe(40)
    const [read] = await readQr(drawGrid(code.dark, code.size, 2))
    expect(read?.text).toBe(text)
  })

  it('the UTF-8 marker reads back as ECI', async () => {
    const code = makeQrCode('Héllo wörld ✓', 'Q', 0, true)
    const [read] = await readQr(drawGrid(code.dark, code.size, 3))
    expect(read?.text).toBe('Héllo wörld ✓')
    // (zxing-cpp keeps saying ]Q1 with ECI; it reports the marker here)
    expect(read?.hasECI).toBe(true)
  })
})

describe("what it says when it can't make a code", () => {
  it('asks for some text', () => {
    expect(() => makeQrCode('', 'Q')).toThrow(QrError)
    expect(() => makeQrCode('', 'Q')).toThrow('Type something to make a code.')
  })

  it('says how much one code holds', () => {
    expect(() => makeQrCode('é'.repeat(900), 'Q')).toThrow(
      "Too much for one QR code: 1,800 bytes. At level Q a code holds up to 1,663 bytes of text (more if it's only numbers or capitals), so shorten it or pick a lower error correction level."
    )
    expect(() => makeQrCode('x'.repeat(2954), 'L')).toThrow('so it needs to be shorter.')
  })

  it('leaves the marker out when only that stops the text fitting', () => {
    const text = 'a'.repeat(maxBytes('L'))
    const code = makeQrCode(text, 'L', 0, true)
    expect(code.markerLeftOut).toBe(true)
    expect(code.utf8Marker).toBe(false)
  })

  it('counts characters and groups thousands the same everywhere', () => {
    expect(characterCount('Héllo 😀')).toBe(7)
    expect(grouped(1234567)).toBe('1,234,567')
    expect(grouped(999)).toBe('999')
  })
})
