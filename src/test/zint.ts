// zxing-wasm's barcode maker (zint inside) for the tests, run in Node: the same writer the page's
// barcode worker uses, given its WebAssembly file from node_modules (left alone, zxing-wasm would
// fetch it from a CDN).

import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { prepareZXingModule, writeBarcode } from 'zxing-wasm/writer'

const require = createRequire(import.meta.url)
prepareZXingModule({
  overrides: { wasmBinary: readFileSync(require.resolve('zxing-wasm/writer/zxing_writer.wasm')).buffer as ArrayBuffer }
})

export { writeBarcode }
