/**
 * Making and test-reading barcodes other than QR. Loaded on demand with the
 * barcode view; see ./zxing for where the encoder comes from.
 */
import { rasterizeSvg } from '@/lib/qr-code'
import { barcodeFormat, type BarcodeType } from './formats'
import {
  cleanZintSvg,
  friendlyEncoderError,
  setBarHeight,
  styleBarcodeSvg,
  type BarcodeSvg
} from './svg'
import { readBarcodes, writeBarcode } from './zxing'

export interface BarcodeOptions {
  /** Print the text under 1D barcodes. */
  showText: boolean
  /** Data Matrix only: allow rectangular sizes (narrower, but fewer scanners read them). */
  allowRectangular: boolean
  /** 1D codes: bar height in modules (zint's default is 50). */
  barHeight?: number
  /** Blank margins around the code (default true; always on for ITF-14). */
  quietZones?: boolean
}

export type BarcodeResult = ({ ok: true } & BarcodeSvg) | { ok: false; error: string }

export async function makeBarcode(
  text: string,
  type: BarcodeType,
  options: BarcodeOptions
): Promise<BarcodeResult> {
  const format = barcodeFormat(type)
  const prepared = format.prepare(text)
  const problem = format.check(prepared)
  if (problem) return { ok: false, error: problem }
  const flags = [
    format.gs1 && 'gs1',
    format.writeFormat === 'DataMatrix' && !options.allowRectangular && 'forceSquare'
  ].filter(Boolean)
  const result = await writeBarcode(prepared, {
    format: format.writeFormat as never,
    scale: 1,
    addHRT: format.linear && options.showText,
    addQuietZones: options.quietZones !== false || Boolean(format.keepsQuietZones),
    options: flags.join(',')
  })
  if (result.error) return { ok: false, error: friendlyEncoderError(result.error) }
  const cleaned = cleanZintSvg(result.svg)
  if (format.linear && options.barHeight) {
    return { ok: true, ...setBarHeight(cleaned, options.barHeight) }
  }
  return { ok: true, ...cleaned }
}

/** Pixels per module for the test decode: enough for any reader, quick to draw. */
const CHECK_SCALE = 4

/**
 * Draws the barcode the way a PNG download does and reads it back.
 * Returns the text read in the form `expectedText` uses, or null.
 */
export async function testReadBarcode(
  barcode: BarcodeSvg,
  type: BarcodeType,
  colors: { color: string; background: string }
): Promise<string | null> {
  const format = barcodeFormat(type)
  const svg = styleBarcodeSvg(barcode, { ...colors, scale: CHECK_SCALE })
  const png = await rasterizeSvg({
    svgString: svg,
    width: barcode.width * CHECK_SCALE,
    height: barcode.height * CHECK_SCALE,
    mimeType: 'image/png',
    // A transparent code is read as it would print: on white.
    background: '#ffffff'
  })
  const [read] = await readBarcodes(png, {
    formats: [format.readFormat as never],
    tryHarder: true,
    maxNumberOfSymbols: 1
  })
  if (!read) return null
  return format.normalizeRead ? format.normalizeRead(read.text) : read.text
}
