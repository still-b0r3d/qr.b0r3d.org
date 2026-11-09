// Making a barcode as b0r3d QR makes it: the type's own checks first, then zint's (through
// zxing-wasm's writer, with the settings below), then zint's drawing, tidied and given its bar
// height. The asking and the tidying are here; the writing itself runs in a worker on the page.

import { barcodeFormat, type BarcodeType } from './barcodes'
import { friendlyError, tidyZintSvg, withBarHeight, type BarcodeLook, type BarcodeSvg } from './barcode-svg'

/** What zxing-wasm's writer is asked to write. */
export interface WriteAsk {
  readonly text: string
  readonly format: string
  readonly options: string
  readonly addHRT: boolean
  readonly addQuietZones: boolean
}

/**
 * Whether a barcode gets its blank margin: always for the 2D codes and ITF-14 (whose box holds it);
 * for the others as "Include quiet zones (margins)" says, the box being shown only for them. (The
 * PC app also took the margin off Data Matrix and PDF417 then; its next version does as here.)
 */
export const withMargin = (type: BarcodeType, look: Pick<BarcodeLook, 'quietZones'>): boolean => {
  const format = barcodeFormat(type)
  return !format.linear || format.keepsQuietZones || look.quietZones
}

/**
 * The type's own checks on what's typed: the tidied text and what to ask zint for, or the message
 * that says what's wrong. Text in UTF-8, GS1 data in round brackets, Data Matrix square unless
 * rectangles are allowed.
 */
export function askFor(type: BarcodeType, text: string, look: Pick<BarcodeLook, 'showText' | 'allowRectangular' | 'quietZones'>): { prepared: string; ask: WriteAsk } | { error: string } {
  const format = barcodeFormat(type)
  const prepared = format.prepare(text)
  const problem = format.check(prepared)
  if (problem !== null) return { error: problem }
  const matrix = type === 'datamatrix' || type === 'gs1-datamatrix'
  const options = [format.gs1 ? 'gs1' : '', matrix && !look.allowRectangular ? 'forceSquare' : ''].filter(Boolean).join(',')
  return {
    prepared,
    ask: {
      text: format.encodeText ? format.encodeText(prepared) : prepared,
      format: format.writeFormat,
      options,
      addHRT: format.linear && look.showText,
      addQuietZones: withMargin(type, look)
    }
  }
}

/** What zint wrote (or its message) as the barcode, tidied and at its bar height. */
export function madeFrom(type: BarcodeType, svg: string | null, error: string | null, barHeight: number): { barcode: BarcodeSvg } | { error: string } {
  if (error || !svg) return { error: friendlyError(error) }
  const tidy = tidyZintSvg(svg)
  return { barcode: barcodeFormat(type).linear ? withBarHeight(tidy, barHeight) : tidy }
}
