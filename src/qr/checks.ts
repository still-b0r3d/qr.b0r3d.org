// What the page says about a code: the level's name and what it means, the level suggested for this
// much text, the size line, "What's in this code", and the warnings under the code (colours and
// the quiet zone). Worded, and decided, as the PC app does: one rule on both.

import type { QrArt } from './art'
import { characterCount, grouped } from './code'
import { readColour, type Rgba } from './css'
import type { QrDesign } from './design'
import { isPlainAscii } from './encoder'
import { formatted, roundHalfAway, roundTo } from './numbers'
import type { QrLevel } from './tables'

export function levelName(level: QrLevel): string {
  return level === 'L' ? 'Low (7%)' : level === 'M' ? 'Medium (15%)' : level === 'Q' ? 'High (25%)' : 'Highest (30%)'
}

/** The level suggested for this much text, or null with none. */
export function suggestedLevel(text: string): QrLevel | null {
  const n = text.length
  if (n === 0) return null
  return n <= 50 ? 'H' : n <= 150 ? 'Q' : n <= 500 ? 'M' : 'L'
}

/** The hint under the error correction buttons. */
export function levelHint(level: QrLevel, text: string, raisedForLogo = false): string {
  const percent = level === 'L' ? 7 : level === 'M' ? 15 : level === 'Q' ? 25 : 30
  let hint = `${levelName(level)}: about ${percent}% of the code can be dirty, scratched or covered and it still scans. Higher levels make the code denser.`
  const suggested = suggestedLevel(text)
  if (suggested) {
    hint += suggested === level ? ' Suggested for this much text.' : ` Suggested for this much text: ${levelName(suggested)}.`
  }
  if (raisedForLogo) hint += ' A logo covers part of the code, so High (25%) is used.'
  return hint
}

/** The hint under the size of the code. */
export function versionHint(art: QrArt | null): { text: string; warn: boolean } {
  const code = art?.code
  if (code && code.askedVersion > 0 && code.version !== code.askedVersion) {
    return { text: `Too much data for version ${code.askedVersion}, so version ${code.version} is used.`, warn: true }
  }
  return { text: 'A fixed size keeps every code in a batch the same size.', warn: false }
}

const utf8 = new TextEncoder()

/** "17 characters · 17 bytes · version 2 · 25 × 25 modules · level Q" */
export function infoLine(art: QrArt): string {
  const code = art.code
  const chars = characterCount(code.text)
  const bytes = utf8.encode(code.text).length
  return (
    `${grouped(chars)} ${chars === 1 ? 'character' : 'characters'} · ` +
    `${grouped(bytes)} ${bytes === 1 ? 'byte' : 'bytes'}${isPlainAscii(code.text) ? '' : ' (UTF-8)'} · ` +
    `version ${code.version} · ${code.size} × ${code.size} modules · level ${code.level}` +
    (art.levelRaised ? ' (raised for the logo)' : '')
  )
}

/** The rows of "What's in this code": what's stored, the size, the level and the encoding. */
export function inTheCode(art: QrArt): [string, string][] {
  const code = art.code
  const bytes = utf8.encode(code.text).length
  const chars = characterCount(code.text)
  const lineCount = code.text.split(/\r\n|\r|\n/).length
  const stored =
    `${grouped(bytes)} ${bytes === 1 ? 'byte' : 'bytes'}, ${grouped(chars)} ${chars === 1 ? 'character' : 'characters'}` +
    (lineCount > 1 ? `, ${lineCount} lines` : '')
  const encoding = code.utf8Marker
    ? 'text, marked as UTF-8 (ECI 26)'
    : code.segments
        .map((s) => `${s.mode === 'numeric' ? 'numbers' : s.mode === 'alphanumeric' ? 'capitals and digits' : 'text'} (${characterCount(s.text)})`)
        .join(' + ')
  return [
    ['Stored', stored],
    ['Size', `Version ${code.version}, ${code.size} × ${code.size} modules`],
    ['Error correction', levelName(code.level) + (art.levelRaised ? ', raised for the logo' : '')],
    ['Encoding', encoding]
  ]
}

export const EVERYTHING_LINE = "That's everything: no link to this site, no tracking. Scanning shows exactly this text."

// ---------- colours and the quiet zone ----------

interface Rgb {
  r: number
  g: number
  b: number
}

const WHITE: Rgb = { r: 255, g: 255, b: 255 }

function over(top: Rgba, under: Rgb): Rgb {
  const a = top.a / 255
  return { r: top.r * a + under.r * (1 - a), g: top.g * a + under.g * (1 - a), b: top.b * a + under.b * (1 - a) }
}

// WCAG's relative luminance and contrast ratio
function luminance(c: Rgb): number {
  const channel = (v: number) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b)
}

function contrast(a: number, b: number): number {
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

/**
 * The warnings for a code's colours: its parts, its background, a frame's background (null
 * without a frame), and its quiet zone in modules (null with a frame, which gives the room).
 */
export function colourWarnings(colours: string[], backgroundCss: string, frameBackground: string | null, margin: number | null): string[] {
  const warnings: string[] = []
  // what's behind the code: its background, over the frame's (see-through parts of either over white paper)
  const frame = frameBackground !== null ? readColour(frameBackground) : null
  const hasFrame = frame !== null && frame.a > 0
  const background = readColour(backgroundCss)
  let under: Rgb
  if (background !== null && background.a > 0) under = over(background, hasFrame && frame ? over(frame, WHITE) : WHITE)
  else if (hasFrame && frame) under = over(frame, WHITE)
  else {
    warnings.push('Transparent background: put the code on a plain, light surface.')
    under = WHITE
  }
  const parts: Rgb[] = []
  for (const css of colours) {
    const c = readColour(css)
    if (c !== null && c.a > 0) parts.push(over(c, under))
  }
  if (parts.length > 0) {
    const back = luminance(under)
    if (parts.some((p) => luminance(p) > back)) warnings.push("Light code on a dark background: many phone cameras can't read inverted codes.")
    const worst = Math.min(...parts.map((p) => contrast(luminance(p), back)))
    if (worst < 4) {
      warnings.push(
        `Low contrast (${formatted(roundHalfAway(worst * 10) / 10, 1)}:1) between the code and its background. Dark on light with at least 4:1 scans best.`
      )
    }
  }
  if (margin !== null && margin < 4) {
    warnings.push(
      `Only ${formatted(Math.max(0, margin), 2)} modules of blank space around the code. Leave at least 4 (Quiet zone), or place it on a plain light area.`
    )
  }
  return warnings
}

/** The warnings for a design. */
export function designWarnings(d: QrDesign): string[] {
  return colourWarnings([d.dotsColor, d.cornersSquareColor, d.cornersDotColor], d.background, d.frame ? d.frame.backgroundColor : null, d.frame ? null : d.margin)
}

/** The line under the logo's settings: how much room it got. */
export function logoHint(art: QrArt): string {
  if (art.cleared === 0) return ''
  const cleared = `${art.cleared} × ${art.cleared}`
  const two = (x: number) => formatted(roundTo(x, 2), 2)
  if (art.design.logoSpace > art.logoSpaceUsed + 1e-9) {
    return `Only room for ${two(art.logoSpaceUsed)}: the logo keeps at least 1 of the ${cleared} cleared modules.`
  }
  const logo = two(art.logoModules)
  return `Logo ${logo} × ${logo} of the ${cleared} cleared modules. Space comes out of the logo so the code still scans; a larger size (QR version) fits both.`
}
