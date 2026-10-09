import { IS_COPY_IMAGE_TO_CLIPBOARD_SUPPORTED } from '@/utils/clipboard'
import { downloadBlob } from '@/utils/download'
import { buildSvgExportString, rasterizeSvg, type SvgExportInput } from '@/lib/qr-code'
import { createPdfBlob, imagePixels } from '@/utils/pdf'
import {
  printWidthPx,
  setJpegDpi,
  setPngDpi,
  setSvgPrintSize,
  toMillimetres,
  type PrintUnit
} from '@/utils/printSize'

/** Export at a physical size: `width` (frame included) in `unit`, at `dpi`. */
export interface PrintOptions {
  width: number
  unit: PrintUnit
  dpi: number
}

export interface PrintableSvgInput extends SvgExportInput {
  print?: PrintOptions
}

export interface ImageExportInput extends PrintableSvgInput {
  /**
   * Output raster dimensions for PNG/JPG. Defaults to the SVG's natural size
   * (i.e., `size` for no-frame, or the frame's computed outer dimensions).
   */
  targetSize?: { width: number; height: number }
  /** JPEG/PNG encoder quality 0–1 (JPEG only; PNG ignores). */
  quality?: number
  /** Background colour for JPG (no transparency). Defaults to white. */
  jpgBackground?: string
}

interface RenderedSize {
  width: number
  height: number
}

const SVG_VIEWBOX_RE = /viewBox="0 0 ([0-9.]+) ([0-9.]+)"/

function naturalSizeFromSvg(svgString: string): RenderedSize | null {
  const m = SVG_VIEWBOX_RE.exec(svgString)
  if (!m) return null
  return { width: Number(m[1]), height: Number(m[2]) }
}

function pickTargetSize(input: ImageExportInput, svgString: string): RenderedSize {
  const natural = naturalSizeFromSvg(svgString)
  if (input.print && natural && natural.width > 0) {
    // Exactly the requested print width; height keeps the SVG's proportions.
    const width = printWidthPx(input.print)
    return { width, height: Math.round((width * natural.height) / natural.width) }
  }
  if (input.targetSize) {
    // The SVG that gets rasterised is the source of truth for layout — its
    // viewBox already encodes the correct proportions (square QR + frame
    // chrome). `targetSize` is measured off the live DOM preview, whose aspect
    // ratio can diverge from the SVG (e.g. side-text frames, where the SVG uses
    // an approximate text-width heuristic). Honouring it verbatim would stretch
    // the raster non-uniformly and squash the QR (issue #290). So we keep the
    // SVG's aspect ratio and use `targetSize` only to pick a uniform scale —
    // large enough to cover the requested box so the QR is never downscaled.
    if (natural && natural.width > 0 && natural.height > 0) {
      const scale = Math.max(
        input.targetSize.width / natural.width,
        input.targetSize.height / natural.height
      )
      return { width: natural.width * scale, height: natural.height * scale }
    }
    return input.targetSize
  }
  if (natural) return natural
  // Fallback to size hint or a reasonable default.
  const hint = input.size
  if (hint) return hint
  return { width: 400, height: 400 }
}

async function rasterizeFromInput(
  input: ImageExportInput,
  mime: 'image/png' | 'image/jpeg'
): Promise<Blob> {
  const svgString = buildSvgExportString(input)
  const { width, height } = pickTargetSize(input, svgString)
  const blob = await rasterizeSvg({
    svgString,
    width,
    height,
    mimeType: mime,
    quality: input.quality,
    background: mime === 'image/jpeg' ? (input.jpgBackground ?? '#ffffff') : undefined
  })
  if (!input.print) return blob
  // Record the DPI so layout and print programs place it at the right size.
  const bytes = new Uint8Array(await blob.arrayBuffer())
  const withDpi =
    mime === 'image/png' ? setPngDpi(bytes, input.print.dpi) : setJpegDpi(bytes, input.print.dpi)
  return new Blob([withDpi], { type: mime })
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

/* ---------- PNG ---------- */

export async function getPngBlob(input: ImageExportInput): Promise<Blob> {
  return rasterizeFromInput(input, 'image/png')
}

export async function getPngElement(input: ImageExportInput): Promise<string> {
  const blob = await getPngBlob(input)
  return blobToDataUrl(blob)
}

/** Resolves to whether the file was made and handed to the browser. */
export async function downloadPngElement(
  input: ImageExportInput,
  filename: string
): Promise<boolean> {
  try {
    const blob = await getPngBlob(input)
    downloadBlob(blob, filename)
    return true
  } catch (error) {
    console.error('Error generating PNG export:', error)
    return false
  }
}

/**
 * A small PNG of the code (about `side` px on its shorter edge) as a data:
 * URL, for the Recent codes list. Screen size, whatever print size is set.
 */
export async function getThumbnailDataUrl(input: ImageExportInput, side = 160): Promise<string> {
  return getPngElement({ ...input, print: undefined, targetSize: { width: side, height: side } })
}

/* ---------- JPG ---------- */

export async function getJpgBlob(input: ImageExportInput): Promise<Blob> {
  return rasterizeFromInput(input, 'image/jpeg')
}

export async function getJpgElement(input: ImageExportInput): Promise<string> {
  const blob = await getJpgBlob(input)
  return blobToDataUrl(blob)
}

/** Resolves to whether the file was made and handed to the browser. */
export async function downloadJpgElement(
  input: ImageExportInput,
  filename: string
): Promise<boolean> {
  try {
    const blob = await getJpgBlob(input)
    downloadBlob(blob, filename)
    return true
  } catch (error) {
    console.error('Error generating JPG export:', error)
    return false
  }
}

/* ---------- PDF ---------- */

/** CSS pixels per inch: the page size of a PDF made without a print size. */
const SCREEN_DPI = 96
/** Drawn at this DPI without a print size, so the PDF prints sharply... */
const PDF_DPI = 300
/** ...unless that would be wider than this many pixels. */
const MAX_PDF_PIXELS = 4096

/**
 * The PNG export, losslessly, on a page of its physical size: the print size
 * when one is set (frame included, at its DPI), otherwise the image's size at
 * 96 px per inch, drawn at up to 300 DPI.
 */
export async function getPdfBlob(input: ImageExportInput, title?: string): Promise<Blob> {
  let print = input.print
  if (!print) {
    const { width } = pickTargetSize(input, buildSvgExportString(input))
    const inches = width / SCREEN_DPI
    print = {
      width: inches * 25.4,
      unit: 'mm',
      dpi: Math.max(1, Math.min(PDF_DPI, Math.floor(MAX_PDF_PIXELS / inches)))
    }
  }
  const png = await rasterizeFromInput({ ...input, print }, 'image/png')
  const image = await imagePixels(png)
  const widthMm = toMillimetres(print.width, print.unit)
  // The height follows the image as drawn, never the preview's proportions.
  return createPdfBlob({
    ...image,
    widthMm,
    heightMm: (widthMm * image.height) / image.width,
    title
  })
}

/** Resolves to whether the file was made and handed to the browser. */
export async function downloadPdfElement(
  input: ImageExportInput,
  filename: string,
  title?: string
): Promise<boolean> {
  try {
    downloadBlob(await getPdfBlob(input, title), filename)
    return true
  } catch (error) {
    console.error('Error generating PDF export:', error)
    return false
  }
}

/* ---------- Clipboard ---------- */

/** Resolves to whether the image reached the clipboard. */
export async function copyImageToClipboard(input: ImageExportInput): Promise<boolean> {
  if (!IS_COPY_IMAGE_TO_CLIPBOARD_SUPPORTED) {
    console.error('Clipboard.write is not supported')
    return false
  }
  try {
    const blob = await getPngBlob(input)
    await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })])
    return true
  } catch (error) {
    console.error('Error copying image to clipboard:', error)
    return false
  }
}

/* ---------- SVG (already lib-backed) ---------- */

function withPrintSize(svg: string, input: PrintableSvgInput): string {
  return input.print ? setSvgPrintSize(svg, input.print.width, input.print.unit) : svg
}

export function getSvgString(input: PrintableSvgInput): string {
  return withPrintSize(buildSvgExportString(input), input)
}

/**
 * Build an SVG export string with any external `<image href="http(s)://...">`
 * resources inlined as data URIs. Without this, viewers that sandbox local
 * SVG files (macOS Preview/Quick Look, browsers opened on file://) refuse
 * to fetch the external image and render a broken-image placeholder.
 * On a fetch failure the original href is kept and a warning is logged.
 */
export async function getInlinedSvgString(input: PrintableSvgInput): Promise<string> {
  return inlineExternalImagesInSvg(getSvgString(input))
}

export function getSvgElement(input: PrintableSvgInput): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(getSvgString(input))}`
}

/** Resolves to whether the file was made and handed to the browser. */
export async function downloadSvgElement(
  input: PrintableSvgInput,
  filename: string
): Promise<boolean> {
  try {
    const svgString = await getInlinedSvgString(input)
    const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' })
    downloadBlob(blob, filename)
    return true
  } catch (error) {
    console.error('Error generating SVG export:', error)
    return false
  }
}

async function inlineExternalImagesInSvg(svgString: string): Promise<string> {
  // Collect unique external (non-data:) hrefs referenced in the SVG. Targets
  // either `href="..."` or `xlink:href="..."` attribute values.
  const urls = new Set<string>()
  const re = /\b(?:xlink:)?href="([^"]+)"/g
  let m: RegExpExecArray | null
  while ((m = re.exec(svgString)) !== null) {
    const url = m[1]
    if (url.startsWith('data:')) continue
    if (!/^https?:\/\//i.test(url)) continue
    urls.add(url)
  }
  if (urls.size === 0) return svgString

  const replacements = new Map<string, string>()
  await Promise.all(
    Array.from(urls).map(async (url) => {
      try {
        const dataUri = await fetchAsDataUri(url)
        replacements.set(url, dataUri)
      } catch (err) {
        console.warn(`Failed to inline image href for SVG export: ${url}`, err)
      }
    })
  )

  let result = svgString
  for (const [url, dataUri] of replacements) {
    result = result.split(url).join(dataUri)
  }
  return result
}

async function fetchAsDataUri(url: string): Promise<string> {
  const response = await fetch(url, { mode: 'cors' })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const blob = await response.blob()
  return blobToDataUrl(blob)
}
