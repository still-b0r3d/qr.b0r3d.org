// What the page says about a code: the level's name and what it means, the level suggested for this
// much text, the size line, "What's in this code", and the warnings under the code (colours and
// the quiet zone). Worded, and decided, as the PC app does: one rule on both.

import type { QrArt } from './art'
import { characterCount, grouped } from './code'
import { readColour, type Rgba } from './css'
import type { QrDesign } from './design'
import { isPlainAscii } from './encoder'
import { formatted, roundTo } from './numbers'
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

/** A contrast ratio rounded down to one place (a hair of slack, so 2.3 stays 2.3 in binary). */
export const roundedDown = (ratio: number): number => Math.floor(ratio * 10 + 1e-9) / 10

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
      // the ratio rounded down, so a warning never says 4:1 (red on white is 3.998:1, shown 3.9:1;
      // the owner's call, 2026-11-08: the PC app does the same from its next version)
      warnings.push(
        `Low contrast (${formatted(roundedDown(worst), 1)}:1) between the code and its background. Dark on light with at least 4:1 scans best.`
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

// ---------- the typed text ----------

/** A check on the typed text, with its one-click fix. */
export interface DataCheck {
  message: string
  button: string
  fixed: string
}

// White space as the PC app counts it (Unicode's, which has U+0085 and not U+FEFF), so both
// apps say the same about the same text.
const SPACE = '\\t-\\r \\u0085\\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000'
const ANY_SPACE = new RegExp(`[${SPACE}]`)

const isSpace = (c: number): boolean =>
  (c >= 9 && c <= 13) || c === 32 || c === 0x85 || c === 0xa0 || c === 0x1680 || (c >= 0x2000 && c <= 0x200a) || c === 0x2028 || c === 0x2029 || c === 0x202f || c === 0x205f || c === 0x3000

/** The text without white space at either end (a pattern would take long on a long run of spaces). */
export function trimmedText(t: string): string {
  let start = 0
  let end = t.length
  while (start < end && isSpace(t.charCodeAt(start))) start++
  while (end > start && isSpace(t.charCodeAt(end - 1))) end--
  return t.slice(start, end)
}

/** What's worth fixing in the typed text, each with its fix: spaces at the ends, a web address without https://, tracking parameters. */
export function dataChecks(text: string): DataCheck[] {
  const checks: DataCheck[] = []
  const t = text ?? ''
  const trimmed = trimmedText(t)
  if (trimmed.length > 0 && trimmed.length !== t.length)
    checks.push({ message: 'Starts or ends with spaces or line breaks, which are stored in the code too.', button: 'Trim', fixed: trimmed })
  if (bareDomain(trimmed))
    checks.push({
      message: 'This looks like a web address without https://. Many phone cameras will show it as plain text instead of opening it.',
      button: 'Add https://',
      fixed: 'https://' + trimmed
    })
  const tracking = trackingNames(trimmed)
  if (tracking.names.length > 0) checks.push({ message: `This link has tracking parameters: ${tracking.names.join(', ')}.`, button: 'Remove them', fixed: tracking.clean })
  return checks
}

/** A web address without its https:// ("b0r3d.org/page"). */
export function bareDomain(t: string): boolean {
  if (t.length === 0 || ANY_SPACE.test(t)) return false
  const scheme = /^[A-Za-z][A-Za-z0-9+.-]*:/.exec(t)
  if (scheme && !/^\p{Nd}{1,5}([/?#]|$)/u.test(t.slice(scheme[0].length))) return false
  return /^(www\.)?([A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?\.)+[A-Za-z]{2,63}(:\p{Nd}{1,5})?([/?#].*)?$/u.test(t)
}

const TRACKING = new Set([
  'fbclid',
  'gclid',
  'gclsrc',
  'dclid',
  'gbraid',
  'wbraid',
  'msclkid',
  'yclid',
  'twclid',
  'ttclid',
  'li_fat_id',
  'igshid',
  'igsh',
  'mc_cid',
  'mc_eid',
  '_hsenc',
  '_hsmi',
  'mkt_tok',
  'srsltid'
])

const NOT_SPACE = `[^${SPACE}]`
// (a line break at the very end is let through, as the PC app's pattern lets it; the path starts
// with its slash, which finds the same parts and doesn't take long on a long text)
const LINK = new RegExp(`^(https?://)([^/?#${SPACE}]*)((?:/[^?#${SPACE}]*)?)(\\?[^#${SPACE}]*)?(#${NOT_SPACE}*)?(?=\\n?$)`, 'i')

/** The tracking parameters in a link (first appearance first), and the link without them. */
export function trackingNames(text: string): { names: string[]; clean: string } {
  const names: string[] = []
  const m = LINK.exec(text ?? '')
  if (!m || m[4] === undefined) return { names, clean: text }
  const authority = m[2]
  let host = authority.slice(authority.lastIndexOf('@') + 1)
  const colon = host.lastIndexOf(':')
  if (colon >= 0 && !host.endsWith(']')) host = host.slice(0, colon)
  host = host.toLowerCase()
  const siTracks = ['youtube.com', 'youtu.be', 'spotify.com'].some((h) => host === h || host.endsWith('.' + h))
  const kept: string[] = []
  for (const pair of m[4].slice(1).split('&')) {
    if (pair.length === 0) continue
    const eq = pair.indexOf('=')
    const name = unescapeData((eq >= 0 ? pair.slice(0, eq) : pair).replace(/\+/g, ' '))
    const lower = name.toLowerCase()
    if (lower.startsWith('utm_') || TRACKING.has(lower) || (siTracks && lower === 'si')) {
      if (!names.includes(name)) names.push(name)
    } else kept.push(pair)
  }
  if (names.length === 0) return { names, clean: text }
  return { names, clean: m[1] + m[2] + m[3] + (kept.length > 0 ? '?' + kept.join('&') : '') + (m[5] ?? '') }
}

/** %XX escapes undone where they're whole UTF-8 letters; any other stays as written. */
function unescapeData(s: string): string {
  let out = ''
  for (let i = 0; i < s.length; ) {
    if (s[i] !== '%' || !/^[0-9A-Fa-f]{2}$/.test(s.slice(i + 1, i + 3))) {
      out += s[i++]
      continue
    }
    // a run of escaped bytes, each with the text it came from
    const bytes: { b: number; text: string }[] = []
    while (i < s.length && s[i] === '%' && /^[0-9A-Fa-f]{2}$/.test(s.slice(i + 1, i + 3))) {
      bytes.push({ b: parseInt(s.slice(i + 1, i + 3), 16), text: s.slice(i, i + 3) })
      i += 3
    }
    for (let k = 0; k < bytes.length; ) {
      const n = utf8Length(bytes, k)
      if (n === 0) {
        out += bytes[k].text
        k++
      } else {
        // (a byte-order mark stays: it's part of the name)
        out += new TextDecoder('utf-8', { ignoreBOM: true }).decode(new Uint8Array(bytes.slice(k, k + n).map((x) => x.b)))
        k += n
      }
    }
  }
  return out
}

/** How many bytes from `k` make one whole UTF-8 letter, or 0. */
function utf8Length(bytes: { b: number }[], k: number): number {
  const b = bytes[k].b
  const n = b < 0x80 ? 1 : b >= 0xc2 && b <= 0xdf ? 2 : b >= 0xe0 && b <= 0xef ? 3 : b >= 0xf0 && b <= 0xf4 ? 4 : 0
  if (n <= 1 || k + n > bytes.length) return n === 1 ? 1 : 0
  for (let j = 1; j < n; j++) if ((bytes[k + j].b & 0xc0) !== 0x80) return 0
  const second = bytes[k + 1].b
  if (b === 0xe0 && second < 0xa0) return 0
  if (b === 0xed && second > 0x9f) return 0
  if (b === 0xf0 && second < 0x90) return 0
  if (b === 0xf4 && second > 0x8f) return 0
  return n
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
