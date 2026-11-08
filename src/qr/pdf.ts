// A PDF file of one page with one picture on it, placed at an exact size in points (72 to an
// inch). The picture keeps its pixels, compressed, with a soft mask for see-through parts, so the
// code prints exactly as it was drawn. Written by hand, as the PC app writes its own: it's a few
// objects.

export const POINTS_PER_INCH = 72

/** Deflate as PDF wants it: zlib's two-byte header, the deflated bytes, then the Adler-32 sum. */
async function zlib(data: Uint8Array<ArrayBuffer>): Promise<Uint8Array> {
  const stream = new Blob([data]).stream().pipeThrough(new CompressionStream('deflate'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

function n(d: number): string {
  // to 3 decimals, halves to even, as the PC app writes them
  const power = 1000
  const x = d * power
  const floor = Math.floor(x)
  const rest = x - floor
  const r = (rest > 0.5 ? floor + 1 : rest < 0.5 ? floor : floor % 2 === 0 ? floor : floor + 1) / power
  return r === 0 ? '0' : String(r)
}

/** A PDF text string: plain ASCII as it is, anything else as UTF-16 with its byte-order mark. */
export function pdfString(text: string): string {
  let ascii = true
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i)
    if (c < 0x20 || c > 0x7e) {
      ascii = false
      break
    }
  }
  if (ascii) return '(' + text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)') + ')'
  let hex = '<FEFF'
  for (let i = 0; i < text.length; i++) hex += text.charCodeAt(i).toString(16).toUpperCase().padStart(4, '0')
  return hex + '>'
}

/**
 * The PDF for a picture's RGBA pixels (`width` x `height`, not premultiplied), on a page
 * `pageWidth` x `pageHeight` points, filling it.
 */
export async function makePdf(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  pageWidth: number,
  pageHeight: number,
  title: string,
  producer: string
): Promise<Blob> {
  const count = width * height
  const rgb = new Uint8Array(count * 3)
  const alpha = new Uint8Array(count)
  let seeThrough = false
  for (let i = 0, j = 0; i < count; i++, j += 4) {
    const a = rgba[j + 3]
    alpha[i] = a
    if (a !== 255) seeThrough = true
    rgb[i * 3] = rgba[j]
    rgb[i * 3 + 1] = rgba[j + 1]
    rgb[i * 3 + 2] = rgba[j + 2]
  }

  const parts: Uint8Array[] = []
  let length = 0
  const offsets: number[] = []
  const ascii = new TextEncoder()
  const add = (bytes: Uint8Array) => {
    parts.push(bytes)
    length += bytes.length
  }
  const text = (s: string) => add(ascii.encode(s))
  const start = (number: number) => {
    offsets.push(length)
    text(number + ' 0 obj\n')
  }

  text('%PDF-1.4\n%')
  add(new Uint8Array([0xe2, 0xe3, 0xcf, 0xd3])) // bytes over 127 mark the file as binary for programs that look
  text('\n')
  start(1)
  text('<< /Type /Catalog /Pages 2 0 R >>\nendobj\n')
  start(2)
  text('<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n')
  start(3)
  text(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${n(pageWidth)} ${n(pageHeight)}] /Resources << /XObject << /Code 4 0 R >> >> /Contents 5 0 R >>\nendobj\n`)

  const colours = await zlib(rgb)
  start(4)
  text(
    `<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode` +
      (seeThrough ? ' /SMask 7 0 R' : '') +
      ` /Length ${colours.length} >>\nstream\n`
  )
  add(colours)
  text('\nendstream\nendobj\n')

  // the picture fills the page; PDF counts up from the bottom of the page
  const content = ascii.encode(`q ${n(pageWidth)} 0 0 ${n(pageHeight)} ${n(0)} ${n(0)} cm /Code Do Q\n`)
  start(5)
  text(`<< /Length ${content.length} >>\nstream\n`)
  add(content)
  text('endstream\nendobj\n')

  start(6)
  text(`<< /Title ${pdfString(title)} /Producer ${pdfString(producer)} >>\nendobj\n`)

  if (seeThrough) {
    const mask = await zlib(alpha)
    start(7)
    text(`<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode /Length ${mask.length} >>\nstream\n`)
    add(mask)
    text('\nendstream\nendobj\n')
  }

  const xref = length
  let table = `xref\n0 ${offsets.length + 1}\n0000000000 65535 f \n`
  for (const o of offsets) table += String(o).padStart(10, '0') + ' 00000 n \n'
  text(table + `trailer\n<< /Size ${offsets.length + 1} /Root 1 0 R /Info 6 0 R >>\nstartxref\n${xref}\n%%EOF\n`)
  return new Blob(parts as BlobPart[], { type: 'application/pdf' })
}
