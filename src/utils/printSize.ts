/**
 * Exporting at a physical size: pixel maths, print-quality guidance and the
 * DPI metadata that tells layout programs how big to place the image.
 */

export type PrintUnit = 'mm' | 'in'

export interface PrintSettings {
  enabled: boolean
  /** Width of the exported image (frame included) in `unit`. */
  width: number
  unit: PrintUnit
  dpi: number
}

export const DEFAULT_PRINT_SETTINGS: PrintSettings = {
  enabled: false,
  width: 40,
  unit: 'mm',
  dpi: 300
}
export const DPI_OPTIONS = [150, 300, 600] as const
export const MAX_PRINT_WIDTH_MM = 1000
export const MAX_PRINT_PIXELS = 10000
/** Below roughly this module size, printers and phone cameras start to struggle. */
export const MIN_MODULE_MM = 0.4
/** Rule of thumb: a code scans from up to about 10 times its own width. */
export const SCAN_DISTANCE_FACTOR = 10

const MM_PER_INCH = 25.4

export function toMillimetres(value: number, unit: PrintUnit): number {
  return unit === 'in' ? value * MM_PER_INCH : value
}

export function fromMillimetres(mm: number, unit: PrintUnit): number {
  return unit === 'in' ? mm / MM_PER_INCH : mm
}

/** Width in pixels of an image `settings.width` wide at `settings.dpi`. */
export function printWidthPx(settings: Pick<PrintSettings, 'width' | 'unit' | 'dpi'>): number {
  return Math.round((toMillimetres(settings.width, settings.unit) / MM_PER_INCH) * settings.dpi)
}

export type PrintSettingsProblem = 'width' | 'dpi' | 'tooLarge'

export function checkPrintSettings(settings: PrintSettings): PrintSettingsProblem | null {
  const mm = toMillimetres(settings.width, settings.unit)
  if (!Number.isFinite(mm) || mm <= 0 || mm > MAX_PRINT_WIDTH_MM) return 'width'
  if (!Number.isFinite(settings.dpi) || settings.dpi < 72 || settings.dpi > 2400) return 'dpi'
  if (printWidthPx(settings) > MAX_PRINT_PIXELS) return 'tooLarge'
  return null
}

export interface PrintGuidance {
  widthPx: number
  heightPx: number
  /** Size of one module (QR square) on paper. */
  moduleMm: number
  /** Width of the code itself, quiet zone excluded. */
  symbolMm: number
  /** About how far away a phone can scan it from. */
  scanDistanceMm: number
  tooSmall: boolean
}

/**
 * @param printWidthMm width of the whole exported image on paper
 * @param exportSize natural size of the exported image (frame included)
 * @param qrAreaSize side of the QR area within it, quiet zone included
 * @param matrixCount modules per side of the QR matrix
 * @param margin quiet zone in modules
 */
export function printGuidance(
  settings: PrintSettings,
  exportSize: { width: number; height: number },
  qrAreaSize: number,
  matrixCount: number,
  margin: number
): PrintGuidance {
  const printWidthMm = toMillimetres(settings.width, settings.unit)
  const widthPx = printWidthPx(settings)
  const heightPx = Math.round((widthPx * exportSize.height) / exportSize.width)
  const qrAreaMm = (printWidthMm * qrAreaSize) / exportSize.width
  const moduleMm = qrAreaMm / (matrixCount + 2 * Math.max(0, margin))
  const symbolMm = moduleMm * matrixCount
  return {
    widthPx,
    heightPx,
    moduleMm,
    symbolMm,
    scanDistanceMm: symbolMm * SCAN_DISTANCE_FACTOR,
    tooSmall: moduleMm < MIN_MODULE_MM
  }
}

/**
 * Narrowest bar (X-dimension) below which barcodes get hard to print and
 * scan for most scanners. Retail EAN/UPC go down to 0.264 mm at 80% size.
 */
export const MIN_BAR_MM = 0.25

export interface BarcodePrintGuidance {
  /** Exact output size; every module is a whole number of pixels. */
  widthPx: number
  heightPx: number
  /** Pixels per module. */
  modulePx: number
  /** Narrowest bar or module on paper. */
  moduleMm: number
  /** Width on paper after rounding modules to whole pixels. */
  actualWidthMm: number
  tooSmall: boolean
}

/**
 * Print size for a barcode `modulesWide` × `modulesHigh` modules (quiet zones
 * and text included). Bars are kept to whole pixels, since blurred bar edges
 * make barcodes harder to read, so the width comes out close to the one asked
 * for rather than exact.
 */
export function barcodePrintGuidance(
  settings: Pick<PrintSettings, 'width' | 'unit' | 'dpi'>,
  modulesWide: number,
  modulesHigh: number
): BarcodePrintGuidance {
  const modulePx = Math.max(1, Math.round(printWidthPx(settings) / modulesWide))
  const moduleMm = (modulePx / settings.dpi) * MM_PER_INCH
  return {
    widthPx: modulePx * modulesWide,
    heightPx: modulePx * modulesHigh,
    modulePx,
    moduleMm,
    actualWidthMm: moduleMm * modulesWide,
    tooSmall: moduleMm < MIN_BAR_MM
  }
}

/** "0.48 mm" / "0.019 in": enough precision to compare against the 0.4 mm guide. */
export function formatSmallLength(mm: number, unit: PrintUnit): string {
  return unit === 'in' ? `${fromMillimetres(mm, 'in').toFixed(3)} in` : `${mm.toFixed(2)} mm`
}

/** "35 cm" / "14 in": rounded, for distances. */
export function formatDistance(mm: number, unit: PrintUnit): string {
  return unit === 'in' ? `${Math.round(fromMillimetres(mm, 'in'))} in` : `${Math.round(mm / 10)} cm`
}

/** Width/height in the unit for an SVG root ("40mm", "1.575in"). */
export function svgLength(value: number, unit: PrintUnit): string {
  return `${Number(value.toFixed(3))}${unit}`
}

/* ---------- DPI metadata ---------- */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

/**
 * Returns the PNG with a pHYs chunk recording `dpi` (an existing one is
 * replaced). Bytes that aren't a PNG come back unchanged.
 */
export function setPngDpi(png: Uint8Array<ArrayBuffer>, dpi: number): Uint8Array<ArrayBuffer> {
  if (!PNG_SIGNATURE.every((b, i) => png[i] === b)) return png
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength)
  const chunks: Uint8Array[] = [png.subarray(0, 8)]
  let offset = 8
  let inserted = false
  const ppm = Math.round(dpi / 0.0254)
  const phys = new Uint8Array(21)
  const pv = new DataView(phys.buffer)
  pv.setUint32(0, 9)
  phys.set([0x70, 0x48, 0x59, 0x73], 4) // "pHYs"
  pv.setUint32(8, ppm)
  pv.setUint32(12, ppm)
  phys[16] = 1 // unit: metre
  pv.setUint32(17, crc32(phys.subarray(4, 17)))

  while (offset + 8 <= png.length) {
    const length = view.getUint32(offset)
    const type = String.fromCharCode(...png.subarray(offset + 4, offset + 8))
    const end = offset + 12 + length
    if (type !== 'pHYs') chunks.push(png.subarray(offset, end))
    if (type === 'IHDR' && !inserted) {
      chunks.push(phys)
      inserted = true
    }
    offset = end
  }
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0))
  let pos = 0
  for (const c of chunks) {
    out.set(c, pos)
    pos += c.length
  }
  return out
}

/**
 * Returns the JPEG with its JFIF header set to `dpi` (one is added after the
 * start marker if missing). Bytes that aren't a JPEG come back unchanged.
 */
export function setJpegDpi(jpeg: Uint8Array<ArrayBuffer>, dpi: number): Uint8Array<ArrayBuffer> {
  if (jpeg[0] !== 0xff || jpeg[1] !== 0xd8) return jpeg
  const d = Math.min(0xffff, Math.max(1, Math.round(dpi)))
  const isJfif =
    jpeg[2] === 0xff &&
    jpeg[3] === 0xe0 &&
    String.fromCharCode(...jpeg.subarray(6, 11)) === 'JFIF\0'
  if (isJfif) {
    const out = jpeg.slice()
    const v = new DataView(out.buffer)
    out[13] = 1 // density unit: dots per inch
    v.setUint16(14, d)
    v.setUint16(16, d)
    return out
  }
  const app0 = new Uint8Array([
    0xff,
    0xe0,
    0x00,
    0x10,
    0x4a,
    0x46,
    0x49,
    0x46,
    0x00,
    0x01,
    0x01,
    0x01,
    d >> 8,
    d & 0xff,
    d >> 8,
    d & 0xff,
    0x00,
    0x00
  ])
  const out = new Uint8Array(jpeg.length + app0.length)
  out.set(jpeg.subarray(0, 2), 0)
  out.set(app0, 2)
  out.set(jpeg.subarray(2), 2 + app0.length)
  return out
}

/** Sets the physical width/height on an SVG document's root element. */
export function setSvgPrintSize(svg: string, width: number, unit: PrintUnit): string {
  const open = /<svg\b[^>]*>/.exec(svg)
  if (!open) return svg
  const viewBox = /viewBox="\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)\s*"/.exec(open[0])
  if (!viewBox) return svg
  const height = (width * Number(viewBox[2])) / Number(viewBox[1])
  const tag = open[0]
    .replace(/\swidth="[^"]*"/, '')
    .replace(/\sheight="[^"]*"/, '')
    .replace(
      /^<svg\b/,
      `<svg width="${svgLength(width, unit)}" height="${svgLength(height, unit)}"`
    )
  return svg.slice(0, open.index) + tag + svg.slice(open.index + open[0].length)
}
