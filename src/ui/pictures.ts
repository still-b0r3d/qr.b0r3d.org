// The pictures in designs (the logo, a frame's background), as design files keep them: data: URLs
// (PNG, JPEG, GIF, WebP and SVG pictures), a path on this site, or, on the website only, a web
// address, fetched once and kept as a data: URL so every file holds the picture itself.

import type { Picture } from '../qr/art'

type Entry =
  | { state: 'loading'; done: Promise<void> }
  | { state: 'ok'; picture: Picture }
  | { state: 'bad'; problem: string }

const kept = new Map<string, Entry>()
const KEEP = 8
const FETCH_TIME = 20_000

function remember(value: string, entry: Entry): void {
  kept.delete(value)
  kept.set(value, entry)
  while (kept.size > KEEP) kept.delete(kept.keys().next().value as string)
}

function decode(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.decoding = 'async'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('unreadable'))
    img.src = src
  })
}

function toDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

/** A blob's bytes as a data: URL of the given type. */
async function dataUrlAs(blob: Blob, type: string): Promise<string> {
  return `data:${type};base64,` + (await toDataUrl(blob)).split(',')[1]
}

const isWeb = (v: string) => /^https?:\/\//i.test(v)

async function picture(url: string): Promise<Picture> {
  const img = await decode(url)
  return { image: img, width: img.naturalWidth, height: img.naturalHeight, url }
}

async function fetchPicture(value: string): Promise<Entry> {
  let host: string
  try {
    host = new URL(value).host
  } catch {
    return { state: 'bad', problem: "That web address isn't one a browser can open." }
  }
  let blob: Blob
  try {
    const signal = typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(FETCH_TIME) : undefined
    const response = await fetch(value, { mode: 'cors', credentials: 'omit', referrerPolicy: 'no-referrer', signal })
    if (!response.ok) return { state: 'bad', problem: `${host} answered ${response.status} for it.` }
    blob = await response.blob()
  } catch {
    return {
      state: 'bad',
      problem: `Couldn't get it from ${host}: that site doesn't let other sites use its pictures, or it can't be reached. Save the picture, then choose the file.`
    }
  }
  // the bytes say what the picture is; a server's label can be wrong (text/plain for an SVG)
  const head = new Uint8Array(await blob.slice(0, 16).arrayBuffer())
  const type = (await looksLikeSvg(blob)) ? 'image/svg+xml' : (sniff(head) ?? (/^image\//i.test(blob.type) ? blob.type : null))
  if (!type) return { state: 'bad', problem: `What ${host} sent isn't a picture.` }
  try {
    return { state: 'ok', picture: await picture(await dataUrlAs(blob, type)) }
  } catch {
    return { state: 'bad', problem: `This browser can't draw the picture ${host} sent.` }
  }
}

async function load(value: string): Promise<Entry> {
  try {
    if (isWeb(value)) return await fetchPicture(value)
    if (/^data:/i.test(value)) {
      try {
        return { state: 'ok', picture: await picture(value) }
      } catch {
        return { state: 'bad', problem: "This picture's data is broken, or it's a kind this browser can't draw." }
      }
    }
    // a path on this site
    try {
      const img = await decode(new URL(value, location.href).href)
      return { state: 'ok', picture: { image: img, width: img.naturalWidth, height: img.naturalHeight, url: value } }
    } catch {
      return { state: 'bad', problem: `This picture is a file on the website (${value}) that isn't there.` }
    }
  } catch {
    return { state: 'bad', problem: "This browser couldn't read the picture." }
  }
}

/**
 * The picture for a design's value now: drawn, a problem, or not ready yet. A value not seen before
 * starts loading, and `whenLoaded` is called once it's ready (to draw again).
 */
export function pictureFor(value: string, whenLoaded: () => void): { picture: Picture | null; problem: string | null; loading: boolean } {
  const v = value.trim()
  if (!v) return { picture: null, problem: null, loading: false }
  let entry = kept.get(v)
  if (!entry) {
    const done = load(v).then((loaded) => {
      remember(v, loaded)
      whenLoaded()
    })
    entry = { state: 'loading', done }
    remember(v, entry)
  }
  if (entry.state === 'ok') return { picture: entry.picture, problem: null, loading: false }
  if (entry.state === 'bad') return { picture: null, problem: entry.problem, loading: false }
  return { picture: null, problem: null, loading: true }
}

/** Forgets a picture that failed, so it's fetched again when it's given again. */
export function forgetPicture(value: string): void {
  const v = value.trim()
  if (kept.get(v)?.state === 'bad') kept.delete(v)
}

/** Waits for these pictures, if they're still loading. */
export async function picturesReady(values: (string | null | undefined)[]): Promise<void> {
  const waiting: Promise<void>[] = []
  for (const value of values) {
    const entry = value ? kept.get(value.trim()) : undefined
    if (entry?.state === 'loading') waiting.push(entry.done)
  }
  await Promise.all(waiting)
}

// ---------- pictures chosen, pasted or dropped ----------

/**
 * Does this text look like an SVG file: is its first element <svg> (or <prefix:svg>), after any XML
 * declaration, processing instructions, comments and DOCTYPE (with its own [...] part)? Not a PNG,
 * nor a web page with a drawing in it. (The PC app's rule.)
 */
export function looksLikeSvgText(s: string): boolean {
  let at = 0
  for (;;) {
    while (at < s.length && /\s/.test(s[at])) at++
    if (at >= s.length || s[at] !== '<') return false
    let end = s.startsWith('<?', at) ? '?>' : s.startsWith('<!--', at) ? '-->' : null
    if (end === null && s.startsWith('<!DOCTYPE', at)) {
      const bracket = s.indexOf('[', at)
      const close = s.indexOf('>', at)
      end = bracket >= 0 && bracket < close ? ']>' : '>'
    }
    if (end === null) break
    const found = s.indexOf(end, at + 2)
    if (found < 0) return false
    at = found + end.length
  }
  let stop = at + 1
  while (stop < s.length && !/\s/.test(s[stop]) && s[stop] !== '>' && s[stop] !== '/') stop++
  const tag = s.slice(at + 1, stop)
  return tag === 'svg' || tag.endsWith(':svg')
}

async function looksLikeSvg(blob: Blob): Promise<boolean> {
  const head = new Uint8Array(await blob.slice(0, 65536).arrayBuffer())
  return looksLikeSvgText(new TextDecoder().decode(head))
}

function sniff(bytes: Uint8Array): string | null {
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png'
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) return 'image/gif'
  const riff = bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
  if (riff && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return 'image/webp'
  return null
}

function canvasBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('no picture'))), type, quality))
}

/**
 * A picture for a design, as b0r3d QR keeps one: as it is when it's small enough (at most `largest`
 * pixels each way and 256 KB) and a kind every browser shows; otherwise shrunk to `largest` pixels
 * on its longer side, as a JPEG if it was one and a PNG otherwise, whichever of the two comes out
 * smaller (turned the right way up). SVG and GIF pictures are kept as they are, once they've been
 * drawn. Throws with why a file can't be used.
 */
export async function designPicture(file: Blob, largest: number): Promise<string> {
  if (file.size > 64 * 1024 * 1024) throw new Error("it's over 64 MB")
  if (await looksLikeSvg(file)) {
    const url = await dataUrlAs(file, 'image/svg+xml')
    try {
      await decode(url)
    } catch {
      throw new Error("it's an SVG drawing this browser can't draw")
    }
    return url
  }
  const bytes = new Uint8Array(await file.arrayBuffer())
  const type = sniff(bytes)
  const known = type === 'image/png' || type === 'image/jpeg' || type === 'image/gif'
  const original = known && type ? await dataUrlAs(new Blob([bytes]), type) : null
  if (type === 'image/gif' && original) {
    try {
      await decode(original)
    } catch {
      throw new Error("this browser can't read it as a picture")
    }
    return original
  }
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(new Blob([bytes]), { imageOrientation: 'from-image' })
  } catch {
    throw new Error("this browser can't read it as a picture")
  }
  const longest = Math.max(bitmap.width, bitmap.height)
  if (original && longest <= largest && bytes.length <= 256 * 1024) {
    bitmap.close()
    return original
  }
  const scale = Math.min(1, largest / longest)
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(bitmap.width * scale))
  canvas.height = Math.max(1, Math.round(bitmap.height * scale))
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error("this browser couldn't draw it")
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  const jpeg = type === 'image/jpeg'
  const again = await canvasBlob(canvas, jpeg ? 'image/jpeg' : 'image/png', jpeg ? 0.9 : undefined)
  canvas.width = canvas.height = 0
  const smaller = await toDataUrl(again)
  return original && original.length <= smaller.length ? original : smaller
}

/**
 * A picture on the clipboard, or null: a picture, or an SVG drawing copied as text (a design
 * program's Copy as SVG). The browser asks before letting the page look.
 */
export async function clipboardPicture(): Promise<Blob | null> {
  if (!navigator.clipboard?.read) return null
  const items = await navigator.clipboard.read()
  for (const item of items) {
    const svg = item.types.find((t) => t === 'image/svg+xml')
    if (svg) return item.getType(svg)
    const type = item.types.find((t) => t.startsWith('image/'))
    if (type) return item.getType(type)
  }
  for (const item of items) {
    if (!item.types.includes('text/plain')) continue
    const text = (await (await item.getType('text/plain')).text()).trim()
    if (looksLikeSvgText(text.slice(0, 65536))) return new Blob([text], { type: 'image/svg+xml' })
  }
  return null
}
