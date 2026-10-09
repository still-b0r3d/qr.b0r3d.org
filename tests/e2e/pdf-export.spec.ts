import { test, expect, type Page } from '@playwright/test'
import fs from 'fs'
import { Buffer } from 'node:buffer'
import { inflateSync } from 'node:zlib'
import jsQR from 'jsqr'
import JSZip from 'jszip'

const MM_PER_PT = 25.4 / 72

/** Page size and the embedded image of a PDF this app made. */
function readPdf(buffer: Buffer) {
  const text = buffer.toString('latin1')
  const media = /\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/.exec(text)!
  const at = text.indexOf('/ColorSpace /DeviceRGB')
  const dictStart = text.lastIndexOf('<<', at)
  const dict = text.slice(dictStart, text.indexOf('>>', at))
  const width = Number(/\/Width (\d+)/.exec(dict)![1])
  const height = Number(/\/Height (\d+)/.exec(dict)![1])
  const length = Number(/\/Length (\d+)/.exec(dict)![1])
  const start = text.indexOf('stream\n', at) + 7
  const rgb = inflateSync(buffer.subarray(start, start + length))
  return {
    pageMm: [Number(media[1]) * MM_PER_PT, Number(media[2]) * MM_PER_PT],
    width,
    height,
    rgb,
    filter: /\/Filter \/(\w+)/.exec(dict)?.[1]
  }
}

function decodeQr(pdf: ReturnType<typeof readPdf>) {
  const rgba = new Uint8ClampedArray(pdf.width * pdf.height * 4)
  for (let i = 0; i < pdf.width * pdf.height; i++) {
    rgba.set([pdf.rgb[i * 3], pdf.rgb[i * 3 + 1], pdf.rgb[i * 3 + 2], 255], i * 4)
  }
  return jsQR(rgba, pdf.width, pdf.height)?.data
}

async function download(page: Page, button: string) {
  const pending = page.waitForEvent('download')
  await page.locator(button).click()
  return fs.readFileSync(await (await pending).path())
}

test.describe('PDF export', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test('a QR code without a print size: screen size at 96 px/in, drawn at 300 DPI', async ({
    page
  }) => {
    await page.locator('#data').fill('https://b0r3d.org')
    const pdf = readPdf(await download(page, '#download-qr-image-button-pdf'))
    expect(pdf.filter).toBe('FlateDecode')
    expect(pdf.rgb.length).toBe(pdf.width * pdf.height * 3)
    const width = Number(await page.locator('#width').inputValue())
    expect(pdf.pageMm[0]).toBeCloseTo((width / 96) * 25.4, 1)
    expect(pdf.width / (pdf.pageMm[0] / 25.4)).toBeCloseTo(300, -1)
    expect(decodeQr(pdf)).toBe('https://b0r3d.org')
  })

  test('a QR code at a print size has exactly that size and DPI', async ({ page }) => {
    await page.locator('#data').fill('https://b0r3d.org')
    await page.locator('#print-size-enabled').check()
    await page.locator('#print-width').fill('40')
    await page.locator('#print-dpi').selectOption('300')
    const pdf = readPdf(await download(page, '#download-qr-image-button-pdf'))
    expect(pdf.pageMm[0]).toBeCloseTo(40, 1)
    expect(pdf.pageMm[1]).toBeCloseTo(40, 1)
    expect([pdf.width, pdf.height]).toEqual([472, 472])
    expect(decodeQr(pdf)).toBe('https://b0r3d.org')
  })

  test('a framed QR code keeps its proportions', async ({ page }) => {
    await page.locator('#data').fill('https://b0r3d.org')
    await page.getByRole('button', { name: /frame settings/i }).click()
    await page.locator('#show-frame').check()
    for (const print of [false, true]) {
      if (print) await page.locator('#print-size-enabled').check()
      const pdf = readPdf(await download(page, '#download-qr-image-button-pdf'))
      expect(pdf.height / pdf.width).not.toBeCloseTo(1, 2)
      expect(pdf.pageMm[1] / pdf.pageMm[0]).toBeCloseTo(pdf.height / pdf.width, 3)
      expect(pdf.rgb.length).toBe(pdf.width * pdf.height * 3)
      expect(decodeQr(pdf)).toBe('https://b0r3d.org')
    }
  })

  test('a barcode at a print size: whole pixels per bar at the DPI', async ({ page }) => {
    await page.locator('#code-type').selectOption('ean13')
    await page.locator('#barcode-data').fill('950600013435')
    await page.locator('#barcode-print-size-enabled').check()
    await page.locator('#barcode-print-width').fill('37.29')
    const guidance = await page.locator('#barcode-print-guidance').innerText()
    const [, w, h] = /(\d+) × (\d+) px/.exec(guidance)!
    const pdf = readPdf(await download(page, '#barcode-download-pdf'))
    expect([pdf.width, pdf.height]).toEqual([Number(w), Number(h)])
    expect(pdf.pageMm[0]).toBeCloseTo((pdf.width / 300) * 25.4, 1)
    expect(pdf.pageMm[1]).toBeCloseTo((pdf.height / 300) * 25.4, 1)
  })

  test('a barcode batch keeps one bar width: longer codes get wider pages', async ({
    page
  }, testInfo) => {
    await page.locator('#code-type').selectOption('code128')
    await page.locator('#barcode-print-size-enabled').check()
    const csvFile = testInfo.outputPath('codes.csv')
    fs.writeFileSync(csvFile, 'data\nAB\nABCDEFGHIJKLMNOP\n')
    await page.getByRole('button', { name: 'Batch export' }).click()
    const chooser = page.waitForEvent('filechooser')
    await page.getByRole('button', { name: /choose a csv file/i }).click()
    await (await chooser).setFiles(csvFile)
    const zip = await JSZip.loadAsync(await download(page, '#barcode-download-pdf'))
    const [short, long] = await Promise.all(
      ['AB.pdf', 'ABCDEFGHIJKLMNOP.pdf'].map(async (name) =>
        readPdf(await zip.file(name)!.async('nodebuffer'))
      )
    )
    expect(long.pageMm[0]).toBeGreaterThan(short.pageMm[0] * 2)
    expect(short.pageMm[0] / short.width).toBeCloseTo(long.pageMm[0] / long.width, 5)
  })
})
