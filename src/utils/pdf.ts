/**
 * Direct PDF generator for vector and high-DPI print exports.
 * Generates ISO 32000-1 (PDF-1.4) compliant documents in the browser
 * with zero external dependencies.
 */

export interface PdfDocumentOptions {
  /** Page width in millimetres. */
  widthMm: number
  /** Page height in millimetres. */
  heightMm: number
  /** Binary JPEG bytes. */
  jpegBytes: Uint8Array
  /** Image dimensions in pixels. */
  imageWidthPx: number
  imageHeightPx: number
  /** Title metadata. */
  title?: string
}

export function createPdfBlob(options: PdfDocumentOptions): Blob {
  const { widthMm, heightMm, jpegBytes, imageWidthPx, imageHeightPx, title } = options
  const MM_TO_PT = 72 / 25.4
  const widthPt = +(widthMm * MM_TO_PT).toFixed(2)
  const heightPt = +(heightMm * MM_TO_PT).toFixed(2)

  // Content stream: paint image onto full page
  const contentStream = `q\n${widthPt} 0 0 ${heightPt} 0 0 cm\n/Im1 Do\nQ\n`
  const encoder = new TextEncoder()
  const contentBytes = encoder.encode(contentStream)

  const objects: Uint8Array[] = []

  // 1: Catalog
  objects.push(encoder.encode(`1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`))

  // 2: Pages
  objects.push(encoder.encode(`2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n`))

  // 3: Page
  objects.push(
    encoder.encode(
      `3 0 obj\n<<\n  /Type /Page\n  /Parent 2 0 R\n  /MediaBox [0 0 ${widthPt} ${heightPt}]\n  /Contents 4 0 R\n  /Resources <<\n    /XObject << /Im1 5 0 R >>\n  >>\n>>\nendobj\n`
    )
  )

  // 4: Contents stream
  const obj4Header = encoder.encode(`4 0 obj\n<< /Length ${contentBytes.length} >>\nstream\n`)
  const obj4Footer = encoder.encode(`\nendstream\nendobj\n`)
  const obj4 = new Uint8Array(obj4Header.length + contentBytes.length + obj4Footer.length)
  obj4.set(obj4Header)
  obj4.set(contentBytes, obj4Header.length)
  obj4.set(obj4Footer, obj4Header.length + contentBytes.length)
  objects.push(obj4)

  // 5: Image XObject with /DCTDecode (JPEG)
  const obj5Header = encoder.encode(
    `5 0 obj\n<<\n  /Type /XObject\n  /Subtype /Image\n  /Width ${imageWidthPx}\n  /Height ${imageHeightPx}\n  /ColorSpace /DeviceRGB\n  /BitsPerComponent 8\n  /Filter /DCTDecode\n  /Length ${jpegBytes.length}\n>>\nstream\n`
  )
  const obj5Footer = encoder.encode(`\nendstream\nendobj\n`)
  const obj5 = new Uint8Array(obj5Header.length + jpegBytes.length + obj5Footer.length)
  obj5.set(obj5Header)
  obj5.set(jpegBytes, obj5Header.length)
  obj5.set(obj5Footer, obj5Header.length + jpegBytes.length)
  objects.push(obj5)

  // Optional 6: Info dict if title given
  let infoRef = ''
  if (title) {
    const escapedTitle = title.replace(/[()\\]/g, '\\$&')
    objects.push(
      encoder.encode(`6 0 obj\n<< /Title (${escapedTitle}) /Producer (b0r3d QR) >>\nendobj\n`)
    )
    infoRef = ' /Info 6 0 R'
  }

  const header = encoder.encode('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n')
  const offsets = [0]
  let currentOffset = header.length

  for (let i = 0; i < objects.length; i++) {
    offsets.push(currentOffset)
    currentOffset += objects[i].length
  }

  const startxref = currentOffset
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (let i = 1; i <= objects.length; i++) {
    xref += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`
  }
  xref += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R${infoRef} >>\nstartxref\n${startxref}\n%%EOF\n`
  const xrefBytes = encoder.encode(xref)

  return new Blob([header, ...objects, xrefBytes] as BlobPart[], { type: 'application/pdf' })
}
