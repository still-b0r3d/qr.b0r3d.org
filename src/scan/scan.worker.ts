// The scan worker: reads QR codes in pictures with zxing-wasm (zxing-cpp compiled to WebAssembly),
// off the page's thread, so typing never waits for a check. Its WebAssembly file comes from this
// site, like everything else.

import { prepareZXingModule, readBarcodes } from 'zxing-wasm/reader'
import wasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url'
import type { ReadReply, ReadRequest } from './protocol'

prepareZXingModule({
  overrides: {
    locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? new URL(wasmUrl, self.location.href).href : prefix + path)
  }
})

function reply(message: ReadReply): void {
  self.postMessage(message)
}

self.onmessage = async (e: MessageEvent<ReadRequest>) => {
  const { id, image } = e.data
  try {
    // like a phone camera: no turning light-on-dark codes around, but any angle and a hard look
    const [found] = await readBarcodes(image, {
      formats: ['QRCode'],
      tryHarder: true,
      tryInvert: false,
      maxNumberOfSymbols: 1
    })
    reply({ id, ok: true, text: found ? found.text : null, eci: found ? found.hasECI : false })
  } catch (err) {
    reply({ id, ok: false, error: err instanceof Error ? err.message : String(err) })
  }
}
