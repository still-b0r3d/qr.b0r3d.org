// A design's files, sized as b0r3d QR sizes them: PNG, JPG and PDF at the design's size (with whole
// pixels per module if asked) or the print size, the SVG at the drawing's own size or the print
// size's lengths, and the code as text. With a frame, the pictures are sized from the frame as the
// page lays its caption out in a column, grown to the design's width. Pictures carry their
// resolution, as the PC app's do: the print size's, else 96 DPI.

import { paintStyle, previewLines, type Canvas2D, type Measure, type QrArt } from './art'
import { grouped, makeQrCode } from './code'
import { lengthPixels } from './css'
import { DEFAULT_CAPTION, besideCode, isTransparent, type QrDesign } from './design'
import { roundHalfAway, roundTo } from './numbers'
import { makePdf, POINTS_PER_INCH } from './pdf'
import { inches, printApplies, printLength, printPixelWidth, withDpi, type PrintSize } from './print'
import type { QrLevel } from './tables'

export interface PictureSize {
  /** Pixels per px of the design. */
  readonly scale: number
  readonly width: number
  readonly height: number
  /** the resolution the picture carries */
  readonly dpi: number
}

/** How the files come out besides the design: a print size (when on), and whole pixels per module. */
export interface Output {
  print: PrintSize | null
  wholePixels: boolean
}

export const screenOutput = (): Output => ({ print: null, wholePixels: false })

/**
 * The PNG, JPG and clipboard size: the print size when it applies; else the design's (whole pixels
 * per module if asked), or with a frame, the frame's as the page shows it.
 */
export function pictureSize(art: QrArt, measure: Measure, output: Output = screenOutput()): PictureSize {
  const print = output.print
  if (printApplies(print)) {
    const w = printPixelWidth(print)
    return { scale: w / art.W, width: w, height: roundHalfAway((w * art.H) / art.W), dpi: print.dpi }
  }
  const d = art.design
  const f = d.frame
  if (!f) {
    let side = Math.max(d.width, d.height)
    if (output.wholePixels) {
      const modules = art.code.size + 2 * Math.max(0, d.margin)
      side = Math.max(1, roundHalfAway(side / modules)) * modules
    }
    const scale = side / art.S
    return { scale, width: Math.floor(art.W * scale + 1e-9), height: Math.floor(art.H * scale + 1e-9), dpi: 96 }
  }
  // with a frame the size comes from the page's 200 px picture of it, grown to the width
  const p = lengthPixels(f.padding, 0)
  const b = lengthPixels(f.borderWidth, 0)
  const beside = besideCode(f)
  const column = beside ? f.captionWidth : 200
  const lines = previewLines(f.text ? f.text : DEFAULT_CAPTION, column, measure)
  let pw: number
  let ph: number
  if (beside) {
    pw = 200 + 16 + column + 2 * p + 2 * b
    ph = Math.max(200, 28 * lines) + 2 * p + 2 * b
  } else {
    pw = 200 + 2 * p + 2 * b
    ph = 200 + 16 + 28 * lines + 2 * p + 2 * b
  }
  const grow = d.width / 200
  const k = Math.max((pw * grow) / art.W, (ph * grow) / art.H)
  return { scale: k, width: Math.floor(art.W * k + 1e-9), height: Math.floor(art.H * k + 1e-9), dpi: 96 }
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
    '(100 million). Use a smaller picture size, print size or caption.'
  )
}

/** The picture drawn on a canvas `scale` pixels to the design's px; `under` fills it first (in order). */
export function paint(ctx: Canvas2D, art: QrArt, scale: number, width: number, height: number, ...under: string[]): void {
  ctx.save()
  ctx.clearRect(0, 0, width, height)
  for (const colour of under) {
    ctx.fillStyle = colour
    ctx.fillRect(0, 0, width, height)
  }
  ctx.scale(scale, scale)
  art.draw(ctx)
  ctx.restore()
}

/** Lets a canvas's memory go at once (phones keep it a while and cap the total). */
export function release(canvas: HTMLCanvasElement): void {
  canvas.width = canvas.height = 0
}

export function canvasFor(width: number, height: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const problem = tooBig(width, height)
  if (problem) throw new Error(problem)
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, width)
  canvas.height = Math.max(1, height)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error("This browser couldn't draw the picture.")
  return { canvas, ctx }
}

export function blobOf(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => {
        release(canvas)
        if (blob) resolve(blob)
        else reject(new Error(`This browser couldn't make the ${type === 'image/png' ? 'PNG' : 'JPG'}.`))
      },
      type,
      quality
    )
  )
}

/**
 * The picture as a canvas, at the picture size; for a JPG (which can't see through) on white paper,
 * with the background over it.
 */
export function pictureCanvas(art: QrArt, measure: Measure, jpg = false, output: Output = screenOutput()): HTMLCanvasElement {
  const size = pictureSize(art, measure, output)
  const { canvas, ctx } = canvasFor(size.width, size.height)
  const background = art.design.background
  const under = jpg ? ['#ffffff', ...(isTransparent(background) ? [] : [paintStyle(ctx, background)])] : []
  paint(ctx, art, size.scale, canvas.width, canvas.height, ...under)
  return canvas
}

/** The PNG. (Its size and resolution are taken once, before it's made.) */
export async function pngFile(art: QrArt, measure: Measure, output: Output = screenOutput()): Promise<Blob> {
  const dpi = pictureSize(art, measure, output).dpi
  return withDpi(await blobOf(pictureCanvas(art, measure, false, output), 'image/png'), dpi)
}

/** The JPG, at the quality browsers use when none is asked for. */
export async function jpgFile(art: QrArt, measure: Measure, output: Output = screenOutput()): Promise<Blob> {
  const dpi = pictureSize(art, measure, output).dpi
  return withDpi(await blobOf(pictureCanvas(art, measure, true, output), 'image/jpeg', 0.92), dpi)
}

/** The SVG text: with a print size, its width and height on paper ("40mm"), the drawing's own size kept in its viewBox. */
export function svgText(art: QrArt, print: PrintSize | null = null): string {
  if (!printApplies(print)) return art.toSvg()
  return art.toSvg(printLength(print.width, print.unit), printLength((print.width * art.H) / art.W, print.unit))
}

export function svgFile(art: QrArt, print: PrintSize | null = null): Blob {
  return new Blob([svgText(art, print)], { type: 'image/svg+xml' })
}

/**
 * The PDF: the picture without loss, its page exactly the picture's size on paper: the print size,
 * or the screen size at 96 px to the inch drawn at up to 300 dots to the inch.
 */
export async function pdfFile(art: QrArt, measure: Measure, title: string, producer: string, output: Output = screenOutput()): Promise<Blob> {
  let canvas: HTMLCanvasElement
  let paper: number
  if (printApplies(output.print)) {
    canvas = pictureCanvas(art, measure, false, output)
    paper = inches(output.print)
  } else {
    const screen = pictureSize(art, measure, { print: null, wholePixels: output.wholePixels })
    paper = screen.width / 96
    const dpi = Math.max(1, Math.min(300, Math.floor(4096 / paper)))
    const w = roundHalfAway(paper * dpi)
    const h = roundHalfAway((w * art.H) / art.W)
    const drawn = canvasFor(w, h)
    paint(drawn.ctx, art, w / art.W, w, h)
    canvas = drawn.canvas
  }
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error("This browser couldn't draw the picture.")
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height)
  release(canvas)
  const pageWidth = roundTo(paper * POINTS_PER_INCH, 2)
  const pageHeight = roundTo((pageWidth * pixels.height) / pixels.width, 2)
  return makePdf(pixels.data, pixels.width, pixels.height, pageWidth, pageHeight, title || 'QR code', producer)
}

// ---------- text ----------

export type TextStyle = 'half' | 'full' | 'ascii'

/**
 * The code as text, three ways, always with 4 modules of quiet zone, at the size and level chosen
 * (a logo can't be in text, so it isn't raised), except with the UTF-8 marker, where the picture's
 * own code is used, raised level and all.
 */
export function codeText(d: QrDesign, style: TextStyle, levelUsed: QrLevel): string {
  const code = makeQrCode(d.data, d.utf8Marker ? levelUsed : d.level, d.version, d.utf8Marker)
  const quiet = 4
  const n = code.size + 2 * quiet
  const dark = (r: number, c: number) => r >= quiet && c >= quiet && r < n - quiet && c < n - quiet && code.dark(r - quiet, c - quiet)
  const rows: string[] = []
  if (style === 'half') {
    for (let r = 0; r < n; r += 2) {
      let s = ''
      for (let c = 0; c < n; c++) {
        const top = dark(r, c)
        const bottom = r + 1 < n && dark(r + 1, c)
        s += top && bottom ? '█' : top ? '▀' : bottom ? '▄' : ' '
      }
      rows.push(s)
    }
  } else {
    for (let r = 0; r < n; r++) {
      let s = ''
      for (let c = 0; c < n; c++) s += style === 'full' ? (dark(r, c) ? '██' : '  ') : dark(r, c) ? '  ' : '##'
      rows.push(s)
    }
  }
  return rows.join('\n')
}

export function markdown(text: string): string {
  return '```\n' + text + '\n```\n'
}

/**
 * A file name from what's typed in the File name box: the characters Windows, macOS and phones
 * won't take in a name left out, "qr-code" (or a barcode's type) when nothing's left.
 */
export function fileName(typed: string, extension: string, fallback = 'qr-code'): string {
  let name = ''
  for (const ch of typed) {
    const c = ch.charCodeAt(0)
    if (c < 0x20 || c === 0x7f || '\\/:*?"<>|'.includes(ch)) continue
    name += ch
  }
  name = name.trim().replace(/[. ]+$/, '')
  if (name.toLowerCase().endsWith('.' + extension)) name = name.slice(0, -extension.length - 1)
  return (name || fallback) + '.' + extension
}
