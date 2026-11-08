// A design drawn: what b0r3d QR saves for it, measured in the export's own px (the code's side S,
// quiet zone included; with a frame, the whole frame W x H). The preview, the PNG, JPG and PDF
// files and the scan check are drawn from the same outlines the SVG file writes, so what you see is
// what you save. Shapes, the logo's room and the frame's layout are the PC app's, so both make the
// same files.

import { makeQrCode, type QrCode } from './code'
import { lengthPixels } from './css'
import { DEFAULT_CAPTION, DEFAULT_LOGO_SIZE, besideCode, isTransparent, logoCounts, type QrDesign } from './design'
import { written } from './numbers'
import { Outline } from './outline'
import type { QrLevel } from './tables'

/** A picture ready to draw: decoded, with its size, and the data: URL a file writes for it. */
export interface Picture {
  readonly image: CanvasImageSource
  readonly width: number
  readonly height: number
  readonly url: string
}

/** The design's pictures, loaded: each null when there's none, or with why it isn't drawn. */
export interface Pictures {
  logo: Picture | null
  logoProblem: string | null
  frame: Picture | null
  frameProblem: string | null
}

export const NO_PICTURES: Pictures = { logo: null, logoProblem: null, frame: null, frameProblem: null }

export const CAPTION_SIZE = 18
export const LINE_HEIGHT = CAPTION_SIZE * 1.2

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

// what a code at each level can lose and still be read, as the QR standard has it
function recoverable(level: QrLevel): number {
  return level === 'L' ? 0.07 : level === 'M' ? 0.15 : level === 'Q' ? 0.25 : 0.3
}

function inFinder(r: number, c: number, n: number): boolean {
  return (r < 7 && c < 7) || (r < 7 && c >= n - 7) || (r >= n - 7 && c < 7)
}

export class QrArt {
  readonly design: QrDesign
  readonly pictures: Pictures
  readonly code: QrCode
  readonly levelUsed: QrLevel
  /** L or M raised to Q for the logo. */
  readonly levelRaised: boolean
  /** The code's side in px, quiet zone included; W x H is the whole picture. */
  readonly S: number
  W: number
  H: number
  /** Modules across the square cleared for the logo (0: no logo). */
  readonly cleared: number = 0
  /** The logo's box, modules across, and the space it actually got. */
  readonly logoModules: number = 0
  readonly logoSpaceUsed: number = 0
  readonly logoCounts: boolean
  /** The quiet zone in modules, and px per module. */
  readonly margin: number
  readonly module: number
  readonly dots: Outline
  readonly rings = new Outline()
  readonly centres = new Outline()
  private readonly logoBox = { x: 0, y: 0, size: 0 }
  private codeAt = { x: 0, y: 0 }
  private padding = 0
  private border = 0
  private radius = 0
  private lines: string[] = []
  private captionX = 0
  private firstBaseline = 0

  /** Throws QrError when the design's text can't be made into a code. */
  constructor(design: QrDesign, pictures: Pictures = NO_PICTURES) {
    this.design = design
    this.pictures = pictures
    // a logo from a web address only counts once its picture is here
    this.logoCounts = logoCounts(design, pictures.logo !== null)
    this.levelUsed = this.logoCounts && (design.level === 'L' || design.level === 'M') ? 'Q' : design.level
    this.levelRaised = this.levelUsed !== design.level
    this.code = made(design.data, this.levelUsed, design.version, design.utf8Marker)
    const n = this.code.size
    this.margin = Number.isNaN(design.margin) ? 0 : Math.max(0, design.margin)
    this.S = Math.max(1, Math.min(design.width, design.height))
    this.module = this.S / (n + 2 * this.margin)

    // The square of modules cleared for the logo, drawn or not. The logo may take its share
    // (logoSize, 0 to 1) of the modules the level can lose; the square is the biggest that holds
    // no more than that, at most three tenths of the code across, with an odd side so it has a
    // middle module, and never less than one module.
    let first = 0
    let last = -1
    if (this.logoCounts) {
      let share = design.logoSize ?? DEFAULT_LOGO_SIZE
      if (Number.isNaN(share)) share = DEFAULT_LOGO_SIZE
      share = Math.max(0, Math.min(1, share))
      const room = Math.floor(share * recoverable(this.levelUsed) * n * n)
      const side = Math.min(Math.trunc(Math.sqrt(room)), Math.trunc(0.3 * n))
      const a = Math.max(1, side % 2 === 1 ? side : side - 1)
      this.cleared = a
      first = (n - a) / 2
      last = first + a - 1
      const space = Number.isNaN(design.logoSpace) ? 0 : Math.max(0, Math.min(design.logoSpace, (a - 1) / 2))
      this.logoSpaceUsed = space
      this.logoModules = a - 2 * space
      const box = this.logoModules * this.module
      const at = (this.margin + first + space) * this.module
      this.logoBox = { x: at, y: at, size: box }
    }

    this.dots = dotOutline(this.code, design.dotsType, this.margin, first, last)
    for (const [r, c] of [[0, 0], [0, n - 7], [n - 7, 0]]) {
      ring(this.rings, design.cornersSquareType, this.margin + c, this.margin + r)
      centre(this.centres, design.cornersDotType, this.margin + c + 2, this.margin + r + 2)
    }

    this.W = this.H = this.S
    const f = design.frame
    if (!f) return
    this.padding = lengthPixels(f.padding, 12)
    this.border = lengthPixels(f.borderWidth, 2)
    this.radius = lengthPixels(f.borderRadius, 8)
    const p = this.padding
    const b = this.border
    const S = this.S

    // The frame holds two boxes in a line, the code (S square) and the caption's block (its column
    // wide, its lines tall): side by side for a caption on the left or right, one above the other
    // otherwise. Along that line they're the padding apart and padding + border in from the
    // frame's ends; across it the frame is as big as the bigger box, padding + border in, and side
    // by side both boxes are centred in it. (Sums are added in the PC app's order, so every size
    // comes out to the same last digit as in its files.)
    const beside = besideCode(f)
    const captionFirst = f.position === 'top' || f.position === 'left'
    const column = beside && f.captionWidth > 0 ? f.captionWidth : S
    this.lines = wrap(f.text ? f.text : DEFAULT_CAPTION, column)
    const tall = this.lines.length * LINE_HEIGHT
    const block = beside ? column : tall
    const along = S + block + 3 * p + 2 * b
    const across = Math.max(S, beside ? tall : S) + 2 * p + 2 * b
    const firstAt = p + b
    const secondAt = (captionFirst ? block : S) + 2 * p + b
    const codeAlong = captionFirst ? secondAt : firstAt
    const blockAlong = captionFirst ? firstAt : secondAt
    if (beside) {
      this.W = along
      this.H = across
      this.codeAt = { x: codeAlong, y: (this.H - S) / 2 }
      this.captionX = blockAlong + column / 2
      this.firstBaseline = (this.H - tall) / 2 + CAPTION_SIZE
    } else {
      this.W = across
      this.H = along
      this.codeAt = { x: firstAt, y: codeAlong }
      this.captionX = this.W / 2
      this.firstBaseline = blockAlong + CAPTION_SIZE
    }
  }

  get captionLines(): readonly string[] {
    return this.lines
  }

  /** The logo's picture when it's drawn. */
  get logoDrawn(): Picture | null {
    return this.logoCounts ? this.pictures.logo : null
  }

  // ---------- on a canvas, in the picture's px (scale the context first for other sizes) ----------

  draw(ctx: Canvas2D): void {
    const d = this.design
    const f = d.frame
    if (!f) {
      const clip = d.borderRadius > 0
      if (clip) {
        ctx.save()
        roundedRectPath(ctx, 0, 0, this.S, this.S, d.borderRadius)
        ctx.clip()
      }
      this.drawCode(ctx, 0, 0)
      if (clip) ctx.restore()
      return
    }
    const b = this.border
    const box = { x: b / 2, y: b / 2, w: Math.max(0, this.W - b), h: Math.max(0, this.H - b) }
    roundedRectPath(ctx, box.x, box.y, box.w, box.h, this.radius)
    ctx.fillStyle = paintStyle(ctx, f.backgroundColor)
    ctx.fill()
    if (b > 0) {
      ctx.strokeStyle = paintStyle(ctx, f.borderColor)
      ctx.lineWidth = b
      ctx.stroke()
    }
    const picture = this.pictures.frame
    if (picture) {
      ctx.save()
      roundedRectPath(ctx, 0, 0, this.W, this.H, this.radius)
      ctx.clip()
      drawPicture(ctx, picture, 0, 0, this.W, this.H, true)
      ctx.restore()
      if (b > 0) {
        roundedRectPath(ctx, box.x, box.y, box.w, box.h, this.radius)
        ctx.stroke()
      }
    }
    this.drawCode(ctx, this.codeAt.x, this.codeAt.y)
    // as browsers draw the SVG: each line after the first moves down a line, but an empty line has
    // no letter for its move to act on, so it moves nothing and its room is left at the bottom;
    // a line is centred with any space it ends in
    ctx.font = captionFont(f.fontFamily)
    ctx.fillStyle = paintStyle(ctx, f.textColor)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'alphabetic'
    const drawn = drawnLines(this.lines)
    let y = this.firstBaseline
    for (let i = 0; i < drawn.length; i++) {
      if (drawn[i].length === 0) continue
      if (i > 0) y += LINE_HEIGHT
      ctx.fillText(drawn[i], this.captionX, y)
    }
  }

  private drawCode(ctx: Canvas2D, x: number, y: number): void {
    const d = this.design
    if (!isTransparent(d.background)) {
      ctx.fillStyle = paintStyle(ctx, d.background)
      ctx.fillRect(x, y, this.S, this.S)
    }
    ctx.fillStyle = paintStyle(ctx, d.dotsColor)
    ctx.fill(new Path2D(this.dots.toSvgPath(this.module, x, y)), 'evenodd')
    ctx.fillStyle = paintStyle(ctx, d.cornersSquareColor)
    ctx.fill(new Path2D(this.rings.toSvgPath(this.module, x, y)), 'evenodd')
    ctx.fillStyle = paintStyle(ctx, d.cornersDotColor)
    ctx.fill(new Path2D(this.centres.toSvgPath(this.module, x, y)))
    const logo = this.logoDrawn
    if (logo) drawPicture(ctx, logo, x + this.logoBox.x, y + this.logoBox.y, this.logoBox.size, this.logoBox.size, false)
  }

  // ---------- as an SVG file ----------

  /** The SVG file; `physicalWidth` and its height ("40mm") for a print size. */
  toSvg(physicalWidth?: string, physicalHeight?: string): string {
    const d = this.design
    const w = n(this.W)
    const h = n(this.H)
    let s = '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"'
    s += ` width="${physicalWidth ?? w}" height="${physicalHeight ?? h}" viewBox="0 0 ${w} ${h}">`
    const f = d.frame
    if (!f) {
      const clip = d.borderRadius > 0
      if (clip) {
        const r = n(d.borderRadius)
        s += `<defs><clipPath id="qr-export-clip"><rect width="${w}" height="${h}" rx="${r}" ry="${r}"/></clipPath></defs><g clip-path="url(#qr-export-clip)">`
      }
      if (!isTransparent(d.background)) s += `<rect width="${w}" height="${h}" fill="${attr(d.background)}"/>`
      s += this.codePaths(0, 0)
      s += this.logoImage(0, 0)
      if (clip) s += '</g>'
    } else {
      const r = n(this.radius)
      const b = n(this.border)
      const frameRect = `<rect x="${n(this.border / 2)}" y="${n(this.border / 2)}" width="${n(Math.max(0, this.W - this.border))}" height="${n(Math.max(0, this.H - this.border))}" rx="${r}" ry="${r}"`
      s += `${frameRect} fill="${attr(f.backgroundColor)}" stroke="${attr(f.borderColor)}" stroke-width="${b}"/>`
      // a picture that can't be drawn (a broken one) still goes in the file
      const picture = this.pictures.frame ? this.pictures.frame.url : isData(f.backgroundImage) ? f.backgroundImage : null
      if (picture) {
        s += `<defs><clipPath id="frame-bg-clip"><rect width="${w}" height="${h}" rx="${r}" ry="${r}"/></clipPath></defs>`
        s += `<image x="0" y="0" width="${w}" height="${h}" preserveAspectRatio="xMidYMid slice" clip-path="url(#frame-bg-clip)" href="${attr(picture)}" xlink:href="${attr(picture)}"/>`
        s += `${frameRect} fill="none" stroke="${attr(f.borderColor)}" stroke-width="${b}"/>`
      }
      s += `<g transform="translate(${n(this.codeAt.x)} ${n(this.codeAt.y)})">`
      if (!isTransparent(d.background)) s += `<rect class="qr-bg" width="${n(this.S)}" height="${n(this.S)}" fill="${attr(d.background)}"/>`
      s += this.codePaths(0, 0)
      s += '</g>'
      s += this.logoImage(this.codeAt.x, this.codeAt.y)
      // each line moved down from the one before (dy), so a viewer lays out empty lines exactly as
      // in every earlier file
      const family = f.fontFamily ? f.fontFamily : 'sans-serif'
      s += `<text x="${n(this.captionX)}" y="${n(this.firstBaseline)}" font-family="${attr(family)}" font-size="${n(CAPTION_SIZE)}" fill="${attr(f.textColor)}" text-anchor="middle">`
      this.lines.forEach((line, i) => {
        s += `<tspan x="${n(this.captionX)}" dy="${i === 0 ? '0' : n(LINE_HEIGHT)}">${svgText(line)}</tspan>`
      })
      s += '</text>'
    }
    return s + '</svg>\n'
  }

  private codePaths(x: number, y: number): string {
    const d = this.design
    return (
      `<path class="qr-dots" fill="${attr(d.dotsColor)}" fill-rule="evenodd" d="${this.dots.toSvgPath(this.module, x, y, 3)}"/>` +
      `<path class="qr-corner-square" fill="${attr(d.cornersSquareColor)}" fill-rule="evenodd" d="${this.rings.toSvgPath(this.module, x, y, 3)}"/>` +
      `<path class="qr-corner-dot" fill="${attr(d.cornersDotColor)}" d="${this.centres.toSvgPath(this.module, x, y, 3)}"/>`
    )
  }

  // the logo: a fetched one as its picture, any other as the design has it (one that can't be
  // drawn too, since a viewer might)
  private logoImage(x: number, y: number): string {
    if (!this.logoCounts) return ''
    const href = this.pictures.logo && /^https?:\/\//i.test(this.design.logo.trim()) ? this.pictures.logo.url : this.design.logo
    const b = this.logoBox
    return (
      `<image class="qr-logo" x="${n(x + b.x)}" y="${n(y + b.y)}" width="${n(b.size)}" height="${n(b.size)}" ` +
      `preserveAspectRatio="xMidYMid meet" href="${attr(href)}" xlink:href="${attr(href)}"/>`
    )
  }
}

// ---------- the shapes, in modules from the picture's top-left (quiet zone included) ----------

function dotOutline(code: QrCode, type: string, margin: number, first: number, last: number): Outline {
  const n = code.size
  const o = new Outline()
  const dark = (r: number, c: number) => r >= 0 && c >= 0 && r < n && c < n && code.dark(r, c)
  const drawn = (r: number, c: number) => code.dark(r, c) && !inFinder(r, c, n) && !(r >= first && r <= last && c >= first && c <= last)
  switch (type) {
    case 'dots':
    case 'rounded':
    case 'extra-rounded':
    case 'classy':
    case 'classy-rounded':
      for (let r = 0; r < n; r++) {
        for (let c = 0; c < n; c++) {
          if (!drawn(r, c)) continue
          const x = margin + c
          const y = margin + r
          if (type === 'dots') {
            o.circle(x + 0.5, y + 0.5, 0.5)
            continue
          }
          if (type === 'rounded') {
            o.roundedRectangle(x, y, 1, 1, 0.25, 0.25, 0.25, 0.25)
            continue
          }
          const up = dark(r - 1, c)
          const down = dark(r + 1, c)
          const left = dark(r, c - 1)
          const right = dark(r, c + 1)
          const tl = !up && !left ? 1 : 0
          const tr = !up && !right ? 1 : 0
          const br = !down && !right ? 1 : 0
          const bl = !down && !left ? 1 : 0
          if (type === 'extra-rounded') o.roundedRectangle(x, y, 1, 1, tl * 0.5, tr * 0.5, br * 0.5, bl * 0.5)
          else {
            const rr = type === 'classy' ? 0.3 : 0.5
            o.roundedRectangle(x, y, 1, 1, tl * rr, 0, br * rr, 0)
          }
        }
      }
      break
    default:
      // square: dark modules side by side in a row make one rectangle
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
  }
  return o
}

// a finder's ring: 7 x 7 with a 5 x 5 hole
function ring(o: Outline, type: string, x: number, y: number): void {
  switch (type) {
    case 'square':
      o.rectangle(x, y, 7, 7)
      o.rectangle(x + 1, y + 1, 5, 5, true)
      break
    case 'dot':
      o.circle(x + 3.5, y + 3.5, 3.5)
      o.circle(x + 3.5, y + 3.5, 2.5, true)
      break
    case 'rounded':
      o.roundedRectangle(x, y, 7, 7, 0.875, 0.875, 0.875, 0.875)
      o.roundedRectangle(x + 1, y + 1, 5, 5, 0.625, 0.625, 0.625, 0.625, true)
      break
    default: // extra-rounded, and anything else
      o.roundedRectangle(x, y, 7, 7, 1.75, 1.75, 1.75, 1.75)
      o.roundedRectangle(x + 1, y + 1, 5, 5, 1.25, 1.25, 1.25, 1.25, true)
  }
}

// a finder's 3 x 3 centre
function centre(o: Outline, type: string, x: number, y: number): void {
  switch (type) {
    case 'dot':
      o.circle(x + 1.5, y + 1.5, 1.5)
      break
    case 'rounded':
      o.roundedRectangle(x, y, 3, 3, 0.75, 0.75, 0.75, 0.75)
      break
    default: // square, and anything else
      o.rectangle(x, y, 3, 3)
  }
}

// ---------- the caption ----------

/**
 * The caption's lines in the files: a line break (LF) always ends a line; otherwise words (cut at
 * spaces, a run of spaces counting as one) go on a line for as long as it stays within the column,
 * every character guessed at 0.6 of the font size. A word too long for the column gets a line to
 * itself, and a paragraph with no words is an empty line. A CR is a character like any other here:
 * a CR LF break leaves its CR at the end of the line, where it counts.
 */
export function wrap(text: string, column: number): string[] {
  const perCharacter = 0.6 * CAPTION_SIZE
  const lines: string[] = []
  let line = ''
  for (const paragraph of text.split('\n')) {
    for (const word of paragraph.split(' ')) {
      if (word.length === 0) continue
      const tooWide = line.length > 0 && (line.length + 1 + word.length) * perCharacter > column
      if (tooWide) {
        lines.push(line)
        line = ''
      }
      if (line.length > 0) line += ' '
      line += word
    }
    lines.push(line)
    line = ''
  }
  return lines
}

/**
 * What the SVG shows of each line once a browser reads it: the file's CRs come in as line breaks,
 * and SVG text draws a line break, a tab and a space all as white space, a run of it as one space
 * (across lines too) and none at the very start or end. Without a CR a caption is drawn line by
 * line as it is.
 */
export function drawnLines(lines: readonly string[]): string[] {
  const drawn = [...lines]
  if (!lines.some((l) => l.includes('\r'))) return drawn
  let afterSpace = true
  let last = -1
  for (let i = 0; i < drawn.length; i++) {
    let s = ''
    for (const c of drawn[i]) {
      const space = c === ' ' || c === '\t' || c === '\r'
      if (space && afterSpace) continue
      s += space ? ' ' : c
      afterSpace = space
    }
    drawn[i] = s
    if (s.length > 0) last = i
  }
  if (last >= 0 && drawn[last].endsWith(' ')) drawn[last] = drawn[last].slice(0, -1)
  return drawn
}

/** How wide a line of a caption is, in px, in its font at 18 px. */
export type Measure = (line: string) => number

/**
 * The lines a caption takes when the page lays it out in a column (which sizes the saved
 * pictures): the browser's own line breaking, runs of spaces counting as one and line breaks kept,
 * a word wider than the column on a line to itself, and a line break at the very end adding no
 * line. A CR is a space there; a blank last line (white space with no line break after it) takes no
 * room.
 */
export function previewLines(text: string, column: number, measure: Measure): number {
  const fits = (line: string) => !(measure(line) > column)
  const paragraphs = text.split('\n')
  const end = paragraphs[paragraphs.length - 1]
  if (end.replace(/^[ \t\r]+|[ \t\r]+$/g, '').length === 0 && (paragraphs.length > 1 || end.includes('\r'))) paragraphs.pop()
  let lines = 0
  for (const paragraph of paragraphs) {
    lines++ // every paragraph takes a line, an empty one too
    const words = paragraph.split(/[ \t\r]/).filter((w) => w.length > 0)
    let line = words.length > 0 ? words[0] : ''
    for (let w = 1; w < words.length; w++) {
      const joined = line + ' ' + words[w]
      if (fits(joined)) line = joined
      else {
        lines++
        line = words[w]
      }
    }
  }
  return lines
}

// ---------- drawing helpers ----------

export type Canvas2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

/** The canvas font for a caption: its own, or the default (drawn as sans-serif, as in the SVG). */
let familiesFor: (css: string) => string = (css) => css

/** Lets the page say how a caption's CSS font list is drawn on a canvas (its web fonts' own names). */
export function setCanvasFamilies(map: (css: string) => string): void {
  familiesFor = map
}

/** The canvas font for a caption: its own, or (with none, or only spaces) the default, as the SVG names it. */
export function captionFont(css: string | null): string {
  const families = css && css.trim() ? familiesFor(css).trim() : ''
  return `${CAPTION_SIZE}px ${families || 'sans-serif'}`
}

/** A CSS colour for a canvas: as the browser reads it, black when it can't (as an SVG draws it). */
export function paintStyle(ctx: Canvas2D, css: string): string {
  // a canvas keeps its last colour when it's given one it can't read
  ctx.fillStyle = '#000000'
  ctx.fillStyle = css.trim()
  return typeof ctx.fillStyle === 'string' ? ctx.fillStyle : '#000000'
}

// A rounded rectangle as SVG's <rect rx ry> (and the PC app) draws one: the radius is kept to half
// the width across and half the height down, each on its own, so a big one makes the corners
// elliptical rather than round.
function roundedRectPath(ctx: Canvas2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath()
  const rx = Math.max(0, Math.min(r, w / 2))
  const ry = Math.max(0, Math.min(r, h / 2))
  if (rx <= 0 || ry <= 0) {
    ctx.rect(x, y, w, h)
    return
  }
  const quarter = Math.PI / 2
  ctx.moveTo(x + rx, y)
  ctx.lineTo(x + w - rx, y)
  ctx.ellipse(x + w - rx, y + ry, rx, ry, 0, -quarter, 0)
  ctx.lineTo(x + w, y + h - ry)
  ctx.ellipse(x + w - rx, y + h - ry, rx, ry, 0, 0, quarter)
  ctx.lineTo(x + rx, y + h)
  ctx.ellipse(x + rx, y + h - ry, rx, ry, 0, quarter, 2 * quarter)
  ctx.lineTo(x, y + ry)
  ctx.ellipse(x + rx, y + ry, rx, ry, 0, 2 * quarter, 3 * quarter)
  ctx.closePath()
}

// a picture in a box: whole and centred ("meet"), or covering it ("slice")
function drawPicture(ctx: Canvas2D, p: Picture, x: number, y: number, w: number, h: number, cover: boolean): void {
  const iw = p.width > 0 ? p.width : 1
  const ih = p.height > 0 ? p.height : 1
  const scale = cover ? Math.max(w / iw, h / ih) : Math.min(w / iw, h / ih)
  const dw = iw * scale
  const dh = ih * scale
  ctx.drawImage(p.image, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh)
}

function n(v: number): string {
  return written(v, 4)
}

function isData(v: string | null): v is string {
  return v !== null && /^data:/i.test(v)
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
