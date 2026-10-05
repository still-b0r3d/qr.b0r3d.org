import { test, expect, type Page } from '@playwright/test'
import fs from 'fs'
import JSZip from 'jszip'
import sharp from 'sharp'

async function download(page: Page, format: 'png' | 'jpg' | 'svg') {
  const pending = page.waitForEvent('download')
  await page.locator(`#download-qr-image-button-${format}`).click()
  return fs.readFileSync(await (await pending).path())
}

async function setPrintSize(page: Page, width: string, unit: 'mm' | 'in', dpi: string) {
  await page.locator('#print-size-enabled').check()
  await page.locator('#print-width').fill(width)
  await page.locator('#print-unit').selectOption(unit)
  await page.locator('#print-dpi').selectOption(dpi)
}

test.describe('Size for print', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.locator('#data').fill('https://b0r3d.org')
  })

  test('exports PNG, JPG and SVG at the physical size and DPI', async ({ page }) => {
    await setPrintSize(page, '40', 'mm', '300')
    await expect(page.locator('#print-guidance')).toContainText('472 × 472 px')

    const png = await sharp(await download(page, 'png')).metadata()
    expect(png.width).toBe(472)
    expect(png.height).toBe(472)
    expect(Math.round(png.density ?? 0)).toBe(300)

    const jpg = await sharp(await download(page, 'jpg')).metadata()
    expect(jpg.width).toBe(472)
    expect(jpg.density).toBe(300)

    const svg = (await download(page, 'svg')).toString('utf8')
    expect(svg).toMatch(/^<svg[^>]* width="40mm" height="40mm"/)
  })

  test('works in inches and keeps a frame in proportion', async ({ page }) => {
    await page.getByRole('button', { name: /frame settings/i }).click()
    await page.locator('#show-frame').check()
    await setPrintSize(page, '2', 'in', '600')
    const png = await sharp(await download(page, 'png')).metadata()
    expect(png.width).toBe(1200)
    expect(png.height).toBeGreaterThan(1200) // caption below the code
    expect(Math.round(png.density ?? 0)).toBe(600)
  })

  test('warns when the modules get too small to print', async ({ page }) => {
    await page.locator('#data').fill('https://b0r3d.org/' + 'x'.repeat(60))
    await setPrintSize(page, '15', 'mm', '300')
    await expect(page.locator('#print-size')).toContainText('hard to print and scan')
    await setPrintSize(page, '60', 'mm', '300')
    await expect(page.locator('#print-size')).not.toContainText('hard to print and scan')
  })

  test('rejects impossible sizes and falls back to screen size', async ({ page }) => {
    await setPrintSize(page, '900', 'mm', '600')
    await expect(page.locator('#print-size')).toContainText('over 10,000 pixels')
    const png = await sharp(await download(page, 'png')).metadata()
    expect(png.width).toBe(200)
  })

  test('applies to every file in a batch export', async ({ page }, testInfo) => {
    await setPrintSize(page, '1', 'in', '300')
    const csvFile = testInfo.outputPath('batch.csv')
    fs.writeFileSync(csvFile, 'url\nhttps://b0r3d.org/a\nhttps://b0r3d.org/b')
    await page.getByRole('button', { name: /batch export/i }).click()
    const chooser = page.waitForEvent('filechooser')
    await page.locator('button[aria-label*="Choose a CSV file"]').click()
    await (await chooser).setFiles(csvFile)
    await expect(page.locator('text=/\\d+ \\/ \\d+/')).toBeVisible({ timeout: 10000 })

    const zip = await JSZip.loadAsync(await download(page, 'png'))
    const pngs = Object.values(zip.files).filter((f) => f.name.endsWith('.png'))
    expect(pngs).toHaveLength(2)
    for (const f of pngs) {
      const meta = await sharp(await f.async('nodebuffer')).metadata()
      expect(meta.width, f.name).toBe(300)
      expect(Math.round(meta.density ?? 0), f.name).toBe(300)
    }
  })

  test('remembers the setting on the next visit', async ({ page }) => {
    await setPrintSize(page, '35', 'mm', '600')
    await page.reload()
    await expect(page.locator('#print-size-enabled')).toBeChecked()
    await expect(page.locator('#print-width')).toHaveValue('35')
    await expect(page.locator('#print-dpi')).toHaveValue('600')
  })
})
