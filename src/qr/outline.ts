// Shapes as path commands, in modules: the one description that becomes the picture (PNG and the
// preview) and SVG path data (the SVG file), so every export is drawn from the same outlines.
// Holes are drawn the other way round, so they stay holes where shapes are filled by winding.

import { written } from './numbers'

type Command =
  | { kind: 'move' | 'line'; x: number; y: number }
  | { kind: 'arc'; x: number; y: number; r: number; clockwise: boolean; large: boolean }
  | { kind: 'cubic'; x1: number; y1: number; x2: number; y2: number; x: number; y: number }
  | { kind: 'close' }

export class Outline {
  private readonly commands: Command[] = []

  get isEmpty(): boolean {
    return this.commands.length === 0
  }

  move(x: number, y: number): void {
    this.commands.push({ kind: 'move', x, y })
  }

  line(x: number, y: number): void {
    this.commands.push({ kind: 'line', x, y })
  }

  /** A circular arc from where the path is to (x, y); clockwise on screen, where y points down. */
  arc(x: number, y: number, r: number, clockwise: boolean, large = false): void {
    this.commands.push({ kind: 'arc', x, y, r, clockwise, large })
  }

  cubic(x1: number, y1: number, x2: number, y2: number, x: number, y: number): void {
    this.commands.push({ kind: 'cubic', x1, y1, x2, y2, x, y })
  }

  close(): void {
    this.commands.push({ kind: 'close' })
  }

  add(other: Outline): void {
    this.commands.push(...other.commands)
  }

  // ---------- common shapes (clockwise on screen unless `hole`) ----------

  rectangle(x: number, y: number, w: number, h: number, hole = false): void {
    this.move(x, y)
    if (!hole) {
      this.line(x + w, y)
      this.line(x + w, y + h)
      this.line(x, y + h)
    } else {
      this.line(x, y + h)
      this.line(x + w, y + h)
      this.line(x + w, y)
    }
    this.close()
  }

  circle(cx: number, cy: number, r: number, hole = false): void {
    this.move(cx, cy - r)
    this.arc(cx, cy + r, r, !hole)
    this.arc(cx, cy - r, r, !hole)
    this.close()
  }

  /**
   * A rectangle with each corner rounded by its own radius (top-left, top-right, bottom-right,
   * bottom-left); a radius of 0 is a square corner.
   */
  roundedRectangle(
    x: number, y: number, w: number, h: number,
    tl: number, tr: number, br: number, bl: number,
    hole = false
  ): void {
    const most = Math.min(w, h) / 2
    tl = Math.min(tl, most)
    tr = Math.min(tr, most)
    br = Math.min(br, most)
    bl = Math.min(bl, most)
    if (!hole) {
      this.move(x + tl, y)
      this.line(x + w - tr, y)
      if (tr > 0) this.arc(x + w, y + tr, tr, true)
      this.line(x + w, y + h - br)
      if (br > 0) this.arc(x + w - br, y + h, br, true)
      this.line(x + bl, y + h)
      if (bl > 0) this.arc(x, y + h - bl, bl, true)
      this.line(x, y + tl)
      if (tl > 0) this.arc(x + tl, y, tl, true)
    } else {
      this.move(x + tl, y)
      if (tl > 0) this.arc(x, y + tl, tl, false)
      this.line(x, y + h - bl)
      if (bl > 0) this.arc(x + bl, y + h, bl, false)
      this.line(x + w - br, y + h)
      if (br > 0) this.arc(x + w, y + h - br, br, false)
      this.line(x + w, y + tr)
      if (tr > 0) this.arc(x + w - tr, y, tr, false)
    }
    this.close()
  }

  // ---------- as SVG path data ----------

  /**
   * SVG path data, `scale` units to a module, moved by (dx, dy). With `digits` numbers are
   * rounded to that many decimals at most (the SVG file uses 3); without, they're exact (for
   * drawing).
   */
  toSvgPath(scale = 1, dx = 0, dy = 0, digits?: number): string {
    const n = digits === undefined ? (v: number) => String(v) : (v: number) => written(v, digits)
    const parts: string[] = []
    for (const k of this.commands) {
      switch (k.kind) {
        case 'move':
          parts.push('M', n(dx + k.x * scale), ' ', n(dy + k.y * scale))
          break
        case 'line':
          parts.push('L', n(dx + k.x * scale), ' ', n(dy + k.y * scale))
          break
        case 'arc': {
          const r = n(k.r * scale)
          parts.push('A', r, ' ', r, ' 0 ', k.large ? '1' : '0', ' ', k.clockwise ? '1' : '0', ' ')
          parts.push(n(dx + k.x * scale), ' ', n(dy + k.y * scale))
          break
        }
        case 'cubic':
          parts.push('C', n(dx + k.x1 * scale), ' ', n(dy + k.y1 * scale), ' ', n(dx + k.x2 * scale), ' ')
          parts.push(n(dy + k.y2 * scale), ' ', n(dx + k.x * scale), ' ', n(dy + k.y * scale))
          break
        case 'close':
          parts.push('Z')
          break
      }
    }
    return parts.join('')
  }
}
