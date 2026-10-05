import { test, expect, type Page } from '@playwright/test'
import fs from 'fs'
import { Buffer } from 'node:buffer'
import { prepareZXingModule, readBarcodes } from 'zxing-wasm/full'

const wasm = fs.readFileSync('node_modules/zxing-wasm/dist/full/zxing_full.wasm')
prepareZXingModule({
  overrides: {
    wasmBinary: wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength)
  }
})

async function download(page: Page, button: string): Promise<Buffer> {
  const pending = page.waitForEvent('download')
  await page.locator(button).click()
  return fs.readFileSync((await (await pending).path())!)
}

async function decode(bytes: Buffer) {
  const [read] = await readBarcodes(new Uint8Array(bytes), { tryHarder: true })
  return read ? { format: read.format, text: read.text } : null
}

test.describe('Other barcode types', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test('the page starts as a QR code generator', async ({ page }) => {
    await expect(page.locator('#code-type')).toHaveValue('qr')
    await expect(page.locator('#data')).toBeVisible()
    await expect(page.locator('#barcode-create')).toHaveCount(0)
  })

  test('no element id appears twice', async ({ page }) => {
    await page.locator('#code-type').selectOption('ean13')
    await expect(page.locator('#barcode-scan-check')).toContainText('Scans.', { timeout: 15000 })
    const duplicates = await page.evaluate(() => {
      const ids = [...document.querySelectorAll('[id]')].map((el) => el.id)
      return [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))]
    })
    expect(duplicates).toEqual([])
  })

  test('makes an EAN-13 with its check digit, and every download decodes', async ({ page }) => {
    await page.locator('#code-type').selectOption('ean13')
    await page.locator('#barcode-data').fill('950600013435')
    await expect(page.locator('#barcode-scan-check')).toContainText('Scans.', { timeout: 15000 })
    await page.locator('#barcode-info summary').click()
    await expect(page.locator('#barcode-stored')).toHaveText('9506000134352')

    for (const button of ['#barcode-download-png', '#barcode-download-jpg']) {
      expect(await decode(await download(page, button)), button).toEqual({
        format: 'EAN13',
        text: '9506000134352'
      })
    }
    const svg = (await download(page, '#barcode-download-svg')).toString('utf8')
    expect(svg).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 113 /)
    expect(svg).not.toContain('<desc>')
  })

  test('makes GS1 DataMatrix, Code 128 and PDF417 that read back exactly', async ({ page }) => {
    const cases = [
      ['gs1-datamatrix', '(01)09506000134352(17)271231(10)ABC123', 'DataMatrix'],
      ['code128', 'B0R3D-128', 'Code128'],
      ['pdf417', 'Grüße aus Wien 👋', 'PDF417']
    ] as const
    for (const [type, text, format] of cases) {
      await page.locator('#code-type').selectOption(type)
      await page.locator('#barcode-data').fill(text)
      await expect(page.locator('#barcode-scan-check'), type).toContainText('Scans.', {
        timeout: 15000
      })
      expect(await decode(await download(page, '#barcode-download-png')), type).toEqual({
        format,
        text
      })
    }
  })

  test('explains bad input and holds the downloads back', async ({ page }) => {
    await page.locator('#code-type').selectOption('ean13')
    await page.locator('#barcode-data').fill('9506000134351')
    await expect(page.getByRole('alert')).toContainText(
      'The check digit (the last digit) should be 2'
    )
    await expect(page.locator('#barcode-download-png')).toBeDisabled()
    await page.locator('#code-type').selectOption('gs1-128')
    await page.locator('#barcode-data').fill('(01)123')
    await expect(page.getByRole('alert')).toContainText('Invalid data length for AI (01)')
  })

  test('switching type and back keeps the QR code and each type’s data', async ({ page }) => {
    await page.locator('#data').fill('https://b0r3d.org/keep-me')
    await page.locator('#code-type').selectOption('code39')
    await page.locator('#barcode-data').fill('KEEP 39')
    await page.locator('#code-type').selectOption('aztec')
    await page.locator('#code-type').selectOption('code39')
    await expect(page.locator('#barcode-data')).toHaveValue('KEEP 39')
    await page.locator('#code-type').selectOption('qr')
    await expect(page.locator('#data')).toHaveValue('https://b0r3d.org/keep-me')
    await expect(page.locator('#scan-check')).toContainText('Scans.', { timeout: 15000 })
  })

  test('exports at a print size with whole-pixel bars and the DPI recorded', async ({ page }) => {
    await page.locator('#code-type').selectOption('ean13')
    await expect(page.locator('#barcode-preview img')).toBeVisible({ timeout: 15000 })
    await page.locator('#barcode-print-size-enabled').check()
    await page.locator('#barcode-print-width').fill('37.29')
    await expect(page.locator('#barcode-print-guidance')).toContainText('452 × 236 px')
    const png = await download(page, '#barcode-download-png')
    expect(png.readUInt32BE(16)).toBe(452) // IHDR width
    const phys = png.indexOf(Buffer.from('pHYs'))
    expect(Math.round(png.readUInt32BE(phys + 4) * 0.0254)).toBe(300)
    expect(await decode(png)).toEqual({ format: 'EAN13', text: '9506000134352' })
  })

  test('loads everything from this site', async ({ page }) => {
    const external: string[] = []
    page.on('request', (request) => {
      const url = new URL(request.url())
      if (!['localhost', '127.0.0.1'].includes(url.hostname) && url.protocol.startsWith('http')) {
        external.push(request.url())
      }
    })
    await page.locator('#code-type').selectOption('datamatrix')
    await expect(page.locator('#barcode-scan-check')).toContainText('Scans.', { timeout: 15000 })
    expect(external).toEqual([])
  })
})
