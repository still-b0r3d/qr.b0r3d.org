import { describe, expect, it } from 'vitest'
import { makeBarcode, testReadBarcode } from './create'
import { BARCODE_FORMATS, barcodeFormat } from './formats'

const COLORS = { color: '#000000', background: '#ffffff' }
const OPTIONS = { showText: true, allowRectangular: false }

describe('makeBarcode + testReadBarcode', () => {
  it.each(BARCODE_FORMATS.map((f) => [f.id] as const))(
    '%s: the example encodes and reads back as expected',
    async (id) => {
      const format = barcodeFormat(id)
      const result = await makeBarcode(format.example, id, OPTIONS)
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.svg.startsWith('<svg')).toBe(true)
      const read = await testReadBarcode(result, id, COLORS)
      expect(read).toBe(format.expectedText(format.prepare(format.example)))
    }
  )

  it('encodes Unicode text in 2D codes', async () => {
    const text = 'Grüße 👋 日本語'
    for (const id of ['datamatrix', 'aztec', 'pdf417'] as const) {
      const result = await makeBarcode(text, id, OPTIONS)
      expect(result.ok, id).toBe(true)
      if (result.ok) expect(await testReadBarcode(result, id, COLORS), id).toBe(text)
    }
  })

  it('keeps Data Matrix square unless rectangles are allowed', async () => {
    const square = await makeBarcode('https://b0r3d.org', 'datamatrix', OPTIONS)
    const free = await makeBarcode('https://b0r3d.org', 'datamatrix', {
      ...OPTIONS,
      allowRectangular: true
    })
    expect(square.ok && square.width === square.height).toBe(true)
    expect(free.ok && free.width !== free.height).toBe(true)
  })

  it('adjusts 1D barcode bar height and decodes reliably', async () => {
    const base = await makeBarcode('B0R3D-128', 'code128', OPTIONS)
    const taller = await makeBarcode('B0R3D-128', 'code128', { ...OPTIONS, barHeight: 80 })
    expect(base.ok && taller.ok).toBe(true)
    if (!base.ok || !taller.ok) return
    expect(taller.height).toBe(base.height + 30)
    const read = await testReadBarcode(taller, 'code128', COLORS)
    expect(read).toBe('B0R3D-128')
  })

  it('toggles quiet zones for 1D barcodes', async () => {
    const withMargin = await makeBarcode('B0R3D-128', 'code128', { ...OPTIONS, quietZones: true })
    const noMargin = await makeBarcode('B0R3D-128', 'code128', { ...OPTIONS, quietZones: false })
    expect(withMargin.ok && noMargin.ok).toBe(true)
    if (!withMargin.ok || !noMargin.ok) return
    expect(noMargin.width).toBeLessThan(withMargin.width)
  })

  it('reads light-on-transparent colours the way they would print', async () => {
    const result = await makeBarcode('B0R3D-128', 'code128', OPTIONS)
    if (!result.ok) throw new Error(result.error)
    expect(
      await testReadBarcode(result, 'code128', { color: '#1d4ed8', background: 'transparent' })
    ).toBe('B0R3D-128')
  })

  it('explains input problems instead of encoding them', async () => {
    expect(await makeBarcode('9506000134351', 'ean13', OPTIONS)).toEqual({
      ok: false,
      error: "The check digit (the last digit) should be 2. Leave it off and it's added for you."
    })
    expect(await makeBarcode('(01)123', 'gs1-128', OPTIONS)).toEqual({
      ok: false,
      error: 'Invalid data length for AI (01)'
    })
    const tooLong = await makeBarcode('x'.repeat(4000), 'datamatrix', OPTIONS)
    expect(tooLong.ok).toBe(false)
  })
})
