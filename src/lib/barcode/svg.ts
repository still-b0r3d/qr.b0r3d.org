/**
 * zint's SVG output, tidied and recoloured. zint draws at one unit per module
 * (the narrowest bar), with the quiet zones and any text underneath included:
 *
 *   <svg width="113" height="59" …><desc>…</desc>
 *    <g id="barcode" fill="#000000">
 *     <rect x="0" y="0" width="113" height="59" fill="#FFFFFF"/>
 *     <path d="M11 0h1v55h-1Z…"/>  <text …>4</text> …
 */

export interface BarcodeSvg {
  /** Standalone SVG, sized one unit per module. */
  svg: string
  /** Size in modules, quiet zones and text included. */
  width: number
  height: number
}

export interface BarcodeStyle {
  /** Bars, modules and text. */
  color: string
  /** Background, or 'transparent' for none. */
  background: string
  /** Pixels per module. */
  scale: number
}

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Drops the XML prolog, doctype and description and reads the size. */
export function cleanZintSvg(raw: string): BarcodeSvg {
  const start = raw.indexOf('<svg')
  if (start < 0) throw new Error('The encoder returned no SVG')
  const svg = raw.slice(start).replace(/<desc>[\s\S]*?<\/desc>\s*/, '')
  const open = /<svg\b[^>]*>/.exec(svg)![0]
  const width = Number(/\bwidth="([\d.]+)"/.exec(open)?.[1])
  const height = Number(/\bheight="([\d.]+)"/.exec(open)?.[1])
  if (!(width > 0 && height > 0)) throw new Error('The encoder returned an SVG without a size')
  return { svg, width, height }
}

/**
 * Applies colours and size. The result keeps its viewBox in modules, so it
 * can be resized (or given a print size) by changing width/height alone.
 */
export function styleBarcodeSvg(barcode: BarcodeSvg, style: BarcodeStyle): string {
  const { width, height } = barcode
  const transparent = style.background === 'transparent'
  return barcode.svg
    .replace(
      /<svg\b[^>]*>/,
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" ` +
        `width="${width * style.scale}" height="${height * style.scale}" shape-rendering="crispEdges">`
    )
    .replace(/(<g id="barcode" fill=")[^"]*"/, `$1${escapeAttr(style.color)}"`)
    .replace(/<rect x="0" y="0" width="[\d.]+" height="[\d.]+" fill="[^"]*"\/>\s*/, (rect) =>
      transparent ? '' : rect.replace(/fill="[^"]*"/, `fill="${escapeAttr(style.background)}"`)
    )
}

/** A data: URL for showing the SVG in an <img>, where nothing in it can run. */
export function svgDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

/** zint's "Error 275: Invalid check digit '2', expecting '1' (retval: 7)" → the middle part. */
export function friendlyEncoderError(message: string): string {
  const text = message
    .replace(/^Error \d+:\s*/, '')
    .replace(/\s*\(retval: \d+\)\s*$/, '')
    .trim()
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : 'This text cannot be encoded.'
}
