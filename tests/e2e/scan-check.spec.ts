import { test, expect } from '@playwright/test'

test.describe('Will it scan? check', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  const status = (page: import('@playwright/test').Page) => page.locator('#scan-check')

  test('confirms a plain code scans', async ({ page }) => {
    await page.locator('#data').fill('https://b0r3d.org/scan-test')
    await expect(status(page)).toContainText('Scans. A test decode matches your data exactly.', {
      timeout: 10000
    })
  })

  test('decodes emoji and other Unicode text exactly', async ({ page }) => {
    await page.locator('#data').fill('Static QR ✅ no expiry 🎉☕ — ünïcödé 日本語')
    await expect(status(page)).toContainText('Scans.', { timeout: 10000 })
  })

  test('the Rukus and b0r3d Cup presets scan', async ({ page }) => {
    await page.locator('#data').fill('https://b0r3d.org')
    for (const preset of ['Rukus', 'b0r3d Cup']) {
      await page.getByRole('combobox', { name: /select qr code preset/i }).click()
      await page.getByRole('option', { name: preset, exact: true }).click()
      await expect(status(page), preset).toContainText('Scans.', { timeout: 10000 })
    }
  })

  test('reports a code that will not scan, and why', async ({ page }) => {
    await page.locator('#data').fill('https://b0r3d.org')
    await page.locator('#dots-color').fill('#dddddd')
    await page.locator('#corners-square-color').fill('#dddddd')
    await page.locator('#corners-dot-color').fill('#dddddd')
    await expect(status(page)).toContainText("Didn't scan in a test decode", { timeout: 10000 })
    await expect(status(page)).toContainText('Low contrast')
  })

  test('warns about light-on-dark codes and a missing quiet zone', async ({ page }) => {
    await page.locator('#data').fill('https://b0r3d.org')
    await page.locator('#dots-color').fill('#ffffff')
    await page.locator('#corners-square-color').fill('#ffffff')
    await page.locator('#corners-dot-color').fill('#ffffff')
    await page.locator('#background-color').fill('#000000')
    await page.locator('#margin').fill('0')
    await expect(status(page)).toContainText('Light code on a dark background')
    await expect(status(page)).toContainText('Only 0 modules of blank space')
  })
})
