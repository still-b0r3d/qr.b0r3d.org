// zxing-wasm's reader for the unit tests, run in Node: the same scanner the page uses for its scan
// check, given its WebAssembly file from node_modules.

import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { prepareZXingModule, readBarcodes, type ReadResult } from 'zxing-wasm/reader'

const require = createRequire(import.meta.url)
prepareZXingModule({
  overrides: { wasmBinary: readFileSync(require.resolve('zxing-wasm/reader/zxing_reader.wasm')).buffer as ArrayBuffer }
})

/** RGBA pixels, the shape zxing-wasm reads (an ImageData without the browser). */
export interface Pixels {
  width: number
  height: number
  data: Uint8ClampedArray
}

/** A grid of modules drawn black on white, `scale` pixels each, with a quiet zone. */
export function drawGrid(dark: (row: number, column: number) => boolean, size: number, scale = 3, quiet = 4): Pixels {
  const side = (size + 2 * quiet) * scale
  const data = new Uint8ClampedArray(side * side * 4).fill(255)
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (!dark(r, c)) continue
      for (let y = 0; y < scale; y++) {
        for (let x = 0; x < scale; x++) {
          const at = (((r + quiet) * scale + y) * side + (c + quiet) * scale + x) * 4
          data[at] = data[at + 1] = data[at + 2] = 0
        }
      }
    }
  }
  return { width: side, height: side, data }
}

/** Every QR code zxing-wasm finds in some pixels. */
export async function readQr(pixels: Pixels): Promise<ReadResult[]> {
  return readBarcodes(pixels as unknown as ImageData, { formats: ['QRCode'], tryHarder: true, maxNumberOfSymbols: 1 })
}
