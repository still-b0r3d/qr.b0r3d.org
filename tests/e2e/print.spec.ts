import { expect, test, type Page } from '@playwright/test'
import { PNG } from 'pngjs'
import { bytesOf, openPage } from './helpers'

// Print sizes and whole pixels per module, as b0r3d QR for PC has them: under Size and print for QR
// codes and under Barcode settings for barcodes, said in what they make, kept where today's site
// keeps them, and in every file: the PNG's and JPG's resolution, the PDF's page and the SVG's
// lengths on paper.

const APPLIES = ' Applies to every saved picture, SVG and PDF; copies get the same pixels.'

async function save(page: Page, kind: 'png' | 'jpg' | 'svg' | 'pdf'): Promise<Buffer> {
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId(`save-${kind}`).click()])
  return bytesOf(download)
}

function pngFacts(bytes: Buffer): { width: number; height: number; pHYs: number } {
  const png = PNG.sync.read(bytes)
  return { width: png.width, height: png.height, pHYs: bytes.readUInt32BE(bytes.indexOf('pHYs', 8, 'latin1') + 4) }
}

const jfifDpi = (bytes: Buffer): number[] => {
  const i = bytes.indexOf('JFIF\0', 0, 'latin1')
  return [bytes[i + 7], bytes.readUInt16BE(i + 8), bytes.readUInt16BE(i + 10)]
}

const kept = (page: Page, key: string) => page.evaluate((k) => localStorage.getItem(k), key)

test.describe('print sizes', () => {
  test.skip(({ isMobile }) => isMobile, 'the desktop layout')

  test('a QR code: whole pixels, the print size said and kept, and in every file', async ({ page }) => {
    await openPage(page)
    const section = page.locator('details.sec', { hasText: 'Size and print' })
    if (!(await section.evaluate((d) => (d as HTMLDetailsElement).open))) await section.locator('summary').click()
    const picture = page.getByTestId('picture-size-hint')
    await expect(picture).toHaveText('Saves as 200 × 200 pixels.')
    await page.locator('#whole-pixels').check()
    await expect(picture).toHaveText('Saves as 198 × 198 pixels: 6 pixels per module, so every square is sharp.')
    expect(await kept(page, 'b0r3d-qr.whole-pixels')).toBe('true')
    expect(pngFacts(await save(page, 'png'))).toEqual({ width: 198, height: 198, pHYs: 3779 })

    await page.locator('#print-on').check()
    const hint = page.getByTestId('print-hint')
    await expect(hint).toHaveText('472 × 472 px. Each module is 1.21 mm; scans from up to about 30 cm.' + APPLIES)
    await expect(picture).toHaveText('Saves as 472 × 472 pixels, at the print size below.')
    expect(await kept(page, 'b0r3d-qr.print-settings')).toBe('{"enabled":true,"width":40,"unit":"mm","dpi":300}')
    // every file at the print size
    expect(pngFacts(await save(page, 'png'))).toEqual({ width: 472, height: 472, pHYs: 11811 })
    expect(jfifDpi(await save(page, 'jpg'))).toEqual([1, 300, 300])
    expect((await save(page, 'pdf')).toString('latin1')).toContain('/MediaBox [0 0 113.39 113.39]')
    expect((await save(page, 'svg')).toString('utf8')).toMatch(/^<svg [^>]*width="40mm" height="40mm"/)

    // too small to scan well, then the same length in inches, then too big to make
    await page.locator('#print-width').fill('10')
    await expect(page.getByTestId('print-warning')).toHaveText('⚠ Modules under about 0.40 mm are hard to print and scan. Make it bigger, or store less data or use lower error correction.')
    await page.locator('#print-unit').selectOption('in')
    await expect(page.locator('#print-width')).toHaveValue('0.394')
    await page.locator('#print-width').fill('30')
    await page.locator('#print-dpi').selectOption('600')
    await expect(hint).toHaveText('That would be over 10,000 pixels wide. Use a smaller width or resolution. Files use the picture size until then.')
    await expect(picture).toHaveText('Saves as 198 × 198 pixels: 6 pixels per module, so every square is sharp.')

    // kept from one visit to the next
    await page.locator('#print-width').fill('2')
    await page.locator('#print-dpi').selectOption('150')
    await page.reload()
    await expect(page.getByTestId('check')).toHaveAttribute('data-result', 'ok', { timeout: 20_000 })
    if (!(await section.evaluate((d) => (d as HTMLDetailsElement).open))) await section.locator('summary').click()
    await expect(page.locator('#print-on')).toBeChecked()
    await expect(page.locator('#print-width')).toHaveValue('2')
    await expect(page.locator('#print-unit')).toHaveValue('in')
    await expect(page.locator('#print-dpi')).toHaveValue('150')
    await expect(page.locator('#whole-pixels')).toBeChecked()
    expect(await kept(page, 'b0r3d-qr.print-settings')).toBe('{"enabled":true,"width":2,"unit":"in","dpi":150}')
  })

  test('a barcode: its own print size, said and kept, and in its files', async ({ page }) => {
    await openPage(page)
    await page.getByTestId('code-type').selectOption('ean13')
    await expect(page.getByTestId('check')).toHaveAttribute('data-result', 'ok', { timeout: 20_000 })
    await expect(page.getByTestId('barcode-scale-hint')).toHaveText('Downloads are 452 × 236 px. Use Size for print for a physical size.')
    await page.locator('#barcode-print-on').check()
    await expect(page.getByTestId('barcode-print-hint')).toContainText('452 × 236 px, 38.27 mm wide so every bar is whole pixels. The narrowest bar is 0.34 mm.')
    expect(await kept(page, 'b0r3d-qr.barcode-print-settings')).toBe('{"enabled":true,"width":40,"unit":"mm","dpi":300}')
    expect(pngFacts(await save(page, 'png'))).toEqual({ width: 452, height: 236, pHYs: 11811 })
    expect(jfifDpi(await save(page, 'jpg'))).toEqual([1, 300, 300])
    expect((await save(page, 'svg')).toString('utf8')).toContain('width="38.269mm"')
    // the QR codes' print size is kept apart
    expect(await kept(page, 'b0r3d-qr.print-settings')).toBeNull()
  })
})
