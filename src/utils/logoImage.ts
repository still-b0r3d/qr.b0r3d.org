// A logo given as a web address only ends up in a download if the other site
// allows it. Browsers will show any site's image on the page, but they refuse
// to draw it into an exported file unless that site sends CORS headers. So a
// remote logo is fetched once, here, and turned into a data: URL that the
// preview, the scan check and every export share. When the site doesn't allow
// that, the logo is left out everywhere, so the preview never shows something
// the download won't have.
import { isSafeImageUrl } from './qrCodePresets'

export type LogoStatus = 'none' | 'ready' | 'checking' | 'blocked' | 'failed'

export interface LogoResult {
  status: LogoStatus
  /** What to render; only set when status is 'ready'. */
  src?: string
}

export interface LogoDeps {
  fetch: typeof fetch
  /** Whether the browser can display the address as an image at all. */
  canDisplay: (url: string) => Promise<boolean>
}

const TIMEOUT_MS = 15000

export function isRemoteLogo(value: string): boolean {
  return /^https?:\/\//i.test(value.trim())
}

/**
 * Logos that need no network check: nothing, a data:image URL (uploads and
 * presets) or a path on this site. Returns null for a remote address.
 */
export function resolveLocalLogo(value: unknown): LogoResult | null {
  const v = typeof value === 'string' ? value.trim() : ''
  if (!v) return { status: 'none' }
  if (isRemoteLogo(v)) return null
  return isSafeImageUrl(v) ? { status: 'ready', src: v } : { status: 'failed' }
}

export async function fetchRemoteLogo(
  url: string,
  deps: LogoDeps = { fetch: (...args) => fetch(...args), canDisplay }
): Promise<LogoResult> {
  let response: Response
  try {
    response = await deps.fetch(url, {
      mode: 'cors',
      credentials: 'omit',
      signal: AbortSignal.timeout?.(TIMEOUT_MS)
    })
  } catch {
    // A CORS refusal and an unreachable address look the same to fetch(). If
    // the browser can still display the image, the site is refusing.
    return { status: (await deps.canDisplay(url)) ? 'blocked' : 'failed' }
  }
  if (!response.ok) return { status: 'failed' }
  try {
    const blob = await response.blob()
    const type = (blob.type || response.headers.get('content-type') || '')
      .split(';')[0]
      .trim()
      .toLowerCase()
    if (!type.startsWith('image/')) return { status: 'failed' }
    return { status: 'ready', src: await toDataUrl(blob, type) }
  } catch {
    return { status: 'failed' }
  }
}

async function toDataUrl(blob: Blob, type: string): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return `data:${type};base64,${btoa(binary)}`
}

function canDisplay(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image()
    const timer = setTimeout(() => resolve(false), TIMEOUT_MS)
    img.onload = () => {
      clearTimeout(timer)
      resolve(true)
    }
    img.onerror = () => {
      clearTimeout(timer)
      resolve(false)
    }
    img.src = url
  })
}
