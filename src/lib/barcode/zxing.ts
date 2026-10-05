/**
 * zxing-wasm: zxing-cpp's reader and zint's writer compiled to WebAssembly.
 * Import this module dynamically (`await import(...)`) so the QR page never
 * downloads it.
 *
 * By default zxing-wasm fetches its .wasm from a CDN; this site serves its
 * own copy instead, so nothing is loaded from another site.
 */
import { prepareZXingModule } from 'zxing-wasm/full'
import wasmUrl from 'zxing-wasm/full/zxing_full.wasm?url'

prepareZXingModule({
  overrides: {
    locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? wasmUrl : prefix + path)
  }
})

export { readBarcodes, writeBarcode } from 'zxing-wasm/full'
export type { ReadResult, ReaderOptions, WriterOptions } from 'zxing-wasm/full'
