// A barcode as b0r3d QR keeps it: zint's SVG at one unit per module (zint makes it, through
// zxing-wasm), its size in modules with its quiet zones and text, the bars made taller or shorter,
// and recoloured at a size. Then drawn at whole pixels per module, and its files. As b0r3d QR for
// PC has it (its BarcodeSvg, BarcodeArt and BarcodeExport).

import type { Canvas2D } from './art'
import { colourWarnings } from './checks'
import { grouped } from './code'
import { blobOf, canvasFor, MOST_PIXELS, release } from './export'
import { roundHalfEven, roundTo } from './numbers'
import { makePdf, POINTS_PER_INCH } from './pdf'
import { type BarcodeFormat } from './barcodes'

export const DEFAULT_BAR_HEIGHT = 50
export const MIN_BAR_HEIGHT = 20
export const MAX_BAR_HEIGHT = 150
export const MIN_SCALE = 1
export const MAX_SCALE = 20
/** pixels per module for the scan check */
export const CHECK_SCALE = 4

/** A barcode's settings: the bars' colour, the background or none, pixels per module, and how it's made. */
export interface BarcodeLook {
  color: string
  background: string
  transparent: boolean
  scale: number
  showText: boolean
  allowRectangular: boolean
  barHeight: number
  quietZones: boolean
}

export const defaultLook = (): BarcodeLook => ({
  color: '#000000',
  background: '#ffffff',
  transparent: false,
  scale: 4,
  showText: true,
  allowRectangular: false,
  barHeight: DEFAULT_BAR_HEIGHT,
  quietZones: true
})

export const paperOf = (look: BarcodeLook): string => (look.transparent ? 'transparent' : look.background)

/** zint's SVG and its size in modules. */
export interface BarcodeSvg {
  readonly svg: string
  readonly width: number
  readonly height: number
}

/** zint's SVG from its <svg> tag on, without its description: as the barcode is kept. */
export function tidyZintSvg(raw: string): BarcodeSvg {
  const at = raw.indexOf('<svg')
  const svg = (at < 0 ? raw : raw.slice(at)).replace(/ <desc>[^\n]*<\/desc>\n/, '')
  const open = /<svg\b[^>]*>/.exec(svg)?.[0] ?? ''
  return { svg, width: parseInt(/\bwidth="([0-9.]+)"/.exec(open)?.[1] ?? '0', 10), height: parseInt(/\bheight="([0-9.]+)"/.exec(open)?.[1] ?? '0', 10) }
}

/** zint's message as people see it: "Error 275: Invalid ... (retval: 7)" without the number parts. */
export function friendlyError(message: string | null | undefined): string {
  const text = (message ?? '')
    .replace(/^Error [0-9]+:\s*/, '')
    .replace(/\s*\(retval: [0-9]+\)\s*$/, '')
    .trim()
  return text.length > 0 ? text.slice(0, 1).toUpperCase() + text.slice(1) : 'This text cannot be encoded.'
}

const ONE_RECT = /^M([0-9.]+) ([0-9.]+)h([0-9.]+)v([0-9.]+)h-[0-9.]+Z$/

/**
 * The bars `barHeight` modules tall instead of zint's 50: whatever reaches the bottom of the bars
 * grows or shrinks by the difference (the bars, EAN/UPC's longer guard bars, ITF-14's sides);
 * whatever lies below moves (ITF-14's bottom bar, the text). A drawing that isn't all rectangles
 * stays as it is.
 */
export function withBarHeight(b: BarcodeSvg, barHeight: number): BarcodeSvg {
  const delta = barHeight - DEFAULT_BAR_HEIGHT
  if (delta === 0) return b
  const path = /(<path\b[^>]*\bd=")([^"]+)(")/.exec(b.svg)
  if (!path) return b
  const boxes: [number, number, number, number][] = []
  const d = path[2]
  for (let start = 0; start < d.length; ) {
    let end = d.indexOf('M', start + 1)
    if (end < 0) end = d.length
    const rect = ONE_RECT.exec(d.slice(start, end))
    if (!rect) return b
    boxes.push([Number(rect[1]), Number(rect[2]), Number(rect[3]), Number(rect[4])])
    start = end
  }
  // the bottom of the bars: where most of them end (the first such place on a tie)
  const ends: [number, number][] = []
  for (const [, y, , h] of boxes) {
    const at = ends.findIndex((e) => e[0] === y + h)
    if (at < 0) ends.push([y + h, 1])
    else ends[at][1]++
  }
  let [bottom, most] = ends[0]
  for (const [where, count] of ends)
    if (count > most) {
      most = count
      bottom = where
    }
  for (const [, y, , h] of boxes) if (y < bottom && y + h >= bottom && h + delta <= 0) return b

  let moved = ''
  for (const [x, y0, w, h0] of boxes) {
    let y = y0
    let h = h0
    if (y >= bottom) y += delta
    else if (y + h >= bottom) h += delta
    moved += `M${String(x)} ${String(y)}h${String(w)}v${String(h)}h-${String(w)}Z`
  }
  const height = b.height + delta
  let svg = b.svg.slice(0, path.index) + path[1] + moved + path[3] + b.svg.slice(path.index + path[0].length)
  svg = svg.replace(/<svg\b[^>]*>/, (open) => open.replace(/\bheight="[0-9.]+"/, () => `height="${height}"`))
  svg = svg.replace(/(<rect\b[^>]*\bheight=")[0-9.]+(")/, (_, a: string, z: string) => a + height + z)
  svg = svg.replace(/(<text\b[^>]*\by=")([0-9.]+)(")/g, (m, a: string, y: string, z: string) => {
    const at = Number(y)
    if (at < bottom) return m
    return a + String(Number((at + delta).toFixed(2))) + z
  })
  return { svg, width: b.width, height }
}

const attribute = (value: string): string => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/**
 * The SVG in colour at `scale` pixels per module; its viewBox stays in modules, so a print size only
 * changes its width and height. "transparent" for no background.
 */
export function styledSvg(b: BarcodeSvg, color: string, background: string, scale: number): string {
  const transparent = background === 'transparent'
  return b.svg
    .replace(
      /<svg\b[^>]*>/,
      () =>
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${b.width} ${b.height}" width="${String(b.width * scale)}" height="${String(b.height * scale)}" shape-rendering="crispEdges">`
    )
    .replace(/(<g id="barcode" fill=")[^"]*"/, (_, a: string) => a + attribute(color) + '"')
    .replace(/<rect x="0" y="0" width="[0-9.]+" height="[0-9.]+" fill="[^"]*"\/>\s*/, (m) => (transparent ? '' : m.replace(/fill="[^"]*"/, () => `fill="${attribute(background)}"`)))
}

// ---------- drawn ----------

interface Words {
  x: number
  y: number
  anchor: string
  family: string
  size: number
  text: string
}

/** A barcode drawn from its SVG as a browser draws it: the bars sharp on whole pixels, the text in its fonts. */
export class BarcodeArt {
  readonly bars: [number, number, number, number][] = []
  readonly words: Words[] = []

  constructor(readonly barcode: BarcodeSvg) {
    const path = /<path\b[^>]*\bd="([^"]+)"/.exec(barcode.svg)
    if (path) for (const m of path[1].matchAll(/M([0-9.]+) ([0-9.]+)h([0-9.]+)v([0-9.]+)h-[0-9.]+Z/g)) this.bars.push([Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])])
    for (const m of barcode.svg.matchAll(/<text x="([0-9.-]+)" y="([0-9.-]+)" text-anchor="([a-z]+)" font-family="([^"]*)" font-size="([0-9.]+)">\n {3}([^\n]*)\n {2}<\/text>/g))
      this.words.push({ x: Number(m[1]), y: Number(m[2]), anchor: m[3], family: m[4], size: Number(m[5]), text: unescape(m[6]) })
  }

  get W(): number {
    return this.barcode.width
  }

  get H(): number {
    return this.barcode.height
  }

  /** At `scale` pixels per module: the bars in `ink` on `paper` (null: see-through), on `under` first if given. */
  draw(ctx: Canvas2D, scale: number, ink: string, paper: string | null, under: string | null = null): void {
    const width = Math.max(1, Math.round(this.W * scale))
    const height = Math.max(1, Math.round(this.H * scale))
    const at = (v: number): number => roundHalfEven(v * scale)
    ctx.save()
    ctx.clearRect(0, 0, width, height)
    if (under !== null) {
      ctx.fillStyle = under
      ctx.fillRect(0, 0, width, height)
    }
    if (paper !== null) {
      ctx.fillStyle = paper
      ctx.fillRect(0, 0, width, height)
    }
    ctx.fillStyle = ink
    for (const [x, y, w, h] of this.bars) {
      const x0 = at(x)
      const y0 = at(y)
      const x1 = at(x + w)
      const y1 = at(y + h)
      if (x1 > x0 && y1 > y0) ctx.fillRect(x0, y0, x1 - x0, y1 - y0)
    }
    for (const w of this.words) {
      ctx.font = `${w.size * scale}px ${w.family}`
      ctx.textAlign = w.anchor === 'middle' ? 'center' : w.anchor === 'end' ? 'right' : 'left'
      ctx.textBaseline = 'alphabetic'
      ctx.fillText(w.text, w.x * scale, w.y * scale)
    }
    ctx.restore()
  }
}

/** the five characters zint's SVG writes as entities */
const unescape = (text: string): string => text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')

// ---------- files ----------

/** Why a barcode picture this size isn't drawn, or null. */
export function barcodeTooBig(width: number, height: number): string | null {
  if (width * height <= MOST_PIXELS) return null
  return `That picture would be ${grouped(width)} × ${grouped(height)} pixels, more than b0r3d QR draws at once (100 million). Use a smaller size.`
}

/** The picture at `scale` pixels per module; a JPG gets the background (white for none) under it. */
export function barcodeCanvas(art: BarcodeArt, look: BarcodeLook, scale: number, jpg = false): HTMLCanvasElement {
  const width = Math.max(1, Math.round(art.W * scale))
  const height = Math.max(1, Math.round(art.H * scale))
  const problem = barcodeTooBig(width, height)
  if (problem) throw new Error(problem)
  const { canvas, ctx } = canvasFor(width, height)
  // a JPG has no see-through: on white then (and under a colour that can be seen through)
  const under = jpg ? '#ffffff' : null
  art.draw(ctx, scale, look.color, look.transparent ? null : look.background, under)
  return canvas
}

export const barcodePng = (art: BarcodeArt, look: BarcodeLook): Promise<Blob> => blobOf(barcodeCanvas(art, look, look.scale), 'image/png')

/** The JPG at 0.95, as b0r3d QR saves barcodes. */
export const barcodeJpg = (art: BarcodeArt, look: BarcodeLook): Promise<Blob> => blobOf(barcodeCanvas(art, look, look.scale, true), 'image/jpeg', 0.95)

export const barcodeSvgFile = (art: BarcodeArt, look: BarcodeLook): Blob => new Blob([styledSvg(art.barcode, look.color, paperOf(look), look.scale)], { type: 'image/svg+xml' })

/**
 * The PDF: the PNG without loss at its size on paper (96 px to the inch), drawn at whole pixels per
 * module near 300 DPI (but no more than 4096 px wide) so the bars stay sharp.
 */
export async function barcodePdf(art: BarcodeArt, look: BarcodeLook, title: string, producer: string): Promise<Blob> {
  let modulePx = look.scale
  const sharper = Math.ceil((modulePx * 300) / 96)
  const widest = Math.floor(4096 / art.W)
  const pageInches = (art.W * modulePx) / 96
  modulePx = Math.max(modulePx, Math.min(sharper, widest))
  const dpi = (art.W * modulePx) / pageInches
  const canvas = barcodeCanvas(art, look, modulePx)
  const ctx = canvas.getContext('2d')!
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height)
  release(canvas)
  const pageWidth = roundTo((pixels.width / dpi) * POINTS_PER_INCH, 2)
  const pageHeight = roundTo((pixels.height / dpi) * POINTS_PER_INCH, 2)
  return makePdf(pixels.data, pixels.width, pixels.height, pageWidth, pageHeight, title || 'Barcode', producer)
}

/** The warnings for a barcode: its colours (zint always gives it its quiet zones, so none about that). */
export const barcodeWarnings = (look: BarcodeLook): string[] => colourWarnings([look.color], paperOf(look), null, 4)

/** "What's in this code" for a barcode. */
export function barcodeRows(format: BarcodeFormat, prepared: string, expected: string, art: BarcodeArt): [string, string][] {
  const rows: [string, string][] = [
    ['Type', format.label + (format.gs1 ? ' (GS1 data)' : '')],
    ['Stored', expected]
  ]
  // the check digit added: what's stored after what was typed, or where the type writes the number
  // anew (an ISBN-10 as its EAN-13, a 6-digit UPC-E with its number system first) the last digit
  if (expected !== prepared) rows.push(['Check digit', (expected.startsWith(prepared) ? expected.slice(prepared.length) : expected.slice(-1)) + ', added for you'])
  rows.push(['Size', `${art.W} × ${art.H} modules, blank margin included`])
  return rows
}

/** A size box's number as the site takes it: halves up, the default for 0 or nothing, then the limits. */
export function wholeSetting(value: number, fallback: number, min: number, max: number): number {
  const whole = value === 0 || Number.isNaN(value) ? fallback : Math.floor(value + 0.5)
  return Math.max(min, Math.min(max, whole))
}
