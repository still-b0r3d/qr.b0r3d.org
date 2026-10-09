import { describe, expect, it } from 'vitest'
import { readBarcodes } from '@/lib/barcode/zxing'
import { buildEciMatrix } from './eci'
import { buildSvgExportString } from './svg-export'
import { rasterizeSvg } from './render/canvas'
import type { Options } from './legacy-types'

const LOGO =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><rect width="1" height="1"/></svg>'
  )

/** Draws the options the way a PNG export does, and reads the code back. */
async function readBack(options: Options) {
  const svgString = buildSvgExportString({ options, size: { width: 400, height: 400 } })
  const png = await rasterizeSvg({
    svgString,
    width: 400,
    height: 400,
    mimeType: 'image/png',
    background: '#ffffff'
  })
  const [result] = await readBarcodes(png, { formats: ['QRCode'], tryHarder: true })
  return result
}

describe('buildEciMatrix', () => {
  it('marks the text as UTF-8, and the styled export keeps the mark', async () => {
    const text = 'Grüße 😀 日本語 b0r3d'
    const eci = await buildEciMatrix(text, 'M')
    expect(eci.count).toBe(17 + 4 * eci.version)
    const read = await readBack({
      data: text,
      matrix: eci.matrix,
      qrOptions: { errorCorrectionLevel: 'M' }
    })
    expect(read?.text).toBe(text)
    expect(read?.hasECI).toBe(true)
    expect(read?.ecLevel).toBe('M')
  })

  it('without a grid the same code has no mark', async () => {
    const read = await readBack({ data: 'Grüße', qrOptions: { errorCorrectionLevel: 'M' } })
    expect(read?.text).toBe('Grüße')
    expect(read?.hasECI).toBe(false)
  })

  it('stays readable under a logo when built at the level the logo raises it to', async () => {
    const text = 'Grüße aus Minnesota — 世界'
    // A logo raises L to Q (see resolveEffectiveErrorCorrectionLevel).
    const eci = await buildEciMatrix(text, 'Q')
    const read = await readBack({
      data: text,
      matrix: eci.matrix,
      image: LOGO,
      imageOptions: { imageSize: 0.4 },
      qrOptions: { errorCorrectionLevel: 'L' }
    })
    expect(read?.text).toBe(text)
    expect(read?.hasECI).toBe(true)
    expect(read?.ecLevel).toBe('Q')
  })

  it('uses the chosen version, or a larger one when the data does not fit', async () => {
    expect((await buildEciMatrix('b0r3d', 'Q', 7)).version).toBe(7)
    const long = 'https://b0r3d.org/'.repeat(6)
    expect((await buildEciMatrix(long, 'Q', 1)).version).toBeGreaterThan(1)
    expect((await buildEciMatrix('b0r3d', 'Q')).version).toBe(1)
  })
})
