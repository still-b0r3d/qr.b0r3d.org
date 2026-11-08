// The scan check: every change is drawn the way it's saved (at its own size, on white paper) and
// read back by a scanner in a worker, the way a phone camera would read the saved file. Only the
// newest design is ever waiting: a check asked for while one runs replaces any other waiting.

import type { QrArt } from '../qr/art'
import { paint } from '../qr/export'
import type { ReadReply, ReadRequest } from '../scan/protocol'

export type CheckResult =
  | { kind: 'ok' }
  | { kind: 'unreadable' }
  | { kind: 'mismatch'; read: string }
  | { kind: 'error' }

export const CHECK_WORDS: Record<CheckResult['kind'] | 'checking', string> = {
  checking: 'Checking that it scans…',
  ok: '✓ Scans. A test decode matches your data exactly.',
  unreadable: "✗ Didn't scan in a test decode. Try more contrast, plainer dots, a smaller logo or more error correction.",
  mismatch: '✗ Scans, but reads as different text: ',
  error: "Couldn't run the scan check."
}

interface Job {
  id: number
  expected: string
  image: ImageData
  done: (result: CheckResult) => void
}

export class ScanChecker {
  private worker: Worker | null = null
  private running: Job | null = null
  private waiting: Job | null = null
  private ticket = 0

  /** Draws and reads a design; `done` is called only if no newer check was asked for since. */
  check(art: QrArt, done: (result: CheckResult) => void): void {
    const id = ++this.ticket
    let image: ImageData
    try {
      image = drawForCheck(art)
    } catch {
      done({ kind: 'error' })
      return
    }
    this.waiting = { id, expected: art.code.text, image, done }
    this.next()
  }

  /** Forgets any check still to come (the code is gone). */
  cancel(): void {
    this.ticket++
    this.waiting = null
  }

  private next(): void {
    if (this.running || !this.waiting) return
    const job = this.waiting
    this.waiting = null
    this.running = job
    const worker = this.ensureWorker()
    const request: ReadRequest = { id: job.id, image: job.image }
    worker.postMessage(request, [job.image.data.buffer])
  }

  private ensureWorker(): Worker {
    if (this.worker) return this.worker
    const worker = new Worker(new URL('../scan/scan.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (e: MessageEvent<ReadReply>) => this.finish(e.data)
    worker.onerror = () => {
      // a worker that failed to start (or crashed) gets made again for the next check
      const job = this.running
      this.worker?.terminate()
      this.worker = null
      this.running = null
      if (job && job.id === this.ticket) job.done({ kind: 'error' })
      this.next()
    }
    this.worker = worker
    return worker
  }

  private finish(reply: ReadReply): void {
    const job = this.running
    this.running = null
    if (job && job.id === reply.id && job.id === this.ticket) {
      if (!reply.ok) job.done({ kind: 'error' })
      else if (reply.text === null) job.done({ kind: 'unreadable' })
      else if (reply.text !== job.expected) job.done({ kind: 'mismatch', read: reply.text })
      else job.done({ kind: 'ok' })
    }
    this.next()
  }
}

// one canvas for every check (an ordinary one: older iPhones have no OffscreenCanvas)
let checkCanvas: HTMLCanvasElement | null = null

/** The design as the scan check reads it: at its own size (at most 1600 px), over white. */
export function drawForCheck(art: QrArt): ImageData {
  const k = Math.min(1, 1600 / Math.max(art.W, art.H))
  const width = Math.max(1, Math.floor(art.W * k))
  const height = Math.max(1, Math.floor(art.H * k))
  checkCanvas ??= document.createElement('canvas')
  checkCanvas.width = width
  checkCanvas.height = height
  const ctx = checkCanvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('no canvas')
  paint(ctx, art, k, width, height, '#ffffff')
  return ctx.getImageData(0, 0, width, height)
}
