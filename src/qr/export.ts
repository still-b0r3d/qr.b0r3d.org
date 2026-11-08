// A design's files, sized the way b0r3d QR sizes them: the picture is the design's size (the
// larger of its width and height), and the SVG keeps the drawing's own size.

import type { QrArt } from './art'
import { grouped } from './code'

export interface PictureSize {
  /** Pixels per px of the design. */
  readonly scale: number
  readonly width: number
  readonly height: number
}

/** The PNG's size. */
export function pictureSize(art: QrArt): PictureSize {
  const d = art.design
  const side = Math.max(d.width, d.height)
  const scale = side / art.S
  return { scale, width: Math.floor(art.W * scale + 1e-9), height: Math.floor(art.H * scale + 1e-9) }
}

/**
 * The most pixels drawn in one picture, so a huge one is refused with a reason instead of running
 * out of memory.
 */
export const MOST_PIXELS = 100_000_000

/** Why a picture this size isn't drawn, or null. */
export function tooBig(width: number, height: number): string | null {
  if (width * height <= MOST_PIXELS) return null
  return (
    `That picture would be ${grouped(width)} × ${grouped(height)} pixels, more than b0r3d QR draws at once ` +
    '(100 million). Use a smaller picture size.'
  )
}

type Canvas2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

/** The picture drawn on a canvas `scale` pixels to the design's px; `under` fills it first. */
export function paint(ctx: Canvas2D, art: QrArt, scale: number, width: number, height: number, under?: string): void {
  ctx.save()
  ctx.clearRect(0, 0, width, height)
  if (under) {
    ctx.fillStyle = under
    ctx.fillRect(0, 0, width, height)
  }
  ctx.scale(scale, scale)
  art.draw(ctx)
  ctx.restore()
}

/** The PNG file. */
export async function pngFile(art: QrArt): Promise<Blob> {
  const size = pictureSize(art)
  const problem = tooBig(size.width, size.height)
  if (problem) throw new Error(problem)
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, size.width)
  canvas.height = Math.max(1, size.height)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error("This browser couldn't draw the picture.")
  paint(ctx, art, size.scale, canvas.width, canvas.height)
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("This browser couldn't make the PNG."))), 'image/png')
  )
}

/** The SVG file. */
export function svgFile(art: QrArt): Blob {
  return new Blob([art.toSvg()], { type: 'image/svg+xml' })
}

/**
 * A file name from what's typed in the File name box: the characters Windows, macOS and phones
 * won't take in a name left out, "qr-code" when nothing's left.
 */
export function fileName(typed: string, extension: string): string {
  let name = ''
  for (const ch of typed) {
    const c = ch.charCodeAt(0)
    if (c < 0x20 || c === 0x7f || '\\/:*?"<>|'.includes(ch)) continue
    name += ch
  }
  name = name.trim().replace(/[. ]+$/, '')
  if (name.toLowerCase().endsWith('.' + extension)) name = name.slice(0, -extension.length - 1)
  return (name || 'qr-code') + '.' + extension
}
