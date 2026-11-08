// The scan check: every change is drawn the way it's saved (at its own size, on white paper) and
// read back by a scanner in a worker, the way a phone camera would read the saved file. Only the
// newest design is ever waiting: a check asked for while one runs replaces any other waiting.

import type { QrArt } from '../qr/art'
import { CHECK_SCALE, type BarcodeArt, type BarcodeLook } from '../qr/barcode-svg'
import type { BarcodeFormat } from '../qr/barcodes'
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

/** A barcode that doesn't scan: what to try is different. */
export const BARCODE_UNREADABLE = "✗ Didn't scan in a test decode. Try more contrast or a larger size."

interface Job {
  id: number
  request: Omit<ReadRequest, 'id'>
  /** what was read (null: nothing) as the check says it */
  judge: (text: string | null) => CheckResult
  done: (result: CheckResult) => void
}

export class ScanChecker {
  private worker: Worker | null = null
  private running: Job | null = null
  private waiting: Job | null = null
  private ticket = 0

  /** Draws and reads a design; `done` is called only if no newer check was asked for since. */
  check(art: QrArt, done: (result: CheckResult) => void): void {
    const expected = art.code.text
    this.ask(() => ({ kind: 'check', image: drawForCheck(art) }), (text) => judged(text, expected), done)
  }

  /**
   * Draws and reads a barcode as b0r3d QR's check does (4 pixels a module, on white), with its own
   * type's reader; what's read is compared in the form the type is typed (GS1 data in brackets).
   */
  checkBarcode(art: BarcodeArt, look: BarcodeLook, format: BarcodeFormat, expected: string, done: (result: CheckResult) => void): void {
    this.ask(
      () => ({ kind: 'check', image: drawBarcodeForCheck(art, look), formats: [format.readFormat], gs1: format.gs1 }),
      (text) => judged(text === null ? null : format.normalizeRead(text), expected),
      done
    )
  }

  /** Forgets any check still to come (the code is gone). */
  cancel(): void {
    this.ticket++
    this.waiting = null
  }

  private ask(draw: () => Omit<ReadRequest, 'id'>, judge: Job['judge'], done: Job['done']): void {
    const id = ++this.ticket
    let request: Omit<ReadRequest, 'id'>
    try {
      request = draw()
    } catch {
      this.waiting = null
      done({ kind: 'error' })
      return
    }
    this.waiting = { id, request, judge, done }
    this.next()
  }

  private next(): void {
    if (this.running || !this.waiting) return
    const job = this.waiting
    this.waiting = null
    this.running = job
    const worker = this.ensureWorker()
    const request: ReadRequest = { ...job.request, id: job.id }
    worker.postMessage(request, [job.request.image.data.buffer])
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
    if (job && job.id === reply.id && job.id === this.ticket) job.done(reply.ok ? job.judge(reply.codes[0]?.text ?? null) : { kind: 'error' })
    this.next()
  }
}

function judged(text: string | null, expected: string): CheckResult {
  if (text === null) return { kind: 'unreadable' }
  return text === expected ? { kind: 'ok' } : { kind: 'mismatch', read: text }
}

// one canvas for every check (an ordinary one: older iPhones have no OffscreenCanvas)
let checkCanvas: HTMLCanvasElement | null = null

function checkContext(width: number, height: number): CanvasRenderingContext2D {
  checkCanvas ??= document.createElement('canvas')
  checkCanvas.width = width
  checkCanvas.height = height
  const ctx = checkCanvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('no canvas')
  return ctx
}

/** The design as the scan check reads it: at its own size (at most 1600 px), over white. */
export function drawForCheck(art: QrArt): ImageData {
  const k = Math.min(1, 1600 / Math.max(art.W, art.H))
  const width = Math.max(1, Math.floor(art.W * k))
  const height = Math.max(1, Math.floor(art.H * k))
  const ctx = checkContext(width, height)
  paint(ctx, art, k, width, height, '#ffffff')
  return ctx.getImageData(0, 0, width, height)
}

/** The most pixels the barcode check draws (a browser can't draw much more at once). */
const MOST_CHECK_PIXELS = 16_000_000

/** A barcode as the check reads it: drawn as a PNG is, 4 pixels a module (fewer for a huge one), on white. */
export function drawBarcodeForCheck(art: BarcodeArt, look: BarcodeLook): ImageData {
  let scale = CHECK_SCALE
  while (scale > 1 && art.W * scale * art.H * scale > MOST_CHECK_PIXELS) scale--
  const width = Math.max(1, Math.round(art.W * scale))
  const height = Math.max(1, Math.round(art.H * scale))
  const ctx = checkContext(width, height)
  art.draw(ctx, scale, look.color, look.transparent ? null : look.background, '#ffffff')
  return ctx.getImageData(0, 0, width, height)
}
