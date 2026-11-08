// Reading the codes in pictures, for the Scan tab and the camera: one worker of its own (the scan
// check keeps its own, so a check never waits for a big photo), one picture at a time. A read can be
// stopped at once: the worker is let go of, and the next read starts a new one.

import type { FoundRead, ReadReply, ReadRequest } from '../scan/protocol'

export class ReadStopped extends Error {
  constructor() {
    super('stopped')
  }
}

/** Why a picture couldn't be read, in a few words ("it isn't a picture, or it's damaged"). */
export class PictureProblem extends Error {}

/** The reader itself didn't load (no connection on a first visit): nothing can be read until it does. */
export class ReaderUnavailable extends Error {
  constructor() {
    super("The code reader didn't load, so nothing can be read. Check the connection, then try again.")
  }
}

interface Waiting {
  resolve: (codes: FoundRead[]) => void
  reject: (e: Error) => void
}

export class PictureReader {
  private worker: Worker | null = null
  private waiting = new Map<number, Waiting>()
  private ticket = 0

  /** Every code in a picture ("all"), or the first in a camera's picture ("frame"). The picture's pixels go to the worker. */
  read(image: ImageData, kind: 'all' | 'frame', invert = false): Promise<FoundRead[]> {
    const id = ++this.ticket
    const request: ReadRequest = { id, image, kind, invert }
    return new Promise<FoundRead[]>((resolve, reject) => {
      this.waiting.set(id, { resolve, reject })
      try {
        this.ensureWorker().postMessage(request, [image.data.buffer])
      } catch (e) {
        this.waiting.delete(id)
        reject(e instanceof Error ? e : new Error(String(e)))
      }
    })
  }

  /** Stops every read going on: each one ends with ReadStopped. */
  stop(): void {
    this.worker?.terminate()
    this.worker = null
    this.failAll(new ReadStopped())
  }

  /** Lets the worker go when nothing is being read (its memory stays as big as the biggest picture it read). */
  release(): void {
    if (this.waiting.size > 0) return
    this.worker?.terminate()
    this.worker = null
  }

  private failAll(e: Error): void {
    const all = [...this.waiting.values()]
    this.waiting.clear()
    for (const w of all) w.reject(e)
  }

  private ensureWorker(): Worker {
    if (this.worker) return this.worker
    const worker = new Worker(new URL('../scan/scan.worker.ts', import.meta.url), { type: 'module' })
    let answered = false
    worker.onmessage = (e: MessageEvent<ReadReply>) => {
      answered = true
      const w = this.waiting.get(e.data.id)
      if (!w) return
      this.waiting.delete(e.data.id)
      if (e.data.ok) w.resolve([...e.data.codes])
      else if (e.data.unloaded) w.reject(new ReaderUnavailable())
      // the reader slipping on an odd picture means nothing was found there, as the PC app takes it
      else w.resolve([])
    }
    worker.onerror = (e) => {
      // a worker that never started didn't load; one that stopped mid-read ran out of memory on a
      // huge picture. Either way it's made again next time.
      e.preventDefault()
      worker.terminate()
      if (this.worker === worker) this.worker = null
      this.failAll(answered ? new PictureProblem("it's too big for this browser to read") : new ReaderUnavailable())
    }
    this.worker = worker
    return worker
  }
}

/** The most pixels a picture is read at: bigger ones are made smaller first (phones can't draw much more at once). */
export const MOST_PICTURE_PIXELS = 16_000_000

/** A picture file as pixels to read (made smaller past the limit), on a canvas for its thumbnails. */
export async function pictureFrom(file: Blob, name = ''): Promise<HTMLCanvasElement> {
  if (file.type === 'application/pdf' || /\.pdf$/i.test(name)) throw new PictureProblem("it's a PDF, so open it and take a screenshot of the code instead")
  let source: ImageBitmap | HTMLImageElement
  try {
    source = await createImageBitmap(file)
  } catch {
    // (some browsers make no bitmap of an SVG drawing, or of a HEIC photo they can show)
    source = await imageElement(file)
  }
  const width = source instanceof HTMLImageElement ? source.naturalWidth : source.width
  const height = source instanceof HTMLImageElement ? source.naturalHeight : source.height
  if (width === 0 || height === 0) throw new PictureProblem("it isn't a picture, or it's damaged")
  const k = Math.min(1, Math.sqrt(MOST_PICTURE_PIXELS / (width * height)))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width * k))
  canvas.height = Math.max(1, Math.round(height * k))
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new PictureProblem("it's too big to open")
  // a see-through picture on white, as a code on a page would be
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height)
  if (source instanceof ImageBitmap) source.close()
  return canvas
}

function imageElement(file: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file)
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new PictureProblem(/^image\/(heic|heif|tiff|jxl)$/i.test(file.type) ? "this browser can't open this kind of picture" : "it isn't a picture, or it's damaged"))
    }
    img.src = url
  })
}

/** The pixels of a canvas, to send to the reader. */
export function pixelsOf(canvas: HTMLCanvasElement): ImageData {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new PictureProblem("it's too big to open")
  return ctx.getImageData(0, 0, canvas.width, canvas.height)
}

/** A part of a picture (all of it when none is given) at most 192 pixels across, as a PNG data: URL; pixels stay square-edged. */
export function thumbnailOf(canvas: HTMLCanvasElement, box: { x: number; y: number; width: number; height: number } | null = null): string | undefined {
  const b = box ?? { x: 0, y: 0, width: canvas.width, height: canvas.height }
  const step = Math.max(1, Math.ceil(Math.max(b.width, b.height) / 192))
  const out = document.createElement('canvas')
  out.width = Math.max(1, Math.floor(b.width / step))
  out.height = Math.max(1, Math.floor(b.height / step))
  try {
    const ctx = out.getContext('2d')
    if (!ctx) return undefined
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(canvas, b.x, b.y, out.width * step, out.height * step, 0, 0, out.width, out.height)
    return out.toDataURL('image/png')
  } catch {
    return undefined
  } finally {
    out.width = out.height = 0
  }
}
