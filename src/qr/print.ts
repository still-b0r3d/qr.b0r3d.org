// Print size, as b0r3d QR has it: the whole saved picture's width on paper, at a resolution, kept
// apart from designs (and apart for barcodes), as the site has always kept it in the browser. Its
// limits and wording are the PC app's (its PrintSize, QrExport.PrintLine and the barcodes'
// BarcodeExport.Guidance and PrintLine). Also the resolution a saved PNG or JPG carries, so a
// print program sizes it right.

import type { QrArt } from './art'
import { grouped } from './code'
import { formatted, formattedFixed, roundHalfAway } from './numbers'

export type PrintUnit = 'mm' | 'in'

export interface PrintSize {
  on: boolean
  /** in `unit` */
  width: number
  unit: PrintUnit
  dpi: number
}

/** the resolutions offered */
export const RESOLUTIONS = [150, 300, 600] as const

export const defaultPrint = (): PrintSize => ({ on: false, width: 40, unit: 'mm', dpi: 300 })

export const millimetres = (p: PrintSize): number => (p.unit === 'in' ? p.width * 25.4 : p.width)
export const inches = (p: PrintSize): number => millimetres(p) / 25.4
export const printPixelWidth = (p: PrintSize): number => roundHalfAway((millimetres(p) / 25.4) * p.dpi)

/** Why it isn't used (files then come out at the size on screen), or null. */
export function printProblem(p: PrintSize): string | null {
  const mm = millimetres(p)
  if (!(mm > 0) || mm > 1000) return 'Enter a width above 0 and up to 1000 mm (39 in).'
  if (p.dpi < 72 || p.dpi > 2400) return 'Enter a resolution between 72 and 2400 DPI.'
  if (printPixelWidth(p) > 10000) return 'That would be over 10,000 pixels wide. Use a smaller width or resolution.'
  return null
}

export const printApplies = (p: PrintSize | null | undefined): p is PrintSize => !!p && p.on && printProblem(p) === null

/** The same length on paper in the other unit, exactly (the box shows it rounded). */
export function inUnit(p: PrintSize, unit: PrintUnit): PrintSize {
  if (unit === p.unit) return p
  const mm = millimetres(p)
  return { ...p, unit, width: unit === 'in' ? mm / 25.4 : mm }
}

/** the width box's decimals: a hundredth of a millimetre, or a thousandth of an inch */
export const widthDecimals = (unit: PrintUnit): number => (unit === 'in' ? 3 : 2)

// ---------- kept in the browser ----------

/**
 * A print size as the site keeps it ({enabled, width, unit, dpi}), read back: only the parts of the
 * right kind, the rest the defaults.
 */
export function readPrint(kept: unknown): PrintSize {
  const p = defaultPrint()
  if (!kept || typeof kept !== 'object' || Array.isArray(kept)) return p
  const k = kept as Record<string, unknown>
  if (typeof k.enabled === 'boolean') p.on = k.enabled
  if (typeof k.width === 'number' && Number.isFinite(k.width)) p.width = k.width
  if (k.unit === 'mm' || k.unit === 'in') p.unit = k.unit
  if (typeof k.dpi === 'number' && (RESOLUTIONS as readonly number[]).includes(k.dpi)) p.dpi = k.dpi
  return p
}

export const writtenPrint = (p: PrintSize): string => JSON.stringify({ enabled: p.on, width: p.width, unit: p.unit, dpi: p.dpi })

// ---------- what's said about it ----------

/**
 * "472 × 472 px. Each module is 1.21 mm; scans from up to about 30 cm." for a QR code, and (for
 * modules under 0.4 mm) the warning; null when the print size isn't used.
 */
export function qrPrintLine(art: QrArt, p: PrintSize): { line: string; warning: string | null } | null {
  if (!printApplies(p)) return null
  const w = printPixelWidth(p)
  const h = roundHalfAway((w * art.H) / art.W)
  const moduleMm = (millimetres(p) * art.S) / art.W / (art.code.size + 2 * Math.max(0, art.design.margin))
  const distanceMm = moduleMm * art.code.size * 10
  const inch = p.unit === 'in'
  const module = inch ? `${formattedFixed(moduleMm / 25.4, 3)} in` : `${formattedFixed(moduleMm, 2)} mm`
  // rounded as the site rounds, halves up
  const distance = inch ? `${roundHalfAway(distanceMm / 25.4)} in` : `${roundHalfAway(distanceMm / 10)} cm`
  const warning =
    moduleMm < 0.4
      ? `Modules under about ${inch ? '0.016 in' : '0.40 mm'} are hard to print and scan. Make it bigger, or store less data or use lower error correction.`
      : null
  return { line: `${grouped(w)} × ${grouped(h)} px. Each module is ${module}; scans from up to about ${distance}.`, warning }
}

/** A barcode at a print size: every module whole pixels (the site's barcodePrintGuidance). */
export interface BarcodeGuidance {
  widthPx: number
  heightPx: number
  modulePx: number
  moduleMm: number
  actualWidthMm: number
  tooSmall: boolean
}

/** narrower bars are hard to print and scan */
export const MIN_BAR_MM = 0.25

export function barcodeGuidance(p: PrintSize, width: number, height: number): BarcodeGuidance {
  const modulePx = Math.max(1, roundHalfAway(printPixelWidth(p) / width))
  const moduleMm = (modulePx / p.dpi) * 25.4
  return { widthPx: modulePx * width, heightPx: modulePx * height, modulePx, moduleMm, actualWidthMm: moduleMm * width, tooSmall: moduleMm < MIN_BAR_MM }
}

/** "0.48 mm" or "0.019 in" (the site's formatSmallLength) */
export const smallLength = (mm: number, unit: PrintUnit): string => (unit === 'in' ? `${(mm / 25.4).toFixed(3)} in` : `${mm.toFixed(2)} mm`)

/** "452 × 236 px, 38.27 mm wide so every bar is whole pixels. The narrowest bar is 0.34 mm." and the warning for bars too narrow */
export function barcodePrintLine(p: PrintSize, width: number, height: number): { line: string; warning: string | null } {
  const g = barcodeGuidance(p, width, height)
  return {
    line: `${g.widthPx} × ${g.heightPx} px, ${smallLength(g.actualWidthMm, p.unit)} wide so every bar is whole pixels. The narrowest bar is ${smallLength(g.moduleMm, p.unit)}.`,
    warning: g.tooSmall ? `Bars under about ${smallLength(MIN_BAR_MM, p.unit)} are hard to print and scan. Make it wider.` : null
  }
}

/** An SVG's lengths at a print size ("40mm", "1.575in"): to 3 places, no trailing zeros. */
export const printLength = (value: number, unit: PrintUnit): string => formatted(value, 3) + unit

/**
 * A barcode SVG's width and height in the unit, its viewBox kept (the site's setSvgPrintSize): the
 * width to 3 places as JavaScript writes numbers, the height in step.
 */
export function printSized(svg: string, width: number, unit: PrintUnit): string {
  const open = /<svg\b[^>]*>/.exec(svg)
  if (!open) return svg
  const viewBox = /viewBox="\s*[-0-9.]+[\s,]+[-0-9.]+[\s,]+([0-9.]+)[\s,]+([0-9.]+)\s*"/.exec(open[0])
  if (!viewBox) return svg
  const height = (width * Number(viewBox[2])) / Number(viewBox[1])
  const length = (v: number) => String(Number(v.toFixed(3))) + unit
  const tag = open[0].replace(/\swidth="[^"]*"/, '').replace(/\sheight="[^"]*"/, '')
  return svg.slice(0, open.index) + `<svg width="${length(width)}" height="${length(height)}"` + tag.slice('<svg'.length) + svg.slice(open.index + open[0].length)
}

// ---------- the resolution in the file ----------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

/** CRC-32, as PNG and zip files check their parts. */
export function crc32(bytes: Uint8Array, crc = 0): number {
  let c = ~crc >>> 0
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)
  return ~c >>> 0
}

/**
 * A PNG with its resolution set (a pHYs chunk right after the header, any other one dropped), in
 * whole pixels per metre rounded down, as the PC app's files have it (96 DPI is 3779).
 */
export function pngWithDpi(png: Uint8Array, dpi: number): Uint8Array {
  if (png.length < 33) return png
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength)
  const perMetre = Math.floor(dpi / 0.0254)
  const chunk = new Uint8Array(21)
  const c = new DataView(chunk.buffer)
  c.setUint32(0, 9)
  chunk.set([0x70, 0x48, 0x59, 0x73], 4) // pHYs
  c.setUint32(8, perMetre)
  c.setUint32(12, perMetre)
  chunk[16] = 1 // per metre
  c.setUint32(17, crc32(chunk.subarray(4, 17)))
  const parts: Uint8Array[] = [png.subarray(0, 33), chunk]
  for (let at = 33; at + 12 <= png.length; ) {
    const length = view.getUint32(at)
    const type = String.fromCharCode(png[at + 4], png[at + 5], png[at + 6], png[at + 7])
    const end = at + 12 + length
    if (type !== 'pHYs') parts.push(png.subarray(at, Math.min(end, png.length)))
    at = end
  }
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const p of parts) {
    out.set(p, at)
    at += p.length
  }
  return out
}

/** A JPG with its resolution set in its JFIF header (one is put in when it has none). */
export function jpgWithDpi(jpg: Uint8Array, dpi: number): Uint8Array {
  if (jpg.length < 4 || jpg[0] !== 0xff || jpg[1] !== 0xd8) return jpg
  const out = new Uint8Array(jpg)
  if (out[2] === 0xff && out[3] === 0xe0 && String.fromCharCode(...out.subarray(6, 11)) === 'JFIF\0') {
    out[13] = 1 // dots per inch
    out[14] = (dpi >> 8) & 0xff
    out[15] = dpi & 0xff
    out[16] = (dpi >> 8) & 0xff
    out[17] = dpi & 0xff
    return out
  }
  const app0 = new Uint8Array([0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 1, (dpi >> 8) & 0xff, dpi & 0xff, (dpi >> 8) & 0xff, dpi & 0xff, 0, 0])
  const joined = new Uint8Array(jpg.length + app0.length)
  joined.set(jpg.subarray(0, 2))
  joined.set(app0, 2)
  joined.set(jpg.subarray(2), 2 + app0.length)
  return joined
}

/** A saved picture with its resolution set. */
export async function withDpi(blob: Blob, dpi: number): Promise<Blob> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  const marked = blob.type === 'image/jpeg' ? jpgWithDpi(bytes, dpi) : pngWithDpi(bytes, dpi)
  return new Blob([marked as BlobPart], { type: blob.type })
}
