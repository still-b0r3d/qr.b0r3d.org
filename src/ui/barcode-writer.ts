// zint's barcode maker in a worker of its own, one barcode after another, each answered: for the
// Scan tab (does zint make a scanned barcode again?) and batches (every row's barcode). The Create
// tab's barcode keeps its own maker, where only the newest barcode counts.

import type { WriteAsk } from '../qr/barcode-make'
import type { WriteReply, WriteRequest } from '../barcode/protocol'

export class WriterUnavailable extends Error {}

export class BarcodeWriter {
  private worker: Worker | null = null
  private waiting = new Map<number, { resolve: (r: { svg: string | null; error: string | null }) => void; reject: (e: Error) => void }>()
  private ticket = 0

  /** What zint makes of an ask: its SVG, or its error. Rejects when the maker itself didn't load or stopped. */
  write(ask: WriteAsk): Promise<{ svg: string | null; error: string | null }> {
    const id = ++this.ticket
    const request: WriteRequest = { id, ask }
    return new Promise((resolve, reject) => {
      this.waiting.set(id, { resolve, reject })
      this.ensureWorker().postMessage(request)
    })
  }

  /** Lets the worker go when nothing is waiting. */
  release(): void {
    if (this.waiting.size > 0) return
    this.worker?.terminate()
    this.worker = null
  }

  private ensureWorker(): Worker {
    if (this.worker) return this.worker
    const worker = new Worker(new URL('../barcode/write.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (e: MessageEvent<WriteReply>) => {
      const w = this.waiting.get(e.data.id)
      if (!w) return
      this.waiting.delete(e.data.id)
      if (e.data.ok) w.resolve({ svg: e.data.svg, error: e.data.error })
      else w.reject(new WriterUnavailable(e.data.error))
    }
    worker.onerror = (e) => {
      e.preventDefault()
      worker.terminate()
      if (this.worker === worker) this.worker = null
      const all = [...this.waiting.values()]
      this.waiting.clear()
      for (const w of all) w.reject(new WriterUnavailable("the barcode maker didn't load"))
    }
    this.worker = worker
    return worker
  }
}
