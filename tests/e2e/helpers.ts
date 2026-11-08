import { expect, type Download, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { PNG } from 'pngjs'
import { readQr } from '../../src/test/zxing'

/** Opens the page and waits for the first code's scan check. */
export async function openPage(page: Page, path = '/'): Promise<void> {
  await page.goto(path)
  await expect(page.getByTestId('check')).toHaveAttribute('data-result', 'ok', { timeout: 20_000 })
}

/** Types into the data box (replacing what's there) and waits for the scan check's answer. */
export async function typeData(page: Page, text: string): Promise<void> {
  await page.locator('#data').fill(text)
  await expect(page.getByTestId('check')).not.toHaveAttribute('data-result', 'checking', { timeout: 20_000 })
}

/** A downloaded file's bytes. */
export async function bytesOf(download: Download): Promise<Buffer> {
  const path = await download.path()
  return readFileSync(path)
}

/** What a scanner reads in a PNG file, or null. */
export async function readPng(bytes: Buffer): Promise<{ text: string | null; width: number; height: number }> {
  const png = PNG.sync.read(bytes)
  const [found] = await readQr({ width: png.width, height: png.height, data: new Uint8ClampedArray(png.data) })
  return { text: found ? found.text : null, width: png.width, height: png.height }
}
