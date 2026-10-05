import type QrScannerType from 'qr-scanner'

/**
 * "Will it scan?" helpers: colour checks that predict trouble on phones, and a
 * test decode of the rendered code with the same decoder the Scan page uses.
 */

export interface RGBA {
  r: number
  g: number
  b: number
  a: number
}

const NAMED: Record<string, string> = { black: '#000000', white: '#ffffff' }

/** Parses the colour formats the app produces (hex, rgb()/rgba(), a few names). */
export function parseCssColor(value?: string | null): RGBA | null {
  if (!value) return null
  let v = value.trim().toLowerCase()
  if (v === 'transparent') return { r: 0, g: 0, b: 0, a: 0 }
  v = NAMED[v] ?? v
  const hex = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(v)
  if (hex) {
    let h = hex[1]
    if (h.length <= 4) h = [...h].map((ch) => ch + ch).join('')
    const n = (i: number) => parseInt(h.slice(i, i + 2), 16)
    return { r: n(0), g: n(2), b: n(4), a: h.length === 8 ? n(6) / 255 : 1 }
  }
  const fn = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)$/.exec(v)
  if (fn) {
    const alpha = fn[4] === undefined ? 1 : fn[4].endsWith('%') ? parseFloat(fn[4]) / 100 : +fn[4]
    return { r: +fn[1], g: +fn[2], b: +fn[3], a: Math.min(1, Math.max(0, alpha)) }
  }
  return null
}

/** WCAG relative luminance (0 = black, 1 = white). */
export function relativeLuminance({ r, g, b }: RGBA): number {
  const lin = (c: number) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

/** WCAG contrast ratio, from 1 (none) to 21 (black on white). */
export function contrastRatio(a: RGBA, b: RGBA): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

function over(top: RGBA, base: RGBA): RGBA {
  const a = top.a
  return {
    r: top.r * a + base.r * (1 - a),
    g: top.g * a + base.g * (1 - a),
    b: top.b * a + base.b * (1 - a),
    a: 1
  }
}

/** Below this the dark parts and the background are too alike for many scanners. */
export const MIN_SCAN_CONTRAST = 4
/** ISO/IEC 18004's minimum quiet zone, in modules. */
export const MIN_QUIET_ZONE = 4

export type ScanWarning =
  | { key: 'transparent' }
  | { key: 'inverted' }
  | { key: 'lowContrast'; ratio: number }
  | { key: 'quietZone'; modules: number }

export interface ScanWarningInput {
  /** Dots, corner squares and corner dots colours. */
  colors: (string | undefined)[]
  /** QR background, or 'transparent'. */
  background?: string
  /** The frame's background, when a frame is shown. */
  frameBackground?: string | null
  margin: number
  hasFrame: boolean
}

const WHITE: RGBA = { r: 255, g: 255, b: 255, a: 1 }

/**
 * Problems a phone camera is likely to have with these settings. A test decode
 * can pass on some of them (our decoder also reads inverted codes, many phone
 * cameras don't), so they are reported whatever the decode says.
 */
export function getScanWarnings(input: ScanWarningInput): ScanWarning[] {
  const warnings: ScanWarning[] = []
  const own = parseCssColor(input.background)
  const frame = input.hasFrame ? parseCssColor(input.frameBackground) : null
  let bg: RGBA
  if (own && own.a > 0) {
    bg = over(own, frame && frame.a > 0 ? over(frame, WHITE) : WHITE)
  } else if (frame && frame.a > 0) {
    bg = over(frame, WHITE)
  } else {
    // Nothing behind the code in the file: assume it lands on white paper.
    warnings.push({ key: 'transparent' })
    bg = WHITE
  }

  const parts = input.colors
    .map((c) => parseCssColor(c))
    .filter((c): c is RGBA => c !== null && c.a > 0)
    .map((c) => over(c, bg))
  if (parts.length === 0) return warnings

  const bgLum = relativeLuminance(bg)
  if (parts.some((c) => relativeLuminance(c) > bgLum)) warnings.push({ key: 'inverted' })

  const ratio = Math.min(...parts.map((c) => contrastRatio(c, bg)))
  if (ratio < MIN_SCAN_CONTRAST) {
    warnings.push({ key: 'lowContrast', ratio: Math.round(ratio * 10) / 10 })
  }

  if (!input.hasFrame && input.margin < MIN_QUIET_ZONE) {
    warnings.push({ key: 'quietZone', modules: Math.max(0, input.margin) })
  }
  return warnings
}

type QrEngine = Awaited<ReturnType<typeof QrScannerType.createQrEngine>>

let enginePromise: Promise<QrEngine> | null = null

/**
 * Decodes the QR code in an image with qr-scanner (bundled; it runs in a
 * same-origin worker or the browser's BarcodeDetector). Returns the decoded
 * text, or null when no code is found.
 */
export async function decodeQrImage(image: Blob): Promise<string | null> {
  const QrScanner = (await import('qr-scanner')).default
  enginePromise ??= QrScanner.createQrEngine()
  try {
    const result = await QrScanner.scanImage(image, {
      qrEngine: await enginePromise,
      returnDetailedScanResult: true
    })
    return result.data
  } catch {
    return null
  }
}
