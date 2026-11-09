// Reading the codes in pictures, for the Scan tab and the camera: one worker of its own (the scan
// check keeps its own, so a check never waits for a big photo), one picture at a time. A read can be
// stopped at once: the worker is let go of, and the next read starts a new one.

import type { BarcodeFormat } from '../qr/barcodes'
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
    return this.send({ image, kind, invert })
  }

  /**
   * What the scan check reads in a picture (a batch's file read back): a QR code, or a barcode of
   * the type given, its text as the type writes it; null when nothing's read there.
   */
  async check(image: ImageData, format: BarcodeFormat | null = null): Promise<string | null> {
    const codes = await this.send(format ? { image, kind: 'check', formats: [format.readFormat], gs1: format.gs1 } : { image, kind: 'check' })
    const text = codes[0]?.text
    return text === undefined ? null : format ? format.normalizeRead(text) : text
  }

  private send(asked: Omit<ReadRequest, 'id'>): Promise<FoundRead[]> {
    const id = ++this.ticket
    const request: ReadRequest = { ...asked, id }
    const image = asked.image
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

/** The turn a JPEG's camera wrote in its Exif data (1 to 8, 1 for none), from the APP1 segment it's in. */
function exifTurn(b: Uint8Array, from: number, to: number): number {
  const text = (i: number, n: number) => String.fromCharCode(...b.subarray(i, i + n))
  if (to - from < 14 || text(from, 6) !== 'Exif\0\0') return 1
  const tiff = from + 6
  const little = text(tiff, 2) === 'II'
  if (!little && text(tiff, 2) !== 'MM') return 1
  const u16 = (i: number) => (i + 2 <= to ? (little ? b[i] | (b[i + 1] << 8) : (b[i] << 8) | b[i + 1]) : -1)
  const u32 = (i: number) => (i + 4 <= to ? (little ? (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0 : ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0) : -1)
  const ifd = tiff + u32(tiff + 4)
  const count = u16(ifd)
  for (let e = 0; e < count; e++) {
    const entry = ifd + 2 + 12 * e
    if (entry + 12 > to) break
    if (u16(entry) === 0x0112) {
      const turn = u16(entry + 8)
      return turn >= 1 && turn <= 8 ? turn : 1
    }
  }
  return 1
}

/**
 * A picture's size as its file's header says it (PNG, JPEG, GIF, WebP, BMP), without opening it, or
 * null when it doesn't say; for a JPEG, whether its camera turned it a quarter (its width and
 * height are the other way round once it's shown).
 */
export function pictureDimensions(b: Uint8Array): { width: number; height: number; turned: boolean } | null {
  const be16 = (i: number) => (b[i] << 8) | b[i + 1]
  const le16 = (i: number) => b[i] | (b[i + 1] << 8)
  const be32 = (i: number) => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0
  const le32 = (i: number) => (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0
  const text = (i: number, n: number) => String.fromCharCode(...b.subarray(i, i + n))
  const size = (width: number, height: number, turned = false) => ({ width, height, turned })
  if (b.length >= 24 && b[0] === 0x89 && text(1, 3) === 'PNG') return size(be32(16), be32(20))
  if (b.length >= 10 && text(0, 4) === 'GIF8') return size(le16(6), le16(8))
  // (a BMP's header says how big its own next part is: one of the sizes BMPs have, else it's no BMP)
  if (b.length >= 26 && text(0, 2) === 'BM' && [12, 40, 52, 56, 64, 108, 124].includes(le32(14))) {
    if (le32(14) === 12) return size(le16(18), le16(20))
    const view = new DataView(b.buffer, b.byteOffset)
    return size(Math.abs(view.getInt32(18, true)), Math.abs(view.getInt32(22, true)))
  }
  if (b.length >= 30 && text(0, 4) === 'RIFF' && text(8, 4) === 'WEBP') {
    const chunk = text(12, 4)
    if (chunk === 'VP8 ') return size(le16(26) & 0x3fff, le16(28) & 0x3fff)
    if (chunk === 'VP8L') return size(1 + (((b[22] & 0x3f) << 8) | b[21]), 1 + (((b[24] & 0x0f) << 10) | (b[23] << 2) | ((b[22] & 0xc0) >> 6)))
    if (chunk === 'VP8X') return size(1 + (b[24] | (b[25] << 8) | (b[26] << 16)), 1 + (b[27] | (b[28] << 8) | (b[29] << 16)))
    return null
  }
  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8) {
    let turn = 1
    for (let at = 2; at + 9 < b.length; ) {
      if (b[at] !== 0xff) return null
      const marker = b[at + 1]
      if (marker === 0xff) {
        at++
        continue
      }
      // a frame's header (SOF0 to SOF15, but not DHT, JPG or DAC) holds the size
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) return size(be16(at + 7), be16(at + 5), turn >= 5)
      // the camera's turn, in the Exif data before it
      if (marker === 0xe1) turn = exifTurn(b, at + 4, Math.min(b.length, at + 2 + be16(at + 2)))
      at += 2 + be16(at + 2)
    }
  }
  return null
}

/** A picture file as pixels to read (made smaller past the limit), on a canvas for its thumbnails. */
export async function pictureFrom(file: Blob, name = ''): Promise<HTMLCanvasElement> {
  if (file.type === 'application/pdf' || /\.pdf$/i.test(name)) throw new PictureProblem("it's a PDF, so open it and take a screenshot of the code instead")
  // A huge photo is opened straight at the size it's read at: opened whole first, a phone can run
  // out of memory and call it no picture at all. It's turned as its camera says (browsers turn
  // photos whatever they're asked, so the size asked for is the turned one).
  const size = pictureDimensions(new Uint8Array(await file.slice(0, 512 * 1024).arrayBuffer()))
  const huge = size !== null && size.width * size.height > MOST_PICTURE_PIXELS
  let source: ImageBitmap | HTMLImageElement | null = null
  if (size && huge) {
    const k = Math.sqrt(MOST_PICTURE_PIXELS / (size.width * size.height))
    const width = Math.max(1, Math.floor(size.width * k))
    const height = Math.max(1, Math.floor(size.height * k))
    try {
      source = await createImageBitmap(file, { resizeWidth: size.turned ? height : width, resizeHeight: size.turned ? width : height, resizeQuality: 'medium' })
    } catch {
      // (a browser that can't make it smaller as it opens it, or a damaged file: opened as any other)
    }
  }
  if (!source) {
    try {
      source = await createImageBitmap(file)
    } catch {
      // (some browsers make no bitmap of an SVG drawing, or of a HEIC photo they can show)
      try {
        source = await imageElement(file)
      } catch (e) {
        // a file that says it's huge and couldn't be opened either way
        throw huge ? new PictureProblem("it's too big to open") : e
      }
    }
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
