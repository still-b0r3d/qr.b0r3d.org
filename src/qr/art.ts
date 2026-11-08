// A design drawn: what b0r3d QR saves for it, measured in the export's own px (the code's side S,
// quiet zone included). The preview, the PNG and the scan check are drawn from the same outlines
// the SVG file writes, so what you see is what you save.

import { makeQrCode, type QrCode } from './code'
import type { QrDesign } from './design'
import { written } from './numbers'
import { Outline } from './outline'
import type { QrLevel } from './tables'

// The code for a design, made again only when its text or settings change: a version 40 code
// takes a moment to make.
let lastCode: QrCode | null = null
let lastMarker = false

function made(text: string, level: QrLevel, version: number, marker: boolean): QrCode {
  const asked = Math.max(0, Math.min(40, Math.trunc(version) || 0))
  const c = lastCode
  if (c && c.text === text && c.level === level && c.askedVersion === asked && lastMarker === marker) return c
  const code = makeQrCode(text, level, version, marker)
  lastCode = code
  lastMarker = marker
  return code
}

function inFinder(r: number, c: number, n: number): boolean {
  return (r < 7 && c < 7) || (r < 7 && c >= n - 7) || (r >= n - 7 && c < 7)
}

export class QrArt {
  readonly design: QrDesign
  readonly code: QrCode
  readonly levelUsed: QrLevel
  /** The code's side in px, quiet zone included; W x H is the whole picture (the same, for now). */
  readonly S: number
  readonly W: number
  readonly H: number
  /** The quiet zone in modules, and px per module. */
  readonly margin: number
  readonly module: number
  readonly dots: Outline
  readonly rings = new Outline()
  readonly centres = new Outline()

  /** Throws QrError when the design's text can't be made into a code. */
  constructor(design: QrDesign) {
    this.design = design
    this.levelUsed = design.level
    this.code = made(design.data, this.levelUsed, design.version, design.utf8Marker)
    const n = this.code.size
    this.margin = Number.isNaN(design.margin) ? 0 : Math.max(0, design.margin)
    this.S = Math.max(1, Math.min(design.width, design.height))
    this.module = this.S / (n + 2 * this.margin)
    this.dots = squareDots(this.code, this.margin)
    for (const [r, c] of [[0, 0], [0, n - 7], [n - 7, 0]]) {
      // a finder's ring: 7 x 7 with a 5 x 5 hole, and its 3 x 3 centre
      const x = this.margin + c
      const y = this.margin + r
      this.rings.rectangle(x, y, 7, 7)
      this.rings.rectangle(x + 1, y + 1, 5, 5, true)
      this.centres.rectangle(x + 2, y + 2, 3, 3)
    }
    this.W = this.H = this.S
  }

  /** Draws the picture on a canvas, in its own px (scale the context first for other sizes). */
  draw(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D): void {
    const d = this.design
    if (!isTransparent(d.background)) {
      ctx.fillStyle = d.background
      ctx.fillRect(0, 0, this.S, this.S)
    }
    ctx.fillStyle = d.dotsColor
    ctx.fill(new Path2D(this.dots.toSvgPath(this.module)), 'evenodd')
    ctx.fillStyle = d.cornersSquareColor
    ctx.fill(new Path2D(this.rings.toSvgPath(this.module)), 'evenodd')
    ctx.fillStyle = d.cornersDotColor
    ctx.fill(new Path2D(this.centres.toSvgPath(this.module)))
  }

  /** The SVG file; `physicalWidth` and its height ("40mm") for a print size. */
  toSvg(physicalWidth?: string, physicalHeight?: string): string {
    const d = this.design
    const w = n(this.W)
    const h = n(this.H)
    let s = '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"'
    s += ` width="${physicalWidth ?? w}" height="${physicalHeight ?? h}" viewBox="0 0 ${w} ${h}">`
    if (!isTransparent(d.background)) s += `<rect width="${w}" height="${h}" fill="${attr(d.background)}"/>`
    s += `<path class="qr-dots" fill="${attr(d.dotsColor)}" fill-rule="evenodd" d="${this.dots.toSvgPath(this.module, 0, 0, 3)}"/>`
    s += `<path class="qr-corner-square" fill="${attr(d.cornersSquareColor)}" fill-rule="evenodd" d="${this.rings.toSvgPath(this.module, 0, 0, 3)}"/>`
    s += `<path class="qr-corner-dot" fill="${attr(d.cornersDotColor)}" d="${this.centres.toSvgPath(this.module, 0, 0, 3)}"/>`
    return s + '</svg>\n'
  }
}

// square dots: dark modules side by side in a row make one rectangle
function squareDots(code: QrCode, margin: number): Outline {
  const n = code.size
  const o = new Outline()
  const drawn = (r: number, c: number) => code.dark(r, c) && !inFinder(r, c, n)
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; ) {
      if (!drawn(r, c)) {
        c++
        continue
      }
      const start = c
      while (c < n && drawn(r, c)) c++
      o.rectangle(margin + start, margin + r, c - start, 1)
    }
  }
  return o
}

export function isTransparent(css: string): boolean {
  return css.trim().toLowerCase() === 'transparent'
}

function n(v: number): string {
  return written(v, 4)
}

/**
 * Text for the SVG: escaped, and without the characters XML can't hold at all (control characters
 * from a design file, half an emoji), which would make the file unreadable.
 */
export function svgText(v: string): string {
  let s = ''
  for (let i = 0; i < v.length; i++) {
    const c = v.charCodeAt(i)
    if (c >= 0xd800 && c <= 0xdbff && i + 1 < v.length) {
      const d = v.charCodeAt(i + 1)
      if (d >= 0xdc00 && d <= 0xdfff) {
        s += v[i] + v[i + 1]
        i++
        continue
      }
    }
    if ((c < 0x20 && c !== 0x09 && c !== 0x0a && c !== 0x0d) || (c >= 0xd800 && c <= 0xdfff) || c === 0xfffe || c === 0xffff) continue
    s += c === 0x26 ? '&amp;' : c === 0x3c ? '&lt;' : c === 0x3e ? '&gt;' : v[i]
  }
  return s
}

function attr(v: string): string {
  return svgText(v).replace(/"/g, '&quot;')
}
