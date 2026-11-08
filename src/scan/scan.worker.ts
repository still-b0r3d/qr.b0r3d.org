// The scan worker: reads codes in pictures with zxing-wasm (zxing-cpp compiled to WebAssembly), off
// the page's thread, so typing never waits for a check. Its WebAssembly file comes from this site,
// like everything else.

import { getZXingModule, prepareZXingModule, purgeZXingModule, readBarcodes, type ReaderOptions, type ReadResult } from 'zxing-wasm/reader'
import wasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url'
import type { FoundRead, ReadReply, ReadRequest } from './protocol'

const prepare = () =>
  prepareZXingModule({
    overrides: {
      locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? new URL(wasmUrl, self.location.href).href : prefix + path)
    }
  })
prepare()

/**
 * The reader, loaded once. One that didn't load (no connection on a first visit) is tried again
 * next time: zxing-wasm would otherwise keep the failure for good.
 */
async function loaded(): Promise<boolean> {
  try {
    await getZXingModule()
    return true
  } catch {
    purgeZXingModule()
    prepare()
    return false
  }
}

type Formats = ReaderOptions['formats']

/**
 * What the Scan tab and the camera read, as b0r3d QR for PC reads: QR codes, Data Matrix, Aztec,
 * PDF417 and the common barcodes (no MaxiCode, Micro QR or the rarer kinds of DataBar). Code 39 as
 * plain Code 39: "+A" stays +A, as the PC app reads it, never the "a" of its Full ASCII form.
 */
const EVERYTHING = ['QRCodeModel2', 'DataMatrix', 'Aztec', 'PDF417', 'EAN13', 'EAN8', 'UPCA', 'UPCE', 'Code128', 'Code39Std', 'Code93', 'ITF', 'Codabar', 'DataBarOmni', 'DataBarExp'] as Formats

/** a type's reading name as the reader takes it */
const asked = (format: string): string => (format === 'Code39' ? 'Code39Std' : format)

function found(r: ReadResult, text = r.text): FoundRead {
  const p = r.position
  return {
    format: r.format,
    identifier: r.symbologyIdentifier ?? '',
    contentType: r.contentType,
    text,
    eci: r.hasECI,
    level: r.format.startsWith('QRCode') && /^[LMQH]$/.test(r.ecLevel) ? r.ecLevel : '',
    corners: [p.topLeft, p.topRight, p.bottomRight, p.bottomLeft].map((c) => [c.x, c.y] as const)
  }
}

const samePlace = (a: ReadResult, b: ReadResult): boolean =>
  a.format === b.format && a.position.topLeft.x === b.position.topLeft.x && a.position.topLeft.y === b.position.topLeft.y && a.position.bottomRight.x === b.position.bottomRight.x

const plainContent = (r: ReadResult): boolean => r.contentType === 'Text' || r.contentType === 'GS1'

/**
 * Every code, its text as the PC app shows it: GS1 data in round brackets, anything else exactly as
 * it is (the reader's "human readable" text writes control characters as <GS> and the like, so such
 * codes are read again for their plain text).
 */
async function readEach(image: ImageData, options: ReaderOptions): Promise<FoundRead[]> {
  const results = (await readBarcodes(image, { ...options, textMode: 'HRI' })).filter((r) => r.text.length > 0)
  if (results.every(plainContent)) return results.map((r) => found(r))
  const plain = await readBarcodes(image, { ...options, textMode: 'Plain' })
  return results.map((r) => {
    if (plainContent(r)) return found(r)
    const same = plain.find((p) => samePlace(p, r))
    return found(r, same ? same.text : r.text)
  })
}

function reply(message: ReadReply): void {
  self.postMessage(message)
}

self.onmessage = async (e: MessageEvent<ReadRequest>) => {
  const { id, image, kind } = e.data
  if (!(await loaded())) {
    reply({ id, ok: false, error: "the code reader didn't load", unloaded: true })
    return
  }
  try {
    let codes: FoundRead[]
    if (kind === 'check' && !e.data.formats) {
      // a QR code, like a phone camera: no turning light-on-dark codes around, but any angle and a hard look
      codes = (await readBarcodes(image, { formats: ['QRCode'], tryHarder: true, tryInvert: false, maxNumberOfSymbols: 1 })).map((r) => found(r))
    } else if (kind === 'check') {
      // a barcode, read as the site's reader always has (light on dark too), its text as it's typed
      const formats = (e.data.formats ?? []).map(asked) as Formats
      codes = (await readBarcodes(image, { formats, tryHarder: true, maxNumberOfSymbols: 1, textMode: e.data.gs1 ? 'HRI' : 'Plain' })).map((r) => found(r))
    } else if (kind === 'frame') {
      codes = await readEach(image, { formats: EVERYTHING, tryHarder: true, tryInvert: e.data.invert === true, maxNumberOfSymbols: 1 })
    } else {
      codes = await readEach(image, { formats: EVERYTHING, tryHarder: true, tryRotate: true, tryInvert: true, tryDownscale: true, maxNumberOfSymbols: 255 })
    }
    reply({ id, ok: true, codes })
  } catch (err) {
    reply({ id, ok: false, error: err instanceof Error ? err.message : String(err) })
  }
}
