import { Buffer } from 'node:buffer'
import { describe, expect, it } from 'vitest'
import jsQR from 'jsqr'
import qrcode from 'qrcode-generator'
import { buildMatrix, optimalSegments } from './matrix'

/** Decodes a matrix the way a scanner would; returns the raw payload bytes. */
function decode(matrix: boolean[][]): Buffer | null {
  const quiet = 4
  const scale = 4
  const size = (matrix.length + quiet * 2) * scale
  const pixels = new Uint8ClampedArray(size * size * 4).fill(255)
  matrix.forEach((row, r) =>
    row.forEach((dark, c) => {
      if (!dark) return
      for (let y = 0; y < scale; y++) {
        for (let x = 0; x < scale; x++) {
          const i = (((r + quiet) * scale + y) * size + (c + quiet) * scale + x) * 4
          pixels[i] = pixels[i + 1] = pixels[i + 2] = 0
        }
      }
    })
  )
  const result = jsQR(pixels, size, size)
  return result ? Buffer.from(result.binaryData) : null
}

/** The old encoding: one UTF-8 byte segment, smallest version. */
function byteOnlyMatrix(data: string, ec: 'L' | 'M' | 'Q' | 'H'): boolean[][] {
  buildMatrix('x', ec) // installs the UTF-8 byte encoder
  const qr = qrcode(0, ec)
  qr.addData(data, 'Byte')
  qr.make()
  const n = qr.getModuleCount()
  return Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => qr.isDark(r, c)))
}

describe('buildMatrix', () => {
  it('produces a square matrix', () => {
    const { matrix, count } = buildMatrix('hello', 'Q')
    expect(matrix.length).toBe(count)
    for (const row of matrix) expect(row.length).toBe(count)
  })

  it('is deterministic for the same input + EC level', () => {
    const a = buildMatrix('https://example.com', 'M')
    const b = buildMatrix('https://example.com', 'M')
    expect(b.count).toBe(a.count)
    for (let r = 0; r < a.count; r++) {
      for (let c = 0; c < a.count; c++) expect(b.matrix[r][c]).toBe(a.matrix[r][c])
    }
  })

  it('rejects empty input with a helpful error', () => {
    expect(() => buildMatrix('', 'Q')).toThrow(/non-empty/)
  })

  describe('UTF-8 multibyte input', () => {
    const cases = [
      ['Vietnamese', 'Xin chào, thế giới'],
      ['Japanese', 'こんにちは世界'],
      ['Arabic', 'مرحبا بالعالم'],
      ['Emoji', '👋🌍🎉'],
      ['Mixed', 'Hello مرحبا 你好 👋']
    ] as const

    for (const [label, input] of cases) {
      it(`builds a non-empty matrix for ${label}`, () => {
        const { matrix, count } = buildMatrix(input, 'Q')
        expect(count).toBeGreaterThan(0)
        const anyDark = matrix.some((row) => row.some((cell) => cell))
        expect(anyDark).toBe(true)
      })
    }

    it('produces different matrices for input differing only in accent', () => {
      const a = buildMatrix('cafe', 'Q')
      const b = buildMatrix('café', 'Q')
      // Different bytes → different module count or different cells; either is enough.
      const same =
        a.count === b.count &&
        a.matrix.every((row, r) => row.every((cell, c) => cell === b.matrix[r][c]))
      expect(same).toBe(false)
    })
  })

  it('throws a typed error when input exceeds capacity at the chosen EC level', () => {
    const huge = 'x'.repeat(10_000)
    expect(() => buildMatrix(huge, 'H')).toThrow(/Failed to build QR matrix/)
  })

  describe('encoding modes', () => {
    it('packs digits in numeric mode', () => {
      // 40 digits: 33x33 in byte mode, 25x25 in numeric mode.
      expect(buildMatrix('1234567890123456789012345678901234567890', 'Q').count).toBe(25)
    })

    it('packs capitals in alphanumeric mode', () => {
      // 29x29 in byte mode, 25x25 in alphanumeric mode.
      expect(buildMatrix('HTTPS://B0R3D.ORG/SOME/PAGE', 'Q').count).toBe(25)
    })

    it('leaves a typical lowercase URL exactly as before', () => {
      const url = 'https://b0r3d.org/some/page'
      expect(buildMatrix(url, 'Q').matrix).toEqual(byteOnlyMatrix(url, 'Q'))
    })

    it('keeps text with any non-ASCII character in one byte segment', () => {
      const text = 'Order 12345678901234567890 — café'
      expect(buildMatrix(text, 'M').matrix).toEqual(byteOnlyMatrix(text, 'M'))
    })

    it('splits mixed text only where a run pays for its own segment', () => {
      expect(optimalSegments('abc123', 0)).toEqual([{ mode: 'Byte', text: 'abc123' }])
      expect(optimalSegments('0123456789', 0)).toEqual([{ mode: 'Numeric', text: '0123456789' }])
      expect(optimalSegments('id=12345678901234567890', 0)).toEqual([
        { mode: 'Byte', text: 'id=' },
        { mode: 'Numeric', text: '12345678901234567890' }
      ])
    })

    const roundTrips = [
      'https://b0r3d.org/qr-test?a=1&b=two#frag',
      '1234567890123456789012345678901234567890',
      'HTTPS://B0R3D.ORG/SOME/PAGE',
      'Order 12345678901234567890 for ACME-42 / BIN 7',
      'WIFI:T:WPA;S:b0r3d Guest;P:p@ss\\;w0rd\\,1;;',
      'tel:+15555550123',
      'Static QR ✅ no expiry 🎉☕ — ünïcödé 日本語'
    ]
    for (const input of roundTrips) {
      it(`decodes back to the exact bytes: ${JSON.stringify(input)}`, () => {
        for (const ec of ['L', 'M', 'Q', 'H'] as const) {
          const decoded = decode(buildMatrix(input, ec).matrix)
          expect(decoded?.equals(Buffer.from(input, 'utf8')), `EC ${ec}`).toBe(true)
        }
      })
    }
  })

  describe('fixed size (minVersion)', () => {
    it('uses the requested version when the data fits', () => {
      const m = buildMatrix('hi', 'Q', 10)
      expect(m.version).toBe(10)
      expect(m.count).toBe(57)
      expect(decode(m.matrix)?.toString('utf8')).toBe('hi')
    })

    it('grows to the smallest version that fits when the data is too long', () => {
      const long = 'https://b0r3d.org/'.repeat(10)
      const auto = buildMatrix(long, 'Q')
      const fixed = buildMatrix(long, 'Q', 2)
      expect(auto.version).toBeGreaterThan(2)
      expect(fixed.version).toBe(auto.version)
      expect(decode(fixed.matrix)?.toString('utf8')).toBe(long)
    })

    it('treats 0, negative and non-numbers as automatic and caps at 40', () => {
      expect(buildMatrix('hi', 'Q', 0).version).toBe(1)
      expect(buildMatrix('hi', 'Q', -3).version).toBe(1)
      expect(buildMatrix('hi', 'Q', Number.NaN).version).toBe(1)
      expect(buildMatrix('hi', 'L', 99).version).toBe(40)
    })

    it('works across the version-group boundaries', () => {
      for (const v of [9, 10, 26, 27]) {
        const m = buildMatrix('12345 HELLO world', 'M', v)
        expect(m.version).toBe(v)
        expect(decode(m.matrix)?.toString('utf8')).toBe('12345 HELLO world')
      }
    })
  })
})
