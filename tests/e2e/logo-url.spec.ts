import { test, expect, type Page } from '@playwright/test'
import fs from 'fs'
import http from 'http'
import type { AddressInfo } from 'net'
import { Buffer } from 'node:buffer'
import { PNG } from 'pngjs'

// A solid red square, so the logo is easy to find in an exported PNG.
function redSquarePng(): Buffer {
  const png = new PNG({ width: 64, height: 64 })
  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = 255
    png.data[i + 1] = 0
    png.data[i + 2] = 0
    png.data[i + 3] = 255
  }
  return PNG.sync.write(png)
}

function redPixels(buffer: Buffer): number {
  const png = PNG.sync.read(buffer)
  let count = 0
  for (let i = 0; i < png.data.length; i += 4) {
    if (png.data[i] > 200 && png.data[i + 1] < 60 && png.data[i + 2] < 60) count++
  }
  return count
}

async function exportPng(page: Page): Promise<Buffer> {
  const pending = page.waitForEvent('download')
  await page.locator('#download-qr-image-button-png').click()
  return fs.readFileSync(await (await pending).path())
}

// A real second origin, because the browser has to enforce CORS here:
// page.route() responses skip the CORS check, so they can't play a site that
// refuses. /shares sends CORS headers, /refuses only lets the image be
// displayed, and anything else is a 404.
let server: http.Server
let SHARES = ''
let REFUSES = ''
let MISSING = ''

test.beforeAll(async () => {
  const body = redSquarePng()
  server = http.createServer((req, res) => {
    if (req.url === '/shares/logo.png') {
      res.writeHead(200, { 'content-type': 'image/png', 'access-control-allow-origin': '*' })
      res.end(body)
    } else if (req.url === '/refuses/logo.png') {
      res.writeHead(200, { 'content-type': 'image/png' })
      res.end(body)
    } else {
      res.writeHead(404, { 'content-type': 'text/plain' })
      res.end('not found')
    }
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  SHARES = `${base}/shares/logo.png`
  REFUSES = `${base}/refuses/logo.png`
  MISSING = `${base}/missing/logo.png`
})

test.afterAll(async () => {
  await new Promise((resolve) => server.close(resolve))
})

test.describe('Logo from a web address', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test('a site that shares its image: the logo is in the download', async ({ page }) => {
    await page.locator('#image-url').fill(SHARES)
    await page.waitForTimeout(1500)
    await expect(page.locator('#logo-status')).toHaveCount(0)
    expect(redPixels(await exportPng(page))).toBeGreaterThan(100)
  })

  test('a site that refuses: says so and leaves the logo out everywhere', async ({ page }) => {
    await page.locator('#image-url').fill(REFUSES)
    await expect(page.locator('#logo-status')).toContainText(
      "doesn't let other sites use its images in downloads"
    )
    await expect(page.locator('#logo-status')).toContainText('Upload image')
    expect(redPixels(await exportPng(page))).toBe(0)
    // The preview doesn't show it either, so it matches the download.
    await expect(page.locator(`[href="${REFUSES}"], [src="${REFUSES}"]`)).toHaveCount(0)
    // The address is still kept in the field.
    await expect(page.locator('#image-url')).toHaveValue(REFUSES)
  })

  test('an address with no image: says it could not load', async ({ page }) => {
    await page.locator('#image-url').fill(MISSING)
    await expect(page.locator('#logo-status')).toContainText(
      "Couldn't load an image from that address"
    )
    expect(redPixels(await exportPng(page))).toBe(0)
  })

  test('the address is saved as typed and checked again after a reload', async ({ page }) => {
    await page.locator('#image-url').fill(SHARES)
    await page.waitForTimeout(1500)
    await page.reload()
    await expect(page.locator('#image-url')).toHaveValue(SHARES)
    await page.waitForTimeout(1500)
    expect(redPixels(await exportPng(page))).toBeGreaterThan(100)
  })
})
