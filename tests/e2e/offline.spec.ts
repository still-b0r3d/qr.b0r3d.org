import { expect, test } from '@playwright/test'

// The offline copy only exists in a built site:
//   pnpm build, then `vite preview --port 4175`, then
//   E2E_BASE_URL=http://127.0.0.1:4175/ pnpm test:e2e --project=chromium offline
test.describe('offline', () => {
  test.skip(() => !process.env.E2E_BASE_URL, 'needs a built copy (E2E_BASE_URL)')
  test.skip(({ browserName, isMobile }) => browserName !== 'chromium' || isMobile, 'Chromium is enough')

  test('works with no network once visited, and clears what the earlier site kept', async ({ context, page }) => {
    // the earlier site's service worker kept its files in caches like these
    await page.goto('/LICENSE.txt')
    const origin = new URL(page.url()).origin
    await page.evaluate(async (origin) => {
      for (const name of [`workbox-precache-v2-${origin}/`, 'pages', 'wasm', 'fonts']) {
        const cache = await caches.open(name)
        await cache.put('/old-file', new Response('old'))
      }
    }, origin)

    await page.goto('/')
    await page.waitForFunction(async () => {
      await navigator.serviceWorker.ready
      return navigator.serviceWorker.controller !== null
    }, null, { timeout: 30_000 })
    const kept = await page.evaluate(() => caches.keys())
    expect(kept).toHaveLength(1)
    expect(kept[0]).toMatch(/^b0r3d-qr-[0-9a-f]{16}$/)

    await context.setOffline(true)
    await page.reload()
    await expect(page.getByTestId('check')).toHaveAttribute('data-result', 'ok', { timeout: 20_000 })
    await page.locator('#data').fill('made offline')
    await expect(page.getByTestId('check')).toHaveAttribute('data-result', 'ok', { timeout: 20_000 })
    // a caption font's Latin letters are kept for offline use too
    await page.locator('details.sec summary', { hasText: /^Frame$/ }).click()
    await page.locator('#frame-on').check()
    await page.locator('#caption-font').selectOption({ label: 'Pacifico' })
    await expect.poll(() => page.evaluate(() => [...document.fonts].some((f) => f.family.includes('Pacifico') && f.status === 'loaded'))).toBe(true)
    await expect(page.getByTestId('check')).toHaveAttribute('data-result', 'ok', { timeout: 20_000 })
    await page.goto('/LICENSE.txt')
    await expect(page.locator('body')).toContainText('Licensor: b0r3d.org')
    await context.setOffline(false)
  })

  test('the manifest makes it installable', async ({ request }) => {
    const manifest = await (await request.get('/manifest.webmanifest')).json()
    expect(manifest).toMatchObject({ name: 'b0r3d QR', start_url: '/', scope: '/', display: 'standalone' })
    for (const icon of manifest.icons) expect((await request.get('/' + icon.src)).status()).toBe(200)
  })
})
