import { expect, type Page } from '@playwright/test'
import { PNG } from 'pngjs'
import { writeBarcode } from '../../src/test/zint'
import { openPage } from './helpers'

// Pictures of codes for the Scan tab's tests, drawn by zint (zxing-wasm's barcode maker) in Node.

/** A code drawn 4 pixels a module, with its quiet zones. */
export async function codePicture(format: string, text: string, options = ''): Promise<PNG> {
  const w = await writeBarcode(text, { format: format as never, options, scale: 4, addHRT: false, addQuietZones: true })
  if (w.error || !w.image) throw new Error(w.error)
  return PNG.sync.read(Buffer.from(await w.image.arrayBuffer()))
}

/** Pictures one under another on white, as a PNG file. */
export function sheet(pictures: PNG[], gap = 40): Buffer {
  const width = Math.max(...pictures.map((p) => p.width)) + 2 * gap
  const height = pictures.reduce((h, p) => h + p.height + gap, gap)
  const out = new PNG({ width, height })
  out.data.fill(255)
  let y = gap
  for (const p of pictures) {
    PNG.bitblt(p, out, 0, 0, p.width, p.height, gap, y)
    y += p.height + gap
  }
  return PNG.sync.write(out)
}

/** A white picture with nothing on it. */
export function blank(width: number, height: number): Buffer {
  const out = new PNG({ width, height })
  out.data.fill(255)
  return PNG.sync.write(out)
}

export const scanStatus = (page: Page) => page.getByTestId('scan-status')
export const cards = (page: Page) => page.locator('.found-card')

/** The page, on its Scan tab with nothing read yet. */
export async function openScan(page: Page): Promise<void> {
  await openPage(page)
  await page.getByRole('tab', { name: 'Scan' }).click()
  await expect(page.locator('.found-hint')).toHaveText('Codes you read show up here.')
}
