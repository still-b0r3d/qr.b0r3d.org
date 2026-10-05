import { test, expect, type Page } from '@playwright/test'
import fs from 'fs'
import { Buffer } from 'node:buffer'
import jsQR from 'jsqr'
import JSZip from 'jszip'
import { PNG } from 'pngjs'

function decodePng(buffer: Buffer) {
  const png = PNG.sync.read(buffer)
  return jsQR(new Uint8ClampedArray(png.data), png.width, png.height)
}

async function exportPng(page: Page) {
  const pending = page.waitForEvent('download')
  await page.locator('#download-qr-image-button-png').click()
  return decodePng(fs.readFileSync(await (await pending).path()))
}

test.describe('Size (QR version)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test('defaults to automatic and picks the smallest version', async ({ page }) => {
    await expect(page.locator('#qr-version')).toHaveValue('0')
    await page.locator('#data').fill('12345678901234567890')
    await page.waitForTimeout(800)
    const decoded = await exportPng(page)
    // 20 digits fit version 1 in numeric mode (byte mode would need version 2).
    expect(decoded?.version).toBe(1)
    expect(decoded?.data).toBe('12345678901234567890')
  })

  test('exports the chosen version', async ({ page }) => {
    await page.locator('#data').fill('https://b0r3d.org')
    await page.locator('#qr-version').selectOption('10')
    await page.waitForTimeout(800)
    const decoded = await exportPng(page)
    expect(decoded?.version).toBe(10)
    expect(decoded?.data).toBe('https://b0r3d.org')
    await expect(page.getByText(/Too much data for version/)).toBeHidden()
  })

  test('grows and says so when the data does not fit the chosen version', async ({ page }) => {
    const long = 'https://b0r3d.org/'.repeat(6)
    await page.locator('#data').fill(long)
    await page.locator('#qr-version').selectOption('1')
    await page.waitForTimeout(800)
    await expect(
      page.getByText(/Too much data for version 1, so version \d+ is used\./)
    ).toBeVisible()
    const decoded = await exportPng(page)
    expect(decoded?.version).toBeGreaterThan(1)
    expect(decoded?.data).toBe(long)
  })

  test('is saved in and restored from a config file', async ({ page }, testInfo) => {
    await page.locator('#qr-version').selectOption('7')
    const pending = page.waitForEvent('download')
    await page.locator('#save-qr-code-config-button').click()
    const configFile = testInfo.outputPath('config.json')
    await (await pending).saveAs(configFile)
    expect(JSON.parse(fs.readFileSync(configFile, 'utf8')).props.qrOptions.typeNumber).toBe(7)

    await page.locator('#qr-version').selectOption('0')
    const chooser = page.waitForEvent('filechooser')
    await page.locator('#load-qr-code-config-button').click()
    await (await chooser).setFiles(configFile)
    await expect(page.locator('#qr-version')).toHaveValue('7')
  })

  test('gives every code in a batch export the same version', async ({ page }, testInfo) => {
    // Rows of different lengths would get different sizes automatically.
    const rows = ['https://b0r3d.org', 'https://b0r3d.org/' + 'x'.repeat(40), '12345']
    const csvFile = testInfo.outputPath('batch.csv')
    fs.writeFileSync(csvFile, ['url', ...rows].join('\n'))

    await page.locator('#qr-version').selectOption('6')
    await page.getByRole('button', { name: /batch export/i }).click()
    const chooser = page.waitForEvent('filechooser')
    await page.locator('button[aria-label*="Choose a CSV file"]').click()
    await (await chooser).setFiles(csvFile)
    await expect(page.locator('text=/\\d+ \\/ \\d+/')).toBeVisible({ timeout: 10000 })

    const pending = page.waitForEvent('download')
    await page.locator('#download-qr-image-button-png').click()
    const zip = await JSZip.loadAsync(fs.readFileSync(await (await pending).path()))
    const pngs = Object.values(zip.files).filter((f) => f.name.endsWith('.png'))
    expect(pngs).toHaveLength(rows.length)
    const decoded = await Promise.all(pngs.map(async (f) => decodePng(await f.async('nodebuffer'))))
    expect(decoded.map((d) => d?.version)).toEqual(rows.map(() => 6))
    expect(decoded.map((d) => d?.data).sort()).toEqual([...rows].sort())
  })
})
