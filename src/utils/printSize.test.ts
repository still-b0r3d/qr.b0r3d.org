import { describe, expect, it } from 'vitest'
import { Buffer } from 'node:buffer'
import sharp from 'sharp'
import {
  checkPrintSettings,
  DEFAULT_PRINT_SETTINGS,
  formatDistance,
  formatSmallLength,
  printGuidance,
  printWidthPx,
  setJpegDpi,
  setPngDpi,
  setSvgPrintSize
} from './printSize'

const settings = (over: Partial<typeof DEFAULT_PRINT_SETTINGS> = {}) => ({
  ...DEFAULT_PRINT_SETTINGS,
  enabled: true,
  ...over
})

describe('pixel maths', () => {
  it('converts a physical width at a DPI to pixels', () => {
    expect(printWidthPx({ width: 40, unit: 'mm', dpi: 300 })).toBe(472)
    expect(printWidthPx({ width: 2, unit: 'in', dpi: 300 })).toBe(600)
    expect(printWidthPx({ width: 25.4, unit: 'mm', dpi: 600 })).toBe(600)
  })

  it('rejects impossible settings', () => {
    expect(checkPrintSettings(settings())).toBeNull()
    expect(checkPrintSettings(settings({ width: 0 }))).toBe('width')
    expect(checkPrintSettings(settings({ width: 2000 }))).toBe('width')
    expect(checkPrintSettings(settings({ dpi: 10 }))).toBe('dpi')
    expect(checkPrintSettings(settings({ width: 900, dpi: 600 }))).toBe('tooLarge')
  })
})

describe('printGuidance', () => {
  it('works out module size and scan distance for a plain code', () => {
    // 200px QR area, 29 modules + 4 + 4 quiet zone, printed 37 mm wide.
    const g = printGuidance(settings({ width: 37 }), { width: 200, height: 200 }, 200, 29, 4)
    expect(g.moduleMm).toBeCloseTo(1, 5)
    expect(g.symbolMm).toBeCloseTo(29, 5)
    expect(g.scanDistanceMm).toBeCloseTo(290, 5)
    expect(g.tooSmall).toBe(false)
    expect(g.widthPx).toBe(437)
    expect(g.heightPx).toBe(437)
  })

  it('accounts for a frame around the code', () => {
    // Export is 250x300 (frame), QR area 200 of it.
    const g = printGuidance(settings({ width: 50 }), { width: 250, height: 300 }, 200, 21, 4)
    expect(g.moduleMm).toBeCloseTo((50 * 200) / 250 / 29, 5)
    expect(g.heightPx).toBe(Math.round((printWidthPx(settings({ width: 50 })) * 300) / 250))
  })

  it('flags modules under 0.4 mm', () => {
    const g = printGuidance(settings({ width: 15 }), { width: 200, height: 200 }, 200, 57, 4)
    expect(g.moduleMm).toBeLessThan(0.4)
    expect(g.tooSmall).toBe(true)
  })

  it('formats lengths for display', () => {
    expect(formatSmallLength(0.4567, 'mm')).toBe('0.46 mm')
    expect(formatSmallLength(25.4, 'in')).toBe('1.000 in')
    expect(formatDistance(345, 'mm')).toBe('35 cm')
    expect(formatDistance(254, 'in')).toBe('10 in')
  })
})

describe('DPI metadata', () => {
  it('writes the DPI into a PNG', async () => {
    const png = await sharp({
      create: { width: 4, height: 4, channels: 3, background: '#fff' }
    })
      .png()
      .toBuffer()
    const out = setPngDpi(new Uint8Array(png), 300)
    const meta = await sharp(Buffer.from(out)).metadata()
    expect(Math.round(meta.density ?? 0)).toBe(300)
    // Replacing keeps exactly one pHYs chunk.
    const again = setPngDpi(out, 600)
    expect(Math.round((await sharp(Buffer.from(again)).metadata()).density ?? 0)).toBe(600)
    expect(Buffer.from(again).toString('latin1').split('pHYs').length - 1).toBe(1)
  })

  it('writes the DPI into a JPEG with or without a JFIF header', async () => {
    const jpg = new Uint8Array(
      await sharp({ create: { width: 4, height: 4, channels: 3, background: '#fff' } })
        .jpeg()
        .toBuffer()
    )
    const withJfif = setJpegDpi(jpg, 300)
    expect((await sharp(Buffer.from(withJfif)).metadata()).density).toBe(300)

    // Drop the APP0 segment to simulate an encoder that doesn't write one.
    const app0Length = (jpg[4] << 8) | jpg[5]
    const bare = new Uint8Array([...jpg.subarray(0, 2), ...jpg.subarray(4 + app0Length)])
    const added = setJpegDpi(bare, 600)
    expect((await sharp(Buffer.from(added)).metadata()).density).toBe(600)
  })

  it('leaves other bytes alone', () => {
    const junk = new Uint8Array([1, 2, 3])
    expect(setPngDpi(junk, 300)).toBe(junk)
    expect(setJpegDpi(junk, 300)).toBe(junk)
  })

  it('sets an SVG root to a physical size keeping its aspect ratio', () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 250 300" width="250" height="300"><rect/></svg>'
    expect(setSvgPrintSize(svg, 50, 'mm')).toBe(
      '<svg width="50mm" height="60mm" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 250 300"><rect/></svg>'
    )
    expect(setSvgPrintSize(svg, 2, 'in')).toContain('width="2in" height="2.4in"')
  })
})
