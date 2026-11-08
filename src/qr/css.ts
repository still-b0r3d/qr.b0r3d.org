// The CSS values design files carry: colours ("#c000c0", "rgb(0 0 0 / 50%)", "red", "transparent")
// and lengths ("16px"), read exactly as the PC app reads them, so both warn about the same designs.

import { CSS_NAMES } from './css-names'
import { roundHalfEven } from './numbers'

/** A colour, each part 0-255. */
export interface Rgba {
  r: number
  g: number
  b: number
  a: number
}

export function isTransparentColour(colour: string | null | undefined): boolean {
  return (colour ?? '').trim().toLowerCase() === 'transparent'
}

/** A CSS colour, or null when it isn't one (or isn't one the PC app reads either). */
export function readColour(value: string | null | undefined): Rgba | null {
  const v = (value ?? '').trim()
  if (v.length === 0) return null
  if (isTransparentColour(v)) return { r: 0, g: 0, b: 0, a: 0 }
  if (v[0] === '#') return hex(v.slice(1))
  // rgb(...) and the like, what's inside on one line
  const f = /^(rgba?|hsla?)\(/i.exec(v)
  if (f && v.endsWith(')')) {
    const inside = v.slice(f[0].length, v.length - 1).trim()
    if (!inside.includes('\n')) return colourFunction(f[1].toLowerCase(), inside)
  }
  if (!/^[A-Za-z]+$/.test(v)) return null
  const named = CSS_NAMES[v.toLowerCase()]
  return named === undefined ? null : { r: (named >> 16) & 255, g: (named >> 8) & 255, b: named & 255, a: 255 }
}

function hex(h: string): Rgba | null {
  if (!/^[0-9A-Fa-f]+$/.test(h)) return null
  const d = (i: number) => parseInt(h[i], 16) * 17
  const p = (i: number) => parseInt(h.slice(i, i + 2), 16)
  switch (h.length) {
    case 3:
      return { r: d(0), g: d(1), b: d(2), a: 255 }
    case 4:
      return { r: d(0), g: d(1), b: d(2), a: d(3) }
    case 6:
      return { r: p(0), g: p(2), b: p(4), a: 255 }
    case 8:
      return { r: p(0), g: p(2), b: p(4), a: p(6) }
    default:
      return null
  }
}

// A number as the PC app reads one: digits with a point, a sign and an exponent, nothing else.
function decimal(text: string): number | null {
  if (/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(text)) return Number(text)
  if (text === 'Infinity' || text === '+Infinity') return Infinity
  if (text === '-Infinity') return -Infinity
  if (text === 'NaN') return NaN
  return null
}

// a number, or a percentage of `whole`
function amount(text: string, whole: number): number | null {
  const percent = text.endsWith('%')
  const value = decimal(percent ? text.slice(0, -1) : text)
  if (value === null) return null
  return percent ? (value / 100) * whole : value
}

function byte(v: number): number {
  const r = roundHalfEven(v)
  return Number.isNaN(r) ? 0 : Math.max(0, Math.min(255, r))
}

// rgb(1, 2, 3), rgba(1 2 3 / 50%), hsl(120deg 50% 50%)...
function colourFunction(name: string, args: string): Rgba | null {
  const parts = args.trim().split(/\s*[,/]\s*|\s+/)
  if (parts.length < 3 || parts.length > 4) return null
  let alpha = 1
  if (parts.length === 4) {
    const a = amount(parts[3], 1)
    if (a === null) return null
    alpha = a
  }
  if (name.startsWith('rgb')) {
    const r = amount(parts[0], 255)
    const g = amount(parts[1], 255)
    const b = amount(parts[2], 255)
    if (r === null || g === null || b === null) return null
    return { r: byte(r), g: byte(g), b: byte(b), a: byte(alpha * 255) }
  }
  let h = decimal(parts[0].toLowerCase().replace(/deg/g, ''))
  if (h === null || !parts[1].endsWith('%') || !parts[2].endsWith('%')) return null
  const s = amount(parts[1], 1)
  const l = amount(parts[2], 1)
  if (s === null || l === null) return null
  h = (((h % 360) + 360) % 360) / 360
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const channel = (t: number) => {
    t = t < 0 ? t + 1 : t > 1 ? t - 1 : t
    return t < 1 / 6 ? p + (q - p) * 6 * t : t < 0.5 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p
  }
  return { r: byte(channel(h + 1 / 3) * 255), g: byte(channel(h) * 255), b: byte(channel(h - 1 / 3) * 255), a: byte(alpha * 255) }
}

/** "#rrggbb", the way colour pickers write colours. */
export function toHex(c: Rgba): string {
  return '#' + [c.r, c.g, c.b].map((v) => v.toString(16).padStart(2, '0')).join('')
}

const UNITS =
  'px|em|rem|ex|rex|ch|rch|cap|rcap|ic|ric|lh|rlh|vw|vh|vi|vb|vmin|vmax|svw|svh|svi|svb|svmin|svmax|lvw|lvh|lvi|lvb|lvmin|lvmax|' +
  'dvw|dvh|dvi|dvb|dvmin|dvmax|cqw|cqh|cqi|cqb|cqmin|cqmax|cm|mm|q|in|pt|pc|%'

/**
 * A CSS length the frame's fields take, as a browser's CSS.supports("width", ...) does: "0", a
 * number with a unit ("16px", "1.5em", "1e1px"), a keyword ("auto") or a sum ("calc(...)"). A
 * negative one isn't a width.
 */
export function isLength(value: string | null | undefined): boolean {
  const v = (value ?? '').trim()
  if (/^(auto|min-content|max-content|fit-content|inherit|initial|unset|revert|revert-layer)$/i.test(v)) return true
  if (/^(calc|min|max|clamp|var|env|fit-content)\(.*\)$/is.test(v)) return true
  return new RegExp(`^\\+?(0+(\\.0+)?|(\\p{Nd}+(\\.\\p{Nd}+)?|\\.\\p{Nd}+)(e[+-]?\\p{Nd}+)?(${UNITS}))$`, 'iu').test(v)
}

/**
 * What a frame length draws as: its first run of digits, points and minus signs, as px whatever
 * the unit ("1.5em" is 1.5, "1e1px" 1), or 0 when that isn't a number; an empty one gets `empty`.
 */
export function lengthPixels(value: string | null | undefined, empty: number): number {
  if (!value) return empty
  const run = /[-\p{Nd}.]+/u.exec(value)
  if (!run || !/^-?(\d+\.?\d*|\.\d+)$/.test(run[0])) return 0
  const px = Number(run[0])
  return px !== 0 ? px : 0
}
