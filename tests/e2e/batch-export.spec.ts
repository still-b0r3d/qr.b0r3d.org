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

async function uploadCsv(page: Page, file: string) {
  await page.getByRole('button', { name: /batch export/i }).click()
  const chooser = page.waitForEvent('filechooser')
  await page.locator('button[aria-label*="Choose a CSV file"]').click()
  await (await chooser).setFiles(file)
  await expect(page.locator('text=/\\d+ \\/ \\d+/')).toBeVisible({ timeout: 10000 })
}

test.describe('Batch export', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test('exports every framed row correctly, quickly, and leaves the editor on the previewed row', async ({
    page
  }, testInfo) => {
    const rows = Array.from({ length: 8 }, (_, i) => [`https://b0r3d.org/row-${i}`, `Row ${i}`])
    const csvFile = testInfo.outputPath('framed.csv')
    fs.writeFileSync(csvFile, ['url,frameText', ...rows.map((r) => r.join(','))].join('\n'))
    await uploadCsv(page, csvFile)
    await expect(page.locator('#element-to-export')).toHaveText(rows[0][1])

    const started = Date.now()
    const pending = page.waitForEvent('download')
    await page.locator('#download-qr-image-button-png').click()
    const zip = await JSZip.loadAsync(fs.readFileSync(await (await pending).path()))
    // The export used to wait a full second per row.
    expect(Date.now() - started).toBeLessThan(rows.length * 1000)

    const files = Object.values(zip.files).filter((f) => f.name.endsWith('.png'))
    expect(files.map((f) => f.name).sort()).toEqual(
      rows.map((r) => `Row_${r[1].slice(4)}.png`).sort()
    )
    for (const file of files) {
      const decoded = decodePng(await file.async('nodebuffer'))
      const row = rows.find((r) => file.name === `Row_${r[1].slice(4)}.png`)!
      expect(decoded?.data, file.name).toBe(row[0])
    }
    // The editor shows the previewed row again, not the last one exported.
    await expect(page.locator('#element-to-export')).toHaveText(rows[0][1])
  })

  test('reads semicolon-separated CSVs saved in Windows-1252', async ({ page }, testInfo) => {
    const csvFile = testInfo.outputPath('excel.csv')
    // "Grüße" in Windows-1252, as a German Excel saves it.
    fs.writeFileSync(
      csvFile,
      Buffer.from('url;frameText\r\nhttps://b0r3d.org/de;Gr\xfc\xdfe aus Wien\r\n', 'latin1')
    )
    await uploadCsv(page, csvFile)
    await expect(page.locator('#element-to-export')).toHaveText('Grüße aus Wien')
  })
})

test.describe('Background', () => {
  test('can be turned back on after reloading a code saved without one', async ({ page }) => {
    await page.goto('/')
    const preview = page.locator('#element-to-export')
    await page.locator('#with-background').uncheck()
    await expect
      .poll(() => preview.evaluate((el) => window.getComputedStyle(el).backgroundColor))
      .toBe('rgba(0, 0, 0, 0)')

    await page.reload()
    await expect(page.locator('#with-background')).not.toBeChecked()
    await page.locator('#with-background').check()
    await expect
      .poll(() => preview.evaluate((el) => window.getComputedStyle(el).backgroundColor))
      .toBe('rgb(255, 255, 255)')
  })
})
