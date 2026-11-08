// Barcodes made in a worker (zint, in zxing-wasm's writer). Only the newest barcode asked for is
// ever answered: one asked for while another is being made replaces any other waiting.

import { askFor, madeFrom } from '../qr/barcode-make'
import type { BarcodeLook, BarcodeSvg } from '../qr/barcode-svg'
import type { BarcodeType } from '../qr/barcodes'
import type { WriteReply, WriteRequest } from '../barcode/protocol'

/** The barcode, or what's wrong: with the data, or (`broken`) with the barcode maker itself. */
export type Made = { prepared: string; barcode: BarcodeSvg } | { error: string; broken?: boolean }

interface Job {
  id: number
  request: WriteRequest
  type: BarcodeType
  prepared: string
  barHeight: number
  done: (made: Made) => void
}

export class BarcodeMaker {
  private worker: Worker | null = null
  private running: Job | null = null
  private waiting: Job | null = null
  private ticket = 0

  /** The barcode for what's typed; `done` is called only if nothing newer was asked for since. */
  make(type: BarcodeType, text: string, look: BarcodeLook, done: (made: Made) => void): void {
    const id = ++this.ticket
    const asked = askFor(type, text, look)
    if ('error' in asked) {
      this.waiting = null
      done(asked)
      return
    }
    this.waiting = { id, request: { id, ask: asked.ask }, type, prepared: asked.prepared, barHeight: look.barHeight, done }
    this.next()
  }

  /** Forgets any barcode still to come. */
  cancel(): void {
    this.ticket++
    this.waiting = null
  }

  private next(): void {
    if (this.running || !this.waiting) return
    const job = this.waiting
    this.waiting = null
    this.running = job
    this.ensureWorker().postMessage(job.request)
  }

  private ensureWorker(): Worker {
    if (this.worker) return this.worker
    const worker = new Worker(new URL('../barcode/write.worker.ts', import.meta.url), { type: 'module' })
    let answered = false
    worker.onmessage = (e: MessageEvent<WriteReply>) => {
      answered = true
      this.finish(e.data)
    }
    worker.onerror = (e) => {
      // a worker that failed to load (no connection on a first visit) or crashed gets made again
      // for the next barcode
      e.preventDefault()
      const job = this.running
      this.worker?.terminate()
      this.worker = null
      this.running = null
      const why = answered ? 'the browser stopped the barcode maker. Try again.' : "the barcode maker didn't load. Check the connection, then try again."
      if (job && job.id === this.ticket) job.done({ error: `Couldn't make the barcode: ${why}`, broken: true })
      this.next()
    }
    this.worker = worker
    return worker
  }

  private finish(reply: WriteReply): void {
    const job = this.running
    this.running = null
    if (job && job.id === reply.id && job.id === this.ticket) {
      const made = reply.ok ? madeFrom(job.type, reply.svg, reply.error, job.barHeight) : { error: `Couldn't make the barcode: ${reply.error}`, broken: true }
      job.done('error' in made ? made : { prepared: job.prepared, barcode: made.barcode })
    }
    this.next()
  }
}
