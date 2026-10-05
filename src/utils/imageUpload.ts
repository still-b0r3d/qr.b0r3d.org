/**
 * Reads an uploaded image as a data: URL, shrunk to at most `maxSide` pixels
 * on its longer side. A phone photo used as a logo is often several MB; kept
 * as is it fills the browser's storage (so settings stop being saved) and
 * slows every redraw, while the code never shows it bigger than this.
 *
 * SVGs and images that are already small enough are kept exactly as uploaded.
 */

/** Logos cover at most 30% of the code, so this stays sharp in large prints. */
export const MAX_LOGO_SIDE = 1024
/** Frame backgrounds can fill a whole print. */
export const MAX_BACKGROUND_SIDE = 2048
// Small files are kept as uploaded even if their pixel size is large.
const KEEP_AS_IS_BYTES = 256 * 1024

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Not an image the browser can open'))
    img.src = src
  })
}

export async function readImageFile(file: File, maxSide: number): Promise<string> {
  const original = await readAsDataUrl(file)
  if (file.type === 'image/svg+xml' || file.type === 'image/gif') return original
  let img: HTMLImageElement
  try {
    img = await loadImage(original)
  } catch {
    return original
  }
  const longest = Math.max(img.naturalWidth, img.naturalHeight)
  if (longest <= maxSide && file.size <= KEEP_AS_IS_BYTES) return original

  const scale = Math.min(1, maxSide / longest)
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale))
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale))
  const ctx = canvas.getContext('2d')
  if (!ctx) return original
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  // Photos stay JPEG; anything that may have transparency becomes PNG.
  const resized =
    file.type === 'image/jpeg' ? canvas.toDataURL('image/jpeg', 0.9) : canvas.toDataURL('image/png')
  // Re-encoding a small-dimension PNG can come out bigger; keep the smaller.
  return resized.length < original.length ? resized : original
}
