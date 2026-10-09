/**
 * A one-page PDF (1.4) holding one image at a physical size, written by hand
 * so no PDF library ships with the app. The pixels are stored losslessly
 * (Flate, as in PNG), never as JPEG, so module and bar edges stay sharp; any
 * transparency is kept as a soft mask.
 */

export interface PdfImageOptions {
  /** Page (and image) width in millimetres. */
  widthMm: number
  /** Page (and image) height in millimetres. */
  heightMm: number
  /** RGBA pixels, row by row from the top, as ImageData holds them. */
  pixels: Uint8ClampedArray
  /** Image size in pixels. */
  width: number
  height: number
  /** Document title (shown by PDF viewers). */
  title?: string
}

const PT_PER_MM = 72 / 25.4

/** zlib-compressed bytes (what /FlateDecode expects), or null without CompressionStream. */
async function deflate(bytes: Uint8Array): Promise<Uint8Array | null> {
  if (typeof CompressionStream === 'undefined') return null
  const stream = new Blob([bytes as BlobPart])
    .stream()
    .pipeThrough(new CompressionStream('deflate'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

/** A PDF text string: plain when printable ASCII, else UTF-16BE with a BOM. */
function pdfString(text: string): string {
  if (/^[\x20-\x7e]*$/.test(text)) return `(${text.replace(/[\\()]/g, '\\$&')})`
  let hex = 'FEFF'
  for (let i = 0; i < text.length; i++) hex += text.charCodeAt(i).toString(16).padStart(4, '0')
  return `<${hex.toUpperCase()}>`
}

const pt = (mm: number) => +(mm * PT_PER_MM).toFixed(2)

export async function createPdfBlob(options: PdfImageOptions): Promise<Blob> {
  const { widthMm, heightMm, pixels, width, height, title } = options
  if (pixels.length !== width * height * 4) {
    throw new Error(`Expected ${width * height * 4} RGBA bytes, got ${pixels.length}`)
  }

  const rgb = new Uint8Array(width * height * 3)
  const alpha = new Uint8Array(width * height)
  let transparent = false
  for (let i = 0, j = 0; i < width * height; i++, j += 4) {
    rgb[i * 3] = pixels[j]
    rgb[i * 3 + 1] = pixels[j + 1]
    rgb[i * 3 + 2] = pixels[j + 2]
    alpha[i] = pixels[j + 3]
    if (pixels[j + 3] !== 255) transparent = true
  }

  const encoder = new TextEncoder()
  const objects: Uint8Array[][] = []
  const add = (...parts: (string | Uint8Array)[]) => {
    objects.push(parts.map((p) => (typeof p === 'string' ? encoder.encode(p) : p)))
    return objects.length
  }
  const imageStream = async (data: Uint8Array, dict: string) => {
    const packed = await deflate(data)
    const filter = packed ? ' /Filter /FlateDecode' : ''
    const body = packed ?? data
    return add(`<< ${dict}${filter} /Length ${body.length} >>\nstream\n`, body, '\nendstream')
  }

  const widthPt = pt(widthMm)
  const heightPt = pt(heightMm)
  const imageDict = `/Type /XObject /Subtype /Image /Width ${width} /Height ${height} /BitsPerComponent 8`
  const mask = transparent ? await imageStream(alpha, `${imageDict} /ColorSpace /DeviceGray`) : 0
  const image = await imageStream(
    rgb,
    `${imageDict} /ColorSpace /DeviceRGB${mask ? ` /SMask ${mask} 0 R` : ''}`
  )
  const drawing = `q ${widthPt} 0 0 ${heightPt} 0 0 cm /Im1 Do Q`
  const contents = add(`<< /Length ${drawing.length} >>\nstream\n${drawing}\nendstream`)
  // The page tree refers forward to the page, which refers back to it.
  const pages = objects.length + 1
  const page = pages + 1
  add(`<< /Type /Pages /Kids [${page} 0 R] /Count 1 >>`)
  add(
    `<< /Type /Page /Parent ${pages} 0 R /MediaBox [0 0 ${widthPt} ${heightPt}] ` +
      `/Resources << /XObject << /Im1 ${image} 0 R >> >> /Contents ${contents} 0 R >>`
  )
  const catalog = add(`<< /Type /Catalog /Pages ${pages} 0 R >>`)
  const info = add(`<< /Producer (b0r3d QR)${title ? ` /Title ${pdfString(title)}` : ''} >>`)

  // Header (with a binary comment so tools treat the file as binary),
  // numbered objects, then the cross-reference table pointing at each one.
  const parts: Uint8Array[] = [encoder.encode('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n')]
  let offset = parts[0].length
  const offsets: number[] = []
  objects.forEach((objectParts, i) => {
    offsets.push(offset)
    const wrapped = [
      encoder.encode(`${i + 1} 0 obj\n`),
      ...objectParts,
      encoder.encode('\nendobj\n')
    ]
    for (const part of wrapped) offset += part.length
    parts.push(...wrapped)
  })
  const xref =
    `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` +
    offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('') +
    `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R >>\n` +
    `startxref\n${offset}\n%%EOF\n`
  parts.push(encoder.encode(xref))
  return new Blob(parts as BlobPart[], { type: 'application/pdf' })
}

/** The RGBA pixels of an image file (a PNG export, say). */
export async function imagePixels(
  image: Blob
): Promise<{ pixels: Uint8ClampedArray; width: number; height: number }> {
  const bitmap = await createImageBitmap(image)
  try {
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('No 2D canvas')
    ctx.drawImage(bitmap, 0, 0)
    const { data } = ctx.getImageData(0, 0, bitmap.width, bitmap.height)
    return { pixels: data, width: bitmap.width, height: bitmap.height }
  } finally {
    bitmap.close()
  }
}
