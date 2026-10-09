/**
 * QR codes that say their text is UTF-8 (an ECI 26 designator), as
 * ISO/IEC 18004 asks: without one, byte-mode data officially means
 * ISO-8859-1 and readers have to guess. qrcode-generator can't write ECI, so
 * zint (in the zxing-wasm build the other barcode types use) makes the module
 * grid and the usual styling draws it. zint loads only when this is called.
 */
import type { ECLevel } from './types'
import { MAX_QR_VERSION } from './matrix'

export interface EciMatrix {
  matrix: boolean[][]
  count: number
  /** QR version actually used (1-40). */
  version: number
}

async function writeGrid(data: string, ecLevel: ECLevel, version: number): Promise<EciMatrix> {
  const { writeBarcode } = await import('@/lib/barcode/zxing')
  const options = [`ecLevel=${ecLevel}`, 'eci=26', version > 0 && `version=${version}`]
  const result = await writeBarcode(data, {
    format: 'QRCode',
    scale: 1,
    addQuietZones: false,
    options: options.filter(Boolean).join(',')
  })
  if (result.error) throw new Error(result.error)
  const { width, height, data: pixels } = result.symbol
  const matrix: boolean[][] = []
  for (let r = 0; r < height; r++) {
    const row: boolean[] = []
    // One byte per module: 0 is dark.
    for (let c = 0; c < width; c++) row.push(pixels[r * width + c] === 0)
    matrix.push(row)
  }
  return { matrix, count: width, version: (width - 17) / 4 }
}

/**
 * Builds the module grid for `data` with an ECI 26 header. `minVersion`
 * works as in buildMatrix: that version, or the smallest larger one when the
 * data doesn't fit; 0 = the smallest that fits. Pass the error-correction
 * level the code is drawn with (raised for a logo), so the cleared centre
 * stays within what the code can recover.
 */
export async function buildEciMatrix(
  data: string,
  ecLevel: ECLevel,
  minVersion = 0
): Promise<EciMatrix> {
  if (!data) throw new Error('QR code data must be a non-empty string')
  const version = Number.isFinite(minVersion)
    ? Math.min(MAX_QR_VERSION, Math.max(0, Math.trunc(minVersion)))
    : 0
  if (version > 0) {
    try {
      return await writeGrid(data, ecLevel, version)
    } catch {
      // Too much data for that version: let zint pick a larger one below.
    }
  }
  return writeGrid(data, ecLevel, 0)
}
