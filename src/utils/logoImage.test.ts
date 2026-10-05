import { describe, expect, it } from 'vitest'
import { fetchRemoteLogo, resolveLocalLogo, type LogoDeps } from './logoImage'

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 1, 2, 255])

function deps(
  fetchImpl: () => Promise<Response>,
  displayable = false
): LogoDeps & { displayChecks: string[] } {
  const displayChecks: string[] = []
  return {
    fetch: fetchImpl as unknown as typeof fetch,
    canDisplay: async (url) => {
      displayChecks.push(url)
      return displayable
    },
    displayChecks
  }
}

describe('resolveLocalLogo', () => {
  it('treats an empty value as no logo', () => {
    expect(resolveLocalLogo('')).toEqual({ status: 'none' })
    expect(resolveLocalLogo('   ')).toEqual({ status: 'none' })
    expect(resolveLocalLogo(undefined)).toEqual({ status: 'none' })
  })

  it('uses data:image URLs (uploads, presets) and site paths as they are', () => {
    const data = 'data:image/png;base64,iVBORw0KGgo='
    expect(resolveLocalLogo(data)).toEqual({ status: 'ready', src: data })
    expect(resolveLocalLogo('/logo.png')).toEqual({ status: 'ready', src: '/logo.png' })
  })

  it('refuses other schemes', () => {
    expect(resolveLocalLogo('javascript:alert(1)')).toEqual({ status: 'failed' })
    expect(resolveLocalLogo('data:text/html,<b>x</b>')).toEqual({ status: 'failed' })
  })

  it('leaves remote addresses to fetchRemoteLogo', () => {
    expect(resolveLocalLogo('https://example.com/logo.png')).toBeNull()
    expect(resolveLocalLogo(' HTTP://example.com/logo.png ')).toBeNull()
  })
})

describe('fetchRemoteLogo', () => {
  it('turns an image the site shares into a data: URL with the same bytes', async () => {
    const d = deps(
      async () => new Response(PNG_BYTES, { headers: { 'content-type': 'image/png' } })
    )
    const result = await fetchRemoteLogo('https://example.com/logo.png', d)
    expect(result.status).toBe('ready')
    expect(result.src).toMatch(/^data:image\/png;base64,/)
    const b64 = result.src!.split(',')[1]
    expect(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))).toEqual(PNG_BYTES)
    expect(d.displayChecks).toEqual([])
  })

  it('drops content-type parameters from the data: URL', async () => {
    const d = deps(
      async () =>
        new Response('<svg xmlns="http://www.w3.org/2000/svg"/>', {
          headers: { 'content-type': 'image/svg+xml; charset=utf-8' }
        })
    )
    const result = await fetchRemoteLogo('https://example.com/logo.svg', d)
    expect(result.src).toMatch(/^data:image\/svg\+xml;base64,/)
  })

  it('reports blocked when fetch is refused but the image still displays', async () => {
    const d = deps(async () => {
      throw new TypeError('Failed to fetch')
    }, true)
    expect(await fetchRemoteLogo('https://example.com/logo.png', d)).toEqual({ status: 'blocked' })
    expect(d.displayChecks).toEqual(['https://example.com/logo.png'])
  })

  it('reports failed when the address does not load as an image at all', async () => {
    const d = deps(async () => {
      throw new TypeError('Failed to fetch')
    }, false)
    expect(await fetchRemoteLogo('https://example.invalid/logo.png', d)).toEqual({
      status: 'failed'
    })
  })

  it('reports failed for HTTP errors and non-image responses', async () => {
    const notFound = deps(async () => new Response('nope', { status: 404 }))
    expect(await fetchRemoteLogo('https://example.com/a.png', notFound)).toEqual({
      status: 'failed'
    })
    const html = deps(
      async () => new Response('<html></html>', { headers: { 'content-type': 'text/html' } })
    )
    expect(await fetchRemoteLogo('https://example.com/page', html)).toEqual({ status: 'failed' })
  })
})
