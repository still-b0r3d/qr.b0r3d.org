// The barcode worker: zint (in zxing-wasm's writer, compiled to WebAssembly) makes barcodes off the
// page's thread. Its WebAssembly file comes from this site, like everything else, and is only
// fetched once a barcode is made.

import { getZXingModule, prepareZXingModule, purgeZXingModule, writeBarcode } from 'zxing-wasm/writer'
import wasmUrl from 'zxing-wasm/writer/zxing_writer.wasm?url'
import type { WriteReply, WriteRequest } from './protocol'

const prepare = () =>
  prepareZXingModule({
    overrides: {
      locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? new URL(wasmUrl, self.location.href).href : prefix + path)
    }
  })
prepare()

/**
 * The barcode maker, loaded once. One that didn't load (no connection on a first visit) is tried
 * again next time: zxing-wasm would otherwise keep the failure for good.
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

function reply(message: WriteReply): void {
  self.postMessage(message)
}

self.onmessage = async (e: MessageEvent<WriteRequest>) => {
  const { id, ask } = e.data
  if (!(await loaded())) {
    reply({ id, ok: false, error: "the barcode maker didn't load. Check the connection, then try again." })
    return
  }
  try {
    const written = await writeBarcode(ask.text, { format: ask.format as never, options: ask.options, scale: 1, addHRT: ask.addHRT, addQuietZones: ask.addQuietZones })
    reply({ id, ok: true, svg: written.error ? null : written.svg, error: written.error || null })
  } catch (err) {
    reply({ id, ok: false, error: err instanceof Error ? err.message : String(err) })
  }
}
