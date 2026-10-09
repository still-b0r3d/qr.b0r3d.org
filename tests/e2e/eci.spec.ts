import { test, expect, type Page } from '@playwright/test'
import fs from 'fs'
import { Buffer } from 'node:buffer'
import jsQR from 'jsqr'
import { PNG } from 'pngjs'

// The "Mark the text as UTF-8 (ECI 26)" setting. jsQR lists an ECI header
// among its decoded chunks.
const TEXT = 'Grüße 😀 日本語 b0r3d'

function decodePng(buffer: Buffer) {
  const png = PNG.sync.read(buffer)
  return jsQR(new Uint8ClampedArray(png.data), png.width, png.height)
}

async function exportPng(page: Page) {
  const pending = page.waitForEvent('download')
  await page.locator('#download-qr-image-button-png').click()
  return decodePng(fs.readFileSync(await (await pending).path()))
}

const hasUtf8Mark = (decoded: ReturnType<typeof decodePng>) =>
  Boolean(
    decoded?.chunks.some(
      (chunk) =>
        chunk.type === 'eci' && 'assignmentNumber' in chunk && chunk.assignmentNumber === 26
    )
  )

test.describe('UTF-8 marker (ECI 26)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.locator('#data').fill(TEXT)
  })

  test('is off by default: the export has no marker', async ({ page }) => {
    await expect(page.locator('#qr-use-eci26')).not.toBeChecked()
    const decoded = await exportPng(page)
    expect(decoded?.data).toBe(TEXT)
    expect(hasUtf8Mark(decoded)).toBe(false)
  })

  test('marks the export, passes the scan check and says so', async ({ page }) => {
    await page.locator('#qr-use-eci26').check()
    await expect(page.locator('#code-info')).toContainText('marked as UTF-8 (ECI 26)')
    await expect(page.locator('#scan-check')).toContainText('Scans.', { timeout: 10000 })
    const decoded = await exportPng(page)
    expect(decoded?.data).toBe(TEXT)
    expect(hasUtf8Mark(decoded)).toBe(true)
  })

  test('marks a code typed just before downloading', async ({ page }) => {
    await page.locator('#qr-use-eci26').check()
    await page.locator('#data').fill('Café ☕')
    // No wait: the download itself waits for the marked grid.
    const decoded = await exportPng(page)
    expect(decoded?.data).toBe('Café ☕')
    expect(hasUtf8Mark(decoded)).toBe(true)
  })

  test('keeps a logo code scannable at a low error correction level', async ({ page }) => {
    await page.getByRole('combobox', { name: /select qr code preset/i }).click()
    await page.getByRole('option', { name: 'b0r3d Cup', exact: true }).click()
    await page.locator('#errorCorrectionLevel-L').check()
    await page.locator('#qr-use-eci26').check()
    await expect(page.locator('#scan-check')).toContainText('Scans.', { timeout: 10000 })
    const decoded = await exportPng(page)
    expect(decoded?.data).toBe(TEXT)
    expect(hasUtf8Mark(decoded)).toBe(true)
  })

  test('keeps the chosen size', async ({ page }) => {
    await page.locator('#qr-version').selectOption('7')
    await page.locator('#qr-use-eci26').check()
    const decoded = await exportPng(page)
    expect(decoded?.version).toBe(7)
    expect(hasUtf8Mark(decoded)).toBe(true)
  })

  test('is saved in a config file without the grid, and restored', async ({ page }, testInfo) => {
    await page.locator('#qr-use-eci26').check()
    await expect(page.locator('#code-info')).toContainText('marked as UTF-8 (ECI 26)')
    const pending = page.waitForEvent('download')
    await page.locator('#save-qr-code-config-button').click()
    const configFile = testInfo.outputPath('config.json')
    await (await pending).saveAs(configFile)
    const saved = JSON.parse(fs.readFileSync(configFile, 'utf8'))
    expect(saved.useEci26).toBe(true)
    expect(saved.props.matrix).toBeUndefined()

    await page.locator('#qr-use-eci26').uncheck()
    const chooser = page.waitForEvent('filechooser')
    await page.locator('#load-qr-code-config-button').click()
    await (await chooser).setFiles(configFile)
    await expect(page.locator('#qr-use-eci26')).toBeChecked()
    expect(hasUtf8Mark(await exportPng(page))).toBe(true)
  })
})
